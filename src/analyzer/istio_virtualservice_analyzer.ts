import logger from "../logger";
import { inject, singleton } from "tsyringe";
import { ApiGroupDetector } from "../k8s_resources/api_group_detector"
import { WatchersMap } from "../watcher/watchers_map"
import { GVK } from "../k8s_resources/inner_types";
import { VirtualService } from "../k8s_resources/istio_types/virtual_service";
import { GVKNotFoundError } from "../error";
import { IstioGateway } from "../k8s_resources/istio_types/gateway";

const log = logger.getChildLogger({name: "IstioVirtualServiceAnalyzer"});

// TODO: support 'GK' based searching
const IstioVSGVK = {
    group: "networking.istio.io",
    version: "v1beta1",
    kind: "VirtualService"
} as GVK

const IstioGatewayGVK = {
    group: "networking.istio.io",
    version: "v1beta1",
    kind: "Gateway"
} as GVK

export interface GatewayHosts {
    gatewayName: string,
    namespace: string,
    serviceHosts: {
        serviceName: string,
        serviceLabels: {},
        host: string
    }[]
}

@singleton()
export class IstioVirtualServiceAnalyzer {
    private _watcherMap: WatchersMap

    constructor(@inject(WatchersMap) watchersMap: WatchersMap,
                @inject(ApiGroupDetector) apiGroupDetector: ApiGroupDetector) {
        this._watcherMap = watchersMap;
    }

    /**
     * Get VirtualServices in the cluster.
     *  [redundant] Watcher API implemented
     * @param namespace optionally specify the namespace searching from
     */
    public async GetVirtualServices(namespace?: string): Promise<Array<VirtualService>> {
        let vsWatcher = this._watcherMap.GetWatcher(IstioVSGVK)
        if (!vsWatcher) {
            try {
                await this._watcherMap.AddWatcher(IstioVSGVK)
                vsWatcher = this._watcherMap.GetWatcher(IstioVSGVK)
            } catch(e) {
                if (e instanceof GVKNotFoundError) {
                    log.warn(`VirtualService CRD not found in this cluster.`)
                    return []
                }
                throw e
            }
        }

        return vsWatcher.Query(null, null, namespace, null) as VirtualService[]
    }

    /**
     * Get hosts that registered within Istio VirtualService and Gateway
     * @param namespace optionally specify the namespace searching from
     */
    public async GetRegisteredHosts(namespace?: string): Promise<GatewayHosts[]> {
        let gwWatcher = this._watcherMap.GetWatcher(IstioGatewayGVK)
        let vsWatcher = this._watcherMap.GetWatcher(IstioVSGVK)
        // Guarantee Istio VirtualService and Gateway have been cached
        try {
            if (!gwWatcher) {
                await this._watcherMap.AddWatcher(IstioGatewayGVK)
                gwWatcher = this._watcherMap.GetWatcher(IstioGatewayGVK)
            }

            if (!vsWatcher) {
                await this._watcherMap.AddWatcher(IstioVSGVK)
                vsWatcher = this._watcherMap.GetWatcher(IstioVSGVK)
            }
        } catch(e) {
            if (e instanceof GVKNotFoundError) {
                log.warn(`VirtualService or Gateway CRD not found in this cluster.`)
            }
            log.error(`Unknown error occurred while add watcher for Istio gateway and virtualservice`, e?.message)
            throw e
        }
        
        let gateways = gwWatcher.Query(null, null, namespace, null) as IstioGateway[]
        let vss = vsWatcher.Query(null, null, namespace, null) as VirtualService[]

        let result: Array<GatewayHosts> = []
        let tmpGw: {[index: string]: {hosts: string[], gwHosts: GatewayHosts}} = {} // namespace/name of Gateway --> Gatway Object and temporary hosts list
        
        // Cache gateway names
        gateways.forEach((gw) => {
            log.debug(`gateway: name=${gw.metadata.name}`)
            let hosts: string[] = []
            gw.spec.servers.forEach((s) => {
                log.debug(`Server: name=${s.name}, port=${s.port.number}, hosts=${s.hosts}`)
                s.hosts.forEach((hostStr) => {
                    hosts.push(hostStr)
                })
            })
            tmpGw[`${gw.metadata.namespace}/${gw.metadata.name}`] = {hosts: hosts, gwHosts: {namespace: gw.metadata.namespace, gatewayName: gw.metadata.name, serviceHosts: []} as GatewayHosts}
        })

        // Analyze relations between VirtualServices and Gateways
        vss.forEach(vs => {
            vs.spec.hosts.forEach(host => {
                vs.spec.gateways.forEach(gwName => {
                    let availibleHosts = tmpGw[`${vs.metadata.namespace}/${gwName}`]?.hosts
                    if (availibleHosts?.filter(existingHost => {if (host == existingHost || existingHost == "*") return existingHost}).length > 0) {
                        tmpGw[`${vs.metadata.namespace}/${gwName}`].gwHosts.serviceHosts.push({serviceName: vs.metadata.name, host: host, serviceLabels: vs.metadata.labels})
                    }
                })
            })
        })
        
        result = Object.values(tmpGw).flatMap(tmp => tmp.gwHosts)
        return result;
    }
}