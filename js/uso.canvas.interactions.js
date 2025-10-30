/**
 * uso.canvas.interactions.js
 * Модуль взаимодействий пользователя с canvas
 * Содержит: зум колесиком мыши, перетаскивание (pan), сенсорные жесты, ResizeObserver
 */
(function(w, $) {
  'use strict';
  if (!w.USO) w.USO = {};
  const U = w.USO;
  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  let _wrapRO = null;
  let _resizeTimeout = null;

  /**
   * Включить зум колесиком мыши
   * @param {Object} canvas - Fabric canvas
   * @param {Function} canInteract - Функция проверки возможности взаимодействия
   */
  function enableMouseWheelZoom(canvas, canInteract) {
    if (!canvas) return;

    canvas.on('mouse:wheel', function(opt) {
      if (!canInteract || !canInteract()) return;

      const e = opt.e || window.event;
      let zoom = canvas.getZoom();
      const deltaY = (typeof e.deltaY === 'number') ? e.deltaY : 0;
      zoom *= Math.pow(0.999, deltaY);
      zoom = Math.min(4, Math.max(0.2, zoom));

      const rect = canvas.upperCanvasEl.getBoundingClientRect();
      const cx = (typeof e.clientX === 'number') ? (e.clientX - rect.left) : (e.offsetX || 0);
      const cy = (typeof e.clientY === 'number') ? (e.clientY - rect.top) : (e.offsetY || 0);
      const point = new fabric.Point(cx, cy);

      canvas.zoomToPoint(point, zoom);

      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();

      canvas.requestRenderAll();
    });

    DEBUG.log('[Interactions] Mouse wheel zoom enabled');
  }

  /**
   * Включить перетаскивание (pan) изображения
   * @param {Object} canvas - Fabric canvas
   * @param {Function} canInteract - Функция проверки возможности взаимодействия
   */
  function enablePanDrag(canvas, canInteract) {
    if (!canvas) return;

    let isPanning = false;
    let panLast = null;
    let rafId = null; // requestAnimationFrame ID для debounce

    canvas.on('mouse:down', function(opt) {
      if (!canInteract || !canInteract()) return;
      if (opt && opt.target) return;

      const e = opt.e || window.event;
      isPanning = true;
      panLast = { x: e.offsetX || 0, y: e.offsetY || 0 };
      canvas.setCursor('grabbing');
    });

    // Оптимизировано: requestAnimationFrame debounce (60 FPS)
    canvas.on('mouse:move', function(opt) {
      if (!isPanning) return;

      const e = opt.e || window.event;
      const dx = (e.offsetX || 0) - panLast.x;
      const dy = (e.offsetY || 0) - panLast.y;
      const vpt = canvas.viewportTransform;
      vpt[4] += dx;
      vpt[5] += dy;
      panLast = { x: e.offsetX || 0, y: e.offsetY || 0 };

      // Debounce: рендерим только один раз за frame
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          canvas.requestRenderAll();
          rafId = null;
        });
      }
    });

    canvas.on('mouse:up', function() {
      isPanning = false;
      panLast = null;
      canvas.setCursor('default');

      // Отменяем pending render при отпускании мыши
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });

    DEBUG.log('[Interactions] Pan drag enabled');
  }

  /**
   * Включить сенсорные жесты (pinch zoom, pan)
   * @param {Object} canvas - Fabric canvas
   * @param {Function} canInteract - Функция проверки возможности взаимодействия
   */
  function enableTouchGestures(canvas, canInteract) {
    if (!canvas) return;

    const upper = canvas.upperCanvasEl;
    const activePointers = new Map();
    let lastDistance = null;
    let lastCenter = null;
    let isPanning = false;
    let panLast = null;

    function screenPoint(e) {
      const rect = upper.getBoundingClientRect();
      const cx = ('clientX' in e) ? e.clientX : 0;
      const cy = ('clientY' in e) ? e.clientY : 0;
      return { x: cx - rect.left, y: cy - rect.top };
    }

    function startPan(x, y) {
      isPanning = true;
      panLast = { x, y };
      upper.style.cursor = 'grabbing';
    }

    function updatePan(x, y) {
      if (!isPanning) return;
      const dx = x - panLast.x;
      const dy = y - panLast.y;
      const vpt = canvas.viewportTransform;
      vpt[4] += dx;
      vpt[5] += dy;
      panLast = { x, y };
      canvas.requestRenderAll();
    }

    function endPan() {
      isPanning = false;
      panLast = null;
      upper.style.cursor = '';
    }

    if ('onpointerdown' in window) {
      upper.addEventListener('pointerdown', function(e) {
        activePointers.set(e.pointerId, e);
        if (upper.setPointerCapture) upper.setPointerCapture(e.pointerId);

        if (canInteract && canInteract()) {
          let target = null;
          try {
            target = canvas.findTarget(e) || null;
          } catch (_) {}

          const p = screenPoint(e);
          if (activePointers.size === 1 && !target) {
            startPan(p.x, p.y);
          }
        }
      }, { passive: true });

      upper.addEventListener('pointermove', function(e) {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, e);

        if (canInteract && canInteract() && activePointers.size === 2) {
          e.preventDefault();
          const pts = Array.from(activePointers.values());
          const p1 = pts[0];
          const p2 = pts[1];
          const dx = p2.clientX - p1.clientX;
          const dy = p2.clientY - p1.clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const rect = upper.getBoundingClientRect();
          const center = {
            x: (p1.clientX + p2.clientX) / 2,
            y: (p1.clientY + p2.clientY) / 2
          };
          const zoom = canvas.getZoom();

          if (lastDistance) {
            let newZoom = zoom * (dist / lastDistance);
            newZoom = Math.min(4, Math.max(0.2, newZoom));
            const point = new fabric.Point(center.x - rect.left, center.y - rect.top);
            canvas.zoomToPoint(point, newZoom);

            const vpt = canvas.viewportTransform;
            vpt[4] += (center.x - (lastCenter ? lastCenter.x : center.x));
            vpt[5] += (center.y - (lastCenter ? lastCenter.y : center.y));
            canvas.requestRenderAll();
          }

          lastDistance = dist;
          lastCenter = center;
          return;
        }

        const p = screenPoint(e);
        if (canInteract && canInteract() && isPanning) {
          updatePan(p.x, p.y);
        }
      }, { passive: false });

      upper.addEventListener('pointerup', function(e) {
        if (activePointers.has(e.pointerId)) {
          activePointers.delete(e.pointerId);
          if (upper.releasePointerCapture) upper.releasePointerCapture(e.pointerId);
        }
        if (activePointers.size < 2) {
          lastDistance = null;
          lastCenter = null;
        }
        if (isPanning) {
          endPan();
        }
      }, { passive: true });

      DEBUG.log('[Interactions] Touch gestures enabled');
    }
  }

  /**
   * Включить отслеживание изменения размера контейнера
   * @param {Function} onResize - Callback функция при изменении размера
   */
  function enableContainerResizeObserver(onResize) {
    const wrap = document.getElementById('uso-canvas-container');

    if (!wrap || typeof ResizeObserver === 'undefined') {
      // Fallback для старых браузеров
      $(window).on('resize orientationchange', U.util.throttle(function() {
        try {
          if (onResize) onResize();
        } catch (err) {
          DEBUG.error('[Interactions] Resize error:', err);
        }
      }, 500));
      DEBUG.log('[Interactions] Using window resize fallback');
      return;
    }

    try {
      if (_wrapRO) {
        _wrapRO.disconnect();
        _wrapRO = null;
      }

      _wrapRO = new ResizeObserver(() => {
        clearTimeout(_resizeTimeout);
        _resizeTimeout = setTimeout(() => {
          window.requestAnimationFrame(() => {
            try {
              if (onResize) onResize();
            } catch (err) {
              DEBUG.error('[Interactions] Resize container error:', err);
            }
          });
        }, 500);
      });

      _wrapRO.observe(wrap);
      DEBUG.log('[Interactions] ResizeObserver enabled');
    } catch (err) {
      DEBUG.warn('[Interactions] ResizeObserver error:', err);
    }
  }

  /**
   * Отключить ResizeObserver
   */
  function disableContainerResizeObserver() {
    if (_wrapRO) {
      _wrapRO.disconnect();
      _wrapRO = null;
    }
    if (_resizeTimeout) {
      clearTimeout(_resizeTimeout);
      _resizeTimeout = null;
    }
  }

  // Экспорт
  U.CanvasInteractions = {
    enableMouseWheelZoom,
    enablePanDrag,
    enableTouchGestures,
    enableContainerResizeObserver,
    disableContainerResizeObserver
  };

  DEBUG.log('[USO_CANVAS_INTERACTIONS] Module loaded');

})(window, jQuery);
