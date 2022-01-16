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
 * Return <group>/<version> most cases and <version> for Core group
 * @param group group name
 * @param version group api version
 */
export function CheckedGroupVersion(group: string, version: string) {
    group = group.toLocaleLowerCase();
    version = version.toLocaleLowerCase();
    if (group == "core") {
        return version;
    } else {
        return `${group}/${version}`;
    }
}

export function CheckedGVK(group: string, version: string, kind: string) {
    return `${CheckedGroupVersion(group, version)}/${kind}`;
}