/**
 * USO History Module
 * Система undo/redo для отмены действий
 *
 * ✅ Выделено из uso.canvas.js в отдельный модуль
 * ✅ Добавлена защита от утечек памяти
 */
(function(w){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;
  const DEBUG = U.util ? U.util.DEBUG : console;

  // История действий
  let history = [];
  let maxHistorySize = 50; // Ограничение для предотвращения утечек памяти
  let restoringHistory = false;

  /**
   * Добавляет состояние в историю
   * @param {Object} state - Состояние для сохранения
   */
  function push(state) {
    if (restoringHistory) return;

    if (!state) {
      DEBUG.warn('[USO_HISTORY] Attempted to push empty state');
      return;
    }

    history.push(state);

    // Ограничиваем размер истории для предотвращения утечек памяти
    if (history.length > maxHistorySize) {
      history.shift(); // Удаляем самую старую запись
      DEBUG.log('[USO_HISTORY] History size limit reached, removed oldest entry');
    }

    DEBUG.log('[USO_HISTORY] State pushed, history size:', history.length);
  }

  /**
   * Отменяет последнее действие
   * @returns {Object|null} - Предыдущее состояние или null
   */
  function undo() {
    if (history.length < 2) {
      DEBUG.log('[USO_HISTORY] No history to undo');
      return null;
    }

    // Убираем текущее состояние
    history.pop();

    // Возвращаем предыдущее состояние
    const prevState = history[history.length - 1];

    DEBUG.log('[USO_HISTORY] Undo performed, remaining history:', history.length);

    return prevState;
  }

  /**
   * Очищает всю историю
   */
  function clear() {
    history = [];
    DEBUG.log('[USO_HISTORY] History cleared');
  }

  /**
   * Получает текущий размер истории
   * @returns {number} - Количество записей в истории
   */
  function size() {
    return history.length;
  }

  /**
   * Проверяет, можно ли отменить действие
   * @returns {boolean} - true если есть что отменять
   */
  function canUndo() {
    return history.length >= 2;
  }

  /**
   * Устанавливает флаг восстановления истории
   * @param {boolean} flag - Флаг
   */
  function setRestoring(flag) {
    restoringHistory = !!flag;
  }

  /**
   * Проверяет, идет ли восстановление из истории
   * @returns {boolean} - true если идет восстановление
   */
  function isRestoring() {
    return restoringHistory;
  }

  /**
   * Устанавливает максимальный размер истории
   * @param {number} size - Максимальный размер
   */
  function setMaxSize(size) {
    if (typeof size !== 'number' || size < 1) {
      DEBUG.warn('[USO_HISTORY] Invalid max size:', size);
      return;
    }

    maxHistorySize = size;

    // Обрезаем историю если она превысила новый лимит
    while (history.length > maxHistorySize) {
      history.shift();
    }

    DEBUG.log('[USO_HISTORY] Max history size set to:', maxHistorySize);
  }

  /**
   * Получает максимальный размер истории
   * @returns {number} - Максимальный размер
   */
  function getMaxSize() {
    return maxHistorySize;
  }

  // =========================================================================
  // ЭКСПОРТ
  // =========================================================================

  U.History = {
    push: push,
    undo: undo,
    clear: clear,
    size: size,
    canUndo: canUndo,
    setRestoring: setRestoring,
    isRestoring: isRestoring,
    setMaxSize: setMaxSize,
    getMaxSize: getMaxSize
  };

  DEBUG.log('[USO_HISTORY] Module loaded, max size:', maxHistorySize);

})(window);
