(function(w){
  'use strict';
  
  const { __, _x, _n, sprintf } = wp.i18n || { __:s=>s, _x:(s)=>s, _n:(s)=>s, sprintf:(...a)=>a.join(' ') };

  const SETTINGS = (typeof w.USO_SETTINGS !== 'undefined') ? w.USO_SETTINGS : {};
  const OPT = (SETTINGS.options || {});
  const ASSETS = (SETTINGS.assets || {});
  const PRICES = OPT.prices || {};
  const MATERIALS = OPT.materials || {};
  const CLINIC = OPT.clinic || {};
  const TEST_MODE = !!OPT.test_mode;

  // ✅ ИСПРАВЛЕНИЕ #9: Защита от XSS
  function escapeHTML(s){
    const div = document.createElement('div');
    div.textContent = String(s || '');
    return div.innerHTML;
  }

  function escapeAttr(s){
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sanitizeURL(url){
    try {
      const u = new URL(url, window.location.origin);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:') {
        return u.toString();
      }
    } catch(e) {
      console.warn('[USO] Invalid URL:', url);
    }
    return '';
  }

  // ✅ ИСПРАВЛЕНИЕ #19: Обработка ошибок при форматировании денег
  function money(n){
    try {
      const num = Number(n) || 0;
      if (!isFinite(num)) return '0';
      return num.toLocaleString('ru-RU', { 
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    } catch(e) {
      console.warn('[USO] Money format error:', e);
      return String(Math.round(Number(n) || 0));
    }
  }

  function T(key, fallback){ 
    const t = OPT.texts && OPT.texts[key]; 
    return (t && String(t).length) ? t : (fallback || ''); 
  }

  function price(k, def){ 
    return (typeof PRICES[k] !== 'undefined') ? Number(PRICES[k]) : (def||0); 
  }

  function throttle(fn, wait){
    let t, last;
    return function(){
      const now = Date.now();
      const ctx = this, args = arguments;
      if (!last || (now - last) >= wait){
        last = now; 
        fn.apply(ctx, args);
      } else {
        clearTimeout(t);
        t = setTimeout(function(){ 
          last = Date.now(); 
          fn.apply(ctx, args); 
        }, wait - (now - last));
      }
    };
  }

  function cssEscape(s){
    s = String(s || '');
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(s);
    }
    return s.replace(/[\0-\x1F\x7F"\\#.:;$^*+?{}\[\]()|/]/g, '\\$$');
  }

  w.USO = w.USO || {};
  w.USO.__ = __;
  w.USO._x = _x;
  w.USO._n = _n;
  w.USO.sprintf = sprintf;

  w.USO.SETTINGS = SETTINGS;
  w.USO.OPT = OPT;
  w.USO.PRICES = PRICES;
  w.USO.MATERIALS = MATERIALS;
  w.USO.CLINIC = CLINIC;
  w.USO.ASSETS = ASSETS;
  w.USO.TEST_MODE = TEST_MODE;

  w.USO.util = { 
    money, 
    T, 
    price, 
    throttle, 
    cssEscape,
    escapeHTML,      // ✅ Новое
    escapeAttr,      // ✅ Новое
    sanitizeURL      // ✅ Новое
  };
})(window);