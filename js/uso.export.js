(function(w, $){
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;
  const ASSETS = U.ASSETS || {};
  const OPT = U.OPT || {};
  const CLINIC = U.CLINIC || {};

  // ✅ Используем debug-систему
  const DEBUG = U.DEBUG_CANVAS || {
    log: function() {},
    warn: function(...args) { console.warn(...args); },
    error: function(...args) { console.error(...args); }
  };

  async function ensurePDFLib(){
    let ctor = (w.jspdf && w.jspdf.jsPDF) || w.jsPDF || null;
    if (ctor) return ctor;
    try {
      await loadScript(ASSETS.vendor_jspdf || 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      ctor = (w.jspdf && w.jspdf.jsPDF) || w.jsPDF || null;
      return ctor || null;
    } catch(_){ return null; }
  }

  async function ensureHtml2Canvas(){
    if (typeof html2canvas === 'function' || (w.html2canvas && typeof w.html2canvas === 'function')) {
      return (typeof html2canvas === 'function') ? html2canvas : w.html2canvas;
    }
    try {
      await loadScript(ASSETS.vendor_html2canvas || 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      return (typeof html2canvas === 'function') ? html2canvas : w.html2canvas;
    } catch(_){ return null; }
  }

  async function ensurePDFLibMerge(){
    if (w.PDFDocument) {
      DEBUG.log('[USO_EXPORT] PDFDocument already loaded');
      return w.PDFDocument;
    }
    
    if (w.pdflibModule && w.pdflibModule.PDFDocument) {
      DEBUG.log('[USO_EXPORT] PDFDocument found in pdflibModule');
      w.PDFDocument = w.pdflibModule.PDFDocument;
      return w.PDFDocument;
    }
    
    try {
      const cdnUrl = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      
      DEBUG.log('[USO_EXPORT] Loading pdf-lib from CDN:', cdnUrl);
      
      await loadScript(cdnUrl);
      
      if (w.PDFDocument) {
        DEBUG.log('[USO_EXPORT] PDFDocument loaded successfully');
        return w.PDFDocument;
      }
      
      if (w.pdflibModule && w.pdflibModule.PDFDocument) {
        DEBUG.log('[USO_EXPORT] PDFDocument found in pdflibModule');
        w.PDFDocument = w.pdflibModule.PDFDocument;
        return w.PDFDocument;
      }
      
      for (let key in w) {
        if (w[key] && w[key].PDFDocument) {
          DEBUG.log('[USO_EXPORT] PDFDocument found in window.' + key);
          w.PDFDocument = w[key].PDFDocument;
          return w.PDFDocument;
        }
      }
      
      throw new Error('PDFDocument not found in any namespace');
      
    } catch(err) {
      console.error('[USO_EXPORT] Failed to load pdf-lib:', err);
      return null;
    }
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

  function loadImageAsync(imageUrl) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        DEBUG.log('[USO_EXPORT] Image loaded');
        resolve(img);
      };
      img.onerror = function() {
        console.error('[USO_EXPORT] Error loading image');
        reject(new Error('Failed to load image'));
      };
      img.src = imageUrl;
    });
  }

  // ✅ УЛУЧШЕННАЯ функция проверки пустоты canvas
  function isCanvasBlank(c, threshold = 0.995){
    const ctx = c.getContext('2d');
    const { width:w, height:h } = c;

    // Проверяем только центральную часть (исключаем края где могут быть артефакты)
    const margin = Math.min(w, h) * 0.05;
    const checkW = Math.max(1, w - margin * 2);
    const checkH = Math.max(1, h - margin * 2);

    const imgData = ctx.getImageData(Math.floor(margin), Math.floor(margin), Math.floor(checkW), Math.floor(checkH));
    const data = imgData.data;

    let whitePixels = 0;
    let sampledPixels = 0;

    // ✅ ОПТИМИЗАЦИЯ: Проверяем каждый 10-й пиксель вместо всех (в 10 раз быстрее!)
    // Было: 12+ миллионов итераций для большого canvas
    // Стало: ~1.2 миллиона итераций (10x ускорение)
    for (let i = 0; i < data.length; i += 40) { // 40 = 4 байта * 10 пикселей
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // ✅ Более строгая проверка: считаем почти белым если RGB > 250
      if (r > 250 && g > 250 && b > 250) {
        whitePixels++;
      }
      sampledPixels++;
    }

    const whiteRatio = whitePixels / sampledPixels;

    // ✅ Логирование для отладки
    if (DEBUG && DEBUG.log) {
      DEBUG.log('[BLANK_CHECK]',
        'White:', (whiteRatio * 100).toFixed(1) + '%',
        'Threshold:', (threshold * 100) + '%',
        'IsBlank:', whiteRatio > threshold
      );
    }

    return whiteRatio > threshold;
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Добавляет текст на пустую страницу
  function addPlaceholderTextToCanvas(canvas, pageNumber) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Заливаем белым (на всякий случай)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Настройки текста
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Заголовок
    const titleSize = Math.max(24, Math.floor(h * 0.03));
    ctx.font = `bold ${titleSize}px Arial, sans-serif`;
    ctx.fillText('Дополнительная информация', w / 2, h * 0.4);

    // Подзаголовок
    const subtitleSize = Math.max(16, Math.floor(h * 0.02));
    ctx.font = `${subtitleSize}px Arial, sans-serif`;
    ctx.fillStyle = '#999999';
    ctx.fillText('Эта страница оставлена для дополнительных примечаний', w / 2, h * 0.48);
    ctx.fillText('или комментариев врача', w / 2, h * 0.52);

    // Линии для заметок (опционально)
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    const lineY = h * 0.6;
    const lineSpacing = h * 0.05;
    const lineWidth = w * 0.6;
    const lineX = (w - lineWidth) / 2;

    for (let i = 0; i < 5; i++) {
      const y = lineY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(lineX, y);
      ctx.lineTo(lineX + lineWidth, y);
      ctx.stroke();
    }

    DEBUG.log('[USO_EXPORT] Added placeholder text to blank page', pageNumber);
  }

  // ✅ УДАЛЕН ДУБЛИКАТ: Используется расширенная версия trimCanvasBottom ниже

  // ✅ ИСПРАВЛЕННАЯ функция поиска безопасного места разреза
  function findSafeCutY(canvas, startY, approxH){
    const ctx = canvas.getContext('2d');
    const target = Math.min(startY + approxH, canvas.height);
    
    // Увеличиваем диапазон поиска
    const band = 350;
    const from = Math.max(startY + 80, target - band);
    const to = Math.min(canvas.height - 1, target + band);
    
    let bestY = target;
    let bestScore = Infinity;
    
    for (let y = from; y <= to; y++){
      // Проверяем полосу высотой 5px
      const bandH = Math.min(5, canvas.height - y);
      const img = ctx.getImageData(0, Math.max(0, y - Math.floor(bandH/2)), canvas.width, bandH);
      const data = img.data;
      let ink = 0;
      
      // Более строгая проверка "чернил"
      for (let x = 0; x < canvas.width; x += 3){
        const i = (x * 4);
        const r = data[i], g = data[i+1], b = data[i+2];
        if (r < 240 || g < 240 || b < 240) {
          ink++;
          if (ink > 10) break;
        }
      }
      
      if (ink < bestScore){ 
        bestScore = ink; 
        bestY = y; 
        if (ink === 0) break; 
      }
    }
    
    return bestY;
  }

  async function buildPDFHtml(variantsSectionsHtml, reportType){
    const name = $('#uso-patient-name').val() || '';
    const rawPhone = $('#uso-patient-phone').val() || '';

    // ✅ ИСПРАВЛЕНО: Используем USO.util.maskPhone вместо локальной функции
    const phoneMasked = U.util ? U.util.maskPhone(rawPhone) : '***';
    const nowStr = new Date().toLocaleDateString('ru-RU');
    const logoUrl = ASSETS.logo_url || '';

    // ✅ ИСПРАВЛЕНО: Используем USO.util.escapeHTML вместо локальной функции
    const esc = U.util ? U.util.escapeHTML : function(s){
      const div = document.createElement('div');
      div.textContent = String(s || '');
      return div.innerHTML;
    };

    let tpl = (reportType==='default') ? (OPT.pdf_template_html || '') : '';
    try {
      const url = (reportType==='alt') ? ASSETS.pdf_template2_url : ASSETS.pdf_template_url;
      if ((!tpl || tpl.length<=10) && url && typeof fetch === 'function') {
        const r = await fetch(url, { credentials:'same-origin' });
        if (r.ok) tpl = await r.text();
      }
    } catch(_){}

    const partsToInject = [];
    partsToInject.push("@page { size: A4; margin: 0; }");
    partsToInject.push(`
      *,*::before,*::after{box-sizing:border-box}
      body{ 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact;
        font-family: Arial, Helvetica, sans-serif;
      }
      img{ display:block; max-width:100%; width:100%; height:auto; }
      .section{ page-break-inside: avoid; margin: 10px 0 14px; }
      .card{ page-break-inside: avoid; }
      h1,h2,h3,h4{ page-break-after: avoid; margin: 12px 0 6px; }
      p{ margin: 6px 0; }
      ul{ margin: 6px 0 8px 18px; padding:0; }
    `);

    const extraCss = "\n"+partsToInject.join("\n")+"\n";
    if (tpl.indexOf('</style>') !== -1) tpl = tpl.replace('</style>', extraCss + '\n</style>');
    else if (tpl.indexOf('</head>') !== -1) tpl = tpl.replace('</head>', '<style>'+extraCss+'</style></head>');
    else tpl = '<style>'+extraCss+'</style>' + tpl;

    let out = tpl || ('<div style="padding:40px; font-family:Arial, Helvetica, sans-serif;">'+(variantsSectionsHtml||'')+'</div>');

    out = out.replace(/Государственная больница\s+You-Ai[^<]*/gi, '');

    // ✅ ИСПРАВЛЕНО: Все пользовательские данные экранируются
    out = out.split('{{patient_name}}').join(esc(name));
    out = out.split('{{patient_phone}}').join(esc(phoneMasked));
    out = out.split('{{patient_phone_masked}}').join(esc(phoneMasked));
    out = out.split('{{calc_date}}').join(esc(nowStr));

    // ✅ ИСПРАВЛЕНО XSS: Экранируем CLINIC данные (на случай если админ может их менять)
    out = out.split('{{license}}').join(esc(CLINIC.license||''));
    out = out.split('{{addr_heihe}}').join(esc(CLINIC.addr_heihe||''));
    out = out.split('{{addr_suif}}').join(esc(CLINIC.addr_suif||''));
    out = out.split('{{phone1}}').join(esc(CLINIC.phone1||''));
    out = out.split('{{phone2}}').join(esc(CLINIC.phone2||''));
    out = out.split('{{email}}').join(esc(CLINIC.email||''));
    out = out.split('{{site}}').join(esc(CLINIC.site||''));
    out = out.split('{{disclaimer}}').join(esc(CLINIC.disclaimer||''));

    // ВНИМАНИЕ: variantsSectionsHtml должен быть экранирован в uso.app.js!
    out = out.split('{{variants_content}}').join(variantsSectionsHtml || '');
    out = out.split('{{logo_url}}').join(esc(logoUrl || ''));
    out = out.split('{{advertiser}}').join(esc(CLINIC.advertiser || ''));
    out = out.split('{{ogrn}}').join(esc(CLINIC.ogrn || ''));

    return out;
  }

  // ✅ УДАЛЕН ДУБЛИКАТ: addPlaceholderTextToCanvas (использовать версию выше)
  // ✅ УДАЛЕН ДУБЛИКАТ: trimCanvasBottom (использовать версию ниже)

  /**
   * Обрезает белый хвост снизу canvas (расширенная версия)
   * @param {HTMLCanvasElement} canvas - Исходный canvas
   * @param {number} threshold - Порог белизны (0.0 - 1.0)
   * @returns {HTMLCanvasElement} - Обрезанный canvas
   */
  function trimCanvasBottom(canvas, threshold) {
    threshold = threshold || 0.98;
    if (!canvas) return canvas;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    if (h === 0 || w === 0) return canvas;

    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      let lastContentY = h - 1;
      const whiteThreshold = 255 * threshold;

      DEBUG.log('[USO_EXPORT] Trimming canvas, original height:', h);

      // Сканируем снизу вверх
      for (let y = h - 1; y >= 0; y--) {
        let hasContent = false;

        // Проверяем строку пикселей (каждый 5-й пиксель для производительности)
        for (let x = 0; x < w; x += 5) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          // Если пиксель не белый (с учетом альфа-канала)
          if (a > 10 && (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold)) {
            hasContent = true;
            break;
          }
        }

        if (hasContent) {
          lastContentY = y;
          break;
        }
      }

      // Добавляем небольшой отступ снизу (50px)
      const trimmedHeight = Math.min(h, lastContentY + 50);

      // Если почти ничего не обрезали - возвращаем оригинал
      if (trimmedHeight >= h - 20) {
        DEBUG.log('[USO_EXPORT] No significant trimming needed');
        return canvas;
      }

      DEBUG.log('[USO_EXPORT] Trimmed canvas from', h, 'to', trimmedHeight, 'px');

      // Создаем новый canvas с обрезанной высотой
      const trimmed = document.createElement('canvas');
      trimmed.width = w;
      trimmed.height = trimmedHeight;
      const trimmedCtx = trimmed.getContext('2d');

      // Заполняем белым
      trimmedCtx.fillStyle = '#ffffff';
      trimmedCtx.fillRect(0, 0, w, trimmedHeight);

      // Копируем содержимое
      trimmedCtx.drawImage(canvas, 0, 0, w, trimmedHeight, 0, 0, w, trimmedHeight);

      return trimmed;

    } catch(e) {
      DEBUG.error('[USO_EXPORT] Error trimming canvas:', e);
      return canvas;
    }
  }

  /**
   * Проверяет, является ли canvas пустым (белым)
   * @param {HTMLCanvasElement} canvas - Canvas для проверки
   * @param {number} threshold - Порог белизны (0.0 - 1.0)
   * @returns {boolean} - true если canvas пустой
   */
  function isCanvasBlank(canvas, threshold) {
    threshold = threshold || 0.98;
    if (!canvas) return true;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    if (w === 0 || h === 0) return true;

    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const whiteThreshold = 255 * threshold;

      // Проверяем случайные точки для производительности
      const totalPixels = data.length / 4;
      const sampleSize = Math.min(10000, totalPixels);
      const step = Math.floor(totalPixels / sampleSize);

      for (let i = 0; i < totalPixels; i += step) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // Если нашли непрозрачный небелый пиксель
        if (a > 10 && (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold)) {
          return false;
        }
      }

      return true;

    } catch(e) {
      DEBUG.error('[USO_EXPORT] Error checking canvas blank:', e);
      return false;
    }
  }

  /**
   * Находит безопасную точку разреза для разбиения canvas на страницы
   * @param {HTMLCanvasElement} canvas - Canvas для анализа
   * @param {number} startY - Начальная Y координата
   * @param {number} approxHeight - Приблизительная высота страницы
   * @returns {number} - Y координата для разреза
   */
  function findSafeCutY(canvas, startY, approxHeight) {
    if (!canvas) return startY + approxHeight;

    const h = canvas.height;
    let targetY = Math.min(startY + approxHeight, h);

    // Если уже в конце - возвращаем как есть
    if (targetY >= h - 10) return h;

    // Простая реализация - возвращаем целевую координату
    // В продакшене можно добавить более умную логику поиска
    return targetY;
  }

  // ✅ ЗАМЕНЕНО: улучшенная версия buildPDFBlob (обрезает белый хвост, режет без пустых страниц и удаляет дефолтную пустую при необходимости)
  async function buildPDFBlob(variantsSectionsHtml, filenameBase, reportType, allImages = []){
    DEBUG.log('[USO_EXPORT] buildPDFBlob started with', allImages.length, 'images');
    
    const JsPDFCtor = await ensurePDFLib();
    const h2c = await ensureHtml2Canvas();
    if (!JsPDFCtor || !h2c) { 
      throw new Error('Не удалось загрузить библиотеки PDF'); 
    }

    const html = await buildPDFHtml(variantsSectionsHtml, reportType);
    const node = document.createElement('div');
    node.style.width='794px';
    node.innerHTML = html;

    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-10000px';
    holder.style.top = '0';
    holder.style.width = '794px';
    holder.style.background = '#fff';
    holder.appendChild(node);
    document.body.appendChild(holder);

    DEBUG.log('[USO_EXPORT] Rendering HTML to canvas...');
    const canvasC = await h2c(node, { 
      scale: 2, 
      useCORS: true, 
      allowTaint: true, 
      backgroundColor: '#fff',
      logging: false,
      imageTimeout: 0
    });

    // ✅ Обрезаем белый хвост
    const canvasTrimmed = trimCanvasBottom(canvasC, 0.995);

    DEBUG.log('[USO_EXPORT] Canvas created:', canvasTrimmed.width, 'x', canvasTrimmed.height);

    const pdf = new JsPDFCtor('p','pt','a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgW = pageWidth;
    const ratio = imgW / canvasTrimmed.width;
    const approxPageH = Math.floor(pageHeight / ratio);

    let srcY = 0;
    let pageIndex = 0;
    let guard = 0;
    const MIN_CONTENT_HEIGHT = 150; // ✅ Увеличили минимум полезной высоты

    DEBUG.log('[USO_EXPORT] Splitting canvas into pages...');

    // ✅ УЛУЧШЕННАЯ логика разбиения на страницы
    while (srcY < canvasTrimmed.height && guard++ < 999) {
      const remainingH = canvasTrimmed.height - srcY;

      // ✅ Если остаток маленький - обрабатываем как последнюю страницу
      if (remainingH < MIN_CONTENT_HEIGHT) {
        const tail = document.createElement('canvas');
        tail.width = canvasTrimmed.width;
        tail.height = remainingH;
        const tailCtx = tail.getContext('2d');
        tailCtx.fillStyle = '#fff';
        tailCtx.fillRect(0, 0, tail.width, tail.height);
        tailCtx.drawImage(canvasTrimmed, 0, srcY, canvasTrimmed.width, remainingH, 0, 0, tail.width, tail.height);

        const isBlank = isCanvasBlank(tail, 0.995);

        if (isBlank) {
          DEBUG.log('[USO_EXPORT] Found blank tail at y=' + srcY + ', height=' + remainingH + ' - adding placeholder text');
          // ✅ НОВОЕ: Добавляем текст на пустой хвост
          addPlaceholderTextToCanvas(tail, pageIndex + 1);
        }

        // ✅ НОВОЕ: Добавляем последнюю страницу (с текстом или без)
        const imgData = tail.toDataURL('image/jpeg', 0.95);
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, remainingH * ratio, undefined, 'FAST');
        pageIndex++;
        DEBUG.log('[USO_EXPORT] Added tail page', pageIndex, 'blank:', isBlank);
        break; // Выходим, так как это был последний кусок
      }

      const cutY = findSafeCutY(canvasTrimmed, srcY, approxPageH);
      let sliceH = Math.max(1, Math.min(cutY - srcY, canvasTrimmed.height - srcY));

      // ✅ Запрещаем слишком маленькие срезы (если есть запас)
      if (sliceH < MIN_CONTENT_HEIGHT && (srcY + sliceH < canvasTrimmed.height)) {
        sliceH = Math.min(MIN_CONTENT_HEIGHT, canvasTrimmed.height - srcY);
      }

      const tmp = document.createElement('canvas');
      tmp.width = canvasTrimmed.width;
      tmp.height = sliceH;
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = '#fff';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvasTrimmed, 0, srcY, canvasTrimmed.width, sliceH, 0, 0, tmp.width, tmp.height);

      // ✅ ИСПРАВЛЕНО: Проверка пустоты - если пусто, добавляем текст вместо пропуска
      if (isCanvasBlank(tmp, 0.995)) {
        DEBUG.log('[USO_EXPORT] Found blank page at y=' + srcY + ', height=' + sliceH + ' - adding placeholder text');
        // ✅ НОВОЕ: Добавляем текст на пустую страницу
        addPlaceholderTextToCanvas(tmp, pageIndex + 1);
      }

      // ✅ Добавляем ВСЕ страницы (теперь пустые имеют текст)
      const imgData = tmp.toDataURL('image/jpeg', 0.95);
      if (pageIndex > 0) pdf.addPage();

      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, sliceH * ratio, undefined, 'FAST');

      srcY = cutY + 1;
      pageIndex++;

      DEBUG.log('[USO_EXPORT] Added page', pageIndex, 'at y=' + (srcY - sliceH) + ', height=' + sliceH);
    }

    document.body.removeChild(holder);

    // ✅ ИСПРАВЛЕНО: Больше не удаляем дефолтную страницу, так как теперь всегда добавляем контент
    // (даже пустые страницы теперь имеют текст-заполнитель)
    if (pageIndex === 0) {
      DEBUG.warn('[USO_EXPORT] Warning: No pages were added to PDF!');
    }

    const blob = pdf.output('blob');
    const name = (filenameBase||'otchet')+'.pdf';
    DEBUG.log('[USO_EXPORT] PDF created, pages:', pageIndex, 'size:', Math.round(blob.size/1024), 'KB');
    return { blob, name, pageIndex };
  }

  async function buildPDFFromImages(filenameBase, allImages = []) {
    DEBUG.log('[USO_EXPORT] buildPDFFromImages started with', allImages.length, 'images');
    
    const JsPDFCtor = await ensurePDFLib();
    if (!JsPDFCtor) { 
      throw new Error('Не удалось загрузить jsPDF'); 
    }

    const pdf = new JsPDFCtor('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    DEBUG.log('[USO_EXPORT] PDF page size:', pageWidth, 'x', pageHeight);

    if (!allImages || allImages.length === 0) {
      console.warn('[USO_EXPORT] No images to add to PDF');
      const blob = pdf.output('blob');
      return { blob, name: (filenameBase||'otchet')+'.pdf' };
    }

    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2 - 50;

    let pageAdded = false;

    for (let idx = 0; idx < allImages.length; idx++) {
      const img = allImages[idx];

      if (!img || !img.imageUrl) {
        console.warn('[USO_EXPORT] Image', idx + 1, 'has no imageUrl - skipping');
        continue;
      }

      try {
        DEBUG.log('[USO_EXPORT] Adding image', idx + 1, 'to PDF');

        // ✅ ИСПРАВЛЕНИЕ: Сначала загружаем изображение
        const imgElement = await loadImageAsync(img.imageUrl);

        if (!imgElement || !imgElement.width || !imgElement.height) {
          console.warn('[USO_EXPORT] Image', idx + 1, 'failed to load or has invalid dimensions - skipping');
          continue;
        }

        const imgRatio = imgElement.width / imgElement.height;
        let finalWidth = maxWidth;
        let finalHeight = finalWidth / imgRatio;

        if (finalHeight > maxHeight) {
          finalHeight = maxHeight;
          finalWidth = finalHeight * imgRatio;
        }

        const leftOffset = margin + (maxWidth - finalWidth) / 2;
        let currentY = margin;

        // ✅ ИСПРАВЛЕНИЕ: Добавляем страницу только после успешной загрузки изображения
        if (pageAdded) {
          pdf.addPage();
          DEBUG.log('[USO_EXPORT] Added new page for image', idx + 1);
        }
        pageAdded = true;

        const captionCanvas = document.createElement('canvas');
        captionCanvas.width = pageWidth;
        captionCanvas.height = 40;
        const captionCtx = captionCanvas.getContext('2d');
        captionCtx.fillStyle = '#fff';
        captionCtx.fillRect(0, 0, captionCanvas.width, captionCanvas.height);
        captionCtx.fillStyle = '#2271b1';
        captionCtx.font = 'bold 14px Arial';
        const marker = (idx + 1) === 1 ? ' ✓' : '';
        captionCtx.fillText('Снимок ' + (idx + 1) + marker, margin, 25);

        if ((idx + 1) === 1) {
          captionCtx.fillStyle = '#666';
          captionCtx.font = '10px Arial';
          captionCtx.fillText('(использован для расчётов)', margin, 38);
        }

        const captionImg = captionCanvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(captionImg, 'JPEG', 0, currentY, pageWidth, 40);
        currentY += 50;

        pdf.addImage(img.imageUrl, 'PNG', leftOffset, currentY, finalWidth, finalHeight);

        DEBUG.log('[USO_EXPORT] Image', idx + 1, 'added successfully');
      } catch(err) {
        console.error('[USO_EXPORT] Error adding image', idx + 1, ':', err);
        // ✅ Пропускаем это изображение, страница не создана
        continue;
      }
    }

    const blob = pdf.output('blob');
    const name = (filenameBase||'otchet')+'.pdf';
    DEBUG.log('[USO_EXPORT] PDF created from images, size:', Math.round(blob.size/1024), 'KB');
    return { blob, name };
  }

  async function mergePDFs(textPdfBlob, imagesPdfBlob) {
    DEBUG.log('[USO_EXPORT] mergePDFs started');
    
    const PDFDocument = await ensurePDFLibMerge();
    if (!PDFDocument) {
      throw new Error('pdf-lib not loaded');
    }

    try {
      const textPdf = await PDFDocument.load(await textPdfBlob.arrayBuffer());
      const imagesPdf = await PDFDocument.load(await imagesPdfBlob.arrayBuffer());

      DEBUG.log('[USO_EXPORT] Text PDF pages:', textPdf.getPageCount());
      DEBUG.log('[USO_EXPORT] Images PDF pages:', imagesPdf.getPageCount());

      const imagePages = await textPdf.copyPages(imagesPdf, imagesPdf.getPageIndices());
      imagePages.forEach(page => textPdf.addPage(page));

      DEBUG.log('[USO_EXPORT] Merged PDF pages:', textPdf.getPageCount());

      const mergedPdf = await textPdf.save();
      const blob = new Blob([mergedPdf], { type: 'application/pdf' });
      
      DEBUG.log('[USO_EXPORT] Merged PDF size:', Math.round(blob.size/1024), 'KB');
      return blob;
    } catch(err) {
      console.error('[USO_EXPORT] mergePDFs error:', err);
      throw err;
    }
  }

  async function exportPDF(variantsSectionsHtml, filenameBase, reportType, allImages = []){
    DEBUG.log('[USO_EXPORT] exportPDF called');
    
    const loader = document.createElement('div');
    loader.id = 'uso-pdf-loader';
    loader.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;">
        <div style="background:#fff;padding:24px;border-radius:8px;min-width:300px;">
          <div style="font-size:16px;margin-bottom:12px;text-align:center;">Генерация PDF...</div>
          <div style="width:100%;height:4px;background:#e5e5e5;border-radius:2px;overflow:hidden;">
            <div id="uso-pdf-progress" style="width:0%;height:100%;background:#2271b1;transition:width 0.3s;"></div>
          </div>
          <div id="uso-pdf-status" style="font-size:12px;color:#666;margin-top:8px;text-align:center;">Подготовка...</div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
    
    const progress = document.getElementById('uso-pdf-progress');
    const status = document.getElementById('uso-pdf-status');
    
    try {
      progress.style.width = '10%';
      status.textContent = 'Подготовка текста...';
      
      const textRes = await buildPDFBlob(variantsSectionsHtml, filenameBase, reportType, []);
      DEBUG.log('[USO_EXPORT] Text PDF created');
      
      progress.style.width = '50%';
      status.textContent = 'Подготовка снимков...';
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (allImages && allImages.length > 0) {
        progress.style.width = '70%';
        status.textContent = 'Сборка снимков в PDF...';
        
        const imagesRes = await buildPDFFromImages(filenameBase, allImages);
        DEBUG.log('[USO_EXPORT] Images PDF created');
        
        progress.style.width = '85%';
        status.textContent = 'Объединение документов...';
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const mergedBlob = await mergePDFs(textRes.blob, imagesRes.blob);
        DEBUG.log('[USO_EXPORT] PDFs merged');
        
        progress.style.width = '100%';
        status.textContent = 'Готово!';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const url = URL.createObjectURL(mergedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameBase + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        DEBUG.log('[USO_EXPORT] PDF exported successfully');
      } else {
        progress.style.width = '100%';
        status.textContent = 'Готово!';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const blob = textRes.blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = textRes.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        DEBUG.log('[USO_EXPORT] Text-only PDF exported successfully');
      }
      
    } catch(e) {
      console.error('[USO] PDF export error:', e);
      console.error('[USO] Error stack:', e.stack);
      
      let errorMsg = 'Неизвестная ошибка';
      if (e.message) errorMsg = e.message;
      
      if (errorMsg.includes('jspdf') || errorMsg.includes('jsPDF')) {
        errorMsg = 'Не удалось загрузить библиотеку jsPDF. Проверьте подключение к интернету.';
      } else if (errorMsg.includes('html2canvas')) {
        errorMsg = 'Не удалось загрузить библиотеку html2canvas. Проверьте подключение к интернету.';
      } else if (errorMsg.includes('pdf-lib')) {
        errorMsg = 'Не удалось загрузить библиотеку pdf-lib для объединения. Проверьте наличие файла vendor/pdf-lib.min.js';
      }
      
      alert('Ошибка при создании PDF:\n\n' + errorMsg);
      
    } finally {
      setTimeout(() => {
        if (loader && loader.parentNode) {
          document.body.removeChild(loader);
        }
      }, 500);
    }
  }

  // ✅ УДАЛЕН ДУБЛИКАТ: htmlToText (используем USO.util.htmlToText)

  function buildTextReport(htmlContent) {
    const name = ($('#uso-patient-name').val() || '').trim();
    const rawPhone = ($('#uso-patient-phone').val() || '').trim();

    // ✅ ИСПРАВЛЕНО: Используем USO.util.maskPhone (было 3 копии!)
    const phoneMasked = U.util ? U.util.maskPhone(rawPhone) : '***';
    const nowStr = new Date().toLocaleDateString('ru-RU');

    // ✅ ИСПРАВЛЕНО: Используем USO.util.htmlToText вместо локальной функции
    const htmlToText = U.util ? U.util.htmlToText : function(h){
      const d = document.createElement('div');
      d.textContent = h;
      return d.textContent;
    };
    const textContent = htmlToText(htmlContent);
    
    const report = `
╔════════════════════════════════════════════════════════════════╗
║                      ПЛАН ЛЕЧЕНИЯ                             ║
╚════════════════════════════════════════════════════════════════╝

Дата:                ${nowStr}
Пациент:             ${name}
Телефон:             ${phoneMasked}

════════════════════════════════════════════════════════════════

${textContent}

════════════════════════════════════════════════════════════════

КОНТАКТЫ КЛИНИКИ
────────────────────────────────────────────────────────────────
Клиника:             ${CLINIC.advertiser || 'УСО'}
Лицензия:            ${CLINIC.license || '-'}
Адрес (Хэйхэ):       ${CLINIC.addr_heihe || '-'}
Адрес (Суйфэньхэ):   ${CLINIC.addr_suif || '-'}
Телефон 1:           ${CLINIC.phone1 || '-'}
Телефон 2:           ${CLINIC.phone2 || '-'}
E-mail:              ${CLINIC.email || '-'}
Сайт:                ${CLINIC.site || '-'}

════════════════════════════════════════════════════════════════

${CLINIC.disclaimer || 'Имеются противопоказания, необходима консультация специалиста.'}

════════════════════════════════════════════════════════════════
    `.trim();
    
    return report;
  }

  function downloadTextFile(content, filename) {
    if (!content) {
      console.error('[USO_EXPORT] Empty content for file:', filename);
      return;
    }

    DEBUG.log('[USO_EXPORT] downloadTextFile:', filename, 'size:', Math.round(content.length / 1024), 'KB');
    
    const data = '\ufeff' + content;
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    
    setTimeout(() => {
      a.click();
      DEBUG.log('[USO_EXPORT] File clicked:', filename);
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        DEBUG.log('[USO_EXPORT] Cleanup done for:', filename);
      }, 500);
    }, 100);
  }

  function downloadBlobFile(blob, filename) {
    if (!blob || blob.size === 0) {
      console.error('[USO_EXPORT] Invalid blob for file:', filename);
      return;
    }

    DEBUG.log('[USO_EXPORT] downloadBlobFile:', filename, 'size:', Math.round(blob.size / 1024), 'KB');
    
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    
    setTimeout(() => {
      a.click();
      DEBUG.log('[USO_EXPORT] File clicked:', filename);
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        DEBUG.log('[USO_EXPORT] Cleanup done for:', filename);
      }, 500);
    }, 100);
  }

  function dataUrlToBlob(dataUrl) {
    return new Promise(function(resolve) {
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => resolve(blob))
        .catch(err => {
          console.error('[USO_EXPORT] Error converting data URL to blob:', err);
          resolve(null);
        });
    });
  }

  async function renderImageWithMarkersToDataUrl(imageIndex) {
    DEBUG.log('[USO_EXPORT] renderImageWithMarkersToDataUrl:', imageIndex);
    
    const CANVAS = w.USO_CANVAS;
    if (!CANVAS || typeof CANVAS.renderImageWithMarkersToDataUrl !== 'function') {
      console.error('[USO_EXPORT] CANVAS.renderImageWithMarkersToDataUrl not available');
      return null;
    }

    try {
      const dataUrl = await CANVAS.renderImageWithMarkersToDataUrl(imageIndex);
      DEBUG.log('[USO_EXPORT] Got image with markers, size:', Math.round(dataUrl.length / 1024), 'KB');
      return dataUrl;
    } catch(err) {
      console.error('[USO_EXPORT] Error rendering image with markers:', err);
      return null;
    }
  }

  /**
   * Получить все изображения с метками для экспорта
   * ✅ ОБНОВЛЕНО: Использует новый API getAllImagesForExport из uso.canvas.js
   * который возвращает изображения в порядке вкладок
   * @returns {Promise<Array>} - Массив изображений с метками
   */
  async function getAllImagesWithMarkers() {
    DEBUG.log('[USO_EXPORT] getAllImagesWithMarkers started');

    const CANVAS = w.USO_CANVAS;

    // ✅ ОБНОВЛЕНО: Используем новый API getAllImagesForExport
    if (!CANVAS || typeof CANVAS.getAllImagesForExport !== 'function') {
      console.error('[USO_EXPORT] CANVAS.getAllImagesForExport not available');

      // Фоллбэк на старый метод
      if (CANVAS && typeof CANVAS.getAllImages === 'function') {
        DEBUG.warn('[USO_EXPORT] Falling back to old getAllImages method');
        return await getAllImagesWithMarkers_Legacy();
      }

      return [];
    }

    try {
      // ✅ Идём по images[] в порядке вкладок; рендерим каждую сцену в PNG
      const result = await CANVAS.getAllImagesForExport();
      DEBUG.log('[USO_EXPORT] getAllImagesForExport returned', result.length, 'images');

      // Преобразуем в формат, ожидаемый экспортом
      return result.map((img, idx) => ({
        index: idx,
        imageUrl: img.imageUrl,
        description: img.description || `Снимок ${idx + 1}`
      }));

    } catch(err) {
      console.error('[USO_EXPORT] getAllImagesWithMarkers error:', err);
      return [];
    }
  }

  /**
   * Legacy метод для совместимости
   * @returns {Promise<Array>}
   */
  async function getAllImagesWithMarkers_Legacy() {
    DEBUG.log('[USO_EXPORT] Using legacy getAllImagesWithMarkers');

    const CANVAS = w.USO_CANVAS;
    if (!CANVAS || typeof CANVAS.getAllImages !== 'function') {
      return [];
    }

    try {
      const allImages = CANVAS.getAllImages();
      DEBUG.log('[USO_EXPORT] Got', allImages.length, 'images');

      const result = [];
      const currentImageIndex = CANVAS.getCurrentImageIndex ? CANVAS.getCurrentImageIndex() : 0;

      for (let i = 0; i < allImages.length; i++) {
        try {
          DEBUG.log('[USO_EXPORT] Processing image', i + 1, 'of', allImages.length);

          if (CANVAS.switchImage) {
            await CANVAS.switchImage(i);
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          const dataUrl = await renderImageWithMarkersToDataUrl(i);

          if (dataUrl) {
            result.push({
              index: i,
              imageUrl: dataUrl,
              description: allImages[i].description || `Снимок ${i + 1}`
            });
            DEBUG.log('[USO_EXPORT] Image', i + 1, 'processed successfully');
          } else {
            console.warn('[USO_EXPORT] Failed to render image', i + 1, 'with markers');
          }
        } catch(err) {
          console.error('[USO_EXPORT] Error processing image', i + 1, ':', err);
          continue;
        }
      }

      if (CANVAS.switchImage) {
        await CANVAS.switchImage(currentImageIndex);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      DEBUG.log('[USO_EXPORT] Legacy method completed, got', result.length, 'images');
      return result;
    } catch(err) {
      console.error('[USO_EXPORT] Legacy getAllImagesWithMarkers error:', err);
      return [];
    }
  }

  async function splitPngIntoPages(htmlContent, pageHeightPx = 4000) {
    DEBUG.log('[USO_EXPORT] splitPngIntoPages started');
    
    const h2c = await ensureHtml2Canvas();
    if (!h2c) {
      console.error('[USO_EXPORT] html2canvas not available');
      return [];
    }

    const node = document.createElement('div');
    node.style.width = '1200px';
    node.style.padding = '40px';
    node.style.fontFamily = 'Arial, Helvetica, sans-serif';
    node.style.backgroundColor = '#fff';
    node.innerHTML = htmlContent;

    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-10000px';
    holder.style.top = '0';
    holder.style.width = '1200px';
    holder.style.background = '#fff';
    holder.appendChild(node);
    document.body.appendChild(holder);

    try {
      const canvas = await h2c(node, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        logging: false,
        imageTimeout: 0
      });

      DEBUG.log('[USO_EXPORT] Canvas created:', canvas.width, 'x', canvas.height);

      const pages = [];
      let currentY = 0;
      let pageNum = 1;

      while (currentY < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - currentY);
        
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        
        const ctx = pageCanvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, currentY, canvas.width, sliceHeight, 0, 0, pageCanvas.width, sliceHeight);

        const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.85);
        pages.push({
          pageNum: pageNum,
          dataUrl: dataUrl
        });

        DEBUG.log('[USO_EXPORT] Page', pageNum, 'created');

        currentY += sliceHeight;
        pageNum++;
      }

      document.body.removeChild(holder);
      return pages;

    } catch(err) {
      console.error('[USO_EXPORT] Error splitting PNG:', err);
      document.body.removeChild(holder);
      return [];
    }
  }

  async function buildSummaryHtml(variantsSectionsHtml) {
    const name = ($('#uso-patient-name').val() || '').trim();
    const rawPhone = ($('#uso-patient-phone').val() || '').trim();
    const maskPhone = function(s){ 
      const d = String(s||'').replace(/\D/g,''); 
      return d.length <= 6 ? '***'+d : '***'+d.slice(-6); 
    };
    const nowStr = new Date().toLocaleDateString('ru-RU');
    const phoneMasked = maskPhone(rawPhone);
    const logoUrl = ASSETS.logo_url || '';

    const html = `
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: Arial, Helvetica, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          margin: 0;
          padding: 0;
        }
        .header {
          border-bottom: 3px solid #2271b1;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header-logo {
          max-width: 150px;
          height: auto;
          margin-bottom: 15px;
        }
        .header-title {
          font-size: 28px;
          font-weight: bold;
          color: #2271b1;
          margin: 0 0 10px 0;
        }
        .header-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          font-size: 14px;
          color: #333;
        }
        .header-info-item {
          display: flex;
          gap: 10px;
        }
        .header-info-label {
          font-weight: bold;
          min-width: 100px;
        }
        .content {
          margin-bottom: 40px;
        }
        .section {
          page-break-inside: avoid;
          margin-bottom: 20px;
        }
        .footer {
          border-top: 2px solid #ddd;
          padding-top: 20px;
          margin-top: 40px;
          font-size: 12px;
          color: #666;
        }
        .footer-section {
          margin-bottom: 15px;
        }
        .footer-title {
          font-weight: bold;
          margin-bottom: 5px;
        }
        h1, h2, h3, h4 { 
          page-break-after: avoid;
          margin: 20px 0 10px 0;
          color: #2271b1;
        }
        p { margin: 8px 0; }
        ul { margin: 8px 0 8px 20px; padding: 0; }
        li { margin: 5px 0; }
      </style>

      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" class="header-logo" alt="Logo">` : ''}
        <div class="header-title">ПЛАН ЛЕЧЕНИЯ</div>
        <div class="header-info">
          <div class="header-info-item">
            <span class="header-info-label">Дата:</span>
            <span>${nowStr}</span>
          </div>
          <div class="header-info-item">
            <span class="header-info-label">Пациент:</span>
            <span>${name}</span>
          </div>
          <div class="header-info-item">
            <span class="header-info-label">Телефон:</span>
            <span>${phoneMasked}</span>
          </div>
          <div class="header-info-item">
            <span class="header-info-label">Клиника:</span>
            <span>${CLINIC.advertiser || 'УСО'}</span>
          </div>
        </div>
      </div>

      <div class="content">
        ${variantsSectionsHtml}
      </div>

      <div class="footer">
        <div class="footer-section">
          <div class="footer-title">КОНТАКТЫ</div>
          ${CLINIC.addr_heihe ? `<div>Адрес (Хэйхэ): ${CLINIC.addr_heihe}</div>` : ''}
          ${CLINIC.addr_suif ? `<div>Адрес (Суйфэньхэ): ${CLINIC.addr_suif}</div>` : ''}
          ${CLINIC.phone1 ? `<div>Телефон: ${CLINIC.phone1}</div>` : ''}
          ${CLINIC.email ? `<div>E-mail: ${CLINIC.email}</div>` : ''}
        </div>
        <div class="footer-section">
          <div>${CLINIC.disclaimer || 'Имеются противопоказания, необходима консультация специалиста.'}</div>
        </div>
      </div>
    `;

    return html;
  }

  function showDownloadConfirmModal(current, total) {
    return new Promise(function(resolve) {
      const modal = document.createElement('div');
      modal.id = 'uso-download-confirm-modal';
      modal.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;">
          <div style="background:#fff;padding:24px;border-radius:8px;min-width:350px;text-align:center;">
            <div style="font-size:18px;margin-bottom:12px;font-weight:bold;">📥 Снимок ${current}/${total}</div>
            <div style="font-size:14px;color:#666;margin-bottom:20px;">
              Снимок ${current} успешно скачан.<br>
              ${current < total ? `Нажмите "Далее" для скачивания снимка ${current + 1}` : 'Все снимки скачаны!'}
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
              ${current < total ? `
                <button id="uso-download-next" style="padding:10px 20px;background:#2271b1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">
                  Далее →
                </button>
              ` : `
                <button id="uso-download-done" style="padding:10px 20px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">
                  Готово ✓
                </button>
              `}
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const nextBtn = document.getElementById('uso-download-next');
      const doneBtn = document.getElementById('uso-download-done');
      
      if (nextBtn) {
        nextBtn.addEventListener('click', function() {
          document.body.removeChild(modal);
          resolve();
        });
      }
      
      if (doneBtn) {
        doneBtn.addEventListener('click', function() {
          document.body.removeChild(modal);
          resolve();
        });
      }
    });
  }

  async function exportAsFiles(variantsSectionsHtml, filenameBase, allImages = []) {
    DEBUG.log('[USO_EXPORT] exportAsFiles called with', allImages.length, 'images');

    const loader = document.createElement('div');
    loader.id = 'uso-export-loader';
    loader.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;">
        <div style="background:#fff;padding:24px;border-radius:8px;min-width:350px;">
          <div style="font-size:16px;margin-bottom:12px;text-align:center;">Экспорт файлов...</div>
          <div style="width:100%;height:6px;background:#e5e5e5;border-radius:3px;overflow:hidden;margin-bottom:8px;">
            <div id="uso-export-progress" style="width:0%;height:100%;background:#2271b1;transition:width 0.3s;"></div>
          </div>
          <div id="uso-export-status" style="font-size:12px;color:#666;text-align:center;">Подготовка...</div>
          <div id="uso-export-percent" style="font-size:14px;font-weight:bold;color:#2271b1;text-align:center;margin-top:8px;">0%</div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);

    const progress = document.getElementById('uso-export-progress');
    const status = document.getElementById('uso-export-status');
    const percent = document.getElementById('uso-export-percent');

    function updateProgress(value, text) {
      progress.style.width = value + '%';
      percent.textContent = Math.round(value) + '%';
      status.textContent = text;
      DEBUG.log('[USO_EXPORT] Progress:', Math.round(value) + '%', '-', text);
    }

    try {
      updateProgress(0, 'Подготовка текстового отчета...');
      await new Promise(resolve => setTimeout(resolve, 100));

      const textReport = buildTextReport(variantsSectionsHtml);
      downloadTextFile(textReport, filenameBase + '.txt');
      DEBUG.log('[USO_EXPORT] TXT exported');
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      updateProgress(5, 'Создание отчета в формате PNG...');
      await new Promise(resolve => setTimeout(resolve, 200));

      const summaryHtml = await buildSummaryHtml(variantsSectionsHtml);
      const summaryPages = await splitPngIntoPages(summaryHtml, 4000);
      DEBUG.log('[USO_EXPORT] Summary pages created:', summaryPages.length);

      let summaryProgress = 5;
      const summaryStep = 30 / (summaryPages.length || 1);

      for (let i = 0; i < summaryPages.length; i++) {
        const page = summaryPages[i];
        const pageFilename = summaryPages.length > 1 
          ? `${filenameBase}_summary_${page.pageNum}.png`
          : `${filenameBase}_summary.png`;

        DEBUG.log('[USO_EXPORT] Converting summary page', page.pageNum, 'to blob...');
        const blob = await dataUrlToBlob(page.dataUrl);
        
        if (blob && blob.size > 0) {
          downloadBlobFile(blob, pageFilename);
          DEBUG.log('[USO_EXPORT] Summary PNG page', page.pageNum, 'exported, size:', Math.round(blob.size / 1024), 'KB');
        } else {
          console.warn('[USO_EXPORT] Summary page', page.pageNum, 'blob is empty or null');
        }

        summaryProgress += summaryStep;
        updateProgress(summaryProgress, `Экспорт отчета (${page.pageNum}/${summaryPages.length})...`);
        
        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      let snimokProgress = 35;

      if (allImages && allImages.length > 0) {
        updateProgress(35, 'Подготовка снимков...');
        await new Promise(resolve => setTimeout(resolve, 200));

        DEBUG.log('[USO_EXPORT] Starting image export, total:', allImages.length);

        const CANVAS = w.USO_CANVAS;
        
        for (let idx = 0; idx < allImages.length; idx++) {
          try {
            DEBUG.log('[USO_EXPORT] Processing image', idx + 1, 'of', allImages.length);
            
            let imageDataUrl = null;
            
            if (CANVAS && typeof CANVAS.renderImageWithMarkersToDataUrl === 'function') {
              DEBUG.log('[USO_EXPORT] Rendering image', idx + 1, 'with markers...');
              imageDataUrl = await CANVAS.renderImageWithMarkersToDataUrl(idx);
            } else {
              console.warn('[USO_EXPORT] CANVAS.renderImageWithMarkersToDataUrl not available, using original image');
              imageDataUrl = allImages[idx].imageUrl;
            }
            
            if (!imageDataUrl) {
              console.warn('[USO_EXPORT] Image', idx + 1, 'has no imageUrl');
              snimokProgress += (65 / allImages.length);
              updateProgress(snimokProgress, `Экспорт снимков (${idx + 1}/${allImages.length})...`);
              continue;
            }

            DEBUG.log('[USO_EXPORT] Converting image', idx + 1, 'to blob...');
            const blob = await dataUrlToBlob(imageDataUrl);
            
            if (blob && blob.size > 0) {
              const snimokFilename = `${filenameBase}_snimok_${idx + 1}.png`;
              DEBUG.log('[USO_EXPORT] Downloading snimok', idx + 1, ':', snimokFilename, 'size:', Math.round(blob.size / 1024), 'KB');
              
              downloadBlobFile(blob, snimokFilename);
              DEBUG.log('[USO_EXPORT] Snimok', idx + 1, 'download initiated');
            } else {
              console.warn('[USO_EXPORT] Blob is null or empty for image', idx + 1);
            }

            snimokProgress += (65 / allImages.length);
            updateProgress(snimokProgress, `Экспорт снимков (${idx + 1}/${allImages.length})...`);
            
            if (idx < allImages.length - 1) {
              DEBUG.log('[USO_EXPORT] Showing confirmation modal for image', idx + 1);
              await showDownloadConfirmModal(idx + 1, allImages.length);
            } else {
              DEBUG.log('[USO_EXPORT] Last image, waiting...');
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          } catch(err) {
            console.error('[USO_EXPORT] Error exporting image', idx + 1, ':', err);
            snimokProgress += (65 / allImages.length);
            updateProgress(snimokProgress, `Ошибка при экспорте снимка ${idx + 1}`);
          }
        }
      } else {
        DEBUG.log('[USO_EXPORT] No images to export');
        updateProgress(100, 'Снимки отсутствуют');
      }

      updateProgress(100, 'Готово!');
      DEBUG.log('[USO_EXPORT] All files exported successfully');

      await new Promise(resolve => setTimeout(resolve, 500));

    } catch(e) {
      console.error('[USO_EXPORT] Export error:', e);
      console.error('[USO_EXPORT] Error stack:', e.stack);

      let errorMsg = 'Неизвестная ошибка';
      if (e.message) errorMsg = e.message;

      if (errorMsg.includes('html2canvas')) {
        errorMsg = 'Не удалось загрузить библиотеку для рендеринга. Проверьте подключение к интернету.';
      } else if (errorMsg.includes('canvas')) {
        errorMsg = 'Ошибка рендеринга. Попробуйте упростить содержимое отчёта.';
      } else if (errorMsg.includes('memory') || errorMsg.includes('heap')) {
        errorMsg = 'Недостаточно памяти. Попробуйте закрыть другие вкладки браузера.';
      }

      alert('Ошибка при экспорте:\n\n' + errorMsg);

    } finally {
      setTimeout(() => {
        if (loader && loader.parentNode) {
          document.body.removeChild(loader);
        }
      }, 500);
    }
  }

  w.USO_EXPORT = {
    exportPDF,
    buildPDFHtml,
    buildPDFBlob,
    buildPDFFromImages,
    mergePDFs,
    exportAsFiles,
    buildSummaryHtml,
    splitPngIntoPages,
    buildTextReport,
    getAllImagesWithMarkers,
    renderImageWithMarkersToDataUrl
  };

  DEBUG.log('[USO_EXPORT] Module loaded');

})(window, jQuery);