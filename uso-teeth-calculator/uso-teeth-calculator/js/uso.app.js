(function(w, $){
  'use strict';

  const U      = w.USO || {};
  const MATS   = U.MATERIALS || {};
  const CANVAS = w.USO_CANVAS;
  const CALC   = w.USO_CALC;
  const EXP    = w.USO_EXPORT;

  // ✅ Используем debug-систему из uso.canvas.js
  const DEBUG  = U.DEBUG_CANVAS || {
    log: function() {},
    warn: function(...args) { console.warn(...args); },
    error: function(...args) { console.error(...args); }
  };

  const AUTOSAVE_KEY = 'uso_autosave';
  const AUTOSAVE_INTERVAL = 30000;

  let variants = [];
  let activeVar = 0;
  let previewOverride = '';
  let autosaveTimer = null;
  let isExporting = false;

  function escapeHTML(s){
    const div = document.createElement('div');
    div.textContent = String(s || '');
    return div.innerHTML;
  }

  let recomputeDebounced = null;

  // ✅ Инициализация режимов работы
  function initWorkModes() {
    const modeSelect = document.getElementById('uso-work-mode');
    if (!modeSelect) {
      console.warn('[USO] Work mode selector not found');
      return;
    }

    DEBUG.log('[USO] Initializing work modes...');

    modeSelect.addEventListener('change', function() {
      const mode = this.value;
      DEBUG.log('[USO] Work mode changed to:', mode);
      
      if (CANVAS && CANVAS.setWorkMode) {
        CANVAS.setWorkMode(mode);
      }
      
      const navEl = document.getElementById('uso-images-nav');
      if (navEl) navEl.innerHTML = '';
      
      const fileEl = document.getElementById('uso-file');
      if (fileEl) fileEl.value = '';
      
      updateModeUI();
      recompute();
    });

    if (CANVAS && CANVAS.setWorkMode) {
      CANVAS.setWorkMode(CANVAS.MODES.PANORAMIC);
      DEBUG.log('[USO] Initial mode set to PANORAMIC');
    }
  }

  // ✅ Обновить UI для режима
  function updateModeUI() {
    const modeInfo = document.getElementById('uso-mode-info');
    if (!modeInfo) return;
    
    const mode = CANVAS && CANVAS.getWorkMode ? CANVAS.getWorkMode() : 'panoramic';
    
    if (mode === 'simple' || (CANVAS && mode === CANVAS.MODES.SIMPLE)) {
      modeInfo.innerHTML = `
        <div style="background: #f3e5f5; padding: 12px; border-radius: 4px; font-size: 13px; color: #6a1b9a;">
          <strong>📷 Режим простых фото (верхняя/нижняя челюсть)</strong><br>
          <span style="font-size: 12px;">
            👆 1-й снимок (верхняя): полная разметка<br>
            👇 2-й снимок (нижняя): полная разметка<br>
            📝 Остальные: только рисование
          </span>
        </div>
      `;
    } else {
      modeInfo.innerHTML = `
        <div style="background: #e3f2fd; padding: 12px; border-radius: 4px; font-size: 13px; color: #1565c0;">
          <strong>📸 Режим панорамных снимков</strong><br>
          <span style="font-size: 12px;">
            ✅ 1-й снимок: полная разметка (метки + рисование)<br>
            📝 Остальные: только рисование (без меток)
          </span>
        </div>
      `;
    }
  }

  // ✅ Инициализация системы мультиснимков
  function initMultiImageSystem() {
    const fileInput = document.getElementById('uso-file');
    if (!fileInput) {
      console.warn('[USO] File input not found');
      return;
    }

    DEBUG.log('[USO] Initializing multi-image system...');

    fileInput.addEventListener('change', async function(e) {
      try {
        const file = e.target.files?.[0];
        if (!file) return;

        DEBUG.log('[USO] File selected:', file.name, 'size:', file.size);

        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        const isValidType = validTypes.includes(file.type) || 
                            /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name||'');
        
        if (!isValidType) {
          alert('Поддерживаются только JPEG, PNG, WebP, HEIC');
          e.target.value = '';
          return;
        }

        if (file.size > 40 * 1024 * 1024) {
          alert('Файл слишком большой (>40 МБ)');
          e.target.value = '';
          return;
        }

        let processedFile = file;
        const isHeic = /hei[cf]/i.test(file.type) || /\.heic$/i.test(file.name||'');
        
        if (isHeic) {
          try {
            DEBUG.log('[USO] Converting HEIC...');
            const h2a = await ensureHeic2Any();
            if (h2a) {
              processedFile = await h2a({ blob:file, toType:'image/jpeg', quality:0.98 });
              DEBUG.log('[USO] HEIC converted successfully');
            }
          } catch(err) {
            console.warn('[USO] HEIC convert failed:', err);
            alert('Не удалось конвертировать HEIC');
            e.target.value = '';
            return;
          }
        }

        let orientation = 1;
        try {
          orientation = (await exifr.orientation(processedFile)) || 1;
          DEBUG.log('[USO] EXIF orientation:', orientation);
        } catch(err) {
          console.warn('[USO] EXIF read failed:', err);
        }

        const blobUrl = URL.createObjectURL(processedFile);
        DEBUG.log('[USO] Created blob URL');
        
        const imgEl = await loadImageElement(blobUrl);
        DEBUG.log('[USO] Image loaded, dimensions:', imgEl.naturalWidth, 'x', imgEl.naturalHeight);
        
        const dataUrl = drawWithOrientationExact(imgEl, orientation);
        DEBUG.log('[USO] Created data URL, size:', Math.round(dataUrl.length / 1024), 'KB');
        
        URL.revokeObjectURL(blobUrl);

        const mode = CANVAS && CANVAS.getWorkMode ? CANVAS.getWorkMode() : 'panoramic';
        let description = 'Снимок';
        let jaw = null;

        if (mode === 'simple' || (CANVAS && mode === CANVAS.MODES.SIMPLE)) {
          const imageCount = CANVAS && CANVAS.getAllImages ? CANVAS.getAllImages().length : 0;
          if (imageCount === 0) {
            description = '👆 Верхняя челюсть';
            jaw = 'upper';
            DEBUG.log('[USO] SIMPLE mode: adding upper jaw image');
          } else if (imageCount === 1) {
            description = '👇 Нижняя челюсть';
            jaw = 'lower';
            DEBUG.log('[USO] SIMPLE mode: adding lower jaw image');
          } else {
            description = `📎 Доп. снимок ${imageCount - 1}`;
            DEBUG.log('[USO] SIMPLE mode: adding additional image', imageCount - 1);
          }
        } else {
          const imageCount = CANVAS && CANVAS.getAllImages ? CANVAS.getAllImages().length : 0;
          description = `Панорамный снимок ${imageCount + 1}`;
          DEBUG.log('[USO] PANORAMIC mode: adding image', imageCount + 1);
        }

        if (CANVAS && CANVAS.addImage) {
          CANVAS.addImage(dataUrl, description, jaw);
          DEBUG.log('[USO] Image added to CANVAS:', description);
        } else {
          console.error('[USO] CANVAS.addImage not available');
          e.target.value = '';
          return;
        }

        const allImages = CANVAS && CANVAS.getAllImages ? CANVAS.getAllImages() : [];
        DEBUG.log('[USO] Total images now:', allImages.length);
        
        if (allImages.length === 1) {
          if (CANVAS && CANVAS.switchImage) {
            CANVAS.switchImage(0);
            DEBUG.log('[USO] Switched to first image');
          }
        }

        if (CANVAS && CANVAS.updateImageNavigation) {
          CANVAS.updateImageNavigation();
          DEBUG.log('[USO] Image navigation updated');
        }
        
        recompute();
        DEBUG.log('[USO] Recompute triggered');

        e.target.value = '';
      } catch(err) {
        console.error('[USO] Image load error:', err);
        alert('Ошибка при загрузке фото:\n\n' + err.message);
        e.target.value = '';
      }
    });
  }

  async function ensureHeic2Any(){
    if (w.heic2any) return w.heic2any;
    const a = U.ASSETS || {};
    const src = a.vendor_heic2any || 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    await loadScript(src); 
    return w.heic2any;
  }
  
  function loadScript(src){
    return new Promise(function(resolve, reject){
      const s = document.createElement('script'); 
      s.src=src; 
      s.async=true; 
      s.onload=resolve; 
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  function drawWithOrientationExact(img, orientation){
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (orientation===3){ c.width=iw; c.height=ih; ctx.translate(iw, ih); ctx.rotate(Math.PI); }
    else if (orientation===6){ c.width=ih; c.height=iw; ctx.translate(ih, 0); ctx.rotate(Math.PI/2); }
    else if (orientation===8){ c.width=ih; c.height=iw; ctx.translate(0, iw); ctx.rotate(-Math.PI/2); }
    else { c.width=iw; c.height=ih; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, iw, ih, 0, 0, c.width, c.height);
    return c.toDataURL('image/png', 0.98);
  }

  function loadImageElement(url){
    return new Promise(function(resolve, reject){
      const img = new Image();
      img.onload = function(){ resolve(img); };
      img.onerror = function(){ reject(new Error('image load error')); };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  function injectDynamicStyles(){
    if ($('#uso-dynamic-styles').length) return;
    
    const matsMC = (U.MATERIALS && U.MATERIALS.mc) || [];
    const matsZR = (U.MATERIALS && U.MATERIALS.zr) || [];
    const matsPros = (U.MATERIALS && U.MATERIALS.prosthesis) || [];
    
    const mcCount = matsMC.length || 1;
    const zrCount = matsZR.length || 1;
    const prosCount = matsPros.length || 1;
    
    const mcCols = Math.min(mcCount, 3);
    const zrCols = Math.min(zrCount, 3);
    const prosCols = Math.min(prosCount, 4);
    
    const css = `
      <style id="uso-dynamic-styles">
        .uso-materials-grid.mc-grid { 
          display: grid;
          grid-template-columns: repeat(${mcCols}, 1fr); 
          gap: 8px;
        }
        .uso-materials-grid.zr-grid { 
          display: grid;
          grid-template-columns: repeat(${zrCols}, 1fr); 
          gap: 8px;
        }
        #uso-prosthesis-matrix { 
          display: grid; 
          grid-template-columns: repeat(${prosCols}, 1fr); 
          gap: 8px; 
        }
        @media (max-width: 768px) {
          .uso-materials-grid.mc-grid,
          .uso-materials-grid.zr-grid { 
            grid-template-columns: 1fr; 
          }
          #uso-prosthesis-matrix { 
            grid-template-columns: repeat(2, 1fr); 
          }
        }
        @media (max-width: 480px) {
          #uso-prosthesis-matrix { 
            grid-template-columns: 1fr; 
          }
        }
      </style>
    `;
    
    $('head').append(css);
  }

  async function init(){
    DEBUG.log('[USO] Initializing application...');
    
    if (!CANVAS) { 
      console.error('[USO] CANVAS not loaded'); 
      return; 
    }

    try {
      const modeSelect = document.getElementById('uso-work-mode');
      if (modeSelect) {
        DEBUG.log('[USO] Work mode selector found');
        initWorkModes();
        updateModeUI();
      } else {
        console.warn('[USO] Work mode selector not found, using default PANORAMIC');
        if (CANVAS && CANVAS.setWorkMode) {
          CANVAS.setWorkMode(CANVAS.MODES.PANORAMIC);
        }
      }
    } catch(err) {
      console.error('[USO] Failed to initialize work modes:', err);
    }
    
    try {
      initMultiImageSystem();
      DEBUG.log('[USO] Multi-image system initialized');
    } catch(err) {
      console.error('[USO] Failed to initialize multi-image system:', err);
    }

    injectDynamicStyles();

    CANVAS.initCanvas(function(){
      if (!variants.length) return;
      recompute();
      updateExportEnabled();
    });

    setupFullscreenPaletteRelocation();

    $('#uso-add-variant').on('click', addVariant);
    
    tryRestoreAutosave();
    
    addVariant();

    if (!U.OPT || !U.OPT.pdf_template_html || String(U.OPT.pdf_template_html).trim().length === 0){
      try {
        if (typeof fetch === 'function' && U.ASSETS && U.ASSETS.pdf_template_url) {
          const r = await fetch(U.ASSETS.pdf_template_url, { credentials:'same-origin' });
          if (r.ok) U.OPT.pdf_template_html = await r.text();
        }
      } catch(_){}
    }

    renderImplantOptions();
    renderProsthesisMatrix();

    recomputeDebounced = U.util.throttle(recompute, 300);

    $(document).on('change', 'input.uso-mat', function(){
      try {
        const key = this.getAttribute('data-key');
        if (!key) return;
        const v = currentVariant();
        if (!v) return;
        v.selectedMats[key] = this.checked;
        recomputeDebounced();
      } catch(err) {
        console.error('[USO] Material change error:', err);
      }
    });

    $(document).on('change', 'input[name="uso-impl-brand"]', function(){
      try {
        const v = currentVariant();
        if (!v) return;
        v.selections.implBrand = this.value;
        recomputeDebounced();
      } catch(err) {
        console.error('[USO] Impl brand change error:', err);
      }
    });

    $(document).on('change', 'input[name="uso-impl-crown-mat"]', function(){
      try {
        const v = currentVariant();
        if (!v) return;
        const keys = $('input[name="uso-impl-crown-mat"]:checked').map(function(){ return this.value; }).get();
        v.selections.implCrown = keys;
        recomputeDebounced();
      } catch(err) {
        console.error('[USO] Impl crown change error:', err);
      }
    });

    $(document).on('change', 'input[name="uso-impl-bridge"]', function(){
      try {
        const v = currentVariant();
        if (!v) return;
        v.selections.implBridge = this.value;
        recomputeDebounced();
      } catch(err) {
        console.error('[USO] Impl bridge change error:', err);
      }
    });

    $(document).on('change', '.pmx-chk', function(){
      try {
        const side  = this.getAttribute('data-side');
        const color = this.getAttribute('data-color');
        const key   = this.getAttribute('data-key');
        if (!side || !color || !key) return;
        
        const v = currentVariant();
        if (!v) return;
        
        v.selections.prosthesisMulti = v.selections.prosthesisMulti || { top:{}, bottom:{} };
        const bucket = v.selections.prosthesisMulti[side];
        const arr = Array.isArray(bucket[color]) ? bucket[color] : [];
        const idx = arr.indexOf(key);
        
        if (this.checked && idx < 0) arr.push(key);
        if (!this.checked && idx >= 0) arr.splice(idx, 1);
        
        bucket[color] = arr;
        recomputeDebounced();
      } catch(err) {
        console.error('[USO] Prosthesis change error:', err);
      }
    });

    $('#uso-note-therapy').on('input', function(){ 
      const v = currentVariant();
      if (v) v.notes.therapy = this.value; 
    });
    
    $('#uso-note-crowns').on('input', function(){ 
      const v = currentVariant();
      if (v) v.notes.crowns = this.value; 
    });
    
    $('#uso-note-implants').on('input', function(){ 
      const v = currentVariant();
      if (v) v.notes.impl = this.value; 
    });

    $('#uso-export-json').on('click', exportMarkupJSON);
    $('#uso-import-json').on('change', importMarkupJSON);

    $('#uso-png').on('click', function(){
      if (isExporting) return;
      if (!CANVAS.hasImage()){ alert('Сначала загрузите снимок'); return; }
      const url = CANVAS.canvasImage();
      const name = buildFileNameBase()+'.png';
      const a = document.createElement('a');
      a.href = url; 
      a.download = name; 
      document.body.appendChild(a); 
      a.click(); 
      document.body.removeChild(a);
    });

    $('#uso-pdf').on('click', function(){
      safeExport(exportPDFLocal, '#uso-pdf');
    });

    $('#uso-txt').on('click', function(){
      safeExport(exportTXTLocal, '#uso-txt');
    });

    $('#uso-wa').on('click', function(){
      safeExport(sendWA, '#uso-wa');
    });

    $('#uso-tg').on('click', function(){
      safeExport(sendTG, '#uso-tg');
    });

    $('#uso-clear-all').on('click', function(){
      if (!CANVAS.hasImage()){ alert('Сначала загрузите снимок'); return; }
      if (!confirm('Удалить все метки на текущем варианте?')) return;
      CANVAS.resetMarkers();
      recompute();
    });

    $('#uso-crop-start').on('click', function(){
      if (!CANVAS.hasImage()){ alert('Сначала загрузите снимок'); return; }
      CANVAS.startCrop($('#uso-crop-ratio').val() || 'free');
      $('#uso-crop-apply, #uso-crop-cancel').prop('disabled', false);
    });

    $('#uso-crop-apply').on('click', async function(){
      try {
        await CANVAS.applyCrop();
        $('#uso-crop-apply, #uso-crop-cancel').prop('disabled', true);
        recompute();
      } catch(err) {
        console.error('[USO] Crop error:', err);
        alert('Ошибка при кадрировании:\n\n' + err.message);
      }
    });

    $('#uso-crop-cancel').on('click', function(){
      CANVAS.cancelCrop();
      $('#uso-crop-apply, #uso-crop-cancel').prop('disabled', true);
    });

    $('#uso-crop-ratio').on('change', function(){ 
      CANVAS.setCropRatio(this.value || 'free'); 
    });

    $('#uso-preview-refresh').on('click', async function(){
      try {
        const html = await buildAllVariantSectionsTextOnlyHTML();
        $('#uso-preview').html(html);
        previewOverride = '';
      } catch(err) {
        console.error('[USO] Preview refresh error:', err);
        alert('Ошибка при создании предпросмотра:\n\n' + err.message);
      }
    });

    $('#uso-preview-use').on('click', function(){
      previewOverride = $('#uso-preview').html() || '';
      alert('Предварительный отчёт будет использован при экспорте PDF/TXT.');
    });

    $('#uso-compare-variants').on('click', showCompareModal);

    bindTestPanel();

    $('#uso-patient-phone').on('input paste', function(e){
      const self = this;
      setTimeout(() => {
        let val = self.value;
        
        val = val.replace(/[^\d+]/g, '');
        
        if (val.startsWith('8')) {
          val = '+7' + val.substring(1);
        }
        
        if (val.startsWith('7') && !val.startsWith('+7')) {
          val = '+' + val;
        }
        
        if (val.startsWith('+7')) {
          const digits = val.substring(2).replace(/\D/g, '');
          let formatted = '+7';
          if (digits.length > 0) {
            formatted += ' (' + digits.substring(0, 3);
            if (digits.length > 3) {
              formatted += ') ' + digits.substring(3, 6);
              if (digits.length > 6) {
                formatted += '-' + digits.substring(6, 8);
                if (digits.length > 8) {
                  formatted += '-' + digits.substring(8, 10);
                }
              }
            } else {
              formatted += ')';
            }
          }
          val = formatted;
        }
        
        self.value = val;
      }, 10);
    });

    $('#uso-patient-phone').val('+7 ');

    $(document).on('input change', '#uso-patient-name, #uso-patient-phone', updateExportEnabled);
    updateExportEnabled();

    startAutosave();
    
    DEBUG.log('[USO] Application initialized successfully');
  }

  function setupFullscreenPaletteRelocation(){
    const container = document.getElementById('uso-canvas-container');
    const panel = document.getElementById('uso-palette-panel');
    if (!container || !panel) return;
    const originalParent = panel.parentNode;
    let nextSibling = panel.nextSibling;
    function restorePanel(){
      if (panel.parentNode === originalParent) return;
      try { 
        if (nextSibling && nextSibling.parentNode === originalParent) {
          originalParent.insertBefore(panel, nextSibling);
        } else {
          originalParent.appendChild(panel);
        }
      } catch(_){ 
        originalParent.appendChild(panel); 
      }
    }
    function movePanelIntoContainer(){ 
      if (panel.parentNode !== container) container.appendChild(panel); 
    }
    function isRealFsOnContainer(){
      const fe = document.fullscreenElement || document.webkitFullscreenElement || null;
      return fe && fe === container;
    }
    function onFsChange(){ 
      if (isRealFsOnContainer()) movePanelIntoContainer(); 
      else restorePanel(); 
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('uso:fsToggle', function(ev){
      const on = !!(ev && ev.detail && ev.detail.isFs);
      if (on) movePanelIntoContainer(); 
      else restorePanel();
    });
  }

  function startAutosave(){
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(function(){
      if (!variants.length) return;
      saveVariantState();
      
      const state = {
        variants: variants.map(v => ({
          title: v.title,
          notes: v.notes,
          selections: v.selections,
          selectedMats: v.selectedMats
        })),
        activeVar,
        timestamp: Date.now(),
        patientName: $('#uso-patient-name').val() || '',
        patientPhone: $('#uso-patient-phone').val() || ''
      };
      
      try {
        const json = JSON.stringify(state);
        
        if (json.length > 1024 * 1024) {
          console.warn('[USO] Autosave data too large (' + Math.round(json.length/1024) + ' KB), skipping');
          return;
        }
        
        localStorage.setItem(AUTOSAVE_KEY, json);
      } catch(e){ 
        console.warn('[USO] Autosave failed:', e);
        if (e.name === 'QuotaExceededError') {
          try { 
            localStorage.removeItem(AUTOSAVE_KEY);
            console.warn('[USO] Autosave quota exceeded, cleared');
          } catch(_){}
        }
      }
    }, AUTOSAVE_INTERVAL);
  }

  function tryRestoreAutosave(){
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) return;
      
      let state;
      try {
        state = JSON.parse(saved);
      } catch(parseErr) {
        console.warn('[USO] Failed to parse autosave:', parseErr);
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      
      if (!state || typeof state !== 'object') {
        console.warn('[USO] Invalid autosave state');
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      
      if (!state.timestamp || typeof state.timestamp !== 'number') {
        console.warn('[USO] Invalid autosave timestamp');
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      
      const age = Date.now() - state.timestamp;
      
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      
      if (!confirm('Найдено несохранённое состояние (' + Math.round(age / 60000) + ' мин назад). Восстановить?')) {
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      
      if (!Array.isArray(state.variants) || state.variants.length === 0) {
        console.warn('[USO] Invalid autosave state: no variants');
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      
      for (let v of state.variants) {
        if (!v || typeof v !== 'object' || !v.title) {
          console.warn('[USO] Invalid variant in autosave');
          localStorage.removeItem(AUTOSAVE_KEY);
          return;
        }
        
        if (!v.notes) v.notes = { therapy: '', crowns: '', impl: '' };
        if (!v.selections) v.selections = defaultSelections();
        if (!v.selectedMats) v.selectedMats = defaultSelectedMats();
        if (!v.data) v.data = { v: 2, items: [], meta: {} };
      }
      
      variants = state.variants;
      activeVar = Math.max(0, Math.min(state.activeVar || 0, variants.length - 1));
      
      if (state.patientName && typeof state.patientName === 'string') {
        $('#uso-patient-name').val(state.patientName);
      }
      if (state.patientPhone && typeof state.patientPhone === 'string') {
        $('#uso-patient-phone').val(state.patientPhone);
      }
      
      $('#uso-variants-bar').empty();
      variants.forEach((v, i) => addVariantTabUI(i, v.title));
      
      switchVariant(activeVar);
      updateCompareButton();
      localStorage.removeItem(AUTOSAVE_KEY);
      
    } catch(e){ 
      console.error('[USO] Restore autosave failed:', e);
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
      } catch(_) {}
    }
  }

  function addVariant(){
    if (!CANVAS) {
      console.warn('[USO] CANVAS not initialized');
      return;
    }

    let idx = variants.length + 1;
    let title = 'Вариант ' + idx;
    
    const existingTitles = new Set(variants.map(v => v.title));
    while (existingTitles.has(title)) {
      idx++;
      title = 'Вариант ' + idx;
    }

    const v = {
      title: title,
      data: { v:2, items:[], meta:{} },
      notes: { therapy:'', crowns:'', impl:'' },
      selections: defaultSelections(),
      selectedMats: defaultSelectedMats()
    };
    variants.push(v);
    addVariantTabUI(variants.length-1, v.title);
    switchVariant(variants.length-1);
    updateCompareButton();
  }
  
  function addVariantTabUI(index, title){
    const $bar = $('#uso-variants-bar');
    const $t = $('<div class="tab" role="tab" aria-selected="'+(index===activeVar?'true':'false')+'" data-vid="'+index+'"></div>').text(title);
    $t.on('click', function(){ switchVariant(Number($(this).attr('data-vid'))); });
    $bar.append($t);
    refreshVariantTabs();
  }
  
  function refreshVariantTabs(){
    $('#uso-variants-bar .tab').removeClass('active').attr('aria-selected','false')
      .filter('[data-vid="'+activeVar+'"]').addClass('active').attr('aria-selected','true');
  }
  
  function switchVariant(idx){
    if (idx<0 || idx>=variants.length) return;
    saveVariantState();
    activeVar = idx;
    refreshVariantTabs();
    const v = variants[idx];

    // ✅ Поддержка нового формата v:3 (images) и старого v:2 (items)
    const hasData = v && v.data && CANVAS && CANVAS.load && (
      (v.data.v === 3 && Array.isArray(v.data.images) && v.data.images.length > 0) ||
      (Array.isArray(v.data.items) && v.data.items.length > 0)
    );

    if (hasData){
      try {
        CANVAS.load(v.data);
      } catch(err) {
        console.error('[USO] Failed to load variant data:', err);
        if (CANVAS && CANVAS.resetMarkers) {
          CANVAS.resetMarkers();
        }
      }
    } else if (CANVAS && CANVAS.resetMarkers) {
      CANVAS.resetMarkers();
    }
    
    if (v && v.notes) {
      $('#uso-note-therapy').val(v.notes.therapy||'');
      $('#uso-note-crowns').val(v.notes.crowns||'');
      $('#uso-note-implants').val(v.notes.impl||'');
    }
    
    if (v && v.selections) {
      applySelectionsToUI(v.selections);
    }
    
    renderMaterialsCardsPlaceholder();
    recompute();
  }
  
  function saveVariantState(){
    if (!variants.length) return;
    const v = currentVariant();
    try { 
      v.data = CANVAS.serialize(); 
    } catch(_){}
    v.notes.therapy = $('#uso-note-therapy').val()||'';
    v.notes.crowns  = $('#uso-note-crowns').val()||'';
    v.notes.impl    = $('#uso-note-implants').val()||'';
  }
  
  function currentVariant(){ 
    return variants[activeVar]; 
  }

  function getActiveVariantIndex(){ 
    return activeVar; 
  }

  function updateCompareButton(){
    const btn = $('#uso-compare-variants');
    if (variants.length >= 2) {
      btn.show();
    } else {
      btn.hide();
    }
  }

  function defaultSelections(){
    const brand      = (MATS.implants||[])[0]?.admin_key || '';
    const crownFirst = (MATS.impl_crowns||[])[0]?.admin_key || '';
    const bridge     = (MATS.impl_bridges||[])[0]?.admin_key || '';
    const p          = splitProsthesis();
    const partKey    = p.part[0]?.admin_key || '';
    const fullKey    = p.full[0]?.admin_key || '';
    return {
      implBrand: brand,
      implCrown: crownFirst ? [crownFirst] : [],
      implBridge: bridge,
      prosthesis: {
        top:    { yellow: partKey, violet: partKey, white: fullKey },
        bottom: { yellow: partKey, violet: partKey, white: fullKey }
      }
    };
  }
  
  function defaultSelectedMats(){
    const obj = {};
    (MATS.mc||[]).forEach(m => { obj[m.admin_key] = !!m.default; });
    (MATS.zr||[]).forEach(m => { obj[m.admin_key] = !!m.default; });
    return obj;
  }

  function renderImplantOptions(){
    const root = document.querySelector('.impl-opts');
    if (!root) return;
    const sel = (currentVariant() || {}).selections || defaultSelections();
    const impl    = MATS.implants     || [];
    const crowns  = MATS.impl_crowns  || [];
    const bridges = MATS.impl_bridges || [];

    let html = '';
    if (impl.length){
      html += '<div class="card"><b>Импланты</b><div>';
      impl.forEach(it => {
        const checked = (sel.implBrand === it.admin_key) ? 'checked' : '';
        html += '<label style="display:block;margin:2px 0;"><input type="radio" name="uso-impl-brand" value="'+escapeHTML(it.admin_key)+'" '+checked+'> '+escapeHTML(it.label||it.admin_key)+'</label>';
      });
      html += '</div></div>';
    }
    if (crowns.length){
      html += '<div class="card"><b>Коронки на импланты</b><div>';
      const chosen = Array.isArray(sel.implCrown) ? sel.implCrown : (sel.implCrown ? [sel.implCrown] : []);
      crowns.forEach(it => {
        const checked = chosen.includes(it.admin_key) ? 'checked' : '';
        html += '<label style="display:block;margin:2px 0;"><input type="checkbox" name="uso-impl-crown-mat" value="'+escapeHTML(it.admin_key)+'" '+checked+'> '+escapeHTML(it.label||it.admin_key)+'</label>';
      });
      html += '</div></div>';
    }
    if (bridges.length){
      html += '<div class="card"><b>Мост между имплантами</b><div>';
      bridges.forEach(it => {
        const checked = (sel.implBridge === it.admin_key) ? 'checked' : '';
        html += '<label style="display:block;margin:2px 0;"><input type="radio" name="uso-impl-bridge" value="'+escapeHTML(it.admin_key)+'" '+checked+'> '+escapeHTML(it.label||it.admin_key)+'</label>';
      });
      html += '</div></div>';
    }
    root.innerHTML = html;
  }

  function renderMaterialsCardsPlaceholder(){ 
    $('#uso-results').html(''); 
  }
  
  function renderMaterialsCards(lc){
    let cards = '<div class="uso-grid4">';
    const list = [].concat(MATS.mc||[], MATS.zr||[]);
    const sel = currentVariant().selectedMats || {};
    list.forEach(item => {
      const key = item.admin_key;
      const val = lc.col[key] || 0;
      const isChecked  = Object.prototype.hasOwnProperty.call(sel, key) ? !!sel[key] : !!item.default;
      const checkedAttr = isChecked ? 'checked' : '';
      cards += '<div class="card mat" data-key="'+escapeHTML(key)+'">' +
                 '<label><input type="checkbox" class="uso-mat" data-key="'+escapeHTML(key)+'" '+checkedAttr+'> '+escapeHTML(item.label)+'</label>' +
                 '<div><b>'+ (Number(val)||0).toLocaleString('ru-RU') +' ₽</b></div>' +
               '</div>';
    });
    cards += '</div>';
    $('#uso-results').html(cards);
  }

  function splitProsthesis(){
    const list = (MATS.prosthesis||[]);
    const part = list.filter(x => {
      const k = (x.admin_key||'').toLowerCase();
      const l = (x.label||'').toLowerCase();
      return k.includes('part') || l.includes('част');
    });
    const full = list.filter(x => {
      const k = (x.admin_key||'').toLowerCase();
      const l = (x.label||'').toLowerCase();
      return k.includes('full') || l.includes('полн');
    });
    const other = list.filter(x => !part.includes(x) && !full.includes(x));
    return { part, full, other };
  }

  function renderProsthesisMatrix(){
    const list   = (MATS.prosthesis || []);
    const groups = splitProsthesis();
    const partKeyDef = groups.part[0]?.admin_key || list[0]?.admin_key || '';
    const fullKeyDef = groups.full[0]?.admin_key || list[0]?.admin_key || '';
    const setFull = new Set(groups.full.map(x => x.admin_key));
    const ACRY_MESH_KEY = list.find(x => /acri.*mesh/i.test(x.admin_key||'') || /арм|сетк/i.test((x.label||'').toLowerCase()))?.admin_key || 'acri_mesh';
    const METAL_PART_KEY = list.find(x => /metal.*part/i.test(x.admin_key||'') || /пластинк|метал/i.test((x.label||'').toLowerCase()))?.admin_key || 'metal_part';

    function table(side){
      const fallbackSel = defaultSelections();
      const v = currentVariant() || { selections: fallbackSel };
      v.selections = v.selections || fallbackSel;
      v.selections.prosthesisMulti = v.selections.prosthesisMulti || { top:{}, bottom:{} };
      const chosen = v.selections.prosthesisMulti[side] || {};

      function allowed(color, key){
        if (color === 'white') return setFull.has(key) || key === ACRY_MESH_KEY;
        if (color === 'violet') {
          return !setFull.has(key) || key === 'acri_full' || key === METAL_PART_KEY;
        }
        return !setFull.has(key);
      }
      function cell(color, key){
        if (!allowed(color, key)) return '<td style="text-align:center;opacity:.35">—</td>';
        const arr = Array.isArray(chosen[color]) ? chosen[color] : [];
        let defaultKey = null;
        if (color === 'yellow' || color === 'violet') defaultKey = partKeyDef;
        if (color === 'white') defaultKey = fullKeyDef;
        const isDefault = (!arr.length && key === defaultKey);
        const checked = (arr.includes(key) || isDefault) ? 'checked' : '';
        const id = `pmx_${side}_${color}_${key}`;
        return `<td style="text-align:center"><input type="checkbox" class="pmx-chk" id="${id}" data-side="${side}" data-color="${color}" data-key="${key}" ${checked}></td>`;
      }

      const head = '<tr><th>Материал</th><th>Жёлтая</th><th>Белая</th><th>Фиолетовая</th></tr>';
      const rows = list.map(item => {
        const key = String(item.admin_key||'');
        const title = escapeHTML(item.label||key);
        return `<tr><td>${title}</td>${cell('yellow', key)}${cell('white', key)}${cell('violet', key)}</tr>`;
      }).join('');

      return `<div style="border:1px solid #e5e5e5;border-radius:6px;padding:8px;margin-top:6px;">
        <b>${side==='top'?'Верх':'Низ'}</b>
        <div style="overflow:auto;margin-top:6px;">
          <table style="border-collapse:collapse;width:100%">
            <thead>${head}</thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="hint">Жёлтая — частичный; Белая — полный (и «армированный сеткой»); Фиолетовая — частичный (по умолчанию), допускается «Акри полный» и «на пластинке из металла». Зелёная учитывается автоматически.</div>
      </div>`;
    }

    const html = `<div style="display:grid;gap:10px;">${table('top')}${table('bottom')}</div>`;
    $('#uso-prost-matrix').html(html);
  }

  function applySelectionsToUI(sel){
    if (!sel) return;
    if (sel.implBrand) $('input[name="uso-impl-brand"]').filter(function(){ return this.value===sel.implBrand; }).prop('checked', true);
    const crownsSel = Array.isArray(sel.implCrown) ? sel.implCrown : (sel.implCrown ? [sel.implCrown] : []);
    $('input[name="uso-impl-crown-mat"]').prop('checked', false);
    crownsSel.forEach(k => $('input[name="uso-impl-crown-mat"]').filter(function(){ return this.value===k; }).prop('checked', true));
    if (sel.implBridge) $('input[name="uso-impl-bridge"]').filter(function(){ return this.value===sel.implBridge; }).prop('checked', true);
    renderProsthesisMatrix();
  }

  function toggleDetailsOpen(el, flag){ 
    if (el) el.open = !!flag; 
  }
  
  function updateAccordions(cnt, lc){
    const dMaterials = document.getElementById('uso-results')?.closest('details');
    toggleDetailsOpen(dMaterials, true);
    const dProst = document.getElementById('uso-prost-details');
    const hasProst = (cnt.yellow_line||0) > 0 || (cnt.white_line||0) > 0 || (cnt.violet_line||0) > 0 || (cnt.green_line||0) > 0;
    toggleDetailsOpen(dProst, hasProst);
    const dImpl = document.querySelector('.impl-opts')?.closest('details');
    const hasImpl = (cnt.violet_exc||0) > 0 || (cnt.violet_dot||0) > 0 || (cnt.violet_x||0) > 0 || (cnt.violet_oval||0) > 0;
    toggleDetailsOpen(dImpl, hasImpl);
    const dPreview = document.getElementById('uso-preview-wrap')?.closest('details');
    const hasCrowns = (lc.units_mc||0) > 0 || (lc.units_zr||0) > 0;
    const hasTherapy = (lc.therapy||0) > 0;
    toggleDetailsOpen(dPreview, hasTherapy || hasCrowns || hasProst || hasImpl);
  }

  function recompute(){
    if (!variants.length) return;
    
    if (!CANVAS || typeof CANVAS.getCountsForCalculation !== 'function' || typeof CANVAS.getJawSplitsForCalculation !== 'function') { 
      console.warn('[USO] CANVAS not ready'); 
      return; 
    }
    
    const v = currentVariant();
    if (!v || !v.selections) return;

    try {
      const cnt = CANVAS.getCountsForCalculation();
      const jaw = CANVAS.getJawSplitsForCalculation();
      
      DEBUG.log('[USO] recompute() - cnt:', cnt, 'jaw:', jaw);
      
      if (!cnt || typeof cnt !== 'object') {
        console.warn('[USO] Invalid counts from CANVAS:', cnt);
        return;
      }
      
      if (!jaw || typeof jaw !== 'object') {
        console.warn('[USO] Invalid jaw splits from CANVAS:', jaw);
        return;
      }
      
      if (!CALC || typeof CALC.compute !== 'function') {
        console.warn('[USO] CALC not ready');
        return;
      }
      
      const lc = CALC.compute(cnt, jaw, v.selections, v.selectedMats);
      if (!lc || typeof lc !== 'object') {
        console.warn('[USO] Invalid calculation result:', lc);
        return;
      }
      
      $('#uso-sum-therapy').text(U.util.money(lc.therapy)+' ₽');
      $('#uso-info-mc').text(lc.units_mc||0);
      $('#uso-info-white').text(cnt.white_dot||0);
      $('#uso-info-zr').text(lc.units_zr||0);
      $('#uso-info-impl').text(U.util.money(lc.implants.implSetSum)+' ₽');
      $('#uso-info-impl-c').text(U.util.money(lc.implants.implCrownsSum)+' ₽');
      $('#uso-info-impl-b').text(U.util.money(lc.implants.implBridgeSum)+' ₽');
      $('#uso-info-impl-a').text(U.util.money(lc.implants.abutmentSum)+' ₽');

      const topColor = (cnt.yellow_line && jaw.yellow.topUnits) ? 'жёлтая' :
                       ((cnt.white_line && jaw.white.topUnits) ? 'белая' :
                       ((cnt.violet_line && jaw.violet.topUnits) ? 'фиолетовая' :
                       ((cnt.green_line && jaw.green.topUnits) ? 'зелёная' : '—')));
      const botColor = (cnt.yellow_line && jaw.yellow.bottomUnits) ? 'жёлтая' :
                       ((cnt.white_line && jaw.white.bottomUnits) ? 'белая' :
                       ((cnt.violet_line && jaw.violet.bottomUnits) ? 'фиолетовая' :
                       ((cnt.green_line && jaw.green.bottomUnits) ? 'зелёная' : '—')));
      $('#uso-info-prot-top').text(topColor);
      $('#uso-info-prot-bot').text(botColor);

      renderMaterialsCards(lc);
      updateAccordions(cnt, lc);
      v._lastCalc = lc;
      updateExportEnabled();
      
    } catch(err) {
      console.error('[USO] Recompute error:', err);
    }
  }

  function maskPhoneLocal(raw){
    const d = String(raw||'').replace(/\D/g,'');
    if (d.length <= 6) return '***' + d;
    return '***' + d.slice(-6);
  }

  function buildVariantSectionTZ(v, lc){
    const money = U.util.money;
    const name  = ($('#uso-patient-name').val()||'').trim();
    const phoneMasked = maskPhoneLocal($('#uso-patient-phone').val()||'');
    const cnt   = lc.cnt || {};
    const rb    = lc.prosthesis && lc.prosthesis.breakdown ? lc.prosthesis.breakdown : {};
    const parts = [];

    parts.push(
      '<p>Здравствуйте, <b>'+escapeHTML(name||'')+'</b>.</p>'+
      '<p>Ортопед внимательно изучил Ваш снимок. Снимок — это зеркальное отображение положения зубов в полости рта, поэтому то, что на снимке слева, фактически находится справа. Учитывайте это при изучении описания.</p>'+
      '<p>Описание является предварительным и не заменяет визуальный и инструментальный осмотр</p>'+
      '<p>Ниже описано, что возможно сделать в вашей ситуации. Приведены расчёты для нескольких типов материалов.</p>'+
      '<p>Если снимок сделан давно, состояние зубов изменилось, либо есть подвижность зубов более 2-й степени (по фото определить нельзя), на месте возможна корректировка плана.</p>'+
      '<p>План лечения не является публичной офертой. Объёмы и стоимость могут измениться незначительно по итогам очного инструментального осмотра.</p>'+
      '<p>Контакты пациента: '+escapeHTML(phoneMasked)+'</p>'
    );

    (function(){
      const priceMap = {
        'red_dot': 't_red_dot', 'red_q': 't_red_q', 'red_oval': 't_red_oval', 'red_exc': 't_red_exc',
        'green_q': 't_green_q', 'green_dot': 't_green_dot', 'green_oval': 't_green_oval', 'green_exc': 't_green_exc',
        'yellow_dot': 't_fill', 'yellow_oval': 't_build', 'black_exc': 't_post'
      };
      
      const order = ['red_dot','red_q','red_oval','red_exc','green_q','green_dot','green_oval','green_exc','yellow_dot','yellow_oval','black_exc'];
      const label = {
        red_dot:'Красная точка', red_q:'Красный вопрос', red_oval:'Красный овал', red_exc:'Красный восклицательный знак',
        green_dot:'Зелёная точка', green_q:'Зелёный вопрос', green_oval:'Зелёный овал', green_exc:'Зелёный восклицательный знак',
        yellow_dot:'Жёлтая точка', yellow_oval:'Жёлтый овал', black_exc:'Чёрный восклицательный знак'
      };
      const items = [];
      order.forEach(mk=>{
        const n = Number(cnt[mk]||0); if (!n) return;
        const title = label[mk] || mk;
        const d = (U.OPT && U.OPT.texts && U.OPT.texts[mk]) ? String(U.OPT.texts[mk]) : '';
        
        const priceKey = priceMap[mk];
        const price = priceKey ? (U.PRICES[priceKey] || 0) : 0;
        const totalPrice = price * n;
        const priceText = totalPrice > 0 ? (' ('+money(totalPrice)+' ₽)') : '';
        
        items.push('<li><b>'+escapeHTML(title)+'</b>' + (d ? ' — '+escapeHTML(d) : '') + priceText + '</li>');
      });
      if (items.length){
        parts.push('<h3>Терапия</h3>');
        parts.push('<ul>'+items.join('')+'</ul>');
        parts.push('<p><b>Итого по терапии: '+money(lc.therapy)+' ₽</b></p>');
      }
    })();

    (function(){
      const lines = [];
      const rng = (min,max)=> (max && max>min) ? ('от '+money(min)+' ₽ до '+money(max)+' ₽') : (min? (money(min)+' ₽') : '');
      if (rb.yellow){
        if (rb.yellow.topUnits && (rb.yellow.topSumMin||0)) lines.push('Частичный (жёлтая, верх): '+rng(rb.yellow.topSumMin, rb.yellow.topSumMax));
        if (rb.yellow.bottomUnits && (rb.yellow.botSumMin||0)) lines.push('Частичный (жёлтая, низ): '+rng(rb.yellow.botSumMin, rb.yellow.botSumMax));
      }
      if (rb.white){
        if (rb.white.topUnits && (rb.white.topSumMin||0)) lines.push('Полный (белая, верх): '+rng(rb.white.topSumMin, rb.white.topSumMax));
        if (rb.white.bottomUnits && (rb.white.botSumMin||0)) lines.push('Полный (белая, низ): '+rng(rb.white.botSumMin, rb.white.botSumMax));
      }
      if (rb.violet){
        if (rb.violet.topUnits && (rb.violet.topSumMin||0)) lines.push('По показаниям (фиолетовая, верх): '+rng(rb.violet.topSumMin, rb.violet.topSumMax));
        if (rb.violet.bottomUnits && (rb.violet.botSumMin||0)) lines.push('По показаниям (фиолетовая, низ): '+rng(rb.violet.botSumMin, rb.violet.botSumMax));
      }
      if (rb.green){
        if (rb.green.topUnits && (rb.green.topSumMin||0)) lines.push('(зелёная, верх): '+rng(rb.green.topSumMin, rb.green.topSumMax));
        if (rb.green.bottomUnits && (rb.green.botSumMin||0)) lines.push('(зелёная, низ): '+rng(rb.green.botSumMin, rb.green.botSumMax));
      }
      const totalMin = Number(lc.prosthesis?.removableMin||0);
      const totalMax = Number(lc.prosthesis?.removableMax||0);
      if (lines.length || totalMin || totalMax){
        parts.push('<h3>Протезы</h3>');
        if (lines.length) parts.push('<ul><li>'+lines.join('</li><li>')+'</li></ul>');
        if (totalMin || totalMax){
          const totalTxt = (totalMax && totalMax>totalMin) ? ('Протезы всего: от '+money(totalMin)+' ₽ до '+money(totalMax)+' ₽')
                                                          : ('Протезы всего: '+money(totalMin||totalMax)+' ₽');
          parts.push('<p><b>'+totalTxt+'</b></p>');
        }
      }
    })();

    const baseUnitsNoWhite   = Number(lc.baseCore||0);
    const baseUnitsWithWhite = lc.incWhite ? (Number(lc.baseCore||0) + Number(cnt.white_dot||0)) : Number(lc.baseCore||0);
    const unitsZr            = Number(lc.units_zr||0);
    const protMin = Number(lc.prosthesis?.removableMin||0);
    const protMax = Number(lc.prosthesis?.removableMax||0);
    const hasWhiteDots = (cnt.white_dot||0) > 0;

    const selectedKeys = Object.keys(v.selectedMats||{}).filter(k => !!v.selectedMats[k]);
    const matsMC = (MATS.mc||[]).filter(m => selectedKeys.includes(m.admin_key));
    const matsZR = (MATS.zr||[]).filter(m => selectedKeys.includes(m.admin_key));

    function oneVariantBlock(title, mcMat, mcUnits, zrMat, zrUnits, isOptimal){
      if (!mcMat && !zrMat) return '';
      let sumCrowns = 0;
      const rows = [];
      if (mcMat && mcUnits>0){
        const s = mcUnits * Number(mcMat.price||0); sumCrowns += s;
        rows.push(mcUnits+' ед. × '+money(mcMat.price)+' ₽ ('+escapeHTML(mcMat.label||mcMat.admin_key)+') = <b>'+money(s)+' ₽</b>');
      }
      if (zrMat && zrUnits>0){
        const s = zrUnits * Number(zrMat.price||0); sumCrowns += s;
        rows.push(zrUnits+' ед. × '+money(zrMat.price)+' ₽ ('+escapeHTML(zrMat.label||zrMat.admin_key)+') = <b>'+money(s)+' ₽</b>');
      }
      let protLine = '';
      let protAdd  = 0;
      if (protMax && protMax>protMin){ protLine = 'от '+money(protMin)+' ₽ до '+money(protMax)+' ₽'; protAdd = protMin; }
      else if (protMin){ protLine = money(protMin)+' ₽'; protAdd = protMin; }
      const total = sumCrowns + protAdd;

      const html = [];
      html.push('<div class="card" style="border:1px solid #ddd;border-radius:6px;padding:8px;margin:6px 0;">');
      html.push('<div style="font-weight:700">'+escapeHTML(title)+'</div>');
      if (rows.length) html.push('<div>'+rows.join('<br>')+'</div>');
      if (protLine) html.push('<div>Съёмные протезы: '+protLine+'</div>');
      html.push('<div>Сумма по варианту: <b>'+money(total)+' ₽</b></div>');
      
      if (isOptimal) {
        html.push('<div style="margin-top:8px;color:#2271b1;font-style:italic;">(Это оптимальный для Вас вариант)</div>');
      }
      
      html.push('</div>');
      return html.join('');
    }
    
    function buildVariantsBlock(caption, mcUnits, blockIndex){
      const cards = [];
      const zrList = matsZR.length ? matsZR : [null];
      const mcList = matsMC.length ? matsMC : [null];
      let idx = 0;
      zrList.forEach((zr)=>{
        mcList.forEach((mc)=>{
          idx++;
          const titleParts = ['Вариант '+idx];
          if (caption && hasWhiteDots) {
            titleParts.push('('+caption+')');
          }
          const title = titleParts.join(' ');
          
          const variantIndex = getActiveVariantIndex();
          const isOptimal = (variantIndex === 0 && blockIndex === 0 && idx === 1);
          cards.push(oneVariantBlock(title, mc, mcUnits, zr, unitsZr, isOptimal));
        });
      });
      return cards.filter(Boolean).join('');
    }

    (function(){
      const mcUnits = baseUnitsNoWhite;
      const content = buildVariantsBlock('без «белой метки»', mcUnits, 0);
      if (content) { 
        const heading = hasWhiteDots 
          ? '<h3>Коронки по ортопедическим показаниям</h3>' 
          : '<h3>Коронки</h3>';
        parts.push(heading); 
        parts.push(content); 
      }
    })();
    (function(){
      if (!hasWhiteDots || !(baseUnitsWithWhite>baseUnitsNoWhite)) return;
      const mcUnits = baseUnitsWithWhite;
      const content = buildVariantsBlock('с учётом «белой метки»', mcUnits, 1);
      if (content) { 
        parts.push('<h3>Коронки с учётом эстетики («белые точки»)</h3>'); 
        parts.push(content); 
      }
    })();

    (function(){
      const ib = lc.implants || {};
      const rows = [];
      if (ib.implSetSum){
        const br = (MATS.implants||[]).find(x=>x.admin_key===ib.implBrand);
        rows.push('Импланты'+(br?(' ('+escapeHTML(br.label)+')'):'')+': <b>'+money(ib.implSetSum)+' ₽</b>');
      }
      if (Array.isArray(ib.implCrownsBreakdown) && ib.implCrownsBreakdown.length){
        ib.implCrownsBreakdown.forEach(row=>{
          const item = (MATS.impl_crowns||[]).find(x=>x.admin_key===row.key);
          const label = item ? item.label : row.key;
          if (row.sum) rows.push('Коронки на импланты ('+escapeHTML(label)+'): '+row.units+' × '+money(row.price)+' ₽ = <b>'+money(row.sum)+' ₽</b>');
        });
      } else if (ib.implCrownsSum){
        rows.push('Коронки на импланты: <b>'+money(ib.implCrownsSum)+' ₽</b>');
      }
      if (ib.implBridgeSum){
        const br = (MATS.impl_bridges||[]).find(x=>x.admin_key===ib.implBridge);
        rows.push('Мост между имплантами'+(br?(' ('+escapeHTML(br.label)+')'):'')+': <b>'+money(ib.implBridgeSum)+' ₽</b>');
      }
      if (ib.abutmentSum){
        const label = (MATS.abutment && MATS.abutment.label) ? MATS.abutment.label : 'Абатмент';
        rows.push(escapeHTML(label)+': <b>'+money(ib.abutmentSum)+' ₽</b>');
      }
      if (rows.length){
        parts.push('<h3>Имплантация</h3>');
        parts.push('<div class="card" style="border:1px solid #ddd;border-radius:6px;padding:8px;margin:6px 0;">'+rows.join('<br>')+'</div>');
      }
    })();

    return parts.join('');
  }

  async function buildAllVariantSectionsTextOnlyHTML(){
    const prev = getActiveVariantIndex();
    const sections = [];
    
    for (let i = 0; i < variants.length; i++){
      try {
        switchVariant(i);
        const v = currentVariant();
        
        if (!v) {
          console.warn(`[USO] Variant ${i} is null`);
          continue;
        }
        
        if (!v._lastCalc || typeof v._lastCalc !== 'object') {
          console.warn(`[USO] Variant ${i} has no calculation data`);
          continue;
        }
        
        const lc = v._lastCalc;
        const part = [];
        
        try {
          part.push(buildVariantSectionTZ(v, lc));
        } catch(buildErr) {
          console.error(`[USO] Failed to build section for variant ${i}:`, buildErr);
          continue;
        }
        
        sections.push('<div class="section">'+part.join('')+'</div>');
      } catch(err) {
        console.error(`[USO] Error processing variant ${i}:`, err);
        continue;
      }
    }
    
    switchVariant(prev);
    
    if (sections.length === 0) {
      return '<div class="section"><p>Нет данных для экспорта. Пожалуйста, добавьте метки на снимок.</p></div>';
    }
    
    return sections.join('<div style="page-break-after:always;"></div>');
  }

  function htmlToPlainText(html){
    const node = document.createElement('div');
    node.innerHTML = html;
    node.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    node.querySelectorAll('li').forEach(li => {
      const t = li.textContent.trim();
      li.replaceWith(document.createTextNode('- ' + t + '\n'));
    });
    const blockTags = new Set(['P','DIV','H1','H2','H3','H4','H5','H6','SECTION','ARTICLE','SUMMARY','DETAILS','FIGURE']);
    function walk(el, acc){
      el.childNodes.forEach(ch=>{
        if (ch.nodeType === 3) {
          const s = ch.nodeValue.replace(/\s+\n/g,'\n').replace(/\n\s+/g,'\n');
          acc.push(s);
        } else if (ch.nodeType === 1) {
          const tag = ch.tagName;
          if (tag !== 'IMG') {
            walk(ch, acc);
            if (blockTags.has(tag)) acc.push('\n');
          }
        }
      });
    }
    const out = []; walk(node, out);
    return out.join('').replace(/\n{3,}/g,'\n\n').trim();
  }
  
  async function safeExport(exportFn, btnSelector) {
    if (isExporting) {
      console.warn('[USO] Export already in progress');
      return;
    }
    
    isExporting = true;
    const $btn = $(btnSelector);
    const originalText = $btn.text();
    
    try {
      $btn.prop('disabled', true).text('Обработка...');
      await exportFn();
    } catch(err) {
      console.error('[USO] Export error:', err);
    } finally {
      isExporting = false;
      $btn.prop('disabled', false).text(originalText);
    }
  }

// ✅ ФУНКЦИЯ ЭКСПОРТА PDF
async function exportPDFLocal(){
  try{
    if (!CANVAS.hasImage()){ 
      alert('Сначала загрузите снимок'); 
      return; 
    }
    
    const patientName = ($('#uso-patient-name').val() || '').trim();
    if (!patientName) {
      alert('Пожалуйста, укажите имя пациента');
      $('#uso-patient-name').focus();
      return;
    }
    
    saveVariantState();
    
    DEBUG.log('[USO_APP] Starting PDF export');
    
    const textHtml = await buildAllVariantSectionsTextOnlyHTML();
    DEBUG.log('[USO_APP] Built text HTML, length:', textHtml.length);
    
    let allImages = [];
    if (CANVAS && CANVAS.getAllImagesForExport && typeof CANVAS.getAllImagesForExport === 'function') {
      try {
        DEBUG.log('[USO_APP] Getting all images for export');
        allImages = await CANVAS.getAllImagesForExport();
        DEBUG.log('[USO_APP] Got', allImages.length, 'images');
      } catch(err) {
        console.warn('[USO_APP] Error getting images:', err);
        allImages = [];
      }
    }
    
    DEBUG.log('[USO_APP] Calling exportPDF with', allImages.length, 'images');
    
    if (EXP && EXP.exportPDF && typeof EXP.exportPDF === 'function') {
      await EXP.exportPDF(textHtml, buildFileNameBase(), currentReportType(), allImages);
    } else {
      console.error('[USO_APP] exportPDF not available');
      alert('Ошибка: функция экспорта PDF не загружена');
      return;
    }
    
  } catch(e){ 
    console.error('[USO] PDF export error:', e);
    console.error('[USO] Error stack:', e.stack);
    alert('Ошибка экспорта PDF: ' + (e.message || 'Неизвестная ошибка')); 
  }
}

// ✅ ФУНКЦИЯ ЭКСПОРТА PNG
async function exportPNGLocal(){
  try{
    if (!CANVAS.hasImage()){ 
      alert('Сначала загрузите снимок'); 
      return; 
    }
    
    const patientName = ($('#uso-patient-name').val() || '').trim();
    if (!patientName) {
      alert('Пожалуйста, укажите имя пациента');
      $('#uso-patient-name').focus();
      return;
    }
    
    saveVariantState();
    
    DEBUG.log('[USO_APP] Starting PNG export');
    
    const textHtml = await buildAllVariantSectionsTextOnlyHTML();
    DEBUG.log('[USO_APP] Built text HTML, length:', textHtml.length);
    
    let allImages = [];
    if (CANVAS && CANVAS.getAllImagesForExport && typeof CANVAS.getAllImagesForExport === 'function') {
      try {
        DEBUG.log('[USO_APP] Getting all images for export');
        allImages = await CANVAS.getAllImagesForExport();
        DEBUG.log('[USO_APP] Got', allImages.length, 'images');
      } catch(err) {
        console.warn('[USO_APP] Error getting images:', err);
        allImages = [];
      }
    }
    
    DEBUG.log('[USO_APP] Calling exportAsFiles with', allImages.length, 'images');
    
    if (EXP && EXP.exportAsFiles && typeof EXP.exportAsFiles === 'function') {
      await EXP.exportAsFiles(textHtml, buildFileNameBase(), allImages);
    } else {
      console.error('[USO_APP] exportAsFiles not available');
      alert('Ошибка: функция экспорта PNG не загружена');
      return;
    }
    
  } catch(e){ 
    console.error('[USO] PNG export error:', e);
    console.error('[USO] Error stack:', e.stack);
    alert('Ошибка экспорта PNG: ' + (e.message || 'Неизвестная ошибка')); 
  }
}
  
  async function exportTXTLocal(){
    try{
      if (!CANVAS.hasImage()){ alert('Сначала загрузите снимок'); return; }
      
      const patientName = ($('#uso-patient-name').val() || '').trim();
      if (!patientName) {
        alert('Пожалуйста, укажите имя пациента');
        $('#uso-patient-name').focus();
        return;
      }
      
      saveVariantState();
      const nowStr = new Date().toLocaleDateString('ru-RU');
      const sections = await buildAllVariantSectionsTextOnlyHTML();
      let text = 'Дата расчёта: ' + nowStr + '\n\n' + htmlToPlainText(sections);
      const data = '\ufeff' + text;
      const blob = new Blob([data], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=buildFileNameBase()+'.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e){ 
      console.error('[USO] TXT export error:', e); 
      alert('Ошибка экспорта TXT'); 
    }
  }

  async function sendWA(){
    if (!CANVAS.hasImage()){ alert('Сначала загрузите снимок'); return; }
    
    const patientName = ($('#uso-patient-name').val() || '').trim();
    if (!patientName) {
      alert('Пожалуйста, укажите имя пациента');
      $('#uso-patient-name').focus();
      return;
    }
    
    saveVariantState();
    const textHtml = await buildAllVariantSectionsTextOnlyHTML();
    const imagesHtml = buildImagesHTML();
    
    const allImages = CANVAS.getAllImages ? CANVAS.getAllImages() : [];
    const mode = CANVAS.getWorkMode ? CANVAS.getWorkMode() : 'panoramic';
    
    const combined = imagesHtml + '<div style="page-break-after:always;"></div>' + textHtml;
    const res = await EXP.buildPDFBlob(combined, buildFileNameBase(), currentReportType(), allImages, mode) || {};
    const blob = res.blob, name = res.name || (buildFileNameBase()+'.pdf');
    if (!blob){ alert('Не удалось подготовить PDF для WhatsApp.'); return; }
    const file = new File([blob], name, {type:'application/pdf'});
    const msg = 'Добрый день. Ортопед внимательно изучил снимок. Высылаем PDF для ознакомления.';
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ text: msg, files:[file] }); return; } catch(_){}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.open('https://wa.me/?text='+encodeURIComponent(msg), '_blank');
  }
  
  async function sendTG(){
    if (!CANVAS.hasImage()){ alert('Сначала загрузите снимок'); return; }
    
    const patientName = ($('#uso-patient-name').val() || '').trim();
    if (!patientName) {
      alert('Пожалуйста, укажите имя пациента');
      $('#uso-patient-name').focus();
      return;
    }
    
    saveVariantState();
    const textHtml = await buildAllVariantSectionsTextOnlyHTML();
    const imagesHtml = buildImagesHTML();
    
    const allImages = CANVAS.getAllImages ? CANVAS.getAllImages() : [];
    const mode = CANVAS.getWorkMode ? CANVAS.getWorkMode() : 'panoramic';
    
    const combined = imagesHtml + '<div style="page-break-after:always;"></div>' + textHtml;
    const res = await EXP.buildPDFBlob(combined, buildFileNameBase(), currentReportType(), allImages, mode) || {};
    const blob = res.blob, name = res.name || (buildFileNameBase()+'.pdf');
    if (!blob){ alert('Не удалось подготовить PDF для Telegram.'); return; }
    const file = new File([blob], name, {type:'application/pdf'});
    const msg = 'Добрый день. Ортопед внимательно изучил снимок. Высылаем PDF для ознакомления.';
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ text: msg, files: [file] }); return; } catch(_){}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.open('https://t.me/share/url?url='+encodeURIComponent(msg), '_blank');
  }

  function exportMarkupJSON(){
    if (!variants.length) return;
    saveVariantState();
    const json = JSON.stringify(variants, null, 2);
    const blob = new Blob([json], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFileNameBase() + '_markup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importMarkupJSON(e){
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid JSON structure');
        variants = data;
        activeVar = 0;
        $('#uso-variants-bar').empty();
        variants.forEach((v, i) => addVariantTabUI(i, v.title));
        switchVariant(0);
        updateCompareButton();
        alert('Разметка импортирована успешно');
      } catch(err) {
        alert('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function showCompareModal(){
    if (variants.length < 2) return;
    const html = variants.map((v, i) => {
      const lc = v._lastCalc || {};
      return '<div style="margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:4px;">' +
             '<b>'+escapeHTML(v.title)+'</b><br>' +
             'Терапия: '+U.util.money(lc.therapy||0)+' ₽<br>' +
             'Коронки MC: '+U.util.money((lc.col?.['mc_default']||0))+' ₽<br>' +
             'Коронки ZR: '+U.util.money((lc.col?.['zr_default']||0))+' ₽<br>' +
             'Протезы: '+U.util.money(lc.prosthesis?.removableMin||0)+' - '+U.util.money(lc.prosthesis?.removableMax||0)+' ₽<br>' +
             'Импланты: '+U.util.money(lc.implants?.implSetSum||0)+' ₽' +
             '</div>';
    }).join('');
    alert(html);
  }

  function bindTestPanel(){
    // Заглушка для тестовой панели
  }

  function buildFileNameBase(){
    const name = ($('#uso-patient-name').val()||'').trim().replace(/[^a-яa-z0-9]/gi, '_');
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    return (name||'patient') + '_' + date;
  }

  function currentReportType(){
    return 'default';
  }

  async function getSectionsHTMLForExport(){
    return await buildAllVariantSectionsTextOnlyHTML();
  }

  function buildImagesHTML(){
    return '';
  }

  function updateExportEnabled(){
    const hasName = ($('#uso-patient-name').val()||'').trim().length > 0;
    const hasImage = CANVAS && CANVAS.hasImage && CANVAS.hasImage();
    $('#uso-pdf, #uso-txt, #uso-wa, #uso-tg, #uso-png').prop('disabled', !(hasName && hasImage));
  }

  // Инициализация при загрузке DOM
  $(document).ready(function(){
    DEBUG.log('[USO] Document ready, initializing...');
    init();
  });

})(window, jQuery);