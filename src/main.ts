import fetch from "node-fetch";
import * as https from "https";
import * as fs from "fs";
import * as http2 from "http2";
import { SecureContextOptions } from "tls";


// main();
// Exec();


function analizeAPIObject(objStr: string) {
    let obj = JSON.parse(objStr);
    console.log(`API Object: type=${obj.type}, kind=${obj.object.kind}, object=${obj.object.metadata.name}`);
}

async function main() {
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
        
        for (; str.length > 0; ){
            let endPos = str.indexOf("\n", 0);
            if (endPos < 0){
                strBuf += str;
                str = ""; // end this loop
            } else {
                strBuf += str.substring(0, endPos + 1);
                analizeAPIObject(strBuf.toString());
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

function Exec() {
    let k8sUrl = "https://k8s.office.linkinghack.com:8443";

    const tlsOptions: SecureContextOptions = {
        key: fs.readFileSync("../configs/client.key"),
        cert: fs.readFileSync("../configs/client.crt"),
        ca: fs.readFileSync("../configs/ca.crt"),
    }
    
    let client = http2.connect(k8sUrl, tlsOptions);

    const {
        HTTP2_HEADER_PATH,
        HTTP2_HEADER_STATUS
    } = http2.constants;
    
    const respStream = client.request({ [HTTP2_HEADER_PATH]: '/api/v1/namespaces?watch=true' });

    console.log(`HTTP2_HEADER_PATH: ${HTTP2_HEADER_PATH}`);
    
    respStream.on('response', (headers) => {
        console.log(`headers: ${JSON.stringify(headers)}`);
        respStream.on('data', (chunk) => {
            console.log(`HTTP2 message received: `);
            analizeAPIObject(chunk.toString());
        });
        
        respStream.on('end', () => {
            console.log(` HTTP2 end`);
        });
    })

}
