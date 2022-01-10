/**
 * K8s_client is a HTTP2 client for watching K8s API objects.
 *
 * The client will be configured with a K8s API server URL and properly configured Token or client certificate.
 */

import * as http2 from "node:http2";
import * as types from "../types";
import * as fs from "node:fs";
import {SecureContextOptions} from "node:tls";
import {setInterval} from "node:timers";
import logger from "../logger";
import yaml from "yaml";

const log = logger.getChildLogger({name: "K8sClient"});

export class K8sClientOptions {
    /**
     * Default to in-cluster authentication which means that the client will use the ServiceAccount
     *    token to authenticate with the API server.
     *  ServiceAccount secret data location: /var/run/secrets/kubernetes.io/serviceaccount/token
     *  If running out of cluster, use TLS client certificate to authenticate
     */
    autoInClusterConfig: boolean = true;

    // If autoInclusterConfig is true, authType will be ignored.
    //   Can be set to AUTH_TYPE_TOKEN or AUTH_TYPE_CERT.
    authType: string = types.AuthTypeKubeConfig;

    tokenFilePath: string;

    // Takes effect only if autoInclusterConfig is false and authType == ATH_TYPE_CERT.
    clientCertPath: string;
    clientKeyPath: string;
    caCertPath: string;

    // Whether to send application layer requests to keep tcp alive (in addition to set SO_KEEPALIVE=1 which is default enabled)
    autoKeepAlive: boolean = false;
    // Whehter reconnect to the APIServer when the underling TCP connection is broken or closed (due to inactivity).
    autoReconnect: boolean = true;
}

export class Result {
    status: number;
    headers: http2.IncomingHttpHeaders;
    body: string;
}

export class K8sClient {
    private _apiServerUrl: string;
    private _options: K8sClientOptions;
    private http2Client: http2.ClientHttp2Session;
    private token: string; // Cached auth token for in-cluster authentication.
    private _closed: boolean = true;

    // note: set headers in http2 request when do a request(outgoingHeaders:{})

    constructor(apiserverUrl: string, options: K8sClientOptions) {
        this._options = options;
        this._apiServerUrl = apiserverUrl;
        this.tryToCreateClient();
        log.info("Created K8s_client/HTTP2 client.", "ApiServer: " + apiserverUrl, "AuthType: " + this._options.authType, "AutoKeepAlive: " + this._options.autoKeepAlive);
    }

