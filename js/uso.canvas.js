(function(w, $){
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;

  // ✅ Debug-система для управления логированием
  const DEBUG = {
    enabled: false, // По умолчанию выключено для production

    // Инициализация при первом обращении (ленивая инициализация)
    _initialized: false,
    _checkInit: function() {
      if (!this._initialized) {
        // Проверяем настройку из WordPress (можно передать через ASSETS)
        const assets = U.ASSETS || {};
        this.enabled = assets.debug_mode === true || assets.debug_mode === '1';

        // Можно также включить через localStorage для разработки
        if (w.localStorage && w.localStorage.getItem('uso_debug') === 'true') {
          this.enabled = true;
        }

        this._initialized = true;
      }
    },

    log: function(...args) {
      this._checkInit();
      if (this.enabled && w.console && w.console.log) {
        w.console.log(...args);
      }
    },

    warn: function(...args) {
      if (w.console && w.console.warn) {
        w.console.warn(...args);
      }
    },

    error: function(...args) {
      if (w.console && w.console.error) {
        w.console.error(...args);
      }
    }
  };

  const MODES = {
    PANORAMIC: 'panoramic',
    SIMPLE: 'simple'
  };

  let workMode = MODES.PANORAMIC;
  let images = [];
  let activeImageIndex = 0;
  
  let mainCanvas = null;
  let canvases = {};
  
  let markingMode = false;
  let midlineMode = false;
  let midlineShown = false;
  let currentColor = 'blue';
  let currentShape = 'point';
  let drawState = null;
  let midline = null;
  let history = [];
  let restoringHistory = false;
  let cropping = null;

  let _wrapRO = null;
  let _resizeTimeout = null;

  const swatchColors = {
    blue:'#1565FF', ltblue:'#00E5FF', white:'#FFFFFF', violet:'#B100FF',
    black:'#000000', yellow:'#FFEB00', green:'#00C853', red:'#FF1744'
  };
  
  const colorMap = {
    blue_x:'#1565FF',   blue_dot:'#1565FF',
    ltblue_x:'#00E5FF', ltblue_dot:'#00E5FF',
    white_dot:'#FFFFFF', white_line:'#FFFFFF',
    violet_x:'#B100FF', violet_line:'#B100FF', violet_dot:'#B100FF', violet_exc:'#B100FF', violet_oval:'#B100FF',
    black_x:'#000000', black_dot:'#000000', black_exc:'#000000',
    yellow_line:'#FFEB00', yellow_dot:'#FFEB00', yellow_oval:'#FFD600',
    red_dot:'#FF1744', red_q:'#FF1744', red_oval:'#FF1744', red_exc:'#FF1744',
    green_dot:'#00C853', green_q:'#00C853', green_oval:'#00C853', green_exc:'#00C853', green_line:'#00E676'
  };

  function markerType(color, shape){
    const map = {
      blue:   { point:'blue_dot',   cross:'blue_x',   line:null,            oval:null,          q:null,      exc:null },
      ltblue: { point:'ltblue_dot', cross:'ltblue_x', line:null,            oval:null,          q:null,      exc:null },
      white:  { point:'white_dot',  cross:null,       line:'white_line',    oval:null,          q:null,      exc:null },
      violet: { point:'violet_dot', cross:'violet_x', line:'violet_line',   oval:'violet_oval', q:null,      exc:'violet_exc' },
      black:  { point:'black_dot',  cross:'black_x',  line:null,            oval:null,          q:null,      exc:'black_exc' },
      yellow: { point:'yellow_dot', cross:null,       line:'yellow_line',   oval:'yellow_oval', q:null,      exc:null },
      green:  { point:'green_dot',  cross:null,       line:'green_line',    oval:'green_oval',  q:'green_q', exc:'green_exc' },
      red:    { point:'red_dot',    cross:null,       line:null,            oval:'red_oval',    q:'red_q',   exc:'red_exc' }
    };
    const cfg = map[color] || map.blue;
    return cfg[shape] || null;
  }

  function fsElement(){ 
    return document.fullscreenElement || document.webkitFullscreenElement || null; 
  }
  
  function requestFs(elem){
    try {
      if (elem.requestFullscreen) return elem.requestFullscreen();
      if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); return Promise.resolve(); }
    } catch(e){ return Promise.reject(e); }
    return Promise.reject(new Error('Fullscreen API not supported'));
  }
  
  function exitFs(){
    try {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); return Promise.resolve(); }
    } catch(e){ return Promise.reject(e); }
    return Promise.resolve();
  }
  
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let fakeFs = false;
  let vvHandler = null;
  
  function isAnyFs(){ return !!fsElement() || fakeFs; }
  function onViewportChange(){ 
    if (!mainCanvas) return; 
    resizeToContainer(); 
  }
  function emitFakeFs(flag){
    try { document.dispatchEvent(new CustomEvent('uso:fsToggle', { detail:{ isFs: !!flag, mode:'fake' } })); } catch(_){}
  }
  
  function enableFakeFs(){
    fakeFs = true;
    document.body.classList.add('uso-fs-active');
    
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100vh';
    document.body.style.top = (-scrollY) + 'px';
    
    $('#uso-exit-fs').css('display','inline-flex');
    
    requestAnimationFrame(() => onViewportChange());
    
    if (window.visualViewport) {
      vvHandler = U.util.throttle(function(){ 
        if (fakeFs) {
          requestAnimationFrame(() => onViewportChange());
        }
      }, 200);
      window.visualViewport.addEventListener('resize', vvHandler);
      window.visualViewport.addEventListener('scroll', vvHandler);
    }
    emitFakeFs(true);
  }
  
  function disableFakeFs(){
    fakeFs = false;
    document.body.classList.remove('uso-fs-active');
    
    const scrollY = -parseInt(document.body.style.top || '0');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.body.style.top = '';
    
    if (scrollY) {
      window.scrollTo(0, scrollY);
    }
    
    $('#uso-exit-fs').css('display','none');
    
    if (window.visualViewport && vvHandler){
      window.visualViewport.removeEventListener('resize', vvHandler);
      window.visualViewport.removeEventListener('scroll', vvHandler);
      vvHandler = null;
    }
    emitFakeFs(false);
  }
  
  function toggleFullscreen(){
    const elem = document.getElementById('uso-canvas-container');
    if (isAnyFs()){
      if (fsElement()) { exitFs().catch(function(){}); }
      if (fakeFs) disableFakeFs();
      onViewportChange();
      updateFullscreenBtn();
      return;
    }
    if (isIOS) {
      enableFakeFs();
      onViewportChange();
      updateFullscreenBtn();
      return;
    }
    const tryNative = requestFs(elem);
    Promise.resolve(tryNative).then(function(){}).catch(function(){
      enableFakeFs();
      onViewportChange();
      updateFullscreenBtn();
    });
  }
  
  function updateFullscreenBtn(){
    const isFs = isAnyFs();
    $('#uso-fullscreen').text(isFs ? 'Выйти из полноэкранного' : 'На весь экран');
    $('#uso-exit-fs').css('display', isFs ? 'inline-flex' : 'none');
  }

  function hexToRgba(hex, alpha){
    hex = (hex||'').replace('#','');
    if (hex.length===3) hex = hex.split('').map(s=>s+s).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return 'rgba('+r+','+g+','+b+','+(alpha!=null?alpha:0.12)+')';
  }
  
  function clamp(n,min,max){ 
    return Math.max(min, Math.min(max, n)); 
  }
  
  function updatePaletteBg(){
    const hex = swatchColors[currentColor] || '#1565FF';
    const rgba = hexToRgba(hex, 0.12);
    const pal = document.querySelector('#uso-calc-app .palette.unified');
    if (pal) pal.style.background = rgba;
  }
  
  function H(){ 
    return mainCanvas ? mainCanvas.getHeight() : 1; 
  }

  function updateShapeButtonsAvailability(){
    const btns = document.querySelectorAll('.palette .shape-btn');
    let needSwitch = false;
    let firstAllowed = null;
    btns.forEach(btn=>{
      const shape = btn.getAttribute('data-shape') || 'point';
      const allowed = (shape === 'free') ? true : !!markerType(currentColor, shape);
      btn.disabled = !allowed;
      btn.classList.toggle('disabled', !allowed);
      if (allowed && !firstAllowed) firstAllowed = btn;
      if (!allowed && btn.classList.contains('active')) needSwitch = true;
    });
    if (needSwitch && firstAllowed) firstAllowed.click();
  }

  function sliderToScale(val){ 
    return Math.pow(2, Number(val || 0)); 
  }
  
  function scaleToSlider(scale){ 
    return Math.log2(Number(scale || 1)); 
  }
  
  let markerSizeInput = null;
  
  function injectSizeControls(){
    const host = document.querySelector('#uso-calc-app .panel-controls');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.className = 'size-controls';
    const label = document.createElement('span');
    label.className = 'mini-label';
    label.textContent = 'Размер метки';
    const ms = document.createElement('input');
    ms.type='range'; ms.min='-2.0'; ms.max='2.0'; ms.step='0.01'; ms.value='0.00';
    ms.id='marker-size'; ms.title='Размер метки';
    wrap.appendChild(label); wrap.appendChild(ms); host.appendChild(wrap);
    markerSizeInput = ms;

    ms.addEventListener('input', function(e){
      const ao = mainCanvas.getActiveObject();
      const sliderVal = parseFloat(e.target.value || '0');
      if (ao) {
        applySizeBySlider(ao, sliderVal);
        ao.setCoords();
        mainCanvas.requestRenderAll();
        pushHistory();
      }
      applyFreeBrush();
    });
  }
  
  function getSizeSliderVal(){ 
    return markerSizeInput ? parseFloat(markerSizeInput.value || '0') : 0; 
  }
  
  function setSizeSliderVal(v){ 
    if (markerSizeInput) markerSizeInput.value = String(v || 0); 
  }
  
  function currentSizeMultiplier(){ 
    return Math.pow(2, getSizeSliderVal()); 
  }
  
  function brushWidth(){ 
    return clamp(H() * 0.006 * currentSizeMultiplier(), 2, 12); 
  }
  
  function applyFreeBrush(){
    if (!mainCanvas) return;
    if (!mainCanvas.freeDrawingBrush) mainCanvas.freeDrawingBrush = new fabric.PencilBrush(mainCanvas);
    mainCanvas.freeDrawingBrush.color = swatchColors[currentColor] || '#1565FF';
    mainCanvas.freeDrawingBrush.width = brushWidth();
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Применяет настройки кисти к указанному canvas
  function applyFreeBrushTo(canvas){
    if (!canvas) return;
    if (!canvas.freeDrawingBrush) canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = swatchColors[currentColor] || '#1565FF';
    canvas.freeDrawingBrush.width = brushWidth();
  }

  const SIZE_F = { point: 1.5, cross: 1.5, line: 1.5, oval: 1.5, text: 2.0 };

  function applyPointScale(obj, sliderVal){
    if (!obj || obj.type!=='circle') return;
    if (!obj._norm) obj._norm = {};
    if (typeof obj._norm.rN !== 'number') {
      const baseR = (obj.radius || Math.max(4, Math.round(H()*0.011*SIZE_F.point)));
      obj._norm.rN = baseR / H();
    }
    obj._norm.factor = sliderToScale(sliderVal);
    const newR = Math.max(2, obj._norm.rN * H() * (obj._norm.factor || 1));
    obj.set('radius', newR);
    obj._lastSizeVal = (obj._norm.factor || 1);
  }

  function applySizeBySlider(obj, sliderVal){
    const factor = sliderToScale(sliderVal);
    const h = H();
    if (!obj._norm) obj._norm = {};
    obj._norm.factor = factor;
    obj._lastSizeVal = factor;

    switch (obj.type){
      case 'circle': { 
        applyPointScale(obj, sliderVal); 
        break; 
      }
      case 'group': {
        if (typeof obj._norm.wN !== 'number' || typeof obj._norm.strokeN !== 'number') {
          const baseW = obj.getScaledWidth() / (obj.scaleX || 1);
          obj._norm.wN = (baseW && baseW > 0) ? (baseW / h) : 0.032;
          obj._norm.strokeN = (obj._objects?.[0]?.strokeWidth || Math.round(h*0.0055*SIZE_F.cross)) / h;
        }
        const targetW = (obj._norm.wN || 0) * h * factor;
        const baseW = obj.getScaledWidth() / (obj.scaleX || 1) || 1;
        
        if (baseW > 0) {
          const k = targetW / baseW;
          if (isFinite(k) && k > 0) {
            obj.scaleX = obj.scaleY = k;
          }
        }
        
        (obj._objects || []).forEach(l => {
          l.strokeUniform = true;
          l.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        });
        break;
      }
      case 'ellipse': {
        if (obj._manuallyScaled && obj._absoluteSize) {
          obj.setCoords();
          return;
        }
        
        if (typeof obj._norm.rxN !== 'number' || typeof obj._norm.ryN !== 'number') {
          obj._norm.rxN = (obj.rx || Math.round(H()*0.0198*SIZE_F.oval)) / h;
          obj._norm.ryN = (obj.ry || Math.round(H()*0.0286*SIZE_F.oval)) / h;
          obj._norm.strokeN = (obj.strokeWidth || Math.round(H()*0.0055*SIZE_F.oval)) / h;
          obj._norm.cx = (obj.left || 0) + (obj.rx || 0);
          obj._norm.cy = (obj.top  || 0) + (obj.ry || 0);
        }
        const rx = (obj._norm.rxN || 0) * h * factor;
        const ry = (obj._norm.ryN || 0) * h * factor;
        const cx = obj._norm.cx || ((obj.left||0) + (obj.rx||0));
        const cy = obj._norm.cy || ((obj.top ||0) + (obj.ry||0));
        obj.rx = rx; obj.ry = ry;
        obj.left = cx - rx; obj.top = cy - ry;
        obj.strokeUniform = true;
        obj.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        break;
      }
      case 'line': {
        if (typeof obj._norm.strokeN !== 'number') obj._norm.strokeN = (obj.strokeWidth || Math.round(H()*0.0055*SIZE_F.line)) / h;
        obj.strokeUniform = true;
        obj.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        break;
      }
      case 'text': {
        if (typeof obj._norm.fsN !== 'number') obj._norm.fsN = (obj.fontSize || Math.round(H()*0.032*1.4*SIZE_F.text)) / h;
        obj.fontSize = Math.max(16, (obj._norm.fsN || 0) * h * factor);
        break;
      }
      case 'path': {
        if (typeof obj._norm.strokeN !== 'number') obj._norm.strokeN = (obj.strokeWidth || Math.round(H()*0.0055)) / h;
        obj.strokeUniform = true;
        obj.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        break;
      }
    }
  }

  function rescaleMarker(o){
    const h = H();
    if (!o) return;
    if (o.type === 'circle'){
      if (!o._norm) return;
      const r = (o._norm.rN || 0) * h * (o._norm.factor || 1);
      o.set('radius', Math.max(2, r));
      return;
    }
    if (o.type === 'group'){
      if (!o._norm){
        const w0 = o.getScaledWidth() / (o.scaleX || 1);
        o._norm = { wN: w0 / h, strokeN: (o._objects?.[0]?.strokeWidth || Math.round(h*0.0055*SIZE_F.cross)) / h, factor: 1 };
      }
      const targetW = (o._norm.wN || 0) * h * (o._norm.factor || 1);
      const baseW = o.getScaledWidth() / (o.scaleX || 1) || 1;
      const k = targetW / baseW;
      o.scaleX = o.scaleY = k;
      (o._objects||[]).forEach(l=>{
        l.strokeUniform = true;
        l.strokeWidth = Math.max(2, (o._norm.strokeN || 0) * h * (o._norm.factor || 1));
      });
      o.setCoords();
      return;
    }
    if (o.type === 'ellipse'){
      if (o._manuallyScaled && o._absoluteSize) {
        o.rx = o._absoluteSize.rx;
        o.ry = o._absoluteSize.ry;
        o.strokeWidth = o._absoluteSize.strokeWidth;
        o.setCoords();
        return;
      }
      
      if (!o._norm){
        o._norm = { 
          rxN:(o.rx||Math.round(h*0.0198*SIZE_F.oval))/h, 
          ryN:(o.ry||Math.round(h*0.0286*SIZE_F.oval))/h, 
          strokeN:(o.strokeWidth||Math.round(h*0.0055*SIZE_F.oval))/h, 
          cx:(o.left||0)+(o.rx||0), 
          cy:(o.top||0)+(o.ry||0), 
          factor:1 
        };
      }
      const rx = (o._norm.rxN||0) * h * (o._norm.factor || 1);
      const ry = (o._norm.ryN||0) * h * (o._norm.factor || 1);
      const cx = o._norm.cx || ((o.left||0)+(o.rx||0));
      const cy = o._norm.cy || ((o.top ||0)+(o.ry||0));
      o.rx = rx; o.ry = ry;
      o.left = cx - rx; o.top = cy - ry;
      o.strokeUniform = true;
      o.strokeWidth = Math.max(2, (o._norm.strokeN||0) * h * (o._norm.factor || 1));
      o.setCoords();
      return;
    }
    if (o.type === 'line'){
      if (!o._norm){ o._norm = { strokeN: (o.strokeWidth||Math.round(h*0.0055*SIZE_F.line))/h, factor: 1 }; }
      o.strokeUniform = true;
      o.strokeWidth = Math.max(2, (o._norm.strokeN||0) * h * (o._norm.factor || 1));
      return;
    }
    if (o.type === 'text'){
      if (!o._norm){ o._norm = { fsN: (o.fontSize||Math.round(h*0.032*1.4*SIZE_F.text))/h, factor: 1 }; }
      o.fontSize = Math.max(16, (o._norm.fsN||0) * h * (o._norm.factor || 1));
      o.setCoords();
      return;
    }
    if (o.type === 'path'){
      if (!o._norm){ o._norm = { strokeN: (o.strokeWidth||Math.round(h*0.0055))/h, factor: 1 }; }
      o.strokeWidth = Math.max(2, (o._norm.strokeN||0) * h * (o._norm.factor || 1));
      o.strokeUniform = true;
      o.setCoords();
      return;
    }
  }
  
  function rescaleAllMarkers(){
    if (!mainCanvas) return;
    const markers = getMarkersForCurrentImage();
    markers.forEach(rescaleMarker);
    if (midline) {
      const w = mainCanvas.getWidth();
      const yy = midlineY();
      midline.set({ x1: 0, y1: yy, x2: w, y2: yy, left: 0, top: yy });
      midline.setCoords();
    }
    mainCanvas.requestRenderAll();
  }

  function setMidlineMode(flag){
    midlineMode = !!flag;
    if (midlineMode){
      if (!midline) ensureMidline();
      if (!midlineShown){ midlineShown = true; midline.set('visible', true); }
      midline.set({ stroke:'#d32f2f', strokeWidth:4, strokeDashArray:null, selectable:true, evented:true, hasControls:false, lockMovementX:true, hoverCursor:'ns-resize' });
    } else {
      if (midline){
        midline.set({ stroke:'rgba(0,0,0,0.35)', strokeWidth:2, strokeDashArray:[6,6], selectable:false, evented:false, hasControls:false, lockMovementX:true, hoverCursor:'default', visible: midlineShown });
      }
    }
    syncMarkMode();
    const btn = document.getElementById('img-rotate');
    if (btn) {
      btn.classList.toggle('active', midlineMode);
      btn.setAttribute('aria-pressed', midlineMode ? 'true' : 'false');
      btn.textContent = 'Ср. линия' + (midlineMode ? ' (вкл)' : '');
    }
  }

  function midlineY(){
    const h = mainCanvas ? mainCanvas.getHeight() : 0;
    if (!midline) return h/2;
    return (typeof midline.y1 === 'number') ? midline.y1 : h/2;
  }
  
  function ensureMidline(preserve){
    if (!mainCanvas) return;
    let prevFrac = null;
    if (preserve && midline && mainCanvas.getHeight()) prevFrac = midlineY() / mainCanvas.getHeight();
    if (midline) { mainCanvas.remove(midline); midline = null; }
    const w = mainCanvas.getWidth(), h = mainCanvas.getHeight();
    const y = (prevFrac != null) ? clamp(prevFrac * h, 0, h) : h/2;
    midline = new fabric.Line([0, y, w, y], {
      stroke:'rgba(0,0,0,0.3)', strokeWidth:2, strokeDashArray:[6,6],
      selectable:false, evented:false, hasControls:false, lockMovementX:true, hoverCursor:'default',
      excludeFromExport:true, visible: midlineShown
    });
    midline.set('markerType', '__midline__');
    mainCanvas.add(midline); mainCanvas.bringToFront(midline); mainCanvas.requestRenderAll();
  }

  function canAddMarkers(){ 
    return markingMode && !midlineMode && !cropping; 
  }

  function getMarkersForCurrentImage(){
    const imgData = images[activeImageIndex];
    return imgData && imgData.markers ? imgData.markers : [];
  }

  function enableMouseWheelZoom(){
    if (!mainCanvas) return;
    mainCanvas.on('mouse:wheel', function(opt){
      if (markingMode || midlineMode || cropping) return;
      const e = opt.e || window.event;
      let zoom = mainCanvas.getZoom();
      const deltaY = (typeof e.deltaY === 'number') ? e.deltaY : 0;
      zoom *= Math.pow(0.999, deltaY);
      zoom = Math.min(4, Math.max(0.2, zoom));
      const rect = mainCanvas.upperCanvasEl.getBoundingClientRect();
      const cx = (typeof e.clientX==='number') ? (e.clientX - rect.left) : (e.offsetX || 0);
      const cy = (typeof e.clientY==='number') ? (e.clientY - rect.top)  : (e.offsetY || 0);
      const point = new fabric.Point(cx, cy);
      mainCanvas.zoomToPoint(point, zoom);
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      mainCanvas.requestRenderAll();
    });
  }
  
  function enablePanDrag(){
    if (!mainCanvas) return;
    let isPanning = false;
    let panLast = null;
    let rafId = null; // ✅ ДОБАВЛЕНО: requestAnimationFrame ID для debounce

    mainCanvas.on('mouse:down', function(opt){
      if (markingMode || midlineMode || cropping) return;
      if (opt && opt.target) return;
      const e = opt.e || window.event;
      isPanning = true;
      panLast = { x: e.offsetX || 0, y: e.offsetY || 0 };
      mainCanvas.setCursor('grabbing');
    });

    // ✅ ОПТИМИЗИРОВАНО: requestAnimationFrame debounce (60 FPS вместо ~100+ events/sec)
    mainCanvas.on('mouse:move', function(opt){
      if (!isPanning) return;
      const e = opt.e || window.event;
      const dx = (e.offsetX||0) - panLast.x;
      const dy = (e.offsetY||0) - panLast.y;
      const vpt = mainCanvas.viewportTransform;
      vpt[4] += dx; vpt[5] += dy;
      panLast = { x: e.offsetX||0, y: e.offsetY||0 };

      // ✅ Debounce: рендерим только один раз за frame
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          mainCanvas.requestRenderAll();
          rafId = null;
        });
      }
    });

    mainCanvas.on('mouse:up', function(){
      isPanning = false;
      panLast = null;
      mainCanvas.setCursor('default');
      // ✅ Отменяем pending render при отпускании мыши
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }
  
  function enableTouchGestures(){
    if (!mainCanvas) return;
    const upper = mainCanvas.upperCanvasEl;
    const activePointers = new Map();
    let lastDistance = null, lastCenter = null;
    let isPanning = false, panLast = null;

    function screenPoint(e){
      const rect = upper.getBoundingClientRect();
      const cx = ('clientX' in e) ? e.clientX : 0;
      const cy = ('clientY' in e) ? e.clientY : 0;
      return { x: cx - rect.left, y: cy - rect.top };
    }
    function startPan(x, y){ isPanning = true; panLast={x,y}; upper.style.cursor='grabbing'; }
    function updatePan(x, y){
      if (!isPanning) return;
      const dx = x - panLast.x, dy = y - panLast.y;
      const vpt = mainCanvas.viewportTransform;
      vpt[4] += dx; vpt[5] += dy;
      panLast = { x, y };
      mainCanvas.requestRenderAll();
    }
    function endPan(){ isPanning=false; panLast=null; upper.style.cursor=''; }

    if ('onpointerdown' in window){
      upper.addEventListener('pointerdown', function(e){
        activePointers.set(e.pointerId, e);
        if (upper.setPointerCapture) upper.setPointerCapture(e.pointerId);
        if (!markingMode && !midlineMode && !cropping){
          let target = null; try { target = mainCanvas.findTarget(e) || null; } catch(_){}
          const p = screenPoint(e);
          if (activePointers.size===1 && !target){ startPan(p.x, p.y); }
        }
      }, {passive:true});

      upper.addEventListener('pointermove', function(e){
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, e);

        if (!markingMode && !midlineMode && !cropping && activePointers.size===2){
          e.preventDefault();
          const pts = Array.from(activePointers.values());
          const p1 = pts[0], p2 = pts[1];
          const dx=p2.clientX-p1.clientX, dy=p2.clientY-p1.clientY;
          const dist = Math.sqrt(dx*dx+dy*dy);
          const rect = upper.getBoundingClientRect();
          const center = { x:(p1.clientX+p2.clientX)/2, y:(p1.clientY+p2.clientY)/2 };
          const zoom = mainCanvas.getZoom();
          if (lastDistance){
            let newZoom = zoom * (dist/lastDistance);
            newZoom = Math.min(4, Math.max(0.2, newZoom));
            const point = new fabric.Point(center.x - rect.left, center.y - rect.top);
            mainCanvas.zoomToPoint(point, newZoom);
            const vpt = mainCanvas.viewportTransform;
            vpt[4] += (center.x - (lastCenter ? lastCenter.x : center.x));
            vpt[5] += (center.y - (lastCenter ? lastCenter.y : center.y));
            mainCanvas.requestRenderAll();
          }
          lastDistance = dist; lastCenter = center;
          return;
        }

        const p = screenPoint(e);
        if (!markingMode && !midlineMode && !cropping && isPanning){ updatePan(p.x,p.y); }
      }, {passive:false});

      upper.addEventListener('pointerup', function(e){
        if (activePointers.has(e.pointerId)){
          activePointers.delete(e.pointerId);
          if (upper.releasePointerCapture) upper.releasePointerCapture(e.pointerId);
        }
        if (activePointers.size<2){ lastDistance=null; lastCenter=null; }
        if (isPanning){ endPan(); }
      }, {passive:true});
    }
  }

  function enableContainerResizeObserver(){
    const wrap = document.getElementById('uso-canvas-container');
    if (!wrap || typeof ResizeObserver === 'undefined') {
      $(window).on('resize orientationchange', U.util.throttle(function(){
        if (!mainCanvas) return;
        try {
          resizeToContainer();
        } catch(err) {
          console.error('[USO] Resize error:', err);
        }
      }, 500));
      return;
    }
    
    try {
      if (_wrapRO) { 
        _wrapRO.disconnect(); 
        _wrapRO = null; 
      }
      
      _wrapRO = new ResizeObserver(() => {
        if (!mainCanvas) return;
        
        clearTimeout(_resizeTimeout);
        _resizeTimeout = setTimeout(() => {
          window.requestAnimationFrame(() => {
            try {
              resizeToContainer();
            } catch(err) {
              console.error('[USO] Resize container error:', err);
            }
          });
        }, 500);
      });
      
      _wrapRO.observe(wrap);
    } catch(err) {
      console.warn('[USO] ResizeObserver error:', err);
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Создает DOM элемент canvas
  function createCanvasElement(index) {
    const canvasEl = document.createElement('canvas');
    canvasEl.id = 'uso-canvas-' + index;
    canvasEl.className = 'uso-image-canvas';
    canvasEl.style.cssText = 'display: none; position: absolute; top: 0; left: 0;';

    const container = document.getElementById('uso-canvas-container');
    if (!container) {
      console.error('[USO] Canvas container not found');
      return null;
    }

    container.appendChild(canvasEl);
    DEBUG.log('[USO_CANVAS] Canvas element created:', canvasEl.id);
    return canvasEl;
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Создает fabric.Canvas с нужными настройками
  function createFabricCanvas(canvasEl, onChange) {
    const fabricCanvas = new fabric.Canvas(canvasEl, {
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: false
    });

    DEBUG.log('[USO_CANVAS] Fabric canvas created for:', canvasEl.id);

    // Привязываем обработчики событий
    bindCanvasEvents(fabricCanvas, onChange);

    return fabricCanvas;
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Привязывает обработчики событий к canvas
  function bindCanvasEvents(canvas, onChange) {
    if (!canvas) return;

    // Эти обработчики будут добавлены позже из функции initCanvas
    // Пока оставляем пустым, заполним при рефакторинге initCanvas
  }

  function initCanvas(onChange){
    if (typeof fabric === 'undefined') {
      console.error('[USO] fabric.js not loaded');
      return null;
    }

    try {
      // ✅ ИЗМЕНЕНО: Создаем первый canvas элемент
      const firstCanvasEl = document.getElementById('uso-canvas');
      if (!firstCanvasEl) {
        console.error('[USO] Canvas element #uso-canvas not found');
        return null;
      }

      mainCanvas = new fabric.Canvas('uso-canvas', {
        selection:true,
        preserveObjectStacking:true,
        renderOnAddRemove: false
      });

      // ✅ НОВОЕ: Сохраняем первый canvas в словаре
      canvases[0] = mainCanvas;

      DEBUG.log('[USO] Canvas initialized successfully');

      injectSizeControls();
      enableMouseWheelZoom();
      enablePanDrag();
      enableTouchGestures();
      enableContainerResizeObserver();

      $('#uso-exit-fs').on('click', function(){
        if (fsElement()) exitFs().catch(function(){});
        if (fakeFs) disableFakeFs();
        onViewportChange();
        updateFullscreenBtn();
      });
      $('#uso-fullscreen').on('click', toggleFullscreen);
      const onFsChange = function(){ updateFullscreenBtn(); onViewportChange(); };
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);

      (function bindMidlineToggle(){
        const $btn = $('#img-rotate');
        if ($btn.length){
          $btn.off('click');
          $btn.attr({ title: 'Средняя линия: смещение по вертикали', 'aria-pressed': 'false' }).text('Ср. линия');
          $btn.on('click', function(){ setMidlineMode(!midlineMode); });
        }
      })();

      $('.palette .color-btn').on('click', function(){
        $('.palette .color-btn').attr('aria-pressed','false').removeClass('active');
        $(this).attr('aria-pressed','true').addClass('active');
        currentColor = this.getAttribute('data-color') || 'blue';
        if (mainCanvas) applyFreeBrush();
        updatePaletteBg();
        updateShapeButtonsAvailability();
      });
      $('.palette .color-btn[data-color="blue"]').addClass('active').attr('aria-pressed','true');
      updatePaletteBg();
      updateShapeButtonsAvailability();

      $('.palette .shape-btn').on('click', function(){
        $('.palette .shape-btn').attr('aria-pressed','false').removeClass('active');
        $(this).attr('aria-pressed','true').addClass('active');
        currentShape = this.getAttribute('data-shape') || 'point';
        if (mainCanvas) {
          if (currentShape === 'free') {
            applyFreeBrush();
            mainCanvas.isDrawingMode = (markingMode && !midlineMode && !cropping);
          } else {
            mainCanvas.isDrawingMode = false;
          }
        }
      });

      $('#mark-toggle').on('click', function(){
        if (midlineMode) setMidlineMode(false);
        markingMode = !markingMode;
        $(this).attr('aria-pressed', markingMode ? 'true' : 'false').toggleClass('primary', markingMode);
        syncMarkMode();
      });
      syncMarkMode();
      applyFreeBrush();

      $('#uso-undo').on('click', undoLast);
      $('#uso-del').on('click', function(){ deleteSelection(); onChange && onChange(); });
      $(document).on('keydown.uso', function(e){
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
        if (!$(t).closest('#uso-calc-app').length) return;
        e.preventDefault();
        deleteSelection(); onChange && onChange();
      });

      let lastMarkerTime = 0;
      const MARKER_DEBOUNCE = 300;
      let lineDrawRafId = null; // ✅ ДОБАВЛЕНО: RAF ID для debounce рисования линий

      mainCanvas.on('mouse:down', function(opt){
        if (!canAddMarkers()) return;
        if (currentShape === 'free') return;

        const now = Date.now();
        if (now - lastMarkerTime < MARKER_DEBOUNCE) return;
        lastMarkerTime = now;

        const p = mainCanvas.getPointer(opt.e);
        const shape = currentShape || 'point';
        if (opt && opt.target) return;

        if (shape==='line'){
          const mt = markerType(currentColor, 'line'); if (!mt) return;
          if (!drawState){
            const sw = Math.max(2, Math.round(H()*0.0055*SIZE_F.line));
            const dx = Math.max(10, Math.round(H()*0.022*SIZE_F.line));
            const dy = Math.max(10, Math.round(H()*0.0165*SIZE_F.line));
            drawState = { mode:'line', start:{x:p.x, y:p.y}, lineObj: createLine(p.x, p.y, p.x+dx, p.y+dy, mt, sw) };
            mainCanvas.add(drawState.lineObj);
            mainCanvas.discardActiveObject();
          }
          return;
        }

        const mt = markerType(currentColor, shape);
        if (!mt) return;
        const obj = createShape(shape, p.x, p.y, mt);
        if (obj){
          mainCanvas.add(obj);
          const markers = getMarkersForCurrentImage();
          markers.push(obj);
          applySizeBySlider(obj, getSizeSliderVal());
          mainCanvas.setActiveObject(obj);
          mainCanvas.requestRenderAll();
          pushHistory(); onChange && onChange();
          syncMarkMode();
        }
      });

      // ✅ ОПТИМИЗИРОВАНО: requestAnimationFrame debounce для рисования линий
      mainCanvas.on('mouse:move', function(opt){
        if (drawState && drawState.mode==='line'){
          const p = mainCanvas.getPointer(opt.e);
          drawState.lineObj.set({ x2:p.x, y2:p.y });
          drawState.lineObj.setCoords();

          // ✅ Debounce: рендерим только один раз за frame
          if (!lineDrawRafId) {
            lineDrawRafId = requestAnimationFrame(() => {
              mainCanvas.requestRenderAll();
              lineDrawRafId = null;
            });
          }
        }
      });
      mainCanvas.on('mouse:up', function(){
        if (drawState && drawState.mode==='line'){
          const markers = getMarkersForCurrentImage();
          markers.push(drawState.lineObj);
          mainCanvas.setActiveObject(drawState.lineObj);
          applySizeBySlider(drawState.lineObj, getSizeSliderVal());
          drawState = null;

          // ✅ Отменяем pending RAF если есть
          if (lineDrawRafId) {
            cancelAnimationFrame(lineDrawRafId);
            lineDrawRafId = null;
          }

          mainCanvas.requestRenderAll();
          pushHistory(); onChange && onChange();
          syncMarkMode();
        }
      });

      mainCanvas.on('path:created', function(ev){
        if (!canAddMarkers()){ ev.path && mainCanvas.remove(ev.path); return; }
        const path = ev.path;
        path.set({ fill:'transparent', strokeUniform:true, selectable:true, evented:true, originX:'left', originY:'top' });
        path.set('markerType', 'free');
        path._norm = { strokeN: (path.strokeWidth||Math.round(H()*0.0055))/H(), factor: 1 };
        mainCanvas.setActiveObject(path);
        applySizeBySlider(path, getSizeSliderVal());
        const markers = getMarkersForCurrentImage();
        markers.push(path);
        pushHistory();
      });

      const updateDelBtnState = function(){
        const ao = mainCanvas.getActiveObject();
        const has = !!ao;
        $('#uso-del').prop('disabled', !has);
        if (ao && ao._norm && typeof ao._norm.factor === 'number'){
          setSizeSliderVal(scaleToSlider(ao._norm.factor));
        }
      };
      mainCanvas.on('selection:created', updateDelBtnState);
      mainCanvas.on('selection:updated', updateDelBtnState);
      mainCanvas.on('selection:cleared', function(){ $('#uso-del').prop('disabled', true); });

      mainCanvas.on('object:moving', function(e){
        const obj = e.target; if (!obj) return;
        if (obj === midline){
          const h = mainCanvas.getHeight(), w = mainCanvas.getWidth();
          const cp = obj.getCenterPoint();
          const yy = clamp(cp.y, 0, h);
          obj.set({ x1:0, y1:yy, x2:w, y2:yy, left:0, top:yy });
          obj.setCoords(); mainCanvas.requestRenderAll(); return;
        }
        if (cropping && obj === cropping.rect){ keepRectInBounds(obj); return; }

        const padding = 0, w=mainCanvas.getWidth(), h=mainCanvas.getHeight();
        const bounds = obj.getBoundingRect(true);
        let dx = 0, dy = 0;
        if (bounds.left < padding) dx = padding - bounds.left;
        if (bounds.top  < padding) dy = padding - bounds.top;
        if ((bounds.left + bounds.width)  > (w - padding)) dx = (w - padding) - (bounds.left + bounds.width);
        if ((bounds.top  + bounds.height) > (h - padding)) dy = (h - padding) - (bounds.top + bounds.height);
        if (dx || dy){ obj.left = (obj.left||0)+dx; obj.top = (obj.top||0)+dy; obj.setCoords(); }
      });
      
      mainCanvas.on('object:scaling', function(e){
        if (!cropping || e.target !== cropping.rect) {
          const obj = e.target;
          if (obj && obj.type === 'ellipse') {
            obj._manuallyScaled = true;
            obj._absoluteSize = {
              rx: obj.rx * obj.scaleX,
              ry: obj.ry * obj.scaleY,
              strokeWidth: obj.strokeWidth
            };
          }
          return;
        }
        applyRatioOnScale(e.target);
        keepRectInBounds(e.target);
      });

      mainCanvas.on('object:modified', function(){ pushHistory(); });

      mainCanvas.on('mouse:dblclick', function(opt){
        if (markingMode || midlineMode || cropping) return;
        const t = opt && opt.target;
        const imgData = images[activeImageIndex];
        const bgImg = imgData ? imgData.bgImg : null;
        if (t && t !== bgImg && t !== midline){
          mainCanvas.setActiveObject(t);
          deleteSelection();
        }
      });

      $('#view-reset').on('click', function(){ resetView(); });
      
      $(window).on('resize orientationchange', U.util.throttle(onViewportChange, 150));

      ensureMidline();
      setMidlineMode(false);
      return mainCanvas;
      
    } catch(err) {
      console.error('[USO] Canvas initialization error:', err);
      return null;
    }
  }

  function syncMarkMode(){
    if (!mainCanvas) return;
    mainCanvas.skipTargetFind = false;
    mainCanvas.selection = !!markingMode;
    
    const currentImg = images[activeImageIndex];
    const isEditableImage = currentImg && currentImg.canMark;
    
    DEBUG.log('[USO_CANVAS] syncMarkMode: activeImageIndex=', activeImageIndex, 'canMark=', isEditableImage);
    
    const markers = getMarkersForCurrentImage();
    markers.forEach(function(o){
      o.selectable = isEditableImage;
      o.evented = isEditableImage;
      o.hasBorders = isEditableImage;
      o.hasControls = isEditableImage && markingMode;
      o.lockMovementX = !isEditableImage;
      o.lockMovementY = !isEditableImage;
      
      const lockTransform = !isEditableImage;
      o.lockScalingX = lockTransform;
      o.lockScalingY = lockTransform;
      o.lockRotation = lockTransform;
      
      o.borderColor = '#2271b1';
      o.cornerColor = '#2271b1';
      o.transparentCorners = false;
      o.borderScaleFactor = 1;
      o.borderOpacityWhenMoving = 0.4;
      o.hoverCursor = isEditableImage ? 'move' : 'default';
      o.setCoords();
    });
    
    mainCanvas.isDrawingMode = (markingMode && currentShape === 'free' && isEditableImage && !midlineMode && !cropping);
    applyFreeBrush();
    mainCanvas.requestRenderAll();
  }

  function updateMarkingButton(){
    const btn = document.getElementById('mark-toggle');
    if (!btn) return;
    
    btn.setAttribute('aria-pressed', markingMode ? 'true' : 'false');
    btn.classList.toggle('primary', markingMode);
    
    DEBUG.log('[USO_CANVAS] updateMarkingButton: markingMode=', markingMode);
  }

  function getCountsForCalculation(){
    DEBUG.log('[USO_CANVAS] getCountsForCalculation() - mode:', workMode);
    
    if (workMode === MODES.PANORAMIC) {
      const firstImg = images[0];
      if (!firstImg) return {};
      const counts = countMarkersInImage(firstImg);
      DEBUG.log('[USO_CANVAS] PANORAMIC mode - using first image only:', counts);
      return counts;
    } else if (workMode === MODES.SIMPLE) {
      const upperImg = images[0];
      const lowerImg = images[1];
      
      const upperCounts = upperImg ? countMarkersInImage(upperImg) : {};
      const lowerCounts = lowerImg ? countMarkersInImage(lowerImg) : {};
      
      const combined = {};
      const allKeys = new Set([
        ...Object.keys(upperCounts),
        ...Object.keys(lowerCounts)
      ]);
      
      allKeys.forEach(key => {
        combined[key] = (upperCounts[key] || 0) + (lowerCounts[key] || 0);
      });
      
      DEBUG.log('[USO_CANVAS] SIMPLE mode - upper:', upperCounts, 'lower:', lowerCounts, 'combined:', combined);
      return combined;
    }
    
    return {};
  }

  function getJawSplitsForCalculation(){
    DEBUG.log('[USO_CANVAS] getJawSplitsForCalculation() - mode:', workMode);
    
    if (workMode === MODES.PANORAMIC) {
      const firstImg = images[0];
      if (!firstImg) return { yellow:{topUnits:0,bottomUnits:0}, white:{topUnits:0,bottomUnits:0}, violet:{topUnits:0,bottomUnits:0}, green:{topUnits:0,bottomUnits:0} };
      
      const splits = splitByJawInImage(firstImg);
      DEBUG.log('[USO_CANVAS] PANORAMIC mode - jaw splits:', splits);
      return splits;
    } else if (workMode === MODES.SIMPLE) {
      const upperImg = images[0];
      const lowerImg = images[1];
      
      const splits = {
        yellow: { topUnits: 0, bottomUnits: 0 },
        white: { topUnits: 0, bottomUnits: 0 },
        violet: { topUnits: 0, bottomUnits: 0 },
        green: { topUnits: 0, bottomUnits: 0 }
      };
      
      if (upperImg && upperImg.markers) {
        const lineTypes = ['yellow_line', 'white_line', 'violet_line', 'green_line'];
        lineTypes.forEach(lineType => {
          const colorKey = lineType.replace('_line', '');
          const hasLine = upperImg.markers.some(m => m.markerType === lineType);
          if (hasLine) splits[colorKey].topUnits = 1;
        });
      }
      
      if (lowerImg && lowerImg.markers) {
        const lineTypes = ['yellow_line', 'white_line', 'violet_line', 'green_line'];
        lineTypes.forEach(lineType => {
          const colorKey = lineType.replace('_line', '');
          const hasLine = lowerImg.markers.some(m => m.markerType === lineType);
          if (hasLine) splits[colorKey].bottomUnits = 1;
        });
      }
      
      DEBUG.log('[USO_CANVAS] SIMPLE mode - jaw splits:', splits);
      return splits;
    }
    
    return { yellow:{topUnits:0,bottomUnits:0}, white:{topUnits:0,bottomUnits:0}, violet:{topUnits:0,bottomUnits:0}, green:{topUnits:0,bottomUnits:0} };
  }

  function countBy(type){ 
    const markers = getMarkersForCurrentImage();
    return markers.filter(m => m.markerType===type).length; 
  }
  
  function splitByJaw(type){
    const mid = midlineY();
    let top=0, bottom=0;
    const markers = getMarkersForCurrentImage();
    markers.forEach(function(m){
      if (m.markerType !== type) return;
      const c = m.getCenterPoint ? m.getCenterPoint() : {x:0,y:0};
      if (c.y < mid) top++; else bottom++;
    });
    return { topUnits: top>0?1:0, bottomUnits: bottom>0?1:0 };
  }
  
  function getCounts(){
    return {
      blue_x:countBy('blue_x'), blue_dot:countBy('blue_dot'),
      ltblue_x:countBy('ltblue_x'), ltblue_dot:countBy('ltblue_dot'),
      white_dot:countBy('white_dot'), white_line:countBy('white_line'),
      yellow_line:countBy('yellow_line'), yellow_dot:countBy('yellow_dot'), yellow_oval:countBy('yellow_oval'),
      violet_x:countBy('violet_x'), violet_dot:countBy('violet_dot'), violet_line:countBy('violet_line'), violet_exc:countBy('violet_exc'), violet_oval:countBy('violet_oval'),
      green_line:countBy('green_line'), green_dot:countBy('green_dot'), green_q:countBy('green_q'), green_oval:countBy('green_oval'), green_exc:countBy('green_exc'),
      black_x:countBy('black_x'), black_dot:countBy('black_dot'), black_exc:countBy('black_exc'),
      red_dot:countBy('red_dot'), red_q:countBy('red_q'), red_oval:countBy('red_oval'), red_exc:countBy('red_exc')
    };
  }
  
  function getJawSplits(){
    return {
      yellow: splitByJaw('yellow_line'),
      white:  splitByJaw('white_line'),
      violet: splitByJaw('violet_line'),
      green:  splitByJaw('green_line')
    };
  }

  function createImageData(type = 'panoramic') {
    return {
      id: Date.now() + Math.random(),
      imageUrl: null,
      type: type,
      description: 'Снимок',
      markers: [],
      bgImg: null,
      canDraw: true,
      canMark: false,
      serialized: null,
      jaw: null,
      scale: 1,
      targetW: 0,
      targetH: 0
    };
  }

  function setWorkMode(mode) {
    if (!Object.values(MODES).includes(mode)) {
      console.warn('[USO] Invalid work mode:', mode, 'Using PANORAMIC');
      mode = MODES.PANORAMIC;
    }
    workMode = mode;
    images = [];
    activeImageIndex = 0;
    canvases = {};
    DEBUG.log('[USO_CANVAS] Work mode set to:', mode);
  }

  function getWorkMode() {
    return workMode;
  }

  function addImage(imageUrl, description = 'Снимок', jaw = null) {
    const imgData = createImageData(workMode);
    imgData.imageUrl = imageUrl;
    imgData.description = description;
    imgData.jaw = jaw;

    if (workMode === MODES.PANORAMIC) {
      // ✅ ИСПРАВЛЕНО: В панорамном режиме - первые 3 снимка могут иметь метки
      imgData.canMark = (images.length < 3);
      imgData.canDraw = true;
      imgData.description = `Панорамный снимок ${images.length + 1}`;
      if (images.length > 0) {
        imgData.description += images.length === 1 ? ' (2-й)' : images.length === 2 ? ' (3-й)' : ' (доп.)';
      }
    } else if (workMode === MODES.SIMPLE) {
      // ✅ ИСПРАВЛЕНО: В простом режиме - первые 3 снимка могут иметь метки
      if (images.length === 0) {
        imgData.canMark = true;
        imgData.canDraw = true;
        imgData.jaw = 'upper';
        imgData.description = '👆 Верхняя челюсть';
      } else if (images.length === 1) {
        imgData.canMark = true;
        imgData.canDraw = true;
        imgData.jaw = 'lower';
        imgData.description = '👇 Нижняя челюсть';
      } else if (images.length === 2) {
        // ✅ НОВОЕ: Третий снимок тоже может иметь метки
        imgData.canMark = true;
        imgData.canDraw = true;
        imgData.jaw = null;
        imgData.description = '📎 Доп. снимок 1';
      } else {
        // ✅ Остальные снимки - только рисование
        imgData.canMark = false;
        imgData.canDraw = true;
        imgData.jaw = null;
        imgData.description = `📎 Доп. снимок ${images.length - 1}`;
      }
    }

    images.push(imgData);
    DEBUG.log('[USO_CANVAS] Image added:', imgData.description, 'canMark:', imgData.canMark, 'Total:', images.length);
    return imgData;
  }

  // Функция удаления изображения
  function removeImage(index) {
    if (index < 0 || index >= images.length) {
      console.warn('[USO_CANVAS] Invalid image index for removal:', index);
      return;
    }

    // Запрашиваем подтверждение
    const imgDesc = images[index].description;
    if (!confirm(`Удалить снимок "${imgDesc}"?\n\nВсе метки и аннотации будут потеряны.`)) {
      return;
    }

    DEBUG.log('[USO_CANVAS] Removing image:', index, 'description:', imgDesc);

    // Удаляем canvas элемент из DOM
    const canvas = canvases[index];
    if (canvas && canvas.getElement) {
      const canvasEl = canvas.getElement();
      if (canvasEl && canvasEl.parentNode) {
        canvasEl.parentNode.removeChild(canvasEl);
      }
      // Очищаем canvas
      canvas.dispose();
    }

    // Удаляем из массивов
    images.splice(index, 1);
    delete canvases[index];

    // Пересчитываем индексы в canvases
    const newCanvases = {};
    Object.keys(canvases).forEach(function(key) {
      const numKey = parseInt(key);
      if (numKey > index) {
        newCanvases[numKey - 1] = canvases[key];
      } else if (numKey < index) {
        newCanvases[numKey] = canvases[key];
      }
    });
    canvases = newCanvases;

    // Обновляем activeImageIndex
    if (images.length === 0) {
      activeImageIndex = -1;
      mainCanvas = null;
      DEBUG.log('[USO_CANVAS] All images removed');
    } else {
      // Если удалили активное изображение, переключаемся на предыдущее или первое
      if (activeImageIndex >= images.length) {
        activeImageIndex = images.length - 1;
      }
      switchImage(activeImageIndex);
    }

    // Обновляем навигацию
    updateImageNavigation();

    // Сохраняем состояние
    if (typeof saveState === 'function') {
      saveState();
    }

    DEBUG.log('[USO_CANVAS] Image removed. Remaining images:', images.length);
  }

  // ✅ ПОЛНОСТЬЮ ПЕРЕПИСАНА: Переключение между canvas элементами
  function switchImage(index) {
    if (index < 0 || index >= images.length) {
      console.warn('[USO_CANVAS] Invalid image index:', index);
      return;
    }

    DEBUG.log('[USO_CANVAS] Switching to image:', index, 'description:', images[index].description);

    // ✅ НОВОЕ: Скрываем все canvas
    Object.keys(canvases).forEach(function(key) {
      const canvas = canvases[key];
      if (canvas && canvas.getElement) {
        canvas.getElement().style.display = 'none';
      }
    });

    activeImageIndex = index;
    const imgData = images[index];
    markingMode = imgData.canMark;

    // ✅ НОВОЕ: Проверяем, существует ли canvas для этого изображения
    if (!canvases[index]) {
      DEBUG.log('[USO_CANVAS] Creating new canvas for image:', index);

      // Создаем новый canvas элемент
      const canvasEl = createCanvasElement(index);
      if (!canvasEl) {
        console.error('[USO_CANVAS] Failed to create canvas element');
        return;
      }

      // Создаем fabric.Canvas
      const fabricCanvas = new fabric.Canvas(canvasEl, {
        selection: true,
        preserveObjectStacking: true,
        renderOnAddRemove: false
      });

      canvases[index] = fabricCanvas;

      // Копируем настройки кисти
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      applyFreeBrushTo(fabricCanvas);

      DEBUG.log('[USO_CANVAS] New canvas created:', canvasEl.id);
    }

    // ✅ НОВОЕ: Переключаемся на нужный canvas
    mainCanvas = canvases[index];
    mainCanvas.getElement().style.display = 'block';

    DEBUG.log('[USO_CANVAS] Switched to canvas:', index, 'element:', mainCanvas.getElement().id);

    // Если изображение уже загружено, просто показываем
    if (imgData.bgImg) {
      DEBUG.log('[USO_CANVAS] Image already loaded, showing existing canvas');

      mainCanvas.isDrawingMode = (imgData.canDraw && currentShape === 'free' && markingMode);

      syncMarkMode();
      updateMarkingButton();
      ensureMidline();

      mainCanvas.requestRenderAll();
      updateImageNavigation();
      DEBUG.log('[USO_CANVAS] Image switched successfully (cached)');
      return;
    }

    // ✅ Загружаем изображение в canvas (только если еще не загружено)
    if (imgData.imageUrl) {
      fabric.Image.fromURL(imgData.imageUrl, function(fabricImg) {
        if (!fabricImg) {
          console.error('[USO] Failed to create fabric image');
          return;
        }

        fabricImg.set({ selectable:false, evented:false });
        imgData.bgImg = fabricImg;

        const wrap = document.getElementById('uso-canvas-container');
        const innerW = Math.max(320, wrap.clientWidth || 320);
        const innerH0 = wrap.clientHeight || 0;
        const useH   = innerH0 > 0 ? innerH0 : getAvailCanvasHeight(wrap);

        const source = (typeof fabricImg.getElement === 'function') ? fabricImg.getElement() : fabricImg._element;
        const natW = source.naturalWidth || source.width;
        const natH = source.naturalHeight || source.height;

        const scaleW = innerW / natW;
        const scaleH = useH  / natH;
        let scale    = Math.min(scaleW, scaleH);
        if (!isFinite(scale) || scale <= 0) scale = scaleW || 1;

        const targetW = Math.round(natW * scale);
        const targetH = Math.round(natH * scale);

        imgData.scale = scale;
        imgData.targetW = targetW;
        imgData.targetH = targetH;

        const vpt = [1,0,0,1,0,0];
        mainCanvas.setViewportTransform(vpt);
        mainCanvas.setZoom(1);

        fabricImg.set({
          left:0,
          top:0,
          scaleX: scale,
          scaleY: scale,
          selectable:false,
          evented:false,
          angle:0
        });

        mainCanvas.setWidth(targetW);
        mainCanvas.setHeight(targetH);

        mainCanvas.add(fabricImg);
        mainCanvas.sendToBack(fabricImg);

        // ✅ Загружаем метки если есть
        if (imgData.markers && Array.isArray(imgData.markers)) {
          imgData.markers.forEach(m => {
            mainCanvas.add(m);
          });
          DEBUG.log('[USO_CANVAS] Loaded', imgData.markers.length, 'markers for image', index);
        }

        mainCanvas.isDrawingMode = (imgData.canDraw && currentShape === 'free' && markingMode);

        DEBUG.log('[USO_CANVAS] Image', index, '- markingMode:', markingMode, 'drawingMode:', mainCanvas.isDrawingMode);

        syncMarkMode();
        updateMarkingButton();
        ensureMidline();

        mainCanvas.requestRenderAll();
        updateImageNavigation();
        DEBUG.log('[USO_CANVAS] Image switched successfully');
      }, { crossOrigin: 'anonymous' });
    }
  }

  function updateImageNavigation() {
    const nav = document.getElementById('uso-images-nav');
    if (!nav) return;

    nav.innerHTML = '';
    nav.setAttribute('data-tab-count', images.length);

    images.forEach((img, idx) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (idx === activeImageIndex ? ' active' : '');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', idx === activeImageIndex ? 'true' : 'false');
      tab.setAttribute('data-img-id', idx);

      // Создаем label для текста вкладки
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = img.description;
      label.onclick = () => switchImage(idx);
      tab.appendChild(label);

      // Создаем кнопку закрытия
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Удалить снимок';
      closeBtn.onclick = (e) => {
        e.stopPropagation(); // Предотвращаем переключение на вкладку
        removeImage(idx);
      };
      tab.appendChild(closeBtn);

      nav.appendChild(tab);
    });

    DEBUG.log('[USO_CANVAS] Navigation updated, images:', images.length);
  }

  function getCurrentImage() {
    return images[activeImageIndex] || null;
  }

  // ✅ ИСПРАВЛЕННАЯ функция serialize
  // ✅ Вспомогательная функция для сериализации меток одного изображения
  function serializeImageMarkers(imgData, canvasWidth, canvasHeight) {
    if (!imgData || !imgData.markers) return [];

    const bgImg = imgData.bgImg;
    let origW = canvasWidth;
    let origH = canvasHeight;

    if (bgImg) {
      const imgEl = (typeof bgImg.getElement === 'function') ? bgImg.getElement() : bgImg._element;
      if (imgEl) {
        origW = imgEl.naturalWidth || imgEl.width || canvasWidth;
        origH = imgEl.naturalHeight || imgEl.height || canvasHeight;
      }
    }

    // ✅ Вычисляем scale (canvas → original)
    const scaleToOrig = origW / canvasWidth;

    const items = imgData.markers.map(function(obj){
      const t = detectShape(obj);

      if (t==='point'){
        const c = obj.getCenterPoint();
        return {
          v:2, t:'point', m:obj.markerType,
          cx: c.x * scaleToOrig,
          cy: c.y * scaleToOrig,
          radius: (obj.radius || 4) * scaleToOrig,
          sz:(obj._lastSizeVal||1)
        };
      }

      if (t==='cross'){
        const c = obj.getCenterPoint();
        return {
          v:2, t:'cross', m:obj.markerType,
          cx: c.x * scaleToOrig,
          cy: c.y * scaleToOrig,
          width: (obj.width || 20) * scaleToOrig,
          height: (obj.height || 20) * scaleToOrig,
          strokeWidth: (obj._objects && obj._objects[0] ? obj._objects[0].strokeWidth : 2) * scaleToOrig,
          ang:(obj.angle||0),
          sz:(obj._lastSizeVal||1)
        };
      }

      if (t==='line'){
        return {
          v:2, t:'line', m:obj.markerType,
          x1: obj.x1 * scaleToOrig,
          y1: obj.y1 * scaleToOrig,
          x2: obj.x2 * scaleToOrig,
          y2: obj.y2 * scaleToOrig,
          strokeWidth: (obj.strokeWidth || 3) * scaleToOrig,
          ang:(obj.angle||0),
          sz:(obj._lastSizeVal||1)
        };
      }

      if (t==='oval'){
        const actualRx = (obj.rx || 0) * (obj.scaleX || 1);
        const actualRy = (obj.ry || 0) * (obj.scaleY || 1);
        const cx = (obj.left || 0) + actualRx;
        const cy = (obj.top || 0) + actualRy;

        return {
          v:2, t:'oval', m:obj.markerType,
          cx: cx * scaleToOrig,
          cy: cy * scaleToOrig,
          rx: actualRx * scaleToOrig,
          ry: actualRy * scaleToOrig,
          strokeWidth: (obj.strokeWidth || 2) * scaleToOrig,
          ang: (obj.angle || 0),
          sz: (obj._lastSizeVal || 1),
          manual: !!obj._manuallyScaled
        };
      }

      if (t==='q' || t==='exc'){
        const c = obj.getCenterPoint();
        return {
          v:2, t:t, m:obj.markerType,
          cx: c.x * scaleToOrig,
          cy: c.y * scaleToOrig,
          fontSize: (obj.fontSize || 16) * scaleToOrig,
          ang:(obj.angle||0),
          sz:(obj._lastSizeVal||1)
        };
      }

      if (t==='free'){
        return {
          v:2, t:'free', m:'free',
          path: obj.path,
          left: (obj.left||0) * scaleToOrig,
          top: (obj.top||0) * scaleToOrig,
          scaleX: (obj.scaleX || 1) * scaleToOrig,
          scaleY: (obj.scaleY || 1) * scaleToOrig,
          stroke: obj.stroke||'#000',
          strokeWidth: (obj.strokeWidth||3) * scaleToOrig,
          strokeUniform: !!obj.strokeUniform,
          sz:(obj._lastSizeVal||1)
        };
      }

      return null;
    }).filter(Boolean);

    return {
      items: items,
      meta: {
        w: origW,
        h: origH
      }
    };
  }

  // ✅ ИСПРАВЛЕННАЯ функция serialize - теперь сохраняет метки ВСЕХ изображений
  function serialize(){
    if (!mainCanvas) return { v:3, images:[], activeImageIndex: 0, workMode: workMode };

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();

    DEBUG.log('[USO_CANVAS] serialize() - saving ALL images, count:', images.length);

    // ✅ Сериализуем ВСЕ изображения с их метками
    const serializedImages = images.map(function(imgData, idx) {
      const markerData = serializeImageMarkers(imgData, w, h);

      DEBUG.log('[USO_CANVAS] serialize() - image', idx, ':', imgData.description,
                  '- markers:', markerData.items.length);

      return {
        id: imgData.id,
        imageUrl: imgData.imageUrl,
        description: imgData.description,
        jaw: imgData.jaw,
        canMark: imgData.canMark,
        canDraw: imgData.canDraw,
        type: imgData.type,
        items: markerData.items,
        meta: markerData.meta
      };
    });

    // ✅ Сохраняем midline от текущего активного изображения
    const currentMeta = serializedImages[activeImageIndex]?.meta || {};
    currentMeta.mid = midlineY() / h;

    const result = {
      v: 3,  // ✅ Новая версия формата с поддержкой множественных изображений
      images: serializedImages,
      activeImageIndex: activeImageIndex,
      workMode: workMode
    };

    DEBUG.log('[USO_CANVAS] serialize() v3 - saved', images.length, 'images');

    return result;
  }

  // ✅ Вспомогательная функция для создания маркера из сериализованных данных
  function createMarkerFromData(it, scaleToCanvas, canvasHeight) {
    let obj = null;

    if (it.t === 'point'){
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const radius = (it.radius || 4) * scaleToCanvas;

      obj = new fabric.Circle({
        left: cx - radius,
        top: cy - radius,
        radius: radius,
        fill: colorMap[it.m] || '#1565FF',
        stroke: (it.m === 'white_dot') ? '#000' : 'transparent',
        strokeWidth: (it.m === 'white_dot') ? 1 : 0,
        originX:'left',
        originY:'top',
        selectable:true,
        evented:true
      });

      obj.set('markerType', it.m);
      obj._norm = { rN: radius / canvasHeight, factor: it.sz || 1 };
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'cross'){
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const width = (it.width || 20) * scaleToCanvas;
      const height = (it.height || 20) * scaleToCanvas;
      const strokeWidth = (it.strokeWidth || 2) * scaleToCanvas;

      const l1 = new fabric.Line([-width/2, -height/2, width/2, height/2], {
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: strokeWidth,
        strokeUniform: true
      });
      const l2 = new fabric.Line([-width/2, height/2, width/2, -height/2], {
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: strokeWidth,
        strokeUniform: true
      });

      obj = new fabric.Group([l1, l2], {
        left: cx,
        top: cy,
        originX:'center',
        originY:'center',
        selectable:true,
        evented:true
      });

      if (it.ang) obj.set({angle:it.ang});
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'line'){
      obj = new fabric.Line([
        it.x1 * scaleToCanvas,
        it.y1 * scaleToCanvas,
        it.x2 * scaleToCanvas,
        it.y2 * scaleToCanvas
      ], {
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: (it.strokeWidth || 3) * scaleToCanvas,
        strokeUniform: true,
        selectable: true,
        evented: true,
        originX:'left',
        originY:'top'
      });

      if (it.ang) obj.set({angle:it.ang});
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'oval'){
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const rx = (it.rx || 10) * scaleToCanvas;
      const ry = (it.ry || 14) * scaleToCanvas;

      obj = new fabric.Ellipse({
        left: cx - rx,
        top: cy - ry,
        rx,
        ry,
        fill:'transparent',
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: (it.strokeWidth || 2) * scaleToCanvas,
        strokeUniform: true,
        originX:'left',
        originY:'top',
        selectable:true,
        evented:true
      });

      if (it.ang) obj.set({angle:it.ang});
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
      obj._manuallyScaled = !!it.manual;
    }
    else if (it.t === 'q' || it.t === 'exc'){
      const ch = (it.t === 'q') ? '?' : '!';
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const fontSize = (it.fontSize || 16) * scaleToCanvas;

      obj = new fabric.Text(ch, {
        left: cx,
        top: cy,
        originX:'center',
        originY:'center',
        fontSize: fontSize,
        fontWeight:'bold',
        fill: colorMap[it.m] || '#1565FF',
        selectable:true,
        evented:true,
        textBaseline: 'middle'
      });

      if (it.ang) obj.set({angle:it.ang});
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'free' && Array.isArray(it.path)){
      obj = new fabric.Path(it.path, {
        left: (it.left||0) * scaleToCanvas,
        top: (it.top||0) * scaleToCanvas,
        scaleX: (it.scaleX || 1) * scaleToCanvas,
        scaleY: (it.scaleY || 1) * scaleToCanvas,
        fill:'transparent',
        stroke:it.stroke||'#000',
        strokeWidth:(it.strokeWidth||3) * scaleToCanvas,
        strokeUniform:true,
        selectable:true,
        evented:true,
        originX:'left',
        originY:'top'
      });

      obj.set('markerType', 'free');
      obj._lastSizeVal = it.sz || 1;
    }

    return obj;
  }

  // ✅ Вспомогательная функция для загрузки меток в конкретное изображение
  function loadMarkersToImage(imgData, items, meta, canvasWidth, canvasHeight) {
    if (!imgData || !imgData.markers || !items) return 0;

    const origW = (meta && meta.w) ? meta.w : canvasWidth;
    const origH = (meta && meta.h) ? meta.h : canvasHeight;
    const scaleToCanvas = canvasWidth / origW;

    let loadedCount = 0;

    items.forEach(function(it){
      const obj = createMarkerFromData(it, scaleToCanvas, canvasHeight);
      if (obj) {
        imgData.markers.push(obj);
        loadedCount++;
      }
    });

    return loadedCount;
  }

  // ✅ ПОЛНОСТЬЮ ПЕРЕПИСАННАЯ функция load с поддержкой v2 и v3
  function load(data){
    if (!data || !mainCanvas) return;

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();

    // ✅ Проверяем версию формата
    if (data.v === 3 && Array.isArray(data.images)) {
      // ✅ НОВЫЙ ФОРМАТ v:3 - множественные изображения
      DEBUG.log('[USO_CANVAS] load() v3 - loading', data.images.length, 'images');

      data.images.forEach(function(imgDataSerialized, idx) {
        const imgData = images[idx];
        if (!imgData) {
          console.warn('[USO_CANVAS] load() v3 - image index', idx, 'not found in current images');
          return;
        }

        // Очищаем старые маркеры этого изображения с canvas (если это активное изображение)
        if (idx === activeImageIndex) {
          imgData.markers.forEach(m => mainCanvas.remove(m));
        }
        imgData.markers.length = 0;

        // Загружаем метки для этого изображения
        const loadedCount = loadMarkersToImage(
          imgData,
          imgDataSerialized.items || [],
          imgDataSerialized.meta,
          w,
          h
        );

        DEBUG.log('[USO_CANVAS] load() v3 - image', idx, ':', imgData.description,
                    '- loaded', loadedCount, 'markers');

        // Если это активное изображение, добавляем метки на canvas
        if (idx === activeImageIndex) {
          imgData.markers.forEach(m => mainCanvas.add(m));
        }
      });

      mainCanvas.requestRenderAll();
      DEBUG.log('[USO_CANVAS] load() v3 completed - all images loaded');

    } else if (Array.isArray(data.items)) {
      // ✅ СТАРЫЙ ФОРМАТ v:2 (или без версии) - обратная совместимость
      DEBUG.log('[USO_CANVAS] load() v2 (legacy) - loading to current image');

      const origW = (data.meta && data.meta.w) ? data.meta.w : w;
      const origH = (data.meta && data.meta.h) ? data.meta.h : h;
      const scaleToCanvas = w / origW;

      DEBUG.log('[USO_CANVAS] load() v2 - canvas:', w, 'x', h,
                  'original:', origW, 'x', origH, 'scale:', scaleToCanvas);

      const markers = getMarkersForCurrentImage();

      // Очищаем старые маркеры
      markers.forEach(m => mainCanvas.remove(m));
      markers.length = 0;

      // Загружаем метки в текущее изображение
      data.items.forEach(function(it){
        const obj = createMarkerFromData(it, scaleToCanvas, h);
        if (obj){
          mainCanvas.add(obj);
          markers.push(obj);
        }
      });

      mainCanvas.requestRenderAll();
      DEBUG.log('[USO_CANVAS] load() v2 completed, loaded', markers.length, 'markers');

    } else {
      console.warn('[USO_CANVAS] load() - unknown data format:', data);
    }
  }
  
  function detectShape(obj){
    if (obj.type==='circle') return 'point';
    if (obj.type==='group') return 'cross';
    if (obj.type==='line') return 'line';
    if (obj.type==='ellipse') return 'oval';
    if (obj.type==='text'){ const ch=(obj.text||'').trim(); if (ch==='?') return 'q'; if (ch==='!') return 'exc'; }
    if (obj.type==='path') return 'free';
    return 'point';
  }
  
  function resetMarkers(){
    if (!mainCanvas) return;
    const markers = getMarkersForCurrentImage();
    markers.forEach(function(m){ mainCanvas.remove(m); });
    markers.length = 0;
    drawState=null;
    mainCanvas.requestRenderAll();
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

  function fitImageToCanvas(img, keepObjects){
    if(!img || !mainCanvas) return;
    const wrap = document.getElementById('uso-canvas-container');
    const innerW = Math.max(320, wrap.clientWidth || 320);
    const innerH0 = wrap.clientHeight || 0;
    const useH   = innerH0 > 0 ? innerH0 : getAvailCanvasHeight(wrap);

    const source = (typeof img.getElement === 'function') ? img.getElement() : img._element;
    const natW = source.naturalWidth || source.width;
    const natH = source.naturalHeight || source.height;
    if (!natW || !natH) return;

    const scaleW = innerW / natW;
    const scaleH = useH  / natH;
    let scale    = Math.min(scaleW, scaleH);
    if (!isFinite(scale) || scale <= 0) scale = scaleW || 1;

    const targetW = Math.round(natW * scale);
    const targetH = Math.round(natH * scale);

    const vpt = [1,0,0,1,0,0];
    mainCanvas.setViewportTransform(vpt); 
    mainCanvas.setZoom(1);
    mainCanvas.clear();

    img.set({ 
      left:0, 
      top:0, 
      scaleX: scale,
      scaleY: scale,
      selectable:false, 
      evented:false, 
      angle:0 
    });
    
    mainCanvas.setWidth(targetW);
    mainCanvas.setHeight(targetH);

    mainCanvas.add(img);
    mainCanvas.sendToBack(img);

    if (keepObjects){
      const markers = getMarkersForCurrentImage();
      markers.forEach(function(o){ mainCanvas.add(o); });
    }

    ensureMidline(true);
    applyFreeBrush();
    rescaleAllMarkers();
    mainCanvas.requestRenderAll();
  }

  function getAvailCanvasHeight(wrap){
    const vpH = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
    const rect = wrap.getBoundingClientRect();
    const paddingBottom = 16;
    const free = vpH - rect.top - paddingBottom;
    return Math.max(240, free);
  }

  function resizeToContainer(){
    if (!mainCanvas) return;
    try {
      const snapshot = serialize();
      
      if (!snapshot || typeof snapshot !== 'object') {
        console.warn('[USO] Invalid snapshot, skipping resize');
        const imgData = images[activeImageIndex];
        if (imgData && imgData.bgImg) fitImageToCanvas(imgData.bgImg, false);
        applyFreeBrush();
        return;
      }
      
      if (!Array.isArray(snapshot.items)) {
        console.warn('[USO] Snapshot has no items array');
        const imgData = images[activeImageIndex];
        if (imgData && imgData.bgImg) fitImageToCanvas(imgData.bgImg, false);
        applyFreeBrush();
        return;
      }
      
      const imgData = images[activeImageIndex];
      if (imgData && imgData.bgImg) fitImageToCanvas(imgData.bgImg, false);
      load(snapshot);
      applyFreeBrush();
    } catch(err) {
      console.error('[USO] Resize error:', err);
      try {
        const imgData = images[activeImageIndex];
        if (imgData && imgData.bgImg) fitImageToCanvas(imgData.bgImg, false);
        applyFreeBrush();
      } catch(e) {
        console.error('[USO] Failed to recover from resize error:', e);
      }
    }
  }
  
  function resetView(){ 
    if (!mainCanvas) return;
    const imgData = images[activeImageIndex];
    if (imgData && imgData.bgImg) fitImageToCanvas(imgData.bgImg, true); 
    mainCanvas.requestRenderAll(); 
  }

  function canvasImage(){
    if (!mainCanvas) return '';
    const was = midline ? midline.visible !== false : null;
    if (midline) midline.set('visible', false);
    const url = mainCanvas.toDataURL('image/png');
    if (midline) midline.set('visible', was);
    return url;
  }
  
  function hasImage(){ 
    return activeImageIndex >= 0 && activeImageIndex < images.length && !!images[activeImageIndex].bgImg;
  }

  // ✅ ИСПРАВЛЕННАЯ функция renderImageWithMarkersToDataUrl
// === ЗАМЕНИТЕ ЭТУ ФУНКЦИЮ ЦЕЛИКОМ В uso.canvas.js ===
async function renderImageWithMarkersToDataUrl(imgIndex) {
  return new Promise(function(resolve) {
    try {
      if (imgIndex < 0 || imgIndex >= images.length) {
        console.error('[USO_CANVAS] Invalid image index for rendering:', imgIndex);
        resolve(null);
        return;
      }

      const imgData = images[imgIndex];
      const srcMarkers = Array.isArray(imgData.markers) ? imgData.markers : [];
      DEBUG.log('[USO_CANVAS] Rendering image', imgIndex + 1, ':', imgData.description, 'markers:', srcMarkers.length);

      fabric.Image.fromURL(imgData.imageUrl, function(fabricImg) {
        if (!fabricImg) {
          console.error('[USO_CANVAS] Failed to load image for rendering:', imgIndex);
          resolve(null);
          return;
        }

        try {
          // 1) Нативные размеры исходного изображения
          const imgEl = (typeof fabricImg.getElement === 'function') ? fabricImg.getElement() : fabricImg._element;
          const natW = imgEl.naturalWidth || imgEl.width;
          const natH = imgEl.naturalHeight || imgEl.height;
          if (!natW || !natH) {
            console.error('[USO_CANVAS] Invalid image dimensions:', natW, 'x', natH);
            resolve(null);
            return;
          }

          // 2) Временный Canvas 1:1 под оригинал
          const tempCanvas = new fabric.Canvas(null, {
            selection: false,
            preserveObjectStacking: true,
            renderOnAddRemove: false
          });
          tempCanvas.setWidth(natW);
          tempCanvas.setHeight(natH);

          // 3) Фон: снимок без масштабирования
          fabricImg.set({ left: 0, top: 0, scaleX: 1, scaleY: 1, selectable: false, evented: false });
          tempCanvas.add(fabricImg);
          tempCanvas.sendToBack(fabricImg);

          // 4) Коэффициент перевода координат «экран → оригинал»
          //    Используем ТЕКУЩИЙ размер mainCanvas, т.к. все изображения рисуются на нем
          const currentCanvasW = mainCanvas ? mainCanvas.getWidth() : natW;
          const currentCanvasH = mainCanvas ? mainCanvas.getHeight() : natH;

          // Если изображение никогда не было активным, используем его собственный размер
          // Иначе используем размер canvas
          let referenceW = currentCanvasW;
          if (!imgData.targetW || imgData.targetW === 0) {
            // Изображение не было отображено, вычисляем как оно было бы отображено
            const wrap = document.getElementById('uso-canvas-container');
            const innerW = wrap ? Math.max(320, wrap.clientWidth || 320) : 800;
            const scaleToFit = innerW / natW;
            referenceW = Math.round(natW * scaleToFit);
          }

          const k = natW / referenceW; // умножаем ВСЕ координаты/размеры/толщины

          DEBUG.log('[USO_CANVAS] Rendering scale:', imgIndex,
                    'natW:', natW, 'referenceW:', referenceW, 'k:', k.toFixed(3));

          function add(obj) {
            if (!obj) return;
            obj.selectable = false;
            obj.evented = false;
            try { obj.setCoords(); } catch(_){}
            tempCanvas.add(obj);
          }

          // 5) Пересобираем каждый маркер «вручную» в оригинальных координатах
          srcMarkers.forEach(function(m) {
            try {
              const mt = m.markerType || '';

              function inferShape(mt) {
                if (/_line$/.test(mt)) return 'line';
                if (/_oval$/.test(mt)) return 'oval';
                if (/_x$/.test(mt))    return 'cross';
                if (/_q$/.test(mt))    return 'q';
                if (/_exc$/.test(mt))  return 'exc';
                if (mt === 'free')     return 'free';
                if (m.type === 'path')    return 'free';
                if (m.type === 'group')   return 'cross';
                if (m.type === 'ellipse') return 'oval';
                if (m.type === 'line')    return 'line';
                if (m.type === 'text')    return (m.text === '?' ? 'q' : (m.text === '!' ? 'exc' : 'text'));
                return 'point';
              }

              const shape = inferShape(mt);

              if (shape === 'point' && m.type === 'circle') {
                const c = m.getCenterPoint();
                const radius = (m.radius || 4) * k;
                const fill = m.fill || colorMap[mt] || '#1565FF';
                const stroke = (mt === 'white_dot') ? '#000' : (m.stroke || 'transparent');
                const strokeWidth = (mt === 'white_dot') ? 1 : 0;

                add(new fabric.Circle({
                  left: c.x * k - radius,
                  top:  c.y * k - radius,
                  radius,
                  fill,
                  stroke,
                  strokeWidth,
                  originX:'left', originY:'top',
                  strokeUniform: true,
                  markerType: mt
                }));
                return;
              }

              if (shape === 'cross' && m.type === 'group') {
                const w = m.getScaledWidth() * k;
                const h = m.getScaledHeight() * k;
                const c = m.getCenterPoint();
                const stroke = (m._objects?.[0]?.stroke) || colorMap[mt] || '#1565FF';
                const sw = Math.max(2, (m._objects?.[0]?.strokeWidth || 3) * k);

                const l1 = new fabric.Line([-w/2, -h/2,  w/2,  h/2], { stroke, strokeWidth: sw, strokeUniform: true });
                const l2 = new fabric.Line([-w/2,  h/2,  w/2, -h/2], { stroke, strokeWidth: sw, strokeUniform: true });
                const grp = new fabric.Group([l1, l2], { left: c.x * k, top: c.y * k, originX:'center', originY:'center' });
                if (m.angle) grp.set({ angle: m.angle });
                grp.set('markerType', mt);
                add(grp);
                return;
              }

              if (shape === 'line' && m.type === 'line') {
                const stroke = m.stroke || colorMap[mt] || '#1565FF';
                const sw = Math.max(2, (m.strokeWidth || 3) * k);
                const ln = new fabric.Line([m.x1 * k, m.y1 * k, m.x2 * k, m.y2 * k], {
                  stroke, strokeWidth: sw, strokeUniform: true, originX:'left', originY:'top'
                });
                if (m.angle) ln.set({ angle: m.angle });
                ln.set('markerType', mt);
                add(ln);
                return;
              }

              if (shape === 'oval' && m.type === 'ellipse') {
                const actualRx = (m.rx || 0) * (m.scaleX || 1);
                const actualRy = (m.ry || 0) * (m.scaleY || 1);
                const cx = (m.left || 0) + actualRx;
                const cy = (m.top  || 0) + actualRy;

                const rx = actualRx * k;
                const ry = actualRy * k;
                const left = cx * k - rx;
                const top  = cy * k - ry;

                const stroke = m.stroke || colorMap[mt] || '#1565FF';
                const sw = Math.max(2, (m.strokeWidth || 2) * k);

                const el = new fabric.Ellipse({
                  left, top, rx, ry,
                  fill:'transparent', stroke, strokeWidth: sw, strokeUniform: true,
                  originX:'left', originY:'top'
                });
                if (m.angle) el.set({ angle: m.angle });
                el.set('markerType', mt);
                add(el);
                return;
              }

              if ((shape === 'q' || shape === 'exc') && m.type === 'text') {
                const ch = (shape === 'q') ? '?' : '!';
                const c = m.getCenterPoint();
                const fs = Math.max(16, (m.fontSize || 16) * k);
                const fill = m.fill || colorMap[mt] || '#1565FF';
                const txt = new fabric.Text(ch, {
                  left: c.x * k, top: c.y * k, originX:'center', originY:'center',
                  fontSize: fs, fontWeight:'bold', fill
                });
                if (m.angle) txt.set({ angle: m.angle });
                txt.set('markerType', mt);
                add(txt);
                return;
              }

              if (shape === 'free' && m.type === 'path') {
                const p = new fabric.Path(m.path, {
                  left: (m.left || 0) * k,
                  top:  (m.top  || 0) * k,
                  scaleX: (m.scaleX || 1) * k,
                  scaleY: (m.scaleY || 1) * k,
                  fill: 'transparent',
                  stroke: m.stroke || '#000',
                  strokeWidth: Math.max(2, (m.strokeWidth || 3) * k),
                  strokeUniform: true,
                  originX:'left', originY:'top'
                });
                p.set('markerType', 'free');
                add(p);
                return;
              }

              // Fallback
              if (m.getCenterPoint) {
                const c = m.getCenterPoint();
                const r = 6;
                const circle = new fabric.Circle({
                  left: c.x * k - r, top: c.y * k - r, radius: r,
                  fill: colorMap[mt] || '#1565FF', originX:'left', originY:'top', strokeUniform: true
                });
                circle.set('markerType', mt || 'blue_dot');
                add(circle);
              }
            } catch(err) {
              console.warn('[USO_CANVAS] Marker rebuild error:', err);
            }
          });

          tempCanvas.requestRenderAll();

          setTimeout(function(){
            try {
              const dataUrl = tempCanvas.toDataURL('image/png', { quality: 0.98 });
              tempCanvas.dispose();
              resolve(dataUrl);
            } catch(err) {
              console.error('[USO_CANVAS] Failed to export canvas:', err);
              tempCanvas.dispose();
              resolve(null);
            }
          }, 50);

        } catch(err) {
          console.error('[USO_CANVAS] Error in renderImageWithMarkersToDataUrl:', err);
          resolve(null);
        }
      }, { crossOrigin: 'anonymous' });

    } catch(err) {
      console.error('[USO_CANVAS] Unexpected error in renderImageWithMarkersToDataUrl:', err);
      resolve(null);
    }
  });
}

  async function getAllImagesForExport() {
    DEBUG.log('[USO_CANVAS] getAllImagesForExport() called, total images:', images.length);

    const result = [];

    try {
      for (let i = 0; i < images.length; i++) {
        DEBUG.log('[USO_CANVAS] Processing image', i + 1, 'of', images.length);

        // ✅ ИСПРАВЛЕНИЕ: Пропускаем изображения без bgImg (не загружены)
        if (!images[i].bgImg || !images[i].imageUrl) {
          DEBUG.log('[USO_CANVAS] Skipping image', i + 1, '- not loaded');
          continue;
        }

        const imageUrlWithMarkers = await renderImageWithMarkersToDataUrl(i);

        // ✅ ИСПРАВЛЕНИЕ: Пропускаем, если рендеринг не удался
        if (!imageUrlWithMarkers) {
          console.warn('[USO_CANVAS] Failed to render image', i + 1, '- skipping');
          continue;
        }

        result.push({
          index: i + 1,
          description: images[i].description,
          jaw: images[i].jaw,
          imageUrl: imageUrlWithMarkers,  // ✅ Только отрендеренное изображение
          serialized: images[i].serialized,
          workMode: workMode,
          canMark: images[i].canMark
        });

        DEBUG.log('[USO_CANVAS] Image', i + 1, 'added to export');
      }

    } catch(err) {
      console.error('[USO_CANVAS] Error during export processing:', err);
    }

    DEBUG.log('[USO_CANVAS] getAllImagesForExport() completed, returned', result.length, 'images');
    return result;
  }

  function getAllImages() {
    return images.map((img, idx) => ({
      index: idx + 1,
      description: img.description,
      jaw: img.jaw,
      imageUrl: img.imageUrl,
      serialized: img.serialized,
      workMode: workMode,
      canMark: img.canMark
    }));
  }

  function countMarkersInImage(imgData) {
    const counts = {
      blue_x: 0, blue_dot: 0,
      ltblue_x: 0, ltblue_dot: 0,
      white_dot: 0, white_line: 0,
      yellow_line: 0, yellow_dot: 0, yellow_oval: 0,
      violet_x: 0, violet_dot: 0, violet_line: 0, violet_exc: 0, violet_oval: 0,
      green_line: 0, green_dot: 0, green_q: 0, green_oval: 0, green_exc: 0,
      black_x: 0, black_dot: 0, black_exc: 0,
      red_dot: 0, red_q: 0, red_oval: 0, red_exc: 0
    };

    if (!imgData.markers) return counts;

    imgData.markers.forEach(m => {
      const mt = m.markerType;
      if (mt && counts.hasOwnProperty(mt)) {
        counts[mt]++;
      }
    });

    return counts;
  }

  function splitByJawInImage(imgData) {
    const mid = midlineY();
    const splits = {
      yellow: { topUnits: 0, bottomUnits: 0 },
      white: { topUnits: 0, bottomUnits: 0 },
      violet: { topUnits: 0, bottomUnits: 0 },
      green: { topUnits: 0, bottomUnits: 0 }
    };

    if (!imgData.markers) return splits;

    const lineTypes = {
      'yellow_line': 'yellow',
      'white_line': 'white',
      'violet_line': 'violet',
      'green_line': 'green'
    };

    imgData.markers.forEach(m => {
      const colorKey = lineTypes[m.markerType];
      if (!colorKey) return;

      const c = m.getCenterPoint ? m.getCenterPoint() : {x:0,y:0};
      if (c.y < mid) {
        splits[colorKey].topUnits = 1;
      } else {
        splits[colorKey].bottomUnits = 1;
      }
    });

    return splits;
  }

  function inferShapeFromType(mt){
    if (!mt) return 'point';
    if (/_line$/.test(mt)) return 'line';
    if (/_oval$/.test(mt)) return 'oval';
    if (/_x$/.test(mt))    return 'cross';
    if (/_q$/.test(mt))    return 'q';
    if (/_exc$/.test(mt))  return 'exc';
    if (mt === 'free')     return 'free';
    return 'point';
  }
  
  function addMarkerPublic(mt, x, y){
    if (!mainCanvas || !mt) return null;
    let obj = null;
    const shape = inferShapeFromType(String(mt));
    if (shape === 'line'){
      const sw = Math.max(2, Math.round(H() * 0.0055 * SIZE_F.line));
      const dx = Math.max(10, Math.round(H() * 0.022  * SIZE_F.line));
      const dy = Math.max(10, Math.round(H() * 0.0165 * SIZE_F.line));
      obj = createLine(x, y, x + dx, y + dy, mt, sw);
    } else if (shape === 'free'){
      return null;
    } else {
      obj = createShape(shape, x, y, mt);
    }
    if (obj){
      mainCanvas.add(obj); 
      const markers = getMarkersForCurrentImage();
      markers.push(obj);
      applySizeBySlider(obj, getSizeSliderVal());
      mainCanvas.setActiveObject(obj);
      mainCanvas.requestRenderAll();
      pushHistory && pushHistory();
    }
    return obj;
  }

  function pushHistory(){
    if (!mainCanvas || restoringHistory) return;
    try {
      const snap = serialize();
      history.push(snap);
      if (history.length > 20) history.shift();
      $('#uso-undo').prop('disabled', history.length <= 1);
    } catch(_){}
  }
  
  function undoLast(){
    if (!mainCanvas || history.length <= 1) return;
    restoringHistory = true;
    try {
      history.pop();
      const prev = history[history.length - 1];
      if (prev) {
        const imgData = images[activeImageIndex];
        if (imgData && imgData.bgImg) fitImageToCanvas(imgData.bgImg, false);
        load(prev);
        mainCanvas.discardActiveObject();
        $('#uso-del').prop('disabled', true);
      }
    } finally {
      restoringHistory = false;
      $('#uso-undo').prop('disabled', history.length <= 1);
    }
  }

  function createLine(x1, y1, x2, y2, markerTypeKey, strokeW){
    const color = colorMap[markerTypeKey] || '#1565FF';
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: color, 
      strokeWidth: strokeW || Math.max(2, Math.round(H()*0.0055*SIZE_F.line)),
      strokeUniform: true, 
      selectable: true, 
      evented: true, 
      originX:'left', 
      originY:'top', 
      perPixelTargetFind: true
    });
    line.set('markerType', markerTypeKey);
    line._norm = { strokeN: (line.strokeWidth || 3) / (H() || 1), factor: 1 };
    return line;
  }
  
  function createShape(shape, x, y, markerTypeKey){
    const h = H();
    
    if (h <= 0) {
      console.warn('[USO] Invalid canvas height:', h);
      return null;
    }
    
    const color = colorMap[markerTypeKey] || '#1565FF';
    
    try {
      if (shape === 'point'){
        const r = Math.max(4, Math.round(h * 0.011 * SIZE_F.point));
        const circle = new fabric.Circle({
          left: x - r, 
          top: y - r, 
          radius: r, 
          fill: color,
          stroke: (markerTypeKey === 'white_dot') ? '#000' : 'transparent', 
          strokeWidth: (markerTypeKey === 'white_dot') ? 1 : 0,
          originX:'left', 
          originY:'top', 
          selectable:true, 
          evented:true
        });
        circle.set('markerType', markerTypeKey);
        circle._norm = { rN: r / h, factor: 1 };
        circle._lastSizeVal = 1;
        return circle;
      }
      
      if (shape === 'cross'){
        const len = Math.max(12, Math.round(h*0.032*SIZE_F.cross));
        const sw  = Math.max(2, Math.round(h*0.0055*SIZE_F.cross));
        const l1 = new fabric.Line([-len/2, -len/2,  len/2,  len/2], { 
          stroke: color, 
          strokeWidth: sw, 
          strokeUniform: true 
        });
        const l2 = new fabric.Line([-len/2,  len/2,  len/2, -len/2], { 
          stroke: color, 
          strokeWidth: sw, 
          strokeUniform: true 
        });
        const grp = new fabric.Group([l1, l2], { 
          left: x, 
          top: y, 
          originX:'center', 
          originY:'center', 
          selectable:true, 
          evented:true 
        });
        grp.set('markerType', markerTypeKey);
        const baseW = grp.getScaledWidth() / (grp.scaleX || 1);
        grp._norm = { 
          wN: (baseW > 0 ? baseW / h : 0.032), 
          strokeN: sw / h, 
          factor: 1 
        };
        grp._lastSizeVal = 1;
        return grp;
      }
      
      if (shape === 'oval'){
        const rx = Math.max(10, Math.round(h*0.0198*SIZE_F.oval));
        const ry = Math.max(14, Math.round(h*0.0286*SIZE_F.oval));
        const sw = Math.max(2, Math.round(h*0.0055*SIZE_F.oval));
        const el = new fabric.Ellipse({
          left: x - rx, 
          top: y - ry, 
          rx, 
          ry, 
          fill:'transparent', 
          stroke: color, 
          strokeWidth: sw, 
          strokeUniform: true,
          originX:'left', 
          originY:'top', 
          selectable:true, 
          evented:true
        });
        el.set('markerType', markerTypeKey);
        el._norm = { 
          rxN: rx/h, 
          ryN: ry/h, 
          strokeN: sw/h, 
          cx:x, 
          cy:y, 
          factor:1 
        };
        el._lastSizeVal = 1;
        return el;
      }
      
      if (shape === 'q' || shape === 'exc'){
        const ch = (shape === 'q') ? '?' : '!';
        const fs = Math.max(16, Math.round(h*0.032*1.4*SIZE_F.text));
        const txt = new fabric.Text(ch, {
          left: x, 
          top: y, 
          originX:'center', 
          originY:'center', 
          fontSize: fs, 
          fontWeight:'bold', 
          fill: color, 
          selectable:true, 
          evented:true,
          textBaseline: 'middle'
        });
        txt.set('markerType', markerTypeKey);
        txt._norm = { fsN: fs/h, factor: 1 };
        txt._lastSizeVal = 1;
        return txt;
      }
      
      console.warn('[USO] Unknown shape:', shape);
      return null;
      
    } catch(err) {
      console.error('[USO] Failed to create shape:', shape, err);
      return null;
    }
  }

  function deleteSelection(){
    if (!mainCanvas) return;
    const ao = mainCanvas.getActiveObject();
    if (!ao) return;
    const markers = getMarkersForCurrentImage();
    if (ao.type === 'activeSelection' && ao._objects){
      ao._objects.forEach(function(o){ mainCanvas.remove(o); markers = markers.filter(m => m !== o); });
      mainCanvas.discardActiveObject();
    } else {
      mainCanvas.remove(ao);
      const idx = markers.indexOf(ao);
      if (idx > -1) markers.splice(idx, 1);
    }
    mainCanvas.requestRenderAll();
    $('#uso-del').prop('disabled', true);
    pushHistory();
  }

  function keepRectInBounds(rect){
    if (!mainCanvas) return;
    const w = mainCanvas.getWidth(), h = mainCanvas.getHeight();
    rect.left = clamp(rect.left, 0, Math.max(0, w - rect.getScaledWidth()));
    rect.top  = clamp(rect.top , 0, Math.max(0, h - rect.getScaledHeight()));
    rect.setCoords(); mainCanvas.requestRenderAll();
  }
  
  function applyRatioOnScale(rect){
    const ratio = cropping && cropping.ratio || 'free';
    if (ratio === 'free') return;
    const parts = ratio.split(':');
    const rw = parseFloat(parts[0]||'0'), rh = parseFloat(parts[1]||'0');
    if (!(rw>0 && rh>0)) return;
    const target = rw / rh;
    const w0 = rect.width * rect.scaleX;
    const h0 = rect.height * rect.scaleY;
    const cur = w0 / h0;
    if (Math.abs(cur - target) < 1e-3) return;
    rect.scaleY = (w0 / target) / rect.height;
  }
  
  function startCrop(ratio){
    if (!mainCanvas) return;
    const imgData = images[activeImageIndex];
    if (!imgData || !imgData.bgImg) return;
    if (cropping) cancelCrop();
    const prevMarking = markingMode;
    markingMode = false; syncMarkMode();

    const w = mainCanvas.getWidth(), h = mainCanvas.getHeight();
    const cw = Math.round(w * 0.8), ch = Math.round(h * 0.8);
    const rect = new fabric.Rect({
      left: Math.round((w - cw)/2), top: Math.round((h - ch)/2),
      width: cw, height: ch,
      fill: 'rgba(0,0,0,0.06)', stroke:'#1976d2', strokeWidth:2,
      hasBorders:true, hasControls:true, cornerColor:'#1976d2', transparentCorners:false, lockRotation:true,
      selectable:true, evented:true, objectCaching:false
    });
    rect.setControlsVisibility({ mtr:false });
    mainCanvas.add(rect); mainCanvas.bringToFront(rect); mainCanvas.setActiveObject(rect);
    cropping = { rect, ratio: ratio || 'free', _prevMarking: prevMarking };
    mainCanvas.requestRenderAll();
  }
  
  function setCropRatio(ratio){
    if (!cropping) return;
    cropping.ratio = ratio || 'free';
    if (cropping.rect){ applyRatioOnScale(cropping.rect); keepRectInBounds(cropping.rect); }
  }
  
  async function applyCrop(){
    if (!cropping || !mainCanvas) return;
    const imgData = images[activeImageIndex];
    if (!imgData || !imgData.bgImg) return;
    
    const rect = cropping.rect;
    const imgEl = (typeof imgData.bgImg.getElement==='function') ? imgData.bgImg.getElement() : imgData.bgImg._element;
    const natW = imgEl.naturalWidth || imgEl.width;
    const natH = imgEl.naturalHeight || imgEl.height;

    const sx = Math.max(0, Math.round((rect.left - (imgData.bgImg.left||0)) / (imgData.bgImg.scaleX||1)));
    const sy = Math.max(0, Math.round((rect.top  - (imgData.bgImg.top ||0)) / (imgData.bgImg.scaleY||1)));
    const sw = Math.max(1, Math.round(rect.getScaledWidth()  / (imgData.bgImg.scaleX||1)));
    const sh = Math.max(1, Math.round(rect.getScaledHeight() / (imgData.bgImg.scaleY||1)));
    const cx = clamp(sx, 0, natW-1), cy = clamp(sy, 0, natH-1);
    const cw = clamp(sw, 1, natW - cx), ch = clamp(sh, 1, natH - cy);

    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(imgEl, cx, cy, cw, ch, 0, 0, cw, ch);
    const dataUrl = c.toDataURL('image/png', 0.98);

    return new Promise(function(resolve){
      fabric.Image.fromURL(dataUrl, function(fabricImg){
        if (!fabricImg) {
          console.error('[USO] Failed to create cropped image');
          resolve();
          return;
        }
        
        fabricImg.set({ selectable:false, evented:false });
        imgData.bgImg = fabricImg;
        resetMarkers();
        fitImageToCanvas(fabricImg, false);
        mainCanvas.remove(rect);
        cropping = null;
        markingMode = false; syncMarkMode();
        
        pushHistory();

        const cont = document.getElementById('uso-canvas-container');
        if (cont) {
          cont.style.resize = 'both';
          cont.style.overflow = 'auto';
          cont.style.minWidth = cont.style.minWidth || '320px';
          cont.style.minHeight = cont.style.minHeight || '240px';
        }

        resolve();
      }, { crossOrigin: 'anonymous' });
    });
  }
  
  function cancelCrop(){
    if (!cropping) return;
    if (cropping.rect && mainCanvas) mainCanvas.remove(cropping.rect);
    const prev = cropping._prevMarking;
    cropping = null;
    markingMode = !!prev; syncMarkMode();
  }

  // ===== ЭКСПОРТ =====
  w.USO_CANVAS = {
    MODES,
    initCanvas,
    getCounts,
    getCountsForCalculation,
    getJawSplitsForCalculation,
    getJawSplits,
    serialize,
    load,
    resetMarkers,
    canvasImage,
    hasImage,
    addMarker: addMarkerPublic,
    startCrop, applyCrop, cancelCrop, setCropRatio,
    setWorkMode,
    getWorkMode,
    addImage,
    removeImage,
    switchImage,
    updateImageNavigation,
    getCurrentImage,
    getAllImages,
    renderImageWithMarkersToDataUrl,
    getAllImagesForExport
  };

  // ✅ Экспортируем DEBUG для других модулей
  U.DEBUG_CANVAS = DEBUG;

  DEBUG.log('[USO_CANVAS] Module loaded. MODES:', MODES);

})(window, jQuery);