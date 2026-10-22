import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import svgr from "vite-plugin-svgr";

// Serves /api/* from the same server code Vercel runs, so `npm run dev` is the whole app.
function apiDevServer(): Plugin {
  return {
    name: "parking-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/") && req.url !== "/api") return next();
        try {
          const mod = await server.ssrLoadModule("/server/node.ts");
          await mod.handleNode(req, res);
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "เกิดข้อผิดพลาดของระบบ" }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // make .env values (DATABASE_URL, SMTP_*, ...) visible to the dev API
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ""), ...process.env });
  process.env.TZ = "Asia/Bangkok"; // the dev API runs in this process: Thai time, like production
  return {
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          icon: true,
          // This will transform your SVG to a React component
          exportType: "named",
          namedExport: "ReactComponent",
        },
      }),
      apiDevServer(),
    ],
    build: {
      rolldownOptions: {
        onwarn(warning, warn) {
          // Skip eval warnings from react-jvectormap
          if (
            warning.code === "EVAL" &&
            warning.id?.includes("@react-jvectormap")
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
  };
});
