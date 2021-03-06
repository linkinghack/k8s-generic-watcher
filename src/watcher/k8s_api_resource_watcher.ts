import {K8sClient} from "../utils/k8s_client";
import {
    ApiResourceCacheType,
    GVK,
    K8sApiQueryParameterNames,
    K8sApiQueryParamValues
} from "../k8s_resources/inner_types";
import {K8sApiObject, K8sApiObjectList, WatchEvent} from "../k8s_resources/k8s_origin_types";
import {EventEmitter} from "stream";
import {ApiGroupDetector} from "../k8s_resources/api_group_detector";
import {CacheInformer, InformerEvent} from "../cache/cache_informer";
import {inject, injectable} from "tsyringe";
import {CheckedGVKStrForGVKType, GVRUrl} from "../utils/k8s_name_format";
import HttpStatus from "http-status";
import byline = require('byline');
import logger from "../logger";
import * as http2 from "http2";
import {WatcherEventNotifier} from "../notifier/notifier_iface";
import {constants} from "http2";
import {Response} from "node-fetch";

const log = logger.getChildLogger({name: "K8sApiObjectWatcher"});

export interface WatcherOptions {
    // The namespace to watch.
    // For non-namespaced resource, this is ignored.
    // For namespaced resources, specify the focused namespace. If empty, watch this GVK in all namespaces
    namespace?: string;
    // Filter by resource name. In this case, only one specific API resource will be watched.
    name?: string;
    // fieldSelector and labelSelector will be added to the request to apiServer, so that cached objects just obey these filters.
    fieldSelector?: Map<string, string>;
    labelSelector?: Map<string, string>;
    // Usually empty. Specify additional query parameters to the request to apiServer.
    additionalK8sApiQueryParams?: Object;
}

const WatchRequestParams = new Map<string, string>([
    [K8sApiQueryParameterNames.watch, K8sApiQueryParamValues.WatchEnabled],
    [K8sApiQueryParameterNames.timeoutSeconds, "0"]]);

/**
 * K8sApiObjectWatcher is a generic watcher for K8s API objects.
 * It supports watching for events on an arbitrary API object including CustomerResources.
 * Just provide a GVK (GroupVersionKind) to watch.
 */
@injectable()
export class K8sApiObjectWatcher extends EventEmitter {
    private _options: WatcherOptions;
    private readonly _gvk: GVK;
    private readonly _httpParams: Map<string, string>;

    private _h2Session: http2.ClientHttp2Stream;
    private _h1Response: Response;

    private _k8sClient: K8sClient;
    private _apiGroupDetector: ApiGroupDetector;
    private _cacheInformer: CacheInformer;
    private _watcherStringBuf: String;

    private _resourceDetail: ApiResourceCacheType;
    private _resourceUrl: string; // calculated apiServer url path to fetch current focusing GVK.
    private _startVersion: string; // resourceVersion of the List request before start to watch.
    private _started: boolean = false;
    private _stopped: boolean = false;

    constructor(gvk: GVK,
                options?: WatcherOptions,
                @inject(K8sClient) k8sClient?: K8sClient,
                @inject(ApiGroupDetector) apiGroupDetector?: ApiGroupDetector) {
        super();
        this._k8sClient = k8sClient;
        this._apiGroupDetector = apiGroupDetector;
        this._gvk = gvk;
        this._options = options;
        this._httpParams = new Map<string, string>();
        if (this._options?.additionalK8sApiQueryParams) {
            for (let key of Object.keys(this._options?.additionalK8sApiQueryParams)) {
                this._httpParams.set(key, this._options?.additionalK8sApiQueryParams[key]);
            }
        }

        // initialize a CacheInformer instance to cache this kind of GVK
        this._cacheInformer = new CacheInformer(gvk);
    }

    public RegisterNotifier(notifier?: WatcherEventNotifier) {
        if (notifier.SubscribingEvent(InformerEvent.ADDED)) {
            this._cacheInformer.OnAdded(notifier.NotifyObjectAdd.bind(notifier));
        }
        if (notifier.SubscribingEvent(InformerEvent.MODIFIED)) {
            this._cacheInformer.OnModified(notifier.NotifyObjectModify.bind(notifier));
        }
        if (notifier.SubscribingEvent(InformerEvent.DELETED)) {
            this._cacheInformer.OnDeleted(notifier.NotifyObjectDelete.bind(notifier));
        }
    }

