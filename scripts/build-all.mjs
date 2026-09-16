import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const targets = ["explorer", "data", "graph", "map", "timeline", "recordview"];
const viteCli = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

for (const target of targets) {
  await run(process.execPath, [viteCli, "build", "--mode", target]);
}

await run(process.execPath, ["scripts/verify-build.mjs"]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal || code})`));
    });
  });
}
