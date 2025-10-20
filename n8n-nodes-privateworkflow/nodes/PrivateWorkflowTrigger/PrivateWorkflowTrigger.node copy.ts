import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class PrivateWorkflowTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Execute Private Workflow Trigger',
		name: 'privateWorkflowTrigger',
		group: ['transform'],
		version: 1,
		description: 'When a remote private workflow is executed',
		defaults: { name: 'Execute Private Workflow Trigger' },
		icon: 'file:cloud-network.svg',
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
				displayName: 'Workflow Name',
				name: 'path',
				type: 'string',
				default: '',
				placeholder: 'e.g. mediasix/workflow-test',
				required: true,
				description: 'The private workflow path to invoke.',
			}
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Read credentials
		const creds = await this.getCredentials('privateWorkflowApi');
		const env = creds.environment as string;

		// Choose environment base URL
		let baseUrl = '';
		switch (env) {
			case 'production':
				baseUrl = creds.baseUrl as string;
				break;
			case 'development':
				baseUrl = creds.localUrl as string;
				break;
			case 'custom':
				baseUrl = creds.customUrl as string;
				break;
			default:
				throw new Error(`Unknown environment setting: ${env}`);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const path = this.getNodeParameter('path', i) as string;
				const payload = this.getNodeParameter('payload', i) as object;

				const response = await this.helpers.requestWithAuthentication.call(this, 'privateWorkflowApi', {
					method: 'POST',
					url: `${baseUrl}/api/workflow/${path}`,
					body: payload,
					json: true,
				});

				returnData.push({ json: response });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
