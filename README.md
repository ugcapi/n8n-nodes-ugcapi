# UGC API for n8n

Publish and schedule user-generated content to TikTok and Instagram from n8n with [UGC API](https://ugcapi.dev). Send a video, photo slideshow or image once; UGC API posts it to every connected account you choose, now or at a scheduled time. This community node calls the UGC API REST API (`https://ugcapi.dev/v1`) and returns its JSON responses.

## Installation

Install `n8n-nodes-ugcapi` from **Settings → Community nodes** in your n8n instance, or install the npm package in a self-hosted n8n installation. See the [n8n community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Authentication

1. Sign in at [ugcapi.dev/dashboard](https://ugcapi.dev/dashboard/). New accounts include 50 free posts.
2. Create an API key under **API keys**. It starts with `ugc_live_` and is shown once.
3. In n8n, create a **UGC API** credential and paste the key. n8n checks it against `GET /v1/usage`.

Keys belong to your UGC API workspace and can post to its connected accounts and use its credits. Revoke a key in the dashboard at any time.

## Resources and operations

| Resource | Operation           | Request                             |
| -------- | ------------------- | ----------------------------------- |
| Account  | Create Connect Link | `POST /v1/accounts/connect`         |
| Account  | Disconnect          | `DELETE /v1/accounts/:id`           |
| Account  | Get Creator Info    | `GET /v1/accounts/:id/creator_info` |
| Account  | Get Many            | `GET /v1/accounts`                  |
| Campaign | Cancel              | `DELETE /v1/campaigns/:id`          |
| Campaign | Create              | `POST /v1/campaigns`                |
| Campaign | Get                 | `GET /v1/campaigns/:id`             |
| Campaign | Get Many            | `GET /v1/campaigns`                 |
| Media    | Upload              | `POST /v1/media`                    |
| Post     | Cancel              | `DELETE /v1/posts/:id`              |
| Post     | Create              | `POST /v1/posts`                    |
| Post     | Get                 | `GET /v1/posts/:id`                 |
| Post     | Get Many            | `GET /v1/posts`                     |
| Post     | Retry               | `POST /v1/posts/:id/retry`          |
| Report   | Get Stats           | `GET /v1/stats`                     |
| Report   | Get Usage           | `GET /v1/usage`                     |

- **Post → Create** takes the accounts (picked from a list of your connected accounts), a format (video, slideshow or image), media URLs and a caption. Additional fields set a scheduled time, your own external ID, TikTok privacy, comments, duets, stitches, draft mode and content labels, and Instagram Story, grid and Story-slide options. A video becomes a TikTok video and an Instagram Reel; a slideshow becomes a TikTok photo post and an Instagram carousel.
- **Campaign → Create** spreads a JSON array of posts over accounts on a cadence (posts per day, every N days, local times and timezone). Turn on **Preview Only** to get the planned schedule and the credits it needs without creating anything.
- **Media → Upload** takes a file from an input binary field (MP4 or MOV video, JPEG, PNG or WebP image, up to 300 MB) and returns a URL to use in Post → Create.
- **Account → Create Connect Link** returns a link a creator opens to connect their TikTok or Instagram Business/Creator account. Store your own **External ID** on it to find the account later.
- **Account → Get Creator Info** returns the TikTok nickname and the privacy levels the creator allows. TikTok asks apps to show these before posting.

## Workflow behavior

- Each input item produces its results as output items linked to that input. **Get Many** operations return one item per account, post or campaign.
- **Get Many** offers **Return All** or a **Limit** (default 50). The node follows the API's pages itself; there are no cursor fields to manage.
- Each published result uses one UGC API credit. Failed and cancelled results are refunded. Insufficient credits return HTTP 402 with the number needed.
- Errors show the API's error code and message (for example `HTTP 402 insufficient_credits`) and never include the API key or request headers. Failed requests stop the workflow unless **Continue On Fail** is on.
- Requests go only to `https://ugcapi.dev`, encode identifiers, and do not follow redirects.

Platform rules still apply: TikTok and Instagram enforce their own limits, and Instagram requires a Business or Creator account. Facebook Pages and YouTube are not available yet.

## Example

`examples/schedule-post.json` checks your credits, then schedules a TikTok and Instagram post for tomorrow. Import it with **Import from File** and pick your accounts.

## Compatibility

Built with `@n8n/node-cli` 0.51.4 for n8n 1.x (`n8nNodesApiVersion` 1). Tested with Node.js 22 and 24.

## Development and support

Run `npm ci --ignore-scripts`, `npm test` and `npm run review` to build, run the runtime tests, and check formatting, the official n8n linter (zero warnings) and the n8n community package scanner on source and compiled code.

- Source: [ugcapi/n8n-nodes-ugcapi](https://github.com/ugcapi/n8n-nodes-ugcapi) · [Issues](https://github.com/ugcapi/n8n-nodes-ugcapi/issues)
- API docs: [ugcapi.dev/docs](https://ugcapi.dev/docs/quickstart/) · [Privacy](https://ugcapi.dev/privacy/) · Support: hello@ugcapi.dev

MIT license.
