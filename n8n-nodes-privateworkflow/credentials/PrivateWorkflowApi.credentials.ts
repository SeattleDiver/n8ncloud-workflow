import type {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
	IHttpRequestMethods,
} from 'n8n-workflow';

export class PrivateWorkflowApi implements ICredentialType {
	name = 'privateWorkflowApi';
	displayName = 'Private Workflow API';
	documentationUrl = 'https://www.n8ncloud.io/docs';

	// 👇 The standard n8n properties definition
	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'baseUrl',
			type: 'options',
			default: 'http://localhost:5268',
			description: 'Select the environment for the Private Workflow API.',
			options: [
				{
					name: 'Development',
					value: 'http://localhost:5268',
				},
				{
					name: 'Production',
					value: 'https://hub.n8ncloud.io',
				},
			],
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'API key for authenticating with the n8nCloud Private Workflow API.',
		},
		{
			displayName: 'Public Key (Encrypt Payloads)',
			name: 'publicKey',
			type: 'string',
			typeOptions: { rows: 4, password: false },
			default: '',
			required: false,
			description: 'Public key used to encrypt/decrypt messages with Private Workflow instances.',
		},
		{
			displayName: 'Private Key (Decrypt Payloads)',
			name: 'privateKey',
			type: 'string',
			typeOptions: { rows: 4, password: false },
			default: '',
			required: false,
			description: 'Private key used to decrypt/encrypt requests and responses.',
		},
	];

	// Define the built-in test connection configuration
	test: ICredentialTestRequest = {
		request: {
			method: 'GET' as IHttpRequestMethods,
			url: '={{$credentials.baseUrl}}/api/apikeys/verify',
			qs: {
				apiKey: '={{$credentials.apiKey}}',
			},
		},
	};
}
