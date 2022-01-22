import {K8sClient} from "../utils/k8s_client";
import {GVK} from "../k8s_resources/inner_types";
import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import { EventEmitter } from "stream";
import { ApiGroupDetector } from "k8s_resources/api_group_detector";
import {ClientHttp2Session, Http2Session} from "http2";


export interface WatcherOptions {
    // The namespace to watch.
    namespace: string;
    fieldSelector: Map<string, string>;
    labelSelector: Map<string, string>;
    additionalParams: Object;
}

/**
 * K8sApiObjectWatcher is a generic watcher for K8s API objects.
 * It supports watching for events on an arbitrary API object including CustomerResources.
 * Just provide a GVK (GroupVersionKind) to watch.
 */
export class K8sApiObjectWatcher extends EventEmitter {
    private options: WatcherOptions;
    private gvk: GVK;
    private params: Map<String, String>;
    private _k8sClient: K8sClient;
    private _apiGroupDetector: ApiGroupDetector;

    private _started: boolean = false;
    private _h2Session: ClientHttp2Session;

    constructor(k8sClient: K8sClient, apiGroupDetector: ApiGroupDetector, gvk: GVK, options: WatcherOptions) {
        super();
        this._k8sClient = k8sClient;
        this._apiGroupDetector = apiGroupDetector;
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

    public async start() {
        // 0. get APIResource metadata verify existence of this APIResource, check resource type whether it is namespaced
        let resourceDetail = await this._apiGroupDetector.GetApiResourceDetailOfGVK(this.gvk.group, this.gvk.version, this.gvk.kind)


        // 1. find out GVR of specified GVK

        // 2. construct the url and request based on parameters (namespace, fieldSelector, labelSelector)

        // 3. list and get version

        // 4. watch based on version
        // this._k8sClient.requestOnce()
    }

    public stop() {

    }

    public async List(): Promise<K8sApiObject> {
        // TODO
        return null;
    }

}