/**
 * K8sClient is a HTTP2 client for watching K8s API objects.
 * 
 * The client will be configured with a K8s API server URL and properly configured Token or client certificate.
 */

import * as http2 from "node:http2";
import { AuthType } from "./types";
import * as fs from "node:fs";
import { SecureContextOptions } from "node:tls";
import { setInterval } from "node:timers";
import logger from "./logger";

const log = logger.getChildLogger({ name: "K8sClient" });

export class K8sClientOptions {
    // Default to in-cluster authentication which means that the client will use the ServiceAccount
    // token to authenticate with the API server.
    //   ServiceAccount secret data location: /var/run/secrets/kubernetes.io/serviceaccount/token
    //
    // If running the client out of cluster, use the client certificate to authenticate
    autoInclusterConfig: boolean = true;

    // If autoInclusterConfig is true, authType will be ignored.
    //   Can be set to AUTH_TYPE_TOKEN or AUTH_TYPE_CERT.
    authType: string = AuthType.BearerToken;

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

export class K8sClient {
    private apiserverUrl: string;
    private options: K8sClientOptions;
    private http2Client: http2.ClientHttp2Session;
    
    private token: string; // Cached auth token for in-cluster authentication.

    private closed: boolean = true;

    // note: set headers in http2 request when do a request(outgoingHeaders:{})

    constructor(apiserverUrl: string, options: K8sClientOptions) {
        this.options = options;
        this.apiserverUrl = apiserverUrl;
        this.tryToCreateClient();
        log.info("Created K8sClient/HTTP2 client.", "ApiServer: " + apiserverUrl, "AuthType: " + this.options.authType, "AutoKeepAlive: " + this.options.autoKeepAlive);
    }

    private tryToCreateClient() {
        try {
            // create http2 client with proper authentication
            if (this.options.autoInclusterConfig) {
                this.createHttp2ClientWithToken(this.apiserverUrl, '/var/run/secrets/kubernetes.io/serviceaccount/token', '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
            } else if (this.options.authType == AuthType.BearerToken) {
                this.createHttp2ClientWithToken(this.apiserverUrl, this.options.tokenFilePath, this.options.caCertPath);
            } else {
                this.createHttp2ClientWithClientCert(this.apiserverUrl, this.options.clientCertPath, this.options.clientKeyPath, this.options.caCertPath);
            }
        } catch(e) {
            log.fatal("Failed to create K8sClient. ", e);
            throw e;
        }
        this.closed = false;
    }

    public close() {
        this.closed = true;
        this.http2Client.close();
    }

    public request(path:string,  outgoingHeaders: http2.OutgoingHttpHeaders): http2.ClientHttp2Stream {
        if(this.closed){
            throw new Error("K8sClient is closed.");
        }

        if (!outgoingHeaders) {
            outgoingHeaders = {};
        }
        if (this.options.authType == AuthType.BearerToken) {
            outgoingHeaders[http2.constants.HTTP2_HEADER_AUTHORIZATION] = this.token;
        }
        outgoingHeaders[http2.constants.HTTP2_HEADER_PATH] = path;
        return this.http2Client.request(outgoingHeaders);
    }

    public heartBeat() {
        log.debug("Sending heartbeat.");
        let header: http2.OutgoingHttpHeaders = {
            [http2.constants.HTTP2_HEADER_PATH]: '/api',
            [http2.constants.HTTP2_HEADER_METHOD]: 'GET'
        };
        if (this.options.authType == AuthType.BearerToken) {
            header[http2.constants.HTTP2_HEADER_AUTHORIZATION] = this.token
        }
        let stream = this.http2Client.request(header);
        stream.on('response', () => { stream.close(); });
    }

    /**
     * Create a HTTP2 client for communicating with K8s API server.
     * @param apiserverUrl The URL of the K8s API server, e.g. https://10.0.0.1:8443
     * @param clientCertPath PEM encoded client certificate path
     * @param clientKeyPath PEM encoded client key path
     * @param caCertPath PEM encoded K8s APIServer CA certificate path
     */
    private createHttp2ClientWithClientCert(apiserverUrl: string, clientCertPath: string, clientKeyPath: string, caCertPath: string) {
        log.info("Creating HTTP2 client with client certificate.", "ApiServer: " + apiserverUrl);
        let that = this;
        const tlsOptions: SecureContextOptions = {
            key: fs.readFileSync(clientKeyPath),
            cert: fs.readFileSync(clientCertPath),
            ca: fs.readFileSync(caCertPath),
        }

        this.http2Client = http2.connect(apiserverUrl, tlsOptions, (session, socket) => {
            socket.setKeepAlive(true, 0);
            socket.on(
                'close', (hadError) => {
                    log.info("TCP connection closed.", "hadError: " + hadError); 
                    if(that.options.autoReconnect) {
                        that.tryToCreateClient();
                    } else {
                        that.close()
                    }
                }
            );
        });
        this.http2Client.setTimeout(10000, () => { log.warn("There is no activity on the connection."); });

        if (that.options.autoKeepAlive) {
            setInterval(() => { this.heartBeat(); }, 5000);
        }
    }

    /**
     * Create a HTTP2 client for communicating with K8s API server authenticated with a token.
     * @param apiserverUrl The URL of the K8s API server, e.g. https://10.0.0.1:8443
     * @param token The Bearer token to authenticate with the API server. Usually, this should be a service account token.
     */
    private createHttp2ClientWithToken(apiserverUrl: string, tokenFilePath: string, caCertPath: string) {
        log.info("Creating HTTP2 client with token.", "ApiServer: " + apiserverUrl);
        let that = this;
        this.token = fs.readFileSync(tokenFilePath, 'utf8');
        let ca = fs.readFileSync(caCertPath, 'utf8');
        this.http2Client = http2.connect(apiserverUrl, { ca: ca }, (session, socket) => {
            socket.setKeepAlive(true, 0);
            socket.on(
                'close', (hadError) => {
                    log.info("TCP connection closed.", "hadError: " + hadError); 
                    if(that.options.autoReconnect) {
                        that.tryToCreateClient();
                    } else {
                        that.close()
                    }
                }
            );
        });
        this.http2Client.setTimeout(10000, () => { log.warn("There is no activity on the connection."); });

        if (that.options.autoKeepAlive) {
            setInterval(() => { this.heartBeat(); }, 5000);
        }
    }

}
