/**
 * USO Canvas Navigation Module
 *
 * Управление навигацией по снимкам, вкладками и экспортом изображений
 */

(function(w, $){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  /**
   * Обновить навигацию по изображениям (вкладки)
   * @param {Array} images - Массив изображений
   * @param {number} activeIndex - Активный индекс
   * @param {Function} onSwitch - Callback при переключении
   * @param {Function} onRemove - Callback при удалении
   */
  function updateImageNavigation(images, activeIndex, onSwitch, onRemove) {
    const nav = document.getElementById('uso-images-nav');
    if (!nav) return;

    nav.innerHTML = '';
    nav.setAttribute('data-tab-count', images.length);

    images.forEach((img, idx) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (idx === activeIndex ? ' active' : '');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
      tab.setAttribute('data-img-id', idx);

      // Создаем label для текста вкладки
      const label = document.createElement('span');
      label.className = 'tab-label';

      // ✅ ДОБАВЛЕНО: Индикатор использования в расчетах
      if (img.usedInCalculations) {
        const calcBadge = document.createElement('span');
        calcBadge.className = 'calc-badge';
        calcBadge.textContent = '📊';
        calcBadge.title = 'Используется в расчетах';
        calcBadge.style.cssText = 'margin-right: 4px; font-size: 12px;';
        label.appendChild(calcBadge);
      }

      const text = document.createTextNode(img.description);
      label.appendChild(text);
      label.onclick = () => {
        if (typeof onSwitch === 'function') {
          onSwitch(idx);
        }
      };
      tab.appendChild(label);

      // Создаем кнопку закрытия
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Удалить снимок';
      closeBtn.onclick = (e) => {
        e.stopPropagation(); // Предотвращаем переключение на вкладку
        if (typeof onRemove === 'function') {
          onRemove(idx);
        }
      };
      tab.appendChild(closeBtn);

      nav.appendChild(tab);
    });

    DEBUG.log('[USO_NAV] Navigation updated, images:', images.length);
  }

  /**
   * Получить все изображения для экспорта (с рендерингом маркеров)
   * @param {Array} images - Массив изображений
   * @param {Function} renderImageFn - Функция рендеринга изображения с маркерами
   * @returns {Promise<Array>} - Массив изображений с data URLs
   */
  async function getAllImagesForExport(images, renderImageFn) {
    DEBUG.log('[USO_NAV] getAllImagesForExport() called, total images:', images.length);

    const result = [];

    try {
      for (let i = 0; i < images.length; i++) {
        DEBUG.log('[USO_NAV] Processing image', i + 1, 'of', images.length);

        // Пропускаем изображения без bgImg (не загружены)
        if (!images[i].bgImg || !images[i].imageUrl) {
          DEBUG.log('[USO_NAV] Skipping image', i + 1, '- not loaded');
          continue;
        }

        let imageUrlWithMarkers;

        // Используем функцию рендеринга если передана
        if (typeof renderImageFn === 'function') {
          imageUrlWithMarkers = await renderImageFn(i);
        } else {
          // Используем imageUrl без маркеров как fallback
          imageUrlWithMarkers = images[i].imageUrl;
        }

        // Пропускаем, если рендеринг не удался
        if (!imageUrlWithMarkers) {
          console.warn('[USO_NAV] Failed to render image', i + 1, '- skipping');
          continue;
        }

        result.push({
          index: i + 1,
          description: images[i].description,
          jaw: images[i].jaw,
          imageUrl: imageUrlWithMarkers,
          serialized: images[i].serialized,
          canMark: images[i].canMark,
          usedInCalculations: images[i].usedInCalculations || false
        });

        DEBUG.log('[USO_NAV] Image', i + 1, 'exported successfully');
      }
    } catch(err) {
      console.error('[USO_NAV] Error in getAllImagesForExport:', err);
    }

    DEBUG.log('[USO_NAV] getAllImagesForExport() completed, returned', result.length, 'images');
    return result;
  }

  /**
   * Создать DOM элемент canvas для изображения
   * @param {number} index - Индекс изображения
   * @returns {HTMLCanvasElement|null}
   */
  function createCanvasElement(index) {
    const canvasEl = document.createElement('canvas');
    canvasEl.id = 'uso-canvas-' + index;
    canvasEl.className = 'uso-image-canvas';
    canvasEl.style.cssText = 'display: none; position: absolute; top: 0; left: 0;';

    const container = document.getElementById('uso-canvas-container');
    if (!container) {
      console.error('[USO_NAV] Canvas container not found');
      return null;
    }

    container.appendChild(canvasEl);
    DEBUG.log('[USO_NAV] Canvas element created:', canvasEl.id);
    return canvasEl;
  }

  // ============================================
  // ЭКСПОРТ
  // ============================================

  U.CanvasNavigation = {
    updateImageNavigation,
    getAllImagesForExport,
    createCanvasElement
  };

  DEBUG.log('[USO_NAV] Module loaded');

})(window, jQuery);
