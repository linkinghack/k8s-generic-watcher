# Generic K8s Resources Watcher
｜[中文](./README.md) | [English](./README.en.md) |

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
### 1. 主动查询模式
在此场景下GRW会首先检索缓存结果，
- 若查询GVK已在缓存中且Watcher状态正常，则直接返回缓存中的检索结果；
- 若GVK在缓存列表，但Watcher已断开连接，则立即进行重连同步（重新list然后开启watch），重建索引后返回搜索结果。（推荐开启Watcher自动重连，始终保持缓存状态ready）

若查询的GVK未在缓存列表中，则将此GVK添加进入关注列表，并开启全集群范围（all namespaces）针对此GVK的watch（可配置关闭此行为），然后返回检索结果。

TODO: 支持CRD监控，实时反馈已安装的CRD类型列表; CRD列表发生变更时立即进行APIGroupsDetector的sync

#### 1.1 精确查询
精确查询是指查询某种资源对象时指定的查询条件足以唯一确定一个对象；在明确API GVK （Group/Version/Kind）的前提下，包括如下情况：
- 对于集群范围（non-namespaced）资源：指定了Name
- 对于命名空间范围（namespaced）资源：指定了Namespace/Name

#### 1.2 范围查询
范围查询是指：
- 检索某个Namespace下的某种资源列表
- field selector组合查询条件：使用多个field matching表达式，如 `.spec.nodeName=node1`(仅支持value为简单数据类型如 string、number、boolean)
- labels selector (O(n)): 针对此资源

> 参考`sigs.k8s.io/controller-runtime/pkg/cache/internal/cache_reader.go: func (c *CacheReader) List(_ context.Context, out client.ObjectList, opts ...client.ListOption) error`


### 2. 订阅Web通知模式
通过配置指定对象类型的主动通知webhook，可以使GRW在watch某种资源过程中收到资源状态变更后主动通知
#### 2.1 精确匹配对象变更通知
对应于主动查询模式中的精确查询条件，与主动查询功能复用此GVK缓存，添加webhook URL，watch到状态变更更新缓存同时发送到订阅URL。

**TODO:** 确定变更通知数据结构。 （使用Kubernetes原声watch结果？）

示例：
```json
{
   "type": "ADDED",
   "object": {
      "kind": "Pod",
      "apiVersion": "v1",
      "metadata": {},
      "spec": {},
      "status": {}
   }
}
```

#### 2.2 Namespace范围对象变更通知
对于指定GVK，主动通知指定namespace范围所有变更事件。

#### 2.3 labels selector检索结果范围变更通知
独立缓存结果，独立HTTP2会话进行单独watch。

**TODO:** GRW 查询API中支持一个参数指定是否创建独立watch会话和缓存，后续的相同条件查询都直接访问独立缓存，不进行GRW内部检索流程。

### 3. core/v1, apps/v1 关键资源对象关系分析

#### 3.1 Deployment --> ReplicaSet --> Pods 所属关系

#### 3.2 PVC --> PV 对应关系

#### 3.3 Service --->  EndPoints

---
## 开始使用
### 配置
 TODO
 1. 读取配置文件：设置环境变量`CONFIG_FILE_PATH`为配置文件位置
 2. 配置文件配置项：
    配置文件使用JSON格式，可以通过ConfigMap作为Volume挂载进容器中
 ```json

 ```


### API 说明