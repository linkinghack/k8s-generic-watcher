import fetch, { Response } from "node-fetch";


export class GVK {
    group: string;
    version: string;
    kind: string;
    constructor(group: string, version: string, kind: string) {
        this.group = group;
        this.version = version;
        this.kind = kind;
    }
}

export class WatcherOptions {
    namespace: string;
    apiServerUrl: string;

    // Default to in-cluster authentication which means that the client will use the service account
    // token to authenticate with the API server.
    //   ServiceAccount secret data location: /var/run/secrets/kubernetes.io/serviceaccount/token
    //
    // If running the client out of cluster, use the client certificate to authenticate
    autoInclusterConfig: boolean = true;

    // If autoInclusterConfig is true, authType will be ignored.
    //   Can be set to AUTH_TYPE_TOKEN or AUTH_TYPE_CERT.
    authType: string = "BearerToken";

    // Takes effect only if autoInclusterConfig is false and authType == ATH_TYPE_CERT.
    clientCert: string | Buffer;
    clientKey: string | Buffer;
    caCert: string | Buffer;
    
    constructor(apiServerUrl: string, namespace: string) {
        this.apiServerUrl = apiServerUrl;
        this.namespace = namespace;
    }



}

/**
 * K8sApiObjectWatcher is a generic watcher for K8s API objects.
 * It supports watching for events on arbitrary API object including CustomerResources.
 * Just provide a GVK (GroupVersionKind) to watch.
 */
export class K8sApiObjectWatcher {
    private options: WatcherOptions;
    
    private headers: any;
    private params: any;

    private resp: Response; 

    private started: boolean = false;

    constructor(options) {
        
    }
    

    public start() {
        
    }

    public stop() {

    }
}