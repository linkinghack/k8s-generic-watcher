import {K8sClient} from "../watcher/k8s_client";
import {APIGroupList, APIResource, APIResourceList, IsApiGroupList, IsApiResourceList} from "./k8s_origin_types";
import logger from "../logger";
import status from "http-status"

export enum DefaultK8sGroup {
    Core = "core",
    Apps = "apps",
}

const DefaultUrlPath = {
    Core: "/api",
    Apps: "/apis/apps",
    ApiGroups: "/apis"
}

const log = logger.getChildLogger({name: "ApiGroupDetector"});

export class ApiGroupDetector {
    private _k8sClient: K8sClient;
    private _cachedApiGroupResources: Map<string, APIResourceList>;
    private _cachedApiGroups: APIGroupList;

    constructor(client: K8sClient) {
        this._k8sClient = client;
    }

    /**
     * Get a specific APIGroupResourcesList form local cache or APIServer.
     * @param apiGroup The target APIGroup, like "batch",
     * @constructor
     */
    public async GetApiGroupResources(apiGroup: string): Promise<Array<APIResource>> {
        return new Promise((resolve, reject) => {
            if (this._cachedApiGroupResources.has(apiGroup)) {

            }
        })
    }

    /**
     * Get all available ApiGroups in the APIServer (that pointed by this._k8sClient)
     *  from local cache or from the APIServer directly.
     * The cache will be updated the first time this method called or the 'update' param is true.
     * @param update Whether force update local cache for 'APIGroups' list.
     * @constructor
     */
    public async GetApiGroups(update: boolean = false): Promise<APIGroupList> {
        return new Promise<APIGroupList>(
            (resolve, reject) => {
                if (update || this._cachedApiGroups?.groups?.length < 2) {
                    this._k8sClient.requestOnce(DefaultUrlPath.ApiGroups)
                        .then((result) => {
                            let parsedObj = JSON.parse(result.body)
                            if (result.status == status.OK && IsApiGroupList(parsedObj)) {
                                let agl = parsedObj as APIGroupList
                                this._cachedApiGroups = agl
                                log.info("GET /apis to fetch ApiGroups success", "ApiGroups count: " + agl.groups.length)

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
                    resolve(this._cachedApiGroups);
                }
            }
        )
    }
}

export function ApiGroupToUrl(group: string, version: string): string {

    return ""
}