/**
 * K8s_client is a HTTP2 client for watching K8s API objects.
 *
 * The client will be configured with a K8s API server URL and properly configured Token or client certificate.
 */

import * as http2 from "node:http2";
import * as https from "https";
import resolveAlpn from 'resolve-alpn'
import fetch, {Response} from 'node-fetch';
import { SecureContextOptions } from "node:tls";
import { setInterval } from "node:timers";
import yaml from "yaml";
import { homedir } from "os";
import * as Base64 from 'base64-arraybuffer';
import {inject, singleton} from "tsyringe";
import * as fs from "node:fs";

import * as types from "../types";
import logger from "../logger";
import {URL} from "url";
import {AuthTypeKubeConfig} from "../types";
import {readFileSync} from "fs";

const log = logger.getChildLogger({ name: "K8sClient" });

interface KubeConfigKeyInfo {
    apiServerUrl: string,
    caCertPath: string,
    caCertDataBase64: string,
    clientCertPath: string,
    clientKeyPath: string,
    clientCertDataBase64: string,
    clientKeyDataBase64: string
}

export class K8sClientOptions {
    /**
     * Default to in-cluster authentication which means that the client will use the ServiceAccount
     *    token to authenticate with the API server.
     *  ServiceAccount secret data location: /var/run/secrets/kubernetes.io/serviceaccount/token
     *  If running out of cluster, use TLS client certificate to authenticate
     */
    autoInClusterConfig: boolean = true;

    // Specify the url to communicate with ApiServer.
    //  When autoInClusterConfig is enabled, just leave this empty or override the default "https://kubernetes.default.svc"
    apiServerUrl: string = "";

    // If autoInclusterConfig is true, authType will be ignored.
    //   Can be set to BearerToken or ClientCertificate or KubeConfig.
    authType: string = types.AuthTypeKubeConfig;

    kubeConfigFilePath: string;
    // The token file path when authType is BearerToken
    tokenFilePath: string;

    // Takes effect only if autoInclusterConfig is false and authType == AuthTypeClientCertificate.
    //   Set pem file paths or base64 encoded pem
    clientCertPath: string;
    clientCertDataPemBase64: string;
    clientKeyPath: string;
    clientKeyDataPemBase64: string;
    caCertPath: string;
    caCertDataPemBase64: string;

    // Whether to send application layer requests to keep tcp alive (in addition to set SO_KEEPALIVE=1 which is default enabled)
    // Takes effect only when http2 enabled
    autoKeepAlive: boolean = false;
    // Whether reconnect to the APIServer when the underling TCP connection is broken or closed (due to inactivity).
    autoReconnect: boolean = true;
}

export class Result {
    status: number;
    headers: http2.IncomingHttpHeaders;
    body: string;
}

@singleton()
export class K8sClient {
    private _apiServerUrl: string;
    private _options: K8sClientOptions;
    // http2 compatible
    private http2Client: http2.ClientHttp2Session;
    // http1.1 with TLS compatible
    private httpsAgentOptions: https.AgentOptions;
    private httpsAgent: https.Agent;
    private _http2Enabled: boolean = false;

    private token: string; // Cached auth token for in-cluster authentication.
    private _closed: boolean = true;
    private _ready: boolean = false;

    // note: set headers in http2 request when do a request(outgoingHeaders:{})

    constructor(@inject(K8sClientOptions) options: K8sClientOptions) {
        this._options = options;

        if (this._options.authType == AuthTypeKubeConfig) {
            let kubeconfig = this.parseKubeConfig()
            this._apiServerUrl = kubeconfig.apiServerUrl
            this._options.caCertDataPemBase64 = kubeconfig.caCertDataBase64
            this._options.caCertPath = kubeconfig.caCertPath
        } else {
            this._apiServerUrl = this._options.apiServerUrl;
        }

        log.info("Created K8s_client/HTTP client.", `Http2: ${this._http2Enabled}, ApiServer: ${this._apiServerUrl}, AuthType: ${this._options.authType}, AutoKeepAlive: ${this._options.autoKeepAlive}`);
    }

    public async GetReadyClient(): Promise<K8sClient> {
        if (this._ready) {
            return this
        }
        await this.tryToCreateHttpClient()
        return this
    }

