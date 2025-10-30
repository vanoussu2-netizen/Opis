# USO Canvas Modules Structure

## Обзор модульной структуры

Файл `uso.canvas.js` (2786 строк) был разделен на следующие модули для улучшения поддерживаемости и читаемости кода:

## Модули

### 1. uso.canvas.config.js (164 строки)
**Назначение:** Конфигурация, константы, цвета и debug-система

**Экспортирует:**
- `U.CanvasConfig.DEBUG` - Система отладки
- `U.CanvasConfig.MODES` - Режимы работы (PANORAMIC, SIMPLE)
- `U.CanvasConfig.swatchColors` - Цветовая палитра
- `U.CanvasConfig.colorMap` - Карта типов маркеров и цветов
- `U.CanvasConfig.markerType(color, shape)` - Функция получения типа маркера
- `U.CanvasConfig.hexToRgba(hex, alpha)` - Конвертация HEX в RGBA
- `U.CanvasConfig.clamp(n, min, max)` - Ограничение числа в диапазоне

**Зависимости:** Нет

---

### 2. uso.canvas.fullscreen.js (218 строк)
**Назначение:** Управление полноэкранным режимом (нативный API + эмуляция для iOS)

**Экспортирует:**
- `U.CanvasFullscreen.toggleFullscreen()` - Переключение полноэкранного режима
- `U.CanvasFullscreen.updateFullscreenBtn()` - Обновление UI кнопки
- `U.CanvasFullscreen.isAnyFs()` - Проверка активности полноэкранного режима
- `U.CanvasFullscreen.setResizeCallback(callback)` - Установка callback при resize
- `U.CanvasFullscreen.isIOS` - Флаг iOS устройства

**Зависимости:**
- jQuery
- `U.DEBUG_CANVAS`
- `U.util.throttle`

---

### 3. uso.canvas.ui.js (400 строк)
**Назначение:** UI утилиты и управление размерами маркеров

**Экспортирует:**
- `U.CanvasUI.SIZE_F` - Коэффициенты размеров для фигур
- `U.CanvasUI.updatePaletteBg(currentColor, swatchColors, hexToRgba)` - Обновление фона палитры
- `U.CanvasUI.updateShapeButtonsAvailability(currentColor, markerType)` - Управление доступностью кнопок
- `U.CanvasUI.sliderToScale(val)` / `U.CanvasUI.scaleToSlider(scale)` - Конвертация значений слайдера
- `U.CanvasUI.injectSizeControls(callbacks)` - Создание элементов управления размером
- `U.CanvasUI.getSizeSliderVal()` / `U.CanvasUI.setSizeSliderVal(v)` - Работа со слайдером
- `U.CanvasUI.currentSizeMultiplier()` - Получение текущего множителя размера
- `U.CanvasUI.brushWidth(canvasHeight, clamp)` - Вычисление ширины кисти
- `U.CanvasUI.applyFreeBrush(...)` - Применение настроек кисти
- `U.CanvasUI.applyPointScale(...)` - Масштабирование точек
- `U.CanvasUI.applySizeBySlider(...)` - Применение размера к объекту
- `U.CanvasUI.rescaleMarker(o, canvasHeight)` - Масштабирование маркера при resize

**Зависимости:**
- jQuery
- Fabric.js
- `U.DEBUG_CANVAS`

---

### 4. uso.canvas.interactions.js (300 строк)
**Назначение:** Взаимодействия пользователя (зум, пан, сенсорные жесты)

**Экспортирует:**
- `U.CanvasInteractions.enableMouseWheelZoom(canvas, canInteract)` - Зум колесиком мыши
- `U.CanvasInteractions.enablePanDrag(canvas, canInteract)` - Перетаскивание изображения
- `U.CanvasInteractions.enableTouchGestures(canvas, canInteract)` - Сенсорные жесты (pinch zoom)
- `U.CanvasInteractions.enableContainerResizeObserver(onResize)` - Отслеживание изменения размера
- `U.CanvasInteractions.disableContainerResizeObserver()` - Отключение ResizeObserver

**Зависимости:**
- jQuery
- Fabric.js
- `U.DEBUG_CANVAS`
- `U.util.throttle`

---

### 5. uso.canvas.images.js (240 строк)
**Назначение:** Управление изображениями (загрузка, EXIF, подгонка к canvas)

