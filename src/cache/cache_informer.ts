import EventEmitter from "node:events";

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
export class Cache_informer extends EventEmitter {


    test() {

    }
}


export class InformersMap {

}