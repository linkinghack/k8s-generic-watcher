


/**
 * Configures how to authenticate with the API server.
 * BearerToken for in-cluster authentication, ClientCertificate for out-of-cluster authentication,
 *   and KubeConfig for using a kubeconfig file specified in `KUBECONFIG` environment variable.
 *
 */
export const
    AuthTypeBearerToken = "BearerToken",
    AuthTypeClientCertificate = "ClientCertificate",
    AuthTypeKubeConfig = "KubeConfig"
