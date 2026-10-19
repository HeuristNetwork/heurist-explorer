import { readFile } from "node:fs/promises";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      source: "export default {};",
      shortCircuit: true,
    };
  }
  // Vite `?raw` imports (HTML templates): the file text as the default export
  if (url.startsWith("file:") && url.endsWith("?raw")) {
    const text = await readFile(new URL(url.slice(0, -"?raw".length)), "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(text)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
