/**
 * Group Version Kind in Kubernetes
 */
import {APIResource} from "./k8s_origin_types";
import {WatcherOptions} from "../watcher/k8s_api_resource_watcher";
import {K8sObjectsQueryParams} from "../types";

export interface GVK {
    group: string;
    version: string;
    kind: string;
}

export interface InitialWatchResource extends GVK{
    watchOptions?: WatcherOptions,
    notifiers?: [{
        webhookUrls: string[],
        filter?: K8sObjectsQueryParams,
        eventTypes: string[]
    }]
}

export class KVMatcher {
    labels: Map<string, string>

    constructor(labels: Object) {
        labels = new Map<string, string>();
        Object.keys(labels).forEach((objKey, idx, objKeys) => {
            this.labels.set(objKey, labels[objKey]);
        })
    }

    public HasLabel(key: string) {
        return this.labels.has(key);
    }

    public GetLabelValue(key: string) {
        return this.labels.get(key);
    }

    public Match(r: KVMatcher): boolean {
        if (r.labels.size == 0) {
            return true;
        }
        this.labels.forEach((v, k, m) => {
            if (!r.HasLabel(k) || r.GetLabelValue(k) != v) {
                return false;
            }
        })
        return true;
    }
}

/**
 * K8s API resource type for caching and indexing
 */
export interface ApiResourceCacheType {
    group: string,
    version: string,
    kind: string,
    /**
     * resource is the "resource type" described in the K8 official document.
     *   such as 'pods', 'deployments', 'namespaces', etc.
     * ref: https://kubernetes.io/docs/reference/using-api/api-concepts/#standard-api-terminology
     */
    resource: string,
    gvk: string, // "<group>/<version>/<kind>"
    originalApiResource: APIResource
}

export const K8sApiQueryParameterNames = {
    resourceVersion: "resourceVersion",
    resourceVersionMatch: "resourceVersionMatch",
    watch: "watch",
    timeoutSeconds: "timeoutSeconds",
    fieldSelector: "fieldSelector",
    labelSelector: "labelSelector"
}

export const K8sApiQueryParamValues = {
    WatchEnabled: "true",
    WatchDisabled: "false"
}
