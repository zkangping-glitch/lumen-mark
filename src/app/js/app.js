/* Lumen Mark — renderer/editor front-end.
   Talks to the C# host through the WebView2 postMessage bridge. */
(function () {
  'use strict';

  var host = (window.chrome && window.chrome.webview) ? window.chrome.webview : null;

  function post(msg) {
    if (host) { try { host.postMessage(msg); } catch (e) { /* ignore */ } }
  }

  // ------------------------------------------------------------------ state

  var state = {
    path: '',
    name: '',
    dir: '',
    savedText: '',
    dirty: false,
    hasFile: false,
    mode: 'split',
    theme: 'auto',
    sidebar: true,
    swapped: false,
    splitRatio: 0.46,
    tab: 'toc',
    recents: [],
    renderTimer: null,
    loadingFile: false,
    syncing: false
  };

  var cm = null;
  var md = null;

  var els = {};

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els.docName = $('docName');
    els.dirtyDot = $('dirtyDot');
    els.editorPane = $('editorPane');
    els.previewPane = $('previewPane');
    els.previewScroll = $('previewScroll');
    els.preview = $('preview');
    els.sidebar = $('sidebar');
    els.sideBody = $('sideBody');
    els.tocList = $('tocList');
    els.recentList = $('recentList');
    els.welcome = $('welcome');
    els.welcomeRecentList = $('welcomeRecentList');
    els.welcomeRecents = $('welcomeRecents');
    els.toast = $('toast');
    els.statWords = $('statWords');
    els.statTime = $('statTime');
    els.statPath = $('statPath');
    els.modeSeg = $('modeSeg');
    els.btnTheme = $('btnTheme');
    els.btnSidebar = $('btnSidebar');
    els.splitter = $('splitter');
    els.btnSwap = $('btnSwap');
  }

  // ------------------------------------------------------------------ setup

  function initMarkdown() {
    var factory = window.markdownit || window.markdownIt;
    md = factory({
      html: false,
      linkify: true,
      typographer: false,
      breaks: false,
      highlight: function (str, lang) {
        if (lang && window.hljs && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
          } catch (e) { /* fall through */ }
        }
        return md.utils.escapeHtml(str);
      }
    });

    // checkboxes for task lists
    md.core.ruler.after('inline', 'lumen-task-lists', function (s) {
      var tokens = s.tokens;
      for (var i = 2; i < tokens.length; i++) {
        var tok = tokens[i];
        if (tok.type !== 'inline') continue;
        var paraOpen = tokens[i - 1];
        var itemOpen = tokens[i - 2];
        if (!paraOpen || paraOpen.type !== 'paragraph_open') continue;
        if (!itemOpen || itemOpen.type !== 'list_item_open') continue;
        var children = tok.children;
        if (!children || !children.length) continue;
        var first = children[0];
        if (first.type !== 'text') continue;
        var m = /^\[([ xX])\]\s+/.exec(first.content);
        if (!m) continue;
        first.content = first.content.slice(m[0].length);
        var box = new s.Token('html_inline', '', 0);
        box.content = '<input type="checkbox" disabled' + (m[1] !== ' ' ? ' checked' : '') + '> ';
        children.unshift(box);
        itemOpen.attrSet('class', 'task');
      }
    });

    // relative images are served by the host from the markdown file's folder
    md.renderer.rules.image = function (tokens, idx, options, env, self) {
      var token = tokens[idx];
      var src = token.attrGet('src') || '';
      if (src && !/^(https?:|data:|file:|#|\/\/)/i.test(src)) {
        token.attrSet('src', 'https://mdimg.local/r/' + encodeURIComponent(src));
      }
      token.attrSet('loading', 'lazy');
      return self.renderToken(tokens, idx, options, env, self);
    };
  }

  function initEditor() {
    cm = CodeMirror.fromTextArea($('editor'), {
      mode: 'markdown',
      theme: 'default',
      lineWrapping: true,
      lineNumbers: false,
      styleActiveLine: true,
      indentUnit: 2,
      tabSize: 4,
      viewportMargin: 30,
      extraKeys: {
        Tab: function (editor) {
          if (editor.somethingSelected()) { editor.execCommand('indentMore'); }
          else { editor.replaceSelection('  ', 'end'); }
        },
        'Shift-Tab': function (editor) { editor.execCommand('indentLess'); },
        'Ctrl-B': function (editor) { wrapSelection('**', '**', '粗体'); },
        'Ctrl-I': function (editor) { wrapSelection('*', '*', '斜体'); },
        'Ctrl-K': function (editor) { wrapLink(); },
        'Ctrl-`': function (editor) { wrapSelection('`', '`', 'code'); },
        'Shift-Ctrl-`': function (editor) { wrapSelection('\n```\n', '\n```\n', 'code'); }
      }
    });
    cm.setOption('extraKeys', Object.assign({}, cm.getOption('extraKeys')));
    cm.on('change', onEditorChange);
    cm.getWrapperElement().addEventListener('dragover', function (e) { e.preventDefault(); });
    applyScrollSync();
  }

  function wrapSelection(before, after, placeholder) {
    var sel = cm.getSelection();
    if (!sel) {
      var pos = cm.getCursor();
      cm.replaceSelection(before + placeholder + after);
      cm.setCursor({ line: pos.line, ch: pos.ch + before.length });
      cm.setSelection({ line: pos.line, ch: pos.ch + before.length },
                      { line: pos.line, ch: pos.ch + before.length + placeholder.length });
      cm.focus();
    } else {
      cm.replaceSelection(before + sel + after);
      cm.focus();
    }
  }

  function wrapLink() {
    var sel = cm.getSelection();
    var text = sel || '链接文字';
    var pos = cm.getCursor();
    cm.replaceSelection('[' + text + '](https://)');
    if (!sel) {
      cm.setSelection({ line: pos.line, ch: pos.ch + text.length + 3 },
                      { line: pos.line, ch: pos.ch + text.length + 11 });
    }
    cm.focus();
  }

  function applyScrollSync() {
    cm.on('scroll', function () {
      if (state.mode !== 'split' || state.syncing) return;
      var scroller = cm.getScrollerElement();
      var edMax = scroller.scrollHeight - scroller.clientHeight;
      var pvMax = els.previewScroll.scrollHeight - els.previewScroll.clientHeight;
      if (edMax <= 0 || pvMax <= 0) return;
      state.syncing = true;
      els.previewScroll.scrollTop = (scroller.scrollTop / edMax) * pvMax;
      setTimeout(function () { state.syncing = false; }, 30);
    });
  }

  // ------------------------------------------------------------------ theme

  function prefersDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }

  function effectiveTheme() {
    if (state.theme === 'auto') return prefersDark() ? 'dark' : 'light';
    return state.theme;
  }

  function applyTheme() {
    var eff = effectiveTheme();
    document.body.classList.toggle('theme-dark', eff === 'dark');
    document.body.classList.toggle('theme-light', eff !== 'dark');

    var icon = $('iconTheme');
    if (icon) {
      if (state.theme === 'auto') {
        icon.innerHTML = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.4 19.6L6 18M18 6l1.6-1.6"/>';
      } else if (state.theme === 'light') {
        icon.innerHTML = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.4 19.6L6 18M18 6l1.6-1.6"/>';
      } else {
        icon.innerHTML = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>';
      }
    }
    els.btnTheme.title = '主题：' + ({ auto: '跟随系统', light: '浅色', dark: '深色' })[state.theme] + ' (Ctrl+Shift+T)';
    try { localStorage.setItem('lm.theme', state.theme); } catch (e) { /* ignore */ }
    post({ cmd: 'setTheme', dark: eff === 'dark' });
  }

  function cycleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : (state.theme === 'dark' ? 'auto' : 'light');
    applyTheme();
  }

  // ------------------------------------------------------------------ modes

  function applyMode(mode, persist) {
    state.mode = mode;
    document.body.classList.remove('reader', 'split', 'source');
    document.body.classList.add(mode);
    Array.prototype.forEach.call(els.modeSeg.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    if (persist !== false) { try { localStorage.setItem('lm.mode', mode); } catch (e) { /* ignore */ } }
    if (cm) {
      if (mode !== 'reader') { setTimeout(function () { cm.refresh(); }, 0); }
      if (mode !== 'source') { renderPreview(true); }
    }
  }

  function setSidebar(visible, persist) {
    state.sidebar = visible;
    els.sidebar.classList.toggle('hidden', !visible);
    els.btnSidebar.classList.toggle('active', visible);
    if (persist !== false) { try { localStorage.setItem('lm.sidebar', visible ? '1' : '0'); } catch (e) { /* ignore */ } }
  }

  // ------------------------------------------------------- split direction

  var MIN_PANE_PX = 240;

  function applySplit(ratio, persist) {
    state.splitRatio = Math.min(0.84, Math.max(0.16, ratio));
    if (els.editorPane) {
      els.editorPane.style.flexGrow = String(Math.round(state.splitRatio * 1000));
      els.previewPane.style.flexGrow = String(Math.round((1 - state.splitRatio) * 1000));
    }
    if (persist) { try { localStorage.setItem('lm.splitRatio', String(state.splitRatio)); } catch (e) { /* ignore */ } }
  }

  function setSwapped(swapped, persist) {
    state.swapped = !!swapped;
    document.body.classList.toggle('swapped', state.swapped);
    if (els.btnSwap) els.btnSwap.classList.toggle('active', state.swapped);
    if (persist !== false) { try { localStorage.setItem('lm.swapped', state.swapped ? '1' : '0'); } catch (e) { /* ignore */ } }
  }

  function toggleSwap() {
    setSwapped(!state.swapped, true);
    if (state.mode !== 'split') applyMode('split');
  }

  function initSplitter() {
    var dragging = false;
    var pointerId = null;

    function onMove(e) {
      if (!dragging) return;
      var ed = els.editorPane.getBoundingClientRect();
      var pv = els.previewPane.getBoundingClientRect();
      var left = Math.min(ed.left, pv.left);
      var right = Math.max(ed.right, pv.right);
      var total = right - left;
      if (total <= 0) return;
      var editorPx = state.swapped ? (right - e.clientX) : (e.clientX - left);
      editorPx = Math.max(MIN_PANE_PX, Math.min(total - MIN_PANE_PX, editorPx));
      applySplit(editorPx / total, false);
    }

    function stop(e) {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('dragging');
      try { els.splitter.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      applySplit(state.splitRatio, true);
      if (e) e.preventDefault();
    }

    els.splitter.addEventListener('pointerdown', function (e) {
      if (state.mode !== 'split') return;
      dragging = true;
      pointerId = e.pointerId;
      document.body.classList.add('dragging');
      try { els.splitter.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    els.splitter.addEventListener('pointermove', onMove);
    els.splitter.addEventListener('pointerup', stop);
    els.splitter.addEventListener('pointercancel', stop);
    els.splitter.addEventListener('dblclick', function () { applySplit(0.46, true); });
  }

  function setTab(tab) {
    state.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('.side-tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    els.tocList.style.display = tab === 'toc' ? '' : 'none';
    els.recentList.style.display = tab === 'recent' ? '' : 'none';
  }

  // ----------------------------------------------------------------- render

  function onEditorChange() {
    if (state.loadingFile) return;
    scheduleRender();
    updateDirty();
  }

  function scheduleRender() {
    if (state.renderTimer) clearTimeout(state.renderTimer);
    if (state.mode === 'source') { updateStats(); return; }
    state.renderTimer = setTimeout(function () { renderPreview(false); }, 110);
  }

  function renderPreview(force) {
    if (state.mode === 'source') return;
    var text = cm ? cm.getValue() : '';
    var html = md.render(text, { dir: state.dir });
    els.preview.innerHTML = html;
    decoratePreview();
    buildToc();
    updateTocActive();
    updateStats();
  }

  function slugify(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u3400-\u4dbf\u4e00-\u9fff-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function decoratePreview() {
    var headings = els.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    var used = {};
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      var base = slugify(h.textContent) || ('h-' + i);
      var id = base;
      var n = 2;
      while (used[id]) { id = base + '-' + n; n++; }
      used[id] = true;
      h.id = id;
      h.setAttribute('data-idx', String(i));
    }
    // relative images coming from raw HTML blocks
    var imgs = els.preview.querySelectorAll('img');
    for (var k = 0; k < imgs.length; k++) {
      var src = imgs[k].getAttribute('src') || '';
      if (src && !/^(https?:|data:|file:|#|\/\/)/i.test(src)) {
        imgs[k].setAttribute('src', 'https://mdimg.local/r/' + encodeURIComponent(src));
      }
    }
    // external links open in the default browser
    var links = els.preview.querySelectorAll('a[href]');
    for (var j = 0; j < links.length; j++) {
      links[j].setAttribute('rel', 'noreferrer');
    }
  }

  function buildToc() {
    var headings = els.preview.querySelectorAll('h1, h2, h3, h4');
    var items = [];
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      var level = parseInt(h.tagName.substring(1), 10);
      items.push({ id: h.id, idx: h.getAttribute('data-idx'), level: level, text: (h.textContent || '').trim() });
    }

    if (!items.length) {
      els.tocList.innerHTML = '<div class="toc-empty">当前文档没有标题。<br>用 # 号可以创建大纲标题。</div>';
      return;
    }
    var html = '';
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var indent = 12 + (it.level - 1) * 14;
      html += '<div class="toc-item" data-target="' + escapeAttr(it.id) + '" data-idx="' + escapeAttr(it.idx) + '" style="padding-left:' + indent + 'px" title="' +
        escapeAttr(it.text) + '">' + escapeHtml(it.text) + '</div>';
    }
    els.tocList.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateStats() {
    var text = cm ? cm.getValue() : '';
    var cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    var latin = (text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
      .match(/[A-Za-z0-9_][A-Za-z0-9_'\-\.]*/g) || []).length;
    var total = cjk + latin;
    if (!state.hasFile) {
      els.statWords.textContent = '—';
      els.statTime.textContent = '';
      els.statPath.textContent = '';
      return;
    }
    els.statWords.textContent = formatNumber(total) + ' 字';
    var minutes = Math.max(1, Math.round(cjk / 380 + latin / 220));
    els.statTime.textContent = '约 ' + minutes + ' 分钟';
    els.statPath.textContent = state.path || '';
    els.statPath.title = state.path || '';
  }

  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function updateDirty() {
    var text = cm ? cm.getValue() : '';
    var dirty = state.hasFile && text !== state.savedText;
    if (dirty === state.dirty) return;
    state.dirty = dirty;
    els.dirtyDot.classList.toggle('on', dirty);
    post({ cmd: 'setDirty', dirty: dirty, title: state.name, path: state.path });
  }

  // --------------------------------------------------------------- documents

  function onFile(data) {
    state.loadingFile = true;
    state.path = data.path || '';
    state.name = data.name || '';
    state.dir = data.dir || '';
    state.hasFile = true;
    state.savedText = data.content || '';
    if (cm) {
      cm.setValue(data.content || '');
      cm.clearHistory();
      cm.scrollTo(0, 0);
    }
    state.loadingFile = false;
    state.dirty = false;
    els.dirtyDot.classList.remove('on');
    els.docName.textContent = state.name;
    els.docName.classList.add('has-file');
    els.welcome.classList.add('hidden');
    els.previewScroll.scrollTop = 0;
    document.body.classList.remove('no-file');
    if (state.mode === 'reader') { renderPreview(true); }
    else { scheduleRender(); }
    updateStats();
    if (cm && state.mode !== 'reader') { setTimeout(function () { cm.focus(); cm.refresh(); }, 30); }
  }

  function clearWelcome() {
    els.welcome.classList.add('hidden');
  }

  function openDialog() { post({ cmd: 'openDialog' }); }

  function save(saveAs) {
    if (!state.hasFile) { openDialog(); return; }
    var text = cm ? cm.getValue() : '';
    post({ cmd: saveAs ? 'saveAs' : 'save', content: text });
  }

  function onSaved(data) {
    state.path = data.path || state.path;
    state.name = data.name || state.name;
    state.dir = data.dir || state.dir;
    state.savedText = data.content;
    els.docName.textContent = state.name;
    els.docName.classList.add('has-file');
    updateStats();
    updateDirty();
    post({ cmd: 'setDirty', dirty: state.dirty, title: state.name, path: state.path });
    toast('已保存 ' + state.name);
  }

  function openRecent(path) { post({ cmd: 'openPath', path: path }); }

  // ------------------------------------------------------------------ recents

  function onRecents(items) {
    state.recents = items || [];
    renderRecents();
  }

  function renderRecents() {
    var items = state.recents || [];
    if (!items.length) {
      els.recentList.innerHTML = '<div class="recent-empty">还没有打开过文件。</div>';
      els.welcomeRecents.style.display = 'none';
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var dir = it.path ? it.path.replace(/[\\\/][^\\\/]+$/, '') : '';
      html += '<button class="recent-item" data-path="' + escapeAttr(it.path) + '">' +
        '<span class="r-name' + (it.exists === false ? ' missing' : '') + '">' + escapeHtml(it.name) + '</span>' +
        '<span class="r-dir">' + escapeHtml(dir) + '</span>' +
        '</button>';
    }
    els.recentList.innerHTML = html;
    els.welcomeRecentList.innerHTML = html;
    els.welcomeRecents.style.display = '';
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // -------------------------------------------------------------------- toast

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2200);
  }

  // ------------------------------------------------------------------- scroll

  function scrollToHeading(id, idx) {
    if (state.mode === 'source' && idx !== null && idx !== undefined && idx !== '') {
      var target = parseInt(idx, 10);
      var lines = (cm ? cm.getValue() : '').split('\n');
      var seen = 0;
      for (var i = 0; i < lines.length; i++) {
        if (/^\s{0,3}#{1,6}\s+/.test(lines[i])) {
          if (seen === target) {
            cm.setCursor({ line: i, ch: 0 });
            cm.scrollIntoView({ line: i, ch: 0 }, 80);
            cm.focus();
            return;
          }
          seen++;
        }
      }
      return;
    }
    var el = document.getElementById(id);
    if (!el) return;
    var base = els.previewScroll.getBoundingClientRect().top;
    var offset = el.getBoundingClientRect().top - base + els.previewScroll.scrollTop;
    els.previewScroll.scrollTo({ top: offset - 12, behavior: 'smooth' });
  }

  function updateTocActive() {
    if (state.mode === 'source') return;
    var items = els.tocList.querySelectorAll('.toc-item');
    if (!items.length) return;
    var base = els.previewScroll.getBoundingClientRect().top;
    var top = 90;
    var current = null;
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-target');
      var el = document.getElementById(id);
      if (!el) continue;
      var offset = el.getBoundingClientRect().top - base;
      if (offset <= top) current = items[i];
    }
    for (var j = 0; j < items.length; j++) items[j].classList.remove('active');
    if (current) current.classList.add('active');
  }

  // ------------------------------------------------------------------- events

  function bindEvents() {
    $('btnOpen').addEventListener('click', openDialog);
    $('btnSave').addEventListener('click', function () { save(false); });
    els.btnSidebar.addEventListener('click', function () { setSidebar(!state.sidebar); });
    els.btnTheme.addEventListener('click', cycleTheme);
    els.btnSwap.addEventListener('click', toggleSwap);
    $('welcomeOpen').addEventListener('click', openDialog);
    initSplitter();

    Array.prototype.forEach.call(els.modeSeg.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { applyMode(b.getAttribute('data-mode')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.side-tab'), function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });

    els.tocList.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.toc-item') : null;
      if (item) scrollToHeading(item.getAttribute('data-target'), item.getAttribute('data-idx'));
    });
    els.recentList.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.recent-item') : null;
      if (item) openRecent(item.getAttribute('data-path'));
    });
    els.welcomeRecentList.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.recent-item') : null;
      if (item) openRecent(item.getAttribute('data-path'));
    });

    els.preview.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href) return;
      if (href.charAt(0) === '#') {
        e.preventDefault();
        var anchor = href.substring(1);
        try { anchor = decodeURIComponent(anchor); } catch (err) { /* ignore */ }
        var el = document.getElementById(anchor);
        if (el) {
          var base = els.previewScroll.getBoundingClientRect().top;
          var offset = el.getBoundingClientRect().top - base + els.previewScroll.scrollTop;
          els.previewScroll.scrollTo({ top: offset - 12, behavior: 'smooth' });
        }
        return;
      }
      if (/^(https?:|mailto:)/i.test(href)) {
        e.preventDefault();
        post({ cmd: 'openExternal', url: href });
      } else if (!/^[a-z]+:/i.test(href)) {
        e.preventDefault();
        post({ cmd: 'openRelative', href: href });
      }
    });

    els.previewScroll.addEventListener('scroll', function () {
      updateTocActive();
      if (state.mode !== 'split' || state.syncing) return;
      var scroller = cm ? cm.getScrollerElement() : null;
      if (!scroller) return;
      var pvMax = els.previewScroll.scrollHeight - els.previewScroll.clientHeight;
      var edMax = scroller.scrollHeight - scroller.clientHeight;
      if (pvMax <= 0 || edMax <= 0) return;
      state.syncing = true;
      scroller.scrollTop = (els.previewScroll.scrollTop / pvMax) * edMax;
      setTimeout(function () { state.syncing = false; }, 30);
    });

    document.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openDialog(); return; }
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); return; }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); return; }
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); cycleMode(); return; }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setSidebar(!state.sidebar); return; }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); cycleTheme(); }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); toggleSwap(); }
    });

    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (state.theme === 'auto') applyTheme();
      });
    } catch (e) { /* ignore */ }
  }

  function cycleMode() {
    var order = ['reader', 'split', 'source'];
    var idx = order.indexOf(state.mode);
    applyMode(order[(idx + 1) % order.length]);
  }

  // --------------------------------------------------------------- host bridge

  function onHostMessage(e) {
    var data = e.data;
    if (!data || typeof data !== 'object') return;
    switch (data.event) {
      case 'init':
        if (data.mode === 'reader' || data.mode === 'split' || data.mode === 'source') applyMode(data.mode);
        if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'auto') {
          state.theme = data.theme;
          applyTheme();
        }
        if (typeof data.sidebar === 'boolean') setSidebar(data.sidebar);
        if (data.recents) onRecents(data.recents);
        if (data.eval) {
          setTimeout(function () {
            try { (0, eval)(data.eval); }
            catch (err) { toast('eval: ' + err.message); }
          }, 80);
        }
        break;
      case 'file':
        onFile(data);
        break;
      case 'saved':
        onSaved(data);
        break;
      case 'recents':
        onRecents(data.items);
        break;
      case 'error':
        toast(data.message || '出错了');
        break;
    }
  }

  // -------------------------------------------------------------------- boot

  function boot() {
    cacheEls();
    initMarkdown();
    initEditor();
    bindEvents();

    try {
      var t = localStorage.getItem('lm.theme');
      if (t === 'light' || t === 'dark' || t === 'auto') state.theme = t;
    } catch (e) { /* ignore */ }
    state.theme = state.theme || 'auto';

    try {
      var m = localStorage.getItem('lm.mode');
      if (m === 'reader' || m === 'split' || m === 'source') state.mode = m;
    } catch (e) { /* ignore */ }

    try {
      var sb = localStorage.getItem('lm.sidebar');
      if (sb === '0') state.sidebar = false;
    } catch (e) { /* ignore */ }

    try {
      var sw = localStorage.getItem('lm.swapped');
      if (sw === '1') state.swapped = true;
      var sr = parseFloat(localStorage.getItem('lm.splitRatio'));
      if (!isNaN(sr) && sr >= 0.16 && sr <= 0.84) state.splitRatio = sr;
    } catch (e) { /* ignore */ }

    applyTheme();
    applyMode(state.mode);
    setSidebar(state.sidebar);
    setSwapped(state.swapped, false);
    applySplit(state.splitRatio, false);
    setTab('toc');
    els.docName.textContent = '未打开文件';
    document.body.classList.add('no-file');

    // debug / automation hook (also handy for power users)
    window.__lm = {
      state: state,
      get editor() { return cm; },
      setMode: function (m) { applyMode(m); },
      setTheme: function (t) { state.theme = t; applyTheme(); },
      setTab: setTab,
      setSidebar: setSidebar,
      setSwapped: setSwapped,
      toggleSwap: toggleSwap,
      applySplit: applySplit,
      open: function (p) { post({ cmd: 'openPath', path: p }); },
      save: function () { save(false); },
      saveAs: function () { save(true); },
      render: function () { renderPreview(true); },
      debug: function (m) { post({ cmd: 'debug', message: String(m) }); },
      toast: toast
    };

    // if this page is opened in a normal browser (no host), show a hint
    if (!host) {
      toast('未连接到 Lumen Mark 宿主程序');
    } else {
      host.addEventListener('message', onHostMessage);
      post({ cmd: 'ready' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
