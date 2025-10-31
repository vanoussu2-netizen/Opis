/**
 * USO Canvas Midline Module
 *
 * Управление средней линией (midline) для стоматологических снимков:
 * - Включение/выключение режима средней линии
 * - Создание и позиционирование линии
 * - Обработка перемещения линии
 */

(function(w, $){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Получаем зависимости из других модулей
  const clamp = U.CanvasConfig ? U.CanvasConfig.clamp : ((n, min, max) => Math.max(min, Math.min(max, n)));
  const getMainCanvas = U.CanvasState ? U.CanvasState.getMainCanvas : (() => null);

  // Состояние midline
  let midline = null;
  let midlineMode = false;
  let midlineShown = false;

  /**
   * Получить Y-координату средней линии
   */
  function midlineY() {
    const mainCanvas = getMainCanvas();
    const h = mainCanvas ? mainCanvas.getHeight() : 0;
    if (!midline) return h / 2;
    return (typeof midline.y1 === 'number') ? midline.y1 : h / 2;
  }

  /**
   * Создать/пересоздать среднюю линию
   * @param {boolean} preserve - Сохранить относительную позицию при пересоздании
   */
  function ensureMidline(preserve) {
    const mainCanvas = getMainCanvas();
    if (!mainCanvas) return;

    let prevFrac = null;
    if (preserve && midline && mainCanvas.getHeight()) {
      prevFrac = midlineY() / mainCanvas.getHeight();
    }

    if (midline) {
      mainCanvas.remove(midline);
      midline = null;
    }

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();
    const y = (prevFrac != null) ? clamp(prevFrac * h, 0, h) : h / 2;

    midline = new fabric.Line([0, y, w, y], {
      stroke: 'rgba(0,0,0,0.3)',
      strokeWidth: 2,
      strokeDashArray: [6, 6],
      selectable: false,
      evented: false,
      hasControls: false,
      lockMovementX: true,
      hoverCursor: 'default',
      excludeFromExport: true,
      visible: midlineShown
    });

    midline.set('markerType', '__midline__');
    mainCanvas.add(midline);
    mainCanvas.bringToFront(midline);
    mainCanvas.requestRenderAll();

    DEBUG.log('[USO_MIDLINE] Midline created at y:', y);
  }

  /**
   * Включить/выключить режим средней линии
   * @param {boolean} flag - Включить (true) или выключить (false)
   * @param {Function} syncMarkModeFn - Callback для синхронизации режима маркировки
   */
  function setMidlineMode(flag, syncMarkModeFn) {
    const mainCanvas = getMainCanvas();
    if (!mainCanvas) return;

    midlineMode = !!flag;

    if (midlineMode) {
      // Включаем режим средней линии
      if (!midline) ensureMidline();
      if (!midlineShown) {
        midlineShown = true;
        midline.set('visible', true);
      }

      midline.set({
        stroke: '#d32f2f',
        strokeWidth: 4,
        strokeDashArray: null,
        selectable: true,
        evented: true,
        hasControls: false,
        lockMovementX: true,
        hoverCursor: 'ns-resize'
      });
    } else {
      // Выключаем режим средней линии
      if (midline) {
        midline.set({
          stroke: 'rgba(0,0,0,0.35)',
          strokeWidth: 2,
          strokeDashArray: [6, 6],
          selectable: false,
          evented: false,
          hasControls: false,
          lockMovementX: true,
          hoverCursor: 'default',
          visible: midlineShown
        });
      }
    }

    // Синхронизируем режим маркировки
    if (typeof syncMarkModeFn === 'function') {
      syncMarkModeFn();
    }

    // Обновляем кнопку
    const btn = document.getElementById('img-rotate');
    if (btn) {
      btn.classList.toggle('active', midlineMode);
      btn.setAttribute('aria-pressed', midlineMode ? 'true' : 'false');
      btn.textContent = 'Ср. линия' + (midlineMode ? ' (вкл)' : '');
    }

    mainCanvas.requestRenderAll();
    DEBUG.log('[USO_MIDLINE] Midline mode:', midlineMode);
  }

  /**
   * Получить состояние режима средней линии
   */
  function getMidlineMode() {
    return midlineMode;
  }

  /**
   * Получить объект средней линии
   */
  function getMidline() {
    return midline;
  }

  /**
   * Обработать перемещение средней линии (ограничить по Y, зафиксировать по X)
   * @param {fabric.Line} lineObj - Объект линии
   */
  function handleMidlineMoving(lineObj) {
    const mainCanvas = getMainCanvas();
    if (!mainCanvas || lineObj !== midline) return;

    const h = mainCanvas.getHeight();
    const w = mainCanvas.getWidth();
    const cp = lineObj.getCenterPoint();
    const yy = clamp(cp.y, 0, h);

    lineObj.set({
      x1: 0,
      y1: yy,
      x2: w,
      y2: yy,
      left: 0,
      top: yy
    });

    lineObj.setCoords();
    mainCanvas.requestRenderAll();
  }

  /**
   * Показать/скрыть среднюю линию
   * @param {boolean} visible - Показать (true) или скрыть (false)
   */
  function setMidlineVisible(visible) {
    midlineShown = !!visible;
    if (midline) {
      midline.set('visible', midlineShown);
      const mainCanvas = getMainCanvas();
      if (mainCanvas) {
        mainCanvas.requestRenderAll();
      }
    }
  }

  // ============================================
  // ЭКСПОРТ
  // ============================================

  U.CanvasMidline = {
    midlineY,
    ensureMidline,
    setMidlineMode,
    getMidlineMode,
    getMidline,
    handleMidlineMoving,
    setMidlineVisible
  };

  DEBUG.log('[USO_MIDLINE] Module loaded');

})(window, jQuery);
