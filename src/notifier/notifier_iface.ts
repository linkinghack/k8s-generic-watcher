export interface WatcherEventNotifier {
    NotifyObjectAdd(obj: any): void,
    NotifyObjectModify(old: any, newObj: any): void,
    NotifyObjectDelete(obj: any): void
    SubscribingEvent(type:string): boolean
}

export interface WatcherEventNotificationMessage {
    eventType: string, // ADDED, MODIFIED, DELETED
    gvk: string, // GRW standard GVK expression
    group: string,
    version: string,
    kind: string,
    eventObjects: any[]
    message?: string,
    additionalData?: any
}
