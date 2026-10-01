(function () {
  'use strict';

  var SECTIONS = [
    { id: 'new', name: 'Новое', intro: 'То, что Claude добавил с твоего прошлого визита.' },
    { id: 'pins', name: 'Закрепы', intro: 'Карусели для закрепа: текст по слайдам и подпись.' },
    { id: 'reels', name: 'Рилс', intro: 'Хуки для рилс. Нажми на карточку, чтобы увидеть, что внутри и какой хвост.' },
    { id: 'carousels', name: 'Карусели', intro: 'Хуки для каруселей.' },
    { id: 'threads', name: 'Threads', intro: 'Темы для Threads: польза, споры, мифы, личный опыт.' },
    { id: 'ideas', name: 'Идеи', intro: 'Твои черновики, оформленные в посты, и то, что из них родилось.' },
    { id: 'fixes', name: 'Поправить', intro: 'Что поменять в профиле, воронке и плане.' },
    { id: 'pains', name: 'Боли', intro: 'Мысли аудитории, которые не говорят вслух. Каждая сама по себе хук.' },
    { id: 'mine', name: 'Мои', intro: 'Идеи, которые ты добавила сама. Отправь их Claude через ⋯, чтобы он оформил.' }
  ];
  var ADDABLE = ['reels', 'carousels', 'threads', 'ideas', 'fixes'];
  var ACC_NAME = { rod: 'Книга Рода', zhi: '@zhiphotos' };
  var KEY = 'studio.v1';

  var items = [];
  var dataUpdated = '';
  var state = load();
  var undoFn = null, toastTimer = null;

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    s = s || {};
    s.done = s.done || {};
    s.removed = s.removed || {};
    s.seen = s.seen || null;
    s.mine = s.mine || [];
    s.acc = s.acc || 'rod';
    s.sec = s.sec || 'reels';
    s.view = s.view || 'todo';
    s.open = null;
    return s;
  }
  function save() {
    try {
      var copy = Object.assign({}, state); delete copy.open; delete copy.q;
      localStorage.setItem(KEY, JSON.stringify(copy));
    } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function secName(id) { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i].name; return id; }

  function all() { return items.concat(state.mine); }
  function isNew(it) { return !it.mine && state.seen && !state.seen[it.id]; }
  function statusOf(it) { return state.removed[it.id] ? 'removed' : state.done[it.id] ? 'done' : 'todo'; }

  function pool(acc, sec, view) {
    return all().filter(function (it) {
      if (it.acc !== acc) return false;
      if (sec === 'new') { if (!isNew(it)) return false; }
      else if (sec === 'mine') { if (!it.mine) return false; }
      else if (it.sec !== sec || it.mine) return false;
      return view ? statusOf(it) === view : true;
    });
  }

  // ---------- render ----------
  function renderAccs() {
    document.body.classList.toggle('acc-zhi', state.acc === 'zhi');
    document.querySelectorAll('.acc').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.acc === state.acc));
    });
    ['rod', 'zhi'].forEach(function (a) {
      var left = all().filter(function (it) { return it.acc === a && statusOf(it) === 'todo'; }).length;
      var fresh = all().filter(function (it) { return it.acc === a && isNew(it) && statusOf(it) === 'todo'; }).length;
      $('count-' + a).textContent = left + ' в работе' + (fresh ? ' · ' + fresh + ' новых' : '');
    });
  }

  function renderSecs() {
    var nav = $('secs');
    nav.innerHTML = '';
    SECTIONS.forEach(function (s) {
      var todo = pool(state.acc, s.id, 'todo').length;
      if ((s.id === 'new' || s.id === 'mine') && !pool(state.acc, s.id).length) return;
      var hasNew = s.id !== 'new' && pool(state.acc, s.id, 'todo').some(isNew);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (hasNew ? ' has-new' : '');
      b.setAttribute('aria-pressed', String(state.sec === s.id));
      b.innerHTML = esc(s.name) + ' <b>' + todo + '</b>';
      b.onclick = function () { state.sec = s.id; state.open = null; save(); render(); window.scrollTo(0, 0); };
      nav.appendChild(b);
    });
    var cur = nav.querySelector('[aria-pressed="true"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function renderFilters() {
    document.querySelectorAll('.seg button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.view === state.view));
      b.setAttribute('role', 'radio');
    });
  }

  function renderList() {
    var list = $('list');
    var q = (state.q || '').trim().toLowerCase();
    var sec = state.sec;
    if (sec !== 'new' && sec !== 'mine' && !SECTIONS.some(function (s) { return s.id === sec; })) sec = state.sec = 'reels';
    var rows = q
      ? all().filter(function (it) { return it.acc === state.acc && statusOf(it) === state.view && (it.title + ' ' + (it.text || '')).toLowerCase().indexOf(q) > -1; })
      : pool(state.acc, sec, state.view);

    if (state.view === 'todo' && !q) {
      rows.sort(function (a, b) { return (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0); });
    } else if (state.view !== 'todo') {
      var map = state.view === 'done' ? state.done : state.removed;
      rows.sort(function (a, b) { return (map[b.id] || 0) - (map[a.id] || 0); });
    }

    var html = '';
    var info = SECTIONS.filter(function (s) { return s.id === sec; })[0];
    if (!q && info && state.view === 'todo') html += '<p class="sec-intro">' + esc(info.intro) + '</p>';
    if (!q && sec === 'new' && state.view === 'todo' && rows.length) html += '<button type="button" class="bulk" data-bulk="seen">Отметить всё как прочитанное</button>';
    if (q) html += '<p class="sec-intro">Поиск по всем разделам · ' + rows.length + '</p>';

    if (!rows.length) {
      var msg = state.view === 'done' ? 'Здесь появится то, что ты отметишь сделанным.'
        : state.view === 'removed' ? 'Убранных нет. Ненужное убирай кнопкой «Убрать» — оно попадёт сюда, и его можно вернуть.'
        : q ? 'Ничего не нашлось.'
        : 'В этом разделе всё сделано. Новое Claude добавит сюда же.';
      html += '<p class="empty">' + msg + '</p>';
    }

    rows.forEach(function (it) {
      var st = statusOf(it);
      var open = state.open === it.id;
      html += '<article class="card' + (st === 'done' ? ' is-done' : '') + (open ? ' open' : '') + '" data-id="' + esc(it.id) + '">' +
        '<button type="button" class="check" data-act="done" aria-label="' + (st === 'done' ? 'Снять отметку' : 'Отметить сделанным') + '"><span>✓</span></button>' +
        '<div class="body">' +
        '<button type="button" class="head" data-act="toggle" aria-expanded="' + open + '">' +
        '<span class="title">' + esc(it.title) + '</span>' +
        '<span class="meta">' +
        (isNew(it) ? '<span class="tag new">новое</span>' : '') +
        (it.mine ? '<span class="tag mine">моё</span>' : '') +
        ((sec === 'new' || sec === 'mine' || q) ? '<span class="tag sec">' + esc(secName(it.sec)) + '</span>' : '') +
        (it.tag ? '<span class="tag">' + esc(it.tag) + '</span>' : '') +
        '</span></button>' +
        '<div class="more">' +
        (it.text ? '<div class="text">' + esc(it.text) + '</div>' : '') +
        '<div class="actions">' +
        '<button type="button" class="act-copy" data-act="copy">Скопировать</button>' +
        (st === 'removed' ? '<button type="button" data-act="restore">Вернуть</button>'
          : '<button type="button" data-act="remove">' + (it.mine ? 'Удалить' : 'Убрать') + '</button>') +
        '</div></div></div></article>';
    });
    list.innerHTML = html;
  }

  function render() {
    if ((state.sec === 'new' || state.sec === 'mine') && !pool(state.acc, state.sec).length) state.sec = 'reels';
    renderAccs(); renderSecs(); renderFilters(); renderList();
  }

  // ---------- actions ----------
  function find(id) { return all().filter(function (it) { return it.id === id; })[0]; }
  function markSeen(id) { if (state.seen && !state.seen[id]) { state.seen[id] = 1; } }

  function toast(text, undo) {
    $('toastText').textContent = text;
    $('toastUndo').hidden = !undo;
    undoFn = undo || null;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').hidden = true; undoFn = null; }, 4000);
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'Скопировано'); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Не получилось скопировать'); }
      document.body.removeChild(ta);
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }

  $('list').addEventListener('click', function (e) {
    var bulk = e.target.closest('[data-bulk]');
    if (bulk) {
      pool(state.acc, 'new').forEach(function (it) { markSeen(it.id); });
      state.sec = 'reels'; save(); render(); return;
    }
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var card = btn.closest('.card');
    var id = card.dataset.id;
    var it = find(id);
    var act = btn.dataset.act;

    if (act === 'toggle') {
      state.open = state.open === id ? null : id;
      if (state.open) markSeen(id);
      save();
      card.classList.toggle('open', state.open === id);
      btn.setAttribute('aria-expanded', String(state.open === id));
      return;
    }
    if (act === 'done') {
      markSeen(id);
      if (state.done[id]) { delete state.done[id]; save(); render(); return; }
      state.done[id] = Date.now(); delete state.removed[id]; save();
      card.style.opacity = '.4';
      setTimeout(render, 220);
      toast('Сделано', function () { delete state.done[id]; save(); render(); });
      return;
    }
    if (act === 'remove') {
      markSeen(id);
      if (it.mine) {
        var idx = state.mine.indexOf(it);
        state.mine.splice(idx, 1); save(); render();
        toast('Удалено', function () { state.mine.splice(idx, 0, it); save(); render(); });
        return;
      }
      state.removed[id] = Date.now(); delete state.done[id]; save(); render();
      toast('Убрано', function () { delete state.removed[id]; save(); render(); });
      return;
    }
    if (act === 'restore') { delete state.removed[id]; save(); render(); toast('Вернула в работу'); return; }
    if (act === 'copy') { copyText(it.title + (it.text ? '\n\n' + it.text : '')); }
  });

  $('toastUndo').addEventListener('click', function () {
    if (undoFn) undoFn();
    undoFn = null; $('toast').hidden = true;
  });

  document.querySelectorAll('.acc').forEach(function (b) {
    b.addEventListener('click', function () { state.acc = b.dataset.acc; state.open = null; save(); render(); window.scrollTo(0, 0); });
  });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { state.view = b.dataset.view; state.open = null; save(); render(); });
  });
  $('search').addEventListener('input', function (e) { state.q = e.target.value; renderList(); });

  // ---------- sheets ----------
  function openSheet(id) { $('sheetBg').hidden = false; $(id).hidden = false; }
  function closeSheets() { $('sheetBg').hidden = true; $('addSheet').hidden = true; $('setSheet').hidden = true; }
  $('sheetBg').addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheets); });

  $('addBtn').addEventListener('click', function () {
    var sel = $('addSec');
    sel.innerHTML = ADDABLE.map(function (s) { return '<option value="' + s + '">' + esc(secName(s)) + '</option>'; }).join('');
    sel.value = ADDABLE.indexOf(state.sec) > -1 ? state.sec : 'reels';
    $('addAccHint').textContent = 'Попадёт в аккаунт ' + ACC_NAME[state.acc] + ', в раздел «Мои» и в выбранный раздел.';
    $('addText').value = '';
    openSheet('addSheet');
    setTimeout(function () { $('addText').focus(); }, 50);
  });
  $('addSave').addEventListener('click', function () {
    var text = $('addText').value.trim();
    if (!text) { $('addText').focus(); return; }
    var lines = text.split('\n');
    state.mine.unshift({
      id: 'mine-' + Date.now(), acc: state.acc, sec: $('addSec').value,
      title: lines[0], text: lines.slice(1).join('\n').trim(), tag: '', added: new Date().toISOString().slice(0, 10), mine: true
    });
    state.sec = 'mine'; state.view = 'todo';
    save(); closeSheets(); render();
    toast('Идея сохранена');
  });

  $('settingsBtn').addEventListener('click', function () {
    $('dataInfo').textContent = 'Список от Claude обновлён: ' + (dataUpdated || '—') + ' · пунктов: ' + items.length;
    $('importCode').value = '';
    openSheet('setSheet');
  });

  function exportState() {
    return { done: state.done, removed: state.removed, seen: state.seen, mine: state.mine };
  }
  $('copyReport').addEventListener('click', function () {
    var lines = ['Отчёт из Студии (' + new Date().toLocaleDateString('ru-RU') + ')'];
    ['rod', 'zhi'].forEach(function (a) {
      var d = all().filter(function (it) { return it.acc === a && state.done[it.id]; });
      var m = state.mine.filter(function (it) { return it.acc === a; });
      lines.push('', '== ' + ACC_NAME[a] + ' ==');
      lines.push('Сделано (' + d.length + '):');
      d.forEach(function (it) { lines.push('✓ [' + it.id + '] ' + it.title); });
      if (m.length) {
        lines.push('Мои идеи (' + m.length + '):');
        m.forEach(function (it) { lines.push('+ [' + secName(it.sec) + '] ' + it.title + (it.text ? ' — ' + it.text.replace(/\n/g, ' ') : '')); });
      }
    });
    var r = all().filter(function (it) { return state.removed[it.id]; });
    if (r.length) { lines.push('', 'Убрано (' + r.length + '):'); r.forEach(function (it) { lines.push('× [' + it.id + '] ' + it.title); }); }
    copyText(lines.join('\n'), 'Отчёт скопирован — вставь в чат с Claude');
  });
  $('copyCode').addEventListener('click', function () {
    var code = 'STUDIO1:' + btoa(unescape(encodeURIComponent(JSON.stringify(exportState()))));
    copyText(code, 'Код скопирован');
  });
  $('importBtn').addEventListener('click', function () {
    var raw = $('importCode').value.trim().replace(/^STUDIO1:/, '');
    try {
      var s = JSON.parse(decodeURIComponent(escape(atob(raw))));
      state.done = s.done || {}; state.removed = s.removed || {}; state.seen = s.seen || state.seen; state.mine = s.mine || [];
      save(); closeSheets(); render(); toast('Отметки загружены');
    } catch (e) { toast('Код не подошёл. Скопируй его целиком ещё раз'); }
  });

  // ---------- boot ----------
  fetch('data.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      items = d.items || [];
      dataUpdated = d.updated || '';
      if (!state.seen) {
        state.seen = {};
        items.forEach(function (it) { state.seen[it.id] = 1; });
      }
      if (pool(state.acc, 'new', 'todo').length) state.sec = 'new';
      save(); render();
    })
    .catch(function () {
      $('list').innerHTML = '<p class="empty">Не удалось загрузить список. Проверь интернет и обнови страницу.</p>';
    });
})();
