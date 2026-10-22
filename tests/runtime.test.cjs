const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { UgcApi } = require('../' + pkg.n8n.nodes[0]);
const { UgcApiApi } = require('../' + pkg.n8n.credentials[0]);
const node = new UgcApi();

const REQUIRED = {
	'account:createConnectLink': { platform: 'tiktok' },
	'account:getCreatorInfo': { accountId: 'acc_1' },
	'account:disconnect': { accountId: 'acc_1' },
	'campaign:create': {
		accounts: ['acc_1'],
		posts: '[{"format":"video","media":["https://x.test/a.mp4"]}]',
	},
	'campaign:get': { campaignId: 'cmp_1' },
	'campaign:cancel': { campaignId: 'cmp_1' },
	'post:create': { accounts: ['acc_1'], format: 'video', media: 'https://x.test/a.mp4' },
	'post:get': { postId: 'post_1' },
	'post:cancel': { postId: 'post_1' },
	'post:retry': { postId: 'post_1' },
	'media:upload': { binaryPropertyName: 'data' },
};
const EXPECTED = {
	'account:getAll': ['GET', '/v1/accounts'],
	'account:createConnectLink': ['POST', '/v1/accounts/connect'],
	'account:getCreatorInfo': ['GET', '/v1/accounts/acc_1/creator_info'],
	'account:disconnect': ['DELETE', '/v1/accounts/acc_1'],
	'campaign:create': ['POST', '/v1/campaigns'],
	'campaign:get': ['GET', '/v1/campaigns/cmp_1'],
	'campaign:getAll': ['GET', '/v1/campaigns'],
	'campaign:cancel': ['DELETE', '/v1/campaigns/cmp_1'],
	'media:upload': ['POST', '/v1/media'],
	'post:create': ['POST', '/v1/posts'],
	'post:get': ['GET', '/v1/posts/post_1'],
	'post:getAll': ['GET', '/v1/posts'],
	'post:cancel': ['DELETE', '/v1/posts/post_1'],
	'post:retry': ['POST', '/v1/posts/post_1/retry'],
	'report:getStats': ['GET', '/v1/stats'],
	'report:getUsage': ['GET', '/v1/usage'],
};

function context(
	resource,
	operation,
	{
		items = [{ json: {} }],
		params = {},
		responses,
		response = { statusCode: 200, body: { data: [], next_cursor: null, ok: true } },
		error,
		continueOnFail = false,
		binary = { mimeType: 'video/mp4' },
	} = {},
) {
	const calls = [];
	const values = {
		resource,
		operation,
		returnAll: false,
		limit: 50,
		...REQUIRED[`${resource}:${operation}`],
		...params,
	};
	const ctx = {
		getInputData: () => items,
		getNode: () => ({
			name: 'UGC API',
			type: 'ugcApi',
			typeVersion: 1,
			parameters: {},
			position: [0, 0],
		}),
		getNodeParameter: (name, i, fallback) => (name in values ? values[name] : fallback),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({
					credential,
					options: structuredClone({
						...options,
						body: Buffer.isBuffer(options.body) ? 'BUFFER' : options.body,
					}),
				});
				if (error) throw error;
				if (responses) {
					if (calls.length > responses.length) throw new Error('Extra request');
					return structuredClone(responses[calls.length - 1]);
				}
				return structuredClone(response);
			},
			assertBinaryData: () => binary,
			getBinaryDataBuffer: async () => Buffer.from('file'),
		},
	};
	return { ctx, calls };
}

const page = (data, next = null) => ({ statusCode: 200, body: { data, next_cursor: next } });

test('every operation makes one REST request to its fixed endpoint with the API key credential', async () => {
	for (const [key, [method, path]] of Object.entries(EXPECTED)) {
		const [resource, operation] = key.split(':');
		const { ctx, calls } = context(resource, operation);
		await node.execute.call(ctx);
		assert.equal(calls.length, 1, key);
		assert.equal(calls[0].credential, 'ugcApiApi', key);
		assert.equal(calls[0].options.method, method, key);
		assert.equal(new URL(calls[0].options.url).origin, 'https://ugcapi.dev', key);
		assert.equal(new URL(calls[0].options.url).pathname, path, key);
		assert.equal(calls[0].options.disableFollowRedirect, true, key);
		assert(!JSON.stringify(calls[0].options).includes('jsonrpc'), key);
	}
});

test('every operation in the node is covered by these tests', () => {
	const declared = node.description.properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.options.map((o) => `${p.displayOptions.show.resource[0]}:${o.value}`));
	assert.deepEqual(declared.sort(), Object.keys(EXPECTED).sort());
});

