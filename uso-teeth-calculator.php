<?php
/*
Plugin Name: USO Teeth Calculator
Description: Калькулятор: разметка снимка, пан/зум, полноэкранный режим (вкл. iOS псевдо‑ФС), локальный PDF/TXT/PNG, импорт/экспорт разметки (JSON), автосохранение, имплантация, терапия, примечания, несколько вариантов.
Version: 1.27.2
Author: YourTeam
Text Domain: uso-teeth-calculator
Domain Path: /languages
*/

if (!defined('ABSPATH')) exit;

register_activation_hook(__FILE__, function(){
  if (get_option('uso_calc_options', null) === null) {
    $path = plugin_dir_path(__FILE__) . 'defaults.json';
    if (file_exists($path)) {
      $json = json_decode(file_get_contents($path), true);
      if (is_array($json)) add_option('uso_calc_options', $json, '', 'no');
    }
  }
});

require_once __DIR__.'/admin.php';

if (!function_exists('uso_update_option_noautoload')) {
  function uso_update_option_noautoload($option_name, $value) {
    update_option($option_name, $value);
    global $wpdb;
    $wpdb->query($wpdb->prepare(
      "UPDATE {$wpdb->options} SET autoload=%s WHERE option_name=%s",
      'no', $option_name
    ));
  }
}

class USO_Teeth_Calc_Plugin {
  public function __construct(){
    add_action('init', [$this,'load_textdomain']);
    add_shortcode('uso_teeth_calculator', [$this,'shortcode']);
    add_action('wp_enqueue_scripts', [$this,'assets']);
    add_action('admin_post_uso_export', [$this,'handle_export']);
    add_action('admin_post_uso_import', [$this,'handle_import']);
    add_action('admin_post_uso_reset_defaults', [$this,'handle_reset_defaults']);

    add_filter('script_loader_tag', [$this,'no_defer_critical'], 10, 2);
    add_action('wp_enqueue_scripts', [$this,'isolate_calculator_page'], 9999);
    add_action('wp_print_scripts',    [$this,'isolate_calculator_page'], 9999);

    add_action('init', [$this,'migrate_autoload']);
  }

  public function load_textdomain(){
    load_plugin_textdomain('uso-teeth-calculator', false, dirname(plugin_basename(__FILE__)) . '/languages');
  }

  public function migrate_autoload(){
    global $wpdb;
    $options = ['uso_calc_options', 'uso_calc_materials', 'uso_calc_prices', 'uso_calc_texts', 'uso_calc_clinic', 'uso_calc_impl'];
    foreach ($options as $opt) {
      $wpdb->query($wpdb->prepare(
        "UPDATE {$wpdb->options} SET autoload=%s WHERE option_name=%s AND autoload=%s",
        'no', $opt, 'yes'
      ));
    }
  }

  public function no_defer_critical($tag, $handle){
    $critical = ['jquery','jquery-core','jquery-migrate','fabric-js','exifr','html2canvas','jspdf','wp-i18n','uso-state','uso-canvas','uso-calc','uso-export','uso-app'];
    if (in_array($handle, $critical, true)) {
      $tag = preg_replace('/\s+(defer|async)(?:=(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?/i', '', $tag);
    }
    return $tag;
  }

  public function isolate_calculator_page(){
    $opt = get_option('uso_calc_options', []);
    $isolate = !empty($opt['isolate_scripts']);
    if (!$isolate) return;

    global $post;
    $has_shortcode = ($post && is_singular() && has_shortcode($post->post_content ?? '', 'uso_teeth_calculator'));
    if (!$has_shortcode) return;

    wp_enqueue_script('jquery');
    add_action('wp_head', function(){
      echo '<script>(function(){if(window.jQuery&&!window.$){window.$=window.jQuery;}})();</script>';
    }, 1);

    $whitelist = [
      'jquery','jquery-core','jquery-migrate','wp-i18n',
      'fabric-js','exifr','html2canvas','jspdf',
      'uso-state','uso-canvas','uso-calc','uso-export','uso-app'
    ];
    global $wp_scripts, $wp_styles;
    if ($wp_scripts && is_array($wp_scripts->queue)) {
      foreach ((array)$wp_scripts->queue as $handle) {
        if (!in_array($handle, $whitelist, true)) {
          wp_dequeue_script($handle);
        }
      }
    }
    if ($wp_styles && is_array($wp_styles->queue)) {
      $style_whitelist = ['uso-calc','wp-block-library','global-styles','classic-theme-styles','dashicons','style'];
      $style_whitelist = apply_filters('uso_calc_isolate_styles_whitelist', $style_whitelist);
      foreach ((array)$wp_styles->queue as $handle) {
        if (!in_array($handle, $style_whitelist, true)) {
          wp_dequeue_style($handle);
        }
      }
    }
  }

