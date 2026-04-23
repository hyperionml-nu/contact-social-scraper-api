# Contact & Social Scraper API

This project is an Apify Actor built with `apify` and `@crawlee/cheerio`. It extracts public contact details and social profile links from business websites, and it can run in two modes:

- Actor mode for Apify runs and dataset output
- Local HTTP API mode for direct requests to `/scrape`

## What It Extracts

For each input website, the scraper returns:

- `domain`
- `emails`
- `phones`
- `contactPage`
- `aboutPage`
- `facebook`
- `instagram`
- `linkedin`
- `twitter`
- `youtube`

## What Is Actually Implemented

The current implementation in [`src/main.js`](./src/main.js) does the following:

- crawls with `CheerioCrawler`
- normalizes input URLs from either strings or `{ "url": "..." }` objects
- extracts emails from `mailto:` links and visible page text
- extracts phones from `tel:` links, JSON-LD, and footer text
- detects contact and about pages from same-domain links
- extracts social URLs from anchor tags
- filters out obvious share, help, privacy, policy, and similar non-profile social URLs
- follows same-domain pages up to `maxPagesPerDomain`
- does a limited fallback crawl of privacy/legal/terms pages when no email is found
- pushes one structured result per domain to the Apify dataset in Actor mode

The scraper does not use a browser, so heavily client-rendered sites may return partial results.

## Actor Input

The Actor input schema currently supports:

```json
{
  "startUrls": [
    { "url": "https://www.cooley.com" }
  ],
  "maxPagesPerDomain": 10
}
```

### Input fields

- `startUrls` required array of website URLs
- `maxPagesPerDomain` optional integer, minimum `1`, default `10`

## Output Example

Each dataset item has this shape:

```json
{
  "domain": "example.com",
  "emails": ["info@example.com"],
  "phones": ["+1 800 123 4567"],
  "contactPage": "https://example.com/contact",
  "aboutPage": "https://example.com/about",
  "facebook": "https://www.facebook.com/example",
  "instagram": null,
  "linkedin": "https://www.linkedin.com/company/example",
  "twitter": null,
  "youtube": null
}
```

## Local API Mode

Set `API_MODE=true` to run the built-in HTTP server instead of the Actor runner.

### Start the API

PowerShell:

```powershell
$env:API_MODE='true'
node src/main.js
```

Bash:

```bash
API_MODE=true node src/main.js
```

Default port: `3000`

Use `PORT` to change it.

## API Endpoints

### `GET /`

Returns a basic status payload in normal API use.

If the request includes the `x-apify-container-server-readiness-probe` header, it returns the readiness probe response required for standby mode.

Example response:

```json
{
  "message": "RapidAPI endpoint is ready",
  "endpoint": "/scrape"
}
```

### `GET /health`

Health check endpoint.

Response:

```json
{
  "status": "ok"
}
```

### `POST /scrape`

Scrapes one or more websites and returns the extracted results.

Request body:

```json
{
  "startUrls": [
    "https://www.cloudflare.com",
    { "url": "https://www.apify.com" }
  ],
  "maxPagesPerDomain": 10
}
```

Successful response:

```json
{
  "count": 2,
  "data": [
    {
      "domain": "cloudflare.com",
      "emails": [],
      "phones": [],
      "contactPage": "https://www.cloudflare.com/contact/",
      "aboutPage": "https://www.cloudflare.com/about-overview/",
      "facebook": null,
      "instagram": null,
      "linkedin": "https://www.linkedin.com/company/cloudflare",
      "twitter": "https://x.com/cloudflare",
      "youtube": "https://www.youtube.com/cloudflare"
    }
  ]
}
```

If the request body is invalid, the server returns HTTP `400` with:

```json
{
  "error": "..."
}
```

## Run Locally

Install dependencies:

```bash
npm install
```

Run in Actor mode:

```bash
apify run
```

Run with Node directly:

```bash
node src/main.js
```

## Apify Output

The Actor is configured with:

- input schema: [`.actor/input_schema.json`](./.actor/input_schema.json)
- output schema: [`.actor/output_schema.json`](./.actor/output_schema.json)
- dataset schema: [`.actor/dataset_schema.json`](./.actor/dataset_schema.json)

The output schema exposes:

- `overview` dataset view
- raw dataset JSON

## Notes

- Only public website content is scraped.
- Results are limited by the HTML available to `CheerioCrawler`.
- Social links are taken from page anchors and may be missing if the site does not expose them in HTML.
- The Actor includes graceful abort handling and a readiness probe for standby mode.
