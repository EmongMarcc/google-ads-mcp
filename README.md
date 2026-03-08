# Google Ads MCP Server

A remote MCP server that connects Claude.ai to your Google Ads account via the [Model Context Protocol](https://modelcontextprotocol.io).

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

## Deploy to Railway

1. Push this repo to GitHub
2. Create a new Railway project from the repo
3. Add environment variables (see `.env.example`)
4. Railway auto-deploys — copy your public URL

## Connect to Claude.ai

1. Go to **Claude.ai → Settings → Integrations**
2. Click **Add Integration**
3. Enter your Railway URL: `https://your-app.railway.app/mcp`
4. Save — you're connected!

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_ADS_CLIENT_ID` | OAuth 2.0 Client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | OAuth 2.0 Refresh Token |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads Developer Token |
| `GOOGLE_CUSTOMER_ID` | Your Ads account ID (e.g. `993-324-5164`) |
| `GOOGLE_MANAGER_ACCOUNT_ID` | Manager (MCC) account ID |
| `PORT` | Server port (Railway sets this automatically) |
