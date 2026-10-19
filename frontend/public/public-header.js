/*
 * Comportement de la barre de navigation des pages HTML statiques (AXE-469) : menu « Ressources »
 * et panneau mobile. Même logique que src/components/PublicHeader.jsx (React), sans dépendance.
 * Ne s'applique qu'aux barres marquées data-public-header="static" : quand React prend la main,
 * il rend sa propre barre (data-public-header="react") et ce script n'y touche pas.
 */
(function () {
  var BREAKPOINT = '(min-width: 768px)';
  var LABEL_OPEN = 'Ouvrir le menu';
  var LABEL_CLOSE = 'Fermer le menu';
  var instances = [];

  function init(header) {
    var menu = header.querySelector('.public-header-menu');
    var toggle = header.querySelector('.public-header-menu-toggle');
    var burger = header.querySelector('.public-header-burger');
    var panel = header.querySelector('.public-header-panel');
    if (!menu || !toggle || !burger || !panel) return;

    var inst = {
      header: header,
      menu: menu,
      toggle: toggle,
      burger: burger,
      panel: panel,
      setMenu: function (open) {
        menu.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      },
      setPanel: function (open) {
        panel.hidden = !open;
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? LABEL_CLOSE : LABEL_OPEN);
      },
      isMenuOpen: function () {
        return menu.classList.contains('is-open');
      },
      isPanelOpen: function () {
        return !panel.hidden;
      },
    };
    instances.push(inst);

    toggle.addEventListener('click', function () {
      inst.setMenu(!inst.isMenuOpen());
    });
    burger.addEventListener('click', function () {
      inst.setMenu(false);
      inst.setPanel(!inst.isPanelOpen());
    });
    menu.addEventListener('focusout', function (e) {
      if (!menu.contains(e.relatedTarget)) inst.setMenu(false);
    });
    header.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a');
      if (link && header.contains(link)) {
        inst.setMenu(false);
        inst.setPanel(false);
      }
    });
  }

  function live() {
    return instances.filter(function (inst) {
      return inst.header.isConnected;
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    live().forEach(function (inst) {
      if (inst.isMenuOpen()) {
        inst.setMenu(false);
        inst.toggle.focus();
      } else if (inst.isPanelOpen()) {
        inst.setPanel(false);
        inst.burger.focus();
      }
    });
  });

  document.addEventListener('pointerdown', function (e) {
    live().forEach(function (inst) {
      if (!inst.header.contains(e.target)) {
        inst.setMenu(false);
        inst.setPanel(false);
      } else if (!inst.menu.contains(e.target)) {
        inst.setMenu(false);
      }
    });
  });

  if (window.matchMedia) {
    var mq = window.matchMedia(BREAKPOINT);
    var onChange = function () {
      if (mq.matches) {
        live().forEach(function (inst) {
          inst.setPanel(false);
        });
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function start() {
    var headers = document.querySelectorAll('header.public-header[data-public-header="static"]');
    for (var i = 0; i < headers.length; i += 1) init(headers[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
