(function () {
  'use strict';

  /* =====================================================================
   * Roof Pitch Calculator
   * Modes: A = Rise + Run input, B = Angle in degrees
   * Outputs: degrees, X:12 ratio, percentage, slope coefficient,
   *          walkability rating, material suitability, optional surface area
   * ===================================================================== */

  var NS = 'rpc';

  /* ---------- Math helpers ---------- */
  function calcFromRiseRun(rise, run) {
    if (!run || run <= 0) return null;
    var ratio   = rise / run;                          // dimensionless pitch
    var angleDeg = Math.atan(ratio) * (180 / Math.PI);
    var pct      = ratio * 100;
    var xIn12    = ratio * 12;
    var coeff    = Math.sqrt(1 + ratio * ratio);
    return { rise: rise, run: run, angleDeg: angleDeg, pct: pct, xIn12: xIn12, coeff: coeff };
  }

  function calcFromAngle(angleDeg) {
    if (angleDeg < 0 || angleDeg >= 90) return null;
    var ratio  = Math.tan(angleDeg * Math.PI / 180);
    var pct    = ratio * 100;
    var xIn12  = ratio * 12;
    var coeff  = Math.sqrt(1 + ratio * ratio);
    var rise   = xIn12;      // rise per 12 inches of run
    return { rise: rise, run: 12, angleDeg: angleDeg, pct: pct, xIn12: xIn12, coeff: coeff };
  }

  /* ---------- Walkability ---------- */
  function walkability(angleDeg) {
    if (angleDeg < 18.4)  return { label: 'Walkable',  cls: 'rpc-walk-walkable' };
    if (angleDeg < 26.6)  return { label: 'Moderate',  cls: 'rpc-walk-moderate' };
    if (angleDeg < 39.8)  return { label: 'Steep',     cls: 'rpc-walk-steep'    };
    return                       { label: 'Extreme',   cls: 'rpc-walk-extreme'  };
  }

  /* ---------- Material suitability ---------- */
  function materialList(xIn12) {
    var items = [];
    // Flat/low-slope
    if (xIn12 < 2) {
      items.push({ cls: 'rpc-mat-ok',   text: 'TPO / EPDM membrane — suitable (ideal for low-slope)' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Built-up roofing (BUR) — suitable' });
      items.push({ cls: 'rpc-mat-warn', text: 'Modified bitumen — check manufacturer min pitch' });
      items.push({ cls: 'rpc-mat-no',   text: 'Asphalt shingles — NOT suitable (min 2:12 required)' });
      items.push({ cls: 'rpc-mat-no',   text: 'Wood shingles / cedar — NOT suitable (min 3:12)' });
      items.push({ cls: 'rpc-mat-no',   text: 'Slate / tile — NOT suitable (min 4:12)' });
    } else if (xIn12 < 3) {
      items.push({ cls: 'rpc-mat-ok',   text: 'Asphalt shingles — suitable with double underlayment' });
      items.push({ cls: 'rpc-mat-ok',   text: 'TPO / EPDM membrane — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Standing seam metal — suitable (min 1:12)' });
      items.push({ cls: 'rpc-mat-warn', text: 'Ice & water shield — required full deck in cold climates' });
      items.push({ cls: 'rpc-mat-no',   text: 'Wood shingles / cedar — NOT suitable (min 3:12)' });
      items.push({ cls: 'rpc-mat-no',   text: 'Slate / tile — NOT suitable (min 4:12)' });
    } else if (xIn12 < 4) {
      items.push({ cls: 'rpc-mat-ok',   text: 'Asphalt shingles — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Standing seam metal — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Wood shingles / cedar shakes — suitable (at 3:12+)' });
      items.push({ cls: 'rpc-mat-warn', text: 'Ice & water shield — recommended eaves + valleys' });
      items.push({ cls: 'rpc-mat-no',   text: 'Slate / concrete tile — NOT suitable (min 4:12)' });
    } else if (xIn12 < 6) {
      items.push({ cls: 'rpc-mat-ok',   text: 'Asphalt / architectural shingles — ideal range' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Wood shingles / cedar shakes — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Standing seam metal — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Slate / concrete tile — suitable (4:12+)' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Clay / Spanish tile — suitable (4:12+)' });
      items.push({ cls: 'rpc-mat-warn', text: 'Ice & water shield — recommended at eaves' });
    } else {
      items.push({ cls: 'rpc-mat-ok',   text: 'Asphalt / architectural shingles — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Cedar shakes / wood shingles — suitable' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Slate / tile — suitable (good drainage)' });
      items.push({ cls: 'rpc-mat-ok',   text: 'Standing seam metal — suitable' });
      items.push({ cls: 'rpc-mat-warn', text: 'Steeper pitch requires fall protection for installers' });
      if (xIn12 >= 12) {
        items.push({ cls: 'rpc-mat-warn', text: 'Very steep — specialist labor required; expect higher cost' });
      }
    }
    // Ice/water note for cold climates when pitch < 6
    if (xIn12 >= 2 && xIn12 < 6) {
      items.push({ cls: 'rpc-mat-warn', text: 'IRC R905.1.2: Ice/water shield required 24" inside warm wall in climate zones 5+' });
    }
    return items;
  }

  /* ---------- SVG diagram ---------- */
  function drawDiagram(result) {
    var svg = document.getElementById('rpc-svg-diagram');
    if (!svg) return;

    var W = 360, H = 220;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var rise   = result ? result.rise   : 6;
    var run    = result ? result.run    : 12;
    var ratio  = rise / run;

    // Clamp diagram so it fits even at steep angles
    var maxRatio = 1.4;
    var dRatio   = Math.min(ratio, maxRatio);

    var baseX  = 40, baseY = H - 40;
    var runPx  = 200;
    var risePx = Math.min(dRatio * runPx, H - 70);

    var apexX = baseX;
    var apexY = baseY - risePx;
    var rightX = baseX + runPx;
    var rightY = baseY;

    // Clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    function el(tag, attrs) {
      var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    }
    function txt(x, y, content, attrs) {
      var t = el('text', Object.assign({ x: x, y: y, 'font-family': 'Segoe UI,sans-serif', 'font-size': '12', fill: '#333' }, attrs));
      t.textContent = content;
      return t;
    }

    // Background
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#faf5ff', rx: 8 }));

    // Ground line
    svg.appendChild(el('line', { x1: baseX - 10, y1: baseY, x2: rightX + 20, y2: rightY, stroke: '#ccc', 'stroke-width': 2, 'stroke-dasharray': '6,4' }));

    // Rise line (vertical, purple dashed)
    svg.appendChild(el('line', { x1: baseX, y1: apexY, x2: baseX, y2: baseY, stroke: '#7b1fa2', 'stroke-width': 2, 'stroke-dasharray': '6,3' }));

    // Run line (horizontal, grey)
    svg.appendChild(el('line', { x1: baseX, y1: baseY, x2: rightX, y2: rightY, stroke: '#555', 'stroke-width': 2 }));

    // Slope line (roof surface)
    svg.appendChild(el('line', { x1: apexX, y1: apexY, x2: rightX, y2: rightY, stroke: '#4a0072', 'stroke-width': 3 }));

    // Right angle box
    var boxSize = 12;
    svg.appendChild(el('polyline', {
      points: [baseX + ',' + (baseY - boxSize), (baseX + boxSize) + ',' + (baseY - boxSize), (baseX + boxSize) + ',' + baseY].join(' '),
      fill: 'none', stroke: '#999', 'stroke-width': 1.5
    }));

    // Angle arc
    var angleRad = Math.atan(ratio);
    var arcR = 36;
    var arcStartX = rightX - arcR;
    var arcStartY = rightY;
    var arcEndX   = rightX + arcR * (Math.cos(Math.PI - angleRad) - 1) + arcR;
    var arcEndY   = rightY - arcR * Math.sin(Math.PI - angleRad);
    // Simplified: draw arc from right corner
    var a1 = Math.PI;
    var a2 = Math.PI + angleRad;
    var ax1 = rightX + arcR * Math.cos(a1);
    var ay1 = rightY + arcR * Math.sin(a1);
    var ax2 = rightX + arcR * Math.cos(a2);
    var ay2 = rightY + arcR * Math.sin(a2);
    svg.appendChild(el('path', {
      d: 'M ' + ax1 + ' ' + ay1 + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + ax2 + ' ' + ay2,
      fill: 'none', stroke: '#7b1fa2', 'stroke-width': 1.8
    }));

    // Rise arrow heads (small ticks)
    var riseLabel = result ? result.rise.toFixed(1) + '"' : '6"';
    var runLabel  = result ? (result.run >= 12 ? (result.run / 12).toFixed(2) + " ft" : result.run.toFixed(0) + '"') : '12"';
    var angLabel  = result ? result.angleDeg.toFixed(1) + '°' : '';

    // Rise label
    svg.appendChild(txt(baseX - 38, (apexY + baseY) / 2 + 4, 'Rise', { 'font-weight': '700', fill: '#7b1fa2', 'font-size': '11' }));
    svg.appendChild(txt(baseX - 38, (apexY + baseY) / 2 + 16, riseLabel, { fill: '#7b1fa2', 'font-size': '11' }));

    // Run label
    svg.appendChild(txt((baseX + rightX) / 2 - 14, baseY + 22, 'Run ' + runLabel, { fill: '#555', 'font-size': '11' }));

    // Angle label near arc
    svg.appendChild(txt(rightX - 56, rightY - 18, angLabel, { fill: '#7b1fa2', 'font-weight': '700', 'font-size': '13' }));

    // Xin12 label along slope (mid-point)
    var midSX = (apexX + rightX) / 2;
    var midSY = (apexY + rightY) / 2;
    var xIn12Label = result ? result.xIn12.toFixed(1) + ':12' : '';
    var slope_txt = el('text', { x: midSX + 10, y: midSY - 6, 'font-family': 'Segoe UI,sans-serif', 'font-size': '13', fill: '#4a0072', 'font-weight': '700' });
    slope_txt.textContent = xIn12Label;
    svg.appendChild(slope_txt);

    // Coefficient label bottom right
    var coeffLabel = result ? 'Coeff: ' + result.coeff.toFixed(4) : '';
    svg.appendChild(txt(rightX - 80, H - 12, coeffLabel, { fill: '#888', 'font-size': '11' }));
  }

  /* ---------- DOM helpers ---------- */
  function byId(id) { return document.getElementById(id); }
  function val(id)  { var el = byId(id); return el ? el.value.trim() : ''; }
  function setHtml(id, h) { var el = byId(id); if (el) el.innerHTML = h; }
  function setText(id, t) { var el = byId(id); if (el) el.textContent = t; }

  /* ---------- Render results ---------- */
  function renderResults(r) {
    if (!r) return;

    var walk = walkability(r.angleDeg);
    var mats = materialList(r.xIn12);

    // Result cards
    setText('rpc-out-ratio',   r.xIn12.toFixed(2) + ':12');
    setText('rpc-out-degrees', r.angleDeg.toFixed(2) + '°');
    setText('rpc-out-pct',     r.pct.toFixed(1) + '%');
    setText('rpc-out-coeff',   r.coeff.toFixed(4));

    // Walkability badge
    var wEl = byId('rpc-out-walk');
    if (wEl) {
      wEl.textContent = walk.label;
      wEl.className = 'rpc-walkability ' + walk.cls;
    }

    // Materials list
    var matUl = byId('rpc-out-materials');
    if (matUl) {
      matUl.innerHTML = mats.map(function (m) {
        return '<li><span class="rpc-mat-dot ' + m.cls + '"></span><span>' + m.text + '</span></li>';
      }).join('');
    }

    // Draw SVG
    drawDiagram(r);

    // Show results section
    var sec = byId('rpc-results-section');
    if (sec) sec.style.display = '';

    // Re-run area calc if plan area filled in
    updateAreaCalc(r.coeff);
  }

  /* ---------- Area integration ---------- */
  function updateAreaCalc(coeff) {
    var planStr = val('rpc-plan-area');
    var planArea = parseFloat(planStr);
    var areaRes = byId('rpc-area-results');
    if (!areaRes) return;

    if (!planStr || isNaN(planArea) || planArea <= 0) {
      areaRes.classList.remove('rpc-area-show');
      return;
    }

    var surface  = planArea * coeff;
    var squares  = surface / 100;
    var sqWith10 = surface * 1.1 / 100;

    setHtml('rpc-area-plan',    planArea.toFixed(0) + ' sq ft');
    setHtml('rpc-area-coeff',   coeff.toFixed(4));
    setHtml('rpc-area-surface', surface.toFixed(0) + ' sq ft');
    setHtml('rpc-area-squares', squares.toFixed(2) + ' squares');
    setHtml('rpc-area-sq10',    sqWith10.toFixed(2) + ' squares');

    areaRes.classList.add('rpc-area-show');
  }

  /* ---------- Calculate ---------- */
  function calculate() {
    var activeMode = document.querySelector('#roof-pitch-calc-container .rpc-mode-panel.rpc-mode-active');
    if (!activeMode) return;
    var modeId = activeMode.id;

    var result = null;

    if (modeId === 'rpc-mode-a') {
      var riseStr = val('rpc-rise');
      var runStr  = val('rpc-run');
      var rise    = parseFloat(riseStr);
      var run     = parseFloat(runStr);

      if (isNaN(rise) || isNaN(run) || run <= 0) {
        showError('Please enter valid Rise and Run values.');
        return;
      }
      result = calcFromRiseRun(rise, run);

    } else if (modeId === 'rpc-mode-b') {
      var angStr = val('rpc-angle-input');
      var ang    = parseFloat(angStr);

      if (isNaN(ang) || ang < 0 || ang >= 90) {
        showError('Please enter an angle between 0 and 89.9 degrees.');
        return;
      }
      result = calcFromAngle(ang);
    }

    if (!result) {
      showError('Could not calculate — check your inputs.');
      return;
    }

    hideError();
    renderResults(result);

    // Update share URL hash
    var params = 'mode=' + (modeId === 'rpc-mode-a' ? 'a' : 'b');
    if (modeId === 'rpc-mode-a') {
      params += '&rise=' + encodeURIComponent(val('rpc-rise')) + '&run=' + encodeURIComponent(val('rpc-run'));
    } else {
      params += '&angle=' + encodeURIComponent(val('rpc-angle-input'));
    }
    var planArea = val('rpc-plan-area');
    if (planArea) params += '&plan=' + encodeURIComponent(planArea);
    history.replaceState(null, '', '#' + params);
  }

  /* ---------- Errors ---------- */
  function showError(msg) {
    var el = byId('rpc-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
  }
  function hideError() {
    var el = byId('rpc-error');
    if (el) el.style.display = 'none';
  }

  /* ---------- Tab switching ---------- */
  function switchMode(modeId) {
    document.querySelectorAll('#roof-pitch-calc-container .rpc-mode-panel').forEach(function (p) {
      p.classList.remove('rpc-mode-active');
    });
    document.querySelectorAll('#roof-pitch-calc-container .rpc-tab').forEach(function (t) {
      t.classList.remove('rpc-tab-active');
    });
    var panel = byId(modeId);
    if (panel) panel.classList.add('rpc-mode-active');
    var tab = document.querySelector('#roof-pitch-calc-container .rpc-tab[data-mode="' + modeId + '"]');
    if (tab) tab.classList.add('rpc-tab-active');
  }

  /* ---------- Load URL hash ---------- */
  function loadFromHash() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });

    if (params.mode === 'b') {
      switchMode('rpc-mode-b');
      if (params.angle) {
        var el = byId('rpc-angle-input');
        if (el) el.value = params.angle;
      }
    } else {
      switchMode('rpc-mode-a');
      if (params.rise) { var r = byId('rpc-rise'); if (r) r.value = params.rise; }
      if (params.run)  { var rn = byId('rpc-run');  if (rn) rn.value = params.run; }
    }

    if (params.plan) {
      var pa = byId('rpc-plan-area');
      if (pa) pa.value = params.plan;
    }

    if (params.rise || params.angle) {
      calculate();
    }
  }

  /* ---------- Common pitches quick-fill ---------- */
  function quickFill(rise, run) {
    switchMode('rpc-mode-a');
    var riseEl = byId('rpc-rise');
    var runEl  = byId('rpc-run');
    if (riseEl) riseEl.value = rise;
    if (runEl)  runEl.value  = run;
    calculate();
  }

  /* ---------- Init ---------- */
  function init() {
    var container = document.getElementById('roof-pitch-calc-container');
    if (!container) return;

    // Build HTML
    container.innerHTML = [
      '<div class="rpc-header">',
      '  <h3>Roof Pitch Calculator</h3>',
      '  <p>Convert rise/run to degrees, percentage, and slope coefficient instantly</p>',
      '</div>',

      '<div class="rpc-tabs">',
      '  <button class="rpc-tab rpc-tab-active" data-mode="rpc-mode-a" onclick="(function(){',
      '    document.querySelectorAll(\'#roof-pitch-calc-container .rpc-mode-panel\').forEach(function(p){p.classList.remove(\'rpc-mode-active\');});',
      '    document.querySelectorAll(\'#roof-pitch-calc-container .rpc-tab\').forEach(function(t){t.classList.remove(\'rpc-tab-active\');});',
      '    document.getElementById(\'rpc-mode-a\').classList.add(\'rpc-mode-active\');',
      '    this.classList.add(\'rpc-tab-active\');',
      '  }).call(this)">Mode A: Rise &amp; Run</button>',
      '  <button class="rpc-tab" data-mode="rpc-mode-b" onclick="(function(){',
      '    document.querySelectorAll(\'#roof-pitch-calc-container .rpc-mode-panel\').forEach(function(p){p.classList.remove(\'rpc-mode-active\');});',
      '    document.querySelectorAll(\'#roof-pitch-calc-container .rpc-tab\').forEach(function(t){t.classList.remove(\'rpc-tab-active\');});',
      '    document.getElementById(\'rpc-mode-b\').classList.add(\'rpc-mode-active\');',
      '    this.classList.add(\'rpc-tab-active\');',
      '  }).call(this)">Mode B: Known Angle</button>',
      '</div>',

      '<div class="rpc-body">',
      '  <div class="rpc-grid">',

      '    <!-- LEFT COLUMN: inputs -->',
      '    <div class="rpc-col-left">',

      '      <!-- Mode A: Rise / Run -->',
      '      <div id="rpc-mode-a" class="rpc-mode-panel rpc-mode-active">',
      '        <div class="rpc-card">',
      '          <h4>Enter Rise &amp; Run</h4>',
      '          <div class="rpc-field">',
      '            <label for="rpc-rise">Rise <span class="rpc-unit">(inches vertical)</span></label>',
      '            <input id="rpc-rise" class="rpc-input" type="number" min="0" max="999" step="0.25" placeholder="e.g. 6" />',
      '          </div>',
      '          <div class="rpc-field">',
      '            <label for="rpc-run">Run <span class="rpc-unit">(inches horizontal — use 12 for X:12 ratio)</span></label>',
      '            <input id="rpc-run" class="rpc-input" type="number" min="0.1" max="9999" step="0.25" placeholder="e.g. 12" value="12" />',
      '          </div>',
      '          <p style="font-size:0.8rem;color:#888;margin:0 0 14px 0;">Standard X:12 pitch: enter rise in first box, leave run as 12. Or enter actual rise/run in any unit.</p>',
      '          <button class="rpc-btn-calc" onclick="roofPitchCalc.calculate()">Calculate Pitch</button>',
      '        </div>',
      '      </div>',

      '      <!-- Mode B: Known angle -->',
      '      <div id="rpc-mode-b" class="rpc-mode-panel">',
      '        <div class="rpc-card">',
      '          <h4>Enter Angle in Degrees</h4>',
      '          <div class="rpc-field">',
      '            <label for="rpc-angle-input">Roof Angle <span class="rpc-unit">(degrees, 0 to 89.9)</span></label>',
      '            <input id="rpc-angle-input" class="rpc-input" type="number" min="0" max="89.9" step="0.1" placeholder="e.g. 26.57" />',
      '          </div>',
      '          <p style="font-size:0.8rem;color:#888;margin:0 0 14px 0;">A 6:12 pitch is 26.57 degrees. A 4:12 pitch is 18.43 degrees.</p>',
      '          <button class="rpc-btn-calc" onclick="roofPitchCalc.calculate()">Calculate Pitch</button>',
      '        </div>',
      '      </div>',

      '      <!-- Optional area integration -->',
      '      <div class="rpc-card">',
      '        <h4>Roof Area (optional)</h4>',
      '        <p style="font-size:0.85rem;color:#666;margin:0 0 12px 0;">Enter your plan-view (horizontal footprint) area and we will apply the slope coefficient to calculate actual surface area and shingle squares.</p>',
      '        <div class="rpc-field">',
      '          <label for="rpc-plan-area">Plan Area <span class="rpc-unit">(sq ft)</span></label>',
      '          <input id="rpc-plan-area" class="rpc-input" type="number" min="1" step="1" placeholder="e.g. 2000" oninput="roofPitchCalc.onPlanAreaChange()" />',
      '        </div>',
      '        <div id="rpc-area-results" class="rpc-area-results">',
      '          <div class="rpc-area-stat"><span>Plan area (footprint)</span><span id="rpc-area-plan" class="rpc-area-stat-val">-</span></div>',
      '          <div class="rpc-area-stat"><span>Slope coefficient</span><span id="rpc-area-coeff" class="rpc-area-stat-val">-</span></div>',
      '          <div class="rpc-area-stat"><span>Actual surface area</span><span id="rpc-area-surface" class="rpc-area-stat-val">-</span></div>',
      '          <div class="rpc-area-stat"><span>Roofing squares</span><span id="rpc-area-squares" class="rpc-area-stat-val">-</span></div>',
      '          <div class="rpc-area-stat"><span>With 10% waste</span><span id="rpc-area-sq10" class="rpc-area-stat-val">-</span></div>',
      '        </div>',
      '        <p style="font-size:0.78rem;color:#aaa;margin:10px 0 0 0;">For satellite-measured plan area, use our <a href="https://mapscaping.com/free-interactive-roof-area-calculator/" style="color:#7b1fa2;">Roof Area Calculator</a>.</p>',
      '      </div>',

      '      <!-- Quick fill common pitches -->',
      '      <div class="rpc-card">',
      '        <h4>Common Pitches</h4>',
      '        <div class="rpc-table-wrap">',
      '          <table class="rpc-table">',
      '            <thead><tr><th>Pitch</th><th>Degrees</th><th>Coeff</th><th></th></tr></thead>',
      '            <tbody>',
      '              <tr><td>2:12</td><td>9.5&#176;</td><td>1.014</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(2,12)">Try</button></td></tr>',
      '              <tr><td>3:12</td><td>14.0&#176;</td><td>1.031</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(3,12)">Try</button></td></tr>',
      '              <tr><td>4:12</td><td>18.4&#176;</td><td>1.054</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(4,12)">Try</button></td></tr>',
      '              <tr class="rpc-table-highlight"><td>6:12</td><td>26.6&#176;</td><td>1.118</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(6,12)">Try</button></td></tr>',
      '              <tr><td>8:12</td><td>33.7&#176;</td><td>1.202</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(8,12)">Try</button></td></tr>',
      '              <tr><td>10:12</td><td>39.8&#176;</td><td>1.302</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(10,12)">Try</button></td></tr>',
      '              <tr><td>12:12</td><td>45.0&#176;</td><td>1.414</td><td><button style="padding:3px 8px;background:#7b1fa2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="roofPitchCalc.quickFill(12,12)">Try</button></td></tr>',
      '            </tbody>',
      '          </table>',
      '        </div>',
      '      </div>',

      '    </div>', // end left col

      '    <!-- RIGHT COLUMN: diagram + results -->',
      '    <div class="rpc-col-right">',

      '      <!-- SVG Diagram -->',
      '      <div class="rpc-diagram-wrap">',
      '        <h4>Pitch Diagram</h4>',
      '        <svg id="rpc-svg-diagram" viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg"></svg>',
      '      </div>',

      '      <!-- Error -->',
      '      <div id="rpc-error" style="display:none;background:#fce4ec;border:1px solid #ef9a9a;border-radius:8px;padding:12px 16px;color:#b71c1c;font-size:0.9rem;"></div>',

      '      <!-- Results section -->',
      '      <div id="rpc-results-section" style="display:none;">',
      '        <div class="rpc-card">',
      '          <h4>Calculation Results</h4>',
      '          <div class="rpc-results-grid">',
      '            <div class="rpc-result-card">',
      '              <div class="rpc-result-value" id="rpc-out-ratio">-</div>',
      '              <div class="rpc-result-label">X:12 Ratio</div>',
      '            </div>',
      '            <div class="rpc-result-card">',
      '              <div class="rpc-result-value" id="rpc-out-degrees">-</div>',
      '              <div class="rpc-result-label">Angle (degrees)</div>',
      '            </div>',
      '            <div class="rpc-result-card">',
      '              <div class="rpc-result-value" id="rpc-out-pct">-</div>',
      '              <div class="rpc-result-label">Slope (%)</div>',
      '            </div>',
      '            <div class="rpc-result-card">',
      '              <div class="rpc-result-value" id="rpc-out-coeff">-</div>',
      '              <div class="rpc-result-label">Slope Coefficient</div>',
      '            </div>',
      '            <div class="rpc-result-card" style="grid-column:span 2;">',
      '              <div style="margin-bottom:6px;font-size:0.8rem;color:#666;font-weight:500;">Walkability</div>',
      '              <span id="rpc-out-walk" class="rpc-walkability rpc-walk-walkable">-</span>',
      '            </div>',
      '          </div>',
      '        </div>',

      '        <!-- Materials -->',
      '        <div class="rpc-card">',
      '          <h4>Material Suitability</h4>',
      '          <ul id="rpc-out-materials" class="rpc-materials-list"></ul>',
      '        </div>',

      '      </div>', // end results section

      '    </div>', // end right col

      '  </div>', // end grid
      '</div>'    // end body

    ].join('\n');

    // Draw empty diagram on load
    drawDiagram(null);

    // Load from hash if present
    loadFromHash();

    // Enter key triggers calculate on inputs
    ['rpc-rise','rpc-run','rpc-angle-input','rpc-plan-area'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') calculate();
        });
      }
    });
  }

  /* ---------- Public API ---------- */
  window.roofPitchCalc = {
    calculate:       calculate,
    quickFill:       quickFill,
    onPlanAreaChange: function () {
      // re-run area calc with last known coefficient
      var coeff = parseFloat((byId('rpc-out-coeff') || {}).textContent);
      if (!isNaN(coeff) && coeff > 0) updateAreaCalc(coeff);
    }
  };

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
