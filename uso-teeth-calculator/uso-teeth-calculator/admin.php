<?php
if (!defined('ABSPATH')) exit;

add_action('admin_menu', function(){
  add_menu_page(
    'УСО — Калькулятор',
    'УСО — Калькулятор',
    'manage_options',
    'uso-calculator',
    'uso_render_admin',
    'dashicons-admin-tools',
    58
  );
});

function uso_default_options(){
  static $cache = null;
  if ($cache !== null) return $cache;
  $path = plugin_dir_path(__FILE__) . 'defaults.json';
  $opt = [];
  if (file_exists($path)) {
    $opt = json_decode(file_get_contents($path), true) ?: [];
  }
  $cache = $opt;
  return $opt;
}

function uso_colors_map(){
  return [
    'violet'=>['title'=>'Фиолетовый','markers'=>['violet_x','violet_line','violet_dot','violet_exc','violet_oval']],
    'ltblue'=>['title'=>'Голубой','markers'=>['ltblue_x','ltblue_dot']],
    'white'=>['title'=>'Белый','markers'=>['white_dot','white_line']],
    'black'=>['title'=>'Черный','markers'=>['black_x','black_dot','black_exc']],
    'yellow'=>['title'=>'Желтый','markers'=>['yellow_line','yellow_dot','yellow_oval']],
    'blue'=>['title'=>'Синий','markers'=>['blue_x','blue_dot']],
    'green'=>['title'=>'Зеленый','markers'=>['green_dot','green_q','green_oval','green_exc','green_line']],
    'red'=>['title'=>'Красный','markers'=>['red_dot','red_q','red_oval','red_exc']],
  ];
}

function uso_sanitize_money($v){ 
  return max(0, intval($v)); 
}

function uso_sanitize_text($v){ 
  return sanitize_text_field($v ?? ''); 
}

function uso_slugify($s){
  $s = sanitize_title($s ?? '');
  if ($s==='') $s = substr(md5(uniqid('', true)), 0, 8);
  return $s;
}

function uso_sanitize_materials_group($posted_group){
  $out = [];
  if (!is_array($posted_group)) return $out;
  $used = [];
  foreach ($posted_group as $row){
    $label = uso_sanitize_text($row['label'] ?? '');
    $price = uso_sanitize_money($row['price'] ?? 0);

    $raw_ak = trim($row['admin_key'] ?? '');
    $ak = $raw_ak !== '' ? uso_slugify($raw_ak) : uso_slugify($label);

    if ($label === '' && $price <= 0) continue;

    $base = $ak; $i = 2;
    while (isset($used[$ak])) { $ak = $base.'-'.$i; $i++; }
    $used[$ak] = true;

    $out[] = [
      'admin_key' => $ak,
      'label'     => $label,
      'price'     => $price,
      'default'   => !empty($row['default']) ? true : false
    ];
  }
  return $out;
}

function uso_render_repeater($group_key, $title, $items){
  $esc_group = esc_attr($group_key);
  $with_default = in_array($group_key, ['mc','zr'], true);
  $cols = $with_default ? '180px 1fr 130px 130px 80px' : '180px 1fr 160px 80px';
  ?>
  <div class="uso-repeater" data-group="<?php echo $esc_group; ?>" data-has-default="<?php echo $with_default ? '1':'0'; ?>">
    <h3 style="margin:10px 0 6px;"><?php echo esc_html($title); ?></h3>
    <div class="uso-repeater-head" style="display:grid; grid-template-columns: <?php echo $cols; ?>; gap:8px; font-weight:600; margin-bottom:6px;">
      <div>Короткое имя</div>
      <div>Публичное наименование</div>
      <?php if ($with_default): ?>
        <div>По умолчанию</div>
      <?php endif; ?>
      <div>Цена, ₽</div>
      <div></div>
    </div>
    <div class="uso-repeater-items">
      <?php
      $idx=0;
      foreach ($items as $row){
        $ak = esc_attr($row['admin_key'] ?? '');
        $label = esc_attr($row['label'] ?? '');
        $price = esc_attr($row['price'] ?? 0);
        $checked = !empty($row['default']) ? 'checked' : '';
        ?>
        <div class="uso-repeater-row" style="display:grid; grid-template-columns: <?php echo $cols; ?>; gap:8px; margin-bottom:6px;">
          <input type="text" name="materials[<?php echo $esc_group; ?>][<?php echo $idx; ?>][admin_key]" value="<?php echo $ak; ?>" placeholder="например: cocr, zr_jp">
          <input type="text" name="materials[<?php echo $esc_group; ?>][<?php echo $idx; ?>][label]" value="<?php echo $label; ?>" placeholder="Публичное название">
          <?php if ($with_default): ?>
            <label style="display:flex; align-items:center; gap:6px;">
              <input type="checkbox" name="materials[<?php echo $esc_group; ?>][<?php echo $idx; ?>][default]" value="1" <?php echo $checked; ?>>
              <span>вкл</span>
            </label>
          <?php endif; ?>
          <input type="number" name="materials[<?php echo $esc_group; ?>][<?php echo $idx; ?>][price]" value="<?php echo $price; ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)">
          <a href="#" class="button-link-delete uso-del-row" title="Удалить">Удалить</a>
        </div>
        <?php
        $idx++;
      }
      ?>
    </div>
    <p><button type="button" class="button uso-add-row" data-group="<?php echo $esc_group; ?>">+ Добавить</button></p>
  </div>
  <?php
}

