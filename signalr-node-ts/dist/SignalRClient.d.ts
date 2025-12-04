export declare enum LogLevel {
    Trace = 0,
    Debug = 1,
    Information = 2,
    Warning = 3,
    Error = 4,
    Critical = 5,
    None = 6
}
export interface IHttpConnectionOptions {
    skipNegotiation?: boolean;
    accessTokenFactory?: () => string | Promise<string>;
    webSocketQueryParams?: Record<string, string>;
}
export declare class HubConnection {
    connectionId: string | null;
    baseUrl: string;
    apiKey: string;
    group: string;
    private socket;
    private listeners;
    private invocationId;
    private pendingInvocations;
    private keepAliveInterval;
    private isStopped;
    private options;
    private reconnectDelays;
    private logLevel;
    private onReconnectingCallbacks;
    private onReconnectedCallbacks;
    private onCloseCallbacks;
    constructor(url: string, apiKey: string, group: string, options: IHttpConnectionOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    on(methodName: string, newMethod: (...args: any[]) => void): void;
    off(methodName: string, method: (...args: any[]) => void): void;
    /**
     * Invokes a hub method on the server.
     * The caller is responsible for passing the correct number and type of arguments.
     */
    invoke(methodName: string, ...args: any[]): Promise<any>;
    onreconnecting(cb: (error?: Error) => void): void;
    onreconnected(cb: (id?: string) => void): void;
    onclose(cb: (error?: Error) => void): void;
    _setReconnectDelays(delays: number[]): void;
    _setLogLevel(level: LogLevel): void;
    private connectInternal;
    private handleAutomaticReconnect;
    private handleRawMessage;
    private startKeepAlive;
    private cleanup;
    private fireReconnectingCallbacks;
    private fireReconnectedCallbacks;
    private fireCloseCallbacks;
    private log;
}
export declare class HubConnectionBuilder {
    private url;
    private apiKey;
    private group;
    private options;
    private reconnectDelays;
    private logLevel;
    withUrl(url: string, options?: IHttpConnectionOptions): this;
    withApiKey(apiKey: string): this;
    withGroup(group: string): this;
    withAutomaticReconnect(retryDelays?: number[]): this;
    configureLogging(logLevel: LogLevel): this;
    build(): HubConnection;
}
export declare class SignalRClient {
    private connection;
    constructor(hubUrl: string, apiKey: string, hubPath: string);
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Subscribes to a Hub method.
     * @param methodName The name of the method to listen for.
     * @param callback A function to execute when the method is called.
     */
    on(methodName: string, callback: (...args: any[]) => void): void;
    /**
     * Sends a message to the Hub.
     * @param methodName The name of the Hub method to invoke.
     * @param args The arguments to pass to the method.
     */
    send(methodName: string, ...args: any[]): Promise<any>;
    /**
     * Registers a callback to run when the connection is re-established
     * after being lost. Use this to re-register groups or workflows.
     * @param callback Function to execute. receives the new Connection ID.
     */
    onReconnected(callback: (connectionId?: string) => void): void;
}
//# sourceMappingURL=SignalRClient.d.ts.map