**Экспортирует:**
- `U.CanvasImages.createImageData(type)` - Создание структуры данных изображения
- `U.CanvasImages.loadScript(src)` - Динамическая загрузка скрипта
- `U.CanvasImages.drawWithOrientationExact(img, orientation)` - Поворот по EXIF
- `U.CanvasImages.loadImageElement(url)` - Загрузка HTMLImageElement
- `U.CanvasImages.fitImageToCanvas(...)` - Подгонка изображения к canvas
- `U.CanvasImages.getAvailCanvasHeight(wrap)` - Вычисление доступной высоты
- `U.CanvasImages.canvasImage(canvas)` - Получение изображения с canvas
- `U.CanvasImages.hasImage(canvas)` - Проверка наличия изображения
- `U.CanvasImages.resetView(canvas)` - Сброс зума и позиции

**Зависимости:**
- Fabric.js
- `U.DEBUG_CANVAS`

---

### 6. uso.canvas.serialization.js (364 строки)
**Назначение:** Сериализация и десериализация данных маркеров

**Экспортирует:**
- `U.CanvasSerialization.detectShape(obj)` - Определение типа фигуры
- `U.CanvasSerialization.serializeImageMarkers(imgData, canvasWidth, canvasHeight)` - Сериализация маркеров
- `U.CanvasSerialization.createMarkerFromData(it, scaleToCanvas, canvasHeight)` - Создание маркера из данных
- `U.CanvasSerialization.loadMarkersToImage(...)` - Загрузка маркеров в изображение

**Зависимости:**
- Fabric.js
- `U.DEBUG_CANVAS`
- `U.CanvasConfig.colorMap`

---

## Порядок загрузки модулей

Для правильной работы модули должны загружаться в следующем порядке:

1. **uso.canvas.config.js** - Базовая конфигурация (не зависит от других модулей)
2. **uso.canvas.fullscreen.js**
3. **uso.canvas.ui.js**
4. **uso.canvas.interactions.js**
5. **uso.canvas.images.js**
6. **uso.canvas.serialization.js**
7. **uso.canvas.js** - Основной модуль (координирует работу всех модулей)

## Использование в PHP (WordPress)

```php
wp_register_script('uso-canvas-config', plugins_url('js/uso.canvas.config.js', __FILE__),
    ['jquery'], $ver_js, true);
wp_register_script('uso-canvas-fullscreen', plugins_url('js/uso.canvas.fullscreen.js', __FILE__),
    ['jquery', 'uso-canvas-config'], $ver_js, true);
wp_register_script('uso-canvas-ui', plugins_url('js/uso.canvas.ui.js', __FILE__),
    ['jquery', 'fabric-js', 'uso-canvas-config'], $ver_js, true);
wp_register_script('uso-canvas-interactions', plugins_url('js/uso.canvas.interactions.js', __FILE__),
    ['jquery', 'fabric-js', 'uso-canvas-config'], $ver_js, true);
wp_register_script('uso-canvas-images', plugins_url('js/uso.canvas.images.js', __FILE__),
    ['fabric-js', 'uso-canvas-config'], $ver_js, true);
wp_register_script('uso-canvas-serialization', plugins_url('js/uso.canvas.serialization.js', __FILE__),
    ['fabric-js', 'uso-canvas-config'], $ver_js, true);
wp_register_script('uso-canvas', plugins_url('js/uso.canvas.js', __FILE__),
    ['jquery', 'fabric-js', 'exifr', 'wp-i18n', 'uso-state',
     'uso-canvas-config', 'uso-canvas-fullscreen', 'uso-canvas-ui',
     'uso-canvas-interactions', 'uso-canvas-images', 'uso-canvas-serialization'], $ver_js, true);
```

## Преимущества модульной структуры

1. **Лучшая поддерживаемость** - Каждый модуль отвечает за свою область
2. **Простота тестирования** - Модули можно тестировать изолированно
3. **Переиспользование** - Модули можно использовать в других проектах
4. **Меньше конфликтов при командной разработке** - Разные разработчики могут работать над разными модулями
5. **Улучшенная читаемость** - Меньший размер файлов, легче найти нужный код
6. **Оптимизация загрузки** - Возможность загружать только нужные модули

## Обратная совместимость

Новая модульная структура полностью обратно совместима с существующим кодом. Публичный API (`window.USO_CANVAS`) остается неизменным.

## Дальнейшие улучшения

- Добавить TypeScript определения для всех модулей
- Создать систему сборки для production (минификация, объединение)
- Добавить unit-тесты для каждого модуля
- Рассмотреть миграцию на ES6 модули (import/export)
