// Bundles the API into one ESM file so Vercel runs exactly what we tested
// (no per-file TypeScript/ESM resolution surprises). Heavy or native-ish packages stay external
// and are installed by Vercel from package.json.
import { build } from "esbuild";

await build({
  entryPoints: ["server/node.ts"],
  outfile: "server-dist/handler.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  minify: false,
  external: ["pg", "pg-native", "nodemailer", "qrcode", "exceljs", "@electric-sql/pglite"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
