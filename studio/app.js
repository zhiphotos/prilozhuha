(function () {
  'use strict';

  var SECTIONS = [
    { id: 'new', name: 'Новое', intro: 'То, что Claude добавил с твоего прошлого визита.' },
    { id: 'plan', name: 'План', intro: 'Как всё устроено: какой аккаунт за что отвечает, сколько выкладывать, что делает ИИ, а что ты. Начни отсюда.' },
    { id: 'shoots', name: 'Съёмка', intro: 'Папки съёмок. Скинь сценарий, Claude разберёт его на шаги подготовки, съёмки и монтажа, а ты отмечаешь сделанное внутри каждого ролика.' },
    { id: 'pins', name: 'Закрепы', intro: 'Карусели для закрепа: текст по слайдам и подпись.' },
    { id: 'reels', name: 'Рилс', intro: 'Хуки для рилс. Нажми на карточку, чтобы увидеть, что внутри и какой хвост.' },
    { id: 'carousels', name: 'Карусели', intro: 'Хуки для каруселей.' },
    { id: 'threads', name: 'Threads', intro: 'Темы для Threads: польза, споры, мифы, личный опыт.' },
    { id: 'ideas', name: 'Идеи', intro: 'Твои черновики, оформленные в посты, и то, что из них родилось.' },
    { id: 'captions', name: 'Описания', intro: 'Подписи под посты, карусели и рилс. Вставляй свои через +, правь и копируй одной кнопкой. Копируется только текст подписи.' },
    { id: 'fixes', name: 'Поправить', intro: 'Что поменять в профиле, воронке и плане.' },
    { id: 'pains', name: 'Боли', intro: 'Что чувствует аудитория — чтобы понимать её. В постах не дави на боль: назови её одной строкой и сразу покажи, как станет легче.' },
    { id: 'mine', name: 'Мои', intro: 'Идеи, которые ты добавила сама. Отправь их Claude через ⋯, чтобы он оформил.' }
  ];
  var ADDABLE = ['captions', 'reels', 'carousels', 'threads', 'ideas', 'fixes'];
  var ACC_NAME = { rod: 'Книга Рода', zhi: '@zhiphotos' };
  var KEY = 'studio.v1';

  var items = [];
  var shoots = [];
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
    s.steps = s.steps || {};
    s.scripts = s.scripts || [];
    s.sfOpen = s.sfOpen || {};
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
      else if (it.sec !== sec || (it.mine && sec !== 'captions')) return false;
      return view ? statusOf(it) === view : true;
    });
  }


  // ---------- съёмка: папки -> ролики -> шаги ----------
  var KIND_NAME = { long: 'Большой', short: 'Маленький' };
  function videoSteps(v) {
    var out = [];
    (v.phases || []).forEach(function (ph) { (ph.steps || []).forEach(function (st) { out.push(st); }); });
    return out;
  }
  function prog(steps) {
    var d = steps.filter(function (st) { return state.steps[st.id]; }).length;
    return { d: d, n: steps.length, p: steps.length ? Math.round(d / steps.length * 100) : 0 };
  }
  function folderSteps(f) {
    var out = [];
    (f.videos || []).forEach(function (v) { out = out.concat(videoSteps(v)); });
    return out;
  }
  function openVideosLeft(acc) {
    var n = 0;
    shoots.forEach(function (f) {
      if (f.acc !== acc) return;
      (f.videos || []).forEach(function (v) { var p = prog(videoSteps(v)); if (!p.n || p.d < p.n) n++; });
    });
    return n;
  }
  function pendingScripts(acc) {
    var taken = {};
    shoots.forEach(function (f) { if (f.from) taken[f.from] = 1; (f.videos || []).forEach(function (v) { if (v.from) taken[v.from] = 1; }); });
    return state.scripts.filter(function (sc) { return sc.acc === acc && !taken[sc.id]; });
  }
  function bar(p) {
    return '<span class="sf-bar" aria-hidden="true"><i style="width:' + p.p + '%"></i></span>';
  }

  function renderShoots(acc) {
    var html = '<p class="sec-intro">' + esc(SECTIONS.filter(function (s) { return s.id === 'shoots'; })[0].intro) + '</p>';
    html += '<button type="button" class="primary sf-new" data-sf="newscript">+ Скинуть сценарий</button>';

    var pend = pendingScripts(acc);
    if (pend.length) {
      html += '<h3 class="sf-h">Ждут разбора</h3>';
      pend.forEach(function (sc) {
        var open = state.sfOpen[sc.id];
        html += '<article class="sf-pend' + (open ? ' open' : '') + '" data-sc="' + esc(sc.id) + '">' +
          '<button type="button" class="sf-vhead" data-sf="tog" data-id="' + esc(sc.id) + '"><span class="title">' + esc(sc.title) + '</span>' +
          '<span class="meta"><span class="tag">' + KIND_NAME[sc.kind] + '</span><span class="tag sec">не разобран</span></span></button>' +
          '<div class="sf-in"><div class="text">' + esc(sc.text) + '</div>' +
          '<p class="hint">Нажми «Скопировать для Claude», вставь в чат. Он разложит сценарий на шаги, и ролик появится ниже в папке.</p>' +
          '<div class="actions"><button type="button" class="act-copy" data-sf="copyscript" data-id="' + esc(sc.id) + '">Скопировать для Claude</button>' +
          '<button type="button" data-sf="delscript" data-id="' + esc(sc.id) + '">Удалить</button></div></div></article>';
      });
    }

    var folders = shoots.filter(function (f) { return f.acc === acc; });
    if (!folders.length && !pend.length) {
      html += '<p class="empty">Папок съёмок пока нет. Скинь первый сценарий кнопкой выше или скажи Claude в чате, что снимаешь, и он соберёт папку сам.</p>';
    }
    folders.forEach(function (f) {
      var fp = prog(folderSteps(f));
      var fo = state.sfOpen[f.id];
      html += '<section class="sf-folder' + (fo ? ' open' : '') + '">' +
        '<button type="button" class="sf-fhead" data-sf="tog" data-id="' + esc(f.id) + '" aria-expanded="' + !!fo + '">' +
        '<span class="sf-fold" aria-hidden="true"></span>' +
        '<span class="sf-ftxt"><span class="title">' + esc(f.title) + '</span>' +
        '<span class="sf-sub">' + (f.videos || []).length + ' ' + plural((f.videos || []).length, 'ролик', 'ролика', 'роликов') + ' · ' + fp.d + ' из ' + fp.n + ' шагов</span>' +
        bar(fp) + '</span></button>';
      if (fo) {
        html += '<div class="sf-in">' + (f.note ? '<div class="text sf-note">' + esc(f.note) + '</div>' : '');
        (f.videos || []).forEach(function (v) {
          var vp = prog(videoSteps(v));
          var vo = state.sfOpen[v.id];
          var done = vp.n && vp.d === vp.n;
          html += '<article class="sf-video' + (vo ? ' open' : '') + (done ? ' is-done' : '') + '">' +
            '<button type="button" class="sf-vhead" data-sf="tog" data-id="' + esc(v.id) + '" aria-expanded="' + !!vo + '">' +
            '<span class="title">' + (done ? '✓ ' : '') + esc(v.title) + '</span>' +
            '<span class="meta"><span class="tag">' + (KIND_NAME[v.kind] || 'Ролик') + '</span><span class="tag sec">' + vp.d + '/' + vp.n + '</span></span>' + bar(vp) + '</button>';
          if (vo) {
            html += '<div class="sf-in">';
            (v.phases || []).forEach(function (ph) {
              var pp = prog(ph.steps || []);
              html += '<div class="sf-phase"><h4>' + esc(ph.name) + ' <span>' + pp.d + '/' + pp.n + '</span></h4>';
              (ph.steps || []).forEach(function (st) {
                var on = !!state.steps[st.id];
                html += '<button type="button" class="sf-step' + (on ? ' on' : '') + '" data-sf="step" data-id="' + esc(st.id) + '" aria-pressed="' + on + '">' +
                  '<span class="box"><span>✓</span></span><span class="st"><b>' + esc(st.t) + '</b>' + (st.d ? '<small>' + esc(st.d) + '</small>' : '') + '</span></button>';
              });
              html += '</div>';
            });
            if (v.script) {
              html += '<details class="sf-script"><summary>Сценарий</summary><div class="text">' + esc(v.script) + '</div>' +
                '<div class="actions"><button type="button" class="act-copy" data-sf="copytext" data-id="' + esc(v.id) + '">Скопировать сценарий</button></div></details>';
            }
            html += '</div>';
          }
          html += '</article>';
        });
        html += '</div>';
      }
      html += '</section>';
    });
    return html;
  }
  function plural(n, a, b, c) {
    var m = n % 100, k = n % 10;
    return (m > 10 && m < 20) ? c : k === 1 ? a : (k > 1 && k < 5) ? b : c;
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
      var todo = s.id === 'shoots' ? openVideosLeft(state.acc) : pool(state.acc, s.id, 'todo').length;
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
    document.querySelector('.seg').style.visibility = (state.sec === 'shoots' && !(state.q || '').trim()) ? 'hidden' : '';
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
    if (sec === 'shoots' && !q) { list.innerHTML = renderShoots(state.acc); return; }
    var rows = q
      ? all().filter(function (it) { return it.acc === state.acc && statusOf(it) === state.view && (it.title + ' ' + (it.text || '')).toLowerCase().indexOf(q) > -1; })
      : pool(state.acc, sec, state.view);

    if (state.view === 'todo' && !q) {
      rows.sort(function (a, b) { return ((b.mine ? 2 : 0) + (isNew(b) ? 1 : 0)) - ((a.mine ? 2 : 0) + (isNew(a) ? 1 : 0)); });
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
        (it.mine ? '<button type="button" data-act="edit">Изменить</button>' : '') +
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
    if (act === 'copy') {
      if (it.sec === 'captions') copyText(it.full || it.text || it.title, 'Описание скопировано');
      else copyText(it.title + (it.text ? '\n\n' + it.text : ''));
      return;
    }
    if (act === 'edit') { openAdd(it); }
  });


  function scriptMessage(sc) {
    return 'Разбери сценарий в раздел «Съёмка» студии (' + ACC_NAME[sc.acc] + ', ролик: ' + (sc.kind === 'long' ? 'большой' : 'маленький') + ').\n' +
      'id сценария: ' + sc.id + '\nНазвание: ' + sc.title + '\n\n' + sc.text;
  }
  function findVideo(id) {
    for (var i = 0; i < shoots.length; i++) for (var j = 0; j < (shoots[i].videos || []).length; j++) if (shoots[i].videos[j].id === id) return shoots[i].videos[j];
  }
  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sf]');
    if (!b) return;
    var act = b.dataset.sf, id = b.dataset.id;
    if (act === 'tog') { state.sfOpen[id] = !state.sfOpen[id]; save(); renderList(); return; }
    if (act === 'step') {
      if (state.steps[id]) delete state.steps[id]; else state.steps[id] = Date.now();
      save(); var y = window.scrollY; render(); window.scrollTo(0, y); return;
    }
    if (act === 'newscript') { openScript(); return; }
    var sc = state.scripts.filter(function (x) { return x.id === id; })[0];
    if (act === 'copyscript' && sc) { copyText(scriptMessage(sc), 'Скопировано. Вставь в чат с Claude'); return; }
    if (act === 'delscript' && sc) {
      var idx = state.scripts.indexOf(sc);
      state.scripts.splice(idx, 1); save(); render();
      toast('Удалено', function () { state.scripts.splice(idx, 0, sc); save(); render(); });
      return;
    }
    if (act === 'copytext') { var v = findVideo(id); if (v) copyText(v.script); }
  });

  $('scriptSave').addEventListener('click', function () {
    var text = $('scriptText').value.replace(/\s+$/, '');
    if (!text.trim()) { $('scriptText').focus(); return; }
    var title = $('scriptTitle').value.trim() || text.trim().split('\n')[0].slice(0, 60);
    state.scripts.unshift({
      id: 'scr-' + Date.now(), acc: state.acc, kind: $('scriptKind').value, title: title, text: text.trim(),
      added: new Date().toISOString().slice(0, 10)
    });
    state.sec = 'shoots'; state.q = ''; $('search').value = '';
    save(); closeSheets(); render(); toast('Сценарий сохранён. Теперь скопируй его для Claude');
  });
  function openScript() {
    $('scriptTitle').value = ''; $('scriptText').value = ''; $('scriptKind').value = 'short';
    $('scriptAccHint').textContent = 'Аккаунт: ' + ACC_NAME[state.acc] + '. Сценарий хранится в этом браузере, пока Claude не разберёт его на шаги.';
    openSheet('scriptSheet');
    setTimeout(function () { $('scriptText').focus(); }, 50);
  }

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
  function closeSheets() { $('sheetBg').hidden = true; $('addSheet').hidden = true; $('setSheet').hidden = true; $('scriptSheet').hidden = true; }
  $('sheetBg').addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheets); });

  var editing = null;
  function syncAddForm() {
    var cap = $('addSec').value === 'captions';
    $('addLabelRow').hidden = !cap;
    $('addText').placeholder = cap ? 'Вставь подпись целиком — с переносами и эмодзи' : 'Хук или мысль, которая пришла';
    $('addText').rows = cap ? 10 : 4;
  }
  function openAdd(it) {
    editing = it || null;
    var sel = $('addSec');
    sel.innerHTML = ADDABLE.map(function (s) { return '<option value="' + s + '">' + esc(secName(s)) + '</option>'; }).join('');
    sel.value = it ? it.sec : (ADDABLE.indexOf(state.sec) > -1 ? state.sec : 'reels');
    $('addTitle').textContent = it ? 'Изменить' : 'Своя идея или описание';
    $('addAccHint').textContent = 'Аккаунт: ' + ACC_NAME[it ? it.acc : state.acc] + '. Хранится в этом браузере — раз в неделю отправляй отчёт Claude (⋯), чтобы ничего не потерять.';
    $('addLabel').value = it && it.sec === 'captions' && it.label ? it.label : '';
    $('addText').value = it ? (it.full || (it.title + (it.text ? '\n' + it.text : ''))) : '';
    syncAddForm();
    openSheet('addSheet');
    setTimeout(function () { (it || sel.value !== 'captions' ? $('addText') : $('addLabel')).focus(); }, 50);
  }
  $('addSec').addEventListener('change', syncAddForm);
  $('addBtn').addEventListener('click', function () { if (state.sec === 'shoots') openScript(); else openAdd(null); });
  $('addSave').addEventListener('click', function () {
    var text = $('addText').value.replace(/\s+$/, '');
    if (!text.trim()) { $('addText').focus(); return; }
    var sec = $('addSec').value, label = $('addLabel').value.trim();
    var first = text.trim().split('\n')[0];
    var fields = sec === 'captions'
      ? { title: label || (first.length > 70 ? first.slice(0, 70) + '…' : first), text: text, full: text, label: label }
      : { title: first, text: text.trim().split('\n').slice(1).join('\n').trim(), full: '', label: '' };
    if (editing) {
      Object.assign(editing, fields, { sec: sec });
      toast('Сохранено');
    } else {
      state.mine.unshift(Object.assign({
        id: 'mine-' + Date.now(), acc: state.acc, sec: sec, tag: '',
        added: new Date().toISOString().slice(0, 10), mine: true
      }, fields));
      toast(sec === 'captions' ? 'Описание сохранено' : 'Идея сохранена');
    }
    state.sec = sec === 'captions' ? 'captions' : 'mine'; state.view = 'todo';
    editing = null;
    save(); closeSheets(); render();
  });

  $('settingsBtn').addEventListener('click', function () {
    $('dataInfo').textContent = 'Список от Claude обновлён: ' + (dataUpdated || '—') + ' · пунктов: ' + items.length;
    $('importCode').value = '';
    openSheet('setSheet');
  });

  function exportState() {
    return { done: state.done, removed: state.removed, seen: state.seen, mine: state.mine, steps: state.steps, scripts: state.scripts };
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
        lines.push('Мои идеи и описания (' + m.length + '):');
        m.forEach(function (it) {
          if (it.sec === 'captions') lines.push('+ [Описания] ' + (it.label || 'без названия') + ':\n' + (it.full || it.text) + '\n---');
          else lines.push('+ [' + secName(it.sec) + '] ' + it.title + (it.text ? ' — ' + it.text.replace(/\n/g, ' ') : ''));
        });
      }
    });
    var sf = [];
    ['rod', 'zhi'].forEach(function (a) {
      var fl = shoots.filter(function (f) { return f.acc === a; });
      var pd = pendingScripts(a);
      if (!fl.length && !pd.length) return;
      sf.push('', '== Съёмка · ' + ACC_NAME[a] + ' ==');
      fl.forEach(function (f) {
        (f.videos || []).forEach(function (v) {
          var all_ = videoSteps(v), p = prog(all_);
          sf.push('▸ [' + v.id + '] ' + v.title + ' — ' + p.d + '/' + p.n + (p.n && p.d === p.n ? ' (готов)' : ''));
          all_.filter(function (st) { return state.steps[st.id]; }).forEach(function (st) { sf.push('  ✓ [' + st.id + '] ' + st.t); });
        });
      });
      pd.forEach(function (sc) { sf.push('+ [Сценарий ' + sc.id + ', ' + (sc.kind === 'long' ? 'большой' : 'маленький') + '] ' + sc.title + ':\n' + sc.text + '\n---'); });
    });
    if (sf.length) lines = lines.concat(sf);
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
      state.done = s.done || {}; state.removed = s.removed || {}; state.seen = s.seen || state.seen; state.mine = s.mine || []; state.steps = s.steps || {}; state.scripts = s.scripts || [];
      save(); closeSheets(); render(); toast('Отметки загружены');
    } catch (e) { toast('Код не подошёл. Скопируй его целиком ещё раз'); }
  });

  // ---------- boot ----------
  fetch('data.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      items = d.items || [];
      shoots = d.shoots || [];
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
