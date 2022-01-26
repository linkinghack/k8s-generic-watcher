/**
 * Response from /apis/<group>/<version>
 *     /api/v1
 *     /apis/apiextensions.k8s.io/v1
 */

export interface APIResourceList {
    kind: string; // "APIResourceList"
    groupVersion: string; // current groupVersion
    resources: Array<APIResource>;
}

export interface APIResource {
    name: string; // resource name, like "pods"
    singularName: string;
    namespaced: boolean;
    kind: string;
    verbs: Array<string>;
    shortNames: Array<string>;
    categories: Array<string>;
    storageVersionHash: string;
}

/**
 * Response from /apis/<group>
 *     /apis/apiextensions.k8s.io
 *     /apis/apps
 */
export interface APIGroup {
    name: string,  // Group name in GVK
    versions: Array<{
        groupVersion: string,  // like "node.k8s.io/v1", "apps/v1"
        version: string
    }>,
    preferredVersion: {
        groupVersion: string,
        version: string,
    }
}

/**
 * Response of /apis
 */
export interface APIGroupList {
    kind: string, // "APIGroupList"
    apiVersion: string, // "v1"
    groups: Array<APIGroup>
}

export function IsApiResource(obj: Object): boolean {
    return (obj && obj.hasOwnProperty("name") && obj.hasOwnProperty("kind") && obj.hasOwnProperty("namespaced"));
}

export function IsApiResourceList(obj: Object): boolean {
    return (obj && obj.hasOwnProperty("kind") && obj.hasOwnProperty("groupVersion") && obj.hasOwnProperty("resources"));
}

export function IsApiGroupList(obj: Object): boolean {
    return (obj && obj.hasOwnProperty("kind") && obj.hasOwnProperty("apiVersion") && obj.hasOwnProperty("groups"))
}

export interface K8sApiObject {
    kind: string,
    apiVersion: string, // group/version
    metadata: ObjectMeta,
    status: Object
}

/**
 * https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/object-meta/
 */
export interface ObjectMeta {
    name: string,
    generateName: string,
    namespace: string,
    labels: Object,
    annotations: Object,

    // system
    finalizers: string[],
    ownerReferences: {
        apiVersion: string,
        kind: string,
        name: string,
        uid: string,
        blockOwnerDeletion: boolean,
        controller: boolean
    }[],

    // read-only
    creationTimestamp: string, // RFC3339 , UTC
    deletionGracePeriodSeconds: bigint,
    deletionTimestamp: string,
    generation: bigint,
    resourceVersion: string,
    uid: string
}

export interface K8sApiObjectList {
    kind: string,
    apiVersion: string, // group/version
    metadata: ListMeta,
    items: K8sApiObject[]
}

export interface ListMeta {
    continue: string,
    remainingItemCount: bigint,
    resourceVersion: string,
    selfLink: string,
}

export interface WatchEvent {
    type: string,
    object: K8sApiObject
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