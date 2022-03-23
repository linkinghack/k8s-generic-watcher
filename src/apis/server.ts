import express from "express";
import * as http from "http";
import morgan from 'morgan';
import logger from "../logger";

const log = logger.getChildLogger({name: "WebServer"});

export interface ServerOptions {
    listenPort: number,
    loggerFormat?: string  // morgan logger format config
}

export class WebServer {
    private _expressApp: express.Application
    private _server: http.Server
    private _options: ServerOptions

    constructor(ops: ServerOptions) {
        this._options = ops;
        this._expressApp = express();
        this._server = http.createServer(this._expressApp);
        this._expressApp.set('port', ops.listenPort);
        this._expressApp.use(express.json())
        this._expressApp.use(express.urlencoded({extended: false}))

        if (ops.loggerFormat) {
            this._expressApp.use(morgan(ops.loggerFormat));
        } else {
            this._expressApp.use(morgan(':date[iso]  - method=:method url=:url status=:status content-length=:res[content-length] - :response-time ms', {
                skip: function(req, res) { return res.statusCode < 400}
            }))
        }

        let that = this
        this._server.on("listening", () => {
            let addr = that._server.address();
            let bind = typeof addr === 'string'
                ? 'pipe ' + addr
                : addr.address + ':' + addr.port
            log.info(`WebServer listening on ${bind}`)
        })
        this._server.on("connection", socket => {
            log.debug(`Client connection established, client: ${JSON.stringify(socket.address())}`)
        })
        this._server.on("error", err => {
            log.error("WebServer panic", err);
        })
    }

    public Serve() {
        this._server.listen(this._options.listenPort)
    }

    public RegisterRouter(path: string, router: express.Router) {
        this._expressApp.use(path, router);
    }

}
