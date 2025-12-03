"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const SignalRClient_1 = require("./SignalRClient");
// Configuration
// Use 127.0.0.1 instead of localhost to prevent node from defaulting to IPv6 (::1)
const HUB_URL = "http://127.0.0.1:5268/workflow";
const API_KEY = "AN9FMzZ4ZeHgNutVXJ9OdLYIyRha2ovIrTXJAEvjgD9nypxS";
const WORKFLOW_PATH = "mediasix/workflow-test";
async function main() {
    // var tinyClient = new TinySignalRClient(HUB_URL, API_KEY, WORKFLOW_PATH);
    // tinyClient.start();
    // 1. Initialize Client
    // We pass the path here so the generic client injects it into the WebSocket URL.
    // This allows the server's OnConnectedAsync to register the group immediately.
    const client = new SignalRClient_1.SignalRClient(HUB_URL, API_KEY, WORKFLOW_PATH);
    // 2. Setup Listeners
    client.on("ExecutePrivateWorkflow", async (request) => {
        console.log(`[RECEIVED] Request ID: ${request.requestId}`);
        // --- Business Logic Start ---
        // Simulate processing time
        // await new Promise(r => setTimeout(r, 500)); 
        const processingResult = {
            status: "success",
            data: "Processed by Node.js Client",
            timestamp: new Date().toISOString()
        };
        // --- Business Logic End ---
        // 3. Construct Response
        // Use strict camelCase properties to match PrivateWorkflowResponse interface
        // and standard SignalR JSON serialization.
        const response = {
            requestId: request.requestId || "", // Handle potential undefined
            statusCode: 200,
            path: request.path || "",
            payload: JSON.stringify(processingResult),
        };
        try {
            console.log("Sending completion response...");
            await client.send("CompletePrivateWorkflow", response);
            console.log("Response delivered.");
        }
        catch (err) {
            console.error("Failed to send response:", err);
        }
    });
    // 3. Connect with Startup Retry Logic
    // client.start() throws if the initial connection fails. We loop until it succeeds.
    console.log("Starting client...");
    while (true) {
        try {
            await client.start();
            console.log("Connected to Hub.");
            break; // Exit loop on success
        }
        catch (err) {
            console.error("Connection failed. Retrying in 5 seconds...");
            // Cast error to access message safely
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Error details: ${msg}`);
            // Wait 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    // 4. Register and Run
    try {
        // We still send the registration packet so the custom _tracker on the server is updated
        // (even though the group was likely added via the WebSocket URL params)
        const registrationPayload = {
            apiKey: API_KEY,
            path: WORKFLOW_PATH,
        };
        await client.send("RegisterPrivateWorkflow", registrationPayload);
        console.log(`Registered for path: ${WORKFLOW_PATH}`);
        console.log("Listening for messages. Press Ctrl+C to exit.");
    }
    catch (err) {
        console.error("Registration failed:", err);
        // We generally don't exit here; the connection might still be alive
    }
}
main();
//# sourceMappingURL=index.js.map