/**
 * Barre secondaire « Ressources » (AXE-469) : les 7 pages de contenu en onglets, collée sous la navbar.
 * Même balisage et même CSS (PublicHeader.css) que le HTML statique généré par
 * scripts/sync-public-header.mjs depuis src/content/publicHeader.js. Absente hors des 7 pages.
 */
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  PUBLIC_RESOURCE_LINKS,
  RESOURCES_SUBNAV_LABEL,
  isResourcePath,
  normalizePublicPath,
} from '../content/publicHeader.js';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import './PublicHeader.css';

export default function ResourcesSubnav() {
  const { pathname } = useLocation();
  const current = normalizePublicPath(pathname);
  const listRef = useRef(null);
  const visible = isResourcePath(current);

  // Mobile : l'onglet courant est amené au centre de la barre (défilement horizontal de la barre seule).
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector('[aria-current="page"]');
    if (list && tab) list.scrollLeft = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
  }, [current, visible]);

  if (!visible) return null;
  return (
    <nav className="resources-subnav" aria-label={RESOURCES_SUBNAV_LABEL} data-resources-subnav="react">
      <ul className="resources-subnav-list" ref={listRef}>
        {PUBLIC_RESOURCE_LINKS.map((link) => (
          <li key={link.to}>
            <Link to={link.to} aria-current={link.to === current ? 'page' : undefined} {...analyticsAttrs(link.subnavId, 'subnav', 'tertiary', 'nav')}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
