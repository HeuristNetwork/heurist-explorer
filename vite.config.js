import { copyFile, mkdir } from "node:fs/promises";
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
        input: path.join(appRoot, "src", "main.js"),
        output: {
          entryFileNames: `${moduleName}.js`,
          chunkFileNames: `${moduleName}-[name].js`,
          assetFileNames: `${moduleName}-[name][extname]`,
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
  };
}
