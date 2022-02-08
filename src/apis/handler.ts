import {inject, singleton} from "tsyringe";
import {WatchersMap} from "../watcher/watchers_map";
import express from "express";
import logger from "../logger";
import {K8sObjectsQueryParams, WatcherApiResponse} from "../types";
import HttpStatus from "http-status";
import {ApiGroupDetector} from "../k8s_resources/api_group_detector";
import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import {ArrayToMap, K8sApiObjectsIntersect} from "../utils/util"
import {GVKNotFoundError} from "../error";

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

    private async query(group: string, version: string, kind: string, name?: string, namespace?: string, uid?: string,
                        fieldMatches?: Map<string, any>, labelSelectors?: Map<string, string>, annotationMatches?: Map<string, string>): Promise<K8sApiObject[]> {
        let that = this;
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
                throw new GVKNotFoundError(`GVK=${group}/${version}/${kind} message=${e.message}`)
            }
        }

        let results = [];
        let results1 = watcher.Query(uid, name, namespace, fieldMatches);
        let results2 = null;
        // If uid or (name + namespace) specified, ignore other selectors
        if (!uid && !(name && namespace) && (labelSelectors || annotationMatches)) {
            results2 = watcher.QueryByLabelAnnotation(labelSelectors, annotationMatches, namespace);
        }

        log.debug(`results1 length = ${results1?.length}`, `results2 length = ${results2?.length}`)
        if (results1?.length < 1 && results2?.length < 1) {
            return results;
        }

        results = K8sApiObjectsIntersect(results1, results2);
        log.debug(`results length = ${results?.length}`)
        return results
    }

    /**
     * GET <parent-path>/k8sObjects
     * POST <parent-path>/k8sObjects
     *
     * Notes:
     *  If both 'name' and 'namespace' are specified or uid is specified, label/annotation selectors and fieldMatches will be ignored.
     *  Preference to parameters in request body.
     * @param req
     *   @QueryParameters:
     *      group: API group of the requesting resource.  Like 'core', 'apps', 'networking.k8s.io'
     *      version: API group version of the requesting resource.  Like 'v1', 'v1beta1'
     *      kind: Resource kind.  Like 'Pod', 'Deploy'
     *      name: (optional) Filter the resource name
     *      namespace: (optional) Filter namespace the resources belonging to.
     *   @JsonBodyParameters
     *      {
     *          group: "watcher.k8s",
     *          version: "v1beta1",
     *          kind: "Watcher",
     *          name: "", // optionally specify resource object name
     *          namespace: "", // optionally specify filtered namespace
     *          labelSelectors: ["key1", "value1, "key2", "value2", ...], // optionally set label selector
     *          annotationSelectors: ["key1", "value1", "key2", "value2", ...] // optionally set annotation selector
     *          fieldMatches: [".spec.owner", 'operator', 'field.expression', anyValue], // optionally set field matches
     *          dedicatedIndex: false(default)  //  whether create dedicated index for this query
     *      }
     * @param resp
     *      {
     *          status: 200,
     *          msg: "",
     *          data: {}
     *      }
     */
    public async QueryResource(req: express.Request, resp: express.Response) {
        let that = this;
        let group: string = req.query['group'] as string;
        let version: string = req.query['version'] as string;
        let kind: string = req.query['kind'] as string;
        let name: string = req.query['name'] as string;
        let namespace: string = req.query['namespace'] as string;
        let uid: string = req.query['uid'] as string;
        let labelSelectors: Map<string, string>;
        let annotationSelectors: Map<string, string>;
        let fieldMatches: Map<string, any>

        let bodyParams: K8sObjectsQueryParams
        if (req.method == 'POST') {
            log.debug(`Request body`, req.body)
            bodyParams = req.body as K8sObjectsQueryParams;

            if (bodyParams?.group) {
                group = bodyParams?.group;
            }
            if (bodyParams?.version) {
                version = bodyParams?.version;
            }
            if (bodyParams?.kind) {
                kind = bodyParams?.kind;
            }
            if (bodyParams?.name) {
                name = bodyParams?.name;
            }
            if (bodyParams?.namespace) {
                namespace = bodyParams?.namespace;
            }
            if (bodyParams?.uid) {
                uid = bodyParams?.uid;
            }

            fieldMatches = ArrayToMap(bodyParams.fieldMatches);
            labelSelectors = ArrayToMap(bodyParams.labelSelectors);
            annotationSelectors = ArrayToMap(bodyParams.annotationSelectors);
        }

        if (!group || !version || !kind) {
            resp.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            resp.json(WatcherApiResponse.Result(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, 'illegal GVK in query parameters', {
                group: group,
                version: version,
                kind: kind
            }))
            resp.end();
            return;
        }

        try {
            let results = await that.query(group, version, kind, name, namespace, uid, fieldMatches, labelSelectors, annotationSelectors)
            resp.status(HttpStatus.OK)
            resp.json(WatcherApiResponse.Ok(`${results?.length} resource(s) founded`, results))
            resp.end();
        } catch (e) {
            if (e instanceof GVKNotFoundError) {
                resp.status(HttpStatus.NOT_FOUND)
                resp.json(WatcherApiResponse.Result(HttpStatus.NOT_FOUND, `GVK not found, possible GVKs in 'data' field. ErrorDetail=${JSON.stringify(e)}`, this._apiGroupDetector.SearchByKind(kind)))
                resp.end();
            } else {
                log.error(`query process error`, e)
                resp.status(HttpStatus.INTERNAL_SERVER_ERROR)
                resp.json(WatcherApiResponse.Result(HttpStatus.INTERNAL_SERVER_ERROR, e.message, e))
                resp.end()
            }
        }
    }

}
