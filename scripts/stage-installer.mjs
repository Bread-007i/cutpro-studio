import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileName = `CutPro-Studio-Setup-${packageJson.version}-x64.exe`;
const source = path.join(root, "release", fileName);
const destinationDirectory = path.join(root, "public", "download");
const destination = path.join(destinationDirectory, fileName);
const standaloneDownloadDirectory = path.join(root, ".next", "standalone", "public", "download");

const sourceInfo = await stat(source).catch(() => {
  throw new Error(`Installer not found: ${path.relative(root, source)}. Build the Windows installer first.`);
});
if (!sourceInfo.isFile() || sourceInfo.size < 50 * 1024 * 1024) {
  throw new Error("The Windows installer is missing or unexpectedly small; refusing to stage it for download.");
}

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
const standaloneInfo = await stat(path.join(root, ".next", "standalone", "server.js")).catch(() => null);
if (standaloneInfo) {
  await mkdir(standaloneDownloadDirectory, { recursive: true });
  await copyFile(source, path.join(standaloneDownloadDirectory, fileName));
}

const checksum = await new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(destination);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.once("error", reject);
  stream.once("end", () => resolve(hash.digest("hex")));
});
const releaseInfo = {
  version: packageJson.version,
  releaseDate: packageJson.releaseDate,
  fileName,
  size: sourceInfo.size,
  sha256: checksum,
  platform: "Windows x64",
};
await writeFile(
  path.join(destinationDirectory, "release.json"),
  `${JSON.stringify(releaseInfo, null, 2)}\n`,
  "utf8"
);
if (standaloneInfo) {
  await writeFile(
    path.join(standaloneDownloadDirectory, "release.json"),
    `${JSON.stringify(releaseInfo, null, 2)}\n`,
    "utf8"
  );
}
console.log(
  `Staged ${fileName} (${(sourceInfo.size / 1024 / 1024).toFixed(1)} MB, SHA-256 ${checksum}) at ${path.relative(root, destination)}.`
);
