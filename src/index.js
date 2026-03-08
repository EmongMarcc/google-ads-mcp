import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import { createSession, getSession, updateSession, sessionCount } from "./store.js";
import { registerTools } from "./tools.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../public");

// Pending OAuth state → token mapping (state → session token)
const pendingOAuth = new Map();

function serveFile(res, filePath, contentType) {
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

// Exchange Google auth code for tokens
async function exchangeCodeForTokens(code, redirectUri, clientId, clientSecret) {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Token exchange failed");
  return data; // { access_token, refresh_token, expires_in, ... }
}

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Health check ───────────────────────────────────────────────────────────
  if (path === "/health") {
    return json(res, 200, { status: "ok", service: "google-ads-mcp", sessions: sessionCount() });
  }

  // ── Landing page ───────────────────────────────────────────────────────────
  if (path === "/" || path === "/index.html") {
    return serveFile(res, join(PUBLIC_DIR, "index.html"), "text/html");
  }

  // ── Register: POST /register ───────────────────────────────────────────────
  if (path === "/register" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const required = ["clientId", "clientSecret", "refreshToken", "developerToken", "customerId"];
      const missing = required.filter(k => !body[k]);
      if (missing.length) return json(res, 400, { error: `Missing fields: ${missing.join(", ")}` });
      const token = createSession(body);
      const mcpUrl = `${getBaseUrl(req)}/mcp/${token}`;
      return json(res, 200, { token, mcpUrl });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  // ── Start OAuth re-auth: GET /reauth/:token ────────────────────────────────
  // Builds a Google OAuth URL using the stored clientId, redirects user there
  const reauthMatch = path.match(/^\/reauth\/([a-f0-9-]{36})$/);
  if (reauthMatch && req.method === "GET") {
    const sessionToken = reauthMatch[1];
    const creds = getSession(sessionToken);
    if (!creds) {
      res.writeHead(302, { Location: "/?error=session_expired" });
      return res.end();
    }

    const state = `${sessionToken}:${Math.random().toString(36).slice(2)}`;
    pendingOAuth.set(state, sessionToken);
    // Clean up after 10 minutes
    setTimeout(() => pendingOAuth.delete(state), 10 * 60 * 1000);

    const redirectUri = `${getBaseUrl(req)}/oauth/callback`;
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/adwords",
      access_type: "offline",
      prompt: "consent", // Force consent to always get a new refresh_token
      state,
    });

    res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    return res.end();
  }

  // ── OAuth callback: GET /oauth/callback ────────────────────────────────────
  if (path === "/oauth/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(error || "auth_failed")}` });
      return res.end();
    }

    const sessionToken = pendingOAuth.get(state);
    if (!sessionToken) {
      res.writeHead(302, { Location: "/?error=invalid_state" });
      return res.end();
    }

    const creds = getSession(sessionToken);
    if (!creds) {
      res.writeHead(302, { Location: "/?error=session_expired" });
      return res.end();
    }

    try {
      const redirectUri = `${getBaseUrl(req)}/oauth/callback`;
      const tokens = await exchangeCodeForTokens(code, redirectUri, creds.clientId, creds.clientSecret);

      // Update session with new refresh token (and optionally access token)
      updateSession(sessionToken, {
        refreshToken: tokens.refresh_token || creds.refreshToken,
      });

      pendingOAuth.delete(state);

      // Redirect to success page
      res.writeHead(302, { Location: `/?reauth=success&token=${sessionToken}` });
      return res.end();
    } catch (err) {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(err.message)}` });
      return res.end();
    }
  }

  // ── MCP endpoint: /mcp/:token ──────────────────────────────────────────────
  const mcpMatch = path.match(/^\/mcp\/([a-f0-9-]{36})(\/.*)?$/);
  if (mcpMatch) {
    const token = mcpMatch[1];
    const creds = getSession(token);
    if (!creds) {
      return json(res, 401, {
        error: "Invalid or expired session. Please re-register at the homepage.",
      });
    }

    const server = new McpServer({ name: "google-ads-mcp", version: "2.0.0" });
    registerTools(server, creds, token, getBaseUrl(req));

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    req.url = "/mcp" + (mcpMatch[2] || "");
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`Google Ads MCP server running on port ${PORT}`);
  console.log(`Homepage: http://localhost:${PORT}/`);
});
