/**
 * Génère l'image Open Graph (1200×630) en JPEG sans canal alpha.
 *
 * Pourquoi un JPEG : WhatsApp gère mal l'alpha des PNG RGBA et remplace le
 * texte de l'image par des barres blanches (AXE-909).
 *
 * Rendu : HTML aux couleurs de la home (tokens `public/ds-tokens.css`) capturé
 * avec Chromium (Playwright). Aucune couleur en dur : tout vient des tokens.
 *
 * Usage : npm run build:og-image
 * Option : CHROMIUM_PATH=/chemin/vers/chromium si le navigateur est déjà installé
 *          (sinon : npx playwright install chromium).
 *
 * Changer l'image = incrémenter OUTPUT_FILE (_v3, …) ici ET dans les balises
 * og:image / twitter:image / sitemap.xml, pour contourner le cache des réseaux sociaux.
 * Le fichier n'est volontairement PAS régénéré par `npm run build`.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const OG_W = 1200;
const OG_H = 630;
const OUTPUT_FILE = 'axel_og_image_v2.jpg';

const asDataUri = (relPath, mime) =>
  `data:${mime};base64,${readFileSync(join(publicDir, relPath)).toString('base64')}`;

const tokensCss = readFileSync(join(publicDir, 'ds-tokens.css'), 'utf8');
const fraunces = asDataUri('fonts/fraunces-latin-wght-normal.woff2', 'font/woff2');
const inter = asDataUri('fonts/inter-latin-wght-normal.woff2', 'font/woff2');
const logo = asDataUri('favicon.svg', 'image/svg+xml');

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>
${tokensCss}
@font-face { font-family: 'Fraunces'; src: url(${fraunces}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Inter'; src: url(${inter}) format('woff2'); font-weight: 100 900; }

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${OG_W}px;
  height: ${OG_H}px;
  position: relative;
  overflow: hidden;
  background: var(--ds-color-bg-subtle);
  color: var(--ds-color-text-default);
  font-family: 'Inter', sans-serif;
}

.left {
  position: absolute;
  left: 80px;
  top: 0;
  width: 640px;
  height: ${OG_H}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.brand { display: flex; align-items: center; gap: 22px; margin-bottom: 44px; }
.brand img { width: 74px; height: 74px; }
.brand span { font-family: 'Fraunces', serif; font-size: 44px; font-weight: 700; }
h1 {
  font-family: 'Fraunces', serif;
  font-size: 70px;
  font-weight: 700;
  line-height: 1.08;
}
h1 em { font-style: normal; color: var(--ds-color-action-primary-bg); }
.sub { margin-top: 28px; font-size: 32px; color: var(--ds-color-text-muted); }

.sheet {
  position: absolute;
  left: 745px;
  top: 80px;
  width: 340px;
  height: 470px;
  transform: rotate(3deg);
  background: var(--ds-color-bg-default);
  border: 2px solid var(--ds-color-border-default);
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(18, 26, 37, 0.14);
  padding: 30px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bar { height: 14px; border-radius: 7px; background: var(--ds-color-neutral-200); }
.bar.title { background: var(--ds-color-neutral-300); }
.gap { height: 14px; }

.badge {
  position: absolute;
  left: 985px;
  top: 50px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: var(--ds-color-action-primary-bg);
  color: var(--ds-color-action-primary-fg);
  border: 6px solid var(--ds-color-bg-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.badge b { font-family: 'Fraunces', serif; font-size: 62px; font-weight: 700; line-height: 1; }
.badge small { font-size: 22px; font-weight: 600; letter-spacing: 0.04em; margin-top: 4px; }
</style>
</head>
<body>
  <div class="left">
    <div class="brand"><img src="${logo}" alt="" /><span>AxeL Job</span></div>
    <h1>Un CV adapté à<br /><em>chaque offre</em><br />en 1 clic</h1>
    <p class="sub">IA &amp; score ATS</p>
  </div>
  <div class="sheet">
    <div class="bar title" style="width: 62%"></div>
    <div class="bar" style="width: 42%"></div>
    <div class="gap"></div>
    <div class="bar" style="width: 100%"></div>
    <div class="bar" style="width: 96%"></div>
    <div class="bar" style="width: 78%"></div>
    <div class="gap"></div>
    <div class="bar" style="width: 98%"></div>
    <div class="bar" style="width: 66%"></div>
    <div class="bar" style="width: 94%"></div>
    <div class="bar" style="width: 74%"></div>
  </div>
  <div class="badge"><b>92</b><small>ATS</small></div>
</body>
</html>`;

const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({
    viewport: { width: OG_W, height: OG_H },
    colorScheme: 'light',
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const outPath = join(publicDir, OUTPUT_FILE);
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 92 });
  const kb = (statSync(outPath).size / 1024).toFixed(1);
  console.log(`Écrit: public/${OUTPUT_FILE} (${kb} KiB)`);
} finally {
  await browser.close();
}