    /**
     * List and cache target GVK object and start to watch.
     *  Error should be cached by caller.
     */
    public async Start() {
        let that = this;
        // 0. get APIResource metadata verify existence of this APIResource, check resource type whether it is namespaced
        //   If GVK not found, throws the internal error
        this._resourceDetail = await this._apiGroupDetector.GetApiResourceDetailOfGVK(this._gvk.group, this._gvk.version, this._gvk.kind)

        // 1. find out GVR of specified GVK
        // construct the url and request based on parameters (namespace, fieldSelector, labelSelector)
        this._resourceUrl = K8sApiObjectWatcher.applyHttpUrlParameters(GVRUrl(this._resourceDetail, this._options?.namespace), this._httpParams)

        // 2. list and get resourceVersion
        let listResult = await this._k8sClient.requestOnce(this._resourceUrl, constants.HTTP2_METHOD_GET)
        if (listResult.status != HttpStatus.OK) {
            log.error(`List target Objects failed`, `currentGVK=${this._gvk}`, `h2Status=${listResult.status}`, `h2Headers=${listResult.headers}`);
            log.debug(`H2 error response body: ${listResult.body}`);
            throw new Error("List API objects error");
        }
        let objectList = JSON.parse(listResult.body) as K8sApiObjectList;
        log.debug(`Parsed objects list of GVK:${JSON.stringify(this._gvk)}`, `List metadata=${JSON.stringify(objectList.metadata)}`);
        this._startVersion = objectList.metadata.resourceVersion;
        this._cacheInformer.AddObjects(true, ...objectList.items)

        // 3. watch changes starting from 'resourceVersion'
        if (this._k8sClient.Http2Enabled()) {
            this._h2Session = await this._k8sClient.requestWithHttp2Client(K8sApiObjectWatcher.applyHttpUrlParameters(this._resourceUrl,
                WatchRequestParams,
                new Map<string, string>([[K8sApiQueryParameterNames.resourceVersion, this._startVersion]])))
            this._h2Session.on('close', ()=> {
                if (!that._stopped) {
                    that.ReSync()
                }
            })
        } else {
            log.info(`Watcher Start(): creating http1 connection with ApiServer for : ${CheckedGVKStrForGVKType(this._gvk)}`)
            this._h1Response = await this._k8sClient.requestWithHttp1Client(K8sApiObjectWatcher.applyHttpUrlParameters(this._resourceUrl,
                WatchRequestParams,
                new Map<string, string>([[K8sApiQueryParameterNames.resourceVersion, this._startVersion]])), 'GET')

            log.debug(`Watcher Start()  ${CheckedGVKStrForGVKType(this._gvk)}: response: ${this._h1Response.status}`)
            if (!this._h1Response.ok) {
                throw new Error(`Http1 watch response status not OK. ${this._h1Response.status}`)
            }

            let restartFunc = (err) => {
                log.info(`Watcher HTTP1 connection closed: ${CheckedGVKStrForGVKType(that._gvk)}`, err)
                if (!that._stopped) {
                    that.ReSync()
                }
            }
            this._h1Response.body.on('close', restartFunc)
            this._h1Response.body.on('error', restartFunc)
        }

        this.readEvents();  // continuously read watch events

        this._started = true;
        this._stopped = false;
    }

    public Stop() {
        this._stopped = true;
        this._h2Session.close();
    }

    public ReSync() {
        log.info(`Watcher re-syncing: ${CheckedGVKStrForGVKType(this._gvk)}, watcher Http2: ${this._k8sClient.Http2Enabled()}`)
        this._cacheInformer.Clear()
        this.Stop();
        this.Start().then(() => {
            this.readEvents();
        });
    }

