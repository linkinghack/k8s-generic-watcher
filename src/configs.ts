import * as fs from "fs";
import {GVK, InitialWatchResource} from "./k8s_resources/inner_types";
import {homedir} from "os";
import {K8sClientOptions} from "./utils/k8s_client";

export class GlobalConfig {
    minLogLevel: string = "trace"; // silly, trace, debug, info, warn, error, fatal
    logType: string = "json"; // json, pretty, hidden
    listenPort: number = 3000; // Watcher API server listen address

    // Watcher configs
    initialWatchingResources: Array<InitialWatchResource> = [{
        group: "core",
        version: "v1",
        kind: "Pod",
        watchOptions: null, // TODO: Use dedicated Watcher (instead of global watcher for this GVK) for specific watch options
        notifiers: [{
            webhookUrls: ["http://localhost:8080/PodUpdated"],
            filter: {namespace: "default"},
            eventTypes: ["ADDED", "MODIFIED", "DELETED"]
        }]
    }, {group: "apps", version: "v1", kind: "Deployment"} as GVK];
    globalWebhookUrls: string[] = ["http://localhost:8080/k8sResourceUpdated"];

    // ApiGroup detector configs
    enableSyncApiGroups: boolean = true;
    apiGroupsSyncIntervalSecond: number = 30;

    k8sClientConfig: K8sClientOptions = {
        apiServerUrl: "https://kubernetes.default",
        authType: "KubeConfig",
        kubeConfigFilePath: "",
        autoInClusterConfig: true,
        autoKeepAlive: true,
        autoReconnect: false,
        caCertDataPemBase64: "",
        caCertPath: "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
        clientCertDataPemBase64: "",
        clientCertPath: "/etc/kubernetes/pki/apiserver.crt",
        clientKeyDataPemBase64: "",
        clientKeyPath: "/etc/kubernetes/pki/apiserver.key",
        tokenFilePath: "/var/run/secrets/kubernetes.io/serviceaccount/token"
    };
}

let globalConfig: GlobalConfig;
let configLoaded = false;

export function LoadConfig() {
    let configFilePath: string = process.env.CONFIG_FILE_PATH || "./config.json";
    if (configFilePath?.at(0) == '~') {
        configFilePath = homedir() + configFilePath.slice(1);
    }
    let configFileContent: string = fs.readFileSync(configFilePath, "utf8");
    globalConfig = JSON.parse(configFileContent) as GlobalConfig;
    // In-cluster config environment variable
    let inCluster = process.env.AUTO_INCLUSTER_CONFIG
    if (inCluster == 'true') {
        globalConfig.k8sClientConfig.autoInClusterConfig = true;
    }
    console.log("ConfigLoaded: ", globalConfig)
    configLoaded = true;
}

export function GetConfig(): GlobalConfig {
    if (!configLoaded) {
        LoadConfig();
    }
    return globalConfig;
}

export function PrintConfigFileExample() {
    let g = new GlobalConfig();
    console.log(JSON.stringify(g));
}