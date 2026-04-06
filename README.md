# Website Contact information Extractor

A production-ready contact information scraper designed for reliable, structured extraction of publicly available business contact details from company websites.

This Actor delivers clean, validated, and deduplicated data optimized for automation pipelines, CRM enrichment, lead generation systems, and business intelligence workflows.

---

## What This Actor Extracts

For each provided website domain, the Actor returns:

- Business email addresses (validated format)
- Public phone numbers (filtered and normalized)
- Contact page URL
- About page URL
- Facebook profile link
- Instagram profile link
- LinkedIn company page
- Twitter / X profile
- YouTube channel (if available)

All fields are returned in a consistent, structured JSON format. If certain information is not publicly available, the field may return `null`.

---

## How It Works

- Static HTML parsing using Crawlee CheerioCrawler
- Controlled same-domain internal page discovery
- Intelligent contact and about page detection
- JSON-LD structured data parsing
- Footer-based phone extraction
- Strict email validation rules
- Social link sanitization to avoid share, policy, or support links
- Deduplicated output using internal Set handling

The Actor is optimized for performance, structural consistency, and predictable execution.

---

## Ideal Use Cases

- Sales prospecting and lead enrichment
- CRM data completion
- Business contact discovery
- Website intelligence collection
- Automation pipelines (Make.com, Zapier, n8n, API usage)
- Market research and competitive analysis

---

## Input Example

```json
{
  "startUrls": [
    { "url": "https://www.cloudflare.com" }
  ]
}
```

Multiple domains can be processed in a single run.

---

## Output Example

```json
{
  "domain": "example.com",
  "emails": ["info@example.com"],
  "phones": ["+1-800-123-4567"],
  "contactPage": "https://example.com/contact",
  "aboutPage": "https://example.com/about",
  "facebook": "https://facebook.com/example",
  "instagram": null,
  "linkedin": "https://linkedin.com/company/example",
  "twitter": null,
  "youtube": null
}
```

---

## Performance & Stability

- Lightweight static HTML extraction
- Same-domain crawl control with page limits
- Low memory footprint
- Suitable for batch domain processing
- Designed for consistent, low-overhead execution
- Clean structured dataset output

---

## Important Notes

- Only publicly accessible website information is collected.
- Websites that hide contact details behind forms or authentication may return limited data.
- Dynamic client-side rendering may affect detection of certain content.
- The Actor prioritizes stability and data quality over aggressive crawling.

---

## Production Ready

Built with Crawlee and CheerioCrawler, this Actor focuses on data quality, validation accuracy, structural consistency, and operational reliability. It is suitable for professional workflows requiring automation-ready output.

---

## RapidAPI-Style Local Endpoints

Run the API mode locally:

```bash
API_MODE=true node src/main.js
```

Available endpoints:

- `GET /` - API info and standby readiness probe support
- `GET /health` - Health check
- `POST /scrape` - Scrape one or more websites

Request body for `POST /scrape`:

```json
{
  "startUrls": [
    "https://www.cloudflare.com"
  ],
  "maxPagesPerDomain": 10
}
```

PowerShell test example:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/scrape -ContentType "application/json" -Body '{"startUrls":["https://www.cloudflare.com"],"maxPagesPerDomain":3}'
```