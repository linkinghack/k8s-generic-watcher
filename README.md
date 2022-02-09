# Generic K8s Resources Watcher
｜[中文](./README.md) | [English](./README.en.md) |

 ![watcher-CI workflow](https://github.com/linkinghack/k8s-generic-watcher/actions/workflows/watcher-ci.yaml/badge.svg)
 ![contributors](https://img.shields.io/github/contributors/linkinghack/k8s-generic-watcher?style=plastic)
 ![last commit](https://img.shields.io/github/last-commit/linkinghack/k8s-generic-watcher?style=plastic)
 ![licence](https://img.shields.io/badge/LICENCE-GPL-brightgreen)
 ![stars](https://img.shields.io/github/stars/linkinghack/k8s-generic-watcher?style=social)

K8s API 对象 watch 监控服务，支持K8s原生资源和任意指定的GVK，支持任意自定义资源（CR）的监控。

> 为方便描述, 以下简称此工具为GRW
## 概述
GRW (Generic Resources Watcher) 通过利用Kubernetes REST API中 `GET` 方法的 `?watch` 特性，在本地建立指定API对象的状态缓存，在不对APIServer造成大压力的前提下为其他平台应用或对K8s API对象感兴趣的应用提供**资源对象列表查询**、**对象状态变更主动通知**、**动态设置关注API对象类型**等功能。

GRW应该作为每个需要关注具体资源变化的服务的附属组件（sidecar）部署，仅关注某个或者少数固定的几种API资源。关注不同资源状态的各个服务都应该独立部署GRW实例。

> 参考：https://kubernetes.io/docs/reference/using-api/api-concepts/#api-verbs


### 与K8s client SDK的关系
虽然GRW的工作方式与 K8s SDK中的`informer`很相似，但SDK（比如`client-go`）关注的是K8s核心API对象以及特定的某种CR对象的变化，典型的应用场景是开发自定义资源控制器（Operator）。 

GRW的目标是通用API资源对象的状态监控、支撑高频率的资源列表查询。 Watcher作为一个独立服务部署，为其他平台类、管理类应用程序提供查询服务和关键事件主动通知服务(WebHook、消息队列)。

---
## 功能模式

- HTTP接口查询
  - 资源对象缓存检索
  - core/v1, apps/v1 关键对象关系分析, Service-EndPoint, Deployment-RS-Pod 等（TODO）
- WebHook订阅 （TODO）
- 消息系统订阅（Kafka） （TODO)

详细参考：[功能特性文档](./docs/features.md)

---
## 开始使用
### 构建和运行
环境要求： 
- NodeJS 1.16+
- Docker （或其他容器运行时）， 若要构建容器镜像
```bash
# 安装依赖
npm install -g typescript
npm install

# 使用npm 自动编译运行
npm run serve
# 或者执行
tsc;
node dist/main.js
```

#### 在Kubernetes集群中部署
GRW更推荐的用法是与平台应用部署在一起，作为一个sidecar出现。`manifest/watcher-deploy.yaml`仅提供K8s部署参考。

```bash
kubectl apply -f ./manifest/deploy.yaml
```


### 配置
 1. 指定配置文件：设置环境变量`CONFIG_FILE_PATH` 为配置文件位置， 默认当前目录
 2. 配置文件配置项：
    配置文件使用JSON格式，可以通过ConfigMap作为Volume挂载进容器中
 3. K8sClient配置：
    1. authType: ApiServer认证方式，可选`KubeConfig`, `BearerToken`, `ClientCertificate`, 仅当`autoInClusterConfig`为false时有效。
    2. autoInClusterConfig: boolean  是否在集群中运行，为true时自动使用容器中的Secret数据完成ApiServer认证，需要提前配置好ServiceAccount的RBAC。
    3. 使用`authType=KubeConfig` + `autoInclusterConfig=false` 模式 或 `autoInclusterConfig=true`模式时均无需指定ApiServerUrl, CA配置信息, Token配置等。 （配置被忽略）。
 ```json
{
  "minLogLevel": "trace",
  "logType": "pretty",
  "listenAddress": "0.0.0.0:9000",
  "initialWatchingResources": [
    {
      "group": "core",
      "version": "v1",
      "kind": "Pod"
    }
  ],
  "initialWebHookUrls": [
    "http://localhost:8080/k8sResourceUpdated"
  ],
  "enableSyncApiGroups": true,
  "apiGroupsSyncIntervalSecond": 30,
  "k8sClientConfig": {
    "apiServerUrl": "https://kubernetes.default",
    "authType": "KubeConfig",
    "kubeConfigFilePath": "~/.kube/config",
    "autoInClusterConfig": false,
    "autoKeepAlive": false,
    "autoReconnect": false,
    "caCertDataPemBase64": "",
    "caCertPath": "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
    "clientCertDataPemBase64": "",
    "clientCertPath": "/etc/kubernetes/pki/apiserver.crt",
    "clientKeyDataPemBase64": "",
    "clientKeyPath": "/etc/kubernetes/pki/apiserver.key",
    "tokenFilePath": "/var/run/secrets/kubernetes.io/serviceaccount/token"
  }
}
 ```

### API 参考
相见：[API Spec](./docs/api_spec.md)