// export const GROUP_CORE = "core";

// Configures how to authenticate with the API server.
//    BearerToken for in-cluster authentication, ClientCertificate for out-of-cluster authentication.
// export const AUTH_TYPE_TOKEN = "BearerToken";
// export const AUTH_TYPE_CERT = "ClientCertificate";
export enum AuthType {
    BearerToken = "BearerToken",
    ClientCertificate = "ClientCertificate",
}

export enum DefaultK8sGroup {
    Core = "core",
    Apps = "apps",
}