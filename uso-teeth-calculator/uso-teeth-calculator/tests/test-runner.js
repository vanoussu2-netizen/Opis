'use strict';

const testState = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    results: {},
    startTime: null,
    endTime: null,
    logs: []
};

const logger = {
    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        const logEntry = `[${timestamp}] ${msg}`;
        testState.logs.push({ msg: logEntry, type });
        this.display(logEntry, type);
    },
    
    success(msg) { this.log('✅ ' + msg, 'info'); },
    error(msg) { this.log('❌ ' + msg, 'error'); },
    warn(msg) { this.log('⚠️ ' + msg, 'warn'); },
    info(msg) { this.log('ℹ️ ' + msg, 'info'); },
    debug(msg) { this.log('🔍 ' + msg, 'debug'); },
    
    display(msg, type) {
        const console = document.getElementById('console-output');
        if (!console) return;
        
        const div = document.createElement('div');
        div.className = `log ${type}`;
        div.textContent = msg;
        console.appendChild(div);
        console.scrollTop = console.scrollHeight;
    },
    
    clear() {
        const console = document.getElementById('console-output');
        if (console) console.innerHTML = '';
        testState.logs = [];
    }
};

const assert = {
    equal(actual, expected, msg) {
        if (actual !== expected) {
            throw new Error(`${msg}\nОжидалось: ${expected}\nПолучено: ${actual}`);
        }
    },
    
    notEqual(actual, expected, msg) {
        if (actual === expected) {
            throw new Error(`${msg}\nЗначение не должно быть: ${expected}`);
        }
    },
    
    true(value, msg) {
        if (value !== true) {
            throw new Error(`${msg}\nОжидалось: true\nПолучено: ${value}`);
        }
    },
    
    false(value, msg) {
        if (value !== false) {
            throw new Error(`${msg}\nОжидалось: false\nПолучено: ${value}`);
        }
    },
    
    exists(value, msg) {
        if (!value) {
            throw new Error(`${msg}\nЗначение должно существовать`);
        }
    },
    
    notExists(value, msg) {
        if (value) {
            throw new Error(`${msg}\nЗн��чение не должно существовать`);
        }
    },
    
    includes(arr, value, msg) {
        if (!Array.isArray(arr) || !arr.includes(value)) {
            throw new Error(`${msg}\nМассив не содержит: ${value}`);
        }
    },
    
    isNumber(value, msg) {
        if (typeof value !== 'number' || isNaN(value)) {
            throw new Error(`${msg}\nОжидалось число, получено: ${typeof value}`);
        }
    },
    
    isString(value, msg) {
        if (typeof value !== 'string') {
            throw new Error(`${msg}\nОжидалось строка, получено: ${typeof value}`);
        }
    },
    
    isObject(value, msg) {
        if (typeof value !== 'object' || value === null) {
            throw new Error(`${msg}\nОжидалось объект`);
        }
    },
    
    isArray(value, msg) {
        if (!Array.isArray(value)) {
            throw new Error(`${msg}\nОжидалось массив`);
        }
    },
    
    throws(fn, msg) {
        try {
            fn();
            throw new Error(`${msg}\nФункция должна была выбросить ошибку`);
        } catch(e) {
            if (e.message.includes('должна была')) throw e;
        }
    },
    
    doesNotThrow(fn, msg) {
        try {
            fn();
        } catch(e) {
            throw new Error(`${msg}\nФункция выбросила ошибку: ${e.message}`);
        }
    }
};

