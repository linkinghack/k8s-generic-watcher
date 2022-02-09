# GRW API 说明

## 资源查询

### 1. GET | POST  /resources/k8sObjects 
查询指定GVK列表，可选地设置筛选条件。
#### URL 请求参数
 - `group`: 资源API group，如 `networking.k8s.io`
 - `version`: 资源所属版本， 如 `v1`, `v2beta2`
 - `kind`: 资源类型，如 `Ingress`
 - `name`: (optional) 筛选资源对象名称, 匹配 `.metadata.name`
 - `namespace`: (optional) 筛选资源所属namespace, 匹配`.metadata.namespace`
 - `uid`: (optional) 精确查询指定uid对象， 匹配`.metadata.uid`

#### 请求体参数（仅POST时）
相同参数，body中的配置优先级更高。

可以通过label selector和 annotation selector进行结果筛选，使用时不应该指定uid, 或同时指定name + namespace，否则将忽略label selector。

多个筛选条件将对结果求交。

- `labelSelectors`: `["key1", "value1", "key2", "value2",...]`
- `annotationSelectors`: `["key1", "value1", "key2", "value2",...]`
- `fieldMatches`: `["key1", "JSON-serialized value", ...]` 针对目标GVK的任意属性字段进行匹配。 key为字段表达式, 如`".spec.nodeName"`  其中value部分要进行JSON序列化，如 value 为整数123, 也要序列化为 "123"

header: 
```html
Content-type: application/json
```

body:
```json
{
  "group": string,
  "version": string,
  "kind": string,
  "name": string,
  "namespace": string,
  "uid": string,
  "labelSelectors": Array<any>,
  "annotationSelectors": Array<any>,
  "fieldMatches": Array<any>,
  "dedicatedIndex": boolean
}
```