import { ITriggerFunctions, INodeType, INodeTypeDescription, ITriggerResponse, NodeOperationError, jsonStringify } from 'n8n-workflow';
import { SignalRPrivateWorkflowClient } from '../../library/SignalRPrivateWorkflowClient'
import { PrivateWorkflowResponseRegistry } from '../../library/PrivateWorkflowResponseRegistry';
import crypto from 'crypto'

export class PrivateWorkflowTrigger implements INodeType {

	onceResolvers: Array<() => void> = [];

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
						isSingleNodeRun: false,
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
						onExecute: async ({ request, decodedJson, decodedText }) => {

							try {

								// Reset the isSingleNodeRun flag
								(client as any).cfg.isSingleNodeRun = false;

								// Prepare the item
								//const item = decodedJson ?? { text: decodedText ?? null };
								const base = (decodedJson && typeof decodedJson === 'object' && 'json' in decodedJson)
									? (decodedJson as any).json
									: decodedJson ?? { text: decodedText ?? null };

							  const requestId =
										request?.requestId ??
										request?.RequestId ??
										'unknown';

  							// Get the respond mode selected in node UI
								const respondMode = this.getNodeParameter('respond', 0) as string;
								this.logger.info('respondMode: '+ respondMode);
								this.logger.info('requestId: ' + requestId);
								this.logger.info('json: ' + jsonStringify(decodedJson));

								switch (respondMode) {

									// ------------------------------------------------------------------------------------------------
									// 1️⃣ Respond Immediately
									// ------------------------------------------------------------------------------------------------
									case 'immediately':
										// Emit the message into n8n for normal workflow execution
										self.emit([self.helpers.returnJsonArray([base])]);

										self.logger?.info?.('[PrivateWorkflowTrigger] Responding immediately to hub...');
										return {
											ok: true,
											mode: respondMode,
											receivedAt: new Date().toISOString(),
										};

									// ------------------------------------------------------------------------------------
									// 2️⃣ RESPOND TO PRIVATE WORKFLOW
									// ------------------------------------------------------------------------------------
									case 'respondToPrivateWorkflow': {

										const correlationId = crypto.randomUUID();
										const payload = { ...base, correlationId };

										// Emit to workflow (starts a new execution in n8n)
										self.emit([self.helpers.returnJsonArray([payload])]);
										self.logger?.info?.(`[PrivateWorkflowTrigger] Emitted payload with correlationId=${correlationId}`);

										const entry = {
											client,     // the live SignalRPrivateWorkflowClient
											requestId,  // original hub RequestId
											path: hubPath,
											isManual: this.getMode && this.getMode() === 'manual',
											timeout: setTimeout(() => {
												PrivateWorkflowResponseRegistry.delete(correlationId);
												self.logger?.warn?.(
													`[PrivateWorkflowTrigger] Timeout waiting for response (correlationId=${correlationId})`
												);
											}, 120_000),
										};

										// Register the pending response in the global registry
										PrivateWorkflowResponseRegistry.register(correlationId, entry);

										self.logger?.info?.(
											`[PrivateWorkflowTrigger] Registered correlationId=${correlationId} for deferred response (requestId=${requestId})`
										);

										// 5️⃣ Do not send any hub response now; Respond node will do it explicitly
										// Simply return so n8n finishes trigger execution normally
										return;
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
				// const manualTriggerFunction = async function (this: ITriggerFunctions) {
				// 	await ensureStarted();
				// 	self.logger.info('[ManualMode] Waiting for SignalR messages...');

				// 	try {
				// 		// Wait for a message or timeout
				// 		await client.waitForNextMessage(60000);

				// 		// ✅ Wait until all pending responses are completed before stopping
				// 		let retries = 0;
				// 		while (PrivateWorkflowResponseRegistry.count() > 0 && retries < 30) {
				// 			self.logger.info(
				// 				`[ManualMode] Waiting for ${PrivateWorkflowResponseRegistry.count()} pending responses...`
				// 			);
				// 			await new Promise(r => setTimeout(r, 1000));
				// 			retries++;
				// 		}
				// 	} catch {
				// 		self.logger.info('Manual trigger aborted or timed out.');
				// 	} finally {
				// 		try {
				// 			await client.stop();
				// 			started = false;
				// 			self.logger.info('SignalR client stopped (after deferred responses).');
				// 		} catch (err) {
				// 			self.logger.warn(`Error stopping SignalR: ${(err as Error)?.message ?? err}`);
				// 		}
				// 	}
				// };

				// const manualTriggerFunction = async function (this: ITriggerFunctions) {

				// 	(client as any).cfg.isSingleNodeRun = true;

				// 	// Start connection if needed
				// 	await ensureStarted();

				// 	self.logger.info("[ManualMode] Trigger started — connection ensured, exiting immediately.");

				// 	// IMPORTANT: do not wait for messages, do not stop client
				// 	return;
				// };

				// const manualTriggerFunction = async function (this: ITriggerFunctions) {

				// 	(client as any).cfg.isSingleNodeRun = true;

				// 	// Start connection
				// 	await ensureStarted();

				// 	// Otherwise keep trigger open for workflow to respond
				// 	self.logger.info("[ManualMode] Full workflow manual run — keeping trigger alive.");
				// 	await new Promise<void>(() => {});
				// };

				const manualTriggerFunction = async function (this: ITriggerFunctions) {

					// Manual run only
					if (self.getMode() !== 'manual') {
						return;
					}

					self.logger.info('[ManualMode] Starting manual execution...');

					return new Promise<void>(async (resolve) => {

						// 1️⃣ Register resolver FIRST — critical
						(self as any).onceResolvers.push(resolve);

						// 2️⃣ Mark this workflow as single-node test mode
						//    (needs to be AFTER pushing resolver)
						(client as any).cfg.isSingleNodeRun = true;

						try {
							// 3️⃣ Wait for an inbound SignalR event OR cancellation/timeout
							self.logger.info('[ManualMode] Waiting for external event...');
							await client.waitForNextMessage(60000); // 60s like webhook test

						} catch (err) {
							self.logger.info(`[ManualMode] Aborted or timed out: ${String(err)}`);
						}

						// 4️⃣ Wait for deferred response to complete
						let retries = 0;
						while ((self as any).onceResolvers.length > 0 && retries < 60) { // up to 60s grace
							self.logger.info(
								`[ManualMode] Waiting for deferred resolver... pending=${(self as any).onceResolvers.length}`
							);
							await new Promise(r => setTimeout(r, 1000));
							retries++;
						}

						// 5️⃣ Shutdown SignalR cleanly
						try {
							await client.stop();
							self.logger.info('[ManualMode] SignalR connection stopped');
						} catch (err) {
							self.logger.warn(`[ManualMode] Error stopping SignalR: ${String(err)}`);
						}

						self.logger.info('[ManualMode] Completed manual execution');
					});
				};

				return {
            closeFunction,
            manualTriggerFunction,
        };
    }
}
