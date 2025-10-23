import { ITriggerFunctions, INodeType, INodeTypeDescription, ITriggerResponse, NodeOperationError } from 'n8n-workflow';
import { SignalRPrivateWorkflowClient } from '../../library/SignalRPrivateWorkflowClient'
import { PrivateWorkflowResponseRegistry } from '../../library/PrivateWorkflowResponseRegistry';
import crypto from 'crypto'

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
					default: 'mediasix/workflow-test',
					placeholder: 'e.g. mediasix/workflow-test',
					required: true,
					description: 'The private workflow path to invoke.',
				},
				{
					displayName: 'Respond',
					name: 'respond',
					type: 'options',
					default: 'immediately',
					description: 'Specifies when to send a response to the SignalR client or private workflow',
					options: [
						{
							name: 'Immediately',
							value: 'immediately',
							description: 'Send an acknowledgement immediately after the trigger fires',
						},
						{
							name: 'When Last Node Finishes',
							value: 'whenLastNodeFinishes',
							description: 'Wait for the entire workflow to complete before responding',
						},
						{
							name: 'Respond to Private Workflow',
							value: 'respondToPrivateWorkflow',
							description: 'Wait for a dedicated "Respond to Private Workflow" node to send a response',
						},
					],
				},
			],
		};

		// ------------------------------------------------------------------------------------------------------------------------------------------------
		// trigger is called when n8n runs the workflow trigger
		// ------------------------------------------------------------------------------------------------------------------------------------------------
    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

			  const self = this;
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
				self.logger.info("Using ApiKey: " + apiKey);

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
                info: (m, ...a) => self.logger.info(m, ...a),
                warn: (m, ...a) => self.logger.warn(m, ...a),
                error: (m, ...a) => self.logger.error(m, ...a),
            },

						// -------------------------------------------------------------------------------------------------------------------------------------------
						// onExecute is called when the SignalR connection receives a message from the hub
						//   The payload may be encrypted. If we have a privateKey defined, then we must decrypt
						//   the payload before we use it
						// -------------------------------------------------------------------------------------------------------------------------------------------
						onExecute: async ({ decodedJson, decodedText }) => {
							try {

								// Prepare the item
								//const item = decodedJson ?? { text: decodedText ?? null };
								const base = (decodedJson && typeof decodedJson === 'object' && 'json' in decodedJson)
									? (decodedJson as any).json
									: decodedJson ?? { text: decodedText ?? null };

  							// Get the respond mode selected in node UI
								const respondMode = this.getNodeParameter('respond', 0) as string;
								this.logger.info('respondMode: '+ respondMode);

								switch (respondMode) {

									// ------------------------------------------------------------------------------------------------
									// 1️⃣ Respond Immediately
									// ------------------------------------------------------------------------------------------------
									case 'immediately': {
										// Emit the message into n8n for normal workflow execution
										self.emit([self.helpers.returnJsonArray([base])]);

										// Respond to SignalR client right away
										return {
											ok: true,
											mode: respondMode,
											receivedAt: new Date().toISOString(),
										};
									}

									// ------------------------------------------------------------------------------------------------
									// 2️⃣ Respond to Private Workflow
									// ------------------------------------------------------------------------------------------------
									case 'respondToPrivateWorkflow': {
										const correlationId = crypto.randomUUID();
										const payload = { ...base, correlationId };

										// Emit to workflow (starts execution)
										self.emit([self.helpers.returnJsonArray([payload])]);
										self.logger?.info?.(`[PrivateWorkflowTrigger] Emitted payload with correlationId=${correlationId}`);

										// Create registry entry for this request
										const entry = {
											resolve: (data: any) => {
												self.logger?.info?.(`[PrivateWorkflowTrigger] Response received for ${correlationId}`);
												// Optional: send hub response here if needed
											},
											reject: (err: any) => {
												self.logger?.warn?.(`[PrivateWorkflowTrigger] Rejected for ${correlationId}: ${err}`);
												// Optional: send hub error here
											},
											timeout: setTimeout(() => {
												PrivateWorkflowResponseRegistry.delete(correlationId);
												self.logger?.warn?.(`[PrivateWorkflowTrigger] Timeout for ${correlationId}`);
												// Optional: notify hub of timeout here
											}, 120_000),
											isManual: this.getMode && this.getMode() === 'manual',
										};

										// Register entry globally so Respond node can resolve it later
										PrivateWorkflowResponseRegistry.set(correlationId, entry);
										self.logger?.info?.(
											`[PrivateWorkflowTrigger] Waiting for RespondToPrivateWorkflow node (mode=${entry.isManual ? 'manual' : 'active'}) for ${correlationId}`
										);

										// The key: don't await here in manual mode
										if (entry.isManual) {
											self.logger?.info?.(`[ManualMode] Registered ${correlationId}, waiting for Respond node later.`);
											return { ok: true, correlationId };
										}

										// Wait until Respond node resolves this entry
										return await new Promise((resolve, reject) => {
											entry.resolve = resolve;
											entry.reject = reject;
										});
									}

									// ------------------------------------------------------------------------------------------------
									// 3️⃣ When Last Node Finishes  (placeholder – implemented later)
									// ------------------------------------------------------------------------------------------------
									case 'whenLastNodeFinishes': {
										// We'll fill this in next: wait until workflow execution finishes automatically
										// For now, behave same as immediate
										self.emit([self.helpers.returnJsonArray([base])]);
										return {
											ok: true,
											mode: respondMode,
											receivedAt: new Date().toISOString(),
											message: 'Placeholder until implemented',
										};
									}

									// ------------------------------------------------------------------------------------------------
									// Default fallback
									// ------------------------------------------------------------------------------------------------
									default: {
										self.logger?.warn?.(`Unknown respond mode: ${respondMode}`);
										self.emit([self.helpers.returnJsonArray([base])]);
										return { ok: true, receivedAt: new Date().toISOString() };
									}
								}


							} catch (err) {

								self.logger?.error?.(`Error in onExecute: ${(err as Error)?.message ?? err}`);
								return { ok: false, error: String(err) };

							}
						},

						onConnectionError: async (err: unknown, ctx?: Record<string, unknown>) => {
							try {
								await client?.stop();
								self.logger?.warn?.(`SignalR connection stopped due to error: ${String(err)}`);
							} catch (stopErr) {
								self.logger?.warn?.(`Error stopping SignalR: ${(stopErr as Error)?.message ?? stopErr}`);
							}

							// Properly propagate the error to n8n so the trigger terminates
							const error = err instanceof Error ? err : new Error(String(err));
							throw new NodeOperationError(self.getNode(), error);
						},
        });

        // Idempotent start helper
        const ensureStarted = async () => {
            if (started) return;
            if (!startingPromise) {
                startingPromise = (async () => {
                    await client.start(); // resolves only after the hub connection is established + registered
                    started = true;
                    startingPromise = null;
                    self.logger.info('SignalR connection established (ensureStarted)');
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
				const closeFunction = async function (this: ITriggerFunctions) {
					try {
						await client.stop();
						started = false;
						self.logger?.info('SignalR client stopped.');
					} catch (e) {
						self.logger?.warn(`Error while stopping SignalR: ${(e as Error)?.message ?? e}`);
					}
				};

        // Manual execution in the editor:
        // - Start (or wait for) the SignalR connection
        // - Keep it running so incoming events stream to the UI
        // - Optionally, emit a small "connected" message so users see immediate feedback
				const manualTriggerFunction = async function (this: ITriggerFunctions) {
						await ensureStarted();

						let stopped = false;

						const safeStop = async () => {
								if (!stopped) {
										stopped = true;
										try {
												await client.stop();
												self.logger.info('SignalR manual run stopped.');
										} catch (err) {
												self.logger.warn(`Error stopping SignalR: ${(err as Error)?.message ?? err}`);
										}
										started = false;
								}
						};

						try {
								// Wait for the next message or timeout
								await client.waitForNextMessage(60000);
						} catch (err) {
								// If the manual run is aborted (Stop clicked), n8n throws an error
								self.logger.info('Manual trigger aborted or timed out.');
						} finally {
								await safeStop();
						}
				};

				return {
            closeFunction,
            manualTriggerFunction,
        };
    }
}
