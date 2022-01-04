import * as http2 from "http2";
import { K8sClient, K8sClientOptions } from "../K8sClient";


export function testK8sClientCreation() {
    let options: K8sClientOptions = {
        autoInclusterConfig: false,
        authType: "ClientCertificate",
        tokenFilePath: "",
        clientCertPath: "/Users/liulei/.minikube/profiles/minikube/client.crt",
        clientKeyPath: "/Users/liulei/.minikube/profiles/minikube/client.key",
        caCertPath: "/Users/liulei/.minikube/ca.crt"
    }
    const client = new K8sClient("https://172.16.67.11:8443", options);
    let stream = client.request("/api/v1/namespaces/default/pods", {});
    console.log("Request: ", stream);
    
    stream.on("response", (headers: http2.IncomingHttpHeaders, flags: number) => {
        console.log(headers);
    })
    stream.on("data", (chunk: Buffer) => {
        console.log(chunk.toString());
    });
    
    stream.on("end", () => {
        console.log("HTTP2 stream end");
    });

}

testK8sClientCreation();