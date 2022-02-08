import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import logger from "../logger";
import {kMaxLength} from "buffer";
const log = logger.getChildLogger({name: "util"});

export function K8sApiObjectsIntersect(...objsSetsArr: Array<K8sApiObject[]>): K8sApiObject[] {
    if (!objsSetsArr || objsSetsArr?.length == 1) {
        return objsSetsArr?.pop();
    }

    let validSets = Array<ReadonlySet<K8sApiObject>>();
    for (let objs of objsSetsArr ) {
        if (objs?.length > 0) {
            let s = new Set<K8sApiObject>();
            objs.forEach((obj) => s.add(obj))
            validSets.push(s)
        }
    }
    if (validSets?.length < 1) {
        return [];
    }

    validSets = validSets.sort((left, right) => right.size - left.size);
    log.debug('K8sApiObjectsIntersect', `valid sets size=${validSets?.length}`)
    let set0 = validSets.pop();
    log.debug('K8sApiObjectsIntersect', `set0 size=${set0?.size}`)
    let result = Array<K8sApiObject>();
    set0.forEach((obj) =>  {
        for (let i = 0; i < validSets.length; i++) {
            if (!validSets[i].has(obj)) {
                return;  // skip this obj in set0
            }
        }
        result.push(obj); // add to final result
    })
    return result;
}

export function ArrayToMap(arr: Array<any>): Map<string, any> {
    if (!arr || arr.length < 2) {
        return null;
    }
    let m = new Map<any, any>();
    if (arr) {
        let key: string;
        for (let i = 0; i < arr.length; i++) {
            if ((i ^ 1) == (i + 1)) { // element at even idx is key.
                key = arr[i]
            } else {
                m.set(key, arr[i])
            }
        }
    }
    return m;
}