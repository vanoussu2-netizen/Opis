/**
 * USO Canvas State Module
 *
 * Центральное хранилище состояния приложения canvas
 * Управляет images, workMode, activeImageIndex и другими переменными состояния
 */

(function(w){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };
  const MODES = U.CanvasConfig ? U.CanvasConfig.MODES : { PANORAMIC: 'panoramic', SIMPLE: 'simple' };

  // ============================================
  // СОСТОЯНИЕ ПРИЛОЖЕНИЯ
  // ============================================

  let workMode = MODES.PANORAMIC;
  let images = [];
  let activeImageIndex = -1;
  let mainCanvas = null;
  let canvases = {}; // Словарь canvas'ов по индексам

  let markingMode = false;
  let midlineMode = false;
  let currentColor = 'blue';
  let currentShape = 'point';
  let midline = null;
  let history = [];
  let cropping = null;

  // ============================================
  // ГЕТТЕРЫ И СЕТТЕРЫ
  // ============================================

  /**
   * Получить текущий режим работы
   * @returns {string} - PANORAMIC или SIMPLE
   */
  function getWorkMode() {
    return workMode;
  }

  /**
   * Установить режим работы
   * @param {string} mode - PANORAMIC или SIMPLE
   */
  function setWorkMode(mode) {
    if (mode !== MODES.PANORAMIC && mode !== MODES.SIMPLE) {
      DEBUG.warn('[USO_STATE] Invalid work mode:', mode);
      return;
    }

    DEBUG.log('[USO_STATE] Changing work mode from', workMode, 'to', mode);
    workMode = mode;

    // При смене режима очищаем все снимки
    images = [];
    activeImageIndex = -1;
    canvases = {};

    DEBUG.log('[USO_STATE] Work mode changed, state reset');
  }

  /**
   * Получить все изображения
   * @returns {Array} - Массив изображений
   */
  function getAllImages() {
    // ✅ Возвращаем фактический массив изображений, а не обёрнутые объекты
    return images;
  }

  /**
   * Получить текущее активное изображение
   * @returns {Object|null}
   */
  function getCurrentImage() {
    return images[activeImageIndex] || null;
  }

  /**
   * Получить индекс текущего изображения
   * @returns {number}
   */
  function getCurrentImageIndex() {
    return activeImageIndex;
  }

  /**
   * Установить активный индекс
   * @param {number} index
   */
  function setActiveImageIndex(index) {
    if (index < -1 || index >= images.length) {
      DEBUG.warn('[USO_STATE] Invalid image index:', index);
      return;
    }
    activeImageIndex = index;
    DEBUG.log('[USO_STATE] Active image index set to:', index);
  }

  /**
   * Добавить изображение в массив
   * @param {Object} imgData - Данные изображения
   * @returns {number} - Индекс добавленного изображения
   */
  function addImageToState(imgData) {
    images.push(imgData);
    const newIndex = images.length - 1;
    DEBUG.log('[USO_STATE] Image added, total:', images.length, 'index:', newIndex);
    return newIndex;
  }

  /**
   * Удалить изображение из состояния
   * @param {number} index
   * @returns {boolean} - Успешно удалено
   */
  function removeImageFromState(index) {
    if (index < 0 || index >= images.length) {
      DEBUG.warn('[USO_STATE] Cannot remove image, invalid index:', index);
      return false;
    }

    images.splice(index, 1);

    // Удаляем canvas
    if (canvases[index]) {
      delete canvases[index];
    }

    // Пересобираем canvases с новыми индексами
    const newCanvases = {};
    Object.keys(canvases).forEach(key => {
      const numKey = parseInt(key);
      if (numKey > index) {
        newCanvases[numKey - 1] = canvases[key];
      } else if (numKey < index) {
        newCanvases[numKey] = canvases[key];
      }
    });
    canvases = newCanvases;

    // Корректируем activeImageIndex
    if (images.length === 0) {
      activeImageIndex = -1;
      mainCanvas = null;
    } else if (activeImageIndex >= images.length) {
      activeImageIndex = images.length - 1;
    }

    DEBUG.log('[USO_STATE] Image removed, total:', images.length);
    return true;
  }

  /**
   * Получить canvas по индексу
   * @param {number} index
   * @returns {Object|null}
   */
  function getCanvasByIndex(index) {
    return canvases[index] || null;
  }

  /**
   * Сохранить canvas по индексу
   * @param {number} index
   * @param {Object} canvas
   */
  function setCanvasByIndex(index, canvas) {
    canvases[index] = canvas;
    DEBUG.log('[USO_STATE] Canvas saved at index:', index);
  }

  /**
   * Получить главный canvas
   * @returns {Object|null}
   */
  function getMainCanvas() {
    return mainCanvas;
  }

  /**
   * Установить главный canvas
   * @param {Object} canvas
   */
  function setMainCanvas(canvas) {
    mainCanvas = canvas;
    DEBUG.log('[USO_STATE] Main canvas updated');
  }

  /**
   * Проверить есть ли изображение в активном canvas
   * @returns {boolean}
   */
  function hasImage() {
    return activeImageIndex >= 0 &&
           activeImageIndex < images.length &&
           !!images[activeImageIndex].bgImg;
  }

  /**
   * Получить маркеры текущего изображения
   * @returns {Array}
   */
  function getMarkersForCurrentImage() {
    const imgData = images[activeImageIndex];
    return imgData && imgData.markers ? imgData.markers : [];
  }

  /**
   * Обновить маркеры текущего изображения
   * @param {Array} markers
   */
  function setMarkersForCurrentImage(markers) {
    const imgData = images[activeImageIndex];
    if (imgData) {
      imgData.markers = markers;
      DEBUG.log('[USO_STATE] Markers updated for image:', activeImageIndex, 'count:', markers.length);
    }
  }

  // ============================================
  // СОСТОЯНИЕ РЕЖИМОВ
  // ============================================

  function isMarkingMode() {
    return markingMode;
  }

  function setMarkingMode(flag) {
    markingMode = !!flag;
    DEBUG.log('[USO_STATE] Marking mode:', markingMode);
  }

  function isMidlineMode() {
    return midlineMode;
  }

  function setMidlineMode(flag) {
    midlineMode = !!flag;
    DEBUG.log('[USO_STATE] Midline mode:', midlineMode);
  }

  function getCurrentColor() {
    return currentColor;
  }

  function setCurrentColor(color) {
    currentColor = color;
  }

  function getCurrentShape() {
    return currentShape;
  }

  function setCurrentShape(shape) {
    currentShape = shape;
  }

  function getMidline() {
    return midline;
  }

  function setMidline(line) {
    midline = line;
  }

  function getHistory() {
    return history;
  }

  function addToHistory(item) {
    history.push(item);
  }

  function popFromHistory() {
    return history.pop();
  }

  function clearHistory() {
    history = [];
  }

  function getCropping() {
    return cropping;
  }

  function setCropping(crop) {
    cropping = crop;
  }

  /**
   * Проверка можно ли добавлять маркеры
   * @returns {boolean}
   */
  function canAddMarkers() {
    return markingMode && !midlineMode && !cropping;
  }

  // ============================================
  // ЭКСПОРТ
  // ============================================

  U.CanvasState = {
    // Режим работы
    getWorkMode,
    setWorkMode,

    // Изображения
    getAllImages,
    getCurrentImage,
    getCurrentImageIndex,
    setActiveImageIndex,
    addImageToState,
    removeImageFromState,
    hasImage,

    // Canvas
    getCanvasByIndex,
    setCanvasByIndex,
    getMainCanvas,
    setMainCanvas,

    // Маркеры
    getMarkersForCurrentImage,
    setMarkersForCurrentImage,

    // Режимы
    isMarkingMode,
    setMarkingMode,
    isMidlineMode,
    setMidlineMode,
    canAddMarkers,

    // Инструменты
    getCurrentColor,
    setCurrentColor,
    getCurrentShape,
    setCurrentShape,

    // Средняя линия
    getMidline,
    setMidline,

    // История
    getHistory,
    addToHistory,
    popFromHistory,
    clearHistory,

    // Кроппинг
    getCropping,
    setCropping,

    // Константы
    MODES
  };

  DEBUG.log('[USO_STATE] Module loaded');

})(window);
