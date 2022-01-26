import "reflect-metadata"
import {K8sClient, K8sClientOptions} from "../utils/k8s_client";
import {K8sApiObjectWatcher} from "../watcher/k8s_api_resource_watcher";
import {ApiGroupDetector} from "../k8s_resources/api_group_detector";

let clientOptions:K8sClientOptions = {
    apiServerUrl: "",
    authType: "KubeConfig",
    autoInClusterConfig: false,
    autoKeepAlive: false,
    autoReconnect: false,
    caCertDataPemBase64: "",
    caCertPath: "",
    clientCertDataPemBase64: "",
    clientCertPath: "",
    clientKeyDataPemBase64: "",
    clientKeyPath: "",
    tokenFilePath: ""
};
const k8sClient = new K8sClient(clientOptions)
const apiGroupDetector = new ApiGroupDetector([], k8sClient)

let watcher = new K8sApiObjectWatcher({group: "core", version:"v1", kind:"Pod"}, null, k8sClient, apiGroupDetector);
watcher.Start();
setTimeout(() => {
    let pods = watcher.List();
    console.log("Pods count: ", pods.length);
    pods.forEach((pod) => {
        console.log(pod.metadata.name, pod.metadata.namespace)
    })

}, 5000)