    private tryToCreateClient() {
        try {
            // create http2 client with proper authentication
            if (this._options.autoInClusterConfig) {
                log.info("Auto creating K8sClient with in-cluster config")
                this._apiServerUrl = this._apiServerUrl || "https://kubernetes.default.svc";
                this.createHttp2ClientWithToken(this._apiServerUrl, '/var/run/secrets/kubernetes.io/serviceaccount/token', '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
            } else {
                switch (this._options.authType as string) {
                    case types.AuthTypeBearerToken:
                        this.createHttp2ClientWithToken(this._apiServerUrl, this._options.tokenFilePath, this._options.caCertPath);
                        break;
                    case types.AuthTypeClientCertificate:
                        this.createHttp2ClientWithClientCert(this._apiServerUrl, this._options.clientCertPath, this._options.clientKeyPath, this._options.caCertPath);
                        break;
                    case types.AuthTypeKubeConfig:
                        this.createHttp2ClientWithKubeConfig();
                        break;
                    default:
                        this.createHttp2ClientWithKubeConfig();
                }

            }
        } catch (e) {
            log.fatal("Failed to create K8s_client. ", e);
            throw e;
        }
        this._closed = false; // success
    }

    public close() {
        this._closed = true;
        this.http2Client.close();
    }

    public request(path: string, outgoingHeaders?: http2.OutgoingHttpHeaders): http2.ClientHttp2Stream {
        if (this._closed) {
            throw new Error("K8s_client is closed.");
        }

        if (!outgoingHeaders) {
            outgoingHeaders = {};
        }
        if (this._options.authType == types.AuthTypeBearerToken) {
            outgoingHeaders[http2.constants.HTTP2_HEADER_AUTHORIZATION] = this.token;
        }
        outgoingHeaders[http2.constants.HTTP2_HEADER_PATH] = path;
        return this.http2Client.request(outgoingHeaders);
    }

    /**
     * Do a one-time request and collect status and response body
     * @param path The url path relative to HOST:PORT
     * @param outgoingHeaders HTTP2 headers
     */
    public async requestOnce(path: string, outgoingHeaders?: http2.OutgoingHttpHeaders): Promise<Result> {
        return new Promise<Result>((resolve, reject) => {
            try {

                let stream = this.request(path, outgoingHeaders);
                let result = new Result();
                stream.on('response', (headers, flags) => {
                    result.status = headers[":status"];
                    result.headers = headers;
                })

                let buf = '';
                stream.on('data', (chunk) => {
                    buf += chunk
                });
                stream.on('end', () => {
                    result.body = buf;
                    resolve(result);
                })
                stream.end()
            } catch (e) {
                log.error("request once failed", "Path=" + path, e);
                reject(e);
            }
        })
    }

    public heartBeat() {
        log.debug("Sending heartbeat.");
        let header: http2.OutgoingHttpHeaders = {
            [http2.constants.HTTP2_HEADER_PATH]: '/api',
            [http2.constants.HTTP2_HEADER_METHOD]: 'GET'
        };
        if (this._options.authType == types.AuthTypeBearerToken) {
            header[http2.constants.HTTP2_HEADER_AUTHORIZATION] = this.token
        }
        let stream = this.http2Client.request(header);
        stream.on('response', () => {
            stream.close();
        });
    }

    /**
     * Create a HTTP2 client for communicating with K8s API server.
     * @param apiServerUrl The URL of the K8s API server, e.g. https://10.0.0.1:8443
     * @param clientCertPath PEM encoded client certificate path
     * @param clientKeyPath PEM encoded client key path
     * @param caCertPath PEM encoded K8s APIServer CA certificate path
     */
    private createHttp2ClientWithClientCert(apiServerUrl: string, clientCertPath: string, clientKeyPath: string, caCertPath: string) {
        log.info("Creating HTTP2 client with client certificate.", "ApiServer: " + apiServerUrl);
        let that = this;
        const tlsOptions: SecureContextOptions = {
            key: fs.readFileSync(clientKeyPath),
            cert: fs.readFileSync(clientCertPath),
            ca: fs.readFileSync(caCertPath),
        }

        this.http2Client = http2.connect(apiServerUrl, tlsOptions, (session, socket) => {
            socket.setKeepAlive(true, 0);
            socket.on(
                'close', (hadError) => {
                    log.info("TCP connection closed.", "hadError: " + hadError);
                    if (that._options.autoReconnect) {
                        that.tryToCreateClient();
                    } else {
                        that.close()
                    }
                }
            );
        });
        // this.http2Client.setTimeout(10000, () => {
        //     log.warn("There is no activity on the connection.");
        // });

        if (that._options.autoKeepAlive) {
            setInterval(() => {
                this.heartBeat();
            }, 5000);
        }
    }

    /**
     * Create a HTTP2 client for communicating with K8s API server authenticated with a token.
     * @param apiServerUrl The URL of the K8s API server, e.g. https://10.0.0.1:8443
     * @param tokenFilePath The Bearer token to authenticate with the API server. Usually, this should be a service account token.
     * @param caCertPath Cluster CA cert(PEM) file path
     */
    private createHttp2ClientWithToken(apiServerUrl: string, tokenFilePath: string, caCertPath: string) {
        log.info("Creating HTTP2 client with token.", "ApiServer: " + apiServerUrl);
        let that = this;
        this.token = fs.readFileSync(tokenFilePath, 'utf8');
        let ca = fs.readFileSync(caCertPath, 'utf8');
        this.http2Client = http2.connect(apiServerUrl, {ca: ca}, (session, socket) => {
            socket.setKeepAlive(true, 0);
            socket.on(
                'close', (hadError) => {
                    log.info("TCP connection closed.", "hadError: " + hadError);
                    if (that._options.autoReconnect) {
                        that.tryToCreateClient();
                    } else {
                        that.close()
                    }
                }
            );
        });
        this.http2Client.setTimeout(10000, () => {
            log.warn("There is no activity on the connection.");
        });

        if (that._options.autoKeepAlive) {
            setInterval(() => {
                this.heartBeat();
            }, 5000);
        }
    }

    /**
     * Creat K8s_client with config in the KUBECONFIG file
     * @private
     */
    private createHttp2ClientWithKubeConfig() {
        let kubeConfigFile = process.env.KUBECONFIG || "~/.kube/config";
        let configFileContent = fs.readFileSync(kubeConfigFile).toLocaleString();
        let config = yaml.parse(configFileContent);

        if (!config || !config["current-context"] || config?.contexts?.length < 1 || config?.clusters?.length < 1 || config?.users?.length < 1) {
            throw new Error("No available context in kube-config: " + kubeConfigFile)
        }

        // 0. find active context, get userName, clusterName
        let currentContext = config["current-context"];
        let userName: string = "";
        let clusterName: string = "";
        (config.contexts as [any]).forEach((context, idx, contexts) => {
            if (context.name == currentContext) {
                userName = context.context.user;
                clusterName = context.context.cluster;
            }
        })
        if (!userName || !clusterName) {
            throw new Error(`Context ${currentContext} not found in the kube-config file: ${kubeConfigFile}`)
        }

        // 1. find cluster info (CA cert, api server url)
        let caCertPath: string = "";
        let apiServerUrl: string = "";
        (config.clusters as [any]).forEach((cluster, idx, clusters) => {
            if (cluster.name == clusterName) {
                caCertPath = cluster.cluster["certificate-authority"];
                apiServerUrl = cluster.cluster.server;
            }
        })
        if (!caCertPath || !apiServerUrl) {
            throw new Error(`Cluster ${clusterName} not found in the kube-config file: ${kubeConfigFile}`);
        }

        // 2. find user info (including client cert and client key path)
        let clientCertPath: string = "";
        let clientKeyPath: string = "";
        (config.users as [any]).forEach((user, idx, users) => {
            if (user.name == userName) {
                clientCertPath = user.user["client-certificate"];
                clientKeyPath = user.user["client-key"];
            }
        })
        if (!caCertPath || !clientKeyPath) {
            throw new Error(`User ${userName} not found in the kube-config file: ${kubeConfigFile}`)
        }

        // create Http2Client
        this._apiServerUrl = apiServerUrl;
        this._options.caCertPath = caCertPath;
        this._options.clientCertPath = clientCertPath;
        this._options.clientKeyPath = clientKeyPath;
        this.createHttp2ClientWithClientCert(this._apiServerUrl, this._options.clientCertPath, this._options.clientKeyPath, this._options.caCertPath);
    }
}