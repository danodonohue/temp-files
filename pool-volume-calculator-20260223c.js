(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  var CONFIG = {
    containerId: 'pool-volume-calculator-container',
    mapId:       'pool-volume-calculator-map',
    defaultCenter: [39.5, -98.35],
    defaultZoom: 6,
    minDrawZoom: 15,
    poolColor: '#00b4d8',
    gallonsPerCubicFoot: 7.48052,
    litresPerGallon: 3.78541,
    sqFtPerSqM: 10.7639,
    ftPerM: 3.28084,
    litresPerCubicM: 1000,
  };

  // ─── State ────────────────────────────────────────────────────────────────────
  var map, drawnItems, drawPolygon, drawRect;
  var currentPolygon = null;
  var shallowDepthM  = 1.07;   // ~3.5 ft
  var deepDepthM     = 1.83;   // ~6.0 ft
  var units          = 'imperial';
  var drawingMode    = null;

  // ─── Build UI ─────────────────────────────────────────────────────────────────
  function buildUI() {
    var container = document.getElementById(CONFIG.containerId);
    if (!container) return;

    container.innerHTML = [
      '<div class="pvc-toolbar">',
        '<button class="pvc-btn pvc-btn-draw">\u270f Draw Pool (Freeform)</button>',
        '<button class="pvc-btn pvc-btn-rect">\u2b1c Draw Pool (Rectangle)</button>',
        '<button class="pvc-btn pvc-btn-clear">\u2715 Clear</button>',
        '<button class="pvc-btn pvc-btn-units" id="pvc-unit-toggle">\ud83c\uddfa\ud83c\uddf8 Imperial (ft / gal)</button>',
        '<span class="pvc-hint">Navigate to your pool on the satellite map, then click Draw to outline it</span>',
      '</div>',
      '<div class="pvc-drawing-banner"></div>',
      '<div id="' + CONFIG.mapId + '"></div>',
      '<div class="pvc-results">',
        '<div class="pvc-results-placeholder">Draw your pool outline on the map above to calculate its volume</div>',
        '<div class="pvc-results-grid">',
          '<div class="pvc-result-card">',
            '<div class="pvc-result-label">Pool Area</div>',
            '<div class="pvc-result-value" id="pvc-area-value">\u2014</div>',
            '<div class="pvc-result-sub" id="pvc-area-sub"></div>',
          '</div>',
          '<div class="pvc-depth-card">',
            '<div class="pvc-result-label">Pool Depth</div>',
            '<div class="pvc-depth-row">',
              '<div class="pvc-depth-field">',
                '<label for="pvc-shallow-depth" id="pvc-shallow-label">Shallow end (ft)</label>',
                '<input type="number" id="pvc-shallow-depth" class="pvc-depth-input" min="0.1" max="20" step="0.5" value="3.5" />',
              '</div>',
              '<div class="pvc-depth-field">',
                '<label for="pvc-deep-depth" id="pvc-deep-label">Deep end (ft)</label>',
                '<input type="number" id="pvc-deep-depth" class="pvc-depth-input" min="0.1" max="20" step="0.5" value="6.0" />',
              '</div>',
            '</div>',
          '</div>',
          '<div class="pvc-result-card">',
            '<div class="pvc-result-label">Avg Depth</div>',
            '<div class="pvc-result-value" id="pvc-avgdepth-value">\u2014</div>',
            '<div class="pvc-result-sub" id="pvc-avgdepth-sub"></div>',
          '</div>',
          '<div class="pvc-result-card">',
            '<div class="pvc-result-label" id="pvc-vol-label">Volume (US Gallons)</div>',
            '<div class="pvc-result-value" id="pvc-gallons-value">\u2014</div>',
            '<div class="pvc-result-sub" id="pvc-gallons-sub"></div>',
          '</div>',
        '</div>',
        '<button class="pvc-btn-share" style="display:none;" id="pvc-share-btn">\ud83d\udd17 Share</button>',
      '</div>',
    ].join('');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function fmt(n, decimals) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0,
    });
  }
  function el(id) { return document.getElementById(id); }
  function toFt(m) { return m * CONFIG.ftPerM; }
  function toM(ft) { return ft / CONFIG.ftPerM; }

  // ─── Map Init ────────────────────────────────────────────────────────────────
  function initMap() {
    map = L.map(CONFIG.mapId, {
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
    });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
        maxZoom: 20,
      }
    ).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawPolygon = new L.Draw.Polygon(map, {
      shapeOptions: { color: CONFIG.poolColor, fillColor: CONFIG.poolColor, fillOpacity: 0.25, weight: 2 },
      allowIntersection: false,
    });

    drawRect = new L.Draw.Rectangle(map, {
      shapeOptions: { color: CONFIG.poolColor, fillColor: CONFIG.poolColor, fillOpacity: 0.25, weight: 2 },
    });

    map.on(L.Draw.Event.CREATED, onDrawCreated);

    L.Control.geocoder({
      defaultMarkGeocode: false,
      placeholder: 'Search address\u2026',
      errorMessage: 'Address not found',
      geocoder: L.Control.Geocoder.nominatim(),
    }).on('markgeocode', function (e) {
      map.fitBounds(e.geocode.bbox);
    }).addTo(map);
  }

  // ─── Draw Events ─────────────────────────────────────────────────────────────
  function onDrawCreated(e) {
    stopDrawingMode();
    drawnItems.clearLayers();
    currentPolygon = e.layer;
    drawnItems.addLayer(currentPolygon);
    calculate();
  }

  function startDrawingMode(mode) {
    if (drawingMode === mode) { stopDrawingMode(); return; }
    stopDrawingMode();
    drawingMode = mode;
    var btnDraw = document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-draw');
    var btnRect = document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-rect');
    var banner  = document.querySelector('#' + CONFIG.containerId + ' .pvc-drawing-banner');
    if (mode === 'polygon') {
      drawPolygon.enable();
      btnDraw.classList.add('active');
      btnDraw.textContent = '\u2715 Cancel';
      banner.textContent = 'Click to place points around your pool outline. Double-click to finish.';
    } else {
      drawRect.enable();
      btnRect.classList.add('active');
      btnRect.textContent = '\u2715 Cancel';
      banner.textContent = 'Click and drag to draw a rectangle around your pool.';
    }
    banner.classList.add('visible');
    if (map.getZoom() < CONFIG.minDrawZoom) map.setZoom(CONFIG.minDrawZoom);
  }

  function stopDrawingMode() {
    if (!drawingMode) return;
    drawPolygon.disable();
    drawRect.disable();
    drawingMode = null;
    var btnDraw = document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-draw');
    var btnRect = document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-rect');
    var banner  = document.querySelector('#' + CONFIG.containerId + ' .pvc-drawing-banner');
    btnDraw.classList.remove('active');
    btnDraw.textContent = '\u270f Draw Pool (Freeform)';
    btnRect.classList.remove('active');
    btnRect.textContent = '\u2b1c Draw Pool (Rectangle)';
    banner.classList.remove('visible');
  }

  // ─── Units ────────────────────────────────────────────────────────────────────
  function setUnits(newUnits) {
    units = newUnits;
    var btn = el('pvc-unit-toggle');
    if (units === 'metric') {
      btn.textContent = '\ud83c\udf0d Metric (m / L)';
      btn.classList.add('metric');
    } else {
      btn.textContent = '\ud83c\uddfa\ud83c\uddf8 Imperial (ft / gal)';
      btn.classList.remove('metric');
    }
    syncDepthInputLabels();
    syncDepthInputValues();
    calculate();
  }

  function syncDepthInputLabels() {
    var unit = units === 'metric' ? 'm' : 'ft';
    el('pvc-shallow-label').textContent = 'Shallow end (' + unit + ')';
    el('pvc-deep-label').textContent    = 'Deep end (' + unit + ')';
  }

  function syncDepthInputValues() {
    var si = el('pvc-shallow-depth');
    var di = el('pvc-deep-depth');
    if (units === 'metric') {
      si.step = '0.1'; si.value = shallowDepthM.toFixed(2);
      di.step = '0.1'; di.value = deepDepthM.toFixed(2);
    } else {
      si.step = '0.5'; si.value = toFt(shallowDepthM).toFixed(1);
      di.step = '0.5'; di.value = toFt(deepDepthM).toFixed(1);
    }
  }

  // ─── Calculate ───────────────────────────────────────────────────────────────
  function calculate() {
    if (!currentPolygon) return;
    var geojson   = currentPolygon.toGeoJSON();
    var areaSqM   = turf.area(geojson);
    var avgDepthM = (shallowDepthM + deepDepthM) / 2;
    var volumeM3  = areaSqM * avgDepthM;
    var litres    = volumeM3 * CONFIG.litresPerCubicM;
    var areaSqFt  = areaSqM * CONFIG.sqFtPerSqM;
    var avgDepthFt = avgDepthM * CONFIG.ftPerM;
    var gallons   = litres / CONFIG.litresPerGallon;
    showResults(areaSqM, areaSqFt, avgDepthM, avgDepthFt, gallons, litres);
    updateShareUrl();
  }

  function showResults(areaSqM, areaSqFt, avgDepthM, avgDepthFt, gallons, litres) {
    var placeholder = document.querySelector('#' + CONFIG.containerId + ' .pvc-results-placeholder');
    var grid        = document.querySelector('#' + CONFIG.containerId + ' .pvc-results-grid');
    var shareBtn    = el('pvc-share-btn');
    if (placeholder) placeholder.style.display = 'none';
    if (grid)        grid.classList.add('visible');
    if (shareBtn)    shareBtn.style.display = 'inline-block';

    if (units === 'metric') {
      el('pvc-area-value').textContent     = fmt(areaSqM, 1) + ' m\u00b2';
      el('pvc-area-sub').textContent       = fmt(areaSqFt, 0) + ' ft\u00b2';
      el('pvc-avgdepth-value').textContent = fmt(avgDepthM, 2) + ' m';
      el('pvc-avgdepth-sub').textContent   = fmt(avgDepthFt, 1) + ' ft avg depth';
      el('pvc-vol-label').textContent      = 'Volume (Litres)';
      el('pvc-gallons-value').textContent  = fmt(litres, 0);
      el('pvc-gallons-sub').textContent    = fmt(gallons, 0) + ' US gallons';
    } else {
      el('pvc-area-value').textContent     = fmt(areaSqFt, 0) + ' ft\u00b2';
      el('pvc-area-sub').textContent       = fmt(areaSqM, 1) + ' m\u00b2';
      el('pvc-avgdepth-value').textContent = fmt(avgDepthFt, 1) + ' ft';
      el('pvc-avgdepth-sub').textContent   = fmt(avgDepthM, 2) + ' m avg depth';
      el('pvc-vol-label').textContent      = 'Volume (US Gallons)';
      el('pvc-gallons-value').textContent  = fmt(gallons, 0);
      el('pvc-gallons-sub').textContent    = fmt(litres, 0) + ' litres';
    }
  }

  // ─── Bind Events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-draw')
      .addEventListener('click', function () { startDrawingMode('polygon'); });
    document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-rect')
      .addEventListener('click', function () { startDrawingMode('rect'); });
    document.querySelector('#' + CONFIG.containerId + ' .pvc-btn-clear')
      .addEventListener('click', function () {
        stopDrawingMode();
        drawnItems.clearLayers();
        currentPolygon = null;
        var placeholder = document.querySelector('#' + CONFIG.containerId + ' .pvc-results-placeholder');
        var grid        = document.querySelector('#' + CONFIG.containerId + ' .pvc-results-grid');
        var shareBtn    = el('pvc-share-btn');
        if (placeholder) placeholder.style.display = '';
        if (grid)        grid.classList.remove('visible');
        if (shareBtn)    shareBtn.style.display = 'none';
        history.replaceState(null, '', window.location.pathname + window.location.search);
      });
    el('pvc-unit-toggle').addEventListener('click', function () {
      setUnits(units === 'imperial' ? 'metric' : 'imperial');
    });
    el('pvc-share-btn').addEventListener('click', function () {
      updateShareUrl();
      var self = this;
      navigator.clipboard.writeText(window.location.href).then(function () {
        self.textContent = '\u2713 Link copied!';
        setTimeout(function () { self.textContent = '\ud83d\udd17 Share'; }, 2500);
      }).catch(function () { self.textContent = '\ud83d\udd17 Share'; });
    });
    el('pvc-shallow-depth').addEventListener('input', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v > 0) { shallowDepthM = units === 'metric' ? v : toM(v); calculate(); }
    });
    el('pvc-deep-depth').addEventListener('input', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v > 0) { deepDepthM = units === 'metric' ? v : toM(v); calculate(); }
    });
  }

  // ─── Share Link ───────────────────────────────────────────────────────────────
  function updateShareUrl() {
    if (!currentPolygon) return;
    var latlngs = currentPolygon.getLatLngs()[0].map(function (p) {
      return [p.lat.toFixed(6), p.lng.toFixed(6)];
    });
    var hash = '#poly=' + encodeURIComponent(JSON.stringify(latlngs)) +
      '&shallowM=' + shallowDepthM.toFixed(3) +
      '&deepM='    + deepDepthM.toFixed(3) +
      '&units='    + units +
      '&lat='      + map.getCenter().lat.toFixed(5) +
      '&lng='      + map.getCenter().lng.toFixed(5) +
      '&z='        + map.getZoom();
    history.replaceState(null, '', hash);
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    if (params.lat && params.lng && params.z) {
      map.setView([parseFloat(params.lat), parseFloat(params.lng)], parseInt(params.z));
    }
    if (params.units === 'metric' || params.units === 'imperial') units = params.units;
    if (params.shallowM) shallowDepthM = parseFloat(params.shallowM);
    if (params.deepM)    deepDepthM    = parseFloat(params.deepM);
    var btn = el('pvc-unit-toggle');
    if (btn) {
      btn.textContent = units === 'metric' ? '\ud83c\udf0d Metric (m / L)' : '\ud83c\uddfa\ud83c\uddf8 Imperial (ft / gal)';
      btn.classList.toggle('metric', units === 'metric');
    }
    syncDepthInputLabels();
    syncDepthInputValues();
    if (params.poly) {
      try {
        var coords = JSON.parse(params.poly);
        var latlngs = coords.map(function (c) { return [parseFloat(c[0]), parseFloat(c[1])]; });
        var poly = L.polygon(latlngs, { color: CONFIG.poolColor, fillColor: CONFIG.poolColor, fillOpacity: 0.25, weight: 2 });
        drawnItems.clearLayers();
        currentPolygon = poly;
        drawnItems.addLayer(poly);
        calculate();
      } catch (e) { /* ignore */ }
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  function init() {
    buildUI();
    initMap();
    syncDepthInputLabels();
    syncDepthInputValues();
    bindEvents();
    setTimeout(loadStateFromUrl, 100);
    map.on('moveend zoomend', function () { if (currentPolygon) updateShareUrl(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
