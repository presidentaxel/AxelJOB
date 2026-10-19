/**
 * Barre de navigation unique des pages publiques (AXE-469) : contenu et balisage.
 *
 * Source UNIQUE, importée par :
 *   - src/components/PublicHeader.jsx (rendu React : landing et pages de contenu) ;
 *   - scripts/sync-public-header.mjs, qui écrit le même balisage dans index.html et dans
 *     les pages HTML statiques de public/ (`npm run public-header:sync`).
 * Les libellés viennent de landingCopy.js ; les ids d'analytics (data-attr) sont ceux du catalogue AXE-358/359.
 * Le style est dans src/components/PublicHeader.css, le comportement mobile des pages
 * statiques dans public/public-header.js (même logique que PublicHeader.jsx).
 */
import { landingText } from './landingCopy.js';

export const PUBLIC_HEADER_RESOURCES_ID = 'public-header-resources';
export const PUBLIC_HEADER_PANEL_ID = 'public-header-panel';
export const PUBLIC_HEADER_BREAKPOINT = '(min-width: 768px)';

export const PUBLIC_HEADER_LABELS = {
  open: 'Ouvrir le menu',
  close: 'Fermer le menu',
};

/** Menu « Ressources » : les 7 pages de contenu, dans l'ordre d'affichage. */
export const PUBLIC_RESOURCE_LINKS = [
  { to: '/ats', label: landingText.footerAts, id: 'nav-link-ats', drawerId: 'nav-drawer-ats' },
  { to: '/faq', label: landingText.footerFaq, id: 'nav-link-faq', drawerId: 'nav-drawer-faq' },
  { to: '/modeles-cv', label: landingText.navModelesShort, id: 'nav-link-modeles', drawerId: 'nav-drawer-modeles' },
  { to: '/guide-cv', label: landingText.navGuide, id: 'nav-link-guide', drawerId: 'nav-drawer-guide' },
  { to: '/erreurs-cv', label: landingText.footerErreurs, id: 'nav-link-erreurs', drawerId: 'nav-drawer-erreurs' },
  { to: '/cv-par-metier', label: landingText.footerMetier, id: 'nav-link-metier', drawerId: 'nav-drawer-metier' },
  { to: '/cv-adapte-chaque-offre', label: landingText.footerAdapte, id: 'nav-link-adapte', drawerId: 'nav-drawer-adapte' },
];

export const PUBLIC_HEADER = {
  brand: landingText.brand,
  backId: 'nav-link-back',
  pricing: { label: landingText.navPricing, id: 'nav-link-pricing', drawerId: 'nav-drawer-pricing' },
  resources: { label: landingText.navResources, toggleId: 'nav-menu-resources', drawerTitle: landingText.navResources },
  login: { to: '/login', label: landingText.ctaLogin, id: 'nav-link-login', drawerId: 'nav-drawer-login' },
  cta: { to: '/login', label: landingText.ctaTry, id: 'nav-cta-signup', drawerId: 'nav-cta-drawer' },
  burgerId: 'nav-burger',
};

/** Ancre « Tarifs » : #tarifs sur la landing, /#tarifs ailleurs. */
export function pricingHref(currentPath) {
  return currentPath === '/' ? '#tarifs' : '/#tarifs';
}

