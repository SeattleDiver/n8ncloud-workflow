"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TinySignalRClient_1 = require("./TinySignalRClient");
// Configuration
const HUB_URL = "http://localhost:5268/workflow"; // Or your Azure/Production URL
const API_KEY = "AN9FMzZ4ZeHgNutVXJ9OdLYIyRha2ovIrTXJAEvjgD9nypxS";
async function main() {
    const client = new TinySignalRClient_1.TinySignalRClient(HUB_URL, API_KEY);
    // 1. SETUP LISTENERS (Before connecting)
    const payload = {
        apiKey: API_KEY,
        path: "mediasix/workflow-test",
    };
    // Listen for 'ReceiveMessage' from the server
    client.on("ExecutePrivateWorkflow", (request) => {
        console.log(`[RECEIVED] Path ${request.Path}, Payload${request.payload}`);
        //client.send("SendMessage", "BotClient", replyText);
    });
    try {
        // 3. CONNECT
        console.log("Connecting...");
        await client.start();
        console.log("Listening for messages. Press Ctrl+C to exit.");
        client.send("RegisterPrivateWorkflow", payload);
        // 4. OPTIONAL: Send an initial greeting
        //client.send("SendMessage", "BotClient", "I am online and listening!");
    }
    catch (err) {
        console.error("Fatal Error:", err);
    }
}
main();
//# sourceMappingURL=index.js.map