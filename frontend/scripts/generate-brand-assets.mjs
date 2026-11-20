/**
 * Génère les assets brand depuis public/favicon.svg :
 * - favicon-48.png (Google recommande ≥48px ; certains crawlers ignorent le SVG seul)
 * - apple-touch-icon.png (180×180)
 *
 * Usage : npm run build:brand-assets
 * Appelé automatiquement avant vite build.
 *
 * L'image Open Graph n'est PAS générée ici (AXE-909) : voir scripts/generate-og-image.mjs
 * (npm run build:og-image), pour qu'un build n'écrase pas le JPEG versionné.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'favicon.svg');
const svg = readFileSync(svgPath);

async function writeFavicon48() {
  const outPath = join(root, 'public', 'favicon-48.png');
  await sharp(svg).resize(48, 48).png({ compressionLevel: 9 }).toFile(outPath);
  console.log('Écrit: public/favicon-48.png');
}

async function writeAppleTouch() {
  const outPath = join(root, 'public', 'apple-touch-icon.png');
  await sharp(svg).resize(180, 180).png({ compressionLevel: 9 }).toFile(outPath);
  console.log('Écrit: public/apple-touch-icon.png');
}

await writeFavicon48();
await writeAppleTouch();
