// Bridges Node's req/res to the Web-standard handler (used by Vercel and the Vite dev server).
import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "./index.js";

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default handleNode;
export async function handleNode(req: IncomingMessage, res: ServerResponse) {
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost";
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v);
  }
  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  const response = await handle(new Request(url, { method, headers, body: body as any }));

  res.statusCode = response.status;
  const cookies = response.headers.getSetCookie?.() ?? [];
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  if (cookies.length) res.setHeader("set-cookie", cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
