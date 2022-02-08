/**
 * Configures how to authenticate with the API server.
 * BearerToken for in-cluster authentication, ClientCertificate for out-of-cluster authentication,
 *   and KubeConfig for using a kubeconfig file specified in `KUBECONFIG` environment variable.
 *
 */
import HttpStatus from "http-status";

export const
    AuthTypeBearerToken = "BearerToken",
    AuthTypeClientCertificate = "ClientCertificate",
    AuthTypeKubeConfig = "KubeConfig"

export class WatcherApiResponse {
    public code: number;
    public message: string;
    public data: any;

    constructor(code?: number, message?: string, data?: any) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public static Result(code: number, msg?: string, data?: any) {
        return new WatcherApiResponse(code, msg, data);
    }

    public static Ok(msg?: string, data?: any): WatcherApiResponse {
        return new WatcherApiResponse(HttpStatus.OK, msg, data)
    }
}

export interface K8sObjectsQueryParams {
    group: string,
    version: string,
    kind: string,
    name?: string,
    namespace?: string,
    uid: string,
    labelSelectors?: Array<any>,
    annotationSelectors: Array<any>,
    fieldMatches?: Array<any>,
    dedicatedIndex?: boolean
}