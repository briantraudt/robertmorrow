import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const paintingsDir = path.join(root, "public", "paintings");
const thumbsDir = path.join(paintingsDir, "thumbs");
const THUMB_WIDTH = 720;

async function main() {
  await mkdir(thumbsDir, { recursive: true });
  const files = await readdir(paintingsDir);
  const images = files.filter((file) => /\.(jpe?g|png|webp)$/i.test(file));

  for (const file of images) {
    const input = path.join(paintingsDir, file);
    const parsed = path.parse(file);
    const output = path.join(thumbsDir, `${parsed.name}.jpg`);

    await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: THUMB_WIDTH,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 90,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toFile(output);
  }

  console.log(`Generated ${images.length} gallery thumbnails in ${thumbsDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
