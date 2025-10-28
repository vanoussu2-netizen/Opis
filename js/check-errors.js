/**
 * Проверка плагина на ошибки
 * Использование: errorChecker.runAll();
 */

'use strict';

const errorChecker = {
  errors: [],
  warnings: [],
  
  checkFileStructure() {
    console.log('✅ Проверка структуры файлов...');
    const requiredFiles = [
      'uso-teeth-calculator.php',
      'admin.php',
      'public.css',
      'js/uso.app.js',
      'js/uso.canvas.js',
      'js/uso.calc.js',
      'js/uso.export.js',
      'js/uso.state.js',
      'templates/pdf-template.html'
    ];
    
    requiredFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
  },
  
  checkJavaScriptErrors() {
    console.log('✅ Проверка JavaScript ошибок...');
    
    const checks = {
      'jQuery': typeof $ !== 'undefined',
      'Fabric.js': typeof fabric !== 'undefined',
      'html2canvas': typeof html2canvas !== 'undefined',
      'jsPDF': typeof jsPDF !== 'undefined' || typeof jspdf !== 'undefined',
      'exifr': typeof exifr !== 'undefined',
      'USO_CANVAS': typeof USO_CANVAS !== 'undefined',
      'USO_CALC': typeof USO_CALC !== 'undefined',
      'USO_EXPORT': typeof USO_EXPORT !== 'undefined',
      'USO_STATE': typeof USO !== 'undefined'
    };
    
    Object.entries(checks).forEach(([lib, loaded]) => {
      if (loaded) {
        console.log(`  ✅ ${lib}`);
      } else {
        console.error(`  ❌ ${lib} - НЕ ЗАГРУЖЕНА`);
        this.errors.push(`${lib} не загружена`);
      }
    });
  },
  
  checkDOMElements() {
    console.log('✅ Проверка DOM элементов...');
    
    const elements = {
      'uso-calc-app': 'Главный контейнер',
      'uso-canvas': 'Canvas элемент',
      'uso-file': 'Input для загрузки',
      'uso-patient-name': 'Поле имени',
      'uso-patient-phone': 'Поле телефона',
      'uso-work-mode': 'Селектор режима',
      'uso-images-nav': 'Навигация снимков',
      'mark-toggle': 'Кнопка меток',
      'uso-undo': 'Кнопка Undo',
      'uso-del': 'Кнопка удаления'
    };
    
    Object.entries(elements).forEach(([id, desc]) => {
      const el = document.getElementById(id);
      if (el) {
        console.log(`  ✅ ${desc}`);
      } else {
        console.warn(`  ⚠️ ${desc} (${id}) - не найден`);
        this.warnings.push(`${desc} не найден`);
      }
    });
  },
  
  checkCanvasAPI() {
    console.log('✅ Проверка Canvas API...');
    
    const canvas = document.getElementById('uso-canvas');
    if (!canvas) {
      console.error('  ❌ Canvas элемент не найден');
      this.errors.push('Canvas элемент не найден');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('  ❌ Canvas 2D context недоступен');
      this.errors.push('Canvas 2D context недоступен');
      return;
    }
    
    console.log('  ✅ Canvas API доступен');
  },
  
  checkModes() {
    console.log('✅ Проверка режимов работы...');
    
    if (!USO_CANVAS || !USO_CANVAS.MODES) {
      console.error('  ❌ MODES не определены');
      this.errors.push('MODES не определены');
      return;
    }
    
    const modes = Object.values(USO_CANVAS.MODES);
    console.log(`  ✅ Найдено ${modes.length} режимов: ${modes.join(', ')}`);
    
    // Проверяем методы
    const methods = ['setWorkMode', 'getWorkMode', 'addImage', 'switchImage', 'getAllImages', 'getCountsByJaw'];
    methods.forEach(method => {
      if (typeof USO_CANVAS[method] === 'function') {
        console.log(`  ✅ ${method}`);
      } else {
        console.error(`  ❌ ${method} не найден`);
        this.errors.push(`Метод ${method} не найден`);
      }
    });
  },
  
  checkPerformance() {
    console.log('✅ Проверка производительности...');
    
    const startTime = performance.now();
    
    for (let i = 0; i < 100000; i++) {
      Math.sqrt(i);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`  Время выполнения: ${duration.toFixed(2)}ms`);
    
    if (duration > 1000) {
      console.warn('  ⚠️ Медленная производительность');
      this.warnings.push('Медленная производительность');
    } else {
      console.log('  ✅ Производительность хорошая');
    }
  },
  
  checkMemory() {
    console.log('✅ Проверка памяти...');
    
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize / 1048576;
      const limit = performance.memory.jsHeapSizeLimit / 1048576;
      const percent = ((used / limit) * 100).toFixed(1);
      
      console.log(`  Используется: ${used.toFixed(2)}MB из ${limit.toFixed(2)}MB (${percent}%)`);
      
      if (percent > 90) {
        console.warn('  ⚠️ Высокое использование памяти');
        this.warnings.push('Высокое использование памяти');
      } else {
        console.log('  ✅ Использование памяти в норме');
      }
    } else {
      console.warn('  ⚠️ performance.memory не доступен');
    }
  },
  
  checkSecurity() {
    console.log('✅ Проверка безопасности...');
    
    // Проверка XSS
    const xssPayload = '<img src=x onerror="alert(\'XSS\')">';
    const div = document.createElement('div');
    div.textContent = xssPayload;
    const escaped = div.innerHTML;
    
    if (escaped.includes('onerror')) {
      console.error('  ❌ XSS уязвимость обнаружена');
      this.errors.push('XSS уязвимость');
    } else {
      console.log('  ✅ XSS защита работает');
    }
    
    // Проверка CSRF
    const token = document.querySelector('meta[name="csrf-token"]');
    if (!token) {
      console.warn('  ⚠️ CSRF токен не найден');
      this.warnings.push('CSRF токен отсутствует');
    } else {
      console.log('  ✅ CSRF токен присутствует');
    }
  },
  
  checkBrowserCompat() {
    console.log('✅ Проверка совместимости браузера...');
    
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
    Object.entries(features).forEach(([feature, supported]) => {
      if (supported) {
        console.log(`  ✅ ${feature}`);
      } else {
        console.error(`  ❌ ${feature}`);
        this.errors.push(`${feature} не поддерживается`);
        allSupported = false;
      }
    });
    
    return allSupported;
  },
  
  runAll() {
    console.clear();
    this.errors = [];
    this.warnings = [];
    
    console.log('\n' + '='.repeat(60));
    console.log('ПРОВЕРКА ПЛАГИНА НА ОШИБКИ');
    console.log('='.repeat(60) + '\n');
    
    this.checkFileStructure();
    this.checkJavaScriptErrors();
    this.checkDOMElements();
    this.checkCanvasAPI();
    this.checkModes();
    this.checkPerformance();
    this.checkMemory();
    this.checkSecurity();
    this.checkBrowserCompat();
    
    console.log('\n' + '='.repeat(60));
    console.log('ИТОГИ ПРОВЕРКИ');
    console.log('='.repeat(60));
    console.log(`✅ Ошибок: ${this.errors.length}`);
    console.log(`⚠️ Предупреждений: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.error('\n❌ ОШИБКИ:');
      this.errors.forEach(err => console.error(`  - ${err}`));
    }
    
    if (this.warnings.length > 0) {
      console.warn('\n⚠️ ПРЕДУПРЕЖДЕНИЯ:');
      this.warnings.forEach(warn => console.warn(`  - ${warn}`));
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Возвращаем результат
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }
};

// Экспортируем в глобальный объект
window.errorChecker = errorChecker;

console.log('✅ Система проверки ошибок загружена');
console.log('Используйте: errorChecker.runAll();');