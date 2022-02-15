# GRW 功能模式

## 1. 主动查询模式
在此场景下GRW会首先检索缓存结果，
- 若查询GVK已在缓存中且Watcher状态正常，则直接返回缓存中的检索结果；
- 若GVK在缓存列表，但Watcher已断开连接，则立即进行重连同步（重新list然后开启watch），重建索引后返回搜索结果。（推荐开启Watcher自动重连，始终保持缓存状态ready）

若查询的GVK未在缓存列表中，则将此GVK添加进入关注列表，并开启全集群范围（all namespaces）针对此GVK的watch（可配置关闭此行为），然后返回检索结果。

TODO: 支持CRD监控，实时反馈已安装的CRD类型列表; CRD列表发生变更时立即进行APIGroupsDetector的sync

### 1.1 精确查询
精确查询是指查询某种资源对象时指定的查询条件足以唯一确定一个对象；在明确API GVK （Group/Version/Kind）的前提下，包括如下情况：
- 对于集群范围（non-namespaced）资源：指定了Name
- 对于命名空间范围（namespaced）资源：指定了Namespace/Name
- 指定了资源 uid

### 1.2 范围查询
范围查询是指：
- 检索某个Namespace下的某种资源列表
- field selector组合查询条件：使用多个field matching表达式，如 `.spec.nodeName=node1`(仅支持value为简单数据类型如 string、number、boolean)
- labels selector (O(n)): 针对此资源

> 参考`sigs.k8s.io/controller-runtime/pkg/cache/internal/cache_reader.go: func (c *CacheReader) List(_ context.Context, out client.ObjectList, opts ...client.ListOption) error`


## 2. 订阅通知模式
通过配置指定对象类型的主动通知webhook，可以使GRW在watch某种资源过程中收到资源状态变更后主动通知

### 2.1 变更通知条件和方
对应于主动查询模式中的精确查询条件，与主动查询功能复用此GVK缓存，添加webhook URL，watch到状态变更更新缓存同时发送到订阅URL。

通知消息示例：
```json
{
  "eventType": "", // ADDED, MODIFIED, DELETED
  "gvk": "", // GRW standard GVK expression.  e.g. 'apps/v1/Deployment'
  "group": "",
  "version": "",
  "kind": "",
  "eventObjects": [{}],
  "message":"",
  "additionalData": {},
   "object": {
      "kind": "Pod",
      "apiVersion": "v1",
      "metadata": {},
      "spec": {},
      "status": {}
   }
}
```


#### 2.3 labels selector检索结果范围变更通知
独立缓存结果，独立HTTP2会话进行单独watch。

**TODO:** GRW 查询API中支持一个参数指定是否创建独立watch会话和缓存，后续的相同条件查询都直接访问独立缓存，不进行GRW内部检索流程。

### 3. core/v1, apps/v1 关键资源对象关系分析

#### 3.1 Deployment --> ReplicaSet --> Pods 所属关系

#### 3.2 PVC --> PV 对应关系

#### 3.3 Service --->  EndPoints
