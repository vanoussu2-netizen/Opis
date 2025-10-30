/**
 * uso.canvas.images.js
 * Модуль управления изображениями
 * Содержит: загрузка изображений, работа с ориентацией, подгонка к canvas, переключение между снимками
 */
(function(w) {
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;
  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  /**
   * Создать структуру данных для изображения
   * @param {string} type - Тип снимка (panoramic/simple)
   * @returns {Object} - Объект данных изображения
   */
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

  /**
   * Загрузить скрипт динамически
   * @param {string} src - URL скрипта
   * @returns {Promise}
   */
  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /**
   * Нарисовать изображение с учетом EXIF ориентации
   * @param {HTMLImageElement} img - Изображение
   * @param {number} orientation - EXIF ориентация (1-8)
   * @returns {string} - Data URL результата
   */
  function drawWithOrientationExact(img, orientation) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    if (orientation === 3) {
      c.width = iw;
      c.height = ih;
      ctx.translate(iw, ih);
      ctx.rotate(Math.PI);
    } else if (orientation === 6) {
      c.width = ih;
      c.height = iw;
      ctx.translate(ih, 0);
      ctx.rotate(Math.PI / 2);
    } else if (orientation === 8) {
      c.width = ih;
      c.height = iw;
      ctx.translate(0, iw);
      ctx.rotate(-Math.PI / 2);
    } else {
      c.width = iw;
      c.height = ih;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, iw, ih, 0, 0, c.width, c.height);
    return c.toDataURL('image/png', 0.98);
  }

  /**
   * Загрузить изображение как HTMLImageElement
   * @param {string} url - URL изображения
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImageElement(url) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.onload = function() {
        resolve(img);
      };
      img.onerror = function() {
        reject(new Error('image load error'));
      };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  /**
   * Подогнать изображение к размеру canvas
   * @param {Object} canvas - Fabric canvas
   * @param {fabric.Image} img - Fabric изображение
   * @param {boolean} keepObjects - Сохранить существующие объекты
   * @param {Function} getMarkersCallback - Функция для получения маркеров
   * @param {Function} ensureMidlineCallback - Функция для обновления средней линии
   * @param {Function} applyBrushCallback - Функция для применения настроек кисти
   * @param {Function} rescaleCallback - Функция для масштабирования маркеров
   */
  function fitImageToCanvas(canvas, img, keepObjects, getMarkersCallback, ensureMidlineCallback, applyBrushCallback, rescaleCallback) {
    if (!img || !canvas) return;

    const wrap = document.getElementById('uso-canvas-container');
    const innerW = Math.max(320, wrap.clientWidth || 320);
    const innerH0 = wrap.clientHeight || 0;
    const useH = innerH0 > 0 ? innerH0 : getAvailCanvasHeight(wrap);

    const source = (typeof img.getElement === 'function') ? img.getElement() : img._element;
    const natW = source.naturalWidth || source.width;
    const natH = source.naturalHeight || source.height;
    if (!natW || !natH) return;

    const scaleW = innerW / natW;
    const scaleH = useH / natH;
    let scale = Math.min(scaleW, scaleH);
    if (!isFinite(scale) || scale <= 0) scale = scaleW || 1;

    const targetW = Math.round(natW * scale);
    const targetH = Math.round(natH * scale);

    const vpt = [1, 0, 0, 1, 0, 0];
    canvas.setViewportTransform(vpt);
    canvas.setZoom(1);
    canvas.clear();

    img.set({
      left: 0,
      top: 0,
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      angle: 0
    });

    canvas.setWidth(targetW);
    canvas.setHeight(targetH);

    canvas.add(img);
    canvas.sendToBack(img);

    if (keepObjects && getMarkersCallback) {
      const markers = getMarkersCallback();
      markers.forEach(function(o) {
        canvas.add(o);
      });
    }

    if (ensureMidlineCallback) ensureMidlineCallback(true);
    if (applyBrushCallback) applyBrushCallback();
    if (rescaleCallback) rescaleCallback();

    canvas.requestRenderAll();

    DEBUG.log('[Images] Image fitted to canvas:', targetW, 'x', targetH);
  }

  /**
   * Получить доступную высоту для canvas
   * @param {HTMLElement} wrap - Контейнер
   * @returns {number} - Высота в пикселях
   */
  function getAvailCanvasHeight(wrap) {
    const vpH = (window.visualViewport && window.visualViewport.height) ?
                window.visualViewport.height : window.innerHeight;
    const rect = wrap.getBoundingClientRect();
    const paddingBottom = 16;
    const free = vpH - rect.top - paddingBottom;
    return Math.max(240, free);
  }

  /**
   * Получить текущее изображение canvas
   * @param {Object} canvas - Fabric canvas
   * @returns {fabric.Image|null}
   */
  function canvasImage(canvas) {
    if (!canvas) return null;
    const objs = canvas.getObjects();
    for (let i = 0; i < objs.length; i++) {
      if (objs[i].type === 'image') return objs[i];
    }
    return null;
  }

  /**
   * Проверить наличие изображения на canvas
   * @param {Object} canvas - Fabric canvas
   * @returns {boolean}
   */
  function hasImage(canvas) {
    return !!canvasImage(canvas);
  }

  /**
   * Сбросить вид canvas (зум и позицию)
   * @param {Object} canvas - Fabric canvas
   */
  function resetView(canvas) {
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(1);
    canvas.requestRenderAll();
    DEBUG.log('[Images] View reset');
  }

  // Экспорт
  U.CanvasImages = {
    createImageData,
    loadScript,
    drawWithOrientationExact,
    loadImageElement,
    fitImageToCanvas,
    getAvailCanvasHeight,
    canvasImage,
    hasImage,
    resetView
  };

  DEBUG.log('[USO_CANVAS_IMAGES] Module loaded');

})(window);
