/**
 * Response from /apis/<group>/<version>
 *     /api/v1
 *     /apis/apiextensions.k8s.io/v1
 */

export interface APIResourceList {
    kind: string;
    groupVersion: string;
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
    name: string;  // Group name in GVK
    versions: Array<{
        groupVersion: string,  // like "node.k8s.io/v1", "apps/v1"
        version: string
    }>;
    preferredVersion: {
        groupVersion: string;
        version: string;
    }
}

/**
 * Response of /apis
 */
export interface APIGroupList {
    kind: string; // "APIGroupList"
    apiVersion: string; // "v1"
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