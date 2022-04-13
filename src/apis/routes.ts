import express from "express";
import path from "path";
import {container} from "tsyringe";
import { AnalyzerAPIHandler } from "./analyzer_handler";
import {WatcherAPIHandler} from "./watcher_handler";

let QueryRouter = express.Router();
let ManageRouter = express.Router();
let AnalyzerRouter = express.Router();
let DashboardRouter = express.Router();
let RootRouter = express.Router();

let watcherHandler = container.resolve(WatcherAPIHandler)
let analyzerHandler = container.resolve(AnalyzerAPIHandler)

/**
 * Root router
 */
RootRouter.use('/manage', ManageRouter)
RootRouter.use('/resources', QueryRouter)
RootRouter.use('/dashboard', DashboardRouter)
RootRouter.use('/analyze', AnalyzerRouter)
RootRouter.get('/', (req, resp) => {
    console.log(req.headers)
    console.log(req.query)
    resp.send("Hello, this is Watcher Server")
    resp.end();
})

/**
 * Query router routes requests for querying K8s api objects
 */
QueryRouter.get('/k8sObjects', watcherHandler.QueryResource.bind(watcherHandler))
QueryRouter.post('/k8sObjects', watcherHandler.QueryResource.bind(watcherHandler))
QueryRouter.get('/apiGroups', watcherHandler.GetApiGroups.bind(watcherHandler))
QueryRouter.get('/apiGroupResources', watcherHandler.GetApiApiGroupResources.bind(watcherHandler))

/**
 * Analyzer router routes request for K8s objects relations analyzing results
 */
AnalyzerRouter.get('/istioGatewayHosts', analyzerHandler.GetGatewayHosts.bind(analyzerHandler))

/**
 * Manager router routes requests for managing watchers
 */
ManageRouter.get("/cacheSize", watcherHandler.GetCachedObjectsCount.bind(watcherHandler))
ManageRouter.get('/cachedResourcesList', watcherHandler.GetAllCachedResources.bind(watcherHandler))

/**
 * Dashboard router routes request for GUI dashboard.
 * TODO
 */
DashboardRouter.use('/static', express.static(path.join(__dirname, 'static')))

export default RootRouter
