/**
 * uso.canvas.fullscreen.js
 * Модуль управления полноэкранным режимом
 * Поддерживает как нативный Fullscreen API, так и эмуляцию для iOS
 */
(function(w, $) {
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;
  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Определение iOS устройств
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let fakeFs = false;
  let vvHandler = null;
  let onResizeCallback = null;

  /**
   * Получить текущий полноэкранный элемент
   * @returns {Element|null}
   */
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  /**
   * Запросить полноэкранный режим для элемента
   * @param {Element} elem - DOM элемент
   * @returns {Promise}
   */
  function requestFs(elem) {
    try {
      if (elem.requestFullscreen) return elem.requestFullscreen();
      if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
        return Promise.resolve();
      }
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(new Error('Fullscreen API not supported'));
  }

  /**
   * Выйти из полноэкранного режима
   * @returns {Promise}
   */
  function exitFs() {
    try {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
        return Promise.resolve();
      }
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.resolve();
  }

  /**
   * Проверить, активен ли полноэкранный режим (нативный или эмулированный)
   * @returns {boolean}
   */
  function isAnyFs() {
    return !!fsElement() || fakeFs;
  }

  /**
   * Обработчик изменения viewport
   */
  function onViewportChange() {
    if (onResizeCallback) {
      onResizeCallback();
    }
  }

  /**
   * Отправить событие изменения полноэкранного режима
   * @param {boolean} flag - Состояние полноэкранного режима
   */
  function emitFakeFs(flag) {
    try {
      document.dispatchEvent(new CustomEvent('uso:fsToggle', {
        detail: { isFs: !!flag, mode: 'fake' }
      }));
    } catch (_) {}
  }

  /**
   * Включить эмулированный полноэкранный режим (для iOS)
   */
  function enableFakeFs() {
    fakeFs = true;
    document.body.classList.add('uso-fs-active');

    const scrollY = window.scrollY || document.documentElement.scrollTop;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100vh';
    document.body.style.top = (-scrollY) + 'px';

    $('#uso-exit-fs').css('display', 'inline-flex');

    requestAnimationFrame(() => onViewportChange());

    if (window.visualViewport) {
      vvHandler = U.util.throttle(function() {
        if (fakeFs) {
          requestAnimationFrame(() => onViewportChange());
        }
      }, 200);
      window.visualViewport.addEventListener('resize', vvHandler);
      window.visualViewport.addEventListener('scroll', vvHandler);
    }
    emitFakeFs(true);
    DEBUG.log('[Fullscreen] Fake fullscreen enabled');
  }

  /**
   * Выключить эмулированный полноэкранный режим
   */
  function disableFakeFs() {
    fakeFs = false;
    document.body.classList.remove('uso-fs-active');

    const scrollY = -parseInt(document.body.style.top || '0');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.body.style.top = '';

    if (scrollY) {
      window.scrollTo(0, scrollY);
    }

    $('#uso-exit-fs').css('display', 'none');

    if (window.visualViewport && vvHandler) {
      window.visualViewport.removeEventListener('resize', vvHandler);
      window.visualViewport.removeEventListener('scroll', vvHandler);
      vvHandler = null;
    }
    emitFakeFs(false);
    DEBUG.log('[Fullscreen] Fake fullscreen disabled');
  }

  /**
   * Переключить полноэкранный режим
   */
  function toggleFullscreen() {
    const elem = document.getElementById('uso-canvas-container');

    if (isAnyFs()) {
      if (fsElement()) {
        exitFs().catch(function() {});
      }
      if (fakeFs) disableFakeFs();
      onViewportChange();
      updateFullscreenBtn();
      return;
    }

    if (isIOS) {
      enableFakeFs();
      onViewportChange();
      updateFullscreenBtn();
      return;
    }

    const tryNative = requestFs(elem);
    Promise.resolve(tryNative).then(function() {
      DEBUG.log('[Fullscreen] Native fullscreen enabled');
    }).catch(function() {
      DEBUG.warn('[Fullscreen] Native fullscreen failed, using fake fullscreen');
      enableFakeFs();
      onViewportChange();
      updateFullscreenBtn();
    });
  }

  /**
   * Обновить текст кнопки полноэкранного режима
   */
  function updateFullscreenBtn() {
    const isFs = isAnyFs();
    $('#uso-fullscreen').text(isFs ? 'Выйти из полноэкранного' : 'На весь экран');
    $('#uso-exit-fs').css('display', isFs ? 'inline-flex' : 'none');
  }

  /**
   * Установить callback для изменения размеров
   * @param {Function} callback
   */
  function setResizeCallback(callback) {
    onResizeCallback = callback;
  }

  // Слушаем нативные события полноэкранного режима
  document.addEventListener('fullscreenchange', updateFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

  // Экспорт
  U.CanvasFullscreen = {
    toggleFullscreen,
    updateFullscreenBtn,
    isAnyFs,
    setResizeCallback,
    isIOS
  };

  DEBUG.log('[USO_CANVAS_FULLSCREEN] Module loaded');

})(window, jQuery);
