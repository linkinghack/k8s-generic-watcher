
export enum DefaultK8sGroup {
    Core = "core",
    Apps = "apps",
}

export const DefaultUrlPath = {
    Core: "/api",
    Apps: "/apis/apps",
    ApiGroups: "/apis"
}

export function ApiGroupVersionToUrl(group: string, version: string): string {
    if (group == DefaultK8sGroup.Core.toString()) {
        return `/api/${version}`;
    }

    // till now(2022/01/11), api groups except core/v1 are all located at /apis
    return `/apis/${group}/${version}`;
}

export function CheckedGroupVersion(group: string, version: string) {
    if (group == "core") {
        return version;
    } else {
        return `${group}/${version}`;
    }
}

export function CheckedGVK(group: string, version: string, kind:string) {
    return `${CheckedGroupVersion(group,version)}/${kind}`;
}