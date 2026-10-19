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

Règle : **aucun hex dans un fichier UI**. Si la marque change, on touche le JSON.

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
| `neutral.500` | `#667085` | texte discret (4,6:1 sur crème) |
| `neutral.50` | `#faf6ef` | crème : fond des pages publiques |
| `neutral.200` | `#e6dccb` | bordures chaudes |
| `orange.500` | `#fe5126` | **orange de marque** : accents, aplats décoratifs, texte ≥ 24 px |
| `orange.600` | `#d63d0c` | **orange d’action** : fond de CTA, focus |
| `orange.700` | `#b0330a` | texte et liens orange |
| `sun.200` | `#fde7c4` | surlignage d’un mot de titre |

> [!IMPORTANT]
> **Contraste (WCAG AA).** Blanc sur `orange.500` = 3,27:1 : insuffisant pour du texte normal. Un bouton avec texte blanc utilise donc `orange.600` (4,63:1). `orange.500` reste la couleur de marque pour les aplats sans texte, les accents et les gros titres. Sur fond sombre `neutral.900`, `orange.500` passe (5,35:1).

## Couleur (sémantique)

| Token | Usage |
|---|---|
| `color.bg.default / .subtle / .inverse / .accent` | blanc, crème, bande sombre, teinte orange pâle |
| `color.text.default / .muted / .subtle / .inverse / .inverse-muted / .link / .danger` | texte |
| `color.border.default / .subtle / .focus / .input-focus` | traits + focus |
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

Les pages statiques (`frontend/public/*.html`) ajoutent `<link rel="stylesheet" href="/fonts/axel-fonts.css">` : plus de Google Fonts pour Fraunces et Inter.

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
