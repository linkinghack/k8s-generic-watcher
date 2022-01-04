import * as fs from "fs";
import { GVK } from "./K8sApiResourceWatcher";

export enum GlobalConfigNames {
    MinLogLevel = "MinLogLevel",
    LogType = "LogType",
    ApiServerUrl = "ApiServerUrl",
    InitialWatchingResources = "InitialWatchingResources",
    AutoInclusterConfig = "AutoInclusterConfig",
    AuthType = "AuthType",
    TokenFilePath = "TokenFilePath",
    ClientCertPath = "ClientCertPath",
    ClientKeyPath = "ClientKeyPath",
    CaCertPath = "CaCertPath",
}

export class GlobalConfig {
    MinLogLevel: string = "trace"; // silly, trace, debug, info, warn, error, fatal
    LogType: string = "json"; // json, pretty, hidden
    ApiServerUrl: string = "https://127.0.0.1:8443";
    InitialWatchingResources: Array<GVK> = [new GVK("apps", "v1", "deployments"), new GVK("core", "v1", "pods")];
    ListenAddress: string = "0.0.0.0:9000";
    AutoInclusterConfig: boolean = false;
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
}