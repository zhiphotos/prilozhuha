/* Лендинг «Книга Рода»: кнопки оплаты, первый урок, карусель возможностей приложения. Без зависимостей. */
(function () {
  "use strict";
  var cfg = window.KR_CONFIG || {};

  /* ---- Кнопки «Купить»: ссылка Tribute берётся из config.js ---- */
  var soon = document.getElementById("soon");
  var buy = (cfg.BUY_URL || "").trim();
  var tg = (cfg.TELEGRAM_URL || "").trim();
  document.querySelectorAll(".js-tg").forEach(function (a) { if (tg) a.href = tg; else a.style.display = "none"; });
  document.querySelectorAll(".js-tg-or").forEach(function (s) { if (!tg) s.style.display = "none"; });
  if (cfg.CONTACT_EMAIL) {
    var m = document.getElementById("soonMail");
    if (m) { m.href = "mailto:" + cfg.CONTACT_EMAIL; m.textContent = cfg.CONTACT_EMAIL; }
  }
  var goBtn = document.getElementById("soonGo");
  document.querySelectorAll(".js-buy").forEach(function (a) {
    a.setAttribute("role", "button"); a.setAttribute("aria-haspopup", "dialog");
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (goBtn) { if (buy) { goBtn.href = buy; goBtn.style.display = ""; } else { goBtn.style.display = "none"; } }
      if (soon && soon.showModal) soon.showModal(); else if (buy) window.open(buy, "_blank", "noopener");
    });
  });

  /* ---- Первый урок ---- */
  var player = document.getElementById("player");
  var video = document.getElementById("lessonVideo");
  var playBtn = document.getElementById("playBtn");
  var fb = document.getElementById("lessonFallback");
  if (fb && cfg.LESSON_FALLBACK_URL) fb.href = cfg.LESSON_FALLBACK_URL;
  if (video && playBtn) {
    playBtn.addEventListener("click", function () { video.play().catch(function () {}); });
    video.addEventListener("play", function () { player.classList.add("is-playing"); });
    video.addEventListener("pause", function () { if (video.currentTime === 0) player.classList.remove("is-playing"); });
    video.addEventListener("error", function () { if (fb) fb.textContent = "Видео не загрузилось. Смотреть на YouTube"; }, true);
  }
  document.querySelectorAll('a[href="#lesson"]').forEach(function (a) {
    a.addEventListener("click", function () { /* прокрутка делает браузер */ });
  });

  /* ---- Карусель «Что люди получают в приложении» ---- */
  var root = document.getElementById("demo");
  if (!root) return;
  var viewport = document.getElementById("demoViewport");
  var track = document.getElementById("demoTrack");
  var slides = Array.prototype.slice.call(track.querySelectorAll("[data-slide]"));
  var dotsBox = document.getElementById("demoDots");
  var bar = document.getElementById("demoProgress");
  var pauseBtn = document.getElementById("demoPause");
  var prevBtn = document.getElementById("demoPrev");
  var nextBtn = document.getElementById("demoNext");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SLIDE_MS = 8000;
  var index = 0, userPaused = reduced, hover = false, visible = false, tabVisible = !document.hidden;
  var started = 0, elapsed = 0, raf = 0;

  slides.forEach(function (s, i) {
    var d = document.createElement("button");
    d.type = "button"; d.className = "dot"; 
    d.setAttribute("aria-label", "Слайд " + (i + 1)); d.innerHTML = "<i></i>";
    d.addEventListener("click", function () { go(i, true); });
    dotsBox.appendChild(d);
  });
  var dots = Array.prototype.slice.call(dotsBox.children);

  function replay(slide) { slide.classList.remove("is-active"); void slide.offsetWidth; slide.classList.add("is-active"); }
  function go(i, byUser) {
    index = (i + slides.length) % slides.length;
    track.style.transform = "translateX(" + (-100 * index) + "%)";
    slides.forEach(function (s, k) {
      var on = k === index;
      s.setAttribute("aria-hidden", on ? "false" : "true");
      if (on) replay(s); else s.classList.remove("is-active");
    });
    dots.forEach(function (d, k) { if (k === index) d.setAttribute("aria-current","true"); else d.removeAttribute("aria-current"); });
    elapsed = 0; started = performance.now();
    bar.style.width = "0%";
    if (byUser && !reduced) { /* после ручного перехода автопрокрутка продолжается */ }
  }
  function running() { return !userPaused && !hover && visible && tabVisible; }
  function tick(now) {
    if (running()) {
      elapsed += now - started;
      bar.style.width = Math.min(100, (elapsed / SLIDE_MS) * 100) + "%";
      if (elapsed >= SLIDE_MS) go(index + 1);
    }
    started = now;
    raf = requestAnimationFrame(tick);
  }
  function setPaused(p) {
    userPaused = p;
    pauseBtn.textContent = p ? "Играть" : "Пауза";
    root.classList.toggle("is-paused", p);
    track.setAttribute("aria-live", p ? "polite" : "off");
    pauseBtn.setAttribute("aria-label", p ? "Запустить автопрокрутку" : "Остановить автопрокрутку");
  }
  pauseBtn.addEventListener("click", function () { setPaused(!userPaused); });
  prevBtn.addEventListener("click", function () { go(index - 1, true); });
  nextBtn.addEventListener("click", function () { go(index + 1, true); });
  root.addEventListener("mouseenter", function () { hover = true; });
  root.addEventListener("mouseleave", function () { hover = false; });
  root.addEventListener("focusin", function () { hover = true; });
  root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) hover = false; });
  root.addEventListener("touchstart", function () { hover = true; }, { passive: true });
  root.addEventListener("touchend", function () { setTimeout(function () { hover = false; }, 6000); }, { passive: true });
  root.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { go(index - 1, true); } else if (e.key === "ArrowRight") { go(index + 1, true); }
  });
  document.addEventListener("visibilitychange", function () { tabVisible = !document.hidden; started = performance.now(); });

  /* свайп пальцем */
  var sx = 0, sy = 0, down = false;
  viewport.addEventListener("pointerdown", function (e) { down = true; sx = e.clientX; sy = e.clientY; });
  viewport.addEventListener("pointerup", function (e) {
    if (!down) return; down = false;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1), true);
  });
  viewport.addEventListener("pointercancel", function () { down = false; });

  /* запускать анимацию, только когда карусель на экране */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      var v = es[0].isIntersecting;
      if (v && !visible) replay(slides[index]);
      visible = v; started = performance.now();
    }, { threshold: 0.35 }).observe(root);
  } else { visible = true; }

  setPaused(userPaused);
  go(0);
  if (!reduced) raf = requestAnimationFrame(tick); else bar.style.width = "0%";
})();
