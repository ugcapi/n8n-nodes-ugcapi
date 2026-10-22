import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class UgcApiApi implements ICredentialType {
	name = 'ugcApiApi';

	displayName = 'UGC API';

	documentationUrl = 'https://github.com/ugcapi/n8n-nodes-ugcapi#authentication';

	icon = { light: 'file:ugcapi.svg', dark: 'file:ugcapi.svg' } as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create a key in the UGC API dashboard. It starts with ugc_live_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: 'https://ugcapi.dev', url: '/v1/usage', method: 'GET' },
	};
}
