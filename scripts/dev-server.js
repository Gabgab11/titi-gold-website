/**
 * Local development server — no dependencies.
 *
 *   npm run dev          → http://localhost:3000
 *
 * Serves the static site and runs the same /api/enquiry handler used in
 * production. Reads settings from a .env file if one exists.
 *
 * Set ENQUIRY_LOCAL_FILE=data/enquiries.ndjson in .env to save enquiries to a
 * local file while testing. That file channel exists ONLY in this dev server.
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { handleEnquiryRequest, configuredChannels } from "../server/enquiry-handler.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIRS = ["assets"];
const PUBLIC_FILES = ["index.html", "about.html", "foundation.html", "fashion.html", "books.html", "robots.txt", "sitemap.xml", "404.html", "favicon.ico"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
};

const extraChannels = [];
if (process.env.ENQUIRY_LOCAL_FILE) {
  const file = resolve(root, process.env.ENQUIRY_LOCAL_FILE);
  extraChannels.push({
    name: "local-file",
    async deliver(record) {
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
    },
  });
}

async function toWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  if (!headers.has("x-real-ip")) headers.set("x-real-ip", req.socket.remoteAddress || "");
  return new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
}

async function sendWebResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (path === "/") path = "/index.html";
  const rel = normalize(path).replace(/^([/\\])+/, "");
  const allowed = PUBLIC_FILES.includes(rel) || PUBLIC_DIRS.some((d) => rel.startsWith(`${d}/`) || rel.startsWith(`${d}\\`));
  const full = join(root, rel);
  if (!allowed || !full.startsWith(root)) return notFound(res);
  try {
    const info = await stat(full);
    if (!info.isFile()) return notFound(res);
    const type = TYPES[extname(full).toLowerCase()] || "application/octet-stream";
    let body = await readFile(full);
    const headers = { "Content-Type": type, "Cache-Control": "no-cache" };
    // Compress text like GitHub Pages and Vercel do, so local speed tests are realistic.
    if (/text|javascript|json|svg|xml/.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      body = gzipSync(body);
      headers["Content-Encoding"] = "gzip";
      headers.Vary = "Accept-Encoding";
    }
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    notFound(res);
  }
}

async function notFound(res) {
  const page = join(root, "404.html");
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(existsSync(page) ? await readFile(page) : "Not found");
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.split("?")[0] === "/api/enquiry") {
      const response = await handleEnquiryRequest(await toWebRequest(req), { env: process.env, extraChannels });
      return sendWebResponse(res, response);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    return serveStatic(req, res);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("Server error");
  }
});

server.listen(PORT, () => {
  const channels = [...configuredChannels(process.env), ...extraChannels.map((c) => c.name)];
  console.log(`TITI GOLD running at http://localhost:${PORT}`);
  console.log(channels.length
    ? `Enquiry delivery: ${channels.join(", ")}`
    : "Enquiry delivery: NOT CONFIGURED — the form will tell visitors their enquiry was not sent.");
});
