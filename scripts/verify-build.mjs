import { stat } from "node:fs/promises";
import path from "node:path";

const targets = {
  explorer: ["explorerUserManualEng.htm", "explorerUserManualFre.htm"],
  data: ["dataUserManualEng.htm", "dataUserManualFre.htm"],
  graph: ["graphUserManualEng.htm", "graphUserManualFre.htm"],
  map: ["mapUserManualEng.htm", "mapUserManualFre.htm"],
  timeline: ["timelineUserManualEng.htm", "timelineUserManualFre.htm"],
};

for (const [target, manuals] of Object.entries(targets)) {
  const moduleName = `heurist-${target}`;
  const root = path.resolve("dist", moduleName);
  const required = [
    `${moduleName}.js`,
    `${moduleName}-main.css`,
    "assets/localization/localization_eng.txt",
    "assets/localization/localization_fre.txt",
    ...manuals,
  ];
  for (const relativePath of required) {
    const info = await stat(path.join(root, relativePath)).catch(() => null);
    if (!info?.isFile()) throw new Error(`${moduleName} is missing ${relativePath}`);
  }
}

console.log("Verified five independent Heurist module distributions.");

