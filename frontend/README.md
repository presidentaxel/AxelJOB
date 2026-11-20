# Frontend - React + Vite

Guide rapide pour developper et livrer la partie frontend de `cv-bot`.

## Sommaire

1. Scripts npm
2. Setup local
3. Variables d'environnement
4. Exigences qualite

## 1) Scripts npm

- `npm run dev` : demarre le serveur local Vite.
- `npm run build` : build production (inclut `build:brand-assets`).
- `npm run build:og-image` : regenere l'image Open Graph `public/axel_og_image_v2.jpg` (voir ci-dessous).
- `npm run preview` : previsualise le build en local.
- `npm run lint` : execute ESLint.
- `npm run test:e2e` : lance les tests Playwright.
- `npm run test:e2e:ui` : interface Playwright pour debug E2E.

### Image Open Graph (AXE-909)

- L'image de partage (`public/axel_og_image_v2.jpg`, 1200x630) est un **JPEG sans canal alpha** : WhatsApp gere mal l'alpha des PNG RGBA et affichait le texte en barres blanches.
- Elle est rendue par `scripts/generate-og-image.mjs` (HTML + tokens `public/ds-tokens.css`, capture Chromium via Playwright). Elle n'est **pas** regeneree par `npm run build`.
- Chromium deja installe : `CHROMIUM_PATH=/chemin/vers/chrome npm run build:og-image` ; sinon `npx playwright install chromium`.
- **Pour changer l'image** : incrementer le nom (`_v3`) dans `OUTPUT_FILE` du script **et** dans les balises `og:image` / `twitter:image` des pages (`index.html`, `public/*.html`) et `public/sitemap.xml`. Le nouveau nom contourne le cache des reseaux sociaux.
- L'ancien `public/axel_og_image.png` est conserve (apercus deja en cache) ; a supprimer plus tard.

## 2) Setup local

```bash
cd frontend
npm ci
npm run dev
```

## 3) Variables d'environnement

Creer `frontend/.env` depuis `frontend/.env.example`, puis definir :

- `VITE_API_URL` (principalement pour dev local) ;
- `VITE_SUPABASE_URL` ;
- `VITE_SUPABASE_ANON_KEY`.

Regle cle : seules les variables prefixees `VITE_` sont exposees au navigateur.

> [!WARNING]
> Ne jamais placer de secrets (service role, Stripe secret, tokens backend) dans des variables `VITE_*`.

## 4) Exigences qualite

- Le lint doit passer avant merge.
- Les parcours critiques doivent rester couverts par des E2E.
- Conserver des composants et hooks modulaires, testables et sans effets de bord caches.
