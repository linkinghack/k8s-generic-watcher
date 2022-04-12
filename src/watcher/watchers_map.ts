import {K8sApiObjectWatcher, WatcherOptions} from "./k8s_api_resource_watcher";
import {container, singleton} from "tsyringe";
import {GVK} from "../k8s_resources/inner_types";
import {CheckedGVK, CheckedGVKStrForGVKType} from "../utils/k8s_name_format";
import logger from "../logger";
import {K8sClient} from "../utils/k8s_client";
import {ApiGroupDetector} from "../k8s_resources/api_group_detector";

const log = logger.getChildLogger({name: "WatchersMap"});

@singleton()
export class WatchersMap {
    private _watchers: Map<string, K8sApiObjectWatcher>;

    constructor() {
        this._watchers = new Map<string, K8sApiObjectWatcher>();
    }

    public async AddWatcher(gvk: GVK, options?: WatcherOptions): Promise<K8sApiObjectWatcher> {
        if (!this._watchers.has(CheckedGVKStrForGVKType(gvk))) {
            log.info("Creating new resource watcher.", `GVK=${JSON.stringify(gvk)}, options=${JSON.stringify(options)}`);
            let w = new K8sApiObjectWatcher(gvk, options, container.resolve(K8sClient), container.resolve(ApiGroupDetector));
            await w.Start();
            this._watchers.set(CheckedGVK(gvk.group, gvk.version, gvk.kind), w);
            return w;
        } else {
            return this._watchers.get(CheckedGVKStrForGVKType(gvk))
        }
    }

    public GetWatcher(gvk: GVK): K8sApiObjectWatcher {
        return this._watchers.get(CheckedGVK(gvk.group, gvk.version, gvk.kind));
    }
}