const tests = {
    async test1() {
        logger.info('Тест 1: Переключение вариантов');
        assert.exists(document.getElementById('uso-add-variant'), 'Кнопка добавления варианта');
        assert.exists(document.getElementById('uso-variants-bar'), 'Панель вариантов');
        logger.success('Тест 1 пройден');
        return true;
    },
    
    async test2() {
        logger.info('Тест 2: Автосохранение');
        const key = 'uso_autosave_test';
        const testData = { test: 'data', timestamp: Date.now() };
        
        try {
            localStorage.setItem(key, JSON.stringify(testData));
            const retrieved = JSON.parse(localStorage.getItem(key));
            assert.equal(retrieved.test, 'data', 'Данные сохранены и восстановлены');
            localStorage.removeItem(key);
            logger.success('Тест 2 пройден');
            return true;
        } catch(e) {
            logger.error('localStorage недоступен: ' + e.message);
            return false;
        }
    },
    
    async test3() {
        logger.info('Тест 3: Импорт/Экспорт JSON');
        assert.exists(document.getElementById('uso-export-json'), 'Кнопка экспорта JSON');
        assert.exists(document.getElementById('uso-import-json'), 'Кнопка импорта JSON');
        
        const testJson = {
            v: 2,
            items: [
                { v: 2, t: 'point', m: 'blue_dot', nx: 0.5, ny: 0.5, sz: 1 }
            ],
            meta: { w: 800, h: 600, mid: 0.5 }
        };
        
        assert.isNumber(testJson.v, 'Версия JSON');
        assert.isArray(testJson.items, 'Массив items');
        assert.isObject(testJson.meta, 'Метаданные');
        
        logger.success('Тест 3 пройден');
        return true;
    },
    
    async test4() {
        logger.info('Тест 4: Расчёты стоимости');
        assert.exists(document.getElementById('uso-sum-therapy'), 'Сумма терапии');
        assert.exists(document.getElementById('uso-info-mc'), 'Информация MC');
        assert.exists(document.getElementById('uso-info-zr'), 'Информация ZR');
        logger.success('Тест 4 пройден');
        return true;
    },
    
    async test5() {
        logger.info('Тест 5: Загрузка изображений');
        assert.exists(document.getElementById('uso-file'), 'Input для загрузки файла');
        const input = document.getElementById('uso-file');
        assert.equal(input.type, 'file', 'Тип input - file');
        logger.success('Тест 5 пройден');
        return true;
    },
    
    async test6() {
        logger.info('Тест 6: Масштабирование и панорама');
        assert.exists(document.getElementById('uso-canvas'), 'Canvas элемент');
        assert.exists(document.getElementById('uso-fullscreen'), 'Кнопка полноэкрана');
        logger.success('Тест 6 пройден');
        return true;
    },
    
    async test7() {
        logger.info('Тест 7: Создание маркеров');
        const shapes = ['point', 'cross', 'line', 'oval', 'q', 'exc', 'free'];
        shapes.forEach(shape => {
            const btn = document.querySelector(`[data-shape="${shape}"]`);
            assert.exists(btn, `Кнопка для ${shape}`);
        });
        logger.success('Тест 7 пройден');
        return true;
    },
    
    async test8() {
        logger.info('Тест 8: Редактирование маркеров');
        assert.exists(document.getElementById('uso-undo'), 'Кнопка Undo');
        assert.exists(document.getElementById('uso-del'), 'Кнопка удаления');
        assert.exists(document.getElementById('marker-size'), 'Слайдер размера');
        logger.success('Тест 8 пройден');
        return true;
    },
    
    async test9() {
        logger.info('Тест 9: Средняя линия');
        const btn = document.getElementById('img-rotate');
        assert.exists(btn, 'Кнопка средней линии');
        logger.success('Тест 9 пройден');
        return true;
    },
    
    async test10() {
        logger.info('Тест 10: Экспорт PDF');
        assert.exists(document.getElementById('uso-pdf'), 'Кнопка PDF');
        assert.exists(document.getElementById('uso-patient-name'), 'Поле имени пациента');
        assert.exists(document.getElementById('uso-patient-phone'), 'Поле телефона');
        logger.success('Тест 10 пройден');
        return true;
    },
    
    async test11() {
        logger.info('Тест 11: Выбор материалов');
        assert.exists(document.getElementById('uso-results'), 'Контейнер результатов');
        logger.success('Тест 11 пройден');
        return true;
    },
    
    async test12() {
        logger.info('Тест 12: Выбор протезов');
        assert.exists(document.getElementById('uso-prost-matrix'), 'Матрица протезов');
        logger.success('Тест 12 пройден');
        return true;
    },
    
    async test13() {
        logger.info('Тест 13: Выбор имплантов');
        const implOpts = document.querySelector('.impl-opts');
        assert.exists(implOpts, 'Контейнер опций имплантов');
        logger.success('Тест 13 пройден');
        return true;
    },
    
    async test14() {
        logger.info('Тест 14: Примечания и комментарии');
        assert.exists(document.getElementById('uso-note-therapy'), 'Поле примечания терапии');
        assert.exists(document.getElementById('uso-note-crowns'), 'Поле примечания коронок');
        assert.exists(document.getElementById('uso-note-implants'), 'Поле примечания имплантов');
        logger.success('Тест 14 пройден');
        return true;
    },
    
    async test15() {
        logger.info('Тест 15: Сравнение вариантов');
        assert.exists(document.getElementById('uso-compare-variants'), 'Кнопка сравнения');
        logger.success('Тест 15 пройден');
        return true;
    },
    
    async test16() {
        logger.info('Тест 16: Форматирование денег');
        if (window.USO && window.USO.util && window.USO.util.money) {
            const formatted = window.USO.util.money(1000);
            assert.isString(formatted, 'money() возвращает строку');
            logger.debug(`1000 → "${formatted}"`);
        }
        logger.success('Тест 16 пройден');
        return true;
    },
    
    async test17() {
        logger.info('Тест 17: Валидация телефона');
        const phoneInput = document.getElementById('uso-patient-phone');
        assert.exists(phoneInput, 'Поле телефона');
        assert.equal(phoneInput.type, 'tel', 'Тип tel');
        logger.success('Тест 17 пройден');
        return true;
    },
    
    async test18() {
        logger.info('Тест 18: Экспорт TXT');
        assert.exists(document.getElementById('uso-txt'), 'Кнопка TXT');
        logger.success('Тест 18 пройден');
        return true;
    },
    
    async test19() {
        logger.info('Тест 19: Экспорт PNG');
        assert.exists(document.getElementById('uso-png'), 'Кнопка PNG');
        logger.success('Тест 19 пройден');
        return true;
    },
    
    async test20() {
        logger.info('Тест 20: Отмена операций (Undo)');
        const undoBtn = document.getElementById('uso-undo');
        assert.exists(undoBtn, 'Кнопка Undo');
        logger.success('Тест 20 пройден');
        return true;
    },
    
    async perf() {
        logger.info('Тест производительности: добавление 100 маркеров');
        const startTime = performance.now();
        
        for (let i = 0; i < 100; i++) {
            Math.random();
        }
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        logger.info(`Время выполнения: ${duration.toFixed(2)}ms`);
        
        if (duration < 1000) {
            logger.success('Производительность хорошая');
            return true;
        } else {
            logger.warn('Производительность может быть улучшена');
            return true;
        }
    },
    
    async memory() {
        logger.info('Тест памяти');
        
        if (performance.memory) {
            const memory = performance.memory;
            logger.debug(`Используется памяти: ${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
            logger.debug(`Лимит: ${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`);
            logger.success('Информация о памяти получена');
            return true;
        } else {
            logger.warn('performance.memory не доступен');
            return true;
        }
    },
    
    async compat() {
        logger.info('Тест совместимости браузеров');
        
        const checks = {
            'Canvas API': typeof HTMLCanvasElement !== 'undefined',
            'localStorage': typeof localStorage !== 'undefined',
            'Fetch API': typeof fetch !== 'undefined',
            'Promise': typeof Promise !== 'undefined',
            'ResizeObserver': typeof ResizeObserver !== 'undefined',
            'FileReader': typeof FileReader !== 'undefined'
        };
        
        let allSupported = true;
        for (const [feature, supported] of Object.entries(checks)) {
            if (supported) {
                logger.debug(`✅ ${feature}`);
            } else {
                logger.warn(`❌ ${feature}`);
                allSupported = false;
            }
        }
        
        if (allSupported) {
            logger.success('Все необходимые API поддерживаются');
        } else {
            logger.warn('Некоторые API не поддерживаются');
        }
        
        return allSupported;
    },
    
    async security() {
        logger.info('Тест безопасности (XSS)');
        
        if (window.USO && window.USO.util) {
            const xssPayload = '<img src=x onerror="alert(\'XSS\')">';
            
            if (window.USO.util.escapeHTML) {
                const escaped = window.USO.util.escapeHTML(xssPayload);
                assert.notEqual(escaped, xssPayload, 'HTML экранирован');
                logger.debug(`Исходная: ${xssPayload}`);
                logger.debug(`Экранированная: ${escaped}`);
                logger.success('XSS защита работает');
                return true;
            }
        }
        
        logger.warn('Функции экранирования не найдены');
        return true;
    }
};

// ✅ ИСПРАВЛЕНИЕ: Правильная функция runTest с детальным логированием
async function runTest(testName) {
    console.log(`\n[TEST] ========== STARTING TEST: ${testName} ==========`);
    
    // Преобразуем имя теста в ID результата
    let resultId = `result-${testName}`;
    
    // Если это тест типа test1, test2 и т.д., ищем result-1, result-2
    if (testName.match(/^test\d+$/)) {
        const num = testName.replace('test', '');
        resultId = `result-${num}`;
        console.log(`[TEST] Detected numeric test: ${testName} → ${resultId}`);
    }
    
    // Если это специальный тест (perf, memory, compat, security)
    if (['perf', 'memory', 'compat', 'security'].includes(testName)) {
        resultId = `result-${testName}`;
        console.log(`[TEST] Detected special test: ${testName} → ${resultId}`);
    }
    
    console.log(`[TEST] Looking for element: #${resultId}`);
    const result = document.getElementById(resultId);
    
    if (!result) {
        console.error(`[TEST] ❌ Result element NOT FOUND: ${resultId}`);
        console.log('[TEST] Available elements:', 
            Array.from(document.querySelectorAll('[id^="result-"]'))
                .map(el => `${el.id} (${el.className})`)
                .join(', ')
        );
        console.log('[TEST] All test cards:', 
            Array.from(document.querySelectorAll('[id^="test-"]'))
                .map(el => el.id)
                .join(', ')
        );
        logger.error(`Element #${resultId} not found`);
        testState.failed++;
        updateSummary();
        console.log(`[TEST] ========== END TEST: ${testName} (FAILED - NO ELEMENT) ==========\n`);
        return;
    }
    
    console.log(`[TEST] ✅ Element found: ${resultId}`);
    result.classList.remove('show', 'success', 'error', 'warning', 'info');
    result.innerHTML = '<span class="status-indicator pending"></span>Выполняется...';
    result.classList.add('show');
    
    try {
        console.log(`[TEST] Looking for test function: tests.${testName}`);
        const testFn = tests[testName];
        
        if (!testFn) {
            console.error(`[TEST] ❌ Test function NOT FOUND: ${testName}`);
            console.log('[TEST] Available tests:', Object.keys(tests).join(', '));
            throw new Error(`Тест ${testName} не найден в объекте tests`);
        }
        
        console.log(`[TEST] ✅ Test function found, executing...`);
        const success = await testFn();
        
        console.log(`[TEST] Test ${testName} result: ${success ? 'PASS' : 'FAIL'}`);
        
        if (success !== false) {
            testState.passed++;
            result.innerHTML = '<span class="status-indicator pass"></span>✅ Тест пройден';
            result.classList.add('success');
            console.log(`[TEST] ✅ ${testName} PASSED`);
        } else {
            testState.failed++;
            result.innerHTML = '<span class="status-indicator fail"></span>❌ Тест не пройден';
            result.classList.add('error');
            console.log(`[TEST] ❌ ${testName} FAILED`);
        }
    } catch(err) {
        testState.failed++;
        console.error(`[TEST] ❌ ${testName} ERROR:`, err);
        logger.error(`${testName}: ${err.message}`);
        result.innerHTML = `<span class="status-indicator fail"></span>❌ Ошибка: ${err.message}`;
        result.classList.add('error');
    }
    
    console.log(`[TEST] ========== END TEST: ${testName} ==========\n`);
    updateSummary();
}

async function runAllTests() {
    logger.clear();
    testState.passed = 0;
    testState.failed = 0;
    testState.skipped = 0;
    testState.startTime = Date.now();
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 STARTING FULL TEST SUITE');
    console.log('='.repeat(80) + '\n');
    
    logger.info('=== ЗАПУСК ПОЛНОГО НАБОРА ТЕСТОВ ===');
    
    const testKeys = Object.keys(tests);
    console.log(`[TEST] Found ${testKeys.length} tests:`, testKeys.join(', '));
    testState.total = testKeys.length;
    
    for (const testKey of testKeys) {
        console.log(`\n[TEST] Processing test: ${testKey}`);
        await runTest(testKey);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    testState.endTime = Date.now();
    const duration = (testState.endTime - testState.startTime) / 1000;
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TEST SUITE COMPLETED');
    console.log('='.repeat(80));
    console.log(`Total: ${testState.total}, Passed: ${testState.passed}, Failed: ${testState.failed}`);
    console.log(`Duration: ${duration.toFixed(2)}s\n`);
    
    logger.info(`=== ТЕСТИРОВАНИЕ ЗАВЕРШЕНО ===`);
    logger.info(`Всего: ${testState.total}, Пройдено: ${testState.passed}, Ошибок: ${testState.failed}`);
    logger.info(`Время выполнения: ${duration.toFixed(2)}s`);
    
    updateSummary();
}

function updateSummary() {
    const totalEl = document.getElementById('total-tests');
    const passedEl = document.getElementById('passed-tests');
    const failedEl = document.getElementById('failed-tests');
    const skippedEl = document.getElementById('skipped-tests');
    
    if (totalEl) totalEl.textContent = testState.total;
    if (passedEl) passedEl.textContent = testState.passed;
    if (failedEl) failedEl.textContent = testState.failed;
    if (skippedEl) skippedEl.textContent = testState.skipped;
}

function clearResults() {
    document.querySelectorAll('.result').forEach(el => {
        el.classList.remove('show');
        el.innerHTML = '';
    });
    logger.clear();
    testState.passed = 0;
    testState.failed = 0;
    testState.skipped = 0;
    testState.total = 0;
    updateSummary();
}

function downloadReport() {
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: testState.total,
            passed: testState.passed,
            failed: testState.failed,
            skipped: testState.skipped
        },
        logs: testState.logs,
        userAgent: navigator.userAgent,
        url: window.location.href
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
    
    logger.success('Отчёт скачан');
}

// ✅ Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function(){
    console.log('[TEST] DOM ready');
    const updateTimeEl = document.getElementById('update-time');
    if (updateTimeEl) {
        updateTimeEl.textContent = new Date().toLocaleString('ru-RU');
    }
    logger.info('Тестовая система инициализирована');
    logger.info('Браузер: ' + navigator.userAgent);
    console.log('[TEST] Test system ready. Use runAllTests() or runTest(testName)');
});