test('creating a post sends accounts, media, schedule and platform options', async () => {
	const { ctx, calls } = context('post', 'create', {
		params: {
			media: 'https://x.test/1.jpg, https://x.test/2.jpg\nhttps://x.test/3.jpg',
			format: 'slideshow',
			caption: 'Hello',
			postFields: {
				scheduledAt: '2030-01-02T10:00:00Z',
				externalId: 'ext-1',
				tiktokPrivacy: 'SELF_ONLY',
				tiktokAllowDuet: false,
				instagramStory: true,
				instagramStorySlides: 'first',
			},
		},
	});
	await node.execute.call(ctx);
	assert.deepEqual(calls[0].options.body, {
		accounts: ['acc_1'],
		format: 'slideshow',
		media: ['https://x.test/1.jpg', 'https://x.test/2.jpg', 'https://x.test/3.jpg'],
		caption: 'Hello',
		scheduled_at: '2030-01-02T10:00:00.000Z',
		external_id: 'ext-1',
		options: {
			tiktok: { privacy: 'SELF_ONLY', allow_duet: false },
			instagram: { story: true, story_slides: 'first' },
		},
	});
});

test('a campaign preview sends dry_run and the schedule settings', async () => {
	const { ctx, calls } = context('campaign', 'create', {
		params: {
			campaignFields: {
				dryRun: true,
				perDay: 2,
				times: '09:00, 18:00',
				timezone: 'America/New_York',
				startDate: '2030-03-04T00:00:00Z',
				spread: false,
			},
		},
	});
	await node.execute.call(ctx);
	const body = calls[0].options.body;
	assert.equal(body.dry_run, true);
	assert.deepEqual(body.cadence, { per_day: 2 });
	assert.deepEqual(body.times, ['09:00', '18:00']);
	assert.equal(body.start_date, '2030-03-04');
	assert.equal(body.spread, false);
	assert.equal(body.posts.length, 1);
});

test('invalid campaign JSON and empty media fail before any request', async () => {
	for (const [resource, operation, params] of [
		['campaign', 'create', { posts: '{not json' }],
		['campaign', 'create', { posts: '[]' }],
		['post', 'create', { media: ' , ' }],
	]) {
		const { ctx, calls } = context(resource, operation, { params });
		await assert.rejects(node.execute.call(ctx));
		assert.equal(calls.length, 0);
	}
});

test('identifiers are encoded and cannot change the path', async () => {
	const { ctx, calls } = context('post', 'get', { params: { postId: 'post 1' } });
	await node.execute.call(ctx);
	assert.equal(new URL(calls[0].options.url).pathname, '/v1/posts/post%201');
	for (const bad of ['../usage', 'a/b', 'a?x=1', '']) {
		const run = context('post', 'get', { params: { postId: bad } });
		await assert.rejects(node.execute.call(run.ctx));
		assert.equal(run.calls.length, 0, bad);
	}
});

test('media upload sends the binary file with its content type, and rejects other types', async () => {
	const { ctx, calls } = context('media', 'upload');
	await node.execute.call(ctx);
	assert.equal(calls[0].options.body, 'BUFFER');
	assert.equal(calls[0].options.headers['Content-Type'], 'video/mp4');
	assert.equal(calls[0].options.json, false);
	const pdf = context('media', 'upload', { binary: { mimeType: 'application/pdf' } });
	await assert.rejects(node.execute.call(pdf.ctx), /Unsupported file type/);
	assert.equal(pdf.calls.length, 0);
});

test('lists follow next_cursor internally until the end when Return All is on', async () => {
	const { ctx, calls } = context('post', 'getAll', {
		params: {
			returnAll: true,
			postFilters: { status: ['scheduled', 'failed'], platform: 'tiktok' },
		},
		responses: [page([{ id: 1 }, { id: 2 }], 'c1'), page([{ id: 3 }], 'c2'), page([], null)],
	});
	const [out] = await node.execute.call(ctx);
	assert.deepEqual(
		out.map((item) => item.json.id),
		[1, 2, 3],
	);
	assert.equal(calls.length, 3);
	const first = new URL(calls[0].options.url);
	assert.equal(calls[0].options.qs.status, 'scheduled,failed');
	assert.equal(calls[0].options.qs.platform, 'tiktok');
	assert.equal(calls[0].options.qs.cursor, undefined);
	assert.equal(calls[1].options.qs.cursor, 'c1');
	assert.equal(calls[2].options.qs.cursor, 'c2');
	assert.equal(first.pathname, '/v1/posts');
});

test('Limit stops at exactly that many items, across pages', async () => {
	const { ctx, calls } = context('campaign', 'getAll', {
		params: { limit: 3 },
		responses: [page([{ id: 1 }, { id: 2 }], 'c1'), page([{ id: 3 }, { id: 4 }], 'c2')],
	});
	const [out] = await node.execute.call(ctx);
	assert.equal(out.length, 3);
	assert.equal(calls.length, 2);
});

