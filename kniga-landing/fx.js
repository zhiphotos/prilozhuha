/* Эффекты лендинга: появление блоков, подсказка «листайте», бабочка-проводник. Всё отключается при «меньше движения». */
(function () {
  "use strict";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var doc = document.documentElement;

  /* ---- Появление блоков при прокрутке ---- */
  var SEL = ".kicker,.h2,.lead,.hero__sub,.hero__cta,.hero__frame,.lesson__video,.lesson__text>*,.shelf figure,.ctaband>*,.split__img,.split__text>*,.ticks li,.sub,.offer__card,.price>*,.vibe__video,.vibe__text>*,.qa,.app__note,.demo,.foot__grid>*";
  var items = Array.prototype.slice.call(document.querySelectorAll(SEL));
  if (reduced || !("IntersectionObserver" in window)) { items.forEach(function (e) { e.classList.add("in"); }); }
  else {
    var groups = new Map();
    items.forEach(function (el) {
      el.classList.add("rv");
      if (el.matches(".split__img,.vibe__video,.lesson__video")) el.classList.add("rv--paper");
      else if (el.matches(".offer__card,.shelf figure")) el.classList.add("rv--zoom");
      var p = el.parentElement; var n = groups.get(p) || 0; groups.set(p, n + 1);
      el.style.setProperty("--d", Math.min(n, 7) * 0.09 + "s");
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.02, rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---- Подсказка «можно листать»: полка покачивается влево-вправо ---- */
  function hintFor(shelf) {
    var lab = document.createElement("p");
    lab.className = "swipe-hint"; lab.setAttribute("aria-hidden", "true");
    lab.innerHTML = "<i>←</i> листайте <i>→</i>";
    shelf.parentNode.insertBefore(lab, shelf);
    if (reduced || !("IntersectionObserver" in window)) return;
    var done = false;
    new IntersectionObserver(function (es) {
      if (done || !es[0].isIntersecting) return; done = true;
      var max = shelf.scrollWidth - shelf.clientWidth; if (max < 20) return;
      var t0 = performance.now(), path = [[0, 70], [70, 0], [0, 44], [44, 0]], seg = 0, segT = performance.now();
      (function step(now) {
        if (shelf.dataset.touched) return;
        var d = 520, k = Math.min(1, (now - segT) / d), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        shelf.style.scrollSnapType = "none";
        shelf.scrollLeft = path[seg][0] + (path[seg][1] - path[seg][0]) * e;
        if (k >= 1) { seg++; segT = now; if (seg >= path.length) { shelf.style.scrollSnapType = ""; return; } }
        requestAnimationFrame(step);
      })(performance.now());
    }, { threshold: 0.6 }).observe(shelf);
    ["pointerdown", "wheel", "touchstart"].forEach(function (ev) { shelf.addEventListener(ev, function () { shelf.dataset.touched = "1"; shelf.style.scrollSnapType = ""; }, { passive: true }); });
  }
  document.querySelectorAll(".shelf").forEach(hintFor);

  /* ---- Превью уроков: играет, пока видно ---- */
  var vv = document.getElementById("vibeVideo");
  if (vv && "IntersectionObserver" in window && !reduced) {
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) vv.play().catch(function () {}); else vv.pause(); }, { threshold: 0.4 }).observe(vv);
  } else if (vv) { vv.controls = true; }

  /* ---- Бабочка-проводник ---- */
  if (reduced) return;
  var fly = document.createElement("div");
  fly.className = "fly"; fly.setAttribute("aria-hidden", "true");
  fly.innerHTML = '<svg viewBox="0 0 90 70" width="100%" height="100%"><g class="fly__wl"><path d="M45 34 C30 8 6 6 5 22 C4 36 22 42 45 38Z" fill="#c9ae74"/><path d="M45 40 C28 42 14 56 24 63 C34 68 42 54 45 40Z" fill="#a98a52"/><circle cx="22" cy="23" r="5" fill="#7b5c24"/><circle cx="26" cy="54" r="3" fill="#ece3d0"/></g><g class="fly__wr"><path d="M45 34 C60 8 84 6 85 22 C86 36 68 42 45 38Z" fill="#c9ae74"/><path d="M45 40 C62 42 76 56 66 63 C56 68 48 54 45 40Z" fill="#a98a52"/><circle cx="68" cy="23" r="5" fill="#7b5c24"/><circle cx="64" cy="54" r="3" fill="#ece3d0"/></g><ellipse cx="45" cy="38" rx="2.6" ry="14" fill="#2a1f10"/><path d="M44 24 C40 14 36 10 33 9 M46 24 C50 14 54 10 57 9" stroke="#2a1f10" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
  document.body.appendChild(fly);
  var vw = innerWidth, vh = innerHeight, x = vw * .8, y = vh * .3, px = x, py = y, ang = 0, lastScroll = 0, lastY = scrollY, shown = false, t = 0;
  addEventListener("resize", function () { vw = innerWidth; vh = innerHeight; });
  addEventListener("scroll", function () { lastScroll = performance.now(); if (!shown) { shown = true; fly.classList.add("on"); } }, { passive: true });
  setTimeout(function () { shown = true; fly.classList.add("on"); }, 1800);
  /* места, где бабочка садится и ждёт: туда нужно обратить внимание */
  var PERCH = [[".price .btn", 5], [".hero__cta .btn:first-child", 5], [".ctaband .btn", 5], [".price__nums", 4], [".demo", 3], [".vibe__tag", 3], [".player", 3], [".offer__card", 2], [".split__text .h2", 2], [".h2--center", 1]];
  function frame(now) {
    t = now / 1000;
    var max = Math.max(1, doc.scrollHeight - vh), p = scrollY / max;
    var small = vw < 700, margin = small ? 20 : 40;
    var tx = vw * (.5 + .4 * Math.sin(p * 16 + .6)), ty = vh * (.5 + .22 * Math.sin(p * 9 + 1.3));
    tx = Math.max(margin, Math.min(vw - margin, tx)); ty = Math.max(90, Math.min(vh - 70, ty));
    var rest = false;
    if (now - lastScroll > 500) {
      var best = null, bp = 0;
      for (var i = 0; i < PERCH.length; i++) {
        var els = document.querySelectorAll(PERCH[i][0]);
        for (var k = 0; k < els.length; k++) {
          var r = els[k].getBoundingClientRect();
          if (r.width > 0 && r.top > vh * .12 && r.top < vh * .7 && PERCH[i][1] > bp) { best = r; bp = PERCH[i][1]; break; }
        }
      }
      if (best) { tx = Math.max(margin, Math.min(vw - margin, best.right - 14)); ty = Math.max(80, best.top - 24); rest = true; }
    }
    tx += Math.sin(t * 2.1) * (rest ? 1.5 : (small ? 6 : 16)); ty += Math.cos(t * 2.7) * (rest ? 1.5 : 10);
    x += (tx - x) * (rest ? .05 : .035); y += (ty - y) * (rest ? .05 : .035);
    var vx = x - px; px = x; py = y;
    var a = Math.max(-35, Math.min(35, vx * 3.2)); ang += (a - ang) * .1;
    fly.style.transform = "translate(" + (x - 28) + "px," + (y - 22) + "px) rotate(" + (rest ? 0 : ang).toFixed(1) + "deg)";
    fly.classList.toggle("rest", rest);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