    public async tryToCreateHttpClient() {
        // Check if server support HTTP2 (standard K8s already support, but servers like k3s does not)
        // { alpnProtocol: 'h2', timeout: false }
        let u = new URL(this._apiServerUrl)
        let p = u.port || 443
        let tlsOptions:any = {
            port: p,
            host: u.hostname,
            ALPNProtocols: ['h2', 'http/1.1'],
            servername: u.hostname,
        }
        if (this._options.caCertDataPemBase64) {
            tlsOptions.ca = Buffer.from(Base64.decode(this._options.caCertDataPemBase64)).toString('utf8')
        } else if (this._options.caCertPath) {
            tlsOptions.ca = readFileSync(this._options.caCertPath)
        } else {
            tlsOptions.ca = readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
        }
        log.info(`TLS options for ALPN: `, tlsOptions)
        let alpnResult = await resolveAlpn(tlsOptions) as { alpnProtocol: string, timeout: boolean }
        let supportHttp2 = alpnResult.alpnProtocol == 'h2'

        log.info(`ALPN result: ${alpnResult.alpnProtocol}`)
        try {
            // create http2 client with proper authentication
            if (this._options.autoInClusterConfig) {
                log.info("Auto creating K8sClient with in-cluster config")
                this._apiServerUrl = this._apiServerUrl || "https://kubernetes.default.svc";
                if (supportHttp2) {
                    this.createHttp2ClientWithToken(this._apiServerUrl, '/var/run/secrets/kubernetes.io/serviceaccount/token', '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
                } else {
                    log.warn(`Creat Http2 client error, try to create Http1 client`)
                    this.createHttp1ClientWithToken(this._apiServerUrl, '/var/run/secrets/kubernetes.io/serviceaccount/token', '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
                }
            } else {
                switch (this._options.authType as string) {
                    case types.AuthTypeBearerToken:
                        log.info(`Creating K8sClient with type BearerToken`)
                        this.createHttp2ClientWithToken(this._apiServerUrl, this._options.tokenFilePath, this._options.caCertPath);
                        break;
                    case types.AuthTypeClientCertificate:
                        log.info("Creating K8sClient with type ClientCertificate")
                        if (this._options.clientKeyPath.length > 0) {
                            let pems = this.clientCertsBase64Decode(this._options.clientCertDataPemBase64, this._options.clientKeyDataPemBase64, this._options.caCertDataPemBase64);
                            if (supportHttp2) {
                                this.createHttp2ClientWithClientCertData(this._apiServerUrl, pems.clientCertPem, pems.clientKeyPem, pems.caCertPem);
                            } else {
                                log.warn(`Creat Http2 client error, try to create Http1 client`)
                                // if this throws it must be failed
                                this.createHttp1ClientWithClientCertData(this._apiServerUrl, pems.clientCertPem, pems.clientKeyPem, pems.caCertPem);
                            }
                        } else if (this._options.clientKeyPath.length > 0) {
                            this.createHttpClientWithClientCert(this._apiServerUrl, this._options.clientCertPath, this._options.clientKeyPath, this._options.caCertPath, supportHttp2);
                        } else {
                            log.error("Neither clientKeyPath nor clientKeyData provided");
                            throw new Error("Neither clientKeyPath nor clientKeyData provided");
                        }
                        break;
                    case types.AuthTypeKubeConfig:
                        this.createHttpClientWithKubeConfig(supportHttp2);
                        break;
                    default:
                        this.createHttpClientWithKubeConfig(supportHttp2);
                }
            }
        } catch (e) {
            log.fatal("Failed to create K8s_client. ", e);
            throw e;
        }
        this._closed = false; // success
        this._ready = true;
    }

    public close() {
        this._closed = true;
        if (this._http2Enabled) {
            this.http2Client.close();
        }
    }

    public Http2Enabled():boolean {
        return this._http2Enabled
    }

    public async requestWithHttp2Client(path: string, outgoingHeaders?: http2.OutgoingHttpHeaders): Promise<http2.ClientHttp2Stream> {
        let client = await this.GetReadyClient()
        if (!this._http2Enabled) {
            throw new Error("Http2 client does not enabled")
        }
        let that = this;
        if (this._closed) {
            throw new Error("K8s_client is closed.");
        }

        if (!outgoingHeaders) {
            outgoingHeaders = {};
        }
        if (!outgoingHeaders[http2.constants.HTTP2_HEADER_METHOD]) {
            outgoingHeaders[http2.constants.HTTP2_HEADER_METHOD] = http2.constants.HTTP2_METHOD_GET
        }
        if (this._options.authType == types.AuthTypeBearerToken || this._options.autoInClusterConfig) {
            outgoingHeaders[http2.constants.HTTP2_HEADER_AUTHORIZATION] = `Bearer ${that.token}`;
        }
        outgoingHeaders[http2.constants.HTTP2_HEADER_PATH] = path;
        return client.http2Client.request(outgoingHeaders);
    }

    public async requestWithHttp1Client(path: string, method: string): Promise<Response> {
        await this.GetReadyClient()
        let conf = {
            method: method,
            agent: this.httpsAgent,
            headers: {}
        }
        if (this._options.authType == types.AuthTypeBearerToken || this._options.autoInClusterConfig) {
            conf.headers["Authorization"] = `Bearer ${this.token}`
        }
        return fetch(this._apiServerUrl + path, conf)
    }

    /**
     * Do a one-time request and collect status and response body
     * @param path The url path relative to HOST:PORT
     * @param outgoingHeaders HTTP2 headers
     */
    public async requestOnce(path: string, method: string, outgoingHeaders?: http2.OutgoingHttpHeaders): Promise<Result> {
        let client = await this.GetReadyClient()
        if (this._http2Enabled) {
            return new Promise<Result>(async (resolve, reject) => {
                try {
                    let stream = await client.requestWithHttp2Client(path, outgoingHeaders);
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
        } else {
            log.debug(`Http agent options:`, this.httpsAgentOptions)
            // request with http1 client
            let response = await this.requestWithHttp1Client(path, method)
            return this.fetchResponseToResult(response)
        }
    }

    public async post(path: string, body: Buffer, contentType: string, outgoingHeaders?: http2.OutgoingHttpHeaders): Promise<Result> {
        let that = this;
        let client = await this.GetReadyClient()
        if (this._http2Enabled) {
            return new Promise<Result>(async (resolve, reject) => {
                try {
                    if (!outgoingHeaders) {
                        outgoingHeaders = {} as http2.OutgoingHttpHeaders
                    }
                    outgoingHeaders[http2.constants.HTTP2_HEADER_METHOD] = 'POST';
                    outgoingHeaders[http2.constants.HTTP2_HEADER_CONTENT_LENGTH] = body?.length
                    outgoingHeaders[http2.constants.HTTP2_HEADER_CONTENT_TYPE] = contentType

                    let result = {} as Result
                    let req = await client.requestWithHttp2Client(path, outgoingHeaders)
                    let respData = []
                    req.on('data', (chunk) => {
                        respData.push(chunk)
                    })
                    req.on('response', (headers, flags) => {
                        result.status = headers[":status"]
                        result.headers = headers
                    })
                    req.write(body)
                    req.on('end', () => {
                        result.body = respData.join("")
                        resolve(result)
                    })
                    req.end()
                } catch (e) {
                    log.error("K8sClient post request failed.", `Path=${path}, err=${e}`)
                    reject(e)
                }
            })
        } else {
            let conf = {
                method: 'POST',
                agent: this.httpsAgent,
                headers: {},
                body: body
            }
            if (this._options.authType == types.AuthTypeBearerToken || this._options.autoInClusterConfig) {
                conf.headers["Authorization"] = `Bearer ${this.token}`
            }
            let response = await fetch(this._apiServerUrl + path, conf)
            return this.fetchResponseToResult(response)
        }
    }

    private async fetchResponseToResult(response: Response): Promise<Result> {
        let result = new Result();
        let h2headers = {} as http2.IncomingHttpHeaders
        response.headers.forEach((value, name) => {
            h2headers[name] = value
        })
        result.headers = h2headers
        result.status = response.status
        result.body = await response.text()
        return result
    }

    public async postObject(path: string, obj: Object): Promise<Result> {
        let that = this;
        return new Promise<Result>((resolve, reject) => {
            let objBuf = Buffer.from(JSON.stringify(obj))
            that.post(path, objBuf, "application/json")
                .then((result) => {
                    resolve(result)
                })
                .catch((reson) => {
                    reject(reson)
                })
        })
    }

    public heartBeat() {
        log.silly("Sending heartbeat.");
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
     * Create a HTTP2 or HTTP1 client for communicating with K8s API server.
     * @param apiServerUrl The URL of the K8s API server, e.g. https://10.0.0.1:8443
     * @param clientCertPath PEM encoded client certificate path
     * @param clientKeyPath PEM encoded client key path
     * @param caCertPath PEM encoded K8s APIServer CA certificate path
     */
    private createHttpClientWithClientCert(apiServerUrl: string, clientCertPath: string, clientKeyPath: string, caCertPath: string, supportHttp2: boolean = true) {
        log.info("Creating HTTP2 client with client certificate files.", "ApiServer: " + apiServerUrl);

        let key = fs.readFileSync(clientKeyPath)
        let cert = fs.readFileSync(clientCertPath)
        let ca = fs.readFileSync(caCertPath)
        if (supportHttp2) {
            this.createHttp2ClientWithClientCertData(apiServerUrl, cert.toString(), key.toString(), ca.toString())
            this._http2Enabled = true;
        } else {
            log.warn(`Creat Http2 client error, try to create Http1 client`)
            // if this throws it must be failed
            this.createHttp1ClientWithClientCertData(this._apiServerUrl, cert.toString(), key.toString(), ca.toString());
            this._http2Enabled = false;
        }
    }

    private createHttp2ClientWithClientCertData(apiServerUrl: string, clientCertDataPem: string, clientKeyDataPem: string, caCertDataPem: string) {
        log.info("Creating HTTP2 client with client certificate data.", "ApiServer: " + apiServerUrl);
        let that = this;
        const tlsOptions: SecureContextOptions = {
            key: clientKeyDataPem,
            cert: clientCertDataPem,
            ca: caCertDataPem,
        }

        this.http2Client = http2.connect(apiServerUrl, tlsOptions, (session, socket) => {
            socket.setKeepAlive(true, 0);
            socket.on(
                'close', (hadError) => {
                    log.info("TCP connection closed.", "hadError: " + hadError);
                    if (that._options.autoReconnect) {
                        that.tryToCreateHttpClient();
                    } else {
                        that.close()
                    }
                }
            );
        });
        this.http2Client.on('connect', (() => log.info("TCP for Http2 connection established")))
        // this.http2Client.setTimeout(10000, () => {
        //     log.warn("There is no activity on the connection.");
        // });

        if (that._options.autoKeepAlive) {
            setInterval(() => {
                that.heartBeat();
            }, 10000);
        }
        this._http2Enabled = true
    }

    private createHttp1ClientWithClientCertData(apiServerUrl: string, clientCertDataPem: string, clientKeyDataPem: string, caCertDataPem: string) {
        log.info("Creating HTTP1 client with client certificate data.", "ApiServer: " + apiServerUrl);
        let that = this;
        this.httpsAgentOptions = {
            ca: caCertDataPem,
            key: clientKeyDataPem,
            cert: clientCertDataPem,
            keepAlive: true,
            timeout: 0,
        } as https.AgentOptions
        this.httpsAgent = new https.Agent(this.httpsAgentOptions);

        // test connection
        fetch(this._apiServerUrl + "/api/v1/namespaces",
            {
                agent: that.httpsAgent,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${that.token}`
                }
            }
        ).catch(e => { throw  e});
    }

    /**
     * Create an HTTP2 client for communicating with K8s API server authenticated with a token.
     * @param apiServerUrl The URL of the K8s API server, e.g. https://10.0.0.1:8443
     * @param tokenFilePath The Bearer token to authenticate with the API server. Usually, this should be a service account token.
     * @param caCertPath Cluster CA cert(PEM) file path
     */
    private createHttp2ClientWithToken(apiServerUrl: string, tokenFilePath: string, caCertPath: string) {
        log.info("Creating HTTP2 client with token.", "ApiServer: " + apiServerUrl);
        let that = this;
        this.token = fs.readFileSync(tokenFilePath, 'utf8');
        let ca = fs.readFileSync(caCertPath, 'utf8');
        this.http2Client = http2.connect(apiServerUrl, { ca: ca }, (session, socket) => {
            socket.setKeepAlive(true, 0); //
            socket.on(
                'close', (hadError) => {
                    log.info("TCP connection closed.", "hadError: " + hadError);
                    if (that._options.autoReconnect) {
                        that.tryToCreateHttpClient();
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
                that.heartBeat();
            }, 10000);
        }
        this._http2Enabled = true
    }

    /**
     * Create https agent and save agent options for further usage.
     *  Just for downward compatibility with HTTP 1.1
     * @param apiServerUrl
     * @param tokenFilePath
     * @param caCertPath
     * @private
     */
    private createHttp1ClientWithToken(apiServerUrl: string, tokenFilePath: string, caCertPath: string) {
        log.info("Creating HTTP1.1 client with token.", "ApiServer: " + apiServerUrl);
        let that = this;
        this.token = fs.readFileSync(tokenFilePath, 'utf8');
        this.httpsAgentOptions = {
            ca: fs.readFileSync(caCertPath),
            keepAlive: true,
            timeout: 0,
        } as https.AgentOptions
        this.httpsAgent = new https.Agent(this.httpsAgentOptions);

        // test connection
        fetch(this._apiServerUrl + "/api/v1/namespaces",
            {
                agent: that.httpsAgent,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${that.token}`
                }
            }
        ).catch(e => { throw  e});
    }

    /**
     * Creat K8s_client with config in the KUBECONFIG file
     * @private
     */
    private createHttpClientWithKubeConfig(supportHttp2: boolean = true) {
        let kubeConfigInfo = this.parseKubeConfig()
        log.info(`Creating http client with kubeconfig. supportHttp2: ${supportHttp2}`)
        // create Http2Client
        this._apiServerUrl = kubeConfigInfo.apiServerUrl;
        if (kubeConfigInfo.clientKeyDataBase64?.length > 0) {
            this._options.clientKeyDataPemBase64 = kubeConfigInfo.clientKeyDataBase64;
            this._options.clientCertDataPemBase64 = kubeConfigInfo.clientCertDataBase64;
            this._options.caCertDataPemBase64 = kubeConfigInfo.caCertDataBase64;
            let pems = this.clientCertsBase64Decode(kubeConfigInfo.clientCertDataBase64, kubeConfigInfo.clientKeyDataBase64, kubeConfigInfo.caCertDataBase64);
            if (supportHttp2) {
                this.createHttp2ClientWithClientCertData(this._apiServerUrl, pems.clientCertPem, pems.clientKeyPem, pems.caCertPem);
                this._http2Enabled = true;
            } else {
                log.warn(`Creat Http2 client error, try to create Http1 client`)
                this._http2Enabled = false;
                this.createHttp1ClientWithClientCertData(this._apiServerUrl, pems.clientCertPem, pems.clientKeyPem, pems.caCertPem);
            }
        } else if (kubeConfigInfo.clientKeyPath?.length > 0) {
            this._options.caCertPath = kubeConfigInfo.caCertPath;
            this._options.clientCertPath = kubeConfigInfo.clientCertPath;
            this._options.clientKeyPath = kubeConfigInfo.clientKeyPath;
            this.createHttpClientWithClientCert(this._apiServerUrl, this._options.clientCertPath, this._options.clientKeyPath, this._options.caCertPath, supportHttp2);
        } else {
            throw new Error("Neither client-key nor client-key-data provided")
        }
    }

    private parseKubeConfig(): KubeConfigKeyInfo {
        let kubeConfigFile = process.env.KUBECONFIG || this._options.kubeConfigFilePath || homedir() + "/.kube/config";
        if (kubeConfigFile.at(0) == '~') {
            kubeConfigFile = homedir() + kubeConfigFile.slice(1);
        }
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
        let caCertDataBase64: string = "";
        (config.clusters as [any]).forEach((cluster, idx, clusters) => {
            if (cluster.name == clusterName) {
                caCertPath = cluster.cluster["certificate-authority"];
                caCertDataBase64 = cluster.cluster["certificate-authority-data"];
                apiServerUrl = cluster.cluster.server;
            }
        })
        if (!apiServerUrl || (!caCertPath && !caCertDataBase64)) {
            throw new Error(`Cluster ${clusterName} not found in the kube-config file: ${kubeConfigFile}`);
        }

        // 2. find user info (including client cert and client key path)
        let clientCertPath: string = "";
        let clientKeyPath: string = "";
        let clientCertDataBase64: string = "";
        let clientKeyDataBase64: string = "";
        (config.users as [any]).forEach((user, idx, users) => {
            if (user.name == userName) {
                clientCertPath = user.user["client-certificate"];
                clientKeyPath = user.user["client-key"];
                clientCertDataBase64 = user.user["client-certificate-data"];
                clientKeyDataBase64 = user.user["client-key-data"];
            }
        })
        if ((!clientCertPath || !clientKeyPath) && (!clientCertDataBase64 || !clientKeyDataBase64)) {
            throw new Error(`User ${userName} not found in the kube-config file: ${kubeConfigFile}`)
        }

        return {
            apiServerUrl: apiServerUrl,
            caCertDataBase64: caCertDataBase64,
            caCertPath: caCertPath,
            clientCertPath: clientCertPath,
            clientCertDataBase64: clientCertDataBase64,
            clientKeyPath: clientKeyPath,
            clientKeyDataBase64: clientKeyDataBase64
        } as KubeConfigKeyInfo
    }

    private clientCertsBase64Decode(clientCertBase64: string, clientKeyBase64: string, caCertBase64: string): { clientCertPem: string, clientKeyPem: string, caCertPem: string } {
        return {
            clientCertPem: Buffer.from(Base64.decode(clientCertBase64)).toString('utf8'),
            clientKeyPem: Buffer.from(Base64.decode(clientKeyBase64)).toString('utf8'),
            caCertPem: Buffer.from(Base64.decode(caCertBase64)).toString('utf8')
        }
    }
}