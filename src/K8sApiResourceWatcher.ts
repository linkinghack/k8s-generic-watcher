import { ClientHttp2Session } from "http2";
import { K8sClient } from "./K8sClient";

/**
 * Group Version Kind in Kubernetes
 */
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

    additionalParams: Map<String, String>;

    constructor(apiServerUrl: string, namespace: string) {
        this.apiServerUrl = apiServerUrl;
        this.namespace = namespace;
    }

}

/**
 * K8sApiObjectWatcher is a generic watcher for K8s API objects.
 * It supports watching for events on an arbitrary API object including CustomerResources.
 * Just provide a GVK (GroupVersionKind) to watch.
 */
export class K8sApiObjectWatcher {
    private options: WatcherOptions;
    private gvk: GVK;
    private params: Map<String, String>;
    private K8sClient: K8sClient;
    
    private started: boolean = false;

    constructor(options) {
        
    }
    
    public start() {
        
    }

    public stop() {

    }
}