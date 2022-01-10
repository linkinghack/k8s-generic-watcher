import * as http2 from "http2";
import {K8sClient, K8sClientOptions} from "../watcher/k8s_client";
import * as types from "../types"
import {type} from "os";

export function testK8sClientCreation() {
    let options: K8sClientOptions = {
        autoInClusterConfig: false,
        authType: "KubeConfig",
        tokenFilePath: "",
        clientCertPath: "/Users/liulei/.kube/minikube/profiles/minikube/client.crt",
        clientKeyPath: "/Users/liulei/.kube/minikube/profiles/minikube/client.key",
        caCertPath: "/Users/liulei/.kube/minikube/ca.crt",
        autoKeepAlive: false,
        autoReconnect: false
    }
    options.authType = types.AuthTypeKubeConfig;

    const client = new K8sClient("", options);

    setTimeout(() => {
            let stream = client.request("/api/v1/namespaces/default/pods", {});

            stream.on("response", (headers: http2.IncomingHttpHeaders, flags: number) => {
                console.log(headers);
            })
            stream.on("data", (chunk: Buffer) => {
                console.log("data received");
            });

            stream.on("end", () => {
                console.log("HTTP2 stream end");
            });

            stream.on("close", () => {
                console.log("HTTP2 stream close");
                client.close();
            })
        }, 2000
    )

}

export default {
    testK8sClientCreation
}