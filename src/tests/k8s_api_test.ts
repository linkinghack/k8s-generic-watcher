import fetch from "node-fetch";
import * as https from "https";
import * as fs from "fs";
import * as http2 from "http2";
import {SecureContextOptions} from "tls";


function analyzeAPIObject(objStr: string) {
    let obj = JSON.parse(objStr);
    console.log(`API Object: type=${obj.type}, kind=${obj.object.kind}, object=${obj.object.metadata.name}`);
}

async function testK8sAPI() {
    let k8sUrl = "https://k8s.office.linkinghack.com:8443";

    const https_opts: https.AgentOptions = {
        key: fs.readFileSync("../configs/client.key"),
        cert: fs.readFileSync("../configs/client.crt"),
        ca: fs.readFileSync("../configs/ca.crt"),
        keepAlive: true,
        timeout: 0,
    }

    let agent = new https.Agent(https_opts);

    let resp = await fetch(k8sUrl + "/api/v1/namespaces?watch=true",
        {
            agent: agent,
            method: "GET",
        }
    );

    resp.headers.forEach((value, name) => {
        console.log(name, value);
    });

    resp.body.eventNames().forEach(event => {
        console.log("body event: ", event);
    })


    let strBuf = new String();
    resp.body.on("readable", () => {
        console.log("data received");
        resp.body.pause();

        let chunk = resp.body.read();
        let str = String(chunk);

        for (; str.length > 0;) {
            let endPos = str.indexOf("\n", 0);
            if (endPos < 0) {
                strBuf += str;
                str = ""; // end this loop
            } else {
                strBuf += str.substring(0, endPos + 1);
                analyzeAPIObject(strBuf.toString());
                strBuf = "";
                str = str.substring(endPos + 1);
            }
        }

        resp.body.resume();
    });

    resp.body.eventNames().forEach(event => {
        console.log("body event: ", event);
    })
}

function testK8sHTTP2() {
    let k8sUrl = "https://172.16.67.25:8443";

    const tlsOptions: SecureContextOptions = {
        key: fs.readFileSync("/Users/liulei/.minikube/profiles/minikube/client.key"),
        cert: fs.readFileSync("/Users/liulei/.minikube/profiles/minikube/client.crt"),
        ca: fs.readFileSync("/Users/liulei/.minikube/ca.crt"),
    }

    let client = http2.connect(k8sUrl, tlsOptions);

    const {
        HTTP2_HEADER_PATH,
        HTTP2_HEADER_STATUS
    } = http2.constants;

    const respStream = client.request({[HTTP2_HEADER_PATH]: '/api/v1/namespaces?watch=true'});

    console.log(`HTTP2_HEADER_PATH: ${HTTP2_HEADER_PATH}`);

    respStream.on('response', (headers, flags) => {
        console.log(`headers: ${JSON.stringify(headers)}, flags=${flags}`);

    })
    let strBuf = new String();
    respStream.on('data', (chunk) => {
        console.log(`HTTP2 message received: `);

        let str = chunk.toString();
        for (; str.length > 0;) {
            let endPos = str.indexOf("\n", 0);
            if (endPos < 0) {
                strBuf += str;
                str = ""; // end this loop
            } else {
                strBuf += str.substring(0, endPos + 1);
                analyzeAPIObject(strBuf.toString());
                strBuf = "";
                str = str.substring(endPos + 1);
            }
        }

    });

    respStream.on('end', () => {
        console.log(` HTTP2 end`);
    });

}

testK8sHTTP2();