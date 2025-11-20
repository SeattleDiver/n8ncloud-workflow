// TinySignalRClient.ts
export class TinySignalRClient {
    private socket: WebSocket | null = null;
    private callbacks = new Map<string, (...args: any[]) => void>();
    private invocationId = 0;
    private keepAliveInterval: any;
    
    constructor(
        private hubUrl: string, 
        private apiKey: string
    ) {}


    async start(): Promise<void> {
        // 1. Negotiate
        const negotiateUrl = `${this.hubUrl}/negotiate?apiKey=${encodeURIComponent(this.apiKey)}`;
        const response = await fetch(negotiateUrl, { method: "POST" });
        
        if (!response.ok) throw new Error(`Negotiation failed: ${response.status} ${response.statusText}`);
        
        // Cast response to known shape
        const negotiation = (await response.json()) as { 
            url?: string; 
            accessToken?: string; 
            connectionId?: string; 
        };

        // 2. Construct WebSocket URL
        let wsUrl = "";
        
        if (negotiation.url) {
            // SCENARIO A: Azure SignalR or Server Redirect
            // The server gave us a specific URL to connect to.
            wsUrl = negotiation.url.replace(/^http/, "ws");
        } else {
            // SCENARIO B: Local / Standard SignalR
            // The server gave us an ID, we must connect to the BASE Hub URL.
            wsUrl = this.hubUrl.replace(/^http/, "ws");
            
            // Attach the connection ID so the server knows who we are
            if (negotiation.connectionId) {
                wsUrl += (wsUrl.indexOf("?") < 0 ? "?" : "&") + `id=${encodeURIComponent(negotiation.connectionId)}`;
            }
        }

        // 3. Attach Access Token (if provided by negotiate response)
        if (negotiation.accessToken) {
            wsUrl += (wsUrl.indexOf("?") < 0 ? "?" : "&") + `access_token=${encodeURIComponent(negotiation.accessToken)}`;
        }

        // 4. Open Socket
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(wsUrl);
            // ... rest of the method remains the same ...
            this.socket.onopen = () => {
                console.log("Socket Open. Sending Handshake...");
                this.socket?.send(`{"protocol":"json","version":1}\x1e`);
            };
            
            this.socket.onerror = (err) => {
                // Only reject if we haven't established a connection yet
                if (!this.keepAliveInterval) reject(err);
            };

            this.socket.onmessage = (event) => this.handleMessage(event, resolve);
            
            this.socket.onclose = () => {
                console.log("Socket disconnected.");
                this.cleanup();
            };
        });
    }
    
    /**
     * Connects to the server.
     */
    // async start(): Promise<void> {
    //     // 1. Negotiate (Get Azure URL + Token)
    //     const negotiateUrl = `${this.hubUrl}/negotiate?apiKey=${encodeURIComponent(this.apiKey)}`;
    //     const response = await fetch(negotiateUrl, { method: "POST" });
        
    //     if (!response.ok) throw new Error(`Negotiation failed: ${response.status} ${response.statusText}`);
    //     //const negotiation = await response.json();
    //     const negotiation = (await response.json()) as { url?: string; accessToken?: string };

    //     // 2. Construct WebSocket URL
    //     const endpoint = negotiation.url || negotiateUrl;
    //     const token = negotiation.accessToken;
    //     let wsUrl = endpoint.replace(/^http/, "ws");
    //     if (token) wsUrl += (wsUrl.indexOf("?") < 0 ? "?" : "&") + `access_token=${encodeURIComponent(token)}`;

    //     // 3. Open Socket
    //     return new Promise((resolve, reject) => {
    //         this.socket = new WebSocket(wsUrl);

    //         this.socket.onopen = () => {
    //             console.log("Socket Open. Sending Handshake...");
    //             this.socket?.send(`{"protocol":"json","version":1}\x1e`);
    //         };

    //         this.socket.onerror = (err) => {
    //             if (!this.keepAliveInterval) reject(err);
    //         };

    //         this.socket.onmessage = (event) => this.handleMessage(event, resolve);
            
    //         this.socket.onclose = () => {
    //             console.log("Socket disconnected.");
    //             this.cleanup();
    //         };
    //     });
    // }

    /**
     * Listen for messages from the server.
     */
    on(methodName: string, callback: (...args: any[]) => void) {
        this.callbacks.set(methodName, callback);
    }

    /**
     * Send a message to the server.
     */
    send(methodName: string, ...args: any[]) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn("Cannot send: Socket not open");
            return;
        }
        this.invocationId++;
        const packet = {
            type: 1,
            target: methodName,
            arguments: args,
            invocationId: this.invocationId.toString()
        };
        this.socket.send(JSON.stringify(packet) + "\x1e");
    }

    // private handleMessage(event: MessageEvent, resolveHandshake: () => void) {
    //     const rawText = event.data.toString();
    //     const messages = rawText.split("\x1e");

    //     for (const msg of messages) {
    //         if (!msg) continue;

    //         // Handle Handshake Response
    //         if (msg === "{}") {
    //             console.log("Handshake Complete. Connected!");
    //             this.startKeepAlive();
    //             resolveHandshake();
    //             continue;
    //         }

    //         try {
    //             const data = JSON.parse(msg);
                
    //             // Type 1: Invocation (Server calling us)
    //             if (data.type === 1 && data.target) {
    //                 const cb = this.callbacks.get(data.target);
    //                 if (cb) cb(...(data.arguments || []));
    //             }
    //             // Type 6: Ping (Keep-Alive)
    //             else if (data.type === 6) {
    //                 // Optional: Reset timeout timer here
    //             }
    //         } catch (e) { /* Ignore partial frames */ }
    //     }
    // }

    private handleMessage(event: MessageEvent, resolveHandshake: () => void) {
        const rawText = event.data.toString();
        const messages = rawText.split("\x1e");

        for (const msg of messages) {
            if (!msg) continue;

            // Handle Handshake Response
            if (msg === "{}") {
                console.log("Handshake Complete. Connected!");
                this.startKeepAlive();
                resolveHandshake();
                continue;
            }

            try {
                const data = JSON.parse(msg);
                console.log("Message received.  type=" + data.type + " " + data.target);
                
                // Type 1: Invocation (Server calling us)
                if (data.type === 1 && data.target) {
                    const cb = this.callbacks.get(data.target);
                    console.log("Handshake Complete. Connected!");
                    if (cb) cb(...(data.arguments || []));
                }
                // Type 3: Completion (Response to OUR send) - CRITICAL FOR DEBUGGING
                else if (data.type === 3) {
                    if (data.error) {
                        console.error(`[SIGNALR ERROR] Hub rejected invocation ${data.invocationId}:`, data.error);
                    } else {
                        // console.log(`[SUCCESS] Invocation ${data.invocationId} completed.`);
                    }
                }
                // Type 6: Ping (Keep-Alive)
                else if (data.type === 6) {
                    // Heartbeat received
                }
            } catch (e) { 
                console.error("Error parsing message:", msg, e);
            }
        }
    }
    private startKeepAlive() {
        // Send a ping every 15 seconds to keep Azure connection healthy
        this.keepAliveInterval = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(`{"type":6}\x1e`);
            }
        }, 15000);
    }

    private cleanup() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    }
}