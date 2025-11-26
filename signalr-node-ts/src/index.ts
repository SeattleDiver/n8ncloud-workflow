import { TinySignalRClient } from './TinySignalRClient';
import { PrivateWorkflowRequest } from './PrivateWorkflowRequest';
import { PrivateWorkflowResponse } from './PrivateWorkflowResponse';

// Configuration
const HUB_URL = "http://localhost:5268/workflow"; // Or your Azure/Production URL
const API_KEY = "AN9FMzZ4ZeHgNutVXJ9OdLYIyRha2ovIrTXJAEvjgD9nypxS";
const PATH    = "mediasix/workflow-test";

async function main() {
    const client = new TinySignalRClient(HUB_URL, API_KEY, PATH);

    // 1. SETUP LISTENERS (Before connecting)
    const payload = {
        apiKey: API_KEY,
        path: PATH,
    };
    
    // Listen for 'ReceiveMessage' from the server
    client.on("ExecutePrivateWorkflow", (request: PrivateWorkflowRequest) => {
        console.log(`[RECEIVED] Path: ${request.Path || request.path || "?"}, Payload: ${request.payload}, Method:${request.method}`);

        // 2. CONSTRUCT THE RESPONSE
        var response: PrivateWorkflowResponse = {
            RequestId: request.RequestId || request.requestId || "",
            Path: request.Path || request.path || "",
            StatusCode: 200,
            Payload: request.Payload || request.payload || ""
        };
        client.send("CompletePrivateWorkflow", response);
    });

    try {
        // 3. CONNECT
        console.log("Connecting...");
        await client.start();
        console.log("Listening for messages. Press Ctrl+C to exit.");

        client.send("RegisterPrivateWorkflow", payload);

        // 4. OPTIONAL: Send an initial greeting
        //client.send("SendMessage", "BotClient", "I am online and listening!");

    } catch (err) {
        console.error("Fatal Error:", err);
    }
}

main();