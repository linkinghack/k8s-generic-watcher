import EventEmitter from "node:events";
import {GVK} from "../k8s_resources/inner_types";
import {K8sClient} from "../utils/k8s_client";

export enum WatchEvent {
    ADD = "add",
    UPDATE = "update",
    CHANGE = "change",
    DELETE = "delete"
}

/**
 * CacheInformer stores a series of objects of a specific GVK
 * and create indices with field selector and label selector.
 *
 * There are some default indices: [.metadata.name
 */
export class CacheInformer extends EventEmitter {
    gvk: GVK;

    static Events = {

    }
}


export class InformersMap {

}