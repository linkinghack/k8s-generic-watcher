import {K8sClient} from "../watcher/k8s_client";
import {APIGroup, APIGroupList, APIResourceList, IsApiGroupList, IsApiResourceList} from "./k8s_origin_types";
import logger from "../logger";
import status from "http-status"
import {ApiGroupVersionToUrl, CheckedGroupVersion, CheckedGVK, DefaultUrlPath} from "../utils/k8s_name_format"
import {Container, nonuniqueIndex, NonuniqueIndexError, uniqueIndex} from "multi-index";
import {ApiResourceCacheType} from "./inner_types";
import {GVKNotCachedError} from '../error'

const log = logger.getChildLogger({name: "ApiGroupDetector"});

export class ApiGroupDetector {
    private _k8sClient: K8sClient;

    // original K8s response data
    //   groupVersion -->  APIResourceList
    private _cachedApiGroups: APIGroupList;

    private _cachedApiGroupResources: Map<string, APIResourceList>;
    private _ApiGroups: Map<string, APIGroup> // <groupName> --> APIGroup
    private _groupVersionsSet: Set<string>;

    // multi-indexed APIResources
    private _ApiResourcesIndex: Container<ApiResourceCacheType>;
    private _resourcesIdxGVK: ReadonlyMap<string, ApiResourceCacheType>;
    private _resourcesIdxGroup: ReadonlyMap<string, ReadonlySet<ApiResourceCacheType>>;
    private _resourcesIdxKind: ReadonlyMap<string, ReadonlySet<ApiResourceCacheType>>;
    private _resourcesIdxResource: ReadonlyMap<string, ReadonlySet<ApiResourceCacheType>>;

    constructor(client: K8sClient) {
        this._k8sClient = client;

        this._groupVersionsSet = new Set<string>();
        this._ApiGroups = new Map<string, APIGroup>();
        this._cachedApiGroupResources = new Map<string, APIResourceList>();

        // set indices on ApiResourceCache
        this._ApiResourcesIndex = new Container<ApiResourceCacheType>();
        this._resourcesIdxGVK = uniqueIndex((r: ApiResourceCacheType) => r.gvk, 'by gvk').on(this._ApiResourcesIndex);
        this._resourcesIdxGroup = nonuniqueIndex((r: ApiResourceCacheType) => r.group, 'by group').on(this._ApiResourcesIndex);
        this._resourcesIdxKind = nonuniqueIndex((r: ApiResourceCacheType) => r.kind, 'by kind').on(this._ApiResourcesIndex);
        this._resourcesIdxResource = nonuniqueIndex((r: ApiResourceCacheType) => r.resource, 'by resource').on(this._ApiResourcesIndex);

        this.BuildCache();
    }

    private BuildCache() {
        this.GetApiGroups();
        this.GetApiGroupResources("core", "v1", true);
        this.GetApiGroupResources("apps", "v1", true);
        this.GetApiGroupResources("apiextensions.k8s.io", "v1", true);
        return null;
    }

    public GetResourceNameOfGVK(group: string, version: string, kind: string): string {
        if (this._resourcesIdxGVK?.has(CheckedGVK(group, version, kind))) {
            let resource = this._resourcesIdxGVK.get(CheckedGVK(group, version, kind));
            return resource.resource;
        } else {
            throw new GVKNotCachedError(CheckedGVK(group, version, kind));
        }
    }

