import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://ugcapi.dev';
const CREDENTIAL = 'ugcApiApi';

type Context = IExecuteFunctions | ILoadOptionsFunctions;

/** Error text the API returns ({ error: { code, message } }); never request headers or the key. */
function apiError(status: number, body: unknown): string {
	const error =
		body && typeof body === 'object'
			? (body as { error?: { code?: string; message?: string } }).error
			: undefined;
	const code = typeof error?.code === 'string' ? ` ${error.code}` : '';
	const message = typeof error?.message === 'string' ? `: ${error.message.slice(0, 500)}` : '';
	if (status === 401)
		return `UGC API rejected the API key (HTTP 401${code}). Check the key in the credential.`;
	return `UGC API request failed (HTTP ${status}${code})${message}`;
}

export async function apiRequest(
	ctx: Context,
	method: IHttpRequestMethods,
	path: string,
	options: { qs?: IDataObject; body?: IDataObject | Buffer; contentType?: string } = {},
): Promise<IDataObject> {
	if (!path.startsWith('/v1/')) throw new NodeOperationError(ctx.getNode(), 'Invalid API resource');
	const request: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		qs: options.qs,
		headers: { Accept: 'application/json' },
		json: !Buffer.isBuffer(options.body),
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		disableFollowRedirect: true,
		timeout: 300000,
	};
	if (options.body !== undefined) {
		request.body = options.body;
		request.headers = {
			...request.headers,
			'Content-Type': options.contentType ?? 'application/json',
		};
	}
	let response: { statusCode?: number; body?: unknown };
	try {
		response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL, request);
	} catch {
		throw new NodeOperationError(
			ctx.getNode(),
			'Could not reach UGC API. Check the network connection and try again.',
		);
	}
	const status = Number(response.statusCode ?? 200);
	let body = response.body;
	if (typeof body === 'string' && body !== '') {
		try {
			body = JSON.parse(body);
		} catch {
			throw new NodeOperationError(ctx.getNode(), 'UGC API returned an invalid JSON response');
		}
	}
	if (status < 200 || status >= 300)
		throw new NodeOperationError(ctx.getNode(), apiError(status, body));
	if (body === undefined || body === '' || body === null) return { success: true };
	if (typeof body !== 'object' || Array.isArray(body))
		throw new NodeOperationError(ctx.getNode(), 'UGC API returned an unexpected response');
	return body as IDataObject;
}

/**
 * Follows `next_cursor` until the results run out or `limit` items are collected. The cursor is
 * only ever sent back as a query parameter on the same fixed endpoint.
 */
export async function apiRequestAllItems(
	ctx: IExecuteFunctions,
	path: string,
	qs: IDataObject,
	returnAll: boolean,
	limit: number,
): Promise<IDataObject[]> {
	if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1))
		throw new NodeOperationError(ctx.getNode(), 'Limit must be a positive whole number');
	const items: IDataObject[] = [];
	const seen = new Set<string>();
	let cursor: string | undefined;
	for (;;) {
		const page = await apiRequest(ctx, 'GET', path, {
			qs: { ...qs, limit: 100, ...(cursor ? { cursor } : {}) },
		});
		const data = page.data;
		if (!Array.isArray(data))
			throw new NodeOperationError(ctx.getNode(), 'UGC API returned an unexpected list response');
		for (const item of data as IDataObject[]) {
			items.push(item);
			if (!returnAll && items.length >= limit) return items;
		}
		const next = page.next_cursor;
		if (typeof next !== 'string' || next === '' || !data.length) return items;
		if (seen.has(next) || next.length > 512)
			throw new NodeOperationError(ctx.getNode(), 'UGC API repeated a page instead of advancing');
		seen.add(next);
		cursor = next;
	}
}

/** Comma- or newline-separated URLs, trimmed, empty entries removed. */
export function splitList(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((part) => part.trim())
		.filter((part) => part !== '');
}
