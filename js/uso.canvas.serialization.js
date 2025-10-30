/**
 * uso.canvas.serialization.js
 * Модуль сериализации и десериализации данных canvas
 * Поддерживает сохранение и загрузку всех типов маркеров
 */
(function(w) {
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;
  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Получаем colorMap из модуля конфигурации
  const colorMap = (U.CanvasConfig && U.CanvasConfig.colorMap) || {};

  /**
   * Определить тип фигуры по Fabric объекту
   * @param {Object} obj - Fabric объект
   * @returns {string} - Тип фигуры
   */
  function detectShape(obj) {
    if (obj.type === 'circle') return 'point';
    if (obj.type === 'group') return 'cross';
    if (obj.type === 'line') return 'line';
    if (obj.type === 'ellipse') return 'oval';
    if (obj.type === 'text') {
      const ch = (obj.text || '').trim();
      if (ch === '?') return 'q';
      if (ch === '!') return 'exc';
    }
    if (obj.type === 'path') return 'free';
    return 'point';
  }

  /**
   * Сериализовать маркеры одного изображения
   * @param {Object} imgData - Данные изображения
   * @param {number} canvasWidth - Ширина canvas
   * @param {number} canvasHeight - Высота canvas
   * @returns {Object} - Объект с items и meta
   */
  function serializeImageMarkers(imgData, canvasWidth, canvasHeight) {
    if (!imgData || !imgData.markers) return { items: [], meta: {} };

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

    // Вычисляем scale (canvas → original)
    const scaleToOrig = origW / canvasWidth;

    const items = imgData.markers.map(function(obj) {
      const t = detectShape(obj);

      if (t === 'point') {
        const c = obj.getCenterPoint();
        return {
          v: 2,
          t: 'point',
          m: obj.markerType,
          cx: c.x * scaleToOrig,
          cy: c.y * scaleToOrig,
          radius: (obj.radius || 4) * scaleToOrig,
          sz: (obj._lastSizeVal || 1)
        };
      }

      if (t === 'cross') {
        const c = obj.getCenterPoint();
        return {
          v: 2,
          t: 'cross',
          m: obj.markerType,
          cx: c.x * scaleToOrig,
          cy: c.y * scaleToOrig,
          width: (obj.width || 20) * scaleToOrig,
          height: (obj.height || 20) * scaleToOrig,
          strokeWidth: (obj._objects && obj._objects[0] ? obj._objects[0].strokeWidth : 2) * scaleToOrig,
          ang: (obj.angle || 0),
          sz: (obj._lastSizeVal || 1)
        };
      }

      if (t === 'line') {
        return {
          v: 2,
          t: 'line',
          m: obj.markerType,
          x1: obj.x1 * scaleToOrig,
          y1: obj.y1 * scaleToOrig,
          x2: obj.x2 * scaleToOrig,
          y2: obj.y2 * scaleToOrig,
          strokeWidth: (obj.strokeWidth || 3) * scaleToOrig,
          ang: (obj.angle || 0),
          sz: (obj._lastSizeVal || 1)
        };
      }

      if (t === 'oval') {
        const actualRx = (obj.rx || 0) * (obj.scaleX || 1);
        const actualRy = (obj.ry || 0) * (obj.scaleY || 1);
        const cx = (obj.left || 0) + actualRx;
        const cy = (obj.top || 0) + actualRy;

        return {
          v: 2,
          t: 'oval',
          m: obj.markerType,
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

      if (t === 'q' || t === 'exc') {
        const c = obj.getCenterPoint();
        return {
          v: 2,
          t: t,
          m: obj.markerType,
          cx: c.x * scaleToOrig,
          cy: c.y * scaleToOrig,
          fontSize: (obj.fontSize || 16) * scaleToOrig,
          ang: (obj.angle || 0),
          sz: (obj._lastSizeVal || 1)
        };
      }

      if (t === 'free') {
        return {
          v: 2,
          t: 'free',
          m: 'free',
          path: obj.path,
          left: (obj.left || 0) * scaleToOrig,
          top: (obj.top || 0) * scaleToOrig,
          scaleX: (obj.scaleX || 1) * scaleToOrig,
          scaleY: (obj.scaleY || 1) * scaleToOrig,
          stroke: obj.stroke || '#000',
          strokeWidth: (obj.strokeWidth || 3) * scaleToOrig,
          strokeUniform: !!obj.strokeUniform,
          sz: (obj._lastSizeVal || 1)
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

  /**
   * Создать Fabric объект из сериализованных данных
   * @param {Object} it - Сериализованные данные маркера
   * @param {number} scaleToCanvas - Коэффициент масштабирования
   * @param {number} canvasHeight - Высота canvas
   * @returns {fabric.Object|null} - Fabric объект или null
   */
  function createMarkerFromData(it, scaleToCanvas, canvasHeight) {
    let obj = null;

    if (it.t === 'point') {
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
        originX: 'left',
        originY: 'top',
        selectable: true,
        evented: true
      });

      obj.set('markerType', it.m);
      obj._norm = { rN: radius / canvasHeight, factor: it.sz || 1 };
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'cross') {
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const width = (it.width || 20) * scaleToCanvas;
      const height = (it.height || 20) * scaleToCanvas;
      const strokeWidth = (it.strokeWidth || 2) * scaleToCanvas;

      const l1 = new fabric.Line([-width / 2, -height / 2, width / 2, height / 2], {
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: strokeWidth,
        strokeUniform: true
      });
      const l2 = new fabric.Line([-width / 2, height / 2, width / 2, -height / 2], {
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: strokeWidth,
        strokeUniform: true
      });

      obj = new fabric.Group([l1, l2], {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        selectable: true,
        evented: true
      });

      if (it.ang) obj.set({ angle: it.ang });
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'line') {
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
        originX: 'left',
        originY: 'top'
      });

      if (it.ang) obj.set({ angle: it.ang });
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'oval') {
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const rx = (it.rx || 10) * scaleToCanvas;
      const ry = (it.ry || 14) * scaleToCanvas;

      obj = new fabric.Ellipse({
        left: cx - rx,
        top: cy - ry,
        rx,
        ry,
        fill: 'transparent',
        stroke: colorMap[it.m] || '#1565FF',
        strokeWidth: (it.strokeWidth || 2) * scaleToCanvas,
        strokeUniform: true,
        originX: 'left',
        originY: 'top',
        selectable: true,
        evented: true
      });

      if (it.ang) obj.set({ angle: it.ang });
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
      obj._manuallyScaled = !!it.manual;
    }
    else if (it.t === 'q' || it.t === 'exc') {
      const ch = (it.t === 'q') ? '?' : '!';
      const cx = (it.cx || 0) * scaleToCanvas;
      const cy = (it.cy || 0) * scaleToCanvas;
      const fontSize = (it.fontSize || 16) * scaleToCanvas;

      obj = new fabric.Text(ch, {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        fontSize: fontSize,
        fontWeight: 'bold',
        fill: colorMap[it.m] || '#1565FF',
        selectable: true,
        evented: true,
        textBaseline: 'middle'
      });

      if (it.ang) obj.set({ angle: it.ang });
      obj.set('markerType', it.m);
      obj._lastSizeVal = it.sz || 1;
    }
    else if (it.t === 'free' && Array.isArray(it.path)) {
      obj = new fabric.Path(it.path, {
        left: (it.left || 0) * scaleToCanvas,
        top: (it.top || 0) * scaleToCanvas,
        scaleX: (it.scaleX || 1) * scaleToCanvas,
        scaleY: (it.scaleY || 1) * scaleToCanvas,
        fill: 'transparent',
        stroke: it.stroke || '#000',
        strokeWidth: (it.strokeWidth || 3) * scaleToCanvas,
        strokeUniform: true,
        selectable: true,
        evented: true,
        originX: 'left',
        originY: 'top'
      });

      obj.set('markerType', 'free');
      obj._lastSizeVal = it.sz || 1;
    }

    return obj;
  }

  /**
   * Загрузить маркеры в конкретное изображение
   * @param {Object} imgData - Данные изображения
   * @param {Array} items - Массив сериализованных маркеров
   * @param {Object} meta - Метаданные (ширина, высота)
   * @param {number} canvasWidth - Ширина canvas
   * @param {number} canvasHeight - Высота canvas
   * @returns {number} - Количество загруженных маркеров
   */
  function loadMarkersToImage(imgData, items, meta, canvasWidth, canvasHeight) {
    if (!imgData || !imgData.markers || !items) return 0;

    const origW = (meta && meta.w) ? meta.w : canvasWidth;
    const origH = (meta && meta.h) ? meta.h : canvasHeight;
    const scaleToCanvas = canvasWidth / origW;

    let loadedCount = 0;

    items.forEach(function(it) {
      const obj = createMarkerFromData(it, scaleToCanvas, canvasHeight);
      if (obj) {
        imgData.markers.push(obj);
        loadedCount++;
      }
    });

    return loadedCount;
  }

  // Экспорт
  U.CanvasSerialization = {
    detectShape,
    serializeImageMarkers,
    createMarkerFromData,
    loadMarkersToImage
  };

  DEBUG.log('[USO_CANVAS_SERIALIZATION] Module loaded');

})(window);
