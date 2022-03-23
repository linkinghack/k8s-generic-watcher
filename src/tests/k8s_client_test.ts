import * as http2 from "http2";
import {K8sClient, K8sClientOptions} from "../utils/k8s_client";
import * as types from "../types"
import { K8sApiObject, ObjectMeta } from "k8s_resources/k8s_origin_types";

export function createTestK8sClient() {
    let options: K8sClientOptions = {
        autoInClusterConfig: false,
        apiServerUrl: "",
        authType: "KubeConfig",
        kubeConfigFilePath: "",
        tokenFilePath: "",
        clientCertPath: "",
        clientKeyPath: "",
        caCertPath: "",
        caCertDataPemBase64: "",
        clientCertDataPemBase64: "",
        clientKeyDataPemBase64: "",
        autoKeepAlive: false,
        autoReconnect: false
    }
    options.authType = types.AuthTypeKubeConfig;

    return new K8sClient(options);
}

export function testK8sClientCreation() {
    let client = createTestK8sClient();
    let stream = client.request("/api/v1/namespaces/default/pods", {});

    stream.on("response", (headers: http2.IncomingHttpHeaders, flags: number) => {
        console.log(headers);
    })
    stream.on("data", (chunk: Buffer) => {
        console.log("data received");
    });

    stream.on("end", () => {
        console.log("HTTP2 stream end");
    });

    stream.on("close", () => {
        console.log("HTTP2 stream close");
        client.close();
    })
}

export function testK8sResources() {
    let client = createTestK8sClient();
    let stream = client.request('/apis')
    let respBuf = String();
    stream.on('data', (chunk) => {
        respBuf += chunk
    })
    stream.on('end', () => {
        console.log(respBuf)
        stream.close();
    })
}

export async function testCreatPlentyOfPods() {
    let client = createTestK8sClient()

    // ceate temp namespace
    let nsObj = {
        kind: "Namespace",
        apiVersion: "v1",
        metadata: {
            name: "many-pods"
        }
    } as K8sApiObject
    let nsCreateResult = await client.postObject("/api/v1/namespaces", nsObj)
    console.log(`Namespace ${nsObj.metadata.name} create result: ${nsCreateResult.status}, resp=${nsCreateResult.body}`)

    // create 5000 pods
    let deploy = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
            namespace: "many-pods",
            generateName: "nginx-load",
            labels: {app: "nginx-load"} as Object
        } as ObjectMeta,
        status: null,
        spec: {
            replicas: 10,
            selector: {
                matchLabels: {app: "nginx-load"}
            }
        }
    } as K8sApiObject
    let deploymentCreateResult = await client.postObject("/apis/v1/namespaces/many-pods/deployments", deploy)
    console.log(`Deployment ${deploy.metadata.generateName} create result=${deploymentCreateResult.status}, resp=${deploymentCreateResult.body}`)
}
