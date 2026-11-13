/* Année du copyright : met à jour chaque <span data-year> avec l'année courante.
   Le HTML garde une année de repli (sans JavaScript). Partagé par index.html et les pages statiques. */
(function () {
  var year = String(new Date().getFullYear());
  var nodes = document.querySelectorAll('[data-year]');
  for (var i = 0; i < nodes.length; i += 1) nodes[i].textContent = year;
})();
