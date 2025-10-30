/**
 * uso.canvas.config.js
 * Модуль конфигурации для USO Canvas
 * Содержит: константы, цветовые схемы, режимы работы, debug-систему
 */
(function(w) {
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

  // Режимы работы приложения
  const MODES = {
    PANORAMIC: 'panoramic',
    SIMPLE: 'simple'
  };

  // Цветовая палитра для выбора пользователем
  const swatchColors = {
    blue: '#1565FF',
    ltblue: '#00E5FF',
    white: '#FFFFFF',
    violet: '#B100FF',
    black: '#000000',
    yellow: '#FFEB00',
    green: '#00C853',
    red: '#FF1744'
  };

  // Карта типов маркеров и их цветов
  const colorMap = {
    blue_x: '#1565FF',
    blue_dot: '#1565FF',
    ltblue_x: '#00E5FF',
    ltblue_dot: '#00E5FF',
    white_dot: '#FFFFFF',
    white_line: '#FFFFFF',
    violet_x: '#B100FF',
    violet_line: '#B100FF',
    violet_dot: '#B100FF',
    violet_exc: '#B100FF',
    violet_oval: '#B100FF',
    black_x: '#000000',
    black_dot: '#000000',
    black_exc: '#000000',
    yellow_line: '#FFEB00',
    yellow_dot: '#FFEB00',
    yellow_oval: '#FFD600',
    red_dot: '#FF1744',
    red_q: '#FF1744',
    red_oval: '#FF1744',
    red_exc: '#FF1744',
    green_dot: '#00C853',
    green_q: '#00C853',
    green_oval: '#00C853',
    green_exc: '#00C853',
    green_line: '#00E676'
  };

  /**
   * Получить тип маркера на основе цвета и формы
   * @param {string} color - Цвет маркера
   * @param {string} shape - Форма маркера (point, cross, line, oval, q, exc)
   * @returns {string|null} - Ключ типа маркера или null
   */
  function markerType(color, shape) {
    const map = {
      blue: { point: 'blue_dot', cross: 'blue_x', line: null, oval: null, q: null, exc: null },
      ltblue: { point: 'ltblue_dot', cross: 'ltblue_x', line: null, oval: null, q: null, exc: null },
      white: { point: 'white_dot', cross: null, line: 'white_line', oval: null, q: null, exc: null },
      violet: { point: 'violet_dot', cross: 'violet_x', line: 'violet_line', oval: 'violet_oval', q: null, exc: 'violet_exc' },
      black: { point: 'black_dot', cross: 'black_x', line: null, oval: null, q: null, exc: 'black_exc' },
      yellow: { point: 'yellow_dot', cross: null, line: 'yellow_line', oval: 'yellow_oval', q: null, exc: null },
      green: { point: 'green_dot', cross: null, line: 'green_line', oval: 'green_oval', q: 'green_q', exc: 'green_exc' },
      red: { point: 'red_dot', cross: null, line: null, oval: 'red_oval', q: 'red_q', exc: 'red_exc' }
    };
    const cfg = map[color] || map.blue;
    return cfg[shape] || null;
  }

  /**
   * Конвертация HEX цвета в RGBA
   * @param {string} hex - HEX цвет
   * @param {number} alpha - Прозрачность (0-1)
   * @returns {string} - RGBA строка
   */
  function hexToRgba(hex, alpha) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha != null ? alpha : 0.12) + ')';
  }

  /**
   * Ограничить число в пределах min-max
   * @param {number} n - Число
   * @param {number} min - Минимум
   * @param {number} max - Максимум
   * @returns {number} - Ограниченное число
   */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Экспорт
  U.CanvasConfig = {
    DEBUG,
    MODES,
    swatchColors,
    colorMap,
    markerType,
    hexToRgba,
    clamp
  };

  // Экспортируем DEBUG для других модулей
  U.DEBUG_CANVAS = DEBUG;

  DEBUG.log('[USO_CANVAS_CONFIG] Module loaded');

})(window);
