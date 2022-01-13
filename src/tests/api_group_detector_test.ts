import {ApiGroupDetector} from "../k8s_resources/api_group_detector";
import {createTestK8sClient} from "./k8s_client_test";

export function testGetApiGroups() {
    let client = createTestK8sClient();
    let detector = new ApiGroupDetector(client);

    setTimeout(() => {
        detector.GetApiGroups(true).then((group) => console.log(group.kind, group.groups.length))
        let resourceName = detector.GetResourceNameOfGVK("core", "v1", "Namespace");
        console.log("Get resource by GVK: ", resourceName);
    }, 2000)

}