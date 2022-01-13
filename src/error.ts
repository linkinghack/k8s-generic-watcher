
export class GVKNotCachedError extends Error{
    constructor(msg: string) {
        super(msg);
        Object.setPrototypeOf(this, GVKNotCachedError.prototype)
    }
}

