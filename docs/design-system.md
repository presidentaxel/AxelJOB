# Design system AxeL Job (v2, palette Axel)

Contrat pour construire les prochains écrans.  
La référence visuelle est le site public du CRM Axel ([crm.axelproject.fr](https://crm.axelproject.fr/)) : fond crème, encre bleu nuit, orange, titres en serif. L’ancienne analyse Cohere (`docs/DESIGN-cohere.md`) est **archivée**, elle ne décrit plus le produit.

Source unique : `frontend/src/design/tokens.json` → CSS `--ds-*` (`npm run tokens`).

## 3 couches

```
Primitives  →  Sémantique  →  Composant
```

- **Primitives** (`color.neutral.900`, `color.orange.600`) : jamais dans un composant.
- **Sémantique** (`color.action.primary.bg`, `color.text.muted`) : 90 % du CSS.
- **Composant** : classes `.ds-button--*` / `.ds-input`. Elles ne référencent que du sémantique.

Règle : **aucun nouvel hex dans un fichier UI**. Si la marque change, on touche le JSON. Des CSS historiques gardent des hex : ils sont listés dans `frontend/scripts/css-hex-allowlist.json`, qui ne doit que rétrécir.

## Convention de nommage

```
[catégorie].[concept].[variante].[état]
```

CSS : `--ds-color-action-primary-bg-hover`  
Abréviation figée : **`bg`** (pas `background`).

## Palette Axel

Valeurs relevées sur le site du CRM (octobre 2026), à faire valider par l’équipe design si une charte officielle existe.

| Primitive | Valeur | Rôle |
|---|---|---|
| `neutral.900` | `#121a25` | encre : titres, bandes sombres, contours secondaires |
| `neutral.700` | `#3d4450` | texte courant |
| `neutral.500` | `#675f55` | texte discret chaud (≥ 4,8:1 sur toutes les surfaces claires) |
| `neutral.450` | `#85807a` | bordure de champ (≥ 3:1, WCAG 1.4.11) |
| `neutral.50` / `.100` | `#faf6ef` / `#f2eadc` | crème et crème foncé : fonds des pages publiques |
| `neutral.200` / `.300` | `#e6dccb` / `#d9ccb6` | traits décoratifs chauds |
| `neutral.400` / `.350` | `#b9bcc2` / `#8d929a` | texte courant / discret sur bande sombre |
| `neutral.850` / `.800` | `#2a3240` / `#1a2331` | trait et carte relevée sur bande sombre |
| `orange.500` | `#fe5126` | **orange de marque** : accents, puces, aplats décoratifs, texte ≥ 24 px |
| `orange.600` | `#c23709` | **orange d’action** : fond de CTA, focus (blanc dessus 5,5:1) |
| `orange.700` | `#a62f08` | texte et liens orange, hover des CTA |
| `orange.50` | `#ffe8df` | teinte orange pâle (pastille d’icône, fond accent) |
| `amber.500` / `sun.200` | `#fb9c24` / `#fde7c4` | secondaire chaud / surlignage d’un mot de titre |

> [!IMPORTANT]
> **Contraste (WCAG AA).** Blanc sur `orange.500` = 3,27:1 : insuffisant pour du texte normal. Un bouton avec texte blanc utilise donc `orange.600`. `orange.500` reste la couleur de marque pour les aplats sans texte, les puces et les gros titres ; sur bande sombre `neutral.900` il passe (5,35:1). **Texte orange = `text.link` (`orange.700`) uniquement.**
> `frontend/tests/unit/designSystemContrast.test.js` vérifie toutes les paires texte/fond (≥ 4,5:1) et les bordures de champ et focus (≥ 3:1) à partir de `tokens.json` : un changement de palette qui casse le contraste fait échouer la CI.

## Couleur (sémantique)

| Token | Usage |
|---|---|
| `color.bg.default / .subtle / .subtle-deep / .accent` | blanc, crème, crème foncé, teinte orange pâle |
| `color.bg.inverse / .inverse-raised` | bande sombre, carte relevée dessus |
| `color.text.default / .muted / .subtle / .link / .danger` | texte sur fond clair |
| `color.text.inverse / .inverse-muted / .inverse-subtle` | texte sur bande sombre |
| `color.border.subtle / .default` | traits décoratifs (cartes, séparateurs) |
| `color.border.input` | contour des champs (≥ 3:1) |
| `color.border.focus / .input-focus / .inverse` | focus, champ actif, trait sur bande sombre |
| `color.action.primary.*` | CTA orange |
| `color.action.secondary.*` | CTA contour encre |
| `color.action.inverse.*` | CTA sur bande sombre (crème) |
| `color.feedback.error / .warning / .success / .info` | statut |
| `color.accent.brand / .highlight` | orange de marque, surlignage |
| `color.accent.editorial` | alias historique de `accent.brand` |

## Typo (rôle, pas emplacement)

Deux familles libres (SIL OFL), auto-hébergées dans `frontend/public/fonts/` et chargées par `axel-fonts.css` :

- **Fraunces** (serif, `--ds-font-family-display`) : `ds-display-*` et `ds-heading-xl|lg`, poids 500.
- **Inter** (`--ds-font-family-body`) : tout le reste. `ds-heading-md|sm` en 600.

Classes : `ds-display-xl|lg|md`, `ds-heading-xl|lg|md|sm`, `ds-body-lg|md`, `ds-label-md|sm`, `ds-mono-sm`, `ds-highlight` (mot en italique avec surlignage `accent.highlight`).

```jsx
<h1 className="ds-display-lg">Un CV simple. <em className="ds-highlight">Vraiment</em> adapté.</h1>
```

Les pages statiques (`frontend/public/*.html`) doivent ajouter `<link rel="stylesheet" href="/fonts/axel-fonts.css">` : plus de Google Fonts pour Fraunces et Inter.

## Rayons, ombres, mise en page

| Token | Valeur | Usage |
|---|---|---|
| `radius.xs / .sm / .md / .lg / .xl` | 6 / 8 / 10 / 14 / 24 px | tags / boutons / champs, icônes / cartes, fenêtres / grandes surfaces |
| `radius.action` | 8 px | forme des CTA |
| `shadow.window / .raised / .popover` | trait 1 px + halo très doux | fenêtre de démo, carte relevée, bannière : le reste est **sans ombre** |
| `space.section` / `.section-mobile` | 104 / 72 px | padding vertical des sections |
| `layout.container.public`, `layout.gutter.public`, `layout.nav-height` | 1120 / 24 / 60 px | pages publiques |

## Bouton

Axes séparés — le rayon des CTA n’est **pas** une variante (`radius.action = 8px`).

| Axe | Valeurs |
|---|---|
| variant | `primary` `secondary` `tertiary` `ghost` `link` `danger` `success` |
| size | `sm` 32px · `md` 40px · `lg` 48px — sous 768px, `sm` et `md` passent à `size.touch.min` (44px) |
| tone | `default` · `inverse` (bande sombre) |
| state | `:hover` `:active` `:focus-visible` `:disabled` `[aria-busy]` |
| modifiers | `icon-only` `full-width` |

```jsx
<Button variant="primary" size="md" tone="inverse" loading={false}>
  Continuer
</Button>
```

```css
.ds-button.ds-button--primary.ds-button--md
```

Un seul `primary` par zone.

Pas de variant `outline` : le markup CSS `.button-pill-outline` reste un **alias de `secondary`**, pas une clé JS.

## Alias CSS legacy

`buttonClassName` ne pose plus `button` ni `button-primary`. Le markup React est `ds-button ds-button--*`.

`frontend/src/styles/ds-legacy-aliases.css` ne contient pas de sélecteurs de bouton : il mappe encore les variables `--color-*` et `--radius-*` vers `--ds-*`. Ne plus y ajouter de hex.

Le premier HTML de `index.html` peint ses CTA avec `ds-button ds-button--*` et les variables `--ds-color-action-*` du CSS critique, pour que le rechargement de `/` n’affiche pas l’ancien bouton violet.

Les pages `frontend/public/*.html` gardent `class="button button-primary"` et `static-pages.css`. Ce n’est pas le helper React.

## Input

```jsx
<Input invalid={Boolean(error)} />
{error ? <p className="ds-field-error">{error}</p> : null}
```

États : hover, focus (`border.input-focus` + outline `border.focus`), `aria-invalid`, disabled.

## Z-index

`z.dropdown` 100 · `z.sticky` 200 · `z.modal` 400 · `z.toast` 500.

## Hors v1

Motion fine au-delà de duration/easing, iconographie, gouvernance draft/beta/stable, Style Dictionary / Tailwind / Figma.

## Gouvernance

Statut v2 : **beta** (palette Axel, AXE-468). Contribuer en étendant `tokens.json` (sémantique d’abord), puis `npm run tokens`.

CI : `npm run tokens:check` échoue si `ds-tokens.generated.css` a divergé de `tokens.json`. `npm run lint:css-hex` refuse tout hex dans `frontend/src` (`*.css`) — exception permanente : le généré ; allowlist transitoire vidée par AXE-355.
