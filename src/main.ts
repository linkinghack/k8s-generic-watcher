import 'reflect-metadata';
import {GetConfig, LoadConfig} from "./configs";
import {K8sClientOptions} from "./utils/k8s_client";
import {container} from "tsyringe";

console.log("hello")

// 1. Load config file
LoadConfig();

// 2. inject default configs to tsyringe container.
container.registerInstance("preIndexingGVs", GetConfig().initialWatchingResources)
container.registerInstance(K8sClientOptions, GetConfig().k8sClientConfig);

import RootRouter from "./apis/routes";
import {WebServer} from "./apis/server";
import {WatchersMap} from "./watcher/watchers_map";

// 3. Create watchers for initial watching resources
let watchersMap = container.resolve(WatchersMap);
GetConfig().initialWatchingResources.forEach((gvk) => {
    watchersMap.AddWatcher(gvk)
})

// 4. start web server
let server = new WebServer( {listenPort: 3000})
server.RegisterRouter('/', RootRouter)
server.Serve()
