import { ITriggerFunctions, INodeType, INodeTypeDescription, ITriggerResponse, NodeOperationError } from 'n8n-workflow';
import { SignalRPrivateWorkflowClient } from '../../library/SignalRPrivateWorkflowClient'

export class PrivateWorkflowTrigger implements INodeType {

	description: INodeTypeDescription = {
			displayName: 'Execute Private Workflow Trigger',
			name: 'privateWorkflowTrigger',
			group: ['trigger'],
			version: 1,
			description: 'When a remote private workflow is executed',
			icon: 'file:cloud-network.svg',
			defaults: {
				name: 'Execute Private Workflow Trigger',
				color: '#00c896',
			},
			inputs: [],
			outputs: ['main'],
			credentials: [
				{
					name: 'privateWorkflowApi',
					required: true,
				},
			],
			properties: [
				{
					displayName: 'Hub Environment',
					name: 'hubUrl',
					type: 'options',
					default: 'http://localhost:5268/workflow',
					description: 'Select the environment for the SignalR hub connection.',
					options: [
						{
							name: 'Development',
							value: 'http://localhost:5268/workflow',
							description: 'Local development server.',
						},
						{
							name: 'Production',
							value: 'https://hub.n8ncloud.io/workflow',
							description: 'Cloud production server.',
						},
					],
				},
				{
					displayName: 'Workflow Name',
					name: 'hubPath',
					type: 'string',
					default: '',
					placeholder: 'e.g. mediasix/workflow-test',
					required: true,
					description: 'The private workflow path to invoke.',
				}
			],
		};

		// ------------------------------------------------------------------------------------------------------------------------------------------------
		// trigger is called when n8n runs the workflow trigger
		// ------------------------------------------------------------------------------------------------------------------------------------------------
    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

        const hubUrl = this.getNodeParameter('hubUrl', 0) as string;
        const hubPath = this.getNodeParameter('hubPath', 0) as string;

				const creds = (await this.getCredentials('privateWorkflowApi')) as {
      		apiKey?: string;
      		accessToken?: string;
    		} | null;

				if (!creds?.apiKey) {
     	 		throw new NodeOperationError(this.getNode(), 'API key is missing. Add it in the node credentials.');
    		}
        var apiKey = creds?.apiKey;
				this.logger.info("Using ApiKey: " + apiKey);

        // const accessToken = creds?.accessToken;
        // const apiKey = 'AN9FMzZ4ZeHgNutVXJ9OdLYIyRha2ovIrTXJAEvjgD9nypxS'; // <-- for testing only
        const accessToken = '';

        let started = false;
        let startingPromise: Promise<void> | null = null;

        const client = new SignalRPrivateWorkflowClient({
            hubUrl,
            hubPath,
            apiKey,
            accessToken,
            logLevel: 'info',
            logger: {
                info: (m, ...a) => this.logger.info(m, ...a),
                warn: (m, ...a) => this.logger.warn(m, ...a),
                error: (m, ...a) => this.logger.error(m, ...a),
            },
            onExecute: async ({ decodedJson, decodedText }) => {
                // Emit items into the workflow whenever the hub invokes ExecutePrivateWorkflow
                const item = decodedJson ?? { text: decodedText ?? null };
                this.emit([this.helpers.returnJsonArray([item])]);

                // Return a response body to the hub (encoded by the wrapper)
                return { ok: true, receivedAt: new Date().toISOString() };
            },
					  onConnectionError: async (err: unknown, ctx?: Record<string, unknown>) => {
								// 1) stop SignalR
								try { await client?.stop(); } catch {}
								this.logger.info('onConnectionError: ' + String(err));

								// 2) surface the error to n8n so the trigger terminates
								// const error = err instanceof Error ? err : new Error(String(err));
								// inside onConnectionError
								throw new NodeOperationError(this.getNode(), String(err));
						}
        });

        // Idempotent start helper
        const ensureStarted = async () => {
            if (started) return;
            if (!startingPromise) {
                startingPromise = (async () => {
                    await client.start(); // resolves only after the hub connection is established + registered
                    started = true;
                    startingPromise = null;
                    this.logger.info('SignalR connection established (ensureStarted)');
                })().catch((err) => {
                    startingPromise = null;
                    throw err;
                });
            }
            await startingPromise;
        };

        // Start on activation so scheduled/active workflows connect immediately
        await ensureStarted();

        // Clean shutdown when the workflow deactivates
        const closeFunction = async () => {
            try {
                await client.stop();
                started = false;
            } catch (e) {
                this.logger.warn(`Error while stopping SignalR client: ${(e as Error)?.message ?? e}`);
            }
        };

        // Manual execution in the editor:
        // - Start (or wait for) the SignalR connection
        // - Keep it running so incoming events stream to the UI
        // - Optionally, emit a small "connected" message so users see immediate feedback
        const manualTriggerFunction = async () => {
            // Ensure SignalR is connected/registered
            await ensureStarted();

            try {
                // Wait for the first ExecutePrivateWorkflow to arrive (60s timeout here)
                await client.waitForNextMessage(60000);
            } finally {
                // After the first message is processed+emitted, shut down for manual run
                try {
                    await client.stop();
                } catch {}
                started = false;
            }
        };

        return {
            closeFunction,
            manualTriggerFunction,
        };
    }
}
