/* mvpfy.ai — behaviour every page shares. The theme itself is applied before
   first paint by a few inline lines in each page's <head>; this wires the
   nav's switch and names the visitor's platform on the download buttons. */
(function () {
  var root = document.documentElement;

  var btn = document.querySelector('[data-theme-toggle]');
  if (btn) {
    var paint = function () {
      var light = root.dataset.theme === 'light';
      btn.querySelector('.theme-sun').style.display = light ? 'none' : '';
      btn.querySelector('.theme-moon').style.display = light ? '' : 'none';
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    };
    btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('mvpfy-site-theme', root.dataset.theme);
      } catch {
        // Storage is blocked: the switch still works, it just isn't remembered.
      }
      paint();
    });
    paint();
  }

  var ua = navigator.userAgent;
  var os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  if (os) {
    document.querySelectorAll('[data-download] span').forEach(function (s) {
      s.textContent = 'Download for ' + os;
    });
  }
})();
