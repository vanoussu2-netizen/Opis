/**
 * USO Canvas Init Module
 *
 * Главный координатор системы canvas:
 * - Инициализация canvas
 * - Управление состоянием маркировки
 * - Добавление/удаление/переключение изображений
 * - Сериализация и загрузка данных
 * - Координация всех модулей
 */

(function(w, $){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;

  const DEBUG = U.DEBUG_CANVAS || { log: () => {}, warn: () => {}, error: () => {} };

  // Получаем зависимости из других модулей
  const MODES = U.CanvasConfig.MODES;
  const markerType = U.CanvasConfig.markerType;
  const clamp = U.CanvasConfig.clamp;
  const swatchColors = U.CanvasConfig.swatchColors;
  const colorMap = U.CanvasConfig.colorMap;
  const hexToRgba = U.CanvasConfig.hexToRgba;

  // Состояние
  let markingMode = false;
  let currentColor = 'blue';
  let currentShape = 'point';
  let drawState = null;
  let onChange = null;

  /**
   * Получить маркеры текущего изображения
   */
  function getMarkersForCurrentImage() {
    const imgData = U.CanvasState.getCurrentImage();
    return imgData && imgData.markers ? imgData.markers : [];
  }

  /**
   * Проверить, можно ли добавлять маркеры
   */
  function canAddMarkers() {
    const midlineMode = U.CanvasMidline ? U.CanvasMidline.getMidlineMode() : false;
    const cropping = U.CanvasCropping ? U.CanvasCropping.isCropping() : false;
    return markingMode && !midlineMode && !cropping;
  }

  /**
   * Синхронизация режима маркировки
   */
  function syncMarkMode(newMarkingMode) {
    if (typeof newMarkingMode === 'boolean') {
      markingMode = newMarkingMode;
    }

    const mainCanvas = U.CanvasState.getMainCanvas();
    if (!mainCanvas) return;

    mainCanvas.skipTargetFind = false;
    mainCanvas.selection = !!markingMode;

    const currentImg = U.CanvasState.getCurrentImage();
    const isEditableImage = currentImg && currentImg.canMark;

    DEBUG.log('[USO_INIT] syncMarkMode: markingMode=', markingMode, 'canMark=', isEditableImage);

    const markers = getMarkersForCurrentImage();
    markers.forEach(function(o) {
      o.selectable = isEditableImage;
      o.evented = isEditableImage;
      o.hasBorders = isEditableImage;
      o.hasControls = isEditableImage && markingMode;
      o.lockMovementX = !isEditableImage;
      o.lockMovementY = !isEditableImage;

      const lockTransform = !isEditableImage;
      o.lockScalingX = lockTransform;
      o.lockScalingY = lockTransform;
      o.lockRotation = lockTransform;

      o.borderColor = '#2271b1';
      o.cornerColor = '#2271b1';
      o.transparentCorners = false;
      o.borderScaleFactor = 1;
      o.borderOpacityWhenMoving = 0.4;
      o.hoverCursor = isEditableImage ? 'move' : 'default';
      o.setCoords();
    });

    const midlineMode = U.CanvasMidline ? U.CanvasMidline.getMidlineMode() : false;
    const cropping = U.CanvasCropping ? U.CanvasCropping.isCropping() : false;

    mainCanvas.isDrawingMode = (markingMode && currentShape === 'free' && isEditableImage && !midlineMode && !cropping);

    if (U.CanvasUI && U.CanvasUI.applyFreeBrush) {
      U.CanvasUI.applyFreeBrush(mainCanvas, currentColor, swatchColors, mainCanvas.getHeight(), clamp);
    }

    mainCanvas.requestRenderAll();
  }

  /**
   * Обновить кнопку маркировки
   */
  function updateMarkingButton() {
    const btn = document.getElementById('mark-toggle');
    if (!btn) return;

    btn.setAttribute('aria-pressed', markingMode ? 'true' : 'false');
    btn.classList.toggle('primary', markingMode);

    DEBUG.log('[USO_INIT] updateMarkingButton: markingMode=', markingMode);
  }

  /**
   * Масштабировать все маркеры текущего изображения
   */
  function rescaleAllMarkers() {
    const mainCanvas = U.CanvasState.getMainCanvas();
    if (!mainCanvas) return;

    const markers = getMarkersForCurrentImage();
    const rescaleMarker = U.CanvasUI ? U.CanvasUI.rescaleMarker : null;

    if (rescaleMarker) {
      markers.forEach(rescaleMarker);
    }

    // Обновляем midline
    if (U.CanvasMidline) {
      const midline = U.CanvasMidline.getMidline();
      const midlineY = U.CanvasMidline.midlineY;

      if (midline && midlineY) {
        const w = mainCanvas.getWidth();
        const yy = midlineY();
        midline.set({ x1: 0, y1: yy, x2: w, y2: yy, left: 0, top: yy });
        midline.setCoords();
      }
    }

    mainCanvas.requestRenderAll();
  }

  /**
   * Сбросить все маркеры текущего изображения
   */
  function resetMarkers() {
    const mainCanvas = U.CanvasState.getMainCanvas();
    if (!mainCanvas) return;

    const markers = getMarkersForCurrentImage();
    markers.forEach(function(m) {
      mainCanvas.remove(m);
    });
    markers.length = 0;
    drawState = null;
    mainCanvas.requestRenderAll();
  }

  /**
   * Сериализация всех изображений
   */
  function serialize() {
    const mainCanvas = U.CanvasState.getMainCanvas();
    const workMode = U.CanvasState.getWorkMode();
    const images = U.CanvasState.getAllImages();
    const activeImageIndex = U.CanvasState.getCurrentImageIndex();

    if (!mainCanvas) {
      return { v: 3, images: [], activeImageIndex: 0, workMode: workMode };
    }

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();

    DEBUG.log('[USO_INIT] serialize() - saving ALL images, count:', images.length);

    // Сериализуем все изображения с их метками
    const serializeImageMarkers = U.CanvasSerialization ? U.CanvasSerialization.serializeImageMarkers : null;

    const serializedImages = images.map(function(imgData, idx) {
      const markerData = serializeImageMarkers ? serializeImageMarkers(imgData, w, h) : { items: [], meta: {} };

      DEBUG.log('[USO_INIT] serialize() - image', idx, ':', imgData.description,
                '- markers:', markerData.items.length);

      return {
        id: imgData.id,
        imageUrl: imgData.imageUrl,
        description: imgData.description,
        jaw: imgData.jaw,
        canMark: imgData.canMark,
        canDraw: imgData.canDraw,
        type: imgData.type,
        items: markerData.items,
        meta: markerData.meta
      };
    });

    // Сохраняем midline от текущего активного изображения
    if (U.CanvasMidline && serializedImages[activeImageIndex]) {
      const currentMeta = serializedImages[activeImageIndex].meta || {};
      currentMeta.mid = U.CanvasMidline.midlineY() / h;
    }

    const result = {
      v: 3,
      images: serializedImages,
      activeImageIndex: activeImageIndex,
      workMode: workMode
    };

    DEBUG.log('[USO_INIT] serialize() v3 - saved', images.length, 'images');

    return result;
  }

  /**
   * Загрузка данных
   */
  function load(data) {
    const mainCanvas = U.CanvasState.getMainCanvas();
    if (!data || !mainCanvas) return;

    const w = mainCanvas.getWidth();
    const h = mainCanvas.getHeight();
    const images = U.CanvasState.getAllImages();
    const activeImageIndex = U.CanvasState.getCurrentImageIndex();

    const createMarkerFromData = U.CanvasSerialization ? U.CanvasSerialization.createMarkerFromData : null;
    const loadMarkersToImage = U.CanvasSerialization ? U.CanvasSerialization.loadMarkersToImage : null;

    // Проверяем версию формата
    if (data.v === 3 && Array.isArray(data.images)) {
      // НОВЫЙ ФОРМАТ v:3 - множественные изображения
      DEBUG.log('[USO_INIT] load() v3 - loading', data.images.length, 'images');

      data.images.forEach(function(imgDataSerialized, idx) {
        const imgData = images[idx];
        if (!imgData) {
          console.warn('[USO_INIT] load() v3 - image index', idx, 'not found in current images');
          return;
        }

        // Очищаем старые маркеры этого изображения с canvas (если это активное изображение)
        if (idx === activeImageIndex) {
          imgData.markers.forEach(m => mainCanvas.remove(m));
        }
        imgData.markers.length = 0;

        // Загружаем метки для этого изображения
        const loadedCount = loadMarkersToImage
          ? loadMarkersToImage(imgData, imgDataSerialized.items || [], imgDataSerialized.meta, w, h)
          : 0;

        DEBUG.log('[USO_INIT] load() v3 - image', idx, ':', imgData.description,
                  '- loaded', loadedCount, 'markers');

        // Если это активное изображение, добавляем метки на canvas
        if (idx === activeImageIndex) {
          imgData.markers.forEach(m => mainCanvas.add(m));
        }
      });

      mainCanvas.requestRenderAll();
      DEBUG.log('[USO_INIT] load() v3 completed - all images loaded');

    } else if (Array.isArray(data.items)) {
      // СТАРЫЙ ФОРМАТ v:2 (или без версии) - обратная совместимость
      DEBUG.log('[USO_INIT] load() v2 (legacy) - loading to current image');

      const origW = (data.meta && data.meta.w) ? data.meta.w : w;
      const origH = (data.meta && data.meta.h) ? data.meta.h : h;
      const scaleToCanvas = w / origW;

      DEBUG.log('[USO_INIT] load() v2 - canvas:', w, 'x', h,
                'original:', origW, 'x', origH, 'scale:', scaleToCanvas);

      const markers = getMarkersForCurrentImage();

      // Очищаем старые маркеры
      markers.forEach(m => mainCanvas.remove(m));
      markers.length = 0;

      // Загружаем метки в текущее изображение
      data.items.forEach(function(it) {
        const obj = createMarkerFromData ? createMarkerFromData(it, scaleToCanvas, h) : null;
        if (obj) {
          mainCanvas.add(obj);
          markers.push(obj);
        }
      });

      mainCanvas.requestRenderAll();
      DEBUG.log('[USO_INIT] load() v2 completed, loaded', markers.length, 'markers');

    } else {
      console.warn('[USO_INIT] load() - unknown data format:', data);
    }
  }

  /**
   * Добавить изображение
   */
  async function addImage(blobOrUrl, description = null, jaw = null, saveStateFn) {
    DEBUG.log('[USO_INIT] addImage called');

    const images = U.CanvasState.getAllImages();
    const workMode = U.CanvasState.getWorkMode();

    // Используем модуль для создания imgData с EXIF обработкой
    const imgData = await U.CanvasImages.addImageWithExif(
      images, MODES, workMode, blobOrUrl, description, jaw
    );

    // Добавляем в состояние
    U.CanvasState.addImageToState(imgData);

    const newIndex = images.length - 1;

    DEBUG.log('[USO_INIT] Image added:', imgData.description, 'index:', newIndex);

    // Обновляем навигацию (параметры получит из CanvasState автоматически)
    if (U.CanvasNavigation && U.CanvasNavigation.updateImageNavigation) {
      U.CanvasNavigation.updateImageNavigation();
    }

    // Автопереход на новую вкладку
    await switchImage(newIndex);

    // Сохраняем состояние
    if (typeof saveStateFn === 'function') {
      saveStateFn();
    }

    DEBUG.log('[USO_INIT] addImage completed, total images:', images.length);
    return imgData;
  }

  /**
   * Удалить изображение
   */
  function removeImage(index, saveStateFn) {
    const images = U.CanvasState.getAllImages();

    if (index < 0 || index >= images.length) {
      console.warn('[USO_INIT] Invalid image index for removal:', index);
      return;
    }

    // Запрашиваем подтверждение
    const imgDesc = images[index].description;
    if (!confirm(`Удалить снимок "${imgDesc}"?\n\nВсе метки и аннотации будут потеряны.`)) {
      return;
    }

    DEBUG.log('[USO_INIT] Removing image:', index, 'description:', imgDesc);

    // Удаляем canvas элемент из DOM
    const canvas = U.CanvasState.getCanvasByIndex(index);
    if (canvas && canvas.getElement) {
      const canvasEl = canvas.getElement();
      if (canvasEl && canvasEl.parentNode) {
        canvasEl.parentNode.removeChild(canvasEl);
      }
      // Очищаем canvas
      canvas.dispose();
    }

    // Удаляем из состояния
    U.CanvasState.removeImageFromState(index);

    const activeImageIndex = U.CanvasState.getCurrentImageIndex();

    // Обновляем activeImageIndex
    if (images.length === 0) {
      U.CanvasState.setMainCanvas(null);
      DEBUG.log('[USO_INIT] All images removed');
    } else {
      // Если удалили активное изображение, переключаемся на предыдущее или первое
      const newIndex = activeImageIndex >= images.length ? images.length - 1 : activeImageIndex;
      switchImage(newIndex);
    }

    // Обновляем навигацию (параметры получит из CanvasState автоматически)
    if (U.CanvasNavigation && U.CanvasNavigation.updateImageNavigation) {
      U.CanvasNavigation.updateImageNavigation();
    }

    // Сохраняем состояние
    if (typeof saveStateFn === 'function') {
      saveStateFn();
    }

    DEBUG.log('[USO_INIT] Image removed. Remaining images:', images.length);
  }

  /**
   * Переключение вкладки с сохранением/загрузкой snapshot
   */
  async function switchImage(index) {
    const images = U.CanvasState.getAllImages();
    const activeImageIndex = U.CanvasState.getCurrentImageIndex();
    let mainCanvas = U.CanvasState.getMainCanvas();

    if (index < 0 || index >= images.length) {
      console.warn('[USO_INIT] Invalid image index:', index);
      return;
    }

    DEBUG.log('[USO_INIT] Switching from', activeImageIndex, 'to', index);

    // ШАГ 1: Сохраняем snapshot текущей сцены (если есть активный canvas)
    if (mainCanvas && activeImageIndex >= 0 && activeImageIndex < images.length) {
      try {
        const currentImgData = images[activeImageIndex];
        if (currentImgData) {
          // Сохраняем полный snapshot canvas в JSON
          currentImgData.serialized = mainCanvas.toJSON([
            'markerType', 'excludeFromExport', '_norm', '_lastSizeVal',
            '_manuallyScaled', '_absoluteSize', 'strokeUniform'
          ]);
          DEBUG.log('[USO_INIT] Snapshot saved for image', activeImageIndex);
        }
      } catch(err) {
        DEBUG.error('[USO_INIT] Error saving snapshot:', err);
      }
    }

    // ШАГ 2: Скрываем текущий canvas
    if (mainCanvas && mainCanvas.getElement) {
      mainCanvas.getElement().style.display = 'none';
    }

    // ШАГ 3: Обновляем активный индекс
    U.CanvasState.setActiveImageIndex(index);
    const imgData = images[index];

    // ШАГ 4: Создаем canvas если не существует
    if (!U.CanvasState.getCanvasByIndex(index)) {
      DEBUG.log('[USO_INIT] Creating new canvas for image:', index);

      const createCanvasElement = U.CanvasNavigation ? U.CanvasNavigation.createCanvasElement : null;
      const canvasEl = createCanvasElement ? createCanvasElement(index) : null;

      if (!canvasEl) {
        console.error('[USO_INIT] Failed to create canvas element');
        return;
      }

      const fabricCanvas = new fabric.Canvas(canvasEl, {
        selection: true,
        preserveObjectStacking: true,
        renderOnAddRemove: false
      });

      U.CanvasState.setCanvasByIndex(index, fabricCanvas);

      // Копируем настройки кисти
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      if (U.CanvasUI && U.CanvasUI.applyFreeBrush) {
        U.CanvasUI.applyFreeBrush(fabricCanvas, currentColor, swatchColors, fabricCanvas.getHeight(), clamp);
      }

      DEBUG.log('[USO_INIT] New canvas created:', canvasEl.id);
    }

    // ШАГ 5: Переключаемся на нужный canvas
    mainCanvas = U.CanvasState.getCanvasByIndex(index);
    U.CanvasState.setMainCanvas(mainCanvas);
    mainCanvas.getElement().style.display = 'block';

    // ШАГ 6: Загружаем snapshot или создаём чистую сцену с фоном
    if (imgData.serialized) {
      // Загружаем сохраненный snapshot
      try {
        DEBUG.log('[USO_INIT] Loading snapshot for image:', index);

        await new Promise((resolve) => {
          mainCanvas.loadFromJSON(imgData.serialized, function() {
            DEBUG.log('[USO_INIT] Snapshot loaded successfully');

            // Обновляем ссылку на bgImg после загрузки
            const loadedBgImg = U.CanvasImages.canvasImage(mainCanvas);
            if (loadedBgImg) {
              imgData.bgImg = loadedBgImg;
            }

            // Восстанавливаем массив маркеров
            imgData.markers = mainCanvas.getObjects().filter(obj => {
              return obj.type !== 'image' && obj.markerType !== '__midline__';
            });

            DEBUG.log('[USO_INIT] Restored', imgData.markers.length, 'markers from snapshot');
            resolve();
          }, function(o, obj) {
            // Callback для каждого объекта при загрузке
            // Восстанавливаем кастомные свойства
            if (o._norm) obj._norm = o._norm;
            if (o._lastSizeVal) obj._lastSizeVal = o._lastSizeVal;
            if (o._manuallyScaled) obj._manuallyScaled = o._manuallyScaled;
            if (o._absoluteSize) obj._absoluteSize = o._absoluteSize;
          });
        });

        // Применяем инструменты
        markingMode = imgData.canMark;
        mainCanvas.isDrawingMode = (imgData.canDraw && currentShape === 'free' && markingMode);

      } catch(err) {
        DEBUG.error('[USO_INIT] Error loading snapshot, recreating scene:', err);

        // ФОЛЛБЭК: Если snapshot битый — создаем сцену заново
        mainCanvas.clear();
        if (imgData.imageUrl) {
          const getAvailCanvasHeight = U.CanvasImages ? U.CanvasImages.getAvailCanvasHeight : null;
          if (U.CanvasImages && U.CanvasImages.loadImageToCanvas) {
            await U.CanvasImages.loadImageToCanvas(mainCanvas, imgData, getAvailCanvasHeight);
          }
        }
      }
    } else if (imgData.imageUrl) {
      // Создаём чистую сцену с фоном (первая загрузка)
      DEBUG.log('[USO_INIT] First load, creating clean scene for image:', index);
      const getAvailCanvasHeight = U.CanvasImages ? U.CanvasImages.getAvailCanvasHeight : null;
      if (U.CanvasImages && U.CanvasImages.loadImageToCanvas) {
        await U.CanvasImages.loadImageToCanvas(mainCanvas, imgData, getAvailCanvasHeight);
      }
    }

    // ШАГ 7: Применяем инструменты: markingMode = images[active].canMark
    markingMode = imgData.canMark;
    mainCanvas.isDrawingMode = (imgData.canDraw && currentShape === 'free' && markingMode);

    DEBUG.log('[USO_INIT] Applied tools - canMark:', imgData.canMark, 'canDraw:', imgData.canDraw, 'markingMode:', markingMode);

    // ШАГ 8: Обновляем UI (состояния кнопок), таб-бар подсвечивает активный
    syncMarkMode();
    updateMarkingButton();

    if (U.CanvasMidline && U.CanvasMidline.ensureMidline) {
      U.CanvasMidline.ensureMidline(true);
    }

    if (U.CanvasUI && U.CanvasUI.applyFreeBrush) {
      U.CanvasUI.applyFreeBrush(mainCanvas, currentColor, swatchColors, mainCanvas.getHeight(), clamp);
    }

    mainCanvas.requestRenderAll();

    if (U.CanvasNavigation && U.CanvasNavigation.updateImageNavigation) {
      U.CanvasNavigation.updateImageNavigation();
    }

    DEBUG.log('[USO_INIT] switchImage completed for index:', index);
  }

  /**
   * Инициализация canvas
   */
  function initCanvas(onChangeFn) {
    if (typeof fabric === 'undefined') {
      console.error('[USO_INIT] fabric.js not loaded');
      return null;
    }

    onChange = onChangeFn;

    try {
      // Создаем первый canvas элемент
      const firstCanvasEl = document.getElementById('uso-canvas');
      if (!firstCanvasEl) {
        console.error('[USO_INIT] Canvas element #uso-canvas not found');
        return null;
      }

      const mainCanvas = new fabric.Canvas('uso-canvas', {
        selection: true,
        preserveObjectStacking: true,
        renderOnAddRemove: false
      });

      // ✅ ИСПРАВЛЕНИЕ: Устанавливаем правильное позиционирование для первого canvas
      const canvasEl = mainCanvas.getElement();
      if (canvasEl) {
        canvasEl.style.position = 'absolute';
        canvasEl.style.top = '0';
        canvasEl.style.left = '0';
        canvasEl.style.display = 'block';
      }

      // ✅ Устанавливаем position: relative для контейнера
      const container = document.getElementById('uso-canvas-container');
      if (container) {
        const computedStyle = window.getComputedStyle(container);
        if (computedStyle.position === 'static') {
          container.style.position = 'relative';
          DEBUG.log('[USO_INIT] Container position set to relative');
        }
      }

      // Сохраняем в состояние
      U.CanvasState.setMainCanvas(mainCanvas);
      U.CanvasState.setCanvasByIndex(0, mainCanvas);

      DEBUG.log('[USO_INIT] Canvas initialized successfully');

      // Инициализируем UI контролы
      if (U.CanvasUI && U.CanvasUI.injectSizeControls) {
        U.CanvasUI.injectSizeControls();
      }

      // Инициализируем взаимодействия
      if (U.CanvasInteractions) {
        if (U.CanvasInteractions.enableMouseWheelZoom) U.CanvasInteractions.enableMouseWheelZoom();
        if (U.CanvasInteractions.enablePanDrag) U.CanvasInteractions.enablePanDrag();
        if (U.CanvasInteractions.enableTouchGestures) U.CanvasInteractions.enableTouchGestures();
        if (U.CanvasInteractions.enableContainerResizeObserver) U.CanvasInteractions.enableContainerResizeObserver();
      }

      // Настраиваем fullscreen
      if (U.CanvasFullscreen) {
        $('#uso-exit-fs').on('click', function() {
          // Логика выхода из fullscreen обрабатывается модулем
        });

        $('#uso-fullscreen').on('click', function() {
          if (U.CanvasFullscreen.toggleFullscreen) {
            U.CanvasFullscreen.toggleFullscreen();
          }
        });

        const onFsChange = function() {
          if (U.CanvasFullscreen.updateFullscreenBtn) {
            U.CanvasFullscreen.updateFullscreenBtn();
          }
        };

        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
      }

      // Привязываем кнопку средней линии
      (function bindMidlineToggle() {
        const $btn = $('#img-rotate');
        if ($btn.length) {
          $btn.off('click');
          $btn.attr({ title: 'Средняя линия: смещение по вертикали', 'aria-pressed': 'false' }).text('Ср. линия');
          $btn.on('click', function() {
            if (U.CanvasMidline && U.CanvasMidline.setMidlineMode && U.CanvasMidline.getMidlineMode) {
              const currentMode = U.CanvasMidline.getMidlineMode();
              U.CanvasMidline.setMidlineMode(!currentMode, syncMarkMode);
            }
          });
        }
      })();

      // Привязываем палитру цветов
      $('.palette .color-btn').on('click', function() {
        $('.palette .color-btn').attr('aria-pressed', 'false').removeClass('active');
        $(this).attr('aria-pressed', 'true').addClass('active');
        currentColor = this.getAttribute('data-color') || 'blue';
        if (U.CanvasUI && U.CanvasUI.applyFreeBrush) {
          U.CanvasUI.applyFreeBrush(mainCanvas, currentColor, swatchColors, mainCanvas.getHeight(), clamp);
        }
        if (U.CanvasUI && U.CanvasUI.updatePaletteBg) {
          U.CanvasUI.updatePaletteBg(currentColor, swatchColors, hexToRgba);
        }
        if (U.CanvasUI && U.CanvasUI.updateShapeButtonsAvailability) {
          U.CanvasUI.updateShapeButtonsAvailability(currentColor, markerType);
        }
      });
      $('.palette .color-btn[data-color="blue"]').addClass('active').attr('aria-pressed', 'true');
      if (U.CanvasUI) {
        if (U.CanvasUI.updatePaletteBg) U.CanvasUI.updatePaletteBg(currentColor, swatchColors, hexToRgba);
        if (U.CanvasUI.updateShapeButtonsAvailability) U.CanvasUI.updateShapeButtonsAvailability(currentColor, markerType);
      }

      // Привязываем кнопки фигур
      $('.palette .shape-btn').on('click', function() {
        $('.palette .shape-btn').attr('aria-pressed', 'false').removeClass('active');
        $(this).attr('aria-pressed', 'true').addClass('active');
        currentShape = this.getAttribute('data-shape') || 'point';

        const midlineMode = U.CanvasMidline ? U.CanvasMidline.getMidlineMode() : false;
        const cropping = U.CanvasCropping ? U.CanvasCropping.isCropping() : false;

        if (currentShape === 'free') {
          if (U.CanvasUI && U.CanvasUI.applyFreeBrush) {
            U.CanvasUI.applyFreeBrush(mainCanvas, currentColor, swatchColors, mainCanvas.getHeight(), clamp);
          }
          mainCanvas.isDrawingMode = (markingMode && !midlineMode && !cropping);
        } else {
          mainCanvas.isDrawingMode = false;
        }
      });

      // Привязываем кнопку маркировки
      $('#mark-toggle').on('click', function() {
        if (U.CanvasMidline && U.CanvasMidline.getMidlineMode && U.CanvasMidline.getMidlineMode()) {
          if (U.CanvasMidline.setMidlineMode) {
            U.CanvasMidline.setMidlineMode(false, syncMarkMode);
          }
        }
        markingMode = !markingMode;
        $(this).attr('aria-pressed', markingMode ? 'true' : 'false').toggleClass('primary', markingMode);
        syncMarkMode();
      });
      syncMarkMode();
      if (U.CanvasUI && U.CanvasUI.applyFreeBrush) {
        U.CanvasUI.applyFreeBrush(mainCanvas, currentColor, swatchColors, mainCanvas.getHeight(), clamp);
      }

      // Привязываем кнопки undo и delete
      $('#uso-undo').on('click', function() {
        // Undo обрабатывается модулем markers через pushHistory
        const imgData = U.CanvasState.getCurrentImage();
        if (imgData && imgData.history) {
          if (U.CanvasMarkers && U.CanvasMarkers.undoLast) {
            U.CanvasMarkers.undoLast(mainCanvas, imgData.history, load, U.CanvasImages.fitImageToCanvas, imgData);
          }
        }
      });

      $('#uso-del').on('click', function() {
        if (U.CanvasMarkers && U.CanvasMarkers.deleteSelection) {
          U.CanvasMarkers.deleteSelection(
            mainCanvas,
            getMarkersForCurrentImage,
            (markers) => {
              const imgData = U.CanvasState.getCurrentImage();
              if (imgData) imgData.markers = markers;
            },
            () => {
              const imgData = U.CanvasState.getCurrentImage();
              if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
                if (!imgData.history) imgData.history = [];
                U.CanvasMarkers.pushHistory(imgData.history, serialize);
              }
            }
          );
        }
        if (onChange) onChange();
      });

      // Привязываем клавишу Delete
      $(document).on('keydown.uso', function(e) {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
        if (!$(t).closest('#uso-calc-app').length) return;
        e.preventDefault();

        if (U.CanvasMarkers && U.CanvasMarkers.deleteSelection) {
          U.CanvasMarkers.deleteSelection(
            mainCanvas,
            getMarkersForCurrentImage,
            (markers) => {
              const imgData = U.CanvasState.getCurrentImage();
              if (imgData) imgData.markers = markers;
            },
            () => {
              const imgData = U.CanvasState.getCurrentImage();
              if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
                if (!imgData.history) imgData.history = [];
                U.CanvasMarkers.pushHistory(imgData.history, serialize);
              }
            }
          );
        }
        if (onChange) onChange();
      });

      // Обработчики событий canvas
      let lastMarkerTime = 0;
      const MARKER_DEBOUNCE = 300;
      let lineDrawRafId = null;

      // Mouse down - создание маркеров
      mainCanvas.on('mouse:down', function(opt) {
        if (!canAddMarkers()) return;
        if (currentShape === 'free') return;

        const now = Date.now();
        if (now - lastMarkerTime < MARKER_DEBOUNCE) return;
        lastMarkerTime = now;

        const p = mainCanvas.getPointer(opt.e);
        const shape = currentShape || 'point';
        if (opt && opt.target) return;

        const h = mainCanvas.getHeight();
        const SIZE_F = U.CanvasUI ? U.CanvasUI.SIZE_F : {};

        if (shape === 'line') {
          const mt = markerType(currentColor, 'line');
          if (!mt) return;
          if (!drawState) {
            const sw = Math.max(2, Math.round(h * 0.0055 * (SIZE_F.line || 1)));
            const dx = Math.max(10, Math.round(h * 0.022 * (SIZE_F.line || 1)));
            const dy = Math.max(10, Math.round(h * 0.0165 * (SIZE_F.line || 1)));

            const lineObj = U.CanvasMarkers && U.CanvasMarkers.createLine
              ? U.CanvasMarkers.createLine(p.x, p.y, p.x + dx, p.y + dy, mt, sw, h)
              : null;

            if (lineObj) {
              drawState = { mode: 'line', start: { x: p.x, y: p.y }, lineObj: lineObj };
              mainCanvas.add(drawState.lineObj);
              mainCanvas.discardActiveObject();
            }
          }
          return;
        }

        const mt = markerType(currentColor, shape);
        if (!mt) return;

        if (U.CanvasMarkers && U.CanvasMarkers.addMarker) {
          const getSizeSliderVal = U.CanvasUI ? U.CanvasUI.getSizeSliderVal : (() => 1);
          const applySizeBySlider = U.CanvasUI ? U.CanvasUI.applySizeBySlider : null;

          const obj = U.CanvasMarkers.addMarker(
            mainCanvas,
            mt,
            p.x,
            p.y,
            getMarkersForCurrentImage,
            applySizeBySlider ? (o) => applySizeBySlider(o, getSizeSliderVal()) : null,
            () => {
              const imgData = U.CanvasState.getCurrentImage();
              if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
                if (!imgData.history) imgData.history = [];
                U.CanvasMarkers.pushHistory(imgData.history, serialize);
              }
            }
          );

          if (obj && onChange) onChange();
          syncMarkMode();
        }
      });

      // Mouse move - рисование линии
      mainCanvas.on('mouse:move', function(opt) {
        if (drawState && drawState.mode === 'line') {
          const p = mainCanvas.getPointer(opt.e);
          drawState.lineObj.set({ x2: p.x, y2: p.y });
          drawState.lineObj.setCoords();

          // Debounce: рендерим только один раз за frame
          if (!lineDrawRafId) {
            lineDrawRafId = requestAnimationFrame(() => {
              mainCanvas.requestRenderAll();
              lineDrawRafId = null;
            });
          }
        }
      });

      // Mouse up - завершение рисования линии
      mainCanvas.on('mouse:up', function() {
        if (drawState && drawState.mode === 'line') {
          const markers = getMarkersForCurrentImage();
          markers.push(drawState.lineObj);
          mainCanvas.setActiveObject(drawState.lineObj);

          if (U.CanvasUI && U.CanvasUI.applySizeBySlider && U.CanvasUI.getSizeSliderVal) {
            U.CanvasUI.applySizeBySlider(drawState.lineObj, U.CanvasUI.getSizeSliderVal());
          }

          drawState = null;

          // Отменяем pending RAF если есть
          if (lineDrawRafId) {
            cancelAnimationFrame(lineDrawRafId);
            lineDrawRafId = null;
          }

          mainCanvas.requestRenderAll();

          // Сохраняем в историю
          const imgData = U.CanvasState.getCurrentImage();
          if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
            if (!imgData.history) imgData.history = [];
            U.CanvasMarkers.pushHistory(imgData.history, serialize);
          }

          if (onChange) onChange();
          syncMarkMode();
        }
      });

      // Path created - свободное рисование
      mainCanvas.on('path:created', function(ev) {
        if (!canAddMarkers()) {
          if (ev.path) mainCanvas.remove(ev.path);
          return;
        }

        const path = ev.path;
        const h = mainCanvas.getHeight();
        path.set({
          fill: 'transparent',
          strokeUniform: true,
          selectable: true,
          evented: true,
          originX: 'left',
          originY: 'top'
        });
        path.set('markerType', 'free');
        path._norm = { strokeN: (path.strokeWidth || Math.round(h * 0.0055)) / h, factor: 1 };

        mainCanvas.setActiveObject(path);

        if (U.CanvasUI && U.CanvasUI.applySizeBySlider && U.CanvasUI.getSizeSliderVal) {
          U.CanvasUI.applySizeBySlider(path, U.CanvasUI.getSizeSliderVal());
        }

        const markers = getMarkersForCurrentImage();
        markers.push(path);

        // Сохраняем в историю
        const imgData = U.CanvasState.getCurrentImage();
        if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
          if (!imgData.history) imgData.history = [];
          U.CanvasMarkers.pushHistory(imgData.history, serialize);
        }
      });

      // Selection events
      const updateDelBtnState = function() {
        const ao = mainCanvas.getActiveObject();
        const has = !!ao;
        $('#uso-del').prop('disabled', !has);

        if (ao && ao._norm && typeof ao._norm.factor === 'number') {
          if (U.CanvasUI && U.CanvasUI.setSizeSliderVal && U.CanvasUI.scaleToSlider) {
            U.CanvasUI.setSizeSliderVal(U.CanvasUI.scaleToSlider(ao._norm.factor));
          }
        }
      };

      mainCanvas.on('selection:created', updateDelBtnState);
      mainCanvas.on('selection:updated', updateDelBtnState);
      mainCanvas.on('selection:cleared', function() {
        $('#uso-del').prop('disabled', true);
      });

      // Object moving
      mainCanvas.on('object:moving', function(e) {
        const obj = e.target;
        if (!obj) return;

        // Midline движение
        if (U.CanvasMidline && U.CanvasMidline.getMidline && obj === U.CanvasMidline.getMidline()) {
          if (U.CanvasMidline.handleMidlineMoving) {
            U.CanvasMidline.handleMidlineMoving(obj);
          }
          return;
        }

        // Cropping движение
        const cropping = U.CanvasCropping ? U.CanvasCropping.getCropping() : null;
        if (cropping && obj === cropping.rect) {
          if (U.CanvasCropping && U.CanvasCropping.keepRectInBounds) {
            U.CanvasCropping.keepRectInBounds(obj);
          }
          return;
        }

        // Ограничение маркеров в пределах canvas
        const padding = 0;
        const w = mainCanvas.getWidth();
        const h = mainCanvas.getHeight();
        const bounds = obj.getBoundingRect(true);
        let dx = 0, dy = 0;

        if (bounds.left < padding) dx = padding - bounds.left;
        if (bounds.top < padding) dy = padding - bounds.top;
        if ((bounds.left + bounds.width) > (w - padding)) dx = (w - padding) - (bounds.left + bounds.width);
        if ((bounds.top + bounds.height) > (h - padding)) dy = (h - padding) - (bounds.top + bounds.height);

        if (dx || dy) {
          obj.left = (obj.left || 0) + dx;
          obj.top = (obj.top || 0) + dy;
          obj.setCoords();
        }
      });

      // Object scaling
      mainCanvas.on('object:scaling', function(e) {
        const cropping = U.CanvasCropping ? U.CanvasCropping.getCropping() : null;

        if (!cropping || e.target !== cropping.rect) {
          const obj = e.target;
          if (obj && obj.type === 'ellipse') {
            obj._manuallyScaled = true;
            obj._absoluteSize = {
              rx: obj.rx * obj.scaleX,
              ry: obj.ry * obj.scaleY,
              strokeWidth: obj.strokeWidth
            };
          }
          return;
        }

        if (U.CanvasCropping) {
          if (U.CanvasCropping.applyRatioOnScale) {
            U.CanvasCropping.applyRatioOnScale(e.target);
          }
          if (U.CanvasCropping.keepRectInBounds) {
            U.CanvasCropping.keepRectInBounds(e.target);
          }
        }
      });

      // Object modified
      mainCanvas.on('object:modified', function() {
        const imgData = U.CanvasState.getCurrentImage();
        if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
          if (!imgData.history) imgData.history = [];
          U.CanvasMarkers.pushHistory(imgData.history, serialize);
        }
      });

      // Double click - удаление маркера
      mainCanvas.on('mouse:dblclick', function(opt) {
        const midlineMode = U.CanvasMidline ? U.CanvasMidline.getMidlineMode() : false;
        const cropping = U.CanvasCropping ? U.CanvasCropping.isCropping() : false;

        if (markingMode || midlineMode || cropping) return;

        const t = opt && opt.target;
        const imgData = U.CanvasState.getCurrentImage();
        const bgImg = imgData ? imgData.bgImg : null;
        const midline = U.CanvasMidline ? U.CanvasMidline.getMidline() : null;

        if (t && t !== bgImg && t !== midline) {
          mainCanvas.setActiveObject(t);
          if (U.CanvasMarkers && U.CanvasMarkers.deleteSelection) {
            U.CanvasMarkers.deleteSelection(
              mainCanvas,
              getMarkersForCurrentImage,
              (markers) => {
                if (imgData) imgData.markers = markers;
              },
              () => {
                if (imgData && U.CanvasMarkers && U.CanvasMarkers.pushHistory) {
                  if (!imgData.history) imgData.history = [];
                  U.CanvasMarkers.pushHistory(imgData.history, serialize);
                }
              }
            );
          }
        }
      });

      // View reset
      $('#view-reset').on('click', function() {
        if (U.CanvasImages && U.CanvasImages.resetView) {
          U.CanvasImages.resetView();
        }
      });

      // Window resize
      $(window).on('resize orientationchange', U.util && U.util.throttle
        ? U.util.throttle(function() {
          if (U.CanvasFullscreen && U.CanvasFullscreen.updateFullscreenBtn) {
            U.CanvasFullscreen.updateFullscreenBtn();
          }
        }, 150)
        : function() {}
      );

      // Инициализируем midline
      if (U.CanvasMidline) {
        if (U.CanvasMidline.ensureMidline) U.CanvasMidline.ensureMidline();
        if (U.CanvasMidline.setMidlineMode) U.CanvasMidline.setMidlineMode(false, syncMarkMode);
      }

      return mainCanvas;

    } catch(err) {
      console.error('[USO_INIT] Canvas initialization error:', err);
      return null;
    }
  }

  // ============================================
  // ЭКСПОРТ
  // ============================================

  U.CanvasInit = {
    initCanvas,
    syncMarkMode,
    canAddMarkers,
    getMarkersForCurrentImage,
    rescaleAllMarkers,
    resetMarkers,
    updateMarkingButton,
    addImage,
    removeImage,
    switchImage,
    serialize,
    load
  };

  // ============================================
  // АГРЕГИРОВАННЫЙ ЭКСПОРТ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
  // ============================================
  // Создаем единый объект USO_CANVAS, который объединяет все модули
  // для совместимости со старым API uso.app.js и uso.export.js

  w.USO_CANVAS = {
    // ✅ Из CanvasInit
    initCanvas,
    syncMarkMode,
    canAddMarkers,
    getMarkersForCurrentImage,
    rescaleAllMarkers,
    resetMarkers,
    updateMarkingButton,
    addImage,
    removeImage,
    switchImage,
    serialize,
    load,

    // ✅ Из CanvasState
    setWorkMode: function(mode) {
      if (U.CanvasState && U.CanvasState.setWorkMode) {
        U.CanvasState.setWorkMode(mode);
      }
    },
    getWorkMode: function() {
      return U.CanvasState && U.CanvasState.getWorkMode ? U.CanvasState.getWorkMode() : 'panoramic';
    },
    getAllImages: function() {
      return U.CanvasState && U.CanvasState.getAllImages ? U.CanvasState.getAllImages() : [];
    },
    hasImage: function() {
      return U.CanvasState && U.CanvasState.hasImage ? U.CanvasState.hasImage() : false;
    },
    MODES: U.CanvasConfig ? U.CanvasConfig.MODES : { PANORAMIC: 'panoramic', SIMPLE: 'simple' },

    // ✅ Из CanvasCalculations
    getCountsForCalculation: function() {
      if (!U.CanvasCalculations || !U.CanvasState) return {};
      const images = U.CanvasState.getAllImages ? U.CanvasState.getAllImages() : [];
      const workMode = U.CanvasState.getWorkMode ? U.CanvasState.getWorkMode() : 'panoramic';
      return U.CanvasCalculations.getCountsForCalculation(images, workMode);
    },
    getJawSplitsForCalculation: function() {
      if (!U.CanvasCalculations || !U.CanvasState) return {};
      const images = U.CanvasState.getAllImages ? U.CanvasState.getAllImages() : [];
      const workMode = U.CanvasState.getWorkMode ? U.CanvasState.getWorkMode() : 'panoramic';
      const getMidlineY = U.CanvasMidline && U.CanvasMidline.midlineY ? U.CanvasMidline.midlineY : null;
      return U.CanvasCalculations.getJawSplitsForCalculation(images, workMode, getMidlineY);
    },

    // ✅ Из CanvasCropping
    startCrop: function(ratio) {
      if (U.CanvasCropping && U.CanvasCropping.startCrop) {
        U.CanvasCropping.startCrop(ratio);
      }
    },
    applyCrop: async function() {
      if (U.CanvasCropping && U.CanvasCropping.applyCrop) {
        return await U.CanvasCropping.applyCrop();
      }
    },
    cancelCrop: function() {
      if (U.CanvasCropping && U.CanvasCropping.cancelCrop) {
        U.CanvasCropping.cancelCrop();
      }
    },
    setCropRatio: function(ratio) {
      if (U.CanvasCropping && U.CanvasCropping.setCropRatio) {
        U.CanvasCropping.setCropRatio(ratio);
      }
    },

    // ✅ Из CanvasImages
    canvasImage: function() {
      const mainCanvas = U.CanvasState && U.CanvasState.getMainCanvas ? U.CanvasState.getMainCanvas() : null;
      if (!mainCanvas) return null;

      if (U.CanvasImages && U.CanvasImages.canvasImage) {
        const img = U.CanvasImages.canvasImage(mainCanvas);
        return img ? img.getSrc() : null;
      }
      return null;
    },

    // ✅ Из CanvasNavigation
    getAllImagesForExport: async function() {
      if (!U.CanvasNavigation || !U.CanvasNavigation.getAllImagesForExport) return [];

      const images = U.CanvasState && U.CanvasState.getAllImages ? U.CanvasState.getAllImages() : [];

      // Функция рендеринга изображения с маркерами
      const renderImageFn = async function(index) {
        // Переключаемся на нужное изображение
        await switchImage(index);

        const mainCanvas = U.CanvasState.getMainCanvas();
        if (!mainCanvas) return null;

        try {
          // Рендерим canvas с маркерами в dataURL
          return mainCanvas.toDataURL({ format: 'png', quality: 1 });
        } catch(err) {
          console.error('[USO_CANVAS] Failed to render image', index, err);
          return null;
        }
      };

      return await U.CanvasNavigation.getAllImagesForExport(images, renderImageFn);
    }
  };

  DEBUG.log('[USO_INIT] Module loaded, USO_CANVAS exported');

})(window, jQuery);
