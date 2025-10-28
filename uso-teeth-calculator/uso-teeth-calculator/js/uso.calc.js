(function(w, $){
  'use strict';

  if (!w.USO) w.USO = {};
  const U = w.USO;
  const M = U.MATERIALS || {};
  const PRICES = U.PRICES || {};

  // ✅ Используем debug-систему
  const DEBUG = U.DEBUG_CANVAS || {
    log: function() {},
    warn: function(...args) { console.warn(...args); },
    error: function(...args) { console.error(...args); }
  };

  function findByKey(arr, key){ 
    return (arr||[]).find(x=>x.admin_key===key); 
  }

  function priceForImplKey(group, key){ 
    const it = findByKey(M[group], key); 
    return it ? Number(it.price||0) : 0; 
  }

  function priceAbutment(){ 
    return Number((M.abutment && M.abutment.price) || 0); 
  }

  function compute(cnt, jawSplits, selections, selectedMats){
    // ✅ Валидация входных параметров
    if (!cnt || typeof cnt !== 'object') {
      console.warn('[USO_CALC] Invalid cnt:', cnt);
      cnt = {};
    }
    if (!jawSplits || typeof jawSplits !== 'object') {
      console.warn('[USO_CALC] Invalid jawSplits:', jawSplits);
      jawSplits = { 
        yellow:{topUnits:0,bottomUnits:0}, 
        white:{topUnits:0,bottomUnits:0}, 
        violet:{topUnits:0,bottomUnits:0}, 
        green:{topUnits:0,bottomUnits:0} 
      };
    }
    if (!selections || typeof selections !== 'object') {
      console.warn('[USO_CALC] Invalid selections:', selections);
      selections = {};
    }
    if (!selectedMats || typeof selectedMats !== 'object') {
      console.warn('[USO_CALC] Invalid selectedMats:', selectedMats);
      selectedMats = {};
    }

    DEBUG.log('[USO_CALC] compute() called with:', {
      cntKeys: Object.keys(cnt),
      jawSplitsKeys: Object.keys(jawSplits),
      selectionsKeys: Object.keys(selections),
      selectedMatsKeys: Object.keys(selectedMats)
    });

    const baseCore = (cnt.blue_x||0)+(cnt.blue_dot||0)+(cnt.black_x||0)+(cnt.black_dot||0);
    const incWhite = (cnt.white_dot||0)>0;
    const units_mc = baseCore + (incWhite ? (cnt.white_dot||0) : 0);
    const units_zr = (cnt.ltblue_x||0)+(cnt.ltblue_dot||0);

    DEBUG.log('[USO_CALC] Crowns calculation:', { baseCore, incWhite, units_mc, units_zr });

    const col = {};
    (M.mc||[]).forEach(m => { 
      col[m.admin_key] = units_mc * Number(m.price||0); 
    });
    (M.zr||[]).forEach(m => { 
      col[m.admin_key] = units_zr * Number(m.price||0); 
    });

    let therapy = 0;
    const pm = [
      ['red_dot','t_red_dot'], 
      ['red_q','t_red_q'], 
      ['red_oval','t_red_oval'],
      ['green_q','t_green_q'], 
      ['green_dot','t_green_dot'],
      ['yellow_dot','t_fill'], 
      ['yellow_oval','t_build'],
      ['black_exc','t_post']
    ];
    pm.forEach(([mk,pk])=>{ 
      const count = cnt[mk]||0;
      const price = PRICES[pk]||0;
      therapy += count * price;
      if (count > 0) {
        DEBUG.log('[USO_CALC] Therapy:', mk, 'count:', count, 'price:', price, 'sum:', count*price);
      }
    });

    DEBUG.log('[USO_CALC] Total therapy:', therapy);

    const yl = jawSplits.yellow || {topUnits:0,bottomUnits:0};
    const wl = jawSplits.white  || {topUnits:0,bottomUnits:0};
    const vl = jawSplits.violet || {topUnits:0,bottomUnits:0};
    const gl = jawSplits.green  || {topUnits:0,bottomUnits:0};

    DEBUG.log('[USO_CALC] Jaw splits:', { yl, wl, vl, gl });

    const msel = selections?.prosthesisMulti || { top:{}, bottom:{} };
    const single = selections?.prosthesis || { top:{}, bottom:{} };
    
    function normalize(side,color){
      const arr = Array.isArray(msel[side]?.[color]) ? msel[side][color] : [];
      if (arr.length) return arr;
      const k = single[side]?.[color]; 
      return k ? [k] : [];
    }
    
    function sumRange(units, keys){
      if (!units || !keys.length) return {min:0,max:0};
      const vals = keys.map(k=>{
        const it = findByKey(M.prosthesis, k); 
        return it ? Number(it.price||0) : 0;
      }).filter(x=>x>0).map(p=>p*units);
      if (!vals.length) return {min:0,max:0};
      return { min: Math.min(...vals), max: Math.max(...vals) };
    }
    
    const yTop = sumRange(yl.topUnits,    normalize('top','yellow'));
    const yBot = sumRange(yl.bottomUnits, normalize('bottom','yellow'));
    const wTop = sumRange(wl.topUnits,    normalize('top','white'));
    const wBot = sumRange(wl.bottomUnits, normalize('bottom','white'));
    const vTop = sumRange(vl.topUnits,    normalize('top','violet'));
    const vBot = sumRange(vl.bottomUnits, normalize('bottom','violet'));
    const micro = Number((M.prosthesis_micro && M.prosthesis_micro.price) || 0);
    const gTop = { min: gl.topUnits? micro : 0,  max: gl.topUnits? micro : 0 };
    const gBot = { min: gl.bottomUnits? micro : 0, max: gl.bottomUnits? micro : 0 };

    const removableMin = yTop.min+yBot.min+wTop.min+wBot.min+vTop.min+vBot.min+gTop.min+gBot.min;
    const removableMax = yTop.max+yBot.max+wTop.max+wBot.max+vTop.max+vBot.max+gTop.max+gBot.max;

    DEBUG.log('[USO_CALC] Prosthesis calculation:', { removableMin, removableMax });

    const implCount        = (cnt.violet_exc||0);
    const implCrownsCount  = (cnt.violet_dot||0);
    const implBridgeCount  = (cnt.violet_x||0);
    const abutmentCount    = (cnt.violet_oval||0);

    const implSetSum     = implCount * priceForImplKey('implants', selections.implBrand);

    const crownKeys = Array.isArray(selections.implCrown) ? selections.implCrown : (selections.implCrown ? [selections.implCrown] : []);
    let implCrownsSum = 0;
    const implCrownsBreakdown = [];
    crownKeys.forEach(key=>{
      const price = priceForImplKey('impl_crowns', key);
      const sum = implCrownsCount * price;
      implCrownsBreakdown.push({ key, price, units: implCrownsCount, sum });
      implCrownsSum += sum;
    });

    const implBridgeSum  = implBridgeCount   * priceForImplKey('impl_bridges', selections.implBridge);
    const abutmentSum    = abutmentCount     * priceAbutment();

    DEBUG.log('[USO_CALC] Implants calculation:', { implCount, implCrownsCount, implBridgeCount, abutmentCount, implSetSum, implCrownsSum, implBridgeSum, abutmentSum });

    const result = {
      cnt, baseCore, incWhite, units_mc, units_zr, therapy,
      col,
      prosthesis: {
        removableMin, removableMax,
        breakdown: {
          yellow:{ topUnits:yl.topUnits, bottomUnits:yl.bottomUnits, topSumMin:yTop.min, botSumMin:yBot.min, topSumMax:yTop.max, botSumMax:yBot.max },
          white: { topUnits:wl.topUnits, bottomUnits:wl.bottomUnits, topSumMin:wTop.min, botSumMin:wBot.min, topSumMax:wTop.max, botSumMax:wBot.max },
          violet:{ topUnits:vl.topUnits, bottomUnits:vl.bottomUnits, topSumMin:vTop.min, botSumMin:vBot.min, topSumMax:vTop.max, botSumMax:vBot.max },
          green: { topUnits:gl.topUnits, bottomUnits:gl.bottomUnits, topSumMin:gTop.min, botSumMin:gBot.min, topSumMax:gTop.max, botSumMax:gBot.max }
        }
      },
      implants: {
        implSetSum,
        implCrownsSum,
        implBridgeSum,
        abutmentSum,
        implCrownsBreakdown,
        implBrand: selections.implBrand,
        implCrown: crownKeys,
        implBridge: selections.implBridge
      }
    };

    DEBUG.log('[USO_CALC] Final result:', result);

    return result;
  }

  w.USO_CALC = { compute };
})(window, jQuery);