function uso_update_option_noautoload($name, $value){
  global $wpdb;
  if (get_option($name, null) === null) {
    add_option($name, $value, '', 'no');
  } else {
    update_option($name, $value);
    $wpdb->query($wpdb->prepare(
      "UPDATE {$wpdb->options} SET autoload=%s WHERE option_name=%s",
      'no', $name
    ));
  }
}

function uso_render_admin(){
  if (!current_user_can('manage_options')) return;

  if (!empty($_POST['uso_save'])) {
    check_admin_referer('uso_save_nonce');

    $opt = get_option('uso_calc_options', []);
    $def = uso_default_options();

    $posted_materials = $_POST['materials'] ?? [];
    $materials = $opt['materials'] ?? ($def['materials'] ?? [
      'mc'=>[], 'zr'=>[], 'prosthesis'=>[], 'implants'=>[], 'impl_crowns'=>[], 'impl_bridges'=>[], 'abutment'=>['label'=>'Абатмент','price'=>6000], 'prosthesis_micro'=>['label'=>'Протез на микрозамках','price'=>55000]
    ]);

    $materials['mc']           = uso_sanitize_materials_group($posted_materials['mc'] ?? ($materials['mc'] ?? []));
    $materials['zr']           = uso_sanitize_materials_group($posted_materials['zr'] ?? ($materials['zr'] ?? []));
    $materials['prosthesis']   = uso_sanitize_materials_group($posted_materials['prosthesis'] ?? ($materials['prosthesis'] ?? []));
    $materials['implants']     = uso_sanitize_materials_group($posted_materials['implants'] ?? ($materials['implants'] ?? []));
    $materials['impl_crowns']  = uso_sanitize_materials_group($posted_materials['impl_crowns'] ?? ($materials['impl_crowns'] ?? []));
    $materials['impl_bridges'] = uso_sanitize_materials_group($posted_materials['impl_bridges'] ?? ($materials['impl_bridges'] ?? []));
    $materials['abutment'] = [
      'label' => uso_sanitize_text($_POST['materials']['abutment']['label'] ?? ($materials['abutment']['label'] ?? 'Абатмент')),
      'price' => uso_sanitize_money($_POST['materials']['abutment']['price'] ?? ($materials['abutment']['price'] ?? 6000))
    ];
    $materials['prosthesis_micro'] = [
      'label' => uso_sanitize_text($_POST['materials']['prosthesis_micro']['label'] ?? ($materials['prosthesis_micro']['label'] ?? 'Протез на микрозамках')),
      'price' => uso_sanitize_money($_POST['materials']['prosthesis_micro']['price'] ?? ($materials['prosthesis_micro']['price'] ?? 55000))
    ];

    $opt['materials'] = $materials;

    $opt['prices'] = isset($opt['prices']) && is_array($opt['prices']) ? $opt['prices'] : ($def['prices'] ?? []);
    if (isset($_POST['prices']) && is_array($_POST['prices'])) {
      foreach ($_POST['prices'] as $k=>$v) {
        $opt['prices'][$k] = uso_sanitize_money($v);
      }
    }
    $therapy_keys = ['t_red_dot','t_red_q','t_red_oval','t_green_q','t_green_dot','t_fill','t_build','t_post'];
    foreach ($therapy_keys as $tk){
      if (isset($_POST['prices'][$tk])) $opt['prices'][$tk] = uso_sanitize_money($_POST['prices'][$tk]);
    }

    $opt['texts'] = isset($opt['texts']) ? $opt['texts'] : [];
    foreach (uso_colors_map() as $cfg){
      foreach ($cfg['markers'] as $m) {
        $opt['texts'][$m] = wp_kses_post( $_POST['texts'][$m] ?? '' );
      }
    }

    $opt['clinic'] = [
      'advertiser' => uso_sanitize_text( $_POST['clinic']['advertiser'] ?? '' ),
      'ogrn'       => uso_sanitize_text( $_POST['clinic']['ogrn'] ?? '' ),
      'license'    => uso_sanitize_text( $_POST['clinic']['license'] ?? '231100100033222 от 29.06.10' ),
      'addr_heihe' => uso_sanitize_text( $_POST['clinic']['addr_heihe'] ?? 'Хэйхэ, ул. Культуры, 59/1' ),
      'addr_suif'  => uso_sanitize_text( $_POST['clinic']['addr_suif'] ?? 'Суйфэньхэ, ул. Спортивная, 28' ),
      'phone1'     => uso_sanitize_text( $_POST['clinic']['phone1'] ?? '8(800)700-11-82' ),
      'phone2'     => uso_sanitize_text( $_POST['clinic']['phone2'] ?? '8(914)158-58-54' ),
      'email'      => sanitize_email( $_POST['clinic']['email'] ?? 'chinazub@mail.ru' ),
      'site'       => esc_url_raw( $_POST['clinic']['site'] ?? 'https://chinazub.ru' ),
      'logo'       => esc_url_raw( $_POST['clinic']['logo'] ?? '' ),
      'disclaimer' => wp_kses_post( $_POST['clinic']['disclaimer'] ?? 'Имеются противопоказания, необходима консультация специалиста. Медуслуги оказывают клиники‑партнёры в КНР.' )
    ];

    $opt['material_labels'] = [
      'mc_ti'    => uso_sanitize_text($_POST['material_labels']['mc_ti']    ?? 'Ti≤50%'),
      'mc_ti_30' => uso_sanitize_text($_POST['material_labels']['mc_ti_30'] ?? 'Ti≤30% + JP'),
      'mc_cocr'  => uso_sanitize_text($_POST['material_labels']['mc_cocr']  ?? 'CoCr'),
      'zr_jp'    => uso_sanitize_text($_POST['material_labels']['zr_jp']    ?? 'Zr + JP'),
      'zr_de'    => uso_sanitize_text($_POST['material_labels']['zr_de']    ?? 'Zr + Vita')
    ];

    $opt['impl'] = isset($opt['impl']) && is_array($opt['impl']) ? $opt['impl'] : [];
    $opt['impl']['brand_label'] = uso_sanitize_text($_POST['impl']['brand_label'] ?? ($opt['impl']['brand_label'] ?? 'OSSTEM'));
    $opt['impl']['crown_labels'] = [
      'cocr' => uso_sanitize_text($_POST['impl']['crown_labels']['cocr'] ?? ($opt['impl']['crown_labels']['cocr'] ?? 'CoCr')),
      'zr'   => uso_sanitize_text($_POST['impl']['crown_labels']['zr']   ?? ($opt['impl']['crown_labels']['zr']   ?? 'Zr')),
    ];
    $opt['impl']['abutment'] = [
      'label' => uso_sanitize_text($_POST['impl']['abutment']['label'] ?? ($opt['impl']['abutment']['label'] ?? 'Абатмент'))
    ];

    $opt['test_mode'] = !empty($_POST['test_mode']);
    $opt['isolate_scripts'] = !empty($_POST['isolate_scripts']);

    // Ограничить теги в pdf_template_html
    $allowed_tags = ['div','p','h1','h2','h3','h4','span','b','strong','i','em','ul','ol','li','br','img','table','thead','tbody','tr','td','th','style','meta','title','head','body','html'];
    $allowed = [];
    foreach ($allowed_tags as $tag) {
      $allowed[$tag] = ['style'=>true, 'class'=>true, 'id'=>true, 'src'=>true, 'alt'=>true, 'href'=>true, 'colspan'=>true, 'rowspan'=>true];
    }
    $opt['pdf_template_html'] = wp_kses( $_POST['pdf_template_html'] ?? '', $allowed );
    if (isset($opt['pdf_template'])) unset($opt['pdf_template']);

    $opt['date_updated'] = uso_sanitize_text( $_POST['date_updated'] ?? current_time('Y-m-d') );

    // Разнести опции + бэкап
    uso_update_option_noautoload('uso_calc_materials', $materials);
    uso_update_option_noautoload('uso_calc_prices',    $opt['prices']);
    uso_update_option_noautoload('uso_calc_texts',     $opt['texts']);
    uso_update_option_noautoload('uso_calc_clinic',    $opt['clinic']);
    uso_update_option_noautoload('uso_calc_impl',      $opt['impl']);
    uso_update_option_noautoload('uso_calc_options',   $opt);

    echo '<div class="updated"><p>Настройки сохранены.</p></div>';
  }

  // Чтение опций для формы
  $opt_legacy = get_option('uso_calc_options', uso_default_options());
  $opt = $opt_legacy;

  $opt['materials'] = get_option('uso_calc_materials', $opt_legacy['materials'] ?? []);
  $opt['prices']    = get_option('uso_calc_prices',    $opt_legacy['prices']    ?? []);
  $opt['texts']     = get_option('uso_calc_texts',     $opt_legacy['texts']     ?? []);
  $opt['clinic']    = get_option('uso_calc_clinic',    $opt_legacy['clinic']    ?? []);
  $opt['impl']      = get_option('uso_calc_impl',      $opt_legacy['impl']      ?? []);

  $def = uso_default_options();

  $prices    = $opt['prices'] ?? [];
  $texts     = $opt['texts'] ?? [];
  $clinic    = $opt['clinic'] ?? [];
  $labels    = $opt['material_labels'] ?? [
    'mc_ti'=>'Ti≤50%','mc_ti_30'=>'Ti≤30% + JP','mc_cocr'=>'CoCr','zr_jp'=>'Zr + JP','zr_de'=>'Zr + Vita'
  ];
  $impl      = $opt['impl'] ?? [];
  $materials = $opt['materials'] ?? ($def['materials'] ?? [
    'mc'=>[
      ['admin_key'=>'ti50','label'=>'Ti≤50%','price'=> ($prices['mc_ti_50'] ?? 6000), 'default'=>true],
      ['admin_key'=>'ti30_jp','label'=>'Ti≤30% + JP','price'=> ($prices['mc_ti_30'] ?? 6200), 'default'=>false],
      ['admin_key'=>'cocr','label'=>'CoCr','price'=> ($prices['mc_cocr'] ?? 7200), 'default'=>true],
      ['admin_key'=>'cast_crown','label'=>'Литая коронка','price'=> 4200, 'default'=>false],
      ['admin_key'=>'ni_cr_korean','label'=>'Никель-Хром корейская керамика','price'=> 5000, 'default'=>false]
    ],
    'zr'=>[
      ['admin_key'=>'zr_jp','label'=>'Zr + JP','price'=> ($prices['zr_jp'] ?? 13000), 'default'=>true],
      ['admin_key'=>'zr_vita','label'=>'Zr + Vita','price'=> ($prices['zr_de'] ?? 15000), 'default'=>false],
      ['admin_key'=>'zr_solid','label'=>'Цельный диоксид циркония','price'=> 25000, 'default'=>false]
    ],
    'prosthesis'=>[
      ['admin_key'=>'acri_full','label'=>'Акри полный','price'=> ($prices['rem_full_op1'] ?? 35000)],
      ['admin_key'=>'acri_part','label'=>'Акри частичный','price'=> ($prices['rem_part_op1'] ?? 28000)],
      ['admin_key'=>'acri_mesh','label'=>'Акри сетка','price'=> ($prices['rem_part_op2'] ?? 32000)],
      ['admin_key'=>'metal_full','label'=>'Мет полный','price'=> ($prices['rem_full_op2'] ?? 53000)],
      ['admin_key'=>'metal_part','label'=>'Мет частичный','price'=> ($prices['rem_part_op3'] ?? 45000)]
    ],
    'implants'=>[
      ['admin_key'=>'osstem','label'=>'OSSTEM','price'=> ($prices['t_implant'] ?? 55000)]
    ],
    'impl_crowns'=>[
      ['admin_key'=>'impl_crown_cocr','label'=>'CoCr','price'=> ($prices['impl_crown_cocr'] ?? 14000)],
      ['admin_key'=>'impl_crown_zr','label'=>'Zr','price'=> ($prices['impl_crown_zr'] ?? 23000)]
    ],
    'impl_bridges'=>[
      ['admin_key'=>'impl_bridge_cocr','label'=>'CoCr','price'=> ($prices['impl_bridge_cocr'] ?? 10000)],
      ['admin_key'=>'impl_bridge_zr','label'=>'Zr','price'=> ($prices['impl_bridge_zr'] ?? 18000)]
    ],
    'abutment'=>[
      'label'=> ($impl['abutment']['label'] ?? 'Абатмент'),
      'price'=> ($prices['t_abutment'] ?? 6000)
    ],
    'prosthesis_micro'=>[
      'label'=>'Протез на микрозамках',
      'price'=> 55000
    ]
  ]);

  $test_mode = !empty($opt['test_mode']);
  $isolate_scripts = !empty($opt['isolate_scripts']);
  $date_updated = esc_attr( $opt['date_updated'] ?? current_time('Y-m-d') );
  $pdf_template_val = $opt['pdf_template_html'] ?? ($opt['pdf_template'] ?? '');
  ?>
  <div class="wrap">
    <h1>УСО — Калькулятор (настройки)</h1>
    <form method="post">
      <?php wp_nonce_field('uso_save_nonce'); ?>

      <h2>А. Протезирование</h2>
      <p class="description">Динамические списки материалов. Можно добавлять свои записи. Для групп «Металлокерамика» и «Диоксид циркония» отметьте материалы, которые по умолчанию будут отмечены на фронте.</p>

      <?php
        uso_render_repeater('mc', '1) Металлокерамика', $materials['mc'] ?? []);
        uso_render_repeater('zr', '2) Диоксид циркония', $materials['zr'] ?? []);
        uso_render_repeater('prosthesis', '3) Протезы', $materials['prosthesis'] ?? []);
      ?>

      <table class="form-table">
        <tr>
          <th>4) Протез на микрозамках (зелёная линия)</th>
          <td>
            <label>Наименование: <input type="text" name="materials[prosthesis_micro][label]" value="<?php echo esc_attr($materials['prosthesis_micro']['label'] ?? 'Протез на микрозамках'); ?>"></label>
            <label style="margin-left:12px;">Цена: <input type="number" name="materials[prosthesis_micro][price]" value="<?php echo esc_attr($materials['prosthesis_micro']['price'] ?? 55000); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*"></label>
            <p class="description">Отмечается зелёной линией на снимке. Выбор материала не требуется.</p>
          </td>
        </tr>
      </table>

      <h2>B. Имплантация</h2>
      <?php
        uso_render_repeater('implants', '1) Импланты (бренд/установка)', $materials['implants'] ?? []);
        uso_render_repeater('impl_crowns', '2) Коронки на импланты (материал)', $materials['impl_crowns'] ?? []);
        uso_render_repeater('impl_bridges', '3) Мосты между имплантами (материал)', $materials['impl_bridges'] ?? []);
      ?>
      <table class="form-table">
        <tr>
          <th>4) Абатмент</th>
          <td>
            <label>Наименование: <input type="text" name="materials[abutment][label]" value="<?php echo esc_attr($materials['abutment']['label'] ?? 'Абатмент'); ?>"></label>
            <label style="margin-left:12px;">Цена: <input type="number" name="materials[abutment][price]" value="<?php echo esc_attr($materials['abutment']['price'] ?? 6000); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*"></label>
          </td>
        </tr>
      </table>

      <h2>C. Терапия — цены (8 оплачиваемых меток)</h2>
      <table class="form-table">
        <tr><th>Красная точка (red_dot)</th><td><input type="number" name="prices[t_red_dot]" value="<?php echo esc_attr( $prices['t_red_dot'] ?? 0 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Красный вопрос (red_q)</th><td><input type="number" name="prices[t_red_q]" value="<?php echo esc_attr( $prices['t_red_q'] ?? 2800 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Красный овал (red_oval)</th><td><input type="number" name="prices[t_red_oval]" value="<?php echo esc_attr( $prices['t_red_oval'] ?? 0 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Зелёный вопрос (green_q)</th><td><input type="number" name="prices[t_green_q]" value="<?php echo esc_attr( $prices['t_green_q'] ?? 5000 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Зелёная точка (green_dot)</th><td><input type="number" name="prices[t_green_dot]" value="<?php echo esc_attr( $prices['t_green_dot'] ?? 0 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Жёлтая точка (yellow_dot)</th><td><input type="number" name="prices[t_fill]" value="<?php echo esc_attr( $prices['t_fill'] ?? 2800 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Жёлтый овал (yellow_oval)</th><td><input type="number" name="prices[t_build]" value="<?php echo esc_attr( $prices['t_build'] ?? 2800 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
        <tr><th>Чёрный восклицательный (black_exc)</th><td><input type="number" name="prices[t_post]" value="<?php echo esc_attr( $prices['t_post'] ?? 2500 ); ?>" min="0" step="1" inputmode="numeric" pattern="[0-9]*" title="Целое число (рубли)"></td></tr>
      </table>

      <h2>Тексты маркеров</h2>
      <style>
        .uso-tabs { display:flex; gap:8px; margin:8px 0; }
        .uso-tab-btn { padding:6px 10px; border:1px solid #ccc; cursor:pointer; border-radius:4px; }
        .uso-tab-btn.active { background:#2271b1; color:#fff; }
        .uso-tab { display:none; border:1px solid #e5e5e5; padding:10px; border-radius:4px; }
        .uso-tab.active { display:block; }
        .uso-marker-block { margin-bottom:10px; }
        .uso-marker-block textarea { width:100%; height:100px; }
      </style>
      <div class="uso-tabs">
        <?php $i=0; foreach(uso_colors_map() as $key=>$cfg): ?>
          <div class="uso-tab-btn <?php echo $i===0?'active':''; ?>" data-tab="<?php echo esc_attr($key); ?>">
            <?php echo esc_html($cfg['title']); ?>
          </div>
        <?php $i++; endforeach; ?>
      </div>
      <?php $j=0; foreach(uso_colors_map() as $key=>$cfg): ?>
        <div class="uso-tab <?php echo $j===0?'active':''; ?>" id="tab-<?php echo esc_attr($key); ?>">
          <h3><?php echo esc_html($cfg['title']); ?></h3>
          <?php foreach($cfg['markers'] as $m): ?>
            <div class="uso-marker-block">
              <label><b><?php echo esc_html($m); ?></b></label>
              <textarea name="texts[<?php echo esc_attr($m); ?>]"><?php echo esc_textarea( $texts[$m] ?? '' ); ?></textarea>
              <p class="description">Текст добавляется, если метка присутствует на снимке.</p>
            </div>
          <?php endforeach; ?>
        </div>
      <?php $j++; endforeach; ?>

      <h2>Ярлыки материалов (для текстов/отчёта)</h2>
      <table class="form-table">
        <tr>
          <th>MC: Ti≤50%</th>
          <td><input type="text" name="material_labels[mc_ti]" value="<?php echo esc_attr($labels['mc_ti'] ?? 'Ti≤50%'); ?>" class="regular-text"></td>
        </tr>
        <tr>
          <th>MC: Ti≤30% + JP</th>
          <td><input type="text" name="material_labels[mc_ti_30]" value="<?php echo esc_attr($labels['mc_ti_30'] ?? 'Ti≤30% + JP'); ?>" class="regular-text"></td>
        </tr>
        <tr>
          <th>MC: CoCr</th>
          <td><input type="text" name="material_labels[mc_cocr]" value="<?php echo esc_attr($labels['mc_cocr'] ?? 'CoCr'); ?>" class="regular-text"></td>
        </tr>
        <tr>
          <th>Zr + JP</th>
          <td><input type="text" name="material_labels[zr_jp]" value="<?php echo esc_attr($labels['zr_jp'] ?? 'Zr + JP'); ?>" class="regular-text"></td>
        </tr>
        <tr>
          <th>Zr + Vita</th>
          <td><input type="text" name="material_labels[zr_de]" value="<?php echo esc_attr($labels['zr_de'] ?? 'Zr + Vita'); ?>" class="regular-text"></td>
        </tr>
      </table>

      <h2>PDF и реквизиты</h2>
      <table class="form-table">
        <tr><th>Рекламодатель</th><td><input type="text" name="clinic[advertiser]" value="<?php echo esc_attr( $clinic['advertiser'] ?? '' ); ?>" class="regular-text"></td></tr>
        <tr><th>ОГРН</th><td><input type="text" name="clinic[ogrn]" value="<?php echo esc_attr( $clinic['ogrn'] ?? '' ); ?>"></td></tr>
        <tr><th>Лицензия</th><td><input type="text" name="clinic[license]" value="<?php echo esc_attr( $clinic['license'] ?? '231100100033222 от 29.06.10' ); ?>"></td></tr>
        <tr><th>Адрес (Хэйхэ)</th><td><input type="text" name="clinic[addr_heihe]" value="<?php echo esc_attr( $clinic['addr_heihe'] ?? 'Хэйхэ, ул. Культуры, 59/1' ); ?>" class="regular-text"></td></tr>
        <tr><th>Адрес (Суйфэньхэ)</th><td><input type="text" name="clinic[addr_suif]" value="<?php echo esc_attr( $clinic['addr_suif'] ?? 'Суйфэньхэ, ул. Спортивная, 28' ); ?>" class="regular-text"></td></tr>
        <tr><th>Телефоны</th><td><input type="text" name="clinic[phone1]" value="<?php echo esc_attr( $clinic['phone1'] ?? '8(800)700-11-82' ); ?>"> <input type="text" name="clinic[phone2]" value="<?php echo esc_attr( $clinic['phone2'] ?? '8(914)158-58-54' ); ?>"></td></tr>
        <tr><th>E-mail</th><td><input type="email" name="clinic[email]" value="<?php echo esc_attr( $clinic['email'] ?? 'chinazub@mail.ru' ); ?>"></td></tr>
        <tr><th>Сайт</th><td><input type="url" name="clinic[site]" value="<?php echo esc_attr( $clinic['site'] ?? 'https://chinazub.ru' ); ?>" class="regular-text"></td></tr>
        <tr><th>Логотип (URL)</th><td><input type="url" name="clinic[logo]" value="<?php echo esc_attr( $clinic['logo'] ?? '' ); ?>" class="regular-text" placeholder="https://.../logo.png"></td></tr>
        <tr>
          <th>Дисклеймер</th>
          <td><textarea name="clinic[disclaimer]" class="large-text" rows="3"><?php echo esc_textarea( $clinic['disclaimer'] ?? 'Имеются противопоказания, необходима консультация специалиста. Медуслуги оказывают клиники‑партнёры в КНР.' ); ?></textarea></td>
        </tr>
        <tr>
          <th>Шаблон PDF (HTML)</th>
          <td>
            <textarea name="pdf_template_html" class="large-text code" rows="10"><?php echo esc_textarea( $pdf_template_val ); ?></textarea>
            <p class="description">Если пусто — используется templates/pdf-template.html</p>
            <p><button type="button" class="button" id="uso-admin-pdf-preview">Предпросмотр шаблона</button></p>
            <script>
              (function(){
                document.getElementById('uso-admin-pdf-preview')?.addEventListener('click', function(){
                  var ta = document.querySelector('textarea[name="pdf_template_html"]');
                  var html = ta ? ta.value : '';
                  var w = window.open('', '_blank', 'width=1000,height=800');
                  if (w) { w.document.open(); w.document.write(html || '<p style="padding:20px;font:14px Arial">Шаблон пуст. Будет использован шаблон по умолчанию из templates/pdf-template.html</p>'); w.document.close(); }
                });
              })();
            </script>
          </td>
        </tr>
        <tr><th>Дата обновления</th><td><input type="date" name="date_updated" value="<?php echo $date_updated; ?>"></td></tr>
        <tr><th>Тест‑панель</th><td><label><input type="checkbox" name="test_mode" value="1" <?php checked($test_mode, true); ?>> Включить режим тестирования</label></td></tr>
        <tr><th>Изолировать скрипты</th><td><label><input type="checkbox" name="isolate_scripts" value="1" <?php checked($isolate_scripts, true); ?>> Отключать посторонние скрипты на странице с калькулятором (включайте только при конфликтах)</label></td></tr>
      </table>

      <p><button class="button button-primary" type="submit" name="uso_save" value="1">Сохранить изменения</button></p>
    </form>

    <h2>Импорт / Экспорт настроек</h2>
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" enctype="multipart/form-data" style="margin-bottom:12px;">
      <?php wp_nonce_field('uso_import_nonce'); ?>
      <input type="hidden" name="action" value="uso_import">
      <input type="file" name="uso_json" accept="application/json">
      <button class="button">Импорт JSON</button>
    </form>
    <a class="button button-secondary" href="<?php echo esc_url( wp_nonce_url( admin_url('admin-post.php?action=uso_export'), 'uso_export_nonce') ); ?>">Экспорт JSON</a>

    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:12px;">
      <?php wp_nonce_field('uso_reset_defaults'); ?>
      <input type="hidden" name="action" value="uso_reset_defaults">
      <button class="button" onclick="return confirm('Сбросить настройки к значениям по умолчанию?')">Сбросить к значениям по умолчанию</button>
    </form>
  </div>

  <script type="text/template" id="uso-repeater-tpl">
    <div class="uso-repeater-row" style="display:grid; grid-template-columns: 180px 1fr 160px 80px; gap:8px; margin-bottom:6px;">
      <input type="text" name="materials[__GROUP__][__IDX__][admin_key]" value="" placeholder="например: cocr, zr_jp">
      <input type="text" name="materials[__GROUP__][__IDX__][label]" value="" placeholder="Публичное название">
      <input type="number" name="materials[__GROUP__][__IDX__][price]" value="" min="0" step="1" inputmode="numeric" pattern="[0-9]*">
      <a href="#" class="button-link-delete uso-del-row" title="Удалить">Удалить</a>
    </div>
  </script>
  <script type="text/template" id="uso-repeater-tpl-default">
    <div class="uso-repeater-row" style="display:grid; grid-template-columns: 180px 1fr 130px 130px 80px; gap:8px; margin-bottom:6px;">
      <input type="text" name="materials[__GROUP__][__IDX__][admin_key]" value="" placeholder="например: cocr, zr_jp">
      <input type="text" name="materials[__GROUP__][__IDX__][label]" value="" placeholder="Публичное название">
      <label style="display:flex; align-items:center; gap:6px;">
        <input type="checkbox" name="materials[__GROUP__][__IDX__][default]" value="1">
        <span>вкл</span>
      </label>
      <input type="number" name="materials[__GROUP__][__IDX__][price]" value="" min="0" step="1" inputmode="numeric" pattern="[0-9]*">
      <a href="#" class="button-link-delete uso-del-row" title="Удалить">Удалить</a>
    </div>
  </script>
  <script>
    (function(){
      function addRow(group){
        const repeater = document.querySelector('.uso-repeater[data-group="'+group+'"]');
        if (!repeater) return;
        const wrap = repeater.querySelector('.uso-repeater-items');
        if (!wrap) return;
        const idx = wrap.querySelectorAll('.uso-repeater-row').length;
        const tplId = repeater.getAttribute('data-has-default') === '1' ? 'uso-repeater-tpl-default' : 'uso-repeater-tpl';
        const tpl = document.getElementById(tplId).innerHTML
          .replace(/__GROUP__/g, group)
          .replace(/__IDX__/g, idx);
        const temp = document.createElement('div');
        temp.innerHTML = tpl.trim();
        wrap.appendChild(temp.firstChild);
      }
      document.querySelectorAll('.uso-add-row').forEach(btn=>{
        btn.addEventListener('click', function(){ addRow(this.getAttribute('data-group')); });
      });
      document.addEventListener('click', function(e){
        if (e.target && e.target.classList.contains('uso-del-row')){
          e.preventDefault();
          const row = e.target.closest('.uso-repeater-row');
          if (row) row.remove();
        }
      });

      // Табы
      const btns = document.querySelectorAll('.uso-tab-btn');
      const tabs = document.querySelectorAll('.uso-tab');
      btns.forEach(b=>b.addEventListener('click', ()=>{
        btns.forEach(x=>x.classList.remove('active')); b.classList.add('active');
        tabs.forEach(t=>t.classList.remove('active'));
        document.getElementById('tab-'+b.dataset.tab).classList.add('active');
      }));

      // Подсветка дублей admin_key
      function scanGroup(groupEl){
        const rows = groupEl.querySelectorAll('.uso-repeater-row');
        const map = {};
        rows.forEach(row=>{
          const inp = row.querySelector('input[name*="[admin_key]"]');
          const val = (inp?.value || '').trim().toLowerCase();
          if(!val) return;
          map[val] = map[val] || [];
          map[val].push({row, inp});
        });
        Object.keys(map).forEach(k=>{
          if (map[k].length > 1){
            map[k].forEach(({row,inp})=>{
              row.style.background = 'rgba(231,76,60,0.08)';
              inp.style.borderColor = '#e74c3c';
              if (!row.querySelector('.dup-warn')){
                const w = document.createElement('div');
                w.className='dup-warn';
                w.style.color='#e74c3c'; w.style.fontSize='12px';
                w.textContent = 'Дублируется ключ "'+k+'". При сохранении будет уникализирован.';
                row.appendChild(w);
              }
            });
          } else {
            map[k].forEach(({row,inp})=>{
              row.style.background = ''; inp.style.borderColor = '';
              row.querySelector('.dup-warn')?.remove();
            });
          }
        });
      }
      function scanAll(){ document.querySelectorAll('.uso-repeater').forEach(scanGroup); }
      document.addEventListener('input', function(e){
        if (e.target && e.target.name && e.target.name.endsWith('[admin_key]')){
          const group = e.target.closest('.uso-repeater');
          if (group) scanGroup(group);
        }
      });
      document.querySelector('form')?.addEventListener('submit', function(){ scanAll(); });
      scanAll();
    })();
  </script>

  <!-- Нормализация числовых полей (valueAsNumber) -->
  <script>
    (function(){
      document.addEventListener('input', function(e){
        const el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;
        if (el.value === '') return;
        const n = el.valueAsNumber;
        if (Number.isNaN(n) || n < 0) { el.value = '0'; return; }
        if (!Number.isInteger(n)) el.value = String(Math.max(0, Math.round(n||0)));
      });
      document.querySelectorAll('.wrap form').forEach(function(form){
        form.addEventListener('submit', function(){
          form.querySelectorAll('input[type="number"]').forEach(function(el){
            if (el.value === '' || Number.isNaN(el.valueAsNumber)) el.value = '0';
          });
        });
      });
    })();
  </script>
  <?php
}