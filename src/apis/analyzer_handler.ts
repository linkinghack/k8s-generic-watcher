import { IstioVirtualServiceAnalyzer } from "../analyzer/istio_virtualservice_analyzer";
import logger from "../logger";
import { GenericApiResponse } from "../types";

import { inject, singleton } from "tsyringe";
import express from 'express'
import httpStatus from "http-status";


const log = logger.getChildLogger({ name: "AnalyzerAPIHandler" });

@singleton()
export class AnalyzerAPIHandler {
    private _istioVSAnalyzer: IstioVirtualServiceAnalyzer

    constructor(
        @inject(IstioVirtualServiceAnalyzer) istioVSAnalyzer: IstioVirtualServiceAnalyzer) {
        this._istioVSAnalyzer = istioVSAnalyzer;
    }

    /**
     * GET <parent-path>/istioGatewayHosts?ns=default
     * @param req 
     *  @QueryParameters ns : optional namespace to filter the Gateways
     * @param resp 
     *  {
     *     status: 200,
     *     msg: "",
     *     data: [
     *        {
     *          gatewayName: string,
     *          namespace: string,
     *          serviceHosts: [
     *            {
     *                   "serviceName": "devops-k8s",
     *                   "host": "devops-k8s.zzpod8-pxj42s.4a.cmit.cloud"
     *             }
     *          ]
     *        },
     *        ...
     *     ]
     *  }
     */
    public async GetGatewayHosts(req: express.Request, resp: express.Response) {
        let ns = req.query['ns'] as string
        this._istioVSAnalyzer.GetRegisteredHosts(ns)
            .then((gwhosts) => {
                resp.json(GenericApiResponse.Ok("Gateway hosts fetched", gwhosts))
            })
            .catch(e => {
                resp.json(GenericApiResponse.Result(httpStatus.INTERNAL_SERVER_ERROR, e, null))
            })
    }
}