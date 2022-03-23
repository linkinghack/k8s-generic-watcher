import EventEmitter from "node:events";
import {GVK, KVMatcher} from "../k8s_resources/inner_types";
import {Container, nonuniqueIndex, uniqueIndex} from "multi-index";
import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import logger from "../logger";
import {CheckedGroupVersion, CheckedGVK} from "../utils/k8s_name_format";
import jsonpath from "jsonpath"

export enum InformerEvent {
    ADDED = "ADDED",
    MODIFIED = "MODIFIED",
    DELETED = "DELETED"
}

const log = logger.getChildLogger({name: "CacheInformer"});

export class K8sObjectCacheType {
    public originalObject: K8sApiObject;
    public labels: KVMatcher;
    public annotations: KVMatcher;

    constructor(k8sObj: K8sApiObject) {
        this.originalObject = k8sObj;
        this.labels = new KVMatcher(k8sObj.metadata.labels);
        this.annotations = new KVMatcher(k8sObj.metadata.annotations);
    }
}

/**
 * CacheInformer stores a series of objects of a specific GVK
 * and create indices with field selector and label selector.
 *
 * There are some default indices: [.metadata.name, .metadata.namespace, .metadata.uid], and accept arbitrary additional field-based indices.
 */
export class CacheInformer extends EventEmitter {
    private _gvk: GVK;
    private _checkedGvk: string;
    private _store: Container<K8sObjectCacheType>;
    private _idxUid: ReadonlyMap<string, K8sObjectCacheType>;
    private _idxName: ReadonlyMap<string, ReadonlySet<K8sObjectCacheType>>;
    private _idxNamespace: ReadonlyMap<string, ReadonlySet<K8sObjectCacheType>>;
    // ".field.match.expression" --> [K8sApiObject]
    private _fieldIndices: Map<string, ReadonlyMap<string, ReadonlySet<K8sObjectCacheType>>>;

    constructor(gvk: GVK) {
        super();

        this._gvk = gvk;
        this._checkedGvk = CheckedGVK(this._gvk.group, this._gvk.version, this._gvk.kind);
        this._store = new Container<K8sObjectCacheType>();
        this._idxUid = uniqueIndex<K8sObjectCacheType, string>(kobj => kobj.originalObject.metadata.uid, 'by uid').on(this._store);
        this._idxName = nonuniqueIndex<K8sObjectCacheType, string>(kobj => kobj.originalObject.metadata.name, 'by name').on(this._store);
        this._idxNamespace = nonuniqueIndex<K8sObjectCacheType, string>(kobj => kobj.originalObject.metadata.namespace, 'by namespace').on(this._store);
        this._fieldIndices = new Map<string, ReadonlyMap<string, ReadonlySet<K8sObjectCacheType>>>();
    }

