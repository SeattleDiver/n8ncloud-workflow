export interface PrivateWorkflowRequest {
    requestId?: string;
    RequestId?: string;
    method?: string;
    Method?: string;
    path?: string;
    Path?: string;
    payload?: string;
    Payload?: string;
    headers?: Record<string, string>;
    Headers?: Record<string, string>;
    sessionId?: string;
    SessionId?: string;
}
export interface PrivateWorkflowResponse {
    RequestId: string;
    SessionId?: string;
    StatusCode: number;
    Path?: string;
    Headers?: Record<string, string>;
    Payload?: string;
    IsFinal: boolean;
}
export interface SignalRClientConfig {
    hubUrl: string;
    hubPath: string;
    apiKey?: string;
    accessToken?: string;
    logLevel?: 'none' | 'info' | 'debug';
    logger?: {
        info: (msg: string, ...args: any[]) => void;
        warn: (msg: string, ...args: any[]) => void;
        error: (msg: string, ...args: any[]) => void;
    };
    onExecute: (req: {
        raw: PrivateWorkflowRequest;
        decodedJson?: any;
        decodedText?: string;
    }) => Promise<any> | any;
    onConnectionError?: (error: unknown, context?: Record<string, unknown>) => void;
}
export declare class SignalRPrivateWorkflowClient {
    private conn;
    private readonly cfg;
    private readonly urlWithPath;
    constructor(cfg: SignalRClientConfig);
    private onceResolvers;
    waitForNextMessage(timeoutMs?: number): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    private buildConnection;
    private wireHandlers;
    private registerClient;
    private handleExecute;
    private log;
}
