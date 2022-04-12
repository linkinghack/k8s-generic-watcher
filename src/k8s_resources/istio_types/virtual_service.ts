import { K8sApiObject } from "../k8s_origin_types";

/**
 * This package includes only part of essential attributes of Istio types regradless of API version.
 */

export interface VirtualService extends K8sApiObject {
    spec: {
        hosts: Array<string>,
        gateways: Array<string>,
        http: Array<HTTPRoute>,
        tls: Array<TLSRoute>,
        tcp: Array<TCPRoute>
    }
}

export interface HTTPRoute {
    name: string,
    match: Array<{
        name: string,
        uri: StringMatch, // uri match expression
        scheme: StringMatch,
        method: StringMatch,
        headers: {[index: string]: StringMatch},
    }>,
    route: Array<{
        destination: Destination,
        weight: number
    }>,
    rewrite?: {
        uri: string, // rewrite uri path
        authority: string // rewrite Host / Authority header with this value
    },
    timeout?: string
}

export interface TLSRoute {
    match: Array<{
        sniHosts: Array<string>,
        destination_subnets: Array<string>,
        port: number,
        source_labels?: {[index: string]: string},
        gateways?: Array<string>,
        source_namespace?: string
    }>,
    route: Array<{
        weight?: number,
        destination: Destination
    }>
}

export interface TCPRoute {
    match: Array<{
        destination_subnets: Array<string>,
        port: number,
        source_subnet: string,
        source_labels: {[index: string]: string},
        gateways: Array<string>,
        source_namespace: string
    }>,
    route: Array<{
        weight?: number,
        destination: Destination
    }>
}

export interface StringMatch {
    exact?: string,
    prefix?: string,
    regex?: string
}

export interface Destination {
    host: string,
    subset: string,
    port: {number: number}
}

