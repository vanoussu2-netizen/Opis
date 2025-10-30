/**
 * USO Utilities Module
 * Общие утилиты для всех модулей проекта
 *
 * ✅ Исправлено дублирование кода:
 * - maskPhone (была 3 копии)
 * - htmlToText (были 2 копии)
 * - escapeHTML (разбросано по файлам)
 *
 * ✅ Добавлена защита от XSS
 */
(function(w){
  'use strict';

  if (!w.USO) w.USO = {};

  // =========================================================================
  // DEBUG СИСТЕМА
  // =========================================================================

  const DEBUG = {
    enabled: false,
    _initialized: false,

    _checkInit: function() {
      if (!this._initialized) {
        const assets = w.USO.ASSETS || {};
        this.enabled = assets.debug_mode === true || assets.debug_mode === '1';

        // Можно включить через localStorage для разработки
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

  // =========================================================================
  // КОНСТАНТЫ
  // =========================================================================

  const MODES = {
    PANORAMIC: 'panoramic',
    SIMPLE: 'simple'
  };

  const SWATCH_COLORS = {
    blue: '#1565FF',
    ltblue: '#00E5FF',
    white: '#FFFFFF',
    violet: '#B100FF',
    black: '#000000',
    yellow: '#FFEB00',
    green: '#00C853',
    red: '#FF1744'
  };

  const COLOR_MAP = {
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

  // =========================================================================
  // XSS ЗАЩИТА (КРИТИЧНО!)
  // =========================================================================

  /**
   * Экранирует HTML для предотвращения XSS атак
   * @param {string} str - Строка для экранирования
   * @returns {string} - Безопасная строка
   */
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Экранирует атрибуты HTML
   * @param {string} str - Строка для экранирования
   * @returns {string} - Безопасная строка
   */
  function escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Конвертирует HTML в простой текст (безопасно)
   * @param {string} html - HTML строка
   * @returns {string} - Текст без HTML тегов
   */
  function htmlToText(html) {
    if (!html) return '';

    const div = document.createElement('div');
    div.innerHTML = html;

    // Заменяем <br> на переносы строк
    div.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });

    // Заменяем </p>, </div> на двойные переносы
    div.querySelectorAll('p, div').forEach(el => {
      const text = el.textContent;
      el.replaceWith(text + '\n\n');
    });

    // Заменяем </li> на переносы
    div.querySelectorAll('li').forEach(li => {
      const text = li.textContent;
      li.replaceWith('• ' + text + '\n');
    });

    return div.textContent.trim();
  }

  // =========================================================================
  // МАСКИРОВАНИЕ ДАННЫХ
  // =========================================================================

  /**
   * ✅ ЕДИНСТВЕННАЯ версия maskPhone (было 3 копии!)
   * Маскирует номер телефона для защиты персональных данных
   * @param {string} raw - Исходный номер
   * @returns {string} - Маскированный номер (***XXXXXX)
   */
  function maskPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length <= 6) {
      return '***' + digits;
    }
    return '***' + digits.slice(-6);
  }

  // =========================================================================
  // МАТЕМАТИЧЕСКИЕ УТИЛИТЫ
  // =========================================================================

  /**
   * Ограничивает число в диапазоне
   * @param {number} n - Число
   * @param {number} min - Минимум
   * @param {number} max - Максимум
   * @returns {number} - Ограниченное число
   */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * Конвертирует HEX цвет в RGBA
   * @param {string} hex - HEX цвет (#RRGGBB)
   * @param {number} alpha - Прозрачность (0-1)
   * @returns {string} - RGBA строка
   */
  function hexToRgba(hex, alpha) {
    alpha = alpha !== undefined ? alpha : 1;
    hex = hex.replace('#', '');

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // =========================================================================
  // РАБОТА СО СКРИПТАМИ
  // =========================================================================

  /**
   * Загружает внешний скрипт динамически
   * @param {string} src - URL скрипта
   * @returns {Promise} - Promise, который resolved когда скрипт загружен
   */
  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // =========================================================================
  // ВАЛИДАЦИЯ
  // =========================================================================

  /**
   * Проверяет, является ли значение валидным email
   * @param {string} email - Email для проверки
   * @returns {boolean} - true если валидный
   */
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }

  /**
   * Проверяет, является ли значение валидным номером телефона
   * @param {string} phone - Телефон для проверки
   * @returns {boolean} - true если валидный
   */
  function isValidPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  // =========================================================================
  // РАБОТА С ДАТАМИ
  // =========================================================================

  /**
   * Форматирует дату в русском формате
   * @param {Date|string|number} date - Дата
   * @returns {string} - Форматированная дата (ДД.ММ.ГГГГ)
   */
  function formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return day + '.' + month + '.' + year;
  }

  /**
   * Форматирует дату и время
   * @param {Date|string|number} date - Дата
   * @returns {string} - Форматированная дата (ДД.ММ.ГГГГ ЧЧ:ММ)
   */
  function formatDateTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const dateStr = formatDate(d);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return dateStr + ' ' + hours + ':' + minutes;
  }

  // =========================================================================
  // DEBOUNCE / THROTTLE
  // =========================================================================

  /**
   * Создает debounced функцию
   * @param {Function} func - Функция для debounce
   * @param {number} wait - Задержка в мс
   * @returns {Function} - Debounced функция
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Создает throttled функцию
   * @param {Function} func - Функция для throttle
   * @param {number} limit - Ограничение в мс
   * @returns {Function} - Throttled функция
   */
  function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // =========================================================================
  // ЭКСПОРТ
  // =========================================================================

  w.USO.util = {
    // Debug
    DEBUG: DEBUG,

    // Константы
    MODES: MODES,
    SWATCH_COLORS: SWATCH_COLORS,
    COLOR_MAP: COLOR_MAP,

    // XSS защита
    escapeHTML: escapeHTML,
    escapeAttr: escapeAttr,
    htmlToText: htmlToText,

    // Маскирование
    maskPhone: maskPhone,

    // Математика
    clamp: clamp,
    hexToRgba: hexToRgba,

    // Скрипты
    loadScript: loadScript,

    // Валидация
    isValidEmail: isValidEmail,
    isValidPhone: isValidPhone,

    // Даты
    formatDate: formatDate,
    formatDateTime: formatDateTime,

    // Performance
    debounce: debounce,
    throttle: throttle
  };

  DEBUG.log('[USO_UTILS] Module loaded');

})(window);
