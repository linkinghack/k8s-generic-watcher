import {ApiResourceCacheType, GVK} from "../k8s_resources/inner_types";
import logger from "../logger";

export enum DefaultK8sGroup {
    Core = "core",
    Apps = "apps",
    Batch = "batch",
    ApiExtensions = "apiextensions.k8s.io",
}

export enum DefaultUrlPath {
    GroupCore = "/api",
    GroupApps = "/apis/apps",
    GroupBatch = "/apis/batch",
    ApiGroups = "/apis"
}

const log = logger.getChildLogger({name: "k8s-name-format"});

/**
 * Construct the URL to request APIServer for an "APIResourceList".
 * @param group target API group
 * @param version target version under this API group
 */
export function ApiGroupVersionToUrl(group: string, version: string): string {
    switch (group) {
        case DefaultK8sGroup.Core:
            return `${DefaultUrlPath.GroupCore}/${version}`;
        case DefaultK8sGroup.Apps:
            return `${DefaultUrlPath.GroupApps}/${version}`;
        case DefaultK8sGroup.Batch:
            return `${DefaultUrlPath.GroupBatch}/${version}`;
    }

    // till now(2022/01/11), api groups except core/v1 are all located at /apis
    return `${DefaultUrlPath.ApiGroups}/${group}/${version}`;
}

/**
 * Get available url of a specific Api resource to request APIServer.
 * @param apiResource cached api resource that containing (group, version, king, resource) information
 * @param namespace
 */
export function GVRUrl(apiResource: ApiResourceCacheType, namespace?: string, name?: string): string {
    let resourceUrl = ""
    if (namespace && apiResource.originalApiResource.namespaced) {
        resourceUrl = `${ApiGroupVersionToUrl(apiResource.group, apiResource.version)}/namespace/%{namespace}/${apiResource.resource}`;
    } else {
        resourceUrl = `${ApiGroupVersionToUrl(apiResource.group, apiResource.version)}/${apiResource.resource}`;
    }
    if (name) {
        resourceUrl += name;
    }

    return resourceUrl;
}

/**
 * Return <group>/<version> most cases and <version> for Core group
 * @param group group name
 * @param version group api version
 */
export function CheckedGroupVersion(group: string, version: string) {
    group = group.toLowerCase();
    version = version.toLowerCase();
    if (group == "core" || group == "") {
        return version;
    } else {
        return `${group}/${version}`;
    }
}

export function CheckedGVK(group: string, version: string, kind: string): string {
    return `${CheckedGroupVersion(group, version)}/${kind}`;
}
export function CheckedGVKStrForGVKType(gvk: GVK): string {
    return CheckedGVK(gvk.group, gvk.version, gvk.kind)
}

export function SplitGVK(gvk: string): { group: string, version: string, kind: string } {
    let result = {group: "", version: "", kind: ""};
    if (!gvk || typeof gvk != 'string') {
        return result;
    }

    let split = gvk.split('/')
    switch (split?.length) {
        case 2:
            result.group = 'core';
            result.version = split[0];
            break;
        case 3:
            result.group = split[0];
            result.version = split[1];
            result.kind = split[2];
            break;
        default:
            log.warn('SplitGVK: unrecognized gvk format.', gvk)
    }

    return result;
}