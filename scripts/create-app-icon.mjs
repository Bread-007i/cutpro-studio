import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "logo.svg");
const iconDirectory = path.join(root, "public", "icons");
const target = path.join(root, "public", "icons", "app.ico");
const pngSizes = {
  "icon-1024.png": 1024,
  "icon-512.png": 512,
  "icon-256.png": 256,
  "icon-192.png": 192,
  "icon-128.png": 128,
  "icon-64.png": 64,
  "maskable-512.png": 512,
  "apple-touch-icon.png": 180,
  "favicon-32.png": 32,
  "favicon-16.png": 16,
};
await Promise.all(
  Object.entries(pngSizes).map(([name, size]) =>
    sharp(source)
      .resize(size, size)
      .png()
      .toFile(path.join(iconDirectory, name))
  )
);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(source)
      .resize(size, size, { fit: "cover" })
      .png()
      .toBuffer()
  )
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

const directory = Buffer.alloc(images.length * 16);
let offset = header.length + directory.length;
images.forEach((image, index) => {
  const entry = index * 16;
  const size = sizes[index];
  directory.writeUInt8(size === 256 ? 0 : size, entry);
  directory.writeUInt8(size === 256 ? 0 : size, entry + 1);
  directory.writeUInt8(0, entry + 2);
  directory.writeUInt8(0, entry + 3);
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});

await writeFile(target, Buffer.concat([header, directory, ...images]));
console.log(`Generated app icons from ${path.relative(root, source)}.`);