/**
 * Barre de navigation UNIQUE des pages publiques (AXE-469) : landing, pages de contenu, légales.
 * Même balisage et même CSS (PublicHeader.css) que le HTML statique, généré depuis
 * src/content/publicHeader.js par scripts/sync-public-header.mjs. Comportement du menu
 * « Ressources » et du panneau mobile : identique à public/public-header.js.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  PUBLIC_HEADER,
  PUBLIC_HEADER_BREAKPOINT,
  PUBLIC_HEADER_LABELS,
  PUBLIC_HEADER_PANEL_ID,
  PUBLIC_HEADER_RESOURCES_ID,
  PUBLIC_RESOURCE_LINKS,
  isResourcePath,
  normalizePublicPath,
  pricingHref,
} from '../content/publicHeader.js';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import { persistLoginCta } from '../../public/signupAttribution.js';
import { loginNavOptions } from '../lib/publicEntry.js';
import './PublicHeader.css';

function Chevron() {
  return (
    <svg className="public-header-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function BurgerIcon() {
  return (
    <svg className="public-header-burger-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path className="public-header-burger-open" d="M4 7h16M4 12h16M4 17h16" />
      <path className="public-header-burger-close" d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function PublicHeader() {
  const { pathname } = useLocation();
  const current = normalizePublicPath(pathname);
  const pricing = pricingHref(current);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const headerRef = useRef(null);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);
  const burgerRef = useRef(null);
  const closeAll = () => {
    setMenuOpen(false);
    setPanelOpen(false);
  };

  // Échap : ferme le menu Ressources (focus rendu au bouton) ou le panneau mobile (focus rendu au burger).
  // Clic extérieur : ferme tout ce qui est ouvert.
  useEffect(() => {
    if (!menuOpen && !panelOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (menuOpen) {
        setMenuOpen(false);
        toggleRef.current?.focus();
      } else {
        setPanelOpen(false);
        burgerRef.current?.focus();
      }
    };
    const onPointer = (e) => {
      if (!headerRef.current) return;
      if (!headerRef.current.contains(e.target)) {
        setMenuOpen(false);
        setPanelOpen(false);
      } else if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen, panelOpen]);

  // Repasse en desktop : le panneau mobile se referme.
  useEffect(() => {
    const mq = window.matchMedia(PUBLIC_HEADER_BREAKPOINT);
    const onChange = () => {
      if (mq.matches) setPanelOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const onLinkClick = () => closeAll();
  const onLoginClick = (id) => () => {
    persistLoginCta(id);
    closeAll();
  };
  const loginState = loginNavOptions().state;
  const h = PUBLIC_HEADER;
  const cur = (to) => (to === current ? 'page' : undefined);

  const pricingLink = (id, className, onClick) => {
    const attrs = analyticsAttrs(id, 'header', 'tertiary', 'nav');
    return current === '/' ? (
      <a href={pricing} className={className} onClick={onClick} {...attrs}>{h.pricing.label}</a>
    ) : (
      <Link to={pricing} className={className} onClick={onClick} {...attrs}>{h.pricing.label}</Link>
    );
  };

  return (
    <header className="public-header" ref={headerRef} data-public-header="react">
      <div className="public-header-inner">
        <Link to="/" className="public-header-brand" onClick={onLinkClick} {...analyticsAttrs(h.backId, 'header', 'tertiary', 'nav')}>
          <img src="/favicon.svg" alt="" className="public-header-logo" width="36" height="36" />
          <span className="public-header-brand-name">{h.brand}</span>
        </Link>
        <nav className="public-header-nav" aria-label="Navigation principale">
          {pricingLink(h.pricing.id, 'public-header-link', onLinkClick)}
          <div
            ref={menuRef}
            className={`public-header-menu${menuOpen ? ' is-open' : ''}`}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false);
            }}
          >
            <button
              ref={toggleRef}
              type="button"
              className={`public-header-menu-toggle${isResourcePath(current) ? ' is-current' : ''}`}
              aria-expanded={menuOpen}
              aria-controls={PUBLIC_HEADER_RESOURCES_ID}
              onClick={() => setMenuOpen((o) => !o)}
              {...analyticsAttrs(h.resources.toggleId, 'header', 'tertiary', 'nav')}
            >
              <span className="public-header-label" data-label={h.resources.label}>{h.resources.label}</span>
              <Chevron />
            </button>
            <ul id={PUBLIC_HEADER_RESOURCES_ID} className="public-header-menu-list">
              {PUBLIC_RESOURCE_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} aria-current={cur(link.to)} onClick={onLinkClick} {...analyticsAttrs(link.id, 'header', 'tertiary', 'nav')}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link
            to={h.login.to}
            state={loginState}
            className="public-header-login"
            onClick={onLoginClick(h.login.id)}
            {...analyticsAttrs(h.login.id, 'header', 'tertiary', 'nav')}
          >
            {h.login.label}
          </Link>
          <Link
            to={h.cta.to}
            state={loginState}
            className="public-header-cta"
            onClick={onLoginClick(h.cta.id)}
            {...analyticsAttrs(h.cta.id, 'header', 'primary', 'cta')}
          >
            {h.cta.label}
          </Link>
        </nav>
        <button
          ref={burgerRef}
          type="button"
          className="public-header-burger"
          aria-expanded={panelOpen}
          aria-controls={PUBLIC_HEADER_PANEL_ID}
          aria-label={panelOpen ? PUBLIC_HEADER_LABELS.close : PUBLIC_HEADER_LABELS.open}
          onClick={() => {
            setMenuOpen(false);
            setPanelOpen((o) => !o);
          }}
          {...analyticsAttrs(h.burgerId, 'header', 'tertiary', 'nav')}
        >
          <BurgerIcon />
        </button>
      </div>
      <nav id={PUBLIC_HEADER_PANEL_ID} className="public-header-panel" aria-label="Navigation mobile" hidden={!panelOpen}>
        {pricingLink(h.pricing.drawerId, undefined, onLinkClick)}
        <p className="public-header-panel-title">{h.resources.drawerTitle}</p>
        <ul>
          {PUBLIC_RESOURCE_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} aria-current={cur(link.to)} onClick={onLinkClick} {...analyticsAttrs(link.drawerId, 'header', 'tertiary', 'nav')}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link to={h.login.to} state={loginState} onClick={onLoginClick(h.login.drawerId)} {...analyticsAttrs(h.login.drawerId, 'header', 'tertiary', 'nav')}>
          {h.login.label}
        </Link>
        <Link
          to={h.cta.to}
          state={loginState}
          className="public-header-panel-cta"
          onClick={onLoginClick(h.cta.drawerId)}
          {...analyticsAttrs(h.cta.drawerId, 'drawer', 'primary', 'cta')}
        >
          {h.cta.label}
        </Link>
      </nav>
    </header>
  );
}
