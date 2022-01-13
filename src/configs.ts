import * as fs from "fs";
import {GVK} from "./k8s_resources/inner_types";

export enum GlobalConfigNames {
    MinLogLevel = "MinLogLevel",
    LogType = "LogType",
    ApiServerUrl = "ApiServerUrl",

    AutoInclusterConfig = "AutoInclusterConfig",
    AuthType = "AuthType",
    TokenFilePath = "TokenFilePath",
    ClientCertPath = "ClientCertPath",
    ClientKeyPath = "ClientKeyPath",
    CaCertPath = "CaCertPath",

    InitialWatchingResources = "InitialWatchingResources",
    InitialWebHookUrls = "InitialWebHookUrls",

    EnableSyncApiGroups = "EnableSyncApiGroups",
    ApiGroupsSyncIntervalSecond = "ApiGroupsSyncIntervalSecond"
}

export class GlobalConfig {
    MinLogLevel: string = "trace"; // silly, trace, debug, info, warn, error, fatal
    LogType: string = "json"; // json, pretty, hidden
    ListenAddress: string = "0.0.0.0:9000"; // Watcher API server listen address

    // Watcher configs
    InitialWatchingResources: Array<GVK> = [{group: "core", version:"v1", kind:"Pod", resourceType: "pods"} as GVK, {group: ""} as GVK];
    InitialWebHookUrls: Array<string>  = [ "http://localhost:8080/k8sResourceUpdated" ];

    // ApiGroup detector configs
    EnableSyncApiGroups: boolean = true;
    ApiGroupsSyncIntervalSecond: number = 30;

    // K8s_client configs
    AutoInclusterConfig: boolean = false;
    ApiServerUrl: string = "https://127.0.0.1:8443";
    AuthType: string = "ClientCert";
    TokenFilePath: string = "/var/run/secrets/kubernetes.io/serviceaccount/token";
    ClientCertPath: string = "/etc/kubernetes/pki/apiserver.crt";
    ClientKeyPath: string = "/etc/kubernetes/pki/apiserver.key";
    CaCertPath: string = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
}

let globalConfig: GlobalConfig;
let configLoaded = false;

export function LoadConfig() {
    // TODO load config from file
    let configFilePath:string = process.env.CONFIG_FILE_PATH || "./config.json";
    let configFileContent:string = fs.readFileSync(configFilePath, "utf8");
    globalConfig = JSON.parse(configFileContent);
    configLoaded = true;
}

export function GetConfig(configName: string) {
    if (!configLoaded) {
        LoadConfig();
    }
    return globalConfig[configName];
}

export default {
    GlobalConfigNames,
    GlobalConfig,
    GetConfig,
    LoadConfig,
    PrintConfigFileExample
}

function PrintConfigFileExample() {
    console.log( JSON.stringify(new GlobalConfig()) );
}