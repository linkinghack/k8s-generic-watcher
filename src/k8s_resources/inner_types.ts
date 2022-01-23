/**
 * Group Version Kind in Kubernetes
 */
import {APIResource} from "./k8s_origin_types";
import {ApiGroupVersionToUrl} from "../utils/k8s_name_format";

export interface GVK {
    group: string;
    version: string;
    kind: string;
}

export class KVMatcher {
    labels: Map<string, string>

    constructor(labels: Object) {
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
     * _resourceType is the "resource type" described in the K8 official document.
     *   such as 'pods', 'deployments', 'namespaces', etc.
     * ref: https://kubernetes.io/docs/reference/using-api/api-concepts/#standard-api-terminology
     */
    resource: string,
    gvk: string, // "<group>/<version>/<kind>"
    originalApiResource: APIResource
}

/**
 * Get GVR of a K8s api resource for API server url.
 *   Formatted as <group>/<version>/<resource>, like ""
 * @param apiResource
 */
export function GetGVR(apiResource: ApiResourceCacheType): string {
    return `${apiResource.group}/${apiResource.version}/${apiResource.resource}`;
}

/**
 * Get available url of a specific Api resource to request APIServer.
 * @param apiResource cached api resource that containing (group, version, king, resource) information
 */
export function GVRUrl(apiResource: ApiResourceCacheType, namespace?: string): string {
    if (namespace) {
        return `${ApiGroupVersionToUrl(apiResource.group, apiResource.version)}/namespace/%{namespace}/${apiResource.resource}`;
    }
    return `${ApiGroupVersionToUrl(apiResource.group, apiResource.version)}/${apiResource.resource}`
}
