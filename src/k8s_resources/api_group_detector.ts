import {K8sClient} from "../utils/k8s_client";
import {APIGroup, APIGroupList, APIResourceList, IsApiGroupList, IsApiResourceList} from "./k8s_origin_types";
import logger from "../logger";
import status from "http-status"
import {
    ApiGroupVersionToUrl,
    CheckedGroupVersion,
    CheckedGVK,
    DefaultK8sGroup,
    DefaultUrlPath
} from "../utils/k8s_name_format"
import {Container, nonuniqueIndex, NonuniqueIndexError, uniqueIndex} from "multi-index";
import {ApiResourceCacheType} from "./inner_types";
import {GroupVersionNotFound, GVKNotFoundError} from "../error";
import {inject, singleton} from "tsyringe";

const log = logger.getChildLogger({name: "ApiGroupDetector"});

@singleton()
export class ApiGroupDetector {
    private _k8sClient: K8sClient;

    // original K8s response data
    //   groupVersion -->  APIResourceList
    private _cachedApiGroups: APIGroupList;

    private _cachedApiGroupResources: Map<string, APIResourceList>; // CheckedGroupVersion() --> APIResourceList
    private _ApiGroups: Map<string, APIGroup> // <groupName> --> APIGroup
    private _groupVersionsSet: Set<string>; // cache all the groupVersions in ApiServer

    // multi-indexed APIResources
    private _ApiResourcesIndex: Container<ApiResourceCacheType>;
    private _resourcesIdxGVK: ReadonlyMap<string, ApiResourceCacheType>;
    private _resourcesIdxGroup: ReadonlyMap<string, ReadonlySet<ApiResourceCacheType>>;
    private _resourcesIdxKind: ReadonlyMap<string, ReadonlySet<ApiResourceCacheType>>;
    private _resourcesIdxResource: ReadonlyMap<string, ReadonlySet<ApiResourceCacheType>>;

    // pre-indexing targets
    private _preIndexingGVs: Array<{ group: string, version: string }>;

    constructor(@inject("preIndexingGVs") preIndexingGVs?: Array<{ group: string, version: string }>,
                @inject(K8sClient) client?: K8sClient) {
        this._k8sClient = client;

        this._groupVersionsSet = new Set<string>();
        this._ApiGroups = new Map<string, APIGroup>(); // <group> --> APIGroup
        this._cachedApiGroupResources = new Map<string, APIResourceList>();

        // set indices on ApiResourceCache
        this._ApiResourcesIndex = new Container<ApiResourceCacheType>();
        this._resourcesIdxGVK = uniqueIndex((r: ApiResourceCacheType) => r.gvk, 'by gvk').on(this._ApiResourcesIndex);
        this._resourcesIdxGroup = nonuniqueIndex((r: ApiResourceCacheType) => r.group, 'by group').on(this._ApiResourcesIndex);
        this._resourcesIdxKind = nonuniqueIndex((r: ApiResourceCacheType) => r.kind, 'by kind').on(this._ApiResourcesIndex);
        this._resourcesIdxResource = nonuniqueIndex((r: ApiResourceCacheType) => r.resource, 'by resource').on(this._ApiResourcesIndex);

        if (preIndexingGVs) {
            this._preIndexingGVs = preIndexingGVs;
        } else {
            this._preIndexingGVs = [];
        }
        this.BuildCache();
    }

    private async BuildCache() {
        await this.GetApiGroups(true);

        for (let gv of this._preIndexingGVs) {
            try {
                await this.GetApiGroupResources(gv.group, gv.version, true);
            } catch (e) {
                log.error(`pre-indexing group version fetch failed: ${gv}`, e);
            }
        }

        // default group/versions
        if (!this._resourcesIdxGroup.has(DefaultK8sGroup.Core)) {
            console.log("Groups before BuildCache: ", this._resourcesIdxGroup.keys())
            await this.GetApiGroupResources(DefaultK8sGroup.Core, "v1", true);
        }
        if (!this._resourcesIdxGroup.has(DefaultK8sGroup.Apps)) {
            await this.GetApiGroupResources(DefaultK8sGroup.Apps, "v1", true);
        }
        if (!this._resourcesIdxGroup.has(DefaultK8sGroup.Batch)) {
            await this.GetApiGroupResources(DefaultK8sGroup.Batch, "v1", true);
        }
        if (!this._resourcesIdxGroup.has(DefaultK8sGroup.ApiExtensions)) {
            await this.GetApiGroupResources(DefaultK8sGroup.ApiExtensions, "v1", true);
        }
        console.log("Groups After BuildCache: ", this._resourcesIdxGroup.keys())
    }

    public AddGroupVersionToCache(gv: { group: string, version: string }) {
        this._preIndexingGVs.push(gv);
        this.GetApiGroupResources(gv.group, gv.version, true);
    }

    public async GetResourceNameOfGVK(group: string, version: string, kind: string): Promise<string> {
        return (await this.GetApiResourceDetailOfGVK(group, version, kind)).resource;
    }

