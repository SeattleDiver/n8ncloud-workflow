import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { PrivateWorkflowResponseRegistry } from '../../library/PrivateWorkflowResponseRegistry';

export class RespondToPrivateWorkflow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Respond to Private Workflow',
		name: 'respondToPrivateWorkflow',
		group: ['output'],
		version: 1,
		description: 'Sends a response back to the Private Workflow Trigger via SignalR',
		icon: 'file:cloud-network.svg',
		defaults: {
			name: 'Respond to Private Workflow',
			color: '#00c896',
		},
		inputs: ['main'],
		outputs: [],
		properties: [
			{
				displayName: 'Response Data',
				name: 'responseData',
				type: 'json',
				default: '{}',
				description: 'The data to send back to the waiting Private Workflow Trigger.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		for (let i = 0; i < items.length; i++) {
			try {
				// Extract correlationId from incoming item (added by trigger)
				const correlationId = items[i].json.correlationId as string;

				if (!correlationId) {
					throw new NodeOperationError(
						this.getNode(),
						'No correlationId found in incoming workflow data. Ensure this workflow was triggered by Private Workflow Trigger (respondToPrivateWorkflow mode).',
					);
				}

				const responseData = this.getNodeParameter('responseData', i) as object;
				const key = String(correlationId);

				const entry = PrivateWorkflowResponseRegistry.get(correlationId);
				if (!entry) {
					this.logger?.warn?.(`[Respond] No pending response for ${correlationId}`);
					return [];
				}

				// Resolve whether manual or active
				entry.resolve(responseData);
				clearTimeout(entry.timeout);
				PrivateWorkflowResponseRegistry.delete(correlationId);

				this.logger?.info?.(`[RespondToPrivateWorkflow] Responded for correlationId=${key}`);

			} catch (err) {
				this.logger?.error?.(
					`[RespondToPrivateWorkflow] Error: ${(err as Error)?.message ?? err}`,
				);
				throw err;
			}
		}

		// Respond nodes typically have no downstream outputs
		return [];
	}
}
