import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

const targets = Object.freeze({
  explorer: {
    version: "0.1.0",
    port: 5173,
    manuals: [
      "explorerUserManualEng.htm",
      "explorerUserManualFre.htm",
      "searchQueryLanguageEng.htm",
      "searchQueryLanguageFre.htm",
    ],
  },
  map: {
    version: "0.6.0",
    port: 5174,
    manuals: ["mapUserManualEng.htm", "mapUserManualFre.htm"],
  },
  data: {
    version: "0.1.0",
    port: 5175,
    manuals: ["dataUserManualEng.htm", "dataUserManualFre.htm"],
  },
  timeline: {
    version: "0.1.0",
    port: 5176,
    manuals: ["timelineUserManualEng.htm", "timelineUserManualFre.htm"],
  },
  graph: {
    version: "0.1.0",
    port: 5177,
    manuals: ["graphUserManualEng.htm", "graphUserManualFre.htm"],
  },
  recordview: {
    version: "0.1.0",
    port: 5178,
    manuals: ["recordviewUserManualEng.htm", "recordviewUserManualFre.htm"],
  },
});

export default defineConfig(({ mode }) => {
  const targetName = mode === "production" || mode === "development" ? "explorer" : mode;
  const target = targets[targetName];
  if (!target) {
    throw new Error(`Unknown Heurist build target: ${targetName}`);
  }

  const moduleName = `heurist-${targetName}`;
  const appRoot = path.join(repositoryRoot, "apps", targetName);
  const outputDirectory = path.join(repositoryRoot, "dist", moduleName);

  return {
    root: appRoot,
    base: "./",
    publicDir: path.join(appRoot, "public"),
    define: {
      HEURIST_MODULE_VERSION: JSON.stringify(target.version),
    },
    plugins: [copyManualsPlugin(target.manuals, outputDirectory)],
    build: {
      outDir: outputDirectory,
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: path.join(appRoot, targetName === "explorer" ? "index.html" : "src/main.js"),
        output: {
          entryFileNames: `${moduleName}.js`,
          chunkFileNames: `${moduleName}-[name].js`,
          assetFileNames: (asset) => {
            const name = asset.names?.[0] || asset.name || "";
            if (targetName === "explorer" && name === "index.css") {
              return `${moduleName}-main.css`;
            }
            return `${moduleName}-[name][extname]`;
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: target.port,
      proxy: {
        "/heurist": {
          target: "http://127.0.0.1",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});

function copyManualsPlugin(manuals, outputDirectory) {
  return {
    name: "heurist-copy-user-manuals",
    async writeBundle() {
      await mkdir(outputDirectory, { recursive: true });
      for (const filename of manuals) {
        await copyFile(
          path.join(repositoryRoot, "user-manual", filename),
          path.join(outputDirectory, filename),
        );
      }
    },
    // The copy above only runs on build (writeBundle). Without this, a Help
    // iframe under `vite dev` requests a manual that doesn't exist anywhere
    // under the dev server, 404s, and Vite's SPA history fallback serves
    // index.html instead - silently booting a second copy of the app inside
    // the help iframe. Serve manuals directly from user-manual/ in dev too.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const filename = manuals.find((name) => req.url === `/${name}`);
        if (!filename) return next();
        try {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(await readFile(path.join(repositoryRoot, "user-manual", filename)));
        } catch {
          next();
        }
      });
    },
  };
}
