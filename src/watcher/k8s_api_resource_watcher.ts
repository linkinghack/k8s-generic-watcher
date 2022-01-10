import { K8sClient } from "./k8s_client";
import {GVK} from "../k8s_resources/inner_types";


export interface WatcherOptions {
    namespaced: boolean;
    // The namespace to watch.
    namespace: string;
    additionalParams: object;
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
    private _k8sClient: K8sClient;
    
    private started: boolean = false;

    constructor(k8sClient: K8sClient, gvk: GVK, options: WatcherOptions) {
        this._k8sClient = k8sClient;
        this.gvk = gvk;
        this.options = options;
        this.params = new Map<String, String>();
        this.params.set("watch", "true");
        this.params.set("timeoutSeconds", "0");
        if (this.options.additionalParams) {
            for (let key of Object.keys(this.options.additionalParams)) {
                this.params.set(key, this.options.additionalParams[key]);
            }
        }
    }
    
    public start() {
        
    }

    public stop() {

    }
}