    private async readEvents() {
        let that = this;
        that._watcherStringBuf = String("");

        if (this._k8sClient.Http2Enabled()) {
            this._h2Session.on('response', (headers, flags) => {
                log.debug("Watch response received.", `headers=${JSON.stringify(headers)}`, `flags=${flags}`);
            })

            this._h2Session.on('data', (chunk) => {
                log.debug("Watcher http2 stream message received", `watcher: gvk=${that._gvk.group}/${that._gvk.version}/${that._gvk.kind}`)
                let chunkStr = chunk.toString();
                for (; chunkStr.length > 0;) {
                    let endPos = chunkStr.indexOf("\n", 0);
                    if (endPos < 0) {
                        that._watcherStringBuf += chunkStr;
                        chunkStr = ""; // end this loop
                    } else {
                        that._watcherStringBuf += chunkStr.substring(0, endPos + 1);
                        try {
                            that.analyzeEventObject(that._watcherStringBuf.toString());
                        } catch (e) {
                            // TODO: whether re-list resources?
                            log.error("parse event object error", e)
                        }
                        that._watcherStringBuf = "";
                        chunkStr = chunkStr.substring(endPos + 1);
                    }
                }
            })
        } else {
            log.info(`readEvents(): http1 response readable listener: ${this._h1Response.body.listenerCount("readable")}`)
            let eventsSteram = byline.createStream()
            eventsSteram.on('data', (line) => {

                try {
                    that.analyzeEventObject(line);
                } catch (ignore) {
                    // ignore parse errors
                }
            });
            eventsSteram.on('close', () => {
                log.info(`EventStream for ${CheckedGVKStrForGVKType(that._gvk)} with HTTP1 client closed`)
            })
            this._h1Response.body.pipe(eventsSteram)
        }

        log.info("Watch response listener added.", `GVK=${JSON.stringify(this._gvk)}`, `url=${this._resourceUrl}`)
    }

    private analyzeEventObject(objStr: string) {
        let eventObj = JSON.parse(objStr) as WatchEvent;
        switch (eventObj.type) {
            case InformerEvent.ADDED:
                log.debug("ADDED event received", `group=${this._gvk.group}, version=${this._gvk.version}, kind=${this._gvk.kind}`)
                this._cacheInformer.AddObjects(false, eventObj.object);
                break;
            case InformerEvent.MODIFIED:
                log.debug("MODIFIED event received", `group=${this._gvk.group}, version=${this._gvk.version}, kind=${this._gvk.kind}`)
                this._cacheInformer.ModifyObject(eventObj.object);
                break;
            case InformerEvent.DELETED:
                log.debug("DELETED event received", `group=${this._gvk.group}, version=${this._gvk.version}, kind=${this._gvk.kind}`)
                this._cacheInformer.DeleteObject(eventObj.object);
                break;
            default:
                log.error(`Unknown watch event type: ${eventObj.type}`, `event message head: ${objStr.substring(0, 100)}`);
                log.debug("Unknown watch event object", eventObj);
        }
    }

    /**
     * Append http params after the given url.
     *   If 'url' already have some url parameters, this function will append 'params' to them to update the url.
     * @param url Original url
     * @param paramsArr params to append
     */
    private static applyHttpUrlParameters(url: string, ...paramsArr: Map<string, string>[]): string {
        if (url.endsWith("/")) {
            url = url.substring(0, url.length - 1)
        }

        for (let params of paramsArr) {
            let firstTime = true;
            for (let param of params) {
                if (firstTime && url.includes("?")) {
                    url += `&${param[0]}=${param[1]}`;
                } else {
                    url += `?${param[0]}=${param[1]}`;
                }
                firstTime = false;
            }
        }
        return url;
    }

    /**
     * Wrap query functions of cacheInformer
     */
    // List all objects of the GVK this watcher instance is watching
    public List(): K8sApiObject[] {
        return this._cacheInformer.SearchObjects();
    }

    public Query(uid?: string, name?: string, namespace?: string, fieldMatches?: Map<string, any>): K8sApiObject[] {
        return this._cacheInformer.SearchObjects(uid, name, namespace, fieldMatches);
    }

    public QueryByLabelAnnotation(labelSelectors?: Map<string, string>, annotations?: Map<string, string>, namespace?: string): K8sApiObject[] {
        return this._cacheInformer.SearchObjectsByLabelSelector(labelSelectors, annotations, namespace);
    }

    public CachedObjectsCount(): number {
        return this._cacheInformer.CacheSize()
    }
}