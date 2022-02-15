import 'reflect-metadata';
import {GetConfig, LoadConfig} from "./configs";
import {K8sClientOptions} from "./utils/k8s_client";
import {container} from "tsyringe";
import RootRouter from "./apis/routes";
import {WebServer} from "./apis/server";
import {WatchersMap} from "./watcher/watchers_map";
import {WebHookNotifier} from "./notifier/webhook_notifier";

// 1. Load config file
LoadConfig();

// 2. inject default configs into tsyringe container.
container.registerInstance("preIndexingGVs", GetConfig().initialWatchingResources)
container.registerInstance(K8sClientOptions, GetConfig().k8sClientConfig);

// 3. Create watchers for initial watching resources
let watchersMap = container.resolve(WatchersMap);
let globalNotifiers: WebHookNotifier[] = [];
GetConfig().globalWebhookUrls?.forEach((url) => globalNotifiers.push(new WebHookNotifier(url)))
GetConfig().initialWatchingResources.forEach((gvk) => {
    let w = watchersMap.AddWatcher(gvk, gvk.watchOptions)
    w.then((watcher) => {
        // Register webhook notifiers for every specific GVK (if configured).
        if (gvk.notifiers?.length > 0) {
            gvk.notifiers.forEach((notifier) => {
                notifier.webhookUrls?.forEach((url) => {
                    watcher.RegisterNotifier(new WebHookNotifier(url, notifier.eventTypes, notifier.filter))
                })
            })
        }
        // Register global webhook notifiers (that receive all events of all initial watching GVKs)
        if (globalNotifiers?.length > 0) {
            globalNotifiers.forEach(notifier => watcher.RegisterNotifier(notifier))
        }
    })
})

// 4. start web server
let server = new WebServer({listenPort: GetConfig().listenPort || 3000})
server.RegisterRouter('/', RootRouter)
server.Serve()
