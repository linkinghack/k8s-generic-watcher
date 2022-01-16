import {ApiGroupDetector} from "../k8s_resources/api_group_detector";
import {createTestK8sClient} from "./k8s_client_test";

export function testGetApiGroups() {
    let client = createTestK8sClient();
    let detector = new ApiGroupDetector(client);

    setTimeout(() => {
        detector.GetApiGroups(true).then((group) => console.log(group.kind, "groups count: " + group.groups.length))
        let resourceName = detector.GetResourceNameOfGVK("core", "v1", "Namespace");
        console.log("Get resource by GVK: ", resourceName);
    }, 2000)
    client.close();
}

export function testGetApiGroupResource() {
    let client = createTestK8sClient();
    let detector = new ApiGroupDetector(client);
    detector.GetApiResourceDetailOfGVK("events.k8s.io", "v1", "Event")
        .then((resource) => {
            console.log("target resource API detail: ")
            console.log(resource);
            client.close();
        })
        .catch((e) => {
            console.log(e)
            client.close();
        })
}