    /**
     * Search objects from local cache with optional search criteria.
     *   All the search criteria are optional. If none of them if specified, it means List all the object of current GVK in all namespaces.
     *   Multiple search criteria will have the relationship of 'and'.
     * @param uid The ObjectMeta.uid. If specified, other params will be ignored.
     * @param name The ObjectMeta.name to be filtered with.
     * @param namespace The ObjectMeta.namespace to be filtered with.
     * @param fieldMatches Other filters by any field matches. If the field index does not exist, this will creat it immediately.
     */
    public SearchObjects(uid?: string, name?: string, namespace?: string, fieldMatches?: Map<string, any>): K8sApiObject[] {
        let that = this;
        if (!uid && !name && !namespace && !fieldMatches) {
            // List all objects cached
            let tmpAllObjects = new Array<K8sApiObject>();
            for (let objCache of that._idxUid.values()) {
                tmpAllObjects.push(objCache.originalObject);
            }
            return tmpAllObjects
        }

        if (uid) {
            log.debug("Searching by uid", "uid=" + uid, `currentCachedGVK=${this._checkedGvk}`)
            return [this._idxUid.get(uid).originalObject]
        }

        let namespaceFilteredResults: ReadonlySet<K8sObjectCacheType>;
        if (namespace) {
            namespaceFilteredResults = this._idxNamespace.get(namespace)
            log.debug(`${namespaceFilteredResults?.size} results founded filter by namespace: ${namespace}`, `currentCachedGVK=${this._checkedGvk}`)
        }

        let nameFilteredResults: ReadonlySet<K8sObjectCacheType>;
        if (name) {
            nameFilteredResults = this._idxName.get(name);
            log.debug(`${namespaceFilteredResults?.size} results founded filter by name: ${name}`, `currentCachedGVK=${this._checkedGvk}`)
        }

        // <namespace, name> is unique for a specific GVK
        if (name && namespace) {
            return this.CacheTypeObjs2OriginalTypeObjs(this.SetsIntersection(nameFilteredResults, namespaceFilteredResults));
        }

        let fieldMatchResults: ReadonlySet<K8sObjectCacheType>[] = new Array<Set<K8sObjectCacheType>>();
        if (fieldMatches?.size > 0) {
            fieldMatches.forEach((value, fieldExp) => {
                // check if this fieldIndex exists
                log.debug(`Searching by field: ${fieldExp}, value=${value}`, `currentCachedGVK=${this._checkedGvk}`)
                if (!that._fieldIndices.has(fieldExp)) {
                    that.AddFieldIndex(fieldExp);
                    log.debug("FieldIndex not found, add it.", "fieldExp=" + fieldExp, `currentCachedGVK=${this._checkedGvk}`)
                }

                // Values of the field in its index are stored as JSON string.
                //  Serialize the target value to JSON before matching.
                let tmpMatchResult = that._fieldIndices.get(fieldExp).get(JSON.stringify(value));
                if (tmpMatchResult?.size > 0) {
                    fieldMatchResults.push(tmpMatchResult)
                } else {
                    log.debug("Search by field:" + fieldExp + " have no result", `currentCachedGVK=${this._checkedGvk}`)
                }
            })
        }

        if (namespace) {
            return this.CacheTypeObjs2OriginalTypeObjs(this.SetsIntersection(namespaceFilteredResults, ...fieldMatchResults))
        } else if (name) {
            return this.CacheTypeObjs2OriginalTypeObjs(this.SetsIntersection(nameFilteredResults, ...fieldMatchResults))
        } else {
            // only field match specified
            return this.CacheTypeObjs2OriginalTypeObjs(this.SetsIntersection(...fieldMatchResults))
        }
    }

    /**
     * Search objects by labels or annotations matching. O(n)
     * @param labelSelectors label selector
     * @param annotations annotation selector
     * @param namespace filter namespace
     */
    public SearchObjectsByLabelSelector(labelSelectors?: Map<string, string>, annotations?: Map<string, string>, namespace?: string): K8sApiObject[] {
        let result: K8sApiObject[] = new Array<K8sApiObject>();
        let filterFn = (obj: K8sObjectCacheType) => {
            if (obj.labels.Match(new KVMatcher(labelSelectors)) && obj.annotations.Match(new KVMatcher(annotations))) {
                result.push(obj.originalObject);
            }
        }

        if (namespace) {
            this._idxNamespace.get(namespace).forEach(filterFn)
        } else {
            this._idxUid.forEach(filterFn)
        }
        return result;
    }

    private CacheTypeObjs2OriginalTypeObjs(cachedObjs: K8sObjectCacheType[]): K8sApiObject[] {
        let result = new Array<K8sApiObject>();
        cachedObjs.forEach((obj) => {
            result.push(obj.originalObject);
        })
        return result;
    }

    private SetsIntersection(...sets: ReadonlySet<K8sObjectCacheType>[]): Array<K8sObjectCacheType> {
        log.debug("sets count=" + sets?.length, `currentCachedGVK=${this._checkedGvk}`)
        let finalResult = new Array<K8sObjectCacheType>();
        if (!sets || sets?.length < 1) {
            return finalResult;
        }
        if (sets?.length == 1) {
            sets[0]?.forEach((obj) => {
                finalResult.push(obj);
            })
            return finalResult;
        }

        // descending sort, and pop the shortest set
        let sortedSets = sets.sort((left, right) => {
            return right.size - left.size
        });
        let set0 = sortedSets.pop();
        set0.forEach((obj0 => {
            for (let i = 0; i < sortedSets.length; i++) {
                if (!sortedSets[i].has(obj0)) {
                    return
                }
            }
            finalResult.push(obj0);
        }))

        return finalResult;
    }

    /**
     * Add an index for specified object field to accelerate search.
     *   IMPORTANT!!!: The value of specified field will be encoded as JSON string before stored in the index.
     *   TODO: JSON parse before query with field index. ✅
     * @param fieldExpression the field expression, like `spec.template.name`
     */
    public AddFieldIndex(fieldExpression: string) {
        let that = this;
        let idx = nonuniqueIndex<K8sObjectCacheType, string>((obj) => {
            log.debug('JSON path search: ' + fieldExpression, jsonpath.query(obj?.originalObject, "$." + fieldExpression))
            try {
                let propertyValues = jsonpath.query(obj?.originalObject, "$." + fieldExpression)
                if (propertyValues?.length < 1) {
                    return "null";
                } else {
                    return JSON.stringify(propertyValues.at(0));
                }
            } catch (e) {
                log.error('JSONPath error while adding filed index', e);
                return "null";
            }

        }, fieldExpression).on(that._store)
        this._fieldIndices.set(fieldExpression, idx);
        log.debug(`Index ${fieldExpression} for ${that._gvk.kind} created`, `size=${idx.size}`)
    }

