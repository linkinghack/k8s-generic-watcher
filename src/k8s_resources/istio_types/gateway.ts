import { K8sApiObject } from "k8s_resources/k8s_origin_types"

export interface IstioGateway extends K8sApiObject{
    spec: {
        servers: Array<Server>,
        selector: {[index: string]: string}
    }
}

export interface Server {
    port: Port,
    bind: string,
    hosts: Array<string>,
    tls: TLSSettings,
    default_endpoint: string,
    name: string
}

export interface Port {
    number: number,
    protocol: string,
    name: string,
    target_port: string
}

export interface TLSSettings {
    https_redirect: boolean, // auto redirect http connection to https
}