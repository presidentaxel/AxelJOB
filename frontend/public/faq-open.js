/* /faq : ouvre la question ciblée par #ancre (les réponses sont repliées par défaut). */
(function () {
  function openFromHash() {
    var id = decodeURIComponent(window.location.hash.slice(1));
    var el = id ? document.getElementById(id) : null;
    if (el && el.tagName === 'DETAILS') {
      el.open = true;
      el.scrollIntoView();
    }
  }
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
})();
