/* Bowerbird Signature Builder — dependency-free i18n layer.
   Locale files (assets/locales/*.js) are classic scripts that register one
   dictionary each: window.SIG_LOCALES['en'] = { 'key': 'text', ... }.
   t(key, params) substitutes {name} tokens; unknown keys fall back to the
   key itself, so nothing ever renders empty. */
'use strict';

(function () {
  const LOCALES = (window.SIG_LOCALES = window.SIG_LOCALES || {});
  const DEFAULT_LANG = 'en';
  const STORAGE_KEY = 'sigstudio.lang';

  let dict = {};
  let lang = DEFAULT_LANG;

  /* Stored user override wins; otherwise auto-detect from navigator.language
     (de/es/fr prefix), else English. */
  function detectLang() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (stored && LOCALES[stored]) return stored;
    const nav = String(navigator.language || '').toLowerCase();
    for (const l of ['de', 'es', 'fr']) if (nav.startsWith(l)) return l;
    return DEFAULT_LANG;
  }

  function t(key, params) {
    let s = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : String(key);
    if (typeof s !== 'string') s = String(key);
    if (params && typeof params === 'object') {
      s = s.replace(/\{(\w+)\}/g, (m, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m);
    }
    return s;
  }

  /* Walk the DOM and re-apply every translation:
     [data-i18n] → textContent, [data-i18n-html] → innerHTML (rich modal
     copy that keeps <b> markup), [data-i18n-title] → title,
     [data-i18n-aria] → aria-label. Then hand off to the app hook so the
     dynamic renderers (wizard, lists, checklist, toasts) refresh too. */
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      if (el.tagName === 'META') el.setAttribute('content', t(el.dataset.i18n));
      else el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', t(el.dataset.i18nTitle));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    const sel = document.getElementById('lang-select');
    if (sel && sel.value !== lang) sel.value = lang;
    if (typeof window.onLangChange === 'function') window.onLangChange();
  }

  function setLang(id, persist) {
    const d = LOCALES[id];
    if (!d) return;
    dict = d;
    lang = id;
    document.documentElement.lang = id;
    if (persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* ignore */ }
    }
    applyI18n();
  }

  function getLang() { return lang; }

  window.t = t;
  window.setLang = setLang;
  window.applyI18n = applyI18n;
  window.sigI18n = { t, setLang, getLang, applyI18n };

  /* Boot: apply the detected language before app.js renders anything. */
  const initial = detectLang();
  dict = LOCALES[initial] || LOCALES[DEFAULT_LANG] || {};
  lang = LOCALES[initial] ? initial : DEFAULT_LANG;
  document.documentElement.lang = lang;
  applyI18n();

  const sel = document.getElementById('lang-select');
  if (sel) sel.addEventListener('change', () => setLang(sel.value));
})();
