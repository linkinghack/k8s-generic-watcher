import {ApiGroupDetector} from "../k8s_resources/api_group_detector";
import {createTestK8sClient} from "./k8s_client_test";

export function testGetApiGroups() {
    let client = createTestK8sClient();
    let detector = new ApiGroupDetector(client);
    detector.GetApiGroups(true).then((group) => console.log(group.kind))
}