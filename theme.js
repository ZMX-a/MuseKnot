(function () {
  try {
    var preference = localStorage.getItem('mk-theme') || 'auto';
    var dark = preference === 'dark' || (preference === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (_) { document.documentElement.dataset.theme = 'light'; }
})();
