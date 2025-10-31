/**
 * USO Canvas Calculations Module
 *
 * Модуль для подсчета маркеров и расчета показателей
 * Включает функции для математических расчетов на основе маркеров
 */

(function(w){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  // Получаем DEBUG и MODES из config модуля
  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };
  const MODES = U.CanvasConfig ? U.CanvasConfig.MODES : { PANORAMIC: 'panoramic', SIMPLE: 'simple' };

  /**
   * Подсчет количества маркеров каждого типа в изображении
   * @param {Object} imgData - Данные изображения с маркерами
   * @returns {Object} - Объект с подсчитанными маркерами по типам
   */
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

    if (!imgData || !imgData.markers) return counts;

    imgData.markers.forEach(m => {
      const mt = m.markerType;
      if (mt && counts.hasOwnProperty(mt)) {
        counts[mt]++;
      }
    });

    return counts;
  }

  /**
   * Разделение маркеров по челюстям в изображении
   * @param {Object} imgData - Данные изображения
   * @param {Function} getMidlineY - Функция получения Y координаты средней линии
   * @returns {Object} - Разделение по челюстям для каждого цвета
   */
  function splitByJawInImage(imgData, getMidlineY) {
    const splits = {
      yellow: { topUnits: 0, bottomUnits: 0 },
      white: { topUnits: 0, bottomUnits: 0 },
      violet: { topUnits: 0, bottomUnits: 0 },
      green: { topUnits: 0, bottomUnits: 0 }
    };

    if (!imgData || !imgData.markers) return splits;

    const mid = getMidlineY ? getMidlineY() : (imgData.canvasHeight ? imgData.canvasHeight / 2 : 0);

    const lineTypes = {
      'yellow_line': 'yellow',
      'white_line': 'white',
      'violet_line': 'violet',
      'green_line': 'green'
    };

    imgData.markers.forEach(m => {
      const colorKey = lineTypes[m.markerType];
      if (!colorKey) return;

      const centerY = m.getCenterPoint ? m.getCenterPoint().y : (m.top || 0);

      if (centerY < mid) {
        splits[colorKey].topUnits = 1;
      } else {
        splits[colorKey].bottomUnits = 1;
      }
    });

    return splits;
  }

  /**
   * Получить подсчеты маркеров для расчетов (с учетом usedInCalculations)
   * @param {Array} images - Массив изображений
   * @param {string} workMode - Режим работы (PANORAMIC | SIMPLE)
   * @returns {Object} - Подсчитанные маркеры
   */
  function getCountsForCalculation(images, workMode) {
    DEBUG.log('[USO_CANVAS_CALC] getCountsForCalculation() - mode:', workMode);

    if (workMode === MODES.PANORAMIC) {
      // ✅ PANORAMIC: используем только снимки с флагом usedInCalculations
      const calcImages = images.filter(img => img.usedInCalculations);
      if (calcImages.length === 0) {
        DEBUG.warn('[USO_CANVAS_CALC] No images marked for calculations in PANORAMIC mode');
        return {};
      }

      const counts = countMarkersInImage(calcImages[0]);
      DEBUG.log('[USO_CANVAS_CALC] PANORAMIC mode - using', calcImages.length, 'image(s) for calculations:', counts);
      return counts;
    } else if (workMode === MODES.SIMPLE) {
      // ✅ SIMPLE: используем только снимки с флагом usedInCalculations
      const calcImages = images.filter(img => img.usedInCalculations);

      if (calcImages.length === 0) {
        DEBUG.warn('[USO_CANVAS_CALC] No images marked for calculations in SIMPLE mode');
        return {};
      }

      DEBUG.log('[USO_CANVAS_CALC] SIMPLE mode - using', calcImages.length, 'image(s) for calculations');

      const upperImg = calcImages.find(img => img.jaw === 'upper');
      const lowerImg = calcImages.find(img => img.jaw === 'lower');

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

      DEBUG.log('[USO_CANVAS_CALC] SIMPLE mode - upper:', upperCounts, 'lower:', lowerCounts, 'combined:', combined);
      return combined;
    }

    return {};
  }

  /**
   * Получить разделение по челюстям для расчетов (с учетом usedInCalculations)
   * @param {Array} images - Массив изображений
   * @param {string} workMode - Режим работы
   * @param {Function} getMidlineY - Функция получения Y средней линии
   * @returns {Object} - Разделение по челюстям
   */
  function getJawSplitsForCalculation(images, workMode, getMidlineY) {
    DEBUG.log('[USO_CANVAS_CALC] getJawSplitsForCalculation() - mode:', workMode);

    const emptyResult = {
      yellow: {topUnits:0, bottomUnits:0},
      white: {topUnits:0, bottomUnits:0},
      violet: {topUnits:0, bottomUnits:0},
      green: {topUnits:0, bottomUnits:0}
    };

    if (workMode === MODES.PANORAMIC) {
      // ✅ PANORAMIC: используем только снимки с флагом usedInCalculations
      const calcImages = images.filter(img => img.usedInCalculations);
      if (calcImages.length === 0) {
        DEBUG.warn('[USO_CANVAS_CALC] No images marked for calculations in PANORAMIC mode');
        return emptyResult;
      }

      const splits = splitByJawInImage(calcImages[0], getMidlineY);
      DEBUG.log('[USO_CANVAS_CALC] PANORAMIC mode - jaw splits:', splits);
      return splits;
    } else if (workMode === MODES.SIMPLE) {
      // ✅ SIMPLE: используем только снимки с флагом usedInCalculations
      const calcImages = images.filter(img => img.usedInCalculations);

      const splits = {
        yellow: { topUnits: 0, bottomUnits: 0 },
        white: { topUnits: 0, bottomUnits: 0 },
        violet: { topUnits: 0, bottomUnits: 0 },
        green: { topUnits: 0, bottomUnits: 0 }
      };

      const upperImg = calcImages.find(img => img.jaw === 'upper');
      const lowerImg = calcImages.find(img => img.jaw === 'lower');

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

      DEBUG.log('[USO_CANVAS_CALC] SIMPLE mode - jaw splits:', splits);
      return splits;
    }

    return emptyResult;
  }

  // Экспортируем функции
  U.CanvasCalculations = {
    countMarkersInImage,
    splitByJawInImage,
    getCountsForCalculation,
    getJawSplitsForCalculation
  };

  DEBUG.log('[USO_CANVAS_CALC] Module loaded');

})(window);
