
import jsonpath from "jsonpath"
import yaml from "yaml";

let s = new Set<string>();
let j = `{"name": "linking", "detail": {"college": "TYUT", "id":"linkinghack", "name": "LeiLiu"}}`
let obj = JSON.parse(j);
let college = jsonpath.query(obj, "$.detail.college")
let names = jsonpath.query(obj, "$..name")

console.log("college: ", college);
console.log("names: ", names)
console.log("age: ", jsonpath.query(obj, "$.detail.age"))


let ym = `
apiVersion: v1
clusters:
- cluster:
    certificate-authority: /Users/liulei/.minikube/ca.crt
    extensions:
    - extension:
        last-update: Mon, 10 Jan 2022 20:48:39 CST
        provider: minikube.sigs.k8s.io
        version: v1.24.0
      name: cluster_info
    server: https://172.16.67.13:8443
  name: minikube
contexts:
- context:
    cluster: minikube
    extensions:
    - extension:
        last-update: Mon, 10 Jan 2022 20:48:39 CST
        provider: minikube.sigs.k8s.io
        version: v1.24.0
      name: context_info
    namespace: default
    user: minikube
  name: minikube
current-context: minikube
kind: Config
preferences: {}
users:
- name: minikube
  user:
    client-certificate: /Users/liulei/.minikube/profiles/minikube/client.crt
    client-key: /Users/liulei/.minikube/profiles/minikube/client.key
`

let yamlObj = yaml.parse(ym)
console.log(yamlObj)
console.log(yamlObj["current-context"])