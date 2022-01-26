import {GetConfig} from "./configs";
import {Logger} from "tslog";

// Global logger configuration
export default new Logger({
    name: "GenericK8sAPIResourceWatcher",
    minLevel: returnAny(GetConfig().minLogLevel),
    type: returnAny(GetConfig().logType),
})

function returnAny(p: any): any {
    return p;
}
