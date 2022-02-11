import {K8sApiObject} from "../k8s_resources/k8s_origin_types";
import logger from "../logger";
import {K8sObjectsQueryParams} from "../types";
import {strict as assert} from "assert";
import {CheckedGroupVersion} from "./k8s_name_format";
import jsonpath from "jsonpath"

const log = logger.getChildLogger({name: "util"});

export function K8sApiObjectsIntersect(...objsSetsArr: Array<K8sApiObject[]>): K8sApiObject[] {
    if (!objsSetsArr || objsSetsArr?.length == 1) {
        return objsSetsArr?.pop();
    }

    let validSets = Array<ReadonlySet<K8sApiObject>>();
    for (let objs of objsSetsArr) {
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
    set0.forEach((obj) => {
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

/**
 * Checks 'obj' if it meets all the matching conditions in 'matchParam'
 * @param obj The K8s Api object to check
 * @param matchParam match conditions
 */
export function MatchK8sObject(obj: K8sApiObject, matchParam: K8sObjectsQueryParams): boolean {
    try {
        assert.equal(obj.apiVersion, CheckedGroupVersion(matchParam.group, matchParam.version));
        assert.equal(obj.kind, matchParam.kind);

        if (matchParam.namespace) assert.equal(obj.metadata.namespace, matchParam.namespace);
        if (matchParam.name) assert.equal(obj.metadata.name, matchParam.name);
        if (matchParam.uid) assert.equal(obj.metadata.uid, matchParam.uid);

        if (matchParam.fieldMatches?.length > 0) {
            let fieldMatches = ArrayToMap(matchParam.fieldMatches)
            for (let k of fieldMatches.keys()) {
                let propertyValues = jsonpath.query(obj, "$." + k);
                if (propertyValues?.length < 1) {
                    // field not found
                    log.debug('Field not found.', `field=${k}, targetValue=${fieldMatches.get(k)}`);
                    return false;
                }
                let objValue = propertyValues[0];
                let targetValue = fieldMatches.get(k);
                assert.equal(objValue, targetValue);
            }
        }

        if (matchParam.labelSelectors?.length > 0) {
            let labelSelectors = ArrayToMap(matchParam.labelSelectors);
            for (let k of labelSelectors.keys()) {
                assert.notEqual(obj?.metadata.labels[k], undefined);
                assert.equal(obj?.metadata.labels[k], labelSelectors.get(k));
            }
        }

        if (matchParam.annotationSelectors?.length > 0) {
            let annotationSelectors = ArrayToMap(matchParam.annotationSelectors);
            for (let k of annotationSelectors.keys()) {
                assert.notEqual(obj?.metadata.annotations[k], undefined);
                assert.equal(obj?.metadata.annotations[k], annotationSelectors.get(k));
            }
        }
    } catch (e) {
        if (e instanceof assert.AssertionError) {
            log.debug('Obj does not match matchParam', e)
        } else {
            log.error('Error happened while matching K8sApiObject with matchParam', `matchParam=${matchParam}`,
                `gvk=${obj.apiVersion}/${obj.kind}, name=${obj.metadata.name}, namespace=${obj.metadata.namespace}`);
            log.error(e);
        }
        return false
    }

    return true;
}