    public async GetApiResourceDetailOfGVK(group: string, version: string, kind: string): Promise<ApiResourceCacheType> {
        if (!this._resourcesIdxGVK?.has(CheckedGVK(group, version, kind))) {
            // groupVersion requested for the first time
            log.info("GVK not cached, syncing..");
            await this.GetApiGroupResources(group, version, true);
        }
        if (this._resourcesIdxGVK?.has(CheckedGVK(group, version, kind))) {
            log.info(`GVK founded: ${CheckedGVK(group, version, kind)}`);
            return this._resourcesIdxGVK.get(CheckedGVK(group, version, kind));
        }
        throw new GVKNotFoundError(`${group}/${version}/${kind}`);
    }

    /**
     * Get a specific APIGroupResourcesList from local cache or APIServer.
     *   If the requested GV is not cached, but it exists in the GroupVersion set,
     *   will try to get the resources list from APIServer no matter what value of 'sync' is.
     * @param group The target APIGroup, like "batch",
     * @param version version of this api group, like "v1",
     * @param sync whether force update cache
     */
    public async GetApiGroupResources(group: string, version: string, sync: boolean): Promise<APIResourceList> {
        let that = this;
        if (sync || (!this._cachedApiGroupResources?.has(CheckedGroupVersion(group, version)) && await this.HasGroupVersion(group, version))) {
            log.info(`Updating cached ApiGroupResources for ${group}/${version}`)

            // fetch and cache apiGroup Resources
            let result = await this._k8sClient.requestOnce(ApiGroupVersionToUrl(group, version))
            let parsedObj = JSON.parse(result.body);

            if (result.status == status.OK && IsApiResourceList(parsedObj)) {
                log.info(`GET ${ApiGroupVersionToUrl(group, version)} success`)
                let resourceList = parsedObj as APIResourceList;
                if (!this._cachedApiGroupResources) {
                    this._cachedApiGroupResources = new Map<string, APIResourceList>();
                }

                // List cache
                this._cachedApiGroupResources.set(CheckedGroupVersion(group, version), resourceList)
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
                            group: group,
                            gvk: `${resourceList.groupVersion}/${resource.kind}`,
                            kind: resource.kind,
                            originalApiResource: resource,
                            resource: resource.name,
                            version: version
                        });
                    } catch (e) {
                        if (e instanceof NonuniqueIndexError) {
                            log.warn("GVK duplicated", e.name, e.message)
                        } else {
                            throw e;
                        }
                    }
                })
            } else {
                log.error(`GET ${ApiGroupVersionToUrl(group, version)} error`, `:status=${result.status}`, `CheckResponseType IsApiResourceList:${IsApiResourceList(parsedObj)} `)
                log.debug(parsedObj)
                throw new Error("Request API server error")
            }
        }

        if (this._cachedApiGroupResources.has(CheckedGroupVersion(group, version))) {
            return this._cachedApiGroupResources.get(CheckedGroupVersion(group, version));
        } else {
            log.warn(`Requested GroupVersion not found: ${group}/${version}`)
            throw new GroupVersionNotFound(`${group}/${version}`);
        }
    }

    /**
     * Get all available ApiGroups in the APIServer (that pointed by this._k8sClient)
     *  from local cache or from the APIServer directly.
     * The cache will be updated the first time this method called or the 'update' param is true.
     * Core group will not included.
     * TODO: auto update this cache periodically.
     * @param sync Whether force update local cache for 'APIGroups' list.
     * @constructor
     */
    public async GetApiGroups(sync: boolean = false): Promise<APIGroupList> {
        let that = this;
        if (sync || this._cachedApiGroups?.groups?.length < 2) {
            let result = await this._k8sClient.requestOnce(DefaultUrlPath.ApiGroups)
            let parsedObj = JSON.parse(result.body)
            if (result.status == status.OK && IsApiGroupList(parsedObj)) {
                let agl = parsedObj as APIGroupList
                log.info("GET /apis to fetch ApiGroups success.", "ApiGroups count: " + agl.groups.length)

                that._cachedApiGroups = agl
                agl.groups.forEach((apiGroup, idx, groups) => {
                    // cache all groupVersions for fast check
                    apiGroup.versions.forEach((groupVersion, idx, versions) => {
                        that._groupVersionsSet.add(groupVersion.groupVersion)
                    })
                    // cache apiGroup with a map from group name to APIGroup
                    that._ApiGroups.set(apiGroup.name, apiGroup);
                })
                return agl
            } else {
                log.error("GET /apis error", ":status=" + result.status);
                throw new Error("GET /apis error");
            }
        } else {
            log.info("Cached ApiGroups provided without sync")
            return this._cachedApiGroups;
        }
    }

    public async HasGroupVersion(group: string, version: string): Promise<boolean> {
        if (group == DefaultK8sGroup.Core || group == "") {
            // TODO: whether check version or not?
            return true;
        }
        if (!this._groupVersionsSet.has(`${CheckedGroupVersion(group, version)}`)) {
            // force sync
            await this.GetApiGroups(true);
        }
        return this._groupVersionsSet.has(`${CheckedGroupVersion(group, version)}`);
    }
}
