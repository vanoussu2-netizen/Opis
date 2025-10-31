/**
 * USO Canvas Markers Module
 *
 * Управление маркерами: создание, удаление, undo/redo
 */

(function(w, $){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Получаем зависимости из других модулей
  const getSizeF = () => U.CanvasUI ? U.CanvasUI.SIZE_F : {};
  const getColorMap = () => U.CanvasConfig ? U.CanvasConfig.colorMap : {};
  const clamp = U.CanvasConfig ? U.CanvasConfig.clamp : ((n, min, max) => Math.max(min, Math.min(max, n)));

  // Флаг для предотвращения рекурсии при восстановлении истории
  let restoringHistory = false;

  /**
   * Определить тип фигуры по markerType
   */
  function inferShapeFromType(mt) {
    if (!mt) return 'point';
    if (/_line$/.test(mt)) return 'line';
    if (/_dot$/.test(mt)) return 'point';
    if (/_x$/.test(mt)) return 'cross';
    if (/_oval$/.test(mt)) return 'oval';
    if (/_q$/.test(mt)) return 'q';
    if (/_exc$/.test(mt)) return 'exc';
    return 'point';
  }

  /**
   * Создать линию
   */
  function createLine(x1, y1, x2, y2, markerTypeKey, strokeW, canvasHeight) {
    const colorMap = getColorMap();
    const SIZE_F = getSizeF();
    const color = colorMap[markerTypeKey] || '#1565FF';
    const h = canvasHeight || 600;

    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: color,
      strokeWidth: strokeW || Math.max(2, Math.round(h * 0.0055 * (SIZE_F.line || 1))),
      strokeUniform: true,
      selectable: true,
      evented: true,
      originX: 'left',
      originY: 'top',
      perPixelTargetFind: true
    });

    line.set('markerType', markerTypeKey);
    line._norm = { strokeN: (line.strokeWidth || 3) / h, factor: 1 };
    return line;
  }

  /**
   * Создать фигуру (точка, крест, овал, текст)
   */
  function createShape(shape, x, y, markerTypeKey, canvasHeight) {
    const h = canvasHeight || 600;
    const colorMap = getColorMap();
    const SIZE_F = getSizeF();
    const color = colorMap[markerTypeKey] || '#1565FF';

    if (h <= 0) {
      console.warn('[USO_MARKERS] Invalid canvas height:', h);
      return null;
    }

    try {
      // ТОЧКА
      if (shape === 'point') {
        const r = Math.max(4, Math.round(h * 0.011 * (SIZE_F.point || 1)));
        const circle = new fabric.Circle({
          left: x - r,
          top: y - r,
          radius: r,
          fill: color,
          stroke: (markerTypeKey === 'white_dot') ? '#000' : 'transparent',
          strokeWidth: (markerTypeKey === 'white_dot') ? 1 : 0,
          originX: 'left',
          originY: 'top',
          selectable: true,
          evented: true
        });
        circle.set('markerType', markerTypeKey);
        circle._norm = { rN: r / h, factor: 1 };
        circle._lastSizeVal = 1;
        return circle;
      }

      // КРЕСТ
      if (shape === 'cross') {
        const len = Math.max(12, Math.round(h * 0.032 * (SIZE_F.cross || 1)));
        const sw = Math.max(2, Math.round(h * 0.0055 * (SIZE_F.cross || 1)));
        const l1 = new fabric.Line([-len/2, -len/2, len/2, len/2], {
          stroke: color,
          strokeWidth: sw,
          strokeUniform: true
        });
        const l2 = new fabric.Line([-len/2, len/2, len/2, -len/2], {
          stroke: color,
          strokeWidth: sw,
          strokeUniform: true
        });
        const grp = new fabric.Group([l1, l2], {
          left: x,
          top: y,
          originX: 'center',
          originY: 'center',
          selectable: true,
          evented: true
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

      // ОВАЛ
      if (shape === 'oval') {
        const rx = Math.max(10, Math.round(h * 0.0198 * (SIZE_F.oval || 1)));
        const ry = Math.max(14, Math.round(h * 0.0286 * (SIZE_F.oval || 1)));
        const sw = Math.max(2, Math.round(h * 0.0055 * (SIZE_F.oval || 1)));
        const el = new fabric.Ellipse({
          left: x - rx,
          top: y - ry,
          rx,
          ry,
          fill: 'transparent',
          stroke: color,
          strokeWidth: sw,
          strokeUniform: true,
          originX: 'left',
          originY: 'top',
          selectable: true,
          evented: true
        });
        el.set('markerType', markerTypeKey);
        el._norm = {
          rxN: rx / h,
          ryN: ry / h,
          strokeN: sw / h,
          cx: x,
          cy: y,
          factor: 1
        };
        el._lastSizeVal = 1;
        return el;
      }

      // ВОПРОС / ВОСКЛИЦАТЕЛЬНЫЙ ЗНАК
      if (shape === 'q' || shape === 'exc') {
        const ch = (shape === 'q') ? '?' : '!';
        const fs = Math.max(16, Math.round(h * 0.032 * 1.4 * (SIZE_F.text || 1)));
        const txt = new fabric.Text(ch, {
          left: x,
          top: y,
          originX: 'center',
          originY: 'center',
          fontSize: fs,
          fontWeight: 'bold',
          fill: color,
          selectable: true,
          evented: true,
          textBaseline: 'middle'
        });
        txt.set('markerType', markerTypeKey);
        txt._norm = { fsN: fs / h, factor: 1 };
        txt._lastSizeVal = 1;
        return txt;
      }

      console.warn('[USO_MARKERS] Unknown shape:', shape);
      return null;

    } catch (err) {
      console.error('[USO_MARKERS] Failed to create shape:', shape, err);
      return null;
    }
  }

  /**
   * Добавить маркер на canvas
   */
  function addMarker(canvas, markerType, x, y, getMarkersFn, applySizeFn, pushHistoryFn) {
    if (!canvas || !markerType) return null;

    const shape = inferShapeFromType(String(markerType));
    const h = canvas.getHeight();
    const SIZE_F = getSizeF();
    let obj = null;

    if (shape === 'line') {
      const sw = Math.max(2, Math.round(h * 0.0055 * (SIZE_F.line || 1)));
      const dx = Math.max(10, Math.round(h * 0.022 * (SIZE_F.line || 1)));
      const dy = Math.max(10, Math.round(h * 0.0165 * (SIZE_F.line || 1)));
      obj = createLine(x, y, x + dx, y + dy, markerType, sw, h);
    } else if (shape === 'free') {
      return null;
    } else {
      obj = createShape(shape, x, y, markerType, h);
    }

    if (obj) {
      canvas.add(obj);

      // Добавляем в список маркеров
      if (typeof getMarkersFn === 'function') {
        const markers = getMarkersFn();
        markers.push(obj);
      }

      // Применяем размер
      if (typeof applySizeFn === 'function') {
        applySizeFn(obj);
      }

      canvas.setActiveObject(obj);
      canvas.requestRenderAll();

      // Сохраняем в историю
      if (typeof pushHistoryFn === 'function') {
        pushHistoryFn();
      }
    }

    return obj;
  }

  /**
   * Удалить выделенные маркеры
   */
  function deleteSelection(canvas, getMarkersFn, setMarkersFn, pushHistoryFn) {
    if (!canvas) return;

    const ao = canvas.getActiveObject();
    if (!ao) return;

    let markers = [];
    if (typeof getMarkersFn === 'function') {
      markers = getMarkersFn();
    }

    if (ao.type === 'activeSelection' && ao._objects) {
      // Удаляем множественное выделение
      ao._objects.forEach(o => {
        canvas.remove(o);
        const idx = markers.indexOf(o);
        if (idx > -1) markers.splice(idx, 1);
      });
      canvas.discardActiveObject();
    } else {
      // Удаляем один объект
      canvas.remove(ao);
      const idx = markers.indexOf(ao);
      if (idx > -1) markers.splice(idx, 1);
    }

    // Обновляем список маркеров
    if (typeof setMarkersFn === 'function') {
      setMarkersFn(markers);
    }

    canvas.requestRenderAll();

    // Отключаем кнопку удаления
    $('#uso-del').prop('disabled', true);

    // Сохраняем в историю
    if (typeof pushHistoryFn === 'function') {
      pushHistoryFn();
    }
  }

  /**
   * Сохранить состояние в историю
   */
  function pushHistory(historyArray, serializeFn, maxHistory = 20) {
    if (restoringHistory || !serializeFn) return;

    try {
      const snap = serializeFn();
      historyArray.push(snap);

      if (historyArray.length > maxHistory) {
        historyArray.shift();
      }

      $('#uso-undo').prop('disabled', historyArray.length <= 1);
      DEBUG.log('[USO_MARKERS] History pushed, length:', historyArray.length);
    } catch (err) {
      console.error('[USO_MARKERS] Failed to push history:', err);
    }
  }

  /**
   * Отменить последнее действие (undo)
   */
  function undoLast(canvas, historyArray, loadFn, fitImageFn, imgData) {
    if (!canvas || historyArray.length <= 1) return;

    restoringHistory = true;

    try {
      historyArray.pop();
      const prev = historyArray[historyArray.length - 1];

      if (prev) {
        // Восстанавливаем фоновое изображение
        if (imgData && imgData.bgImg && typeof fitImageFn === 'function') {
          fitImageFn(imgData.bgImg, false);
        }

        // Загружаем предыдущее состояние
        if (typeof loadFn === 'function') {
          loadFn(prev);
        }

        canvas.discardActiveObject();
        $('#uso-del').prop('disabled', true);
      }
    } finally {
      restoringHistory = false;
      $('#uso-undo').prop('disabled', historyArray.length <= 1);
    }

    DEBUG.log('[USO_MARKERS] Undo completed, history length:', historyArray.length);
  }

  // ============================================
  // ЭКСПОРТ
  // ============================================

  U.CanvasMarkers = {
    inferShapeFromType,
    createLine,
    createShape,
    addMarker,
    deleteSelection,
    pushHistory,
    undoLast
  };

  DEBUG.log('[USO_MARKERS] Module loaded');

})(window, jQuery);
