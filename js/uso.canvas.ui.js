/**
 * uso.canvas.ui.js
 * Модуль UI утилит и управления размерами маркеров
 * Содержит функции для работы с палитрой, размерами, масштабированием
 */
(function(w, $) {
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;
  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Коэффициенты размеров для разных типов фигур
  const SIZE_F = {
    point: 1.5,
    cross: 1.5,
    line: 1.5,
    oval: 1.5,
    text: 2.0
  };

  let markerSizeInput = null;

  /**
   * Обновить фон палитры в соответствии с текущим цветом
   * @param {string} currentColor - Текущий выбранный цвет
   * @param {Object} swatchColors - Карта цветов
   * @param {Function} hexToRgba - Функция конвертации hex в rgba
   */
  function updatePaletteBg(currentColor, swatchColors, hexToRgba) {
    const hex = swatchColors[currentColor] || '#1565FF';
    const rgba = hexToRgba(hex, 0.12);
    const pal = document.querySelector('#uso-calc-app .palette.unified');
    if (pal) pal.style.background = rgba;
  }

  /**
   * Обновить доступность кнопок форм в зависимости от выбранного цвета
   * @param {string} currentColor - Текущий цвет
   * @param {Function} markerType - Функция получения типа маркера
   */
  function updateShapeButtonsAvailability(currentColor, markerType) {
    const btns = document.querySelectorAll('.palette .shape-btn');
    let needSwitch = false;
    let firstAllowed = null;
    btns.forEach(btn => {
      const shape = btn.getAttribute('data-shape') || 'point';
      const allowed = (shape === 'free') ? true : !!markerType(currentColor, shape);
      btn.disabled = !allowed;
      btn.classList.toggle('disabled', !allowed);
      if (allowed && !firstAllowed) firstAllowed = btn;
      if (!allowed && btn.classList.contains('active')) needSwitch = true;
    });
    if (needSwitch && firstAllowed) firstAllowed.click();
  }

  /**
   * Конвертировать значение слайдера в масштаб
   * @param {number} val - Значение слайдера
   * @returns {number} - Масштаб
   */
  function sliderToScale(val) {
    return Math.pow(2, Number(val || 0));
  }

  /**
   * Конвертировать масштаб в значение слайдера
   * @param {number} scale - Масштаб
   * @returns {number} - Значение слайдера
   */
  function scaleToSlider(scale) {
    return Math.log2(Number(scale || 1));
  }

  /**
   * Внедрить элементы управления размером маркеров
   * @param {Object} callbacks - Объект с callback функциями
   */
  function injectSizeControls(callbacks) {
    const host = document.querySelector('#uso-calc-app .panel-controls');
    if (!host) return;

    const wrap = document.createElement('div');
    wrap.className = 'size-controls';

    const label = document.createElement('span');
    label.className = 'mini-label';
    label.textContent = 'Размер метки';

    const ms = document.createElement('input');
    ms.type = 'range';
    ms.min = '-2.0';
    ms.max = '2.0';
    ms.step = '0.01';
    ms.value = '0.00';
    ms.id = 'marker-size';
    ms.title = 'Размер метки';

    wrap.appendChild(label);
    wrap.appendChild(ms);
    host.appendChild(wrap);
    markerSizeInput = ms;

    ms.addEventListener('input', function(e) {
      if (callbacks && callbacks.onSizeChange) {
        const sliderVal = parseFloat(e.target.value || '0');
        callbacks.onSizeChange(sliderVal);
      }
    });

    DEBUG.log('[UI] Size controls injected');
  }

  /**
   * Получить текущее значение слайдера размера
   * @returns {number}
   */
  function getSizeSliderVal() {
    return markerSizeInput ? parseFloat(markerSizeInput.value || '0') : 0;
  }

  /**
   * Установить значение слайдера размера
   * @param {number} v - Значение
   */
  function setSizeSliderVal(v) {
    if (markerSizeInput) markerSizeInput.value = String(v || 0);
  }

  /**
   * Получить текущий множитель размера
   * @returns {number}
   */
  function currentSizeMultiplier() {
    return Math.pow(2, getSizeSliderVal());
  }

  /**
   * Вычислить ширину кисти
   * @param {number} canvasHeight - Высота canvas
   * @param {Function} clamp - Функция ограничения значения
   * @returns {number}
   */
  function brushWidth(canvasHeight, clamp) {
    return clamp(canvasHeight * 0.006 * currentSizeMultiplier(), 2, 12);
  }

  /**
   * Применить текущие настройки к кисти свободного рисования
   * @param {Object} canvas - Fabric canvas
   * @param {string} currentColor - Текущий цвет
   * @param {Object} swatchColors - Карта цветов
   * @param {number} canvasHeight - Высота canvas
   * @param {Function} clamp - Функция ограничения
   */
  function applyFreeBrush(canvas, currentColor, swatchColors, canvasHeight, clamp) {
    if (!canvas) return;
    if (!canvas.freeDrawingBrush) canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = swatchColors[currentColor] || '#1565FF';
    canvas.freeDrawingBrush.width = brushWidth(canvasHeight, clamp);
  }

  /**
   * Применить масштаб к точке (circle)
   * @param {Object} obj - Fabric объект
   * @param {number} sliderVal - Значение слайдера
   * @param {number} canvasHeight - Высота canvas
   */
  function applyPointScale(obj, sliderVal, canvasHeight) {
    if (!obj || obj.type !== 'circle') return;
    if (!obj._norm) obj._norm = {};
    if (typeof obj._norm.rN !== 'number') {
      const baseR = (obj.radius || Math.max(4, Math.round(canvasHeight * 0.011 * SIZE_F.point)));
      obj._norm.rN = baseR / canvasHeight;
    }
    obj._norm.factor = sliderToScale(sliderVal);
    const newR = Math.max(2, obj._norm.rN * canvasHeight * (obj._norm.factor || 1));
    obj.set('radius', newR);
    obj._lastSizeVal = (obj._norm.factor || 1);
  }

  /**
   * Применить размер по слайдеру к объекту
   * @param {Object} obj - Fabric объект
   * @param {number} sliderVal - Значение слайдера
   * @param {number} canvasHeight - Высота canvas
   */
  function applySizeBySlider(obj, sliderVal, canvasHeight) {
    const factor = sliderToScale(sliderVal);
    const h = canvasHeight;
    if (!obj._norm) obj._norm = {};
    obj._norm.factor = factor;
    obj._lastSizeVal = factor;

    switch (obj.type) {
      case 'circle': {
        applyPointScale(obj, sliderVal, h);
        break;
      }
      case 'group': {
        if (typeof obj._norm.wN !== 'number' || typeof obj._norm.strokeN !== 'number') {
          const baseW = obj.getScaledWidth() / (obj.scaleX || 1);
          obj._norm.wN = (baseW && baseW > 0) ? (baseW / h) : 0.032;
          obj._norm.strokeN = (obj._objects?.[0]?.strokeWidth || Math.round(h * 0.0055 * SIZE_F.cross)) / h;
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
          obj._norm.rxN = (obj.rx || Math.round(h * 0.0198 * SIZE_F.oval)) / h;
          obj._norm.ryN = (obj.ry || Math.round(h * 0.0286 * SIZE_F.oval)) / h;
          obj._norm.strokeN = (obj.strokeWidth || Math.round(h * 0.0055 * SIZE_F.oval)) / h;
          obj._norm.cx = (obj.left || 0) + (obj.rx || 0);
          obj._norm.cy = (obj.top || 0) + (obj.ry || 0);
        }
        const rx = (obj._norm.rxN || 0) * h * factor;
        const ry = (obj._norm.ryN || 0) * h * factor;
        const cx = obj._norm.cx || ((obj.left || 0) + (obj.rx || 0));
        const cy = obj._norm.cy || ((obj.top || 0) + (obj.ry || 0));
        obj.rx = rx;
        obj.ry = ry;
        obj.left = cx - rx;
        obj.top = cy - ry;
        obj.strokeUniform = true;
        obj.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        break;
      }
      case 'line': {
        if (typeof obj._norm.strokeN !== 'number') {
          obj._norm.strokeN = (obj.strokeWidth || Math.round(h * 0.0055 * SIZE_F.line)) / h;
        }
        obj.strokeUniform = true;
        obj.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        break;
      }
      case 'text': {
        if (typeof obj._norm.fsN !== 'number') {
          obj._norm.fsN = (obj.fontSize || Math.round(h * 0.032 * 1.4 * SIZE_F.text)) / h;
        }
        obj.fontSize = Math.max(16, (obj._norm.fsN || 0) * h * factor);
        break;
      }
      case 'path': {
        if (typeof obj._norm.strokeN !== 'number') {
          obj._norm.strokeN = (obj.strokeWidth || Math.round(h * 0.0055)) / h;
        }
        obj.strokeUniform = true;
        obj.strokeWidth = Math.max(2, (obj._norm.strokeN || 0) * h * factor);
        break;
      }
    }
  }

  /**
   * Масштабировать маркер при изменении размера canvas
   * @param {Object} o - Fabric объект
   * @param {number} canvasHeight - Высота canvas
   */
  function rescaleMarker(o, canvasHeight) {
    const h = canvasHeight;
    if (!o) return;

    if (o.type === 'circle') {
      if (!o._norm) return;
      const r = (o._norm.rN || 0) * h * (o._norm.factor || 1);
      o.set('radius', Math.max(2, r));
      return;
    }

    if (o.type === 'group') {
      if (!o._norm) {
        const w0 = o.getScaledWidth() / (o.scaleX || 1);
        o._norm = {
          wN: w0 / h,
          strokeN: (o._objects?.[0]?.strokeWidth || Math.round(h * 0.0055 * SIZE_F.cross)) / h,
          factor: 1
        };
      }
      const targetW = (o._norm.wN || 0) * h * (o._norm.factor || 1);
      const baseW = o.getScaledWidth() / (o.scaleX || 1) || 1;
      const k = targetW / baseW;
      o.scaleX = o.scaleY = k;
      (o._objects || []).forEach(l => {
        l.strokeUniform = true;
        l.strokeWidth = Math.max(2, (o._norm.strokeN || 0) * h * (o._norm.factor || 1));
      });
      o.setCoords();
      return;
    }

    if (o.type === 'ellipse') {
      if (o._manuallyScaled && o._absoluteSize) {
        o.rx = o._absoluteSize.rx;
        o.ry = o._absoluteSize.ry;
        o.strokeWidth = o._absoluteSize.strokeWidth;
        o.setCoords();
        return;
      }

      if (!o._norm) {
        o._norm = {
          rxN: (o.rx || Math.round(h * 0.0198 * SIZE_F.oval)) / h,
          ryN: (o.ry || Math.round(h * 0.0286 * SIZE_F.oval)) / h,
          strokeN: (o.strokeWidth || Math.round(h * 0.0055 * SIZE_F.oval)) / h,
          cx: (o.left || 0) + (o.rx || 0),
          cy: (o.top || 0) + (o.ry || 0),
          factor: 1
        };
      }
      const rx = (o._norm.rxN || 0) * h * (o._norm.factor || 1);
      const ry = (o._norm.ryN || 0) * h * (o._norm.factor || 1);
      const cx = o._norm.cx || ((o.left || 0) + (o.rx || 0));
      const cy = o._norm.cy || ((o.top || 0) + (o.ry || 0));
      o.rx = rx;
      o.ry = ry;
      o.left = cx - rx;
      o.top = cy - ry;
      o.strokeUniform = true;
      o.strokeWidth = Math.max(2, (o._norm.strokeN || 0) * h * (o._norm.factor || 1));
      o.setCoords();
      return;
    }

    if (o.type === 'line') {
      if (!o._norm) {
        o._norm = {
          strokeN: (o.strokeWidth || Math.round(h * 0.0055 * SIZE_F.line)) / h,
          factor: 1
        };
      }
      o.strokeUniform = true;
      o.strokeWidth = Math.max(2, (o._norm.strokeN || 0) * h * (o._norm.factor || 1));
      return;
    }

    if (o.type === 'text') {
      if (!o._norm) {
        o._norm = {
          fsN: (o.fontSize || Math.round(h * 0.032 * 1.4 * SIZE_F.text)) / h,
          factor: 1
        };
      }
      o.fontSize = Math.max(16, (o._norm.fsN || 0) * h * (o._norm.factor || 1));
      o.setCoords();
      return;
    }

    if (o.type === 'path') {
      if (!o._norm) {
        o._norm = {
          strokeN: (o.strokeWidth || Math.round(h * 0.0055)) / h,
          factor: 1
        };
      }
      o.strokeWidth = Math.max(2, (o._norm.strokeN || 0) * h * (o._norm.factor || 1));
      o.strokeUniform = true;
      o.setCoords();
      return;
    }
  }

  // Экспорт
  U.CanvasUI = {
    SIZE_F,
    updatePaletteBg,
    updateShapeButtonsAvailability,
    sliderToScale,
    scaleToSlider,
    injectSizeControls,
    getSizeSliderVal,
    setSizeSliderVal,
    currentSizeMultiplier,
    brushWidth,
    applyFreeBrush,
    applyPointScale,
    applySizeBySlider,
    rescaleMarker
  };

  DEBUG.log('[USO_CANVAS_UI] Module loaded');

})(window, jQuery);
