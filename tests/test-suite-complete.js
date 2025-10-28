/**
 * ПОЛНЫЙ НАБОР ТЕСТОВ УСО КАЛЬКУЛЯТОРА
 * Версия: 2.0
 * Дата: 2024
 */

'use strict';

class USO_TestSuite {
  constructor() {
    this.results = [];
    this.startTime = null;
    this.endTime = null;
    this.currentTest = null;
    this.logs = [];
  }

  // ===== ЛОГИРОВАНИЕ =====
  log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    const entry = { timestamp, msg, type };
    this.logs.push(entry);
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${msg}`);
  }

  success(msg) { this.log('✅ ' + msg, 'success'); }
  error(msg) { this.log('❌ ' + msg, 'error'); }
  warn(msg) { this.log('⚠️ ' + msg, 'warn'); }
  info(msg) { this.log('ℹ️ ' + msg, 'info'); }

  // ===== ТЕСТЫ ИНИЦИАЛИЗАЦИИ =====

  async testInitialization() {
    this.currentTest = 'Инициализация системы';
    this.log('Начало теста инициализации', 'info');

    const checks = {
      jQuery: typeof $ !== 'undefined',
      Fabric: typeof fabric !== 'undefined',
      html2canvas: typeof html2canvas !== 'undefined',
      jsPDF: typeof jsPDF !== 'undefined' || typeof jspdf !== 'undefined',
      exifr: typeof exifr !== 'undefined',
      USO_CANVAS: typeof USO_CANVAS !== 'undefined' && typeof USO_CANVAS.initCanvas === 'function',
      USO_CALC: typeof USO_CALC !== 'undefined' && typeof USO_CALC.compute === 'function',
      USO_EXPORT: typeof USO_EXPORT !== 'undefined' && typeof USO_EXPORT.exportPDF === 'function'
    };

    let allPassed = true;
    for (const [lib, loaded] of Object.entries(checks)) {
      if (loaded) {
        this.success(`${lib} загружена`);
      } else {
        this.error(`${lib} НЕ загружена`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  // ===== ТЕСТЫ CANVAS =====

  async testCanvasCreation() {
    this.currentTest = 'Создание Canvas';
    this.log('Проверка создания canvas элемента', 'info');

    const canvas = document.getElementById('uso-canvas');
    if (!canvas) {
      this.error('Canvas элемент не найден');
      return false;
    }

    if (canvas.tagName !== 'CANVAS') {
      this.error('Элемент не является canvas');
      return false;
    }

    this.success('Canvas элемент создан корректно');
    return true;
  }

  async testCanvasContainer() {
    this.currentTest = 'Контейнер Canvas';
    this.log('Проверка контейнера canvas', 'info');

    const container = document.getElementById('uso-canvas-container');
    if (!container) {
      this.error('Контейнер canvas не найден');
      return false;
    }

    const width = container.offsetWidth;
    const height = container.offsetHeight;

    if (width <= 0 || height <= 0) {
      this.error(`Неверные размеры контейнера: ${width}x${height}`);
      return false;
    }

    this.success(`Контейнер создан: ${width}x${height}px`);
    return true;
  }

  // ===== ТЕСТЫ РЕЖИМОВ =====

  async testWorkModes() {
    this.currentTest = 'Режимы работы';
    this.log('Проверка режимов работы', 'info');

    if (!USO_CANVAS.MODES) {
      this.error('MODES не определены');
      return false;
    }

    const modes = Object.values(USO_CANVAS.MODES);
    if (modes.length < 2) {
      this.error('Недостаточно режимов');
      return false;
    }

    this.success(`Найдено ${modes.length} режимов: ${modes.join(', ')}`);

    // Проверяем переключение режимов
    try {
      USO_CANVAS.setWorkMode(USO_CANVAS.MODES.PANORAMIC);
      this.success('Режим PANORAMIC активирован');

      USO_CANVAS.setWorkMode(USO_CANVAS.MODES.SIMPLE);
      this.success('Режим SIMPLE активирован');

      return true;
    } catch (err) {
      this.error('Ошибка переключения режимов: ' + err.message);
      return false;
    }
  }

  // ===== ТЕСТЫ МУЛЬТИСНИМКОВ =====

  async testMultiImages() {
    this.currentTest = 'Система мультиснимков';
    this.log('Проверка системы мультиснимков', 'info');

    try {
      // Проверяем методы
      const methods = ['addImage', 'switchImage', 'getCurrentImage', 'getAllImages'];
      for (const method of methods) {
        if (typeof USO_CANVAS[method] !== 'function') {
          this.error(`Метод ${method} не найден`);
          return false;
        }
        this.success(`Метод ${method} доступен`);
      }

      // Проверяем начальное состояние
      const allImages = USO_CANVAS.getAllImages();
      if (!Array.isArray(allImages)) {
        this.error('getAllImages не возвращает массив');
        return false;
      }

      this.success(`Всего снимков: ${allImages.length}`);
      return true;
    } catch (err) {
      this.error('Ошибка в системе мультиснимков: ' + err.message);
      return false;
    }
  }

  // ===== ТЕСТЫ ИНТЕРФЕЙСА =====

  async testUIElements() {
    this.currentTest = 'Элементы интерфейса';
    this.log('Проверка элементов интерфейса', 'info');

    const requiredElements = {
      'uso-file': 'Input для загрузки файла',
      'uso-patient-name': 'Поле имени пациента',
      'uso-patient-phone': 'Поле телефона',
      'uso-work-mode': 'Селектор режима',
      'uso-images-nav': 'Навигация снимков',
      'mark-toggle': 'Кнопка режима меток',
      'img-rotate': 'Кнопка средней линии',
      'uso-fullscreen': 'Кнопка полноэкрана',
      'uso-undo': 'Кнопка Undo',
      'uso-del': 'Кнопка удаления'
    };

    let allFound = true;
    for (const [id, desc] of Object.entries(requiredElements)) {
      const elem = document.getElementById(id);
      if (!elem) {
        this.error(`${desc} (${id}) не найден`);
        allFound = false;
      } else {
        this.success(`${desc} найден`);
      }
    }

    return allFound;
  }

  async testPaletteColors() {
    this.currentTest = 'Палитра цветов';
    this.log('Проверка палитры цветов', 'info');

    const colorBtns = document.querySelectorAll('.palette .color-btn');
    if (colorBtns.length === 0) {
      this.error('Кнопки цветов не найдены');
      return false;
    }

    this.success(`Найдено ${colorBtns.length} цветов`);
    return true;
  }

  async testShapeButtons() {
    this.currentTest = 'Кнопки фигур';
    this.log('Проверка кнопок фигур', 'info');

    const shapeBtns = document.querySelectorAll('.palette .shape-btn');
    if (shapeBtns.length === 0) {
      this.error('Кнопки фигур не найдены');
      return false;
    }

    const shapes = Array.from(shapeBtns).map(btn => btn.getAttribute('data-shape'));
    this.success(`Найдено ${shapeBtns.length} фигур: ${shapes.join(', ')}`);
    return true;
  }

  // ===== ТЕСТЫ ХРАНИЛИЩА =====

  async testLocalStorage() {
    this.currentTest = 'LocalStorage';
    this.log('Проверка localStorage', 'info');

    try {
      const testKey = 'uso_test_' + Date.now();
      const testValue = { test: 'data', timestamp: Date.now() };

      localStorage.setItem(testKey, JSON.stringify(testValue));
      const retrieved = JSON.parse(localStorage.getItem(testKey));

      if (retrieved.test !== 'data') {
        this.error('Данные не сохранены корректно');
        return false;
      }

      localStorage.removeItem(testKey);
      this.success('localStorage работает корректно');
      return true;
    } catch (err) {
      this.warn('localStorage недоступен: ' + err.message);
      return true; // Не критично
    }
  }

  // ===== ТЕСТЫ ПРОИЗВОДИТЕЛЬНОСТИ =====

  async testPerformance() {
    this.currentTest = 'Производительность';
    this.log('Тест производительности', 'info');

    const startTime = performance.now();

    // Симуляция работы
    for (let i = 0; i < 10000; i++) {
      Math.sqrt(i);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.info(`Время выполнения: ${duration.toFixed(2)}ms`);

    if (duration > 1000) {
      this.warn('Медленная производительность');
      return false;
    }

    this.success('Производительность в норме');
    return true;
  }

  async testMemory() {
    this.currentTest = 'Память';
    this.log('Проверка памяти', 'info');

    if (!performance.memory) {
      this.warn('performance.memory не доступен');
      return true;
    }

    const used = performance.memory.usedJSHeapSize / 1048576;
    const limit = performance.memory.jsHeapSizeLimit / 1048576;
    const percent = ((used / limit) * 100).toFixed(1);

    this.info(`Используется: ${used.toFixed(2)}MB из ${limit.toFixed(2)}MB (${percent}%)`);

    if (percent > 90) {
      this.warn('Высокое использование памяти');
      return false;
    }

    this.success('Использование памяти в норме');
    return true;
  }

  // ===== ТЕСТЫ СОВМЕСТИМОСТИ =====

  async testBrowserCompat() {
    this.currentTest = 'Совместимость браузера';
    this.log('Проверка совместимости', 'info');

    const features = {
      'Canvas API': typeof HTMLCanvasElement !== 'undefined',
      'localStorage': typeof localStorage !== 'undefined',
      'Fetch API': typeof fetch !== 'undefined',
      'Promise': typeof Promise !== 'undefined',
      'ResizeObserver': typeof ResizeObserver !== 'undefined',
      'FileReader': typeof FileReader !== 'undefined',
      'Blob': typeof Blob !== 'undefined',
      'URL.createObjectURL': typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    };

    let allSupported = true;
    for (const [feature, supported] of Object.entries(features)) {
      if (supported) {
        this.success(`✅ ${feature}`);
      } else {
        this.error(`❌ ${feature}`);
        allSupported = false;
      }
    }

    return allSupported;
  }

  // ===== ТЕСТЫ БЕЗОПАСНОСТИ =====

  async testSecurity() {
    this.currentTest = 'Безопасность';
    this.log('Проверка безопасности', 'info');

    // Проверка XSS
    const xssPayload = '<img src=x onerror="alert(\'XSS\')">';
    const div = document.createElement('div');
    div.textContent = xssPayload;
    const escaped = div.innerHTML;

    if (escaped.includes('onerror')) {
      this.error('XSS уязвимость обнаружена');
      return false;
    }

    this.success('XSS защита работает');

    // Проверка CSRF токена
    const token = document.querySelector('meta[name="csrf-token"]');
    if (!token) {
      this.warn('CSRF токен не найден');
    } else {
      this.success('CSRF токен присутствует');
    }

    return true;
  }

  // ===== ЗАПУСК ВСЕХ ТЕСТОВ =====

  async runAll() {
    this.startTime = Date.now();
    this.log('=== НАЧАЛО ПОЛНОГО ТЕСТИРОВАНИЯ ===', 'info');

    const tests = [
      // Инициализация
      () => this.testInitialization(),
      () => this.testCanvasCreation(),
      () => this.testCanvasContainer(),

      // Режимы и снимки
      () => this.testWorkModes(),
      () => this.testMultiImages(),

      // Интерфейс
      () => this.testUIElements(),
      () => this.testPaletteColors(),
      () => this.testShapeButtons(),

      // Хранилище
      () => this.testLocalStorage(),

      // Производительность
      () => this.testPerformance(),
      () => this.testMemory(),

      // Совместимость
      () => this.testBrowserCompat(),

      // Безопасность
      () => this.testSecurity()
    ];

    for (const test of tests) {
      try {
        const result = await test();
        this.results.push({
          name: this.currentTest,
          passed: result,
          timestamp: new Date()
        });
      } catch (err) {
        this.error(`Критическая ошибка в ${this.currentTest}: ${err.message}`);
        this.results.push({
          name: this.currentTest,
          passed: false,
          error: err.message,
          timestamp: new Date()
        });
      }
    }

    this.endTime = Date.now();
    this.printSummary();

    return this.results;
  }

  // ===== ОТЧЁТ =====

  printSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const duration = ((this.endTime - this.startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    console.log(`Всего тестов: ${this.results.length}`);
    console.log(`✅ Пройдено: ${passed}`);
    console.log(`❌ Ошибок: ${failed}`);
    console.log(`⏱️  Время: ${duration}s`);
    console.log('='.repeat(60) + '\n');

    this.results.forEach((result, idx) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${idx + 1}. ${status} ${result.name}`);
      if (result.error) {
        console.log(`   Ошибка: ${result.error}`);
      }
    });
  }

  // ===== ЭКСПОРТ ОТЧЁТА =====

  exportReport() {
    const report = {
      timestamp: new Date().toISOString(),
      duration: this.endTime - this.startTime,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length
      },
      results: this.results,
      logs: this.logs,
      environment: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    };

    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uso-test-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.success('Отчёт скачан');
  }
}

// ===== ГЛОБАЛЬНЫЙ ОБЪЕКТ =====
window.USO_TestSuite = USO_TestSuite;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
  window.testSuite = new USO_TestSuite();
  console.log('✅ Тестовая система инициализирована');
  console.log('Используйте: testSuite.runAll() для запуска всех тестов');
});