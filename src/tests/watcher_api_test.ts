import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import {MatchK8sObject} from "../utils/util";
import {K8sObjectsQueryParams} from "../types";

export function testObjectMatch() {
    let obj: K8sApiObject = {
        apiVersion: "v1", kind: "Pod",
        metadata: {
            name: "pod",
            generateName: "",
            namespace: "default",
            labels: {
                "app": "watcher",
                "component": "micro"
            },
            annotations: {
                "node.k8s.io/arch": "amd64",
                "deployment.kubernetes.io/revision": "3"
            },

            // system
            finalizers: [],
            ownerReferences: [],

            // read-only
            creationTimestamp: "", // RFC3339 , UTC
            deletionGracePeriodSeconds: BigInt(123),
            deletionTimestamp: "",
            generation: BigInt(123),
            resourceVersion: "",
            uid: "12345"
        }, status: {},
        spec: {
            selector: {
                matchLabels: {
                    "io.cilium/app": "operator",
                    "name": "cilium-operator",
                }
            },
            strategy: {
                rollingUpdate: {
                    maxSurge: 1,
                    maxUnavailable: 1
                },
                type: "RollingUpdate"
            }
        }
    } as K8sApiObject

    let filterParam: K8sObjectsQueryParams = {
        annotationSelectors: [],
        fieldMatches: ["spec.strategy.type", "RollingUpdate", "spec.strategy.rollingUpdate.maxSurge", 1],
        group: "core",
        kind: "Pod",
        labelSelectors: ["app", "watcher"],
        name: "pod",
        namespace: "default",
        uid: "",
        version: "v1"
    }

    let matched = MatchK8sObject(obj, filterParam)
    console.log(matched)
}

testObjectMatch();