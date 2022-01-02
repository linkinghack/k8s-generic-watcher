# Generic K8s API Object Watcher
｜[中文](./README.md) | [English](./README.en.md) |

K8s API 对象 watch 监控服务，支持K8s原生资源和任意指定的GVK，支持任意自定义资源（CR）的监控。

## 概览
API Object Watcher通过利用Kubernetes REST API中 `GET` 方法的 `?watch` 特性，在本地建立指定API对象的状态缓存，在不对APIServer造成大压力的前提下为其他平台应用或对K8s API对象感兴趣的应用提供**资源对象列表查询**、**对象状态变更主动通知**、**动态设置关注API对象类型**等功能。


### 与K8s client SDK的关系
虽然API Object Watcher的工作方式与 K8s SDK中的`informer`很相似，但SDK（比如`client-go`）关注的是K8s核心API对象以及特定的某种CR对象的变化，典型的应用场景是开发自定义资源控制器（Operator）。 

API Object Watcher的目标是通用API资源对象的状态监控和支撑高频率的资源列表查询。 Watcher作为一个独立服务部署，为其他平台类、管理类应用程序提供查询服务和关键事件主动通知服务(WebHook)。

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