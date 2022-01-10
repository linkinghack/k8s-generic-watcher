/**
 * Group Version Kind in Kubernetes
 */
export class GVK {
    _group: string;
    _version: string;
    _kind: string;
    /**
     * _resourceType is the "resource type" described in the K8 official document.
     *   such as 'pods', 'deployments', 'namespaces', etc.
     * ref: https://kubernetes.io/docs/reference/using-api/api-concepts/#standard-api-terminology
     */
    _resourceType: string;

    constructor(group: string, version: string, kind: string) {
        this._group = group;
        this._version = version;
        this._kind = kind;
    }

    public ResourceType(): string {
        // TODO online fetch "resource type" of this GVK
        return this._resourceType;
    }
}

export class Labels {
    labels: Map<string, string>

    constructor(labels: Object) {
        Object.keys(labels).forEach( (objKey, idx, objKeys) => {
            this.labels.set(objKey, labels[objKey]);
        })
    }

    public HasLabel(key: string) {
        return this.labels.has(key);
    }

    public GetLabelValue(key: string) {
        return this.labels.get(key);
    }

    public Match(r: Labels): boolean {
        this.labels.forEach((v, k, m) => {
            if (!r.HasLabel(k) || r.GetLabelValue(k) != v) {
                return false;
            }
        })
        return true;
    }
}