    private isLegalGvk(obj: K8sApiObject): boolean {
        if (!obj?.apiVersion || !obj?.kind) {
            // not a K8s Object
            return false;
        }

        let gv = obj?.apiVersion?.split("/");
        let group = "";
        let version = "";
        if (gv.length == 1) {
            version = gv[0];
        } else {
            group = gv[0];
            version = gv[1];
        }
        return CheckedGVK(group, version, obj.kind) == this._checkedGvk;
    }

    /**
     * Add 'objs' in local cache and emit ADDED event
     * @param isListItems Whether objs is 'items' of a List request of the GVK.
     *  In this case objects in this item list does not have 'apiVersion' and 'kind' property.
     *   Will auto set it to current cached gvk.
     * @param objs Objects to add
     */
    public AddObjects(isListItems: boolean, ...objs: K8sApiObject[]) {
        let that = this;
        objs.forEach((obj) => {
            if (isListItems) {
                obj.kind = that._gvk.kind;
                obj.apiVersion = CheckedGroupVersion(that._gvk.group, that._gvk.version)
            }
            if (!this.isLegalGvk(obj)) {
                log.debug("Object: ", JSON.stringify(obj))
                log.error("Illegal object for this cache, skip.", `currentCachedGVK=${this._checkedGvk}`,
                    `ApiVersion=${obj?.apiVersion}, Kind=${obj?.kind}, Name=${obj?.metadata?.name}, uid=${obj?.metadata?.uid}`);
                return
            }
            log.debug("Add new object to cache.", `ApiVersion=${obj?.apiVersion}, Kind=${obj?.kind}, Name=${obj?.metadata?.name}, uid=${obj?.metadata?.uid}`)
            that._store.add(new K8sObjectCacheType(obj));
            this.emit(InformerEvent.ADDED, obj);
        })
    }

    public ModifyObject(obj: K8sApiObject) {
        if (this._idxUid.has(obj?.metadata?.uid)) {
            let oldObj = this._idxUid.get(obj.metadata.uid)
            log.debug("Update object in cache.", `ApiVersion=${obj?.apiVersion}, Kind=${obj?.kind}, Name=${obj?.metadata?.name}, uid=${obj?.metadata?.uid}`)
            this._store.delete(oldObj);
            this._store.add(new K8sObjectCacheType(obj));
            this.emit(InformerEvent.MODIFIED, oldObj, obj);
        } else {
            log.warn("Modifying an inexistent object", `currentCachedGVK=${this._checkedGvk}`,
                `ApiVersion=${obj?.apiVersion}, Kind=${obj?.kind}, Name=${obj?.metadata?.name}, uid=${obj?.metadata?.uid}`);
        }
    }

    public DeleteObject(obj: K8sApiObject) {
        if (this._idxUid.has(obj?.metadata?.uid)) {
            log.debug("Delete object in cache.", `ApiVersion=${obj?.apiVersion}, Kind=${obj?.kind}, Name=${obj?.metadata?.name}, uid=${obj?.metadata?.uid}`);
            this._store.delete(this._idxUid.get(obj?.metadata?.uid));
            this.emit(InformerEvent.DELETED, obj);
        } else {
            log.warn("Deleting an object that does not exist", `currentCachedGVK=${this._checkedGvk}`,
                `ApiVersion=${obj?.apiVersion}, Kind=${obj?.kind}, Name=${obj?.metadata?.name}, uid=${obj?.metadata?.uid}`);
        }
    }

    public CacheSize(): number {
        let size = 0;
        this._idxName.forEach(()=> {size++})
        return size
    }

    public OnAdded(handler: (objAdded: K8sApiObject) => void) {
        this.on(InformerEvent.ADDED, handler);
    }

    public OnDeleted(handler: (objAdded: K8sApiObject) => void) {
        this.on(InformerEvent.DELETED, handler);
    }

    public OnModified(handler: (oldObj: K8sApiObject, newObj: K8sApiObject) => void) {
        this.on(InformerEvent.MODIFIED, handler);
    }
}
