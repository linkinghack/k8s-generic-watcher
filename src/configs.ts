import * as fs from "fs";
import { GVK } from "./K8sApiResourceWatcher";

export enum GlobalConfigNames {
    MinLogLevel = "MinLogLevel",
    ApiServerUrl = "ApiServerUrl",
    InitialWatchingResources = "InitialWatchingResources",
    AutoInclusterConfig = "AutoInclusterConfig",
    AuthType = "AuthType",
    TokenFilePath = "TokenFilePath",
    ClientCertPath = "ClientCertPath",
    ClientKeyPath = "ClientKeyPath",
    CaCertPath = "CaCertPath",
}

class GlobalConfig {
    MinLogLevel: string; // silly, trace, debug, info, warn, error, fatal
    ApiServerUrl: string;
    InitialWatchingResources: Array<GVK>;
    ListenAddress: string;
    AutoInclusterConfig: boolean;
    AuthType: string;
    TokenFilePath: string;
    ClientCertPath: string;
    ClientKeyPath: string;
    CaCertPath: string;
}

let globalConfig: GlobalConfig;
let configLoaded = false;

export  function LoadConfig() {
    // TODO load config from file
    let configFilePath:string = process.env.CONFIG_FILE_PATH || "./config.json";
    let configFileContent:string = fs.readFileSync(configFilePath, "utf8");
    

    configLoaded = true;
}

export function GetConfig(configName: string) {
    if (!configLoaded) {
        LoadConfig();
    }
    return globalConfig[configName];
}
