import {readFileSync} from "fs";

class MyMap<TK, TV> extends Map<TK, TV> {
    constructor() {
        super();
    }

    public Length(): number {
        let count = 0;
        this.forEach((value, k, m) => {
            count++;
        })
        return count;
    }
}

interface ObjType {
    name: string;
    labels: Map<string, string>;
    list: Array<number>
}

function testParseMap() {
    let jsonStr = `{"name": "nginx", "kind": "Pod", "namespace": "default", "labels": {"app": "nginx", "env": "test"}, "list": [1,2,3,4,5]}`
    let parsed = JSON.parse(jsonStr);
    let obj = parsed as ObjType;
    console.log(obj)
    console.log(typeof obj.labels)
    // console.log(obj.labels.has("app")) // error
    console.log(typeof obj.list.push(88))
    console.log(obj.list instanceof Array) // true
}

// testParseMap();

function testParseYaml() {
    let originStr = readFileSync("tmp.json").toString();
    let replaced = originStr.replaceAll("\\n", "\n")
    console.log(replaced)

}

testParseYaml();