# Google Ads MCP Server

A **public** remote MCP server that connects Claude.ai to any Google Ads account.
No installation required — visit the web app, enter your credentials, and get a personal MCP URL in seconds.

## 🚀 Live App

> **[your-app.railway.app](https://your-app.railway.app)**

## How It Works

1. Visit the web app
2. Enter your Google Ads OAuth credentials
3. Get your personal MCP URL (e.g. `https://your-app.railway.app/mcp/your-uuid`)
4. Add it to Claude.ai → Settings → Integrations
5. Ask Claude to manage your campaigns!

## Tools (18 total)

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all campaigns with status & budget |
| `get_campaign_performance` | Performance metrics by date range |
| `list_ad_groups` | List ad groups for a campaign |
| `list_ads` | List ads with performance |
| `get_keywords` | Keywords with quality scores |
| `get_account_summary` | Overall account performance |
| `get_top_keywords` | Top/worst performing keywords |
| `get_search_terms` | What users actually searched for |
| `get_geo_performance` | Performance by location |
| `get_device_performance` | Mobile vs Desktop vs Tablet |
| `get_ad_schedule_performance` | Performance by day/hour |
| `get_audience_performance` | Performance by audience segment |
| `update_campaign_status` | Pause or enable a campaign |
| `update_campaign_budget` | Update daily budget |
| `get_conversion_actions` | List conversion tracking actions |
| `get_keyword_ideas` | Keyword Planner ideas & volume |
| `get_quality_scores` | Quality scores for all keywords |
| `run_gaql_query` | Run any custom GAQL query |

## API

### Register
```
POST /register
Content-Type: application/json

{
  "clientId": "...",
  "clientSecret": "...",
  "refreshToken": "...",
  "developerToken": "...",
  "customerId": "123-456-7890",
  "managerAccountId": "..." // optional
}
```

Response: `{ "token": "uuid", "mcpUrl": "https://host/mcp/uuid" }`

### Your MCP Endpoint
```
https://your-app.railway.app/mcp/<your-token>
```

Use this URL in Claude.ai → Settings → Integrations.

## Deploy to Railway

1. Fork this repo
2. Create a new Railway project from the fork
3. Railway auto-deploys — no environment variables needed for the public app
4. Your public URL is your Railway domain

## Security

- Credentials are stored in **server memory only** — never written to disk or a database
- Each user gets a unique UUID token
- Sessions reset when the server restarts (just re-register)
- Credentials are never logged

## Getting Google Ads Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the Google Ads API
3. Create OAuth 2.0 credentials (Desktop app)
4. Use the OAuth Playground or `google-ads-api` CLI to generate a refresh token
5. Get your Developer Token from [Google Ads API Center](https://ads.google.com/home/tools/manager-accounts/)