/** Chemin sans slash final ni extension .html (/ats.html -> /ats). */
export function normalizePublicPath(pathname = '/') {
  const path = String(pathname).replace(/\.html$/, '').replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function isResourcePath(currentPath) {
  return PUBLIC_RESOURCE_LINKS.some((link) => link.to === currentPath);
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attrs(id, zone, level, track) {
  return `data-attr="${id}" data-track="${track}" data-zone="${zone}" data-level="${level}"`;
}

const CHEVRON_SVG =
  '<svg class="public-header-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const BURGER_SVG =
  '<svg class="public-header-burger-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="public-header-burger-open" d="M4 7h16M4 12h16M4 17h16"/><path class="public-header-burger-close" d="M18 6 6 18M6 6l12 12"/></svg>';

/**
 * Balisage statique de la barre (identique, caractère pour caractère, à ce que rend PublicHeader.jsx
 * une fois hydraté). `currentPath` : chemin de la page ('/', '/ats'...), pour aria-current.
 */
export function renderPublicHeaderHtml(currentPath = '/', indent = '') {
  const current = normalizePublicPath(currentPath);
  const pricing = pricingHref(current);
  const cur = (to) => (to === current ? ' aria-current="page"' : '');
  const lines = [];
  const add = (depth, text) => lines.push(`${indent}${'  '.repeat(depth)}${text}`);
  const h = PUBLIC_HEADER;

  add(0, '<header class="public-header" data-public-header="static">');
  add(1, '<div class="public-header-inner">');
  add(2, `<a href="/" class="public-header-brand" ${attrs(h.backId, 'header', 'tertiary', 'nav')}>`);
  add(3, '<img src="/favicon.svg" alt="" class="public-header-logo" width="36" height="36" />');
  add(3, `<span class="public-header-brand-name">${escapeHtml(h.brand)}</span>`);
  add(2, '</a>');
  add(2, '<nav class="public-header-nav" aria-label="Navigation principale">');
  add(3, `<a href="${pricing}" class="public-header-link" ${attrs(h.pricing.id, 'header', 'tertiary', 'nav')}>${escapeHtml(h.pricing.label)}</a>`);
  add(3, '<div class="public-header-menu">');
  add(
    4,
    `<button type="button" class="public-header-menu-toggle${isResourcePath(current) ? ' is-current' : ''}" aria-expanded="false" aria-controls="${PUBLIC_HEADER_RESOURCES_ID}" ${attrs(h.resources.toggleId, 'header', 'tertiary', 'nav')}><span class="public-header-label" data-label="${escapeHtml(h.resources.label)}">${escapeHtml(h.resources.label)}</span>${CHEVRON_SVG}</button>`,
  );
  add(4, `<ul id="${PUBLIC_HEADER_RESOURCES_ID}" class="public-header-menu-list">`);
  for (const link of PUBLIC_RESOURCE_LINKS) {
    add(5, `<li><a href="${link.to}"${cur(link.to)} ${attrs(link.id, 'header', 'tertiary', 'nav')}>${escapeHtml(link.label)}</a></li>`);
  }
  add(4, '</ul>');
  add(3, '</div>');
  add(3, `<a href="${h.login.to}" class="public-header-login" ${attrs(h.login.id, 'header', 'tertiary', 'nav')}>${escapeHtml(h.login.label)}</a>`);
  add(3, `<a href="${h.cta.to}" class="public-header-cta" ${attrs(h.cta.id, 'header', 'primary', 'cta')}>${escapeHtml(h.cta.label)}</a>`);
  add(2, '</nav>');
  add(
    2,
    `<button type="button" class="public-header-burger" aria-expanded="false" aria-controls="${PUBLIC_HEADER_PANEL_ID}" aria-label="${PUBLIC_HEADER_LABELS.open}" ${attrs(h.burgerId, 'header', 'tertiary', 'nav')}>${BURGER_SVG}</button>`,
  );
  add(1, '</div>');
  add(1, `<nav id="${PUBLIC_HEADER_PANEL_ID}" class="public-header-panel" aria-label="Navigation mobile" hidden>`);
  add(2, `<a href="${pricing}" ${attrs(h.pricing.drawerId, 'header', 'tertiary', 'nav')}>${escapeHtml(h.pricing.label)}</a>`);
  add(2, `<p class="public-header-panel-title">${escapeHtml(h.resources.drawerTitle)}</p>`);
  add(2, '<ul>');
  for (const link of PUBLIC_RESOURCE_LINKS) {
    add(3, `<li><a href="${link.to}"${cur(link.to)} ${attrs(link.drawerId, 'header', 'tertiary', 'nav')}>${escapeHtml(link.label)}</a></li>`);
  }
  add(2, '</ul>');
  add(2, `<a href="${h.login.to}" ${attrs(h.login.drawerId, 'header', 'tertiary', 'nav')}>${escapeHtml(h.login.label)}</a>`);
  add(2, `<a href="${h.cta.to}" class="public-header-panel-cta" ${attrs(h.cta.drawerId, 'drawer', 'primary', 'cta')}>${escapeHtml(h.cta.label)}</a>`);
  add(1, '</nav>');
  add(0, '</header>');
  return lines.join('\n');
}
