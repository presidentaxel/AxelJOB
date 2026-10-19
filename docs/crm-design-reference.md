# Référence design : site public du CRM Axel

Relevé fait en octobre 2026 sur [crm.axelproject.fr](https://crm.axelproject.fr/) (feuille de style `axp-*`, pages Accueil, Tarifs, Connexion). C'est la **cible visuelle** des pages publiques d'AxeL Job (AXE-469, AXE-470, AXE-490). Le contrat de build reste [design-system.md](design-system.md) : on reprend la forme, pas le vocabulaire CRM, et chaque valeur passe par un token `--ds-*`.

## Principes

- Fond **crème** (`bg.subtle`) en alternance avec du **blanc** (`bg.default`) séparé par des traits 1 px chauds (`border.subtle`) ; une **bande sombre encre** (`bg.inverse`) pour les tarifs et le CTA final.
- Titres en **Fraunces 500**, interlettrage serré, un **mot en italique surligné** (`ds-highlight`) par titre ; texte en Inter.
- **Presque pas d'ombres** : bordures 1 px à la place. Seules exceptions : fenêtre de démo (`shadow.window`) et bannière cookies (`shadow.popover`).
- Cartes `radius.lg` (14 px), boutons et petites cartes `radius.sm` (8 px), tags `radius.xs` (6 px), icônes et champs `radius.md` (10 px).
- Orange (`accent.brand`) en **accent** : puces, numéros, ✓, bordures de carte mise en avant. Le fond de bouton est `action.primary.bg` (orange AA).
- Conteneur 1120 px, gouttière 24 px, sections 104 px (72 px sous 768 px), navigation fixe de 60 px.

## Composants (classe CRM → équivalent à créer)

| Composant CRM | Spécification |
|---|---|
| `axp-nav` | fixe, 60 px, fond crème à 92 % + flou, trait bas. Marque en Fraunces 24 px / 600 avec logo 36 px. Liens Inter 15 px `text.muted`, actif `text.default` 500. « Se connecter » en bouton texte, « Essayer gratuitement » en bouton primaire. Mobile : bouton burger 40 px (bordure, `radius.md`) qui ouvre un panneau crème pleine largeur. |
| `axp-kicker` | tag blanc, bordure 1 px, `radius.xs`, 13 px / 500, **puce orange de 8 px** devant le texte. |
| `axp-eyebrow` | majuscules 13 px / 600, interlettrage 0,08 em, orange (en pratique `text.link` pour le contraste). |
| `axp-hero-title` | `clamp(44px, 6.4vw, 80px)`, interligne 1,02, marges 22 px. Grille 1,05fr / 0,95fr, écart 56 px, mockup à droite. |
| `axp-lead` | 19 px `text.muted`, largeur max 32 em. |
| `axp-reassure` | liste en ligne de 14 px `text.subtle`, chaque item précédé d'un ✓ orange (« Sans carte bancaire », etc.). |
| `axp-btn` | 15 px / 500, padding 12 × 22, `radius.action`. Primaire plein ; **ghost** = contour encre 1 px, au survol fond encre + texte crème ; **text** = sans bordure, survol orange. Sur bande sombre, ghost devient contour crème. |
| `axp-section-title` | `clamp(34px, 4.6vw, 56px)`, interligne 1,05, `text-wrap: balance`, largeur max 16 em ; sous-titre 18 px `text.muted`, 36 em. |
| `axp-window` (mockup) | carte blanche, bordure chaude, `radius.lg`, `shadow.window`, barre de titre `bg.subtle` avec **trois points beige** de 10 px (pas rouge/jaune/vert). |
| `axp-board` + `axp-board-card` | colonnes à en-tête majuscule 12 px / 600, cartes blanches 13 px ; la carte « chaude » a une bordure orange et un filet orange de 3 px à gauche. |
| bulle + mascotte | bulle encre `radius` 12/12/2, panda qui dépasse du mockup (92 px, rotation 8°). |
| `axp-trust` | bandeau entre deux traits, texte 14 px + logos en niveaux de gris à 70 % d'opacité (couleur au survol). |
| `axp-steps` | **sans carte** : filet supérieur encre, 3 colonnes séparées par un trait vertical ; gros numéro en Fraunces 44 px orange, `h3` 20 px / 600, texte 15 px. |
| `axp-feature-grid` | **grille à bordures** (pas de cartes flottantes) : 3 colonnes, trait haut et gauche sur la grille, droite et bas sur chaque case, padding 28 px ; icône 40 px `radius.md` sur fond orange pâle (`bg.accent`) ; `h3` 18 px / 600. |
| `axp-audience` | 2 colonnes (0,9 / 1,1), à droite une liste à filet supérieur encre ; chaque ligne : titre Fraunces 26 px / 500 + texte `text.muted`, séparée par un trait. |
| `axp-integration-list` | 2 colonnes de cases crème, bordure, `radius.lg`, logo 32 px + nom en 500. |
| `axp-plan-strip` (accueil) | sur bande sombre : 4 cellules séparées par `border.inverse`, la mise en avant a un filet orange de 3 px en haut et le fond `bg.inverse-raised`. Prix en Fraunces 48 px. |
| `axp-plans` (page Tarifs) | 4 cartes blanches `radius.lg`, padding 28 × 24 ; mise en avant : bordure encre + filet orange de 4 px en haut + badge orange « Le plus populaire » posé à cheval (haut −12 px, gauche 24 px). Nom en majuscules 14 px, prix Fraunces 52 px / 500, liste à ✓ orange après un trait, bouton pleine largeur. |
| `axp-faq-list` | `details` séparés par des traits ; `summary` 17 px / 600 avec un « + » orange en Fraunces qui pivote de 45° à l'ouverture ; réponse 38 em max. |
| `axp-final` | section sombre centrée, titre, intro, deux boutons (primaire + ghost). |
| `axp-page-head` | en-tête de page centré (padding 88 × 48) : kicker, titre `clamp(42px, 6vw, 72px)`, lead, liste rassurante. |
| `axp-contact` | grande carte encre (padding 40, titre 36 px, e-mail en Fraunces souligné d'un trait orange) + cartes blanches avec icône 40 px. |
| `axp-footer` | trait haut, fond crème, padding 64 × 40 ; grille 1,4fr + 3 colonnes ; titres de colonne 13 px / 600 ; liens 14 px `text.muted`, survol orange ; barre basse (copyright 13 px `text.subtle`, liens légaux) séparée par un trait. |
| bannière cookies | carte blanche 420 px max en bas à gauche, bordure chaude, `radius` 10, `shadow.popover` ; bouton « Tout accepter » encre plein en premier, « Essentiels uniquement » en contour, « Personnaliser » en lien souligné ; interrupteurs orange. |

## Pages d'authentification (`axp-auth`)

- Mise en page **2 colonnes** : formulaire sur fond crème à gauche, **panneau encre** à droite (mascotte 120 px inclinée de −6°, titre Fraunces `clamp(34px, 3.6vw, 52px)`, phrase de réassurance, liste ✓). Sur mobile : formulaire puis panneau empilés.
- Carte formulaire blanche 420 px max, bordure chaude, `radius.lg`, padding 36 × 32, sans ombre ; titre Fraunces 34 px aligné à gauche.
- Libellés 14 px / 600 avec astérisque orange ; champs `radius.md`, padding 12 × 14 ; focus = bordure encre + halo de 3 px `accent.highlight`.
- Bouton primaire pleine largeur ; liens orange (`text.link`) ; séparateur et « Pas encore de compte ? Créer un compte » sous un trait.
- Indicateur d'étapes d'inscription : cases `radius.sm`, étape active encre / texte crème.

## Écarts assumés avec le CRM

- **Contraste** : le CRM met du blanc sur `#fe5126` (3,27:1). Ici le fond de bouton est `orange.600` (4,9:1) ; `orange.500` reste la couleur de marque pour les aplats sans texte.
- **Bordures de champ** : le CRM utilise le trait décoratif `#e6dccb` (1,3:1). Ici `border.input` (≥ 3:1).
- **Contenu** : on ne reprend ni le vocabulaire CRM (devis, pipeline, TPE) ni le badge « Hébergé en France » tel quel.
