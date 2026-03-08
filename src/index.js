import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import { createSession, getSession, sessionCount } from "./store.js";
import { registerTools } from "./tools.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../public");

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
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Health check ──────────────────────────────────────────────────────────
  if (path === "/health") {
    return json(res, 200, {
      status: "ok",
      service: "google-ads-mcp",
      sessions: sessionCount(),
    });
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  if (path === "/" || path === "/index.html") {
    return serveFile(res, join(PUBLIC_DIR, "index.html"), "text/html");
  }

  // ── Register: POST /register → { token, mcpUrl } ─────────────────────────
  if (path === "/register" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const required = ["clientId", "clientSecret", "refreshToken", "developerToken", "customerId"];
      const missing = required.filter(k => !body[k]);
      if (missing.length) {
        return json(res, 400, { error: `Missing fields: ${missing.join(", ")}` });
      }
      const token = createSession(body);
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const proto = req.headers["x-forwarded-proto"] || "https";
      const mcpUrl = `${proto}://${host}/mcp/${token}`;
      return json(res, 200, { token, mcpUrl });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  // ── MCP endpoint: /mcp/:token ─────────────────────────────────────────────
  const mcpMatch = path.match(/^\/mcp\/([a-f0-9-]{36})(\/.*)?$/);
  if (mcpMatch) {
    const token = mcpMatch[1];
    const creds = getSession(token);
    if (!creds) {
      return json(res, 401, {
        error: "Invalid or expired session token. Please re-register at the homepage.",
      });
    }

    const server = new McpServer({
      name: "google-ads-mcp",
      version: "2.0.0",
    });

    registerTools(server, creds);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Fix the URL so the transport sees /mcp
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
  console.log(`Register: POST http://localhost:${PORT}/register`);
});
