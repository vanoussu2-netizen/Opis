/**
 * USO Canvas Cropping Module
 *
 * Управление обрезкой изображений:
 * - Создание прямоугольника для обрезки
 * - Настройка соотношения сторон
 * - Применение и отмена обрезки
 */

(function(w, $){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Получаем зависимости из других модулей
  const clamp = U.CanvasConfig ? U.CanvasConfig.clamp : ((n, min, max) => Math.max(min, Math.min(max, n)));
  const getMainCanvas = U.CanvasState ? U.CanvasState.getMainCanvas : (() => null);
  const getCurrentImage = U.CanvasState ? U.CanvasState.getCurrentImage : (() => null);
  const getCurrentImageIndex = U.CanvasState ? U.CanvasState.getCurrentImageIndex : (() => 0);
  const getAllImages = U.CanvasState ? U.CanvasState.getAllImages : (() => []);
  const fitImageToCanvas = U.CanvasImages ? U.CanvasImages.fitImageToCanvas : (() => {});

  // Состояние обрезки
  let cropping = null;

  /**
   * Удержать прямоугольник в границах canvas
   * @param {fabric.Rect} rect - Прямоугольник обрезки
   */
  function keepRectInBounds(rect) {
    const mainCanvas = getMainCanvas();
    if (!mainCanvas) return;

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();

    rect.left = clamp(rect.left, 0, Math.max(0, w - rect.getScaledWidth()));
    rect.top = clamp(rect.top, 0, Math.max(0, h - rect.getScaledHeight()));

    rect.setCoords();
    mainCanvas.requestRenderAll();
  }

  /**
   * Применить соотношение сторон при масштабировании
   * @param {fabric.Rect} rect - Прямоугольник обрезки
   */
  function applyRatioOnScale(rect) {
    const ratio = cropping && cropping.ratio || 'free';
    if (ratio === 'free') return;

    const parts = ratio.split(':');
    const rw = parseFloat(parts[0] || '0');
    const rh = parseFloat(parts[1] || '0');

    if (!(rw > 0 && rh > 0)) return;

    const target = rw / rh;
    const w0 = rect.width * rect.scaleX;
    const h0 = rect.height * rect.scaleY;
    const cur = w0 / h0;

    if (Math.abs(cur - target) < 1e-3) return;

    rect.scaleY = (w0 / target) / rect.height;
  }

  /**
   * Начать обрезку изображения
   * @param {string} ratio - Соотношение сторон ('free', '1:1', '4:3', '16:9' и т.д.)
   * @param {Function} syncMarkModeFn - Callback для синхронизации режима маркировки
   * @param {boolean} markingMode - Текущий режим маркировки
   * @returns {boolean} - Успешность начала обрезки
   */
  function startCrop(ratio, syncMarkModeFn, markingMode) {
    const mainCanvas = getMainCanvas();
    if (!mainCanvas) return false;

    const imgData = getCurrentImage();
    if (!imgData || !imgData.bgImg) return false;

    // Если уже идет обрезка, отменяем предыдущую
    if (cropping) cancelCrop(syncMarkModeFn);

    const prevMarking = markingMode;

    // Отключаем режим маркировки
    if (typeof syncMarkModeFn === 'function') {
      syncMarkModeFn(false);
    }

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();
    const cw = Math.round(w * 0.8);
    const ch = Math.round(h * 0.8);

    const rect = new fabric.Rect({
      left: Math.round((w - cw) / 2),
      top: Math.round((h - ch) / 2),
      width: cw,
      height: ch,
      fill: 'rgba(0,0,0,0.06)',
      stroke: '#1976d2',
      strokeWidth: 2,
      hasBorders: true,
      hasControls: true,
      cornerColor: '#1976d2',
      transparentCorners: false,
      lockRotation: true,
      selectable: true,
      evented: true,
      objectCaching: false
    });

    rect.setControlsVisibility({ mtr: false });

    mainCanvas.add(rect);
    mainCanvas.bringToFront(rect);
    mainCanvas.setActiveObject(rect);

    cropping = {
      rect,
      ratio: ratio || 'free',
      _prevMarking: prevMarking
    };

    mainCanvas.requestRenderAll();

    DEBUG.log('[USO_CROPPING] Crop started with ratio:', ratio);
    return true;
  }

  /**
   * Установить соотношение сторон для обрезки
   * @param {string} ratio - Соотношение сторон
   */
  function setCropRatio(ratio) {
    if (!cropping) return;

    cropping.ratio = ratio || 'free';

    if (cropping.rect) {
      applyRatioOnScale(cropping.rect);
      keepRectInBounds(cropping.rect);
    }

    DEBUG.log('[USO_CROPPING] Crop ratio changed to:', ratio);
  }

  /**
   * Применить обрезку
   * @param {Function} resetMarkersFn - Callback для сброса маркеров
   * @param {Function} pushHistoryFn - Callback для сохранения в историю
   * @param {Function} syncMarkModeFn - Callback для синхронизации режима маркировки
   * @returns {Promise<boolean>} - Успешность применения обрезки
   */
  async function applyCrop(resetMarkersFn, pushHistoryFn, syncMarkModeFn) {
    const mainCanvas = getMainCanvas();
    if (!cropping || !mainCanvas) return false;

    const images = getAllImages();
    const activeImageIndex = getCurrentImageIndex();
    const imgData = images[activeImageIndex];
    if (!imgData || !imgData.bgImg) return false;

    const rect = cropping.rect;
    const imgEl = (typeof imgData.bgImg.getElement === 'function')
      ? imgData.bgImg.getElement()
      : imgData.bgImg._element;

    const natW = imgEl.naturalWidth || imgEl.width;
    const natH = imgEl.naturalHeight || imgEl.height;

    const sx = Math.max(0, Math.round((rect.left - (imgData.bgImg.left || 0)) / (imgData.bgImg.scaleX || 1)));
    const sy = Math.max(0, Math.round((rect.top - (imgData.bgImg.top || 0)) / (imgData.bgImg.scaleY || 1)));
    const sw = Math.max(1, Math.round(rect.getScaledWidth() / (imgData.bgImg.scaleX || 1)));
    const sh = Math.max(1, Math.round(rect.getScaledHeight() / (imgData.bgImg.scaleY || 1)));

    const cx = clamp(sx, 0, natW - 1);
    const cy = clamp(sy, 0, natH - 1);
    const cw = clamp(sw, 1, natW - cx);
    const ch = clamp(sh, 1, natH - cy);

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, cx, cy, cw, ch, 0, 0, cw, ch);

    const dataUrl = canvas.toDataURL('image/png', 0.98);

    return new Promise(function(resolve) {
      fabric.Image.fromURL(dataUrl, function(fabricImg) {
        if (!fabricImg) {
          console.error('[USO_CROPPING] Failed to create cropped image');
          resolve(false);
          return;
        }

        fabricImg.set({ selectable: false, evented: false });
        imgData.bgImg = fabricImg;

        // Сбрасываем маркеры
        if (typeof resetMarkersFn === 'function') {
          resetMarkersFn();
        }

        fitImageToCanvas(fabricImg, false);
        mainCanvas.remove(rect);
        cropping = null;

        // Отключаем режим маркировки
        if (typeof syncMarkModeFn === 'function') {
          syncMarkModeFn(false);
        }

        // Сохраняем в историю
        if (typeof pushHistoryFn === 'function') {
          pushHistoryFn();
        }

        const cont = document.getElementById('uso-canvas-container');
        if (cont) {
          cont.style.resize = 'both';
          cont.style.overflow = 'auto';
          cont.style.minWidth = cont.style.minWidth || '320px';
          cont.style.minHeight = cont.style.minHeight || '240px';
        }

        DEBUG.log('[USO_CROPPING] Crop applied successfully');
        resolve(true);
      }, { crossOrigin: 'anonymous' });
    });
  }

  /**
   * Отменить обрезку
   * @param {Function} syncMarkModeFn - Callback для синхронизации режима маркировки
   */
  function cancelCrop(syncMarkModeFn) {
    if (!cropping) return;

    const mainCanvas = getMainCanvas();
    if (cropping.rect && mainCanvas) {
      mainCanvas.remove(cropping.rect);
    }

    const prevMarking = cropping._prevMarking;
    cropping = null;

    // Восстанавливаем режим маркировки
    if (typeof syncMarkModeFn === 'function') {
      syncMarkModeFn(!!prevMarking);
    }

    DEBUG.log('[USO_CROPPING] Crop cancelled');
  }

  /**
   * Получить состояние обрезки
   * @returns {Object|null} - Объект с информацией об обрезке или null
   */
  function getCropping() {
    return cropping;
  }

  /**
   * Проверить, идет ли обрезка
   * @returns {boolean}
   */
  function isCropping() {
    return !!cropping;
  }

  // ============================================
  // ЭКСПОРТ
  // ============================================

  U.CanvasCropping = {
    keepRectInBounds,
    applyRatioOnScale,
    startCrop,
    setCropRatio,
    applyCrop,
    cancelCrop,
    getCropping,
    isCropping
  };

  DEBUG.log('[USO_CROPPING] Module loaded');

})(window, jQuery);
