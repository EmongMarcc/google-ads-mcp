import { GoogleAdsApi } from "google-ads-api";
import { z } from "zod";

function getClient(creds) {
  return new GoogleAdsApi({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    developer_token: creds.developerToken,
  });
}

function getCustomer(creds, customerId) {
  const client = getClient(creds);
  const id = (customerId || creds.customerId).replace(/-/g, "");
  return client.Customer({
    customer_id: id,
    refresh_token: creds.refreshToken,
    login_customer_id: creds.managerAccountId
      ? creds.managerAccountId.replace(/-/g, "")
      : undefined,
  });
}

export function registerTools(server, creds) {
  // 1. LIST CAMPAIGNS
  server.tool(
    "list_campaigns",
    "List all Google Ads campaigns with status and budget info",
    {
      customer_id: z.string().optional().describe("Override default customer ID"),
      status: z.enum(["ENABLED", "PAUSED", "REMOVED", "ALL"]).optional().default("ALL"),
    },
    async ({ customer_id, status }) => {
      const customer = getCustomer(creds, customer_id);
      const statusFilter = status && status !== "ALL" ? `AND campaign.status = '${status}'` : "";
      const campaigns = await customer.query(`
        SELECT campaign.id, campaign.name, campaign.status,
               campaign.advertising_channel_type, campaign.bidding_strategy_type,
               campaign_budget.amount_micros, campaign_budget.delivery_method,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM campaign
        WHERE campaign.status != 'REMOVED' ${statusFilter}
        ORDER BY metrics.cost_micros DESC LIMIT 50
      `);
      return { content: [{ type: "text", text: JSON.stringify(campaigns, null, 2) }] };
    }
  );

  // 2. GET CAMPAIGN PERFORMANCE
  server.tool(
    "get_campaign_performance",
    "Get detailed performance metrics for campaigns in a date range",
    {
      customer_id: z.string().optional(),
      date_from: z.string().describe("Start date YYYY-MM-DD"),
      date_to: z.string().describe("End date YYYY-MM-DD"),
      campaign_id: z.string().optional(),
    },
    async ({ customer_id, date_from, date_to, campaign_id }) => {
      const customer = getCustomer(creds, customer_id);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const results = await customer.query(`
        SELECT campaign.id, campaign.name, campaign.status,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.conversions_value, metrics.ctr, metrics.average_cpc, metrics.average_cpm,
               metrics.cost_per_conversion, metrics.value_per_conversion, segments.date
        FROM campaign
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}' ${campaignFilter}
        ORDER BY segments.date DESC
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 3. LIST AD GROUPS
  server.tool(
    "list_ad_groups",
    "List ad groups for a campaign",
    {
      customer_id: z.string().optional(),
      campaign_id: z.string().optional(),
      status: z.enum(["ENABLED", "PAUSED", "REMOVED", "ALL"]).optional().default("ALL"),
    },
    async ({ customer_id, campaign_id, status }) => {
      const customer = getCustomer(creds, customer_id);
      const filters = [];
      if (campaign_id) filters.push(`campaign.id = ${campaign_id}`);
      if (status && status !== "ALL") filters.push(`ad_group.status = '${status}'`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const results = await customer.query(`
        SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type,
               campaign.id, campaign.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM ad_group ${where}
        ORDER BY metrics.cost_micros DESC LIMIT 100
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 4. LIST ADS
  server.tool(
    "list_ads",
    "List ads with performance metrics",
    {
      customer_id: z.string().optional(),
      campaign_id: z.string().optional(),
      ad_group_id: z.string().optional(),
      status: z.enum(["ENABLED", "PAUSED", "REMOVED", "ALL"]).optional().default("ALL"),
    },
    async ({ customer_id, campaign_id, ad_group_id, status }) => {
      const customer = getCustomer(creds, customer_id);
      const filters = ["ad_group_ad.status != 'REMOVED'"];
      if (campaign_id) filters.push(`campaign.id = ${campaign_id}`);
      if (ad_group_id) filters.push(`ad_group.id = ${ad_group_id}`);
      if (status && status !== "ALL") filters.push(`ad_group_ad.status = '${status}'`);
      const results = await customer.query(`
        SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group_ad.ad.type,
               ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions,
               ad_group_ad.ad.final_urls, campaign.id, campaign.name, ad_group.id, ad_group.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr
        FROM ad_group_ad WHERE ${filters.join(" AND ")}
        ORDER BY metrics.impressions DESC LIMIT 100
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 5. GET KEYWORDS
  server.tool(
    "get_keywords",
    "Get keywords with performance metrics and quality scores",
    {
      customer_id: z.string().optional(),
      campaign_id: z.string().optional(),
      ad_group_id: z.string().optional(),
      status: z.enum(["ENABLED", "PAUSED", "REMOVED", "ALL"]).optional().default("ALL"),
    },
    async ({ customer_id, campaign_id, ad_group_id, status }) => {
      const customer = getCustomer(creds, customer_id);
      const filters = [];
      if (campaign_id) filters.push(`campaign.id = ${campaign_id}`);
      if (ad_group_id) filters.push(`ad_group.id = ${ad_group_id}`);
      if (status && status !== "ALL") filters.push(`ad_group_criterion.status = '${status}'`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const results = await customer.query(`
        SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
               ad_group_criterion.keyword.match_type, ad_group_criterion.status,
               ad_group_criterion.quality_info.quality_score,
               ad_group_criterion.quality_info.creative_quality_score,
               ad_group_criterion.quality_info.post_click_quality_score,
               ad_group_criterion.quality_info.search_predicted_ctr,
               campaign.name, ad_group.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.average_cpc, metrics.ctr
        FROM ad_group_criterion ${where}
        ORDER BY metrics.cost_micros DESC LIMIT 200
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 6. GET ACCOUNT SUMMARY
  server.tool(
    "get_account_summary",
    "Get overall account performance summary for a date range",
    {
      customer_id: z.string().optional(),
      date_from: z.string().describe("Start date YYYY-MM-DD"),
      date_to: z.string().describe("End date YYYY-MM-DD"),
    },
    async ({ customer_id, date_from, date_to }) => {
      const customer = getCustomer(creds, customer_id);
      const results = await customer.query(`
        SELECT customer.id, customer.descriptive_name, customer.currency_code,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.conversions_value, metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion
        FROM customer
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}'
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 7. GET TOP KEYWORDS
  server.tool(
    "get_top_keywords",
    "Get top or worst performing keywords by a specific metric",
    {
      customer_id: z.string().optional(),
      date_from: z.string(),
      date_to: z.string(),
      metric: z.enum(["clicks", "impressions", "conversions", "cost"]).default("clicks"),
      limit: z.number().optional().default(20),
      order: z.enum(["top", "worst"]).default("top"),
    },
    async ({ customer_id, date_from, date_to, metric, limit, order }) => {
      const customer = getCustomer(creds, customer_id);
      const metricMap = { clicks: "metrics.clicks", impressions: "metrics.impressions", conversions: "metrics.conversions", cost: "metrics.cost_micros" };
      const orderDir = order === "top" ? "DESC" : "ASC";
      const results = await customer.query(`
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               campaign.name, ad_group.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.average_cpc, metrics.ctr, metrics.cost_per_conversion
        FROM ad_group_criterion
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}'
          AND ad_group_criterion.type = 'KEYWORD'
        ORDER BY ${metricMap[metric]} ${orderDir} LIMIT ${limit}
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 8. GET SEARCH TERMS
  server.tool(
    "get_search_terms",
    "Get search terms report — what users actually searched for",
    {
      customer_id: z.string().optional(),
      date_from: z.string(),
      date_to: z.string(),
      campaign_id: z.string().optional(),
      min_impressions: z.number().optional().default(10),
    },
    async ({ customer_id, date_from, date_to, campaign_id, min_impressions }) => {
      const customer = getCustomer(creds, customer_id);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const results = await customer.query(`
        SELECT search_term_view.search_term, search_term_view.status, campaign.name, ad_group.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.ctr, metrics.average_cpc
        FROM search_term_view
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}'
          AND metrics.impressions >= ${min_impressions} ${campaignFilter}
        ORDER BY metrics.clicks DESC LIMIT 200
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 9. GET GEO PERFORMANCE
  server.tool(
    "get_geo_performance",
    "Get performance broken down by geographic location",
    {
      customer_id: z.string().optional(),
      date_from: z.string(),
      date_to: z.string(),
      campaign_id: z.string().optional(),
    },
    async ({ customer_id, date_from, date_to, campaign_id }) => {
      const customer = getCustomer(creds, customer_id);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const results = await customer.query(`
        SELECT geographic_view.location_type, geographic_view.country_criterion_id,
               campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.ctr
        FROM geographic_view
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}' ${campaignFilter}
        ORDER BY metrics.clicks DESC LIMIT 100
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 10. GET DEVICE PERFORMANCE
  server.tool(
    "get_device_performance",
    "Get performance breakdown by device (mobile, desktop, tablet)",
    {
      customer_id: z.string().optional(),
      date_from: z.string(),
      date_to: z.string(),
      campaign_id: z.string().optional(),
    },
    async ({ customer_id, date_from, date_to, campaign_id }) => {
      const customer = getCustomer(creds, customer_id);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const results = await customer.query(`
        SELECT segments.device, campaign.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.ctr, metrics.average_cpc
        FROM campaign
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}' ${campaignFilter}
        ORDER BY metrics.cost_micros DESC
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 11. GET AD SCHEDULE PERFORMANCE
  server.tool(
    "get_ad_schedule_performance",
    "Get performance by day of week and hour",
    {
      customer_id: z.string().optional(),
      date_from: z.string(),
      date_to: z.string(),
      campaign_id: z.string().optional(),
    },
    async ({ customer_id, date_from, date_to, campaign_id }) => {
      const customer = getCustomer(creds, customer_id);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const results = await customer.query(`
        SELECT segments.day_of_week, segments.hour, campaign.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.ctr
        FROM campaign
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}' ${campaignFilter}
        ORDER BY metrics.clicks DESC
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 12. GET AUDIENCE PERFORMANCE
  server.tool(
    "get_audience_performance",
    "Get performance by audience segments",
    {
      customer_id: z.string().optional(),
      date_from: z.string(),
      date_to: z.string(),
    },
    async ({ customer_id, date_from, date_to }) => {
      const customer = getCustomer(creds, customer_id);
      const results = await customer.query(`
        SELECT ad_group_audience_view.resource_name, campaign.name, ad_group.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.ctr
        FROM ad_group_audience_view
        WHERE segments.date BETWEEN '${date_from}' AND '${date_to}'
        ORDER BY metrics.clicks DESC LIMIT 100
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 13. UPDATE CAMPAIGN STATUS
  server.tool(
    "update_campaign_status",
    "Pause or enable a campaign",
    {
      customer_id: z.string().optional(),
      campaign_id: z.string().describe("Campaign resource name or ID"),
      status: z.enum(["ENABLED", "PAUSED"]),
    },
    async ({ customer_id, campaign_id, status }) => {
      const customer = getCustomer(creds, customer_id);
      const id = (customer_id || creds.customerId).replace(/-/g, "");
      const result = await customer.campaigns.update([{
        resource_name: `customers/${id}/campaigns/${campaign_id}`,
        status,
      }]);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 14. UPDATE CAMPAIGN BUDGET
  server.tool(
    "update_campaign_budget",
    "Update the daily budget for a campaign budget",
    {
      customer_id: z.string().optional(),
      budget_id: z.string().describe("Campaign budget ID"),
      amount_usd: z.number().describe("New daily budget in USD"),
    },
    async ({ customer_id, budget_id, amount_usd }) => {
      const customer = getCustomer(creds, customer_id);
      const id = (customer_id || creds.customerId).replace(/-/g, "");
      const amount_micros = Math.round(amount_usd * 1_000_000);
      const result = await customer.campaignBudgets.update([{
        resource_name: `customers/${id}/campaignBudgets/${budget_id}`,
        amount_micros,
      }]);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 15. GET CONVERSION ACTIONS
  server.tool(
    "get_conversion_actions",
    "List all conversion actions configured in the account",
    { customer_id: z.string().optional() },
    async ({ customer_id }) => {
      const customer = getCustomer(creds, customer_id);
      const results = await customer.query(`
        SELECT conversion_action.id, conversion_action.name, conversion_action.status,
               conversion_action.type, conversion_action.category, conversion_action.counting_type,
               conversion_action.value_settings.default_value,
               metrics.conversions, metrics.conversions_value, metrics.all_conversions
        FROM conversion_action
        WHERE conversion_action.status != 'REMOVED'
        ORDER BY metrics.conversions DESC
      `);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // 16. GET KEYWORD IDEAS
  server.tool(
    "get_keyword_ideas",
    "Get keyword ideas and search volume estimates using Keyword Planner",
    {
      customer_id: z.string().optional(),
      keywords: z.array(z.string()).describe("Seed keywords to generate ideas from"),
      language_id: z.string().optional().default("1000"),
      geo_target_id: z.string().optional().describe("Location criterion ID (e.g. 2784 for UAE)"),
    },
    async ({ customer_id, keywords, language_id, geo_target_id }) => {
      const client = getClient(creds);
      const id = (customer_id || creds.customerId).replace(/-/g, "");
      const loginId = creds.managerAccountId ? creds.managerAccountId.replace(/-/g, "") : undefined;
      const service = client.KeywordPlanIdeaService({
        customer_id: id,
        refresh_token: creds.refreshToken,
        login_customer_id: loginId,
      });
      const geoTargets = geo_target_id ? [`geoTargetConstants/${geo_target_id}`] : [];
      const ideas = await service.generateKeywordIdeas({
        customer_id: id,
        language: `languageConstants/${language_id}`,
        geo_target_constants: geoTargets,
        keyword_seed: { keywords },
      });
      return { content: [{ type: "text", text: JSON.stringify(ideas, null, 2) }] };
    }
  );

  // 17. GET QUALITY SCORES
  server.tool(
    "get_quality_scores",
    "Get quality scores for all keywords — identify low quality keywords",
    {
      customer_id: z.string().optional(),
      campaign_id: z.string().optional(),
      min_score: z.number().optional().default(0),
    },
    async ({ customer_id, campaign_id, min_score }) => {
      const customer = getCustomer(creds, customer_id);
      const filters = ["ad_group_criterion.type = 'KEYWORD'"];
      if (campaign_id) filters.push(`campaign.id = ${campaign_id}`);
      const results = await customer.query(`
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               ad_group_criterion.quality_info.quality_score,
               ad_group_criterion.quality_info.creative_quality_score,
               ad_group_criterion.quality_info.post_click_quality_score,
               ad_group_criterion.quality_info.search_predicted_ctr,
               campaign.name, ad_group.name
        FROM ad_group_criterion WHERE ${filters.join(" AND ")}
        ORDER BY ad_group_criterion.quality_info.quality_score ASC LIMIT 200
      `);
      const filtered = min_score > 0
        ? results.filter(r => {
            const qs = r.ad_group_criterion?.quality_info?.quality_score;
            return qs !== undefined && qs < min_score;
          })
        : results;
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    }
  );

  // 18. RUN GAQL QUERY
  server.tool(
    "run_gaql_query",
    "Run a custom GAQL (Google Ads Query Language) query for advanced reporting",
    {
      customer_id: z.string().optional(),
      query: z.string().describe("GAQL query string"),
    },
    async ({ customer_id, query }) => {
      const customer = getCustomer(creds, customer_id);
      const results = await customer.query(query);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );
}
