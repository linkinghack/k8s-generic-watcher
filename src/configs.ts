import * as fs from "fs";
import {GVK, InitialWatchResource} from "./k8s_resources/inner_types";
import {homedir} from "os";
import * as types from "./types";
import {K8sClientOptions} from "./utils/k8s_client";

export class GlobalConfig {
    minLogLevel: string = "trace"; // silly, trace, debug, info, warn, error, fatal
    logType: string = "json"; // json, pretty, hidden
    listenAddress: string = "0.0.0.0:9000"; // Watcher API server listen address

    // Watcher configs
    initialWatchingResources: Array<InitialWatchResource> = [{
        group: "core",
        version: "v1",
        kind: "Pod",
    } as GVK, {group: "apps", version: "v1", kind: "Deployment"} as GVK];
    initialWebHookUrls: Array<string> = ["http://localhost:8080/k8sResourceUpdated"];

    // ApiGroup detector configs
    enableSyncApiGroups: boolean = true;
    apiGroupsSyncIntervalSecond: number = 30;

    k8sClientConfig: K8sClientOptions = {
        apiServerUrl: "https://kubernetes.default",
        authType: "ClientCert",
        kubeConfigFilePath: "",
        autoInClusterConfig: true,
        autoKeepAlive: false,
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