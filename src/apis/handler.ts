import {inject, injectable, singleton} from "tsyringe";
import {WatchersMap} from "../watcher/watchers_map";
import express from "express";
import logger from "../logger";
import {WatcherApiResponse} from "../types";
import HttpStatus from "http-status";
import {ApiGroupDetector} from "../k8s_resources/api_group_detector";

const log = logger.getChildLogger({name: "Handler"});

@singleton()
export class Handler {
    private _watcherMap: WatchersMap
    private _apiGroupDetector: ApiGroupDetector

    constructor(@inject(WatchersMap) watchersMap: WatchersMap,
                @inject(ApiGroupDetector) apiGroupDetector: ApiGroupDetector) {
        this._watcherMap = watchersMap;
        this._apiGroupDetector = apiGroupDetector;

    }

    /**
     * GET <parent-path>/k8sObjects
     * @param req
     *   @QueryParameters:
     *      group: API group of the requesting resource.  Like 'core', 'apps', 'networking.k8s.io'
     *      version: API group version of the requesting resource.  Like 'v1', 'v1beta1'
     *      kind: Resource kind.  Like 'Pod', 'Deploy'
     *      name: (optional) Filter the resource name
     *      namespace: (optional) Filter namespace the resources belonging to.
     * @param resp
     */
    public async QueryResource(req: express.Request, resp: express.Response) {
        let that = this;
        let group: string = req.query['group'] as string;
        let version: string = req.query['version'] as string;
        let kind: string = req.query['kind'] as string;
        if (!group || !version || !kind) {
            resp.json(WatcherApiResponse.Result(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, 'GVK incomplete in query parameters', {
                group: group,
                version: version,
                kind: kind
            }))
            resp.end();
            return;
        }

        let gvk = {group: group, version: version, kind: kind}

        let watcher = that._watcherMap.GetWatcher(gvk);
        if (!watcher) {
            // GVK requested the first time. Check existence of GVK and create watcher.
            try {
                await that._apiGroupDetector.GetApiResourceDetailOfGVK(group, version, kind)
                await this._watcherMap.AddWatcher(gvk)
                watcher = that._watcherMap.GetWatcher(gvk)
            } catch (e) {
                // GVK not found
                log.warn('Requesting an GVK that does not exist.', e)
                resp.json(WatcherApiResponse.Result(HttpStatus.NOT_FOUND, `GVK not found, possible GVKs in 'data' field. ErrorDetail=${JSON.stringify(e)}`, this._apiGroupDetector.SearchByKind(kind)))
                resp.end();
                return;
            }
        }

        let namespace = req.query['namespace'] as string;
        let name = req.query['name'] as string;
        let uid = req.query['uid'] as string;
        let results = watcher.Query(uid, name, namespace);
        resp.json(WatcherApiResponse.Ok(`${results.length} resource(s) founded`, results))
        resp.end();
    }
}
