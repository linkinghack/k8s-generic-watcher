// export const GROUP_CORE = "core";

// Configures how to authenticate with the API server.
//    BearerToken for in-cluster authentication, ClientCertificate for out-of-cluster authentication, 
//  and KubeConfig for using a kubeconfig file specified in `KUBECONFIG` environment variable.
// export const AUTH_TYPE_TOKEN = "BearerToken";
// export const AUTH_TYPE_CERT = "ClientCertificate";
export enum AuthType {
    BearerToken = "BearerToken",
    ClientCertificate = "ClientCertificate",
    KubeConfig = "KubeConfig"
}

export enum DefaultK8sGroup {
    Core = "core",
    Apps = "apps",
}