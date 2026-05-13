(function () {
  'use strict';

  var CONFIG = {
    mapId: 'concrete-calculator-map',
    containerId: 'concrete-calculator-container',
    initialView: [39.8283, -98.5795],
    initialZoom: 4,
    geocodeUrl: 'https://nominatim.openstreetmap.org/search',
    defaultThickness: 4,
    defaultWaste: 10,
    defaultReadyMixCost: 150,
    defaultBagCost60: 5,
    defaultBagCost80: 8,
    defaultLaborCost: 4,
    defaultPumpCost: 800
  };

  var ccMap = null;
  var ccDrawnItems = null;
  var ccUnits = 'imperial';
  var ccTotalAreaSqFt = 0;

  var THICKNESS_PRESETS = {
    patio:      { label: 'Patio',          in: 4 },
    sidewalk:   { label: 'Sidewalk',       in: 4 },
    driveway:   { label: 'Driveway',       in: 4.5 },
    garage:     { label: 'Garage Floor',   in: 5 },
    foundation: { label: 'Foundation Slab',in: 6 },
    shed:       { label: 'Shed Pad',       in: 4 },
    poolDeck:   { label: 'Pool Deck',      in: 4 }
  };

  function init() {
    var container = document.getElementById(CONFIG.containerId);
    if (!container) return;

    buildUI(container);
    initMap();
    bindEvents();
    updateCalculations();
    restoreFromHash();
  }

  function buildUI(container) {
    container.innerHTML =
      '<div id="cc-toolbar">' +
        '<div class="cc-search-row">' +
          '<input type="text" id="cc-address" placeholder="Enter an address to navigate the map..." />' +
          '<button type="button" id="cc-search-btn">Search</button>' +
        '</div>' +
        '<div class="cc-units-row">' +
          '<label class="cc-radio-label"><input type="radio" name="cc-units" value="imperial" checked /> Imperial (ft, sq ft)</label>' +
          '<label class="cc-radio-label"><input type="radio" name="cc-units" value="metric" /> Metric (m, sq m)</label>' +
        '</div>' +
      '</div>' +
      '<div id="cc-map-wrap">' +
        '<div id="' + CONFIG.mapId + '"></div>' +
      '</div>' +
      '<div id="cc-panels">' +

        '<div class="cc-panel" id="cc-panel-area">' +
          '<div class="cc-panel-title">Measured Area</div>' +
          '<div class="cc-panel-body">' +
            '<div class="cc-stat-row"><span class="cc-stat-label">Total Area</span><span class="cc-stat-value" id="cc-area-display">0 sq ft</span></div>' +
            '<div class="cc-stat-row"><span class="cc-stat-label">Total Area (sq yd)</span><span class="cc-stat-value" id="cc-area-sqyd">0 sq yd</span></div>' +
            '<p class="cc-hint">Draw your slab shape on the satellite map using the polygon or rectangle tool on the left side of the map.</p>' +
          '</div>' +
        '</div>' +

        '<div class="cc-panel" id="cc-panel-specs">' +
          '<div class="cc-panel-title">Slab Specifications</div>' +
          '<div class="cc-panel-body">' +
            '<div class="cc-field-row">' +
              '<label for="cc-preset">Project Type</label>' +
              '<select id="cc-preset">' +
                '<option value="">-- Select a preset --</option>' +
                '<option value="patio">Patio (4 in)</option>' +
                '<option value="sidewalk">Sidewalk (4 in)</option>' +
                '<option value="driveway">Driveway (4.5 in)</option>' +
                '<option value="garage">Garage Floor (5 in)</option>' +
                '<option value="foundation">Foundation Slab (6 in)</option>' +
                '<option value="shed">Shed Pad (4 in)</option>' +
                '<option value="poolDeck">Pool Deck (4 in)</option>' +
              '</select>' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label for="cc-thickness">Thickness (inches)</label>' +
              '<input type="number" id="cc-thickness" value="4" min="1" max="24" step="0.5" />' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label for="cc-waste">Waste Factor (%)</label>' +
              '<input type="number" id="cc-waste" value="10" min="0" max="30" step="1" />' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label for="cc-mix">Concrete Mix</label>' +
              '<select id="cc-mix">' +
                '<option value="standard">Standard (3000 psi) — General use</option>' +
                '<option value="highstrength">High-Strength (4000 psi) — Driveways, heavy loads</option>' +
                '<option value="fiber">Fiber-Reinforced — Crack resistance</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cc-panel" id="cc-panel-rebar">' +
          '<div class="cc-panel-title">Rebar Estimator (Optional)</div>' +
          '<div class="cc-panel-body">' +
            '<div class="cc-field-row">' +
              '<label for="cc-rebar-enable"><input type="checkbox" id="cc-rebar-enable" /> Include rebar grid</label>' +
            '</div>' +
            '<div id="cc-rebar-fields" class="cc-hidden">' +
              '<div class="cc-field-row">' +
                '<label for="cc-rebar-spacing">Grid Spacing (inches)</label>' +
                '<select id="cc-rebar-spacing">' +
                  '<option value="12">12 in on center</option>' +
                  '<option value="16" selected>16 in on center</option>' +
                  '<option value="18">18 in on center</option>' +
                  '<option value="24">24 in on center</option>' +
                '</select>' +
              '</div>' +
              '<div class="cc-stat-row"><span class="cc-stat-label">Rebar Linear Feet</span><span class="cc-stat-value" id="cc-rebar-lf">0 lf</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cc-panel" id="cc-panel-volume">' +
          '<div class="cc-panel-title">Concrete Volume</div>' +
          '<div class="cc-panel-body">' +
            '<div class="cc-stat-row cc-stat-primary"><span class="cc-stat-label">Cubic Yards</span><span class="cc-stat-value" id="cc-cuyd">0.00 cu yd</span></div>' +
            '<div class="cc-stat-row"><span class="cc-stat-label">Cubic Feet</span><span class="cc-stat-value" id="cc-cuft">0.00 cu ft</span></div>' +
            '<div class="cc-stat-row"><span class="cc-stat-label">60-lb Bags Needed</span><span class="cc-stat-value" id="cc-bags60">0 bags</span></div>' +
            '<div class="cc-stat-row"><span class="cc-stat-label">80-lb Bags Needed</span><span class="cc-stat-value" id="cc-bags80">0 bags</span></div>' +
            '<div class="cc-stat-row"><span class="cc-stat-label">Ready-Mix Truck Loads</span><span class="cc-stat-value" id="cc-trucks">0 loads</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="cc-panel" id="cc-panel-cost">' +
          '<div class="cc-panel-title">Cost Estimate</div>' +
          '<div class="cc-panel-body">' +
            '<div class="cc-field-row">' +
              '<label for="cc-cost-readymix">Ready-Mix Price ($/cu yd)</label>' +
              '<input type="number" id="cc-cost-readymix" value="150" min="0" step="5" />' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label for="cc-cost-bag60">60-lb Bag Price ($/bag)</label>' +
              '<input type="number" id="cc-cost-bag60" value="5" min="0" step="0.25" />' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label for="cc-cost-bag80">80-lb Bag Price ($/bag)</label>' +
              '<input type="number" id="cc-cost-bag80" value="8" min="0" step="0.25" />' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label for="cc-cost-labor">Labor ($/sq ft)</label>' +
              '<input type="number" id="cc-cost-labor" value="4" min="0" step="0.25" />' +
            '</div>' +
            '<div class="cc-field-row">' +
              '<label><input type="checkbox" id="cc-pump-enable" /> Include pump truck</label>' +
            '</div>' +
            '<div id="cc-pump-field" class="cc-hidden">' +
              '<div class="cc-field-row">' +
                '<label for="cc-cost-pump">Pump Truck ($/day)</label>' +
                '<input type="number" id="cc-cost-pump" value="800" min="0" step="50" />' +
              '</div>' +
            '</div>' +
            '<div class="cc-cost-breakdown">' +
              '<div class="cc-stat-row"><span class="cc-stat-label">Ready-Mix Material</span><span class="cc-stat-value" id="cc-cost-readymix-total">$0</span></div>' +
              '<div class="cc-stat-row"><span class="cc-stat-label">60-lb Bags Total</span><span class="cc-stat-value" id="cc-cost-bags60-total">$0</span></div>' +
              '<div class="cc-stat-row"><span class="cc-stat-label">80-lb Bags Total</span><span class="cc-stat-value" id="cc-cost-bags80-total">$0</span></div>' +
              '<div class="cc-stat-row"><span class="cc-stat-label">Labor</span><span class="cc-stat-value" id="cc-cost-labor-total">$0</span></div>' +
              '<div class="cc-stat-row"><span class="cc-stat-label">Pump Truck</span><span class="cc-stat-value" id="cc-cost-pump-total">$0</span></div>' +
              '<div class="cc-stat-row cc-stat-primary"><span class="cc-stat-label">Total (Ready-Mix + Labor)</span><span class="cc-stat-value" id="cc-cost-grand-total">$0</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cc-panel" id="cc-panel-export">' +
          '<div class="cc-panel-title">Export &amp; Share</div>' +
          '<div class="cc-panel-body cc-export-row">' +
            '<button type="button" id="cc-export-geojson">Export GeoJSON</button>' +
            '<button type="button" id="cc-copy-link">Copy Share Link</button>' +
            '<button type="button" id="cc-print">Print / Save PDF</button>' +
          '</div>' +
        '</div>' +

      '</div>';
  }

  function initMap() {
    ccMap = L.map(CONFIG.mapId, {
      center: CONFIG.initialView,
      zoom: CONFIG.initialZoom
    });

    var satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 21 }
    );

    var street = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
    );

    satellite.addTo(ccMap);
    L.control.layers({ 'Satellite': satellite, 'Street Map': street }, {}, { position: 'topright' }).addTo(ccMap);

    ccDrawnItems = new L.FeatureGroup();
    ccMap.addLayer(ccDrawnItems);

    var drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          shapeOptions: { color: '#FF8C00', fillColor: '#FF8C00', fillOpacity: 0.3, weight: 2 },
          showArea: true
        },
        rectangle: {
          shapeOptions: { color: '#FF8C00', fillColor: '#FF8C00', fillOpacity: 0.3, weight: 2 }
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false
      },
      edit: {
        featureGroup: ccDrawnItems,
        remove: true
      }
    });
    ccMap.addControl(drawControl);

    ccMap.on(L.Draw.Event.CREATED, function (e) {
      var layer = e.layer;
      addAreaLabel(layer);
      ccDrawnItems.addLayer(layer);
      recalcArea();
    });

    ccMap.on(L.Draw.Event.EDITED, function () {
      ccDrawnItems.eachLayer(function (layer) {
        addAreaLabel(layer);
      });
      recalcArea();
    });

    ccMap.on(L.Draw.Event.DELETED, function () {
      recalcArea();
    });
  }

  function addAreaLabel(layer) {
    if (layer.getLatLngs) {
      var areaSqM = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
      var areaSqFt = areaSqM * 10.7639;
      var label = ccUnits === 'imperial'
        ? formatNum(areaSqFt, 0) + ' sq ft'
        : formatNum(areaSqM, 0) + ' sq m';
      layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'cc-area-tooltip' });
    }
  }

  function recalcArea() {
    var totalSqM = 0;
    ccDrawnItems.eachLayer(function (layer) {
      if (layer.getLatLngs) {
        totalSqM += L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
      }
    });
    ccTotalAreaSqFt = totalSqM * 10.7639;
    updateCalculations();
  }

  function bindEvents() {
    document.getElementById('cc-search-btn').addEventListener('click', doSearch);
    document.getElementById('cc-address').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });

    document.querySelectorAll('input[name="cc-units"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        ccUnits = this.value;
        refreshAreaLabels();
        updateCalculations();
      });
    });

    document.getElementById('cc-preset').addEventListener('change', function () {
      var key = this.value;
      if (key && THICKNESS_PRESETS[key]) {
        document.getElementById('cc-thickness').value = THICKNESS_PRESETS[key].in;
        updateCalculations();
      }
    });

    ['cc-thickness', 'cc-waste', 'cc-mix',
     'cc-rebar-spacing', 'cc-cost-readymix', 'cc-cost-bag60',
     'cc-cost-bag80', 'cc-cost-labor', 'cc-cost-pump'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', updateCalculations);
    });

    document.getElementById('cc-rebar-enable').addEventListener('change', function () {
      var fields = document.getElementById('cc-rebar-fields');
      if (this.checked) {
        fields.classList.remove('cc-hidden');
      } else {
        fields.classList.add('cc-hidden');
      }
      updateCalculations();
    });

    document.getElementById('cc-pump-enable').addEventListener('change', function () {
      var field = document.getElementById('cc-pump-field');
      if (this.checked) {
        field.classList.remove('cc-hidden');
      } else {
        field.classList.add('cc-hidden');
      }
      updateCalculations();
    });

    document.getElementById('cc-export-geojson').addEventListener('click', exportGeoJSON);
    document.getElementById('cc-copy-link').addEventListener('click', copyShareLink);
    document.getElementById('cc-print').addEventListener('click', function () { window.print(); });
  }

  function updateCalculations() {
    var areaSqFt = ccTotalAreaSqFt;
    var areaSqM  = areaSqFt / 10.7639;
    var areaSqYd = areaSqFt / 9;

    var thicknessIn = parseFloat(getValue('cc-thickness')) || 4;
    var wastePct    = parseFloat(getValue('cc-waste')) || 10;
    var wasteMult   = 1 + wastePct / 100;

    var cuFt  = areaSqFt * (thicknessIn / 12) * wasteMult;
    var cuYd  = areaSqFt * thicknessIn / 324 * wasteMult;
    var bags60 = Math.ceil(cuFt / 0.45);
    var bags80 = Math.ceil(cuFt / 0.60);
    var trucks  = cuYd / 10;

    if (ccUnits === 'imperial') {
      setText('cc-area-display', formatNum(areaSqFt, 1) + ' sq ft');
      setText('cc-area-sqyd', formatNum(areaSqYd, 1) + ' sq yd');
    } else {
      setText('cc-area-display', formatNum(areaSqM, 1) + ' sq m');
      setText('cc-area-sqyd', formatNum(areaSqYd, 1) + ' sq yd');
    }

    setText('cc-cuyd', formatNum(cuYd, 2) + ' cu yd');
    setText('cc-cuft', formatNum(cuFt, 2) + ' cu ft');
    setText('cc-bags60', formatNum(bags60, 0) + ' bags');
    setText('cc-bags80', formatNum(bags80, 0) + ' bags');
    setText('cc-trucks', formatNum(trucks, 2) + ' loads');

    var rebarEnabled = document.getElementById('cc-rebar-enable').checked;
    if (rebarEnabled) {
      var spacingIn = parseFloat(getValue('cc-rebar-spacing')) || 16;
      var spacingFt = spacingIn / 12;
      var sqrtArea  = Math.sqrt(areaSqFt);
      var rows      = Math.ceil(sqrtArea / spacingFt) + 1;
      var rebarLf   = rows * sqrtArea * 2;
      setText('cc-rebar-lf', formatNum(rebarLf, 0) + ' lf');
    }

    var priceReadyMix = parseFloat(getValue('cc-cost-readymix')) || 150;
    var priceBag60    = parseFloat(getValue('cc-cost-bag60')) || 5;
    var priceBag80    = parseFloat(getValue('cc-cost-bag80')) || 8;
    var priceLabor    = parseFloat(getValue('cc-cost-labor')) || 4;
    var pumpEnabled   = document.getElementById('cc-pump-enable').checked;
    var pricePump     = pumpEnabled ? (parseFloat(getValue('cc-cost-pump')) || 800) : 0;

    var costReadyMix = cuYd * priceReadyMix;
    var costBags60   = bags60 * priceBag60;
    var costBags80   = bags80 * priceBag80;
    var costLabor    = areaSqFt * priceLabor;
    var costGrand    = costReadyMix + costLabor + pricePump;

    setText('cc-cost-readymix-total', '$' + formatNum(costReadyMix, 0));
    setText('cc-cost-bags60-total',   '$' + formatNum(costBags60, 0));
    setText('cc-cost-bags80-total',   '$' + formatNum(costBags80, 0));
    setText('cc-cost-labor-total',    '$' + formatNum(costLabor, 0));
    setText('cc-cost-pump-total',     pumpEnabled ? '$' + formatNum(pricePump, 0) : '--');
    setText('cc-cost-grand-total',    '$' + formatNum(costGrand, 0));

    saveToHash();
  }

  function refreshAreaLabels() {
    ccDrawnItems.eachLayer(function (layer) {
      if (layer.getLatLngs) {
        layer.closeTooltip();
        addAreaLabel(layer);
      }
    });
  }

  function doSearch() {
    var address = document.getElementById('cc-address').value.trim();
    if (!address) return;
    var url = CONFIG.geocodeUrl + '?format=json&q=' + encodeURIComponent(address) + '&limit=1';
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.length) { alert('Address not found. Try a different search.'); return; }
        var lat = parseFloat(data[0].lat);
        var lon = parseFloat(data[0].lon);
        ccMap.setView([lat, lon], 19);
      })
      .catch(function () { alert('Geocoding failed. Please try again.'); });
  }

  function exportGeoJSON() {
    var features = [];
    ccDrawnItems.eachLayer(function (layer) {
      if (layer.toGeoJSON) features.push(layer.toGeoJSON());
    });
    var geojson = JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2);
    triggerDownload(new Blob([geojson], { type: 'application/json' }), 'concrete-plan.geojson');
  }

  function copyShareLink() {
    var url = window.location.href.split('#')[0] + buildHash();
    navigator.clipboard.writeText(url).then(function () {
      var btn = document.getElementById('cc-copy-link');
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy Share Link'; }, 2000);
    });
  }

  function buildHash() {
    var params = {
      thickness: getValue('cc-thickness'),
      waste: getValue('cc-waste'),
      mix: getValue('cc-mix'),
      units: ccUnits
    };
    return '#' + Object.keys(params).map(function (k) {
      return k + '=' + encodeURIComponent(params[k]);
    }).join('&');
  }

  function saveToHash() {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', buildHash());
    }
  }

  function restoreFromHash() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    if (params.thickness) { var el = document.getElementById('cc-thickness'); if (el) el.value = params.thickness; }
    if (params.waste)     { var el2 = document.getElementById('cc-waste');     if (el2) el2.value = params.waste; }
    if (params.mix)       { var el3 = document.getElementById('cc-mix');       if (el3) el3.value = params.mix; }
    if (params.units) {
      ccUnits = params.units;
      var radio = document.querySelector('input[name="cc-units"][value="' + params.units + '"]');
      if (radio) radio.checked = true;
    }
    updateCalculations();
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a   = document.createElement('a');
    a.href  = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function formatNum(n, decimals) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