test('a repeated cursor fails instead of looping or claiming everything was fetched', async () => {
	const { ctx } = context('post', 'getAll', {
		params: { returnAll: true },
		responses: [page([{ id: 1 }], 'same'), page([{ id: 2 }], 'same')],
	});
	await assert.rejects(node.execute.call(ctx), /repeated a page/);
});

test('an error on a later page stops the list with that error', async () => {
	const { ctx } = context('post', 'getAll', {
		params: { returnAll: true },
		responses: [
			page([{ id: 1 }], 'c1'),
			{ statusCode: 500, body: { error: { code: 'server_error', message: 'Try again' } } },
		],
	});
	await assert.rejects(node.execute.call(ctx), /HTTP 500 server_error/);
});

test('each list item becomes its own output item paired to its input', async () => {
	const { ctx } = context('account', 'getAll', {
		items: [{ json: {} }, { json: {} }],
		response: page([{ id: 'a' }, { id: 'b' }]),
	});
	const [out] = await node.execute.call(ctx);
	assert.deepEqual(
		out.map((item) => item.pairedItem.item),
		[0, 0, 1, 1],
	);
});

test('API errors show the API message but never the key or request headers', async () => {
	const { ctx } = context('post', 'create', {
		response: {
			statusCode: 402,
			body: {
				error: { code: 'insufficient_credits', message: 'This needs 2 credits and you have 1.' },
			},
		},
	});
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.match(error.message, /HTTP 402 insufficient_credits.*needs 2 credits/);
		return true;
	});
	const network = context('report', 'getUsage', {
		error: Object.assign(new Error('connect failed Authorization: Bearer ugc_live_SECRET'), {
			options: { headers: { Authorization: 'Bearer ugc_live_SECRET' } },
		}),
	});
	await assert.rejects(node.execute.call(network.ctx), (error) => {
		assert(!error.message.includes('ugc_live_SECRET'));
		return true;
	});
	const unauthorized = context('report', 'getUsage', {
		response: { statusCode: 401, body: { error: { code: 'unauthorized' } } },
	});
	await assert.rejects(node.execute.call(unauthorized.ctx), /rejected the API key/);
});

test('Continue On Fail returns the error as an item and keeps going', async () => {
	const { ctx } = context('report', 'getUsage', {
		items: [{ json: {} }, { json: {} }],
		continueOnFail: true,
		response: { statusCode: 404, body: { error: { code: 'not_found', message: 'Nope' } } },
	});
	const [out] = await node.execute.call(ctx);
	assert.equal(out.length, 2);
	assert.match(out[0].json.error, /HTTP 404/);
	assert.equal(out[1].pairedItem.item, 1);
});

test('empty and invalid bodies are handled', async () => {
	const empty = context('post', 'cancel', { response: { statusCode: 204, body: '' } });
	const [out] = await node.execute.call(empty.ctx);
	assert.deepEqual(out[0].json, { success: true });
	const bad = context('post', 'get', { response: { statusCode: 200, body: '<html>' } });
	await assert.rejects(node.execute.call(bad.ctx), /invalid JSON/);
});

test('credential sends the key as a Bearer token and tests against /v1/usage', () => {
	const credential = new UgcApiApi();
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}',
	);
	assert.equal(credential.test.request.baseURL, 'https://ugcapi.dev');
	assert.equal(credential.test.request.url, '/v1/usage');
	assert.equal(credential.properties[0].typeOptions.password, true);
});

test('n8n resolves each resource to its own operations and shows only their fields', () => {
	const { NodeHelpers } = require('n8n-workflow');
	const properties = node.description.properties;
	const resources = properties.find((p) => p.name === 'resource').options.map((o) => o.value);
	for (const resource of resources) {
		const selector = properties.find(
			(p) => p.name === 'operation' && p.displayOptions.show.resource.includes(resource),
		);
		for (const { value: operation } of selector.options) {
			const parameters = NodeHelpers.getNodeParameters(
				properties,
				{ resource, operation },
				true,
				false,
				{ typeVersion: 1 },
				node.description,
			);
			assert.equal(parameters.operation, operation);
			for (const field of Object.keys(REQUIRED[`${resource}:${operation}`] ?? {}))
				assert(Object.hasOwn(parameters, field), `${resource}:${operation} shows ${field}`);
			const isList = operation === 'getAll';
			assert.equal(
				Object.hasOwn(parameters, 'returnAll'),
				isList,
				`${resource}:${operation} returnAll`,
			);
		}
	}
});

test('no cursor, offset or write-confirmation fields are shown to users', () => {
	const names = JSON.stringify(node.description.properties);
	for (const word of ['"cursor"', '"offset"', '"pageToken"', 'confirm', 'Confirm'])
		assert(!names.includes(word), word);
});
