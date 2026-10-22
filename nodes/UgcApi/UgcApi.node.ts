import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { apiRequest, apiRequestAllItems, splitList } from './transport';

const returnAllField = (resource: string) => ({
	displayName: 'Return All',
	name: 'returnAll',
	type: 'boolean' as const,
	default: false,
	description: 'Whether to return all results or only up to a given limit',
	displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
});

const limitField = (resource: string) => ({
	displayName: 'Limit',
	name: 'limit',
	type: 'number' as const,
	default: 50,
	typeOptions: { minValue: 1 },
	description: 'Max number of results to return',
	displayOptions: { show: { resource: [resource], operation: ['getAll'], returnAll: [false] } },
});

const id = (value: unknown, name: string, ctx: IExecuteFunctions): string => {
	const text = String(value ?? '').trim();
	if (!text || /[\\/?#]/.test(text) || text === '.' || text === '..')
		throw new NodeOperationError(ctx.getNode(), `${name} is required`);
	return encodeURIComponent(text);
};

/** Platform options for a post, from the node's flat fields. */
function postOptions(fields: IDataObject): IDataObject | undefined {
	const tiktok: IDataObject = {};
	const instagram: IDataObject = {};
	if (fields.tiktokPrivacy) tiktok.privacy = fields.tiktokPrivacy;
	if (fields.tiktokTitle) tiktok.title = fields.tiktokTitle;
	for (const [field, key] of [
		['tiktokAllowComment', 'allow_comment'],
		['tiktokAllowDuet', 'allow_duet'],
		['tiktokAllowStitch', 'allow_stitch'],
		['tiktokDraft', 'draft'],
		['tiktokYourBrand', 'your_brand'],
		['tiktokBrandedContent', 'branded_content'],
		['tiktokAiGenerated', 'ai_generated'],
		['tiktokAutoMusic', 'auto_music'],
	])
		if (typeof fields[field] === 'boolean') tiktok[key] = fields[field];
	if (typeof fields.instagramStory === 'boolean') instagram.story = fields.instagramStory;
	if (typeof fields.instagramFeed === 'boolean') instagram.feed = fields.instagramFeed;
	if (typeof fields.instagramGrid === 'boolean') instagram.grid = fields.instagramGrid;
	if (fields.instagramStorySlides) instagram.story_slides = fields.instagramStorySlides;
	const options: IDataObject = {};
	if (Object.keys(tiktok).length) options.tiktok = tiktok;
	if (Object.keys(instagram).length) options.instagram = instagram;
	return Object.keys(options).length ? options : undefined;
}

const postOptionFields = [
	{
		displayName: 'External ID',
		name: 'externalId',
		type: 'string' as const,
		default: '',
		description: 'Your own reference for this post, returned with it and usable as a filter',
	},
	{
		displayName: 'Instagram Feed Post',
		name: 'instagramFeed',
		type: 'boolean' as const,
		default: true,
		description:
			'Whether to publish the Reel, carousel or image. Turn off with Instagram Story on to post the Story alone.',
	},
	{
		displayName: 'Instagram Show in Grid',
		name: 'instagramGrid',
		type: 'boolean' as const,
		default: true,
		description: 'Whether a Reel also appears in the profile grid',
	},
	{
		displayName: 'Instagram Story',
		name: 'instagramStory',
		type: 'boolean' as const,
		default: false,
		description: 'Whether to also post the media as an Instagram Story',
	},
	{
		displayName: 'Instagram Story Slides',
		name: 'instagramStorySlides',
		type: 'options' as const,
		options: [
			{ name: 'All Slides', value: 'all' },
			{ name: 'First Slide', value: 'first' },
		],
		default: 'all',
		description: 'For slideshows posted as a Story: one frame per slide, or the first slide only',
	},
	{
		displayName: 'Scheduled At',
		name: 'scheduledAt',
		type: 'dateTime' as const,
		default: '',
		description: 'When to publish. Leave empty to publish now.',
	},
	{
		displayName: 'TikTok AI-Generated Content',
		name: 'tiktokAiGenerated',
		type: 'boolean' as const,
		default: false,
		description: 'Whether to label the TikTok post as AI-generated',
	},
	{
		displayName: 'TikTok Allow Comments',
		name: 'tiktokAllowComment',
		type: 'boolean' as const,
		default: true,
		description: 'Whether viewers can comment on the TikTok post',
	},
	{
		displayName: 'TikTok Allow Duet',
		name: 'tiktokAllowDuet',
		type: 'boolean' as const,
		default: true,
		description: 'Whether viewers can duet the TikTok video',
	},
	{
		displayName: 'TikTok Allow Stitch',
		name: 'tiktokAllowStitch',
		type: 'boolean' as const,
		default: true,
		description: 'Whether viewers can stitch the TikTok video',
	},
	{
		displayName: 'TikTok Auto Music',
		name: 'tiktokAutoMusic',
		type: 'boolean' as const,
		default: true,
		description: 'Whether TikTok adds recommended music to a photo post',
	},
	{
		displayName: 'TikTok Branded Content',
		name: 'tiktokBrandedContent',
		type: 'boolean' as const,
		default: false,
		description:
			"Whether the post promotes another brand (a paid partnership). Branded content can't be private.",
	},
	{
		displayName: 'TikTok Draft',
		name: 'tiktokDraft',
		type: 'boolean' as const,
		default: false,
		description:
			"Whether to send the post to the creator's TikTok inbox to finish and post in the app, instead of publishing it",
	},
	{
		displayName: 'TikTok Privacy',
		name: 'tiktokPrivacy',
		type: 'options' as const,
		options: [
			{ name: 'Everyone', value: 'PUBLIC_TO_EVERYONE' },
			{ name: 'Followers', value: 'FOLLOWER_OF_CREATOR' },
			{ name: 'Friends', value: 'MUTUAL_FOLLOW_FRIENDS' },
			{ name: 'Only Me', value: 'SELF_ONLY' },
		],
		default: 'PUBLIC_TO_EVERYONE',
		description:
			'Who can see the TikTok post. Use Account → Get Creator Info to see which levels the creator allows.',
	},
	{
		displayName: 'TikTok Promotes Your Brand',
		name: 'tiktokYourBrand',
		type: 'boolean' as const,
		default: false,
		description: "Whether the post promotes the creator's own business",
	},
	{
		displayName: 'TikTok Title',
		name: 'tiktokTitle',
		type: 'string' as const,
		default: '',
		description: 'Title for a TikTok photo post (up to 90 characters)',
	},
];

export class UgcApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'UGC API',
		name: 'ugcApi',
		icon: { light: 'file:ugcapi.svg', dark: 'file:ugcapi.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Publish and schedule UGC to TikTok and Instagram with UGC API',
		defaults: { name: 'UGC API' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'ugcApiApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Campaign', value: 'campaign' },
					{ name: 'Media', value: 'media' },
					{ name: 'Post', value: 'post' },
					{ name: 'Report', value: 'report' },
				],
				default: 'post',
			},

			// ---------- Account ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Create Connect Link',
						value: 'createConnectLink',
						description:
							'Create a link a creator opens to connect their TikTok or Instagram account',
						action: 'Create a connect link',
					},
					{
						name: 'Disconnect',
						value: 'disconnect',
						description: 'Disconnect an account and cancel its scheduled posts',
						action: 'Disconnect an account',
					},
					{
						name: 'Get Creator Info',
						value: 'getCreatorInfo',
						description:
							'Get who a post will go out as and what the platform allows, such as TikTok privacy levels',
						action: 'Get creator info for an account',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List connected accounts',
						action: 'Get many accounts',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Platform',
				name: 'platform',
				type: 'options',
				required: true,
				options: [
					{ name: 'Instagram', value: 'instagram' },
					{ name: 'TikTok', value: 'tiktok' },
				],
				default: 'tiktok',
				description: 'Instagram needs a Business or Creator account',
				displayOptions: { show: { resource: ['account'], operation: ['createConnectLink'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'connectFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['account'], operation: ['createConnectLink'] } },
				options: [
					{
						displayName: 'External ID',
						name: 'externalId',
						type: 'string',
						default: '',
						description:
							'Your own ID for the creator, saved on the account so you can find it later',
					},
					{
						displayName: 'Redirect URL',
						name: 'redirectUrl',
						type: 'string',
						default: '',
						placeholder: 'https://your.app/connected',
						description: 'Where to send the creator after they connect',
					},
				],
			},
			{
				displayName: 'Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				required: true,
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: {
					show: { resource: ['account'], operation: ['getCreatorInfo', 'disconnect'] },
				},
			},
			returnAllField('account'),
			limitField('account'),
			{
				displayName: 'Filters',
				name: 'accountFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['account'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'External ID',
						name: 'external_id',
						type: 'string',
						default: '',
						description: 'Only the account connected with this external ID',
					},
					{
						displayName: 'Platform',
						name: 'platform',
						type: 'options',
						options: [
							{ name: 'Instagram', value: 'instagram' },
							{ name: 'TikTok', value: 'tiktok' },
						],
						default: 'tiktok',
					},
				],
			},

			// ---------- Campaign ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['campaign'] } },
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
						description: 'Cancel every post in a campaign that has not gone out yet',
						action: 'Cancel a campaign',
					},
					{
						name: 'Create',
						value: 'create',
						description: 'Spread many posts over accounts on a schedule',
						action: 'Create a campaign',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a campaign with its progress',
						action: 'Get a campaign',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List campaigns with their progress',
						action: 'Get many campaigns',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Campaign ID',
				name: 'campaignId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['campaign'], operation: ['get', 'cancel'] } },
			},
			{
				displayName: 'Account Names or IDs',
				name: 'accounts',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				required: true,
				default: [],
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { resource: ['campaign', 'post'], operation: ['create'] } },
			},
			{
				displayName: 'Posts (JSON)',
				name: 'posts',
				type: 'json',
				required: true,
				default:
					'[\n  { "format": "video", "media": ["https://example.com/clip.mp4"], "caption": "" }\n]',
				description:
					'Array of posts, each with format (video, slideshow or image), media (URLs) and caption. Optional per post: external_id and options.',
				displayOptions: { show: { resource: ['campaign'], operation: ['create'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'campaignFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['campaign'], operation: ['create'] } },
				options: [
					{
						displayName: 'Every N Days',
						name: 'everyDays',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description: 'Post once every this many days instead of every day',
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
					},
					{
						displayName: 'One Account per Post',
						name: 'spread',
						type: 'boolean',
						default: true,
						description:
							'Whether each post goes to one account in turn. Turn off to send every post to every account.',
					},
					{
						displayName: 'Posts per Day',
						name: 'perDay',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 6 },
						default: 1,
						description: 'How many posts each account gets per day (1–6)',
					},
					{
						displayName: 'Preview Only',
						name: 'dryRun',
						type: 'boolean',
						default: false,
						description:
							'Whether to return the planned schedule and credits needed without creating anything',
					},
					{
						displayName: 'Start Date',
						name: 'startDate',
						type: 'dateTime',
						default: '',
						description: 'First day of the campaign. Defaults to today.',
					},
					{
						displayName: 'Times',
						name: 'times',
						type: 'string',
						default: '10:00, 15:00, 20:00',
						description: 'Local posting times (HH:MM), comma-separated',
					},
					{
						displayName: 'Timezone',
						name: 'timezone',
						type: 'string',
						default: 'UTC',
						placeholder: 'America/New_York',
						description: 'IANA timezone for the posting times',
					},
				],
			},
			returnAllField('campaign'),
			limitField('campaign'),

			// ---------- Media ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['media'] } },
				options: [
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a video or image file and get a URL to post',
						action: 'Upload a media file',
					},
				],
				default: 'upload',
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				required: true,
				default: 'data',
				hint: 'The name of the input binary field containing the file',
				description: 'MP4 or MOV video, or JPEG, PNG or WebP image, up to 300 MB',
				displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
			},

			// ---------- Post ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['post'] } },
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
						description: 'Cancel the parts of a post that have not gone out yet',
						action: 'Cancel a post',
					},
					{
						name: 'Create',
						value: 'create',
						description: 'Publish or schedule a video, slideshow or image',
						action: 'Create a post',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a post with a result per account',
						action: 'Get a post',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List posts',
						action: 'Get many posts',
					},
					{
						name: 'Retry',
						value: 'retry',
						description: 'Send the failed parts of a post again',
						action: 'Retry a post',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['get', 'cancel', 'retry'] } },
			},
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				required: true,
				options: [
					{ name: 'Image', value: 'image' },
					{ name: 'Slideshow', value: 'slideshow' },
					{ name: 'Video', value: 'video' },
				],
				default: 'video',
				description:
					'Video becomes a TikTok video and Instagram Reel; a slideshow becomes a TikTok photo post and Instagram carousel',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
			},
			{
				displayName: 'Media URLs',
				name: 'media',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/clip.mp4',
				description:
					'Public HTTPS URLs, comma-separated. One video, or 2–35 images for a slideshow. Use Media → Upload for files.',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'postFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
				options: postOptionFields,
			},
			returnAllField('post'),
			limitField('post'),
			{
				displayName: 'Filters',
				name: 'postFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Account Name or ID',
						name: 'account_id',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getAccounts' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Campaign ID',
						name: 'campaign_id',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Caption Contains',
						name: 'q',
						type: 'string',
						default: '',
					},
					{
						displayName: 'External ID',
						name: 'external_id',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Format',
						name: 'format',
						type: 'options',
						options: [
							{ name: 'Image', value: 'image' },
							{ name: 'Slideshow', value: 'slideshow' },
							{ name: 'Video', value: 'video' },
						],
						default: 'video',
					},
					{
						displayName: 'Platform',
						name: 'platform',
						type: 'options',
						options: [
							{ name: 'Instagram', value: 'instagram' },
							{ name: 'TikTok', value: 'tiktok' },
						],
						default: 'tiktok',
					},
					{
						displayName: 'Scheduled After',
						name: 'from',
						type: 'dateTime',
						default: '',
					},
					{
						displayName: 'Scheduled Before',
						name: 'to',
						type: 'dateTime',
						default: '',
					},
					{
						displayName: 'Sort',
						name: 'sort',
						type: 'options',
						options: [
							{ name: 'Newest Created First', value: 'created_at' },
							{ name: 'Soonest Scheduled First', value: 'scheduled_at' },
							{ name: 'Latest Scheduled First', value: '-scheduled_at' },
						],
						default: 'created_at',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'multiOptions',
						options: [
							{ name: 'Cancelled', value: 'cancelled' },
							{ name: 'Failed', value: 'failed' },
							{ name: 'Partial', value: 'partial' },
							{ name: 'Published', value: 'published' },
							{ name: 'Publishing', value: 'publishing' },
							{ name: 'Scheduled', value: 'scheduled' },
						],
						default: [],
					},
				],
			},

			// ---------- Report ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['report'] } },
				options: [
					{
						name: 'Get Stats',
						value: 'getStats',
						description: 'Get results by status, platform and day, engagement and top posts',
						action: 'Get posting stats',
					},
					{
						name: 'Get Usage',
						value: 'getUsage',
						description: 'Get credits left and posts published this month',
						action: 'Get usage',
					},
				],
				default: 'getStats',
			},
			{
				displayName: 'Filters',
				name: 'statsFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['report'], operation: ['getStats'] } },
				options: [
					{
						displayName: 'Account Name or ID',
						name: 'account_id',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getAccounts' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'dateTime',
						default: '',
						description: 'Start of the range. Defaults to 31 days before To.',
					},
					{
						displayName: 'To',
						name: 'to',
						type: 'dateTime',
						default: '',
						description: 'End of the range. Defaults to tomorrow.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await apiRequest(this, 'GET', '/v1/accounts');
				const accounts = Array.isArray(response.data) ? (response.data as IDataObject[]) : [];
				const names: Record<string, string> = {
					facebook: 'Facebook',
					instagram: 'Instagram',
					tiktok: 'TikTok',
					youtube: 'YouTube',
				};
				return accounts.map((account) => ({
					name: `@${String(account.username)} (${names[String(account.platform)] ?? String(account.platform)})`,
					value: String(account.id),
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const results = await run.call(this, resource, operation, i);
				for (const json of results) output.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					output.push({
						json: { error: error instanceof Error ? error.message : 'Operation failed' },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [output];
	}
}

const isoDate = (value: unknown) => (value ? new Date(String(value)).toISOString() : undefined);

function compact(values: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(values).filter(
			([, value]) =>
				value !== '' && value !== undefined && !(Array.isArray(value) && !value.length),
		),
	);
}

async function run(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	const returnAll = () => this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = () => this.getNodeParameter('limit', i, 50) as number;

	if (resource === 'account') {
		if (operation === 'getAll') {
			const filters = compact(this.getNodeParameter('accountFilters', i, {}) as IDataObject);
			return apiRequestAllItems(this, '/v1/accounts', filters, returnAll(), limit());
		}
		if (operation === 'createConnectLink') {
			const fields = this.getNodeParameter('connectFields', i, {}) as IDataObject;
			return [
				await apiRequest(this, 'POST', '/v1/accounts/connect', {
					body: compact({
						platform: this.getNodeParameter('platform', i) as string,
						external_id: fields.externalId,
						redirect_url: fields.redirectUrl,
					}),
				}),
			];
		}
		const accountId = id(this.getNodeParameter('accountId', i), 'Account', this);
		if (operation === 'getCreatorInfo')
			return [await apiRequest(this, 'GET', `/v1/accounts/${accountId}/creator_info`)];
		if (operation === 'disconnect')
			return [await apiRequest(this, 'DELETE', `/v1/accounts/${accountId}`)];
	}

	if (resource === 'campaign') {
		if (operation === 'getAll')
			return apiRequestAllItems(this, '/v1/campaigns', {}, returnAll(), limit());
		if (operation === 'create') {
			const fields = this.getNodeParameter('campaignFields', i, {}) as IDataObject;
			let posts = this.getNodeParameter('posts', i) as unknown;
			if (typeof posts === 'string') {
				try {
					posts = JSON.parse(posts);
				} catch {
					throw new NodeOperationError(this.getNode(), 'Posts must be valid JSON', {
						itemIndex: i,
					});
				}
			}
			if (!Array.isArray(posts) || !posts.length)
				throw new NodeOperationError(
					this.getNode(),
					'Posts must be a JSON array with at least one post',
					{
						itemIndex: i,
					},
				);
			const cadence = compact({ per_day: fields.perDay, every_days: fields.everyDays });
			return [
				await apiRequest(this, 'POST', '/v1/campaigns', {
					body: compact({
						name: fields.name,
						accounts: this.getNodeParameter('accounts', i) as string[],
						posts: posts as IDataObject[],
						cadence: Object.keys(cadence).length ? cadence : undefined,
						times: typeof fields.times === 'string' ? splitList(fields.times) : undefined,
						timezone: fields.timezone,
						start_date: fields.startDate
							? String(isoDate(fields.startDate)).slice(0, 10)
							: undefined,
						spread: fields.spread,
						dry_run: fields.dryRun === true ? true : undefined,
					}),
				}),
			];
		}
		const campaignId = id(this.getNodeParameter('campaignId', i), 'Campaign ID', this);
		if (operation === 'get') return [await apiRequest(this, 'GET', `/v1/campaigns/${campaignId}`)];
		if (operation === 'cancel')
			return [await apiRequest(this, 'DELETE', `/v1/campaigns/${campaignId}`)];
	}

	if (resource === 'media' && operation === 'upload') {
		const field = this.getNodeParameter('binaryPropertyName', i) as string;
		const binary = this.helpers.assertBinaryData(i, field);
		const contentType = (binary.mimeType || '').split(';')[0];
		if (!/^(video\/(mp4|quicktime)|image\/(jpeg|png|webp))$/.test(contentType))
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported file type ${contentType || 'unknown'}. Use MP4 or MOV video, or JPEG, PNG or WebP images.`,
				{ itemIndex: i },
			);
		const buffer = await this.helpers.getBinaryDataBuffer(i, field);
		return [await apiRequest(this, 'POST', '/v1/media', { body: buffer, contentType })];
	}

	if (resource === 'post') {
		if (operation === 'getAll') {
			const filters = this.getNodeParameter('postFilters', i, {}) as IDataObject;
			const qs = compact({
				...filters,
				status: Array.isArray(filters.status) ? (filters.status as string[]).join(',') : undefined,
				from: isoDate(filters.from),
				to: isoDate(filters.to),
			});
			return apiRequestAllItems(this, '/v1/posts', qs, returnAll(), limit());
		}
		if (operation === 'create') {
			const fields = this.getNodeParameter('postFields', i, {}) as IDataObject;
			const media = splitList(this.getNodeParameter('media', i) as string);
			if (!media.length)
				throw new NodeOperationError(this.getNode(), 'Add at least one media URL', {
					itemIndex: i,
				});
			return [
				await apiRequest(this, 'POST', '/v1/posts', {
					body: compact({
						accounts: this.getNodeParameter('accounts', i) as string[],
						format: this.getNodeParameter('format', i) as string,
						media,
						caption: this.getNodeParameter('caption', i, '') as string,
						scheduled_at: isoDate(fields.scheduledAt),
						external_id: fields.externalId,
						options: postOptions(fields),
					}),
				}),
			];
		}
		const postId = id(this.getNodeParameter('postId', i), 'Post ID', this);
		if (operation === 'get') return [await apiRequest(this, 'GET', `/v1/posts/${postId}`)];
		if (operation === 'cancel') return [await apiRequest(this, 'DELETE', `/v1/posts/${postId}`)];
		if (operation === 'retry')
			return [await apiRequest(this, 'POST', `/v1/posts/${postId}/retry`, { body: {} })];
	}

	if (resource === 'report') {
		if (operation === 'getUsage') return [await apiRequest(this, 'GET', '/v1/usage')];
		if (operation === 'getStats') {
			const filters = this.getNodeParameter('statsFilters', i, {}) as IDataObject;
			return [
				await apiRequest(this, 'GET', '/v1/stats', {
					qs: compact({
						account_id: filters.account_id,
						from: isoDate(filters.from),
						to: isoDate(filters.to),
					}),
				}),
			];
		}
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation ${resource}: ${operation}`, {
		itemIndex: i,
	});
}
