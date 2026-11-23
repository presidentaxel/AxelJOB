import { NavLink } from 'react-router-dom';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import { APP_ROUTES } from '../lib/appRoutes.js';

/** Onglets de la page Compte (AXE-1019) : Paramètres et Support, chacun avec son URL. */
export default function AccountTabs() {
  const cls = ({ isActive }) => `account-tab${isActive ? ' account-tab--active' : ''}`;
  return (
    <nav className="account-tabs" aria-label="Compte">
      <NavLink to={APP_ROUTES.compteParametres} className={cls} {...analyticsAttrs('app-nav-link-settings', 'nav', 'tertiary', 'nav')}>
        Paramètres
      </NavLink>
      <NavLink to={APP_ROUTES.compteSupport} className={cls} {...analyticsAttrs('app-nav-link-support', 'nav', 'tertiary', 'nav')}>
        Support
      </NavLink>
    </nav>
  );
}
