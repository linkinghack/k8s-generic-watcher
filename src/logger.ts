import {GetConfig, GlobalConfigNames} from "./configs";
import {Logger} from "tslog";

// Global logger configuration
export default new Logger({
    name: "GenericK8sAPIResourceWatcher",
    minLevel: GetConfig(GlobalConfigNames.MinLogLevel),
    type: GetConfig(GlobalConfigNames.LogType),
})
