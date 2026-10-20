/* Animated connecting-lines background. Add <script src="bg.js" defer></script> to your page. */
(function () {
  var canvas = document.createElement('canvas');
  canvas.id = 'bg';
  document.body.prepend(canvas);
  var ctx = canvas.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dots = [], w, h, dpr, rgb = '34,211,238', mouse = { x: -999, y: -999 };
  var LINK = 140;

  function readColor() {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) rgb = [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); }).join(',');
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(110, Math.floor(w * h / 14000));
    dots = [];
    for (var i = 0; i < n; i++) dots.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      r: Math.random() * 1.4 + .8
    });
    readColor();
  }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < dots.length; i++) {
      var a = dots[i];
      if (!reduce) {
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;
      }
      for (var j = i + 1; j < dots.length; j++) {
        var b = dots[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < LINK) {
          ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.28 * (1 - d / LINK)).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      var mx = a.x - mouse.x, my = a.y - mouse.y, md = Math.sqrt(mx * mx + my * my);
      if (md < 160) {
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.4 * (1 - md / 160)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(' + rgb + ',.65)';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  addEventListener('resize', resize);
  addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener('mouseleave', function () { mouse.x = mouse.y = -999; });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColor);
  resize(); frame();
})();
