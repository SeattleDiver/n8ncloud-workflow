import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
// import { randomUUID } from 'crypto';
import { PrivateWorkflowHttpClient } from '../../library/PrivateWorkflowHttpClient';
// import { PayloadEncryptor } from '../../library/PayloadEncryptor';

export class PrivateWorkflow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Execute Private Workflow',
		name: 'privateWorkflow',
		group: ['transform'],
		version: 1,
		description: 'Run a remote private workflow',
		defaults: {
			name: 'Execute Private Workflow',
		},
		icon: 'file:cloud-network.svg',
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'privateWorkflowApi', // must match your credentials class name
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Hub Environment',
				name: 'hubUrl',
				type: 'options',
				default: 'http://localhost:5268/api/workflow',
				description: 'Select the environment for the SignalR hub connection.',
				options: [
					{
						name: 'Development',
						value: 'http://localhost:5268/api/workflow',
						description: 'Local development server.',
					},
					{
						name: 'Production',
						value: 'https://hub.n8ncloud.io/api/workflow',
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
			},
			{
				displayName: 'Payload (JSON)',
				name: 'payload',
				type: 'json',
				default: '{}',
				description: 'The JSON payload to send to the Private Workflow.',
			}
		]
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const creds = await this.getCredentials('privateWorkflowApi');
		const apiKey = creds.apiKey as string;

		for (let i = 0; i < items.length; i++) {
			try {
				// Extract parameters
				const hubUrl = this.getNodeParameter('hubUrl', i) as string;
				const hubPath = this.getNodeParameter('hubPath', i) as string;
				const payload = this.getNodeParameter('payload', i) as object;

				// Construct target URL
				const normalizedHubUrl = hubUrl.replace(/\/+$/, '');
				const normalizedHubPath = hubPath.replace(/^\/+/, '');
				const targetUrl = `${normalizedHubUrl}/${normalizedHubPath}`;

				// Base64 encode payload (already encrypted externally if needed)
				const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

				// Build PrivateWorkflowRequest (C# model)
				const request = {
					RequestId: crypto.randomUUID(),
					Path: hubPath,
					Headers: { 'x-source': 'n8ncloud' },
					Payload: encodedPayload,
					DeadlineUtc: new Date(Date.now() + 30000).toISOString(),
					Tenant: null,
					StreamResponse: false,
				};

				// Send request
				const client = new PrivateWorkflowHttpClient({
					apiKey,
					verifySSL: !hubUrl.includes('localhost'),
				});

			  this.logger.info("Calling private workflow "+ hubPath + " @ Hub Url:" + hubUrl + " apiKey:" + apiKey);
				const response = await client.post(targetUrl, request);

				returnData.push({ json: { request, response } });
			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}

}
