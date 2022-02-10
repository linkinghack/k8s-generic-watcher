import express from "express";
import path from "path";
import {container} from "tsyringe";
import {Handler} from "./handler";

let QueryRouter = express.Router();
let ManageRouter = express.Router();
let DashboardRouter = express.Router();
let RootRouter = express.Router();

let handler = container.resolve(Handler)

/**
 * Root router
 */
RootRouter.use('/manage', ManageRouter)
RootRouter.use('/resources', QueryRouter)
RootRouter.use('/dashboard', DashboardRouter)
RootRouter.get('/', (req, resp) => {
    console.log(req.headers)
    console.log(req.query)
    resp.send("Hello, this is Watcher Server")
    resp.end();
})

/**
 * Query router routes requests for querying K8s api objects
 */
QueryRouter.get('/k8sObjects', handler.QueryResource.bind(handler))
QueryRouter.post('/k8sObjects', handler.QueryResource.bind(handler))
QueryRouter.get('/apiGroups', handler.GetApiGroups.bind(handler))
QueryRouter.get('/apiGroupResources', handler.GetApiApiGroupResources.bind(handler))
QueryRouter.get('/cachedResourcesList', handler.GetAllCachedResources.bind(handler))

/**
 * Manager router routes requests for managing watchers
 */


/**
 * Dashboard router routes request for GUI dashboard.
 * TODO
 */
DashboardRouter.use('/static', express.static(path.join(__dirname, 'static')))

export default RootRouter