export declare class TinySignalRClient {
    private hubUrl;
    private apiKey;
    private group?;
    private socket;
    private callbacks;
    private invocationId;
    private keepAliveInterval;
    constructor(hubUrl: string, apiKey: string, group?: string | undefined);
    start(): Promise<void>;
    /**
     * Listen for messages from the server.
     */
    on(methodName: string, callback: (...args: any[]) => void): void;
    /**
     * Send a message to the server.
     */
    send(methodName: string, ...args: any[]): void;
    private handleMessage;
    private startKeepAlive;
    private cleanup;
}
//# sourceMappingURL=TinySignalRClient.d.ts.map