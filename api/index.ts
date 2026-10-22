// Vercel Function entry (vercel.json rewrites /api/* here).
// The server code is bundled by `npm run build` (scripts/build-api.mjs) into server-dist/.
import handler from "../server-dist/handler.mjs";

export default handler;
