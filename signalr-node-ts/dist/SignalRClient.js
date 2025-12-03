"use strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
// SignalRClient.ts
// A zero-dependency shim that provides:
// 1. Microsoft SignalR compatibility (HubConnection, HubConnectionBuilder, Enums)
// 2. A simplified, GENERIC TinySignalRClient class
// 3. Robust connection resilience (Auto-reconnect, Negotiation, Keep-Alive)
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalRClient = exports.HubConnectionBuilder = exports.HubConnection = exports.LogLevel = void 0;
// -------------------------------------------------------------------------
// 2. Microsoft SignalR Enums
// -------------------------------------------------------------------------
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["Trace"] = 0] = "Trace";
    LogLevel[LogLevel["Debug"] = 1] = "Debug";
    LogLevel[LogLevel["Information"] = 2] = "Information";
    LogLevel[LogLevel["Warning"] = 3] = "Warning";
    LogLevel[LogLevel["Error"] = 4] = "Error";
    LogLevel[LogLevel["Critical"] = 5] = "Critical";
    LogLevel[LogLevel["None"] = 6] = "None";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
// -------------------------------------------------------------------------
// 3. The Engine: HubConnection
// -------------------------------------------------------------------------
class HubConnection {
    constructor(url, apiKey, group, options) {
        this.connectionId = null;
        this.socket = null;
        this.listeners = new Map();
        this.invocationId = 0;
        this.pendingInvocations = new Map();
        // State
        this.isStopped = true;
        this.reconnectDelays = [0, 2000, 5000, 10000, 30000];
        this.logLevel = LogLevel.Information;
        // Callbacks
        this.onReconnectingCallbacks = [];
        this.onReconnectedCallbacks = [];
        this.onCloseCallbacks = [];
        this.baseUrl = url;
        this.apiKey = apiKey;
        this.group = group;
        this.options = options;
    }
    // --- Public API ---
    async start() {
        this.isStopped = false;
        await this.connectInternal();
    }
    async stop() {
        this.isStopped = true;
        this.cleanup();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
    on(methodName, newMethod) {
        const key = methodName.toLowerCase();
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)?.push(newMethod);
    }
    off(methodName, method) {
        const key = methodName.toLowerCase();
        const handlers = this.listeners.get(key);
        if (handlers) {
            this.listeners.set(key, handlers.filter(h => h !== method));
        }
    }
    /**
     * Invokes a hub method on the server.
     * The caller is responsible for passing the correct number and type of arguments.
     */
    invoke(methodName, ...args) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error(`Cannot invoke '${methodName}': Socket is not open.`));
        }
        this.invocationId++;
        const invId = this.invocationId.toString();
        const packet = {
            type: 1,
            target: methodName,
            arguments: args, // Arrays/Objects passed here are serialized automatically
            invocationId: invId
        };
        return new Promise((resolve, reject) => {
            // 30s timeout default
            const tm = setTimeout(() => {
                if (this.pendingInvocations.has(invId)) {
                    this.pendingInvocations.delete(invId);
                    reject(new Error(`Invocation '${methodName}' timed out.`));
                }
            }, 30000);
            this.pendingInvocations.set(invId, {
                resolve: (val) => { clearTimeout(tm); resolve(val); },
                reject: (err) => { clearTimeout(tm); reject(err); }
            });
            this.socket?.send(JSON.stringify(packet) + '\x1e');
        });
    }
    // --- Configuration & Events ---
    onreconnecting(cb) { this.onReconnectingCallbacks.push(cb); }
    onreconnected(cb) { this.onReconnectedCallbacks.push(cb); }
    onclose(cb) { this.onCloseCallbacks.push(cb); }
    _setReconnectDelays(delays) { this.reconnectDelays = delays; }
    _setLogLevel(level) { this.logLevel = level; }
    // --- Core Logic ---
    async connectInternal(isReconnect = false) {
        let finalUrl = this.baseUrl;
        let accessToken = '';
        if (this.options.accessTokenFactory) {
            try {
                accessToken = await this.options.accessTokenFactory();
            }
            catch (e) {
                console.error("Error getting access token:", e);
            }
        }
        // 1. Negotiate (Base URL only)
        if (!this.options.skipNegotiation) {
            //const negotiateUrl = this.resolveNegotiateUrl(this.baseUrl);
            var negotiateUrl = `${this.baseUrl}/negotiate?apiKey=${encodeURIComponent(this.apiKey)}`;
            if (this.group) {
                negotiateUrl += `&group=${encodeURIComponent(this.group)}`;
            }
            try {
                const headers = {};
                if (accessToken)
                    headers['Authorization'] = `Bearer ${accessToken}`;
                const response = await fetch(negotiateUrl, { method: 'POST', headers });
                if (!response.ok)
                    throw new Error(`Negotiate failed: ${response.status} ${response.statusText}`);
                // Cast response to known shape
                const negotiation = (await response.json());
                // 2. Construct WebSocket URL
                let wsUrl = "";
                if (negotiation.url) {
                    // SCENARIO A: Azure SignalR or Server Redirect
                    // The server gave us a specific URL to connect to.
                    wsUrl = negotiation.url.replace(/^http/, "ws");
                }
                else {
                    // SCENARIO B: Local / Standard SignalR
                    // The server gave us an ID, we must connect to the BASE Hub URL.
                    wsUrl = this.baseUrl.replace(/^http/, "ws");
                    // Attach the connection ID so the server knows who we are
                    if (negotiation.connectionId) {
                        wsUrl += (wsUrl.indexOf("?") < 0 ? "?" : "&") + `id=${encodeURIComponent(negotiation.connectionId)}`;
                    }
                }
                this.log(LogLevel.Information, "WS URL:", wsUrl);
                const neg = negotiation;
                if (neg.url) {
                    finalUrl = neg.url;
                    if (neg.accessToken)
                        accessToken = neg.accessToken;
                }
                else if (neg.connectionId) {
                    this.connectionId = neg.connectionId;
                    const symbol = finalUrl.indexOf('?') === -1 ? '?' : '&';
                    finalUrl += `${symbol}id=${neg.connectionId}`;
                }
                this.log(LogLevel.Information, "finalUrl:", finalUrl);
            }
            catch (e) {
                this.log(LogLevel.Error, 'Negotiation failed', e);
                throw e;
            }
        }
        this.log(LogLevel.Information, finalUrl);
        // 2. Construct WebSocket URL
        let wsUrl = finalUrl.replace(/^http/, 'ws');
        if (accessToken) {
            const symbol = wsUrl.indexOf('?') === -1 ? '?' : '&';
            wsUrl += `${symbol}access_token=${encodeURIComponent(accessToken)}`;
        }
        // Apply WebSocket-specific params (like 'group')
        if (this.options.webSocketQueryParams) {
            for (const [key, value] of Object.entries(this.options.webSocketQueryParams)) {
                const symbol = wsUrl.indexOf('?') === -1 ? '?' : '&';
                wsUrl += `${symbol}${key}=${encodeURIComponent(value)}`;
            }
        }
        // 3. Connect Socket
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            this.socket = ws;
            // --- NEW: Capture Handshake Errors ---
            // (ws as any).on('unexpected-response', (req: any, res: any) => {
            //     const debugInfo = `HTTP ${res.statusCode} ${res.statusMessage}`;
            //     // Read the response body if possible to see error details
            //     let body = '';
            //     res.on('data', (chunk: any) => body += chunk);
            //     res.on('end', () => {
            //         this.log(LogLevel.Error, `Connection rejected by server: ${debugInfo}`, body);
            //         // The 'error' event will usually follow this, but we log explicitly here
            //     });
            // });
            ws.onopen = () => {
                this.log(LogLevel.Debug, 'WebSocket Connected. Sending Handshake.');
                ws.send(`{"protocol":"json","version":1}\x1e`);
            };
            ws.onerror = (e) => {
                const msg = e.message || "WebSocket Error";
                // Don't reject if we are just reconnecting automatically
                if (!isReconnect && !this.connectionId) {
                    // Try to provide a hint if it's the generic non-101 error
                    if (msg.includes('non-101')) {
                        reject(new Error(`${msg} (See logs above for Status Code)`));
                    }
                    else {
                        reject(new Error(msg));
                    }
                }
                else {
                    this.log(LogLevel.Error, msg);
                }
            };
            ws.onclose = (e) => {
                this.cleanup();
                this.log(LogLevel.Information, `WebSocket Closed. Code: ${e.code} Reason: ${e.reason}`);
                if (this.isStopped)
                    this.fireCloseCallbacks();
                else
                    this.handleAutomaticReconnect();
            };
            ws.onmessage = (event) => {
                this.handleRawMessage(event, () => {
                    this.startKeepAlive();
                    if (isReconnect)
                        this.fireReconnectedCallbacks();
                    resolve();
                });
            };
        });
    }
    async handleAutomaticReconnect() {
        if (!this.reconnectDelays.length) {
            this.fireCloseCallbacks(new Error('Connection dropped'));
            return;
        }
        this.fireReconnectingCallbacks(new Error('Reconnecting...'));
        for (const delay of this.reconnectDelays) {
            if (this.isStopped)
                return;
            this.log(LogLevel.Information, `Reconnecting in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            try {
                await this.connectInternal(true);
                return;
            }
            catch (e) {
                this.log(LogLevel.Warning, 'Reconnect attempt failed.');
            }
        }
        this.isStopped = true;
        this.fireCloseCallbacks(new Error('All reconnect attempts failed.'));
    }
    handleRawMessage(event, onHandshake) {
        const raw = event.data.toString();
        const messages = raw.split('\x1e');
        for (const msg of messages) {
            if (!msg)
                continue;
            if (msg === '{}') {
                onHandshake();
                continue;
            }
            try {
                const data = JSON.parse(msg);
                if (data.type === 1) {
                    const target = (data.target || '').toLowerCase();
                    const handlers = this.listeners.get(target);
                    handlers?.forEach(h => h(...(data.arguments || [])));
                }
                else if (data.type === 3) {
                    const p = this.pendingInvocations.get(data.invocationId);
                    if (p) {
                        this.pendingInvocations.delete(data.invocationId);
                        if (data.error)
                            p.reject(new Error(data.error));
                        else
                            p.resolve(data.result);
                    }
                }
            }
            catch (err) {
                this.log(LogLevel.Error, 'Error parsing message', err);
            }
        }
    }
    resolveNegotiateUrl(url) {
        const index = url.indexOf('?');
        let base = url;
        let query = '';
        // Separate the Base URL (Path) from the Query String
        if (index !== -1) {
            base = url.substring(0, index);
            query = url.substring(index);
        }
        // Append /negotiate to the path
        base = base.replace(/\/$/, '') + '/negotiate';
        // Reconstruct: Path/negotiate + Original Query + Negotiate Version
        let u = base + query;
        // u += (u.indexOf('?') === -1 ? '?' : '&') + 'negotiateVersion=1';
        u += "&group=mediasix%2Fworkflow-test";
        return u;
    }
    startKeepAlive() {
        clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN)
                this.socket.send(`{"type":6}\x1e`);
        }, 15000);
    }
    cleanup() {
        clearInterval(this.keepAliveInterval);
        this.pendingInvocations.forEach(p => p.reject(new Error('Connection closed')));
        this.pendingInvocations.clear();
    }
    fireReconnectingCallbacks(err) { this.onReconnectingCallbacks.forEach(cb => { try {
        cb(err);
    }
    catch { } }); }
    fireReconnectedCallbacks() { const id = this.connectionId || undefined; this.onReconnectedCallbacks.forEach(cb => { try {
        cb(id);
    }
    catch { } }); }
    fireCloseCallbacks(err) { this.onCloseCallbacks.forEach(cb => { try {
        cb(err);
    }
    catch { } }); }
    log(level, msg, ...args) {
        if (level >= this.logLevel) {
            const prefix = `[${new Date().toISOString()}]`;
            if (level >= LogLevel.Error)
                console.error(prefix, msg, ...args);
            else
                console.log(prefix, msg, ...args);
        }
    }
}
exports.HubConnection = HubConnection;
// -------------------------------------------------------------------------
// 4. HubConnectionBuilder
// -------------------------------------------------------------------------
class HubConnectionBuilder {
    constructor() {
        this.url = '';
        this.apiKey = '';
        this.group = '';
        this.options = {};
        this.reconnectDelays = [0, 2000, 10000, 30000];
        this.logLevel = LogLevel.Information;
    }
    withUrl(url, options) {
        this.url = url;
        if (options)
            this.options = options;
        return this;
    }
    withApiKey(apiKey) {
        this.apiKey = apiKey;
        return this;
    }
    withGroup(group) {
        this.group = group;
        return this;
    }
    withAutomaticReconnect(retryDelays) {
        if (retryDelays)
            this.reconnectDelays = retryDelays;
        return this;
    }
    configureLogging(logLevel) {
        this.logLevel = logLevel;
        return this;
    }
    build() {
        if (!this.url)
            throw new Error('HubConnectionBuilder.withUrl is required.');
        const conn = new HubConnection(this.url, this.apiKey, this.group, this.options);
        conn._setReconnectDelays(this.reconnectDelays);
        conn._setLogLevel(this.logLevel);
        return conn;
    }
}
exports.HubConnectionBuilder = HubConnectionBuilder;
// -------------------------------------------------------------------------
// 5. TinySignalRClient (Simplified Generic Wrapper)
// -------------------------------------------------------------------------
class SignalRClient {
    constructor(hubUrl, apiKey, hubPath) {
        // 1. Construct Base URL (for Negotiate)
        let baseUrl = hubUrl;
        const sym = baseUrl.indexOf('?') === -1 ? '?' : '&';
        //baseUrl += `${sym}apiKey=${encodeURIComponent(apiKey)}`;
        // 2. Prepare WebSocket-only params
        const wsParams = {};
        if (hubPath) {
            wsParams['group'] = hubPath;
        }
        this.connection = new HubConnectionBuilder()
            .withUrl(baseUrl, {
            webSocketQueryParams: wsParams
        })
            .withApiKey(apiKey)
            .withGroup(hubPath)
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();
    }
    async start() {
        return this.connection.start();
    }
    async stop() {
        return this.connection.stop();
    }
    /**
     * Subscribes to a Hub method.
     * @param methodName The name of the method to listen for.
     * @param callback A function to execute when the method is called.
     */
    on(methodName, callback) {
        this.connection.on(methodName, callback);
    }
    /**
     * Sends a message to the Hub.
     * @param methodName The name of the Hub method to invoke.
     * @param args The arguments to pass to the method.
     */
    async send(methodName, ...args) {
        // Return the promise so the caller can await completion/results if needed
        return this.connection.invoke(methodName, ...args);
    }
}
exports.SignalRClient = SignalRClient;
//# sourceMappingURL=SignalRClient.js.map