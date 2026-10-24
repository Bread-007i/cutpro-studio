import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

await stat(path.join(standalone, "server.js"));
await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
  force: true,
});
await cp(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
  force: true,
});

console.log("Prepared standalone app with static assets and desktop icons.");