import {WatcherEventNotificationMessage, WatcherEventNotifier} from "./notifier_iface";
import {InformerEvent} from "../cache/cache_informer";
import {CheckedGVK, SplitGVK} from "../utils/k8s_name_format";
import logger from "../logger";
import {K8sObjectsQueryParams} from "types";
import {MatchK8sObject} from "../utils/util";
import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import fetch from "node-fetch";

const log = logger.getChildLogger({name: "WebHookNotifier"});

/**
 * WebHookNotifier implements WatcherEventNotifier with HTTP webhook.
 * It notifies other components with an HTTP request when a subscribed event happened.
 */
export class WebHookNotifier implements WatcherEventNotifier {
    private readonly _webhookUrl: string;
    private readonly _filterParam: K8sObjectsQueryParams;
    private _subscribedEventTypes: Set<string>;

    constructor(webhookUrl: string, subscribedEventTypes?: string[], filterParam?: K8sObjectsQueryParams) {
        this._webhookUrl = webhookUrl;
        this._filterParam = filterParam;
        let that = this;
        that._subscribedEventTypes = new Set<string>();
        if (subscribedEventTypes?.length > 0) {
            subscribedEventTypes.forEach((value) => {
                switch (value) {
                    case InformerEvent.ADDED:
                        that._subscribedEventTypes.add(InformerEvent.ADDED);
                        break;
                    case InformerEvent.MODIFIED:
                        that._subscribedEventTypes.add(InformerEvent.MODIFIED);
                        break;
                    case InformerEvent.DELETED:
                        that._subscribedEventTypes.add(InformerEvent.DELETED);
                        break;
                    default:
                        log.warn(`Unrecognized event to subscribe: ${value}`);
                }
            })
        }

        // Subscribe all types of event by default.
        if (this._subscribedEventTypes.size < 1) {
            this._subscribedEventTypes.add(InformerEvent.ADDED)
            this._subscribedEventTypes.add(InformerEvent.MODIFIED)
            this._subscribedEventTypes.add(InformerEvent.DELETED)
        }
    }

    private async notify(type: string, ...objs: K8sApiObject[]) {
        if (!this._subscribedEventTypes.has(type)) {
            log.debug(`Ignore event: ${type}`, `webhook url=${this._webhookUrl}`)
            return
        }

        let notification: WatcherEventNotificationMessage = {
            additionalData: {},
            eventObjects: [],
            eventType: "",
            gvk: "",
            group: "",
            kind: "",
            version: "",
            message: "",
        };

        switch (type) {
            case InformerEvent.ADDED:
            case InformerEvent.DELETED:
                notification.eventType = type;
                if (objs?.length < 1) {
                    log.error(`WebhookNotifier: ${type} event: no object to notify.`, `url=${this._webhookUrl}`)
                    return
                }
                let targetObj = objs[0] as K8sApiObject;
                if (this._filterParam && !MatchK8sObject(targetObj, this._filterParam)) {
                    log.debug(`WebhookNotifier: ${type} event object filter does not match.`, `gvk=${targetObj.apiVersion}/${targetObj.kind} objName=${targetObj?.metadata?.name}, objNamespace=${targetObj?.metadata?.namespace}`)
                    return
                }
                notification.eventObjects = [targetObj]
                break;
            case InformerEvent.MODIFIED:
                if (objs?.length < 2) {
                    log.error(`WebhookNotifier: ${type} event: objects does not satisfiable.`, `url=${this._webhookUrl}`, `obj count=${objs?.length}`)
                    return
                }
                if (this._filterParam && !MatchK8sObject(objs[1] as K8sApiObject, this._filterParam))
                    notification.eventType = type;
                notification.eventObjects = [objs[0], objs[1]] // old, new
                break;
            default:
                log.warn(`WebhookNotifier: Unrecognized event type: ${type}.`, `url=${this._webhookUrl}`)
                return
        }
        let gvk = `${objs[0]?.apiVersion}/${objs[0]?.kind}`
        let splittedGvk = SplitGVK(gvk)
        notification.gvk = gvk;
        notification.group = splittedGvk?.group;
        notification.version = splittedGvk?.version;
        notification.kind = splittedGvk?.kind;
        let resp = await fetch(this._webhookUrl, {
            body: JSON.stringify(notification),
            headers: { 'Content-Type': 'application-json'},
            method: 'POST',

        })
        log.info('Webhook notification request have sent.', `url=${this._webhookUrl}, gvk=${gvk}`, `response-status=${resp.status}`)
        log.debug(`url=${this._webhookUrl}, gvk=${gvk}` ,`responseBody=${await resp.text()}`)
    }

    public SubscribingEvent(type: string): boolean {
        return this._subscribedEventTypes.has(type);
    }

    public async NotifyObjectAdd(obj: any) {
        await this.notify(InformerEvent.ADDED, obj);
    }

    public async NotifyObjectDelete(obj: any) {
        await this.notify(InformerEvent.DELETED, obj);
    }

    public async NotifyObjectModify(oldObj: any, newObj: any) {
        await this.notify(InformerEvent.MODIFIED, oldObj, newObj)
    }
}
