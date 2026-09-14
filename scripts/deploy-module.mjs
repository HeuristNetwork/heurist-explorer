import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const validTargets = new Set(["explorer", "data", "graph", "map", "timeline"]);
const target = process.argv[2];
if (!validTargets.has(target)) {
  throw new Error(`Expected module name: ${[...validTargets].join(", ")}`);
}

const moduleName = `heurist-${target}`;
const sourceDirectory = path.resolve("dist", moduleName);
const distributionRoot =
  process.env.HEURIST_CLIENT_DIST_ROOT || "C:/xampp/htdocs/heurist/hclient/bundles/";
const destinationDirectory = path.join(distributionRoot, moduleName);
const stagingDirectory = `${destinationDirectory}.new-${process.pid}`;
const previousDirectory = `${destinationDirectory}.old-${process.pid}`;

await requireFile(path.join(sourceDirectory, `${moduleName}.js`));
await requireFile(path.join(sourceDirectory, `${moduleName}-main.css`));
await mkdir(distributionRoot, { recursive: true });
await rm(stagingDirectory, { recursive: true, force: true });
await rm(previousDirectory, { recursive: true, force: true });
await cp(sourceDirectory, stagingDirectory, { recursive: true, force: true });

let hadPrevious = false;
try {
  await rename(destinationDirectory, previousDirectory);
  hadPrevious = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

try {
  await rename(stagingDirectory, destinationDirectory);
} catch (error) {
  if (hadPrevious) await rename(previousDirectory, destinationDirectory).catch(() => {});
  throw error;
}

await rm(previousDirectory, { recursive: true, force: true });
console.log(`Deployed ${moduleName} to ${destinationDirectory}`);

async function requireFile(filename) {
  if (!(await stat(filename).catch(() => null))?.isFile()) {
    throw new Error(`Required build file is missing: ${filename}`);
  }
}