  public function assets(){
    global $post;
    $has_shortcode = ($post && is_singular() && has_shortcode($post->post_content ?? '', 'uso_teeth_calculator'));

    $base = plugin_dir_path(__FILE__);

    // ✅ Определяем суффикс для файлов: '' для разработки, '.min' для production
    $min = (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';

    // CSS файлы
    $css_file = $base.'public'.$min.'.css';
    // Fallback на обычный CSS если минифицированный не найден
    if (!file_exists($css_file)) {
      $css_file = $base.'public.css';
      $min_css = '';
    } else {
      $min_css = $min;
    }
    $ver_css = file_exists($css_file) ? filemtime($css_file) : '1.27.2';

    wp_register_style('uso-calc', plugins_url('public'.$min_css.'.css', __FILE__), [], $ver_css);

    $use_cdn = apply_filters('uso_calc_use_cdn_vendor', false);

    $fabric_local = $base.'vendor/fabric.min.js';
    if (!$use_cdn && file_exists($fabric_local)) {
      wp_register_script('fabric-js', plugins_url('vendor/fabric.min.js', __FILE__), [], '5.3.0', true);
    } else {
      wp_register_script('fabric-js', 'https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js', [], '5.3.0', true);
    }

    $h2c_local = $base.'vendor/html2canvas.min.js';
    if (file_exists($h2c_local)) {
      wp_register_script('html2canvas', plugins_url('vendor/html2canvas.min.js', __FILE__), [], '1.4.1', true);
    } else {
      wp_register_script('html2canvas', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', [], '1.4.1', true);
    }

    $jspdf_local = $base.'vendor/jspdf.umd.min.js';
    if (file_exists($jspdf_local)) {
      wp_register_script('jspdf', plugins_url('vendor/jspdf.umd.min.js', __FILE__), [], '2.5.1', true);
    } else {
      wp_register_script('jspdf', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', [], '2.5.1', true);
    }

    $exifr_local = $base.'vendor/exifer.umd.min.js';
    if (!$use_cdn && file_exists($exifr_local)) {
      wp_register_script('exifr', plugins_url('vendor/exifer.umd.min.js', __FILE__), [], '7.1.3', true);
    } else {
      wp_register_script('exifr', 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js', [], '7.1.3', true);
    }

    wp_register_script('wp-i18n', includes_url('js/dist/i18n.min.js'), [], get_bloginfo('version'), true);

    // ✅ JS файлы с автоматическим выбором минифицированных версий
    $app_js = $base.'js/uso.app'.$min.'.js';
    // Fallback на обычные JS если минифицированные не найдены
    if (!file_exists($app_js)) {
      $app_js = $base.'js/uso.app.js';
      $min_js = '';
    } else {
      $min_js = $min;
    }
    $ver_js = file_exists($app_js) ? filemtime($app_js) : '1.27.2';

    wp_register_script('uso-state',  plugins_url('js/uso.state'.$min_js.'.js', __FILE__),  ['jquery','wp-i18n'], $ver_js, true);

    // ✅ CANVAS MODULES: Модульная структура для лучшей поддерживаемости
    wp_register_script('uso-canvas-config', plugins_url('js/uso.canvas.config.js', __FILE__), ['jquery'], $ver_js, true);
    wp_register_script('uso-canvas-fullscreen', plugins_url('js/uso.canvas.fullscreen.js', __FILE__), ['jquery', 'uso-canvas-config'], $ver_js, true);
    wp_register_script('uso-canvas-ui', plugins_url('js/uso.canvas.ui.js', __FILE__), ['jquery', 'fabric-js', 'uso-canvas-config'], $ver_js, true);
    wp_register_script('uso-canvas-interactions', plugins_url('js/uso.canvas.interactions.js', __FILE__), ['jquery', 'fabric-js', 'uso-canvas-config'], $ver_js, true);
    wp_register_script('uso-canvas-images', plugins_url('js/uso.canvas.images.js', __FILE__), ['fabric-js', 'uso-canvas-config'], $ver_js, true);
    wp_register_script('uso-canvas-serialization', plugins_url('js/uso.canvas.serialization.js', __FILE__), ['fabric-js', 'uso-canvas-config'], $ver_js, true);
    wp_register_script('uso-canvas', plugins_url('js/uso.canvas'.$min_js.'.js', __FILE__), ['jquery','fabric-js','exifr','wp-i18n','uso-state','uso-canvas-config','uso-canvas-fullscreen','uso-canvas-ui','uso-canvas-interactions','uso-canvas-images','uso-canvas-serialization'], $ver_js, true);

    wp_register_script('uso-calc',   plugins_url('js/uso.calc'.$min_js.'.js', __FILE__),   ['jquery','wp-i18n','uso-state'], $ver_js, true);
    wp_register_script('uso-export', plugins_url('js/uso.export'.$min_js.'.js', __FILE__), ['jquery','html2canvas','jspdf','wp-i18n','uso-state','uso-calc','uso-canvas'], $ver_js, true);
    wp_register_script('uso-app',    plugins_url('js/uso.app'.$min_js.'.js', __FILE__),    ['jquery','wp-i18n','uso-state','uso-calc','uso-canvas','uso-export'], $ver_js, true);

    if ($has_shortcode) {
      $opt_legacy = get_option('uso_calc_options', []);
      $opt = [
        'materials' => get_option('uso_calc_materials', $opt_legacy['materials'] ?? []),
        'prices'    => get_option('uso_calc_prices',    $opt_legacy['prices']    ?? []),
        'texts'     => get_option('uso_calc_texts',     $opt_legacy['texts']     ?? []),
        'clinic'    => get_option('uso_calc_clinic',    $opt_legacy['clinic']    ?? []),
        'impl'      => get_option('uso_calc_impl',      $opt_legacy['impl']      ?? []),
        'test_mode' => !empty($opt_legacy['test_mode']),
        'pdf_template_html' => $opt_legacy['pdf_template_html'] ?? '',
        'date_updated' => $opt_legacy['date_updated'] ?? current_time('Y-m-d'),
        'isolate_scripts' => !empty($opt_legacy['isolate_scripts'])
      ];

      $assets = [
        'pdf_template_url'   => plugins_url('templates/pdf-template.html', __FILE__),
        'pdf_template2_url'  => plugins_url('templates/pdf-template2.html', __FILE__),
        'logo_url'           => plugins_url('templates/logo.png', __FILE__),
        'vendor_html2canvas' => plugins_url('vendor/html2canvas.min.js', __FILE__),
        'vendor_jspdf'       => plugins_url('vendor/jspdf.umd.min.js', __FILE__),
        'vendor_heic2any'    => plugins_url('vendor/heic2any.min.js', __FILE__),
        'vendor_dejavu'      => plugins_url('vendor/DejaVuSans.ttf', __FILE__),
        'debug_mode'         => (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) || (defined('WP_DEBUG') && WP_DEBUG)
      ];

      wp_localize_script('uso-state', 'USO_SETTINGS', [
        'options' => $opt,
        'assets'  => $assets
      ]);
    }

    wp_set_script_translations('uso-app', 'uso-teeth-calculator', plugin_dir_path(__FILE__) . 'languages');
  }

  public function shortcode($atts){
    wp_enqueue_style('uso-calc');
    wp_enqueue_script('uso-state');
    wp_enqueue_script('uso-canvas');
    wp_enqueue_script('uso-calc');
    wp_enqueue_script('uso-export');
    wp_enqueue_script('uso-app');

    $clinic = get_option('uso_calc_clinic', []);
    $disc = !empty($clinic['disclaimer']) ? $clinic['disclaimer'] : __('Имеются противопоказания, необходима консультация специалиста. Медуслуги оказывают клиники‑партнёры в КНР.', 'uso-teeth-calculator');
    $test_mode = !empty(get_option('uso_calc_options', [])['test_mode']);

    ob_start(); ?>
    <div id="uso-calc-app" aria-live="polite">
      <h3><?php esc_html_e('Калькулятор описания снимков и стоимости', 'uso-teeth-calculator'); ?></h3>

      <div class="uso-step">
        <label>
          <span class="screen-reader-text"><?php esc_html_e('Загрузить изображение', 'uso-teeth-calculator'); ?></span>
          <input type="file" id="uso-file" accept="image/*" aria-label="<?php esc_attr_e('Загрузить изображение', 'uso-teeth-calculator'); ?>">
        </label>
        <label><?php esc_html_e('Имя пациента*:', 'uso-teeth-calculator'); ?>
          <input type="text" id="uso-patient-name" placeholder="<?php esc_attr_e('Фамилия Имя Отчество', 'uso-teeth-calculator'); ?>">
        </label>
        
        <label><?php esc_html_e('Телефон:', 'uso-teeth-calculator'); ?>
          <input type="tel" id="uso-patient-phone" placeholder="+7 (999) 999-99-99">
        </label>
      </div>

      <!-- ✅ Переключатель режима (панорамный/простой) -->
      <div class="uso-mode-selector" style="margin-bottom: 12px;">
        <label style="font-weight: 500; margin-right: 8px;"><?php esc_html_e('Режим:', 'uso-teeth-calculator'); ?></label>
        <div class="mode-buttons">
          <button type="button" id="uso-mode-panoramic" class="mode-btn active" data-mode="panoramic">
            <?php esc_html_e('Панорамный', 'uso-teeth-calculator'); ?>
          </button>
          <button type="button" id="uso-mode-simple" class="mode-btn" data-mode="simple">
            <?php esc_html_e('Простой', 'uso-teeth-calculator'); ?>
          </button>
        </div>
      </div>

      <!-- ✅ НОВОЕ: Навигация по снимкам (вкладки) -->
      <div class="variants" role="tablist" aria-label="<?php esc_attr_e('Снимки', 'uso-teeth-calculator'); ?>" style="margin-bottom:12px;">
        <div id="uso-images-nav" class="variants-bar"></div>
      </div>

      <div class="img-tools">
        <div class="variants" role="tablist" aria-label="<?php esc_attr_e('Варианты', 'uso-teeth-calculator'); ?>">
          <div id="uso-variants-bar" class="variants-bar"></div>
          <button type="button" id="uso-add-variant" class="button"><?php esc_html_e('Добавить описание', 'uso-teeth-calculator'); ?></button>
        </div>
        <div class="spacer"></div>
        <button type="button" id="view-reset" aria-label="<?php esc_attr_e('Сброс вида', 'uso-teeth-calculator'); ?>"><?php esc_html_e('Сброс вида', 'uso-teeth-calculator'); ?></button>
        <button type="button" id="img-rotate" aria-label="<?php esc_attr_e('Ср. линия', 'uso-teeth-calculator'); ?>"><?php esc_html_e('Ср. линия', 'uso-teeth-calculator'); ?></button>
        <button type="button" id="uso-fullscreen" aria-label="<?php esc_attr_e('На весь экран', 'uso-teeth-calculator'); ?>"><?php esc_html_e('На весь экран', 'uso-teeth-calculator'); ?></button>
        <button type="button" id="uso-compare-variants" class="button" style="display:none;"><?php esc_html_e('Сравнить варианты', 'uso-teeth-calculator'); ?></button>
        <button id="uso-clear-all" type="button" class="danger-btn" aria-label="<?php esc_attr_e('Очистить все метки', 'uso-teeth-calculator'); ?>"><?php esc_html_e('Очистить все метки', 'uso-teeth-calculator'); ?></button>

        <div class="crop-controls">
          <button type="button" id="uso-crop-start" aria-controls="uso-canvas">Обрезать</button>
          <select id="uso-crop-ratio" aria-label="Пропорции обрезки">
            <option value="free">Свободно</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="16:9">16:9</option>
          </select>
          <button type="button" id="uso-crop-apply" disabled>Применить</button>
          <button type="button" id="uso-crop-cancel" disabled>Отмена</button>
        </div>
      </div>

      <div class="uso-workspace">
        <div class="uso-canvas-wrap" id="uso-canvas-container">
          <canvas id="uso-canvas" role="img" aria-label="<?php esc_attr_e('Снимок с разметкой', 'uso-teeth-calculator'); ?>"></canvas>
          <p class="hint"><?php esc_html_e('Режим меток выкл: 1 палец — панорама, 2 пальца — зум. Вкл: короткий тап — метка; панорама отключена. Двойной клик по метке — удалить (в режиме редактирования: выкл). Есть кнопка «Удалить выбранное».', 'uso-teeth-calculator'); ?></p>
        </div>

        <div class="uso-export" id="uso-palette-panel">
          <div class="palette unified" role="toolbar" aria-label="<?php esc_attr_e('Инструменты и палитра', 'uso-teeth-calculator'); ?>">
            <button type="button" id="uso-undo" title="<?php esc_attr_e('Отменить','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Отменить','uso-teeth-calculator'); ?>" disabled></button>
            <button type="button" id="mark-toggle" title="<?php esc_attr_e('Переключить режим редактирования','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Переключить режим редактирования','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
            <button type="button" id="uso-exit-fs" title="<?php esc_attr_e('Выйти из полноэкранного режима','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Выйти из полноэкранного режима','uso-teeth-calculator'); ?>" style="display:none;"></button>
            <button type="button" id="uso-del" title="<?php esc_attr_e('Удалить выбранное','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Удалить выбранное','uso-teeth-calculator'); ?>" disabled></button>

            <div class="shape-group" role="group" aria-label="<?php esc_attr_e('Фигуры','uso-teeth-calculator'); ?>">
              <button type="button" data-shape="point" class="shape-btn active" title="<?php esc_attr_e('Точка','uso-teeth-calculator'); ?>" aria-pressed="true">•</button>
              <button type="button" data-shape="cross" class="shape-btn" title="<?php esc_attr_e('Крест','uso-teeth-calculator'); ?>" aria-pressed="false">✕</button>
              <button type="button" data-shape="line"  class="shape-btn" title="<?php esc_attr_e('Линия','uso-teeth-calculator'); ?>" aria-pressed="false">—</button>
              <button type="button" data-shape="oval"  class="shape-btn" title="<?php esc_attr_e('Овал','uso-teeth-calculator'); ?>" aria-pressed="false">◯</button>
              <button type="button" data-shape="q"     class="shape-btn" title="<?php esc_attr_e('Вопрос','uso-teeth-calculator'); ?>" aria-pressed="false">?</button>
              <button type="button" data-shape="exc"   class="shape-btn" title="<?php esc_attr_e('Восклицательный','uso-teeth-calculator'); ?>" aria-pressed="false">!</button>
              <button type="button" data-shape="free"  class="shape-btn" title="<?php esc_attr_e('Свободное рисование','uso-teeth-calculator'); ?>" aria-pressed="false">✎~</button>
            </div>

            <div class="row colors" role="group" aria-label="<?php esc_attr_e('Цвета','uso-teeth-calculator'); ?>">
              <button type="button" class="color-btn" data-color="blue"    title="<?php esc_attr_e('Синий','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Синий','uso-teeth-calculator'); ?>" aria-pressed="true"></button>
              <button type="button" class="color-btn" data-color="ltblue"  title="<?php esc_attr_e('Голубой','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Голубой','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
              <button type="button" class="color-btn" data-color="white"   title="<?php esc_attr_e('Белый','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Белый','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
              <button type="button" class="color-btn" data-color="violet"  title="<?php esc_attr_e('Фиолетовый','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Фиолетовый','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
              <button type="button" class="color-btn" data-color="black"   title="<?php esc_attr_e('Чёрный','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Чёрный','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
              <button type="button" class="color-btn" data-color="yellow"  title="<?php esc_attr_e('Жёлтый','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Жёлтый','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
              <button type="button" class="color-btn" data-color="green"   title="<?php esc_attr_e('Зелёный','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Зелёный','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
              <button type="button" class="color-btn" data-color="red"     title="<?php esc_attr_e('Красный','uso-teeth-calculator'); ?>" aria-label="<?php esc_attr_e('Красный','uso-teeth-calculator'); ?>" aria-pressed="false"></button>
            </div>

            <div class="panel-controls"></div>
          </div>
        </div>
      </div>

      <div class="uso-opts">
        <section class="uso-section">
          <h4><?php esc_html_e('Терапия:', 'uso-teeth-calculator'); ?> <span id="uso-sum-therapy">0 ₽</span></h4>
          <textarea id="uso-note-therapy" rows="3" class="large-text" placeholder="<?php esc_attr_e('Примечание по терапии (необязательно)', 'uso-teeth-calculator'); ?>"></textarea>
        </section>

        <section class="uso-section">
          <h4><?php esc_html_e('Коронки и мосты', 'uso-teeth-calculator'); ?></h4>
          <div class="preinfo">
            <?php esc_html_e('Единиц (MC):', 'uso-teeth-calculator'); ?> <span id="uso-info-mc">0</span>;
            <?php esc_html_e('Белых:', 'uso-teeth-calculator'); ?> <span id="uso-info-white">0</span>;
            <?php esc_html_e('Единиц (Zr):', 'uso-teeth-calculator'); ?> <span id="uso-info-zr">0</span>
          </div>

          <details class="uso-actions-collapsed" open>
            <summary><?php esc_html_e('Материалы', 'uso-teeth-calculator'); ?></summary>
            <div id="uso-results"></div>
          </details>

          <textarea id="uso-note-crowns" rows="3" class="large-text" placeholder="<?php esc_attr_e('Примечание по коронкам/мостам (необязательно)', 'uso-teeth-calculator'); ?>"></textarea>
        </section>

        <section class="uso-section">
          <h4><?php esc_html_e('Протезы', 'uso-teeth-calculator'); ?></h4>
          <div class="preinfo">
            <?php esc_html_e('Верх:', 'uso-teeth-calculator'); ?> <span id="uso-info-prot-top">—</span>;
            <?php esc_html_e('Низ:', 'uso-teeth-calculator'); ?> <span id="uso-info-prot-bot">—</span>
          </div>

          <details class="uso-actions-collapsed" id="uso-prost-details" open>
            <summary><?php esc_html_e('Протезы (расчёт по линиям)', 'uso-teeth-calculator'); ?></summary>
            <div id="uso-prost-matrix" class="compact" aria-live="polite"></div>
          </details>
        </section>

        <section class="uso-section">
          <h4><?php esc_html_e('Имплантация', 'uso-teeth-calculator'); ?></h4>
          <div class="preinfo">
            <?php esc_html_e('Импланты:', 'uso-teeth-calculator'); ?> <span id="uso-info-impl">0 ₽</span>;
            <?php esc_html_e('Коронки на импланты:', 'uso-teeth-calculator'); ?> <span id="uso-info-impl-c">0 ₽</span>;
            <?php esc_html_e('Мосты:', 'uso-teeth-calculator'); ?> <span id="uso-info-impl-b">0 ₽</span>;
            <?php esc_html_e('Абатменты:', 'uso-teeth-calculator'); ?> <span id="uso-info-impl-a">0 ₽</span>
          </div>

          <details class="uso-actions-collapsed" open>
            <summary><?php esc_html_e('Варианты материалов (выбор)', 'uso-teeth-calculator'); ?></summary>
            <div class="impl-opts" aria-live="polite"></div>
          </details>

          <textarea id="uso-note-implants" rows="3" class="large-text" placeholder="<?php esc_attr_e('Примечание по имплантации (необязательно)', 'uso-teeth-calculator'); ?>"></textarea>
        </section>

      </div>

      <details class="uso-actions-collapsed" open>
        <summary><?php esc_html_e('Предварительный отчёт (редактируемый)', 'uso-teeth-calculator'); ?></summary>
        <div id="uso-preview-wrap" class="card" style="margin:8px 0;">
          <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
            <button type="button" id="uso-preview-refresh"><?php esc_html_e('Собрать из данных', 'uso-teeth-calculator'); ?></button>
            <button type="button" id="uso-preview-use"><?php esc_html_e('Использовать при экспорте', 'uso-teeth-calculator'); ?></button>
            <span class="hint"><?php esc_html_e('Можно отредактировать текст перед экспортом PDF/TXT.', 'uso-teeth-calculator'); ?></span>
          </div>
          <div id="uso-preview" contenteditable="true" style="border:1px solid #e5e5e5; padding:10px; border-radius:6px; background:#fff; max-height:420px; overflow:auto;"></div>
        </div>
      </details>

      <details class="uso-actions-collapsed">
        <summary><?php esc_html_e('Экспорт и отправка', 'uso-teeth-calculator'); ?></summary>
        <div class="uso-grid4">
          <div class="card markup-io">
            <button id="uso-export-json" type="button"><?php esc_html_e('Экспорт разметки', 'uso-teeth-calculator'); ?></button>
            <label class="import-label"><?php esc_html_e('Импорт JSON', 'uso-teeth-calculator'); ?> <input type="file" id="uso-import-json" accept="application/json" hidden></label>
          </div>

          <div class="card">
            <label for="uso-report-type"><?php esc_html_e('Отчёт', 'uso-teeth-calculator'); ?>:
              <select id="uso-report-type">
                <option value="default"><?php esc_html_e('По умолчанию', 'uso-teeth-calculator'); ?></option>
                <option value="alt"><?php esc_html_e('Доп. отчёт', 'uso-teeth-calculator'); ?></option>
              </select>
            </label>
          </div>

          <button id="uso-pdf" type="button">PDF</button>
          <button id="uso-txt" type="button">TXT</button>
          <button id="uso-png" type="button">PNG</button>
          <button id="uso-wa" type="button">WhatsApp</button>
          <button id="uso-tg" type="button">Telegram</button>
        </div>
      </details>

      <p class="uso-disclaimer"><?php echo esc_html($disc); ?></p>

      <?php if ($test_mode): ?>
      <details class="uso-actions-collapsed" id="uso-test-panel" style="margin-top:8px;">
        <summary><?php esc_html_e('Тестирование (для сотрудников)', 'uso-teeth-calculator'); ?></summary>
        <div style="display:grid; gap:8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
          <div class="card">
            <b><?php esc_html_e('Быстрые сценарии', 'uso-teeth-calculator'); ?></b><br>
            <button type="button" data-scn="crowns"><?php esc_html_e('Сценарий: коронки/мосты', 'uso-teeth-calculator'); ?></button>
            <button type="button" data-scn="therapy"><?php esc_html_e('Сценарий: терапия', 'uso-teeth-calculator'); ?></button>
            <button type="button" data-scn="implants"><?php esc_html_e('Сценарий: имплантация', 'uso-teeth-calculator'); ?></button>
          </div>
          <div class="card">
            <b><?php esc_html_e('Управление', 'uso-teeth-calculator'); ?></b><br>
            <button type="button" id="test-clear"><?php esc_html_e('Очистить метки', 'uso-teeth-calculator'); ?></button>
            <button type="button" id="test-recompute"><?php esc_html_e('Пересчитать', 'uso-teeth-calculator'); ?></button>
            <button type="button" id="test-export-json"><?php esc_html_e('Выгрузить JSON разметки', 'uso-teeth-calculator'); ?></button>
          </div>
          <div class="card">
            <b><?php esc_html_e('Диагностика', 'uso-teeth-calculator'); ?></b><br>
            <button type="button" id="test-show-state"><?php esc_html_e('Показать состояние расчёта', 'uso-teeth-calculator'); ?></button>
            <button type="button" id="test-check-prices"><?php esc_html_e('Проверить прайсы на нули', 'uso-teeth-calculator'); ?></button>
            <button type="button" id="test-preview-pdf"><?php esc_html_e('Превью HTML для PDF', 'uso-teeth-calculator'); ?></button>
          </div>
        </div>
      </details>
      <?php endif; ?>
    </div>
    <?php
    return ob_get_clean();
  }

  public function handle_export(){
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    check_admin_referer('uso_export_nonce');
    $opt = get_option('uso_calc_options', []);
    nocache_headers();
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="uso_calc_options.json"');
    echo json_encode($opt, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
    exit;
  }

  public function handle_import(){
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    check_admin_referer('uso_import_nonce');
    if (!empty($_FILES['uso_json']['tmp_name'])) {
      $json = file_get_contents($_FILES['uso_json']['tmp_name']);
      $data = json_decode($json, true);
      if (is_array($data)) {
        if (isset($data['pdf_template_html'])) {
          $allowed_tags = ['div','p','h1','h2','h3','h4','span','b','strong','i','em','ul','ol','li','br','img','table','thead','tbody','tr','td','th','style','meta','title','head','body','html'];
          $allowed = [];
          foreach ($allowed_tags as $tag) {
            $allowed[$tag] = ['style'=>true, 'class'=>true, 'id'=>true, 'src'=>true, 'alt'=>true, 'href'=>true, 'colspan'=>true, 'rowspan'=>true];
          }
          $data['pdf_template_html'] = wp_kses($data['pdf_template_html'], $allowed);
        }
        if (isset($data['texts']) && is_array($data['texts'])) {
          foreach ($data['texts'] as $k=>$v) $data['texts'][$k] = wp_kses_post($v);
        }
        if (isset($data['prices']) && is_array($data['prices'])) {
          foreach ($data['prices'] as $k=>$v) $data['prices'][$k] = (int)$v;
        }
        if (isset($data['impl']) && is_array($data['impl'])) {
          $data['impl']['brand_label'] = sanitize_text_field($data['impl']['brand_label'] ?? 'OSSTEM');
          if (isset($data['impl']['crown_labels']) && is_array($data['impl']['crown_labels'])) {
            $data['impl']['crown_labels']['cocr'] = sanitize_text_field($data['impl']['crown_labels']['cocr'] ?? 'CoCr');
            $data['impl']['crown_labels']['zr']   = sanitize_text_field($data['impl']['crown_labels']['zr']   ?? 'Zr');
          }
          if (isset($data['impl']['abutment']) && is_array($data['impl']['abutment'])) {
            $data['impl']['abutment']['label'] = sanitize_text_field($data['impl']['abutment']['label'] ?? 'Абатмент');
          }
        }

        update_option('uso_calc_options', $data);
        global $wpdb;
        $wpdb->query($wpdb->prepare(
          "UPDATE {$wpdb->options} SET autoload=%s WHERE option_name=%s",
          'no', 'uso_calc_options'
        ));

        if (function_exists('uso_update_option_noautoload')) {
          if (isset($data['materials'])) uso_update_option_noautoload('uso_calc_materials', $data['materials']);
          if (isset($data['prices']))    uso_update_option_noautoload('uso_calc_prices',    $data['prices']);
          if (isset($data['texts']))     uso_update_option_noautoload('uso_calc_texts',     $data['texts']);
          if (isset($data['clinic']))    uso_update_option_noautoload('uso_calc_clinic',    $data['clinic']);
          if (isset($data['impl']))      uso_update_option_noautoload('uso_calc_impl',      $data['impl']);
        }

        wp_redirect(admin_url('admin.php?page=uso-calculator&import=ok')); exit;
      }
    }
    wp_redirect(admin_url('admin.php?page=uso-calculator&import=fail')); exit;
  }

  public function handle_reset_defaults(){
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    check_admin_referer('uso_reset_defaults');
    $path = plugin_dir_path(__FILE__) . 'defaults.json';
    if (file_exists($path)) {
      $json = json_decode(file_get_contents($path), true);
      if (is_array($json)) {
        update_option('uso_calc_options', $json);
        global $wpdb;
        $wpdb->query($wpdb->prepare(
          "UPDATE {$wpdb->options} SET autoload=%s WHERE option_name=%s",
          'no', 'uso_calc_options'
        ));

        if (function_exists('uso_update_option_noautoload')) {
          if (isset($json['materials'])) uso_update_option_noautoload('uso_calc_materials', $json['materials']);
          if (isset($json['prices']))    uso_update_option_noautoload('uso_calc_prices',    $json['prices']);
          if (isset($json['texts']))     uso_update_option_noautoload('uso_calc_texts',     $json['texts']);
          if (isset($json['clinic']))    uso_update_option_noautoload('uso_calc_clinic',    $json['clinic']);
          if (isset($json['impl']))      uso_update_option_noautoload('uso_calc_impl',      $json['impl']);
        }
      }
    }
    wp_redirect(admin_url('admin.php?page=uso-calculator&reset=ok')); exit;
  }
}

new USO_Teeth_Calc_Plugin();