    /**
     * Get a specific APIGroupResourcesList from local cache or APIServer.
     *   If the requested GV is not cached, but it exists in the GroupVersion set,
     *   will try to get the resources list from APIServer no matter what value of 'sync' is.
     * @param apiGroup The target APIGroup, like "batch",
     * @param version version of this api group, like "v1",
     * @param sync whether force update cache
     * @constructor
     */
    public async GetApiGroupResources(apiGroup: string, version: string, sync: boolean): Promise<APIResourceList> {
        let that = this;
        if (sync || (!this._cachedApiGroupResources?.has(CheckedGroupVersion(apiGroup, version)) && this.HasGroupVersion(apiGroup, version))) {
            log.info(`Updating cachedApiGroupResources for ${apiGroup}/${version}`)
            // fetch and cache apiGroup Resources
            let result = await this._k8sClient.requestOnce(ApiGroupVersionToUrl(apiGroup, version))
            let parsedObj = JSON.parse(result.body);
            if (result.status == status.OK && IsApiResourceList(parsedObj)) {
                log.info(`GET ${ApiGroupVersionToUrl(apiGroup, version)} success`)
                let resourceList = parsedObj as APIResourceList;
                if (!this._cachedApiGroupResources) {
                    this._cachedApiGroupResources = new Map<string, APIResourceList>();
                }

                // List cache
                this._cachedApiGroupResources.set(CheckedGroupVersion(apiGroup, version), resourceList)
                // Detail cache for complex query
                resourceList.resources.forEach((resource, idx, resources) => {
                    /**
                     *  Check if the resource is a sub-resource.
                     *  This may happen when an ApiResource defined sub-resource which references another API resource.
                     *  Just ignore this type of resource because it can be indexed when focusing on its original group.
                     *
                     *  There is an example from /api/v1, "serviceaccounts" has a sub-resource
                     * {
                     *       "name": "serviceaccounts/token",
                     *       "singularName": "",
                     *       "namespaced": true,
                     *       "group": "authentication.k8s.io",
                     *       "version": "v1",
                     *       "kind": "TokenRequest",
                     *       "verbs": [
                     *         "create"
                     *       ]
                     *     }
                     *
                     *  Reference: https://kubernetes.io/docs/reference/using-api/api-concepts/
                     */
                    if (resource.name.includes("/")) {
                        log.debug(`A sub-resource detected: ${resource.name}, ignore.`, `GroupVersion: ${resourceList.groupVersion}`)
                        return;
                    }
                    log.debug(`Indexing resource: GroupVersion: ${resourceList.groupVersion}, Kind: ${resource.kind}, ResourceName: ${resource.name}`)
                    try {
                        that._ApiResourcesIndex.add({
                            group: apiGroup,
                            gvk: `${resourceList.groupVersion}/${resource.kind}`,
                            kind: resource.kind,
                            originalApiResource: resource,
                            resource: resource.name,
                            version: version
                        });
                    } catch (e) {
                        if (e instanceof NonuniqueIndexError) {
                            log.warn("GVK duplicated", e)
                        } else {
                            throw e;
                        }
                    }
                })
            } else {
                log.error(`GET ${ApiGroupVersionToUrl(apiGroup, version)} error`, `:status=${result.status}`, `CheckResponseType IsApiResourceList:${IsApiResourceList(parsedObj)} `)
                log.debug(parsedObj)
                throw new Error("Request API server error")
            }
        }

        return new Promise<APIResourceList>((resolve, reject) => {
            if (this._cachedApiGroupResources.has(CheckedGroupVersion(apiGroup, version))) {
                resolve(this._cachedApiGroupResources.get(CheckedGroupVersion(apiGroup, version)));
            } else {
                log.warn(`Requested GroupVersion not found: ${apiGroup}/${version}`)
                reject(new Error("GroupVersion not found"))
            }
        })
    }

    /**
     * Get all available ApiGroups in the APIServer (that pointed by this._k8sClient)
     *  from local cache or from the APIServer directly.
     * The cache will be updated the first time this method called or the 'update' param is true.
     * TODO: auto update this cache periodically.
     * @param update Whether force update local cache for 'APIGroups' list.
     * @constructor
     */
    public async GetApiGroups(update: boolean = false): Promise<APIGroupList> {
        let that = this;
        return new Promise<APIGroupList>(
            (resolve, reject) => {
                if (update || this._cachedApiGroups?.groups?.length < 2) {
                    this._k8sClient.requestOnce(DefaultUrlPath.ApiGroups)
                        .then((result) => {
                            let parsedObj = JSON.parse(result.body)
                            if (result.status == status.OK && IsApiGroupList(parsedObj)) {
                                let agl = parsedObj as APIGroupList
                                log.info("GET /apis to fetch ApiGroups success", "ApiGroups count: " + agl.groups.length)
                                that._cachedApiGroups = agl
                                agl.groups.forEach((apiGroup, idx, groups) => {
                                    // cache all groupVersions for fast check
                                    apiGroup.versions.forEach((groupVersion, idx, versions) => {
                                        that._groupVersionsSet.add(groupVersion.groupVersion)
                                    })
                                    // cache apiGroup with a map from group name to APIGroup
                                    that._ApiGroups.set(apiGroup.name, apiGroup);
                                })

                                // updated
                                resolve(this._cachedApiGroups);
                            } else {
                                log.error("GET /apis error", ":status=" + result.status)
                                reject("Failed to GET /apis")
                            }
                        })
                        .catch((err) => {
                            log.error("An error occurred while requesting /apis for fetching ApiGroups", err);
                            reject(err)
                        })
                } else {
                    log.info("Cached ApiGroups provided without sync")
                    resolve(this._cachedApiGroups);
                }
            }
        )
    }

    public HasGroupVersion(group: string, version: string): boolean {
        return this._groupVersionsSet.has(`${group}/${version}`);
    }
}
