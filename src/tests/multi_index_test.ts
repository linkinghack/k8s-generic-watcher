import {Container, nonuniqueIndex, uniqueIndex} from "multi-index";


interface IndexObject {
    name: string,
    gender: string,
    uid: string,
    detail: {
        address: string,
        building: string
    }
}

function testMultiIndexCreatingIdx() {
    let _store: Container<IndexObject> = new Container<IndexObject>();

    let _idxUid = uniqueIndex<IndexObject, string>(kobj => kobj.uid, 'by uid').on(_store);
    let _idxName = nonuniqueIndex<IndexObject, string>(kobj => kobj.name, 'by name').on(_store);

    _store.add({name: "bob", uid: "0001", gender: "male", detail: {address: "Beijing", building: "Building A"}});
    _store.add({name: "Alice", uid: "0002", gender: "female", detail: {address: "Tianjin", building: "Building B"}});

    let addIdx = nonuniqueIndex<IndexObject, string>(obj => obj.detail.address).on(_store);
    _store.add({name: "Cindy", uid: "0003", gender: "female", detail: {address: "Beijing", building: "Building C"}});

    let r = addIdx.get("Beijing");
    console.log("addIdx search result:", r);

    let r1 = _idxUid.get("0003")
    console.log("uidIdx search result: ", r1)
}

testMultiIndexCreatingIdx();