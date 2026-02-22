(function () {
  'use strict';

  var SLUG = 'pool-volume-calculator';
  var CSS_URL = 'https://mapscaping.com/wp-content/uploads/2026/02/pool-volume-calculator-20260223.css';

  var HOSE_GPM = 9;
  var SQM_TO_SQFT = 10.7639;
  var M3_TO_GAL = 264.172;
  var M3_TO_L = 1000;
  var FT_TO_M = 0.3048;

  var drawnLayer = null;
  var currentUnits = 'imperial';
  var currentPoolType = 'flat';
  var map;
  var drawnItems;

  // ---- Bootstrap: load styles, inject HTML, load libs, init ----

  function bootstrap() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;
    loadStyles();
    injectHTML(container);
    loadLibs(initApp);
  }

  function loadStyles() {
    [
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
      CSS_URL
    ].forEach(function (url) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    });
  }

  function loadLibs(callback) {
    var deps = [
      {
        url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        ready: function () { return typeof L !== 'undefined'; }
      },
      {
        url: 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
        ready: function () { return typeof L !== 'undefined' && typeof L.Draw !== 'undefined'; }
      },
      {
        url: 'https://unpkg.com/@turf/turf@6.5.0/turf.min.js',
        ready: function () { return typeof turf !== 'undefined'; }
      }
    ];

    function loadNext(i) {
      if (i >= deps.length) { callback(); return; }
      if (deps[i].ready()) { loadNext(i + 1); return; }
      var s = document.createElement('script');
      s.src = deps[i].url;
      s.onload = function () { loadNext(i + 1); };
      s.onerror = function () { loadNext(i + 1); };
      document.head.appendChild(s);
    }
    loadNext(0);
  }

  function injectHTML(container) {
    container.innerHTML =
      '<div class="pvc-search-bar">' +
        '<input type="text" id="' + SLUG + '-search-input" placeholder="Search your address\u2026" autocomplete="off">' +
        '<button id="' + SLUG + '-search-btn">Search</button>' +
        '<button id="' + SLUG + '-locate-btn">My Location</button>' +
      '</div>' +
      '<div id="' + SLUG + '-map"></div>' +
      '<div class="pvc-panel">' +
        '<div class="pvc-config">' +
          '<h3 class="pvc-section-title">Pool Configuration</h3>' +
          '<div class="pvc-field-group">' +
            '<label class="pvc-label">Pool floor type</label>' +
            '<div class="pvc-radios">' +
              '<label class="pvc-radio-label"><input type="radio" name="pvc-pool-type" value="flat" checked> Flat bottom</label>' +
              '<label class="pvc-radio-label"><input type="radio" name="pvc-pool-type" value="sloped"> Shallow &amp; deep end</label>' +
            '</div>' +
          '</div>' +
          '<div id="' + SLUG + '-flat-depth" class="pvc-depth-inputs">' +
            '<div class="pvc-input-row">' +
              '<label id="pvc-depth-label" class="pvc-label">Depth (ft)</label>' +
              '<input type="number" id="pvc-depth" class="pvc-number-input" value="5" step="0.5" min="0.1" max="30">' +
            '</div>' +
          '</div>' +
          '<div id="' + SLUG + '-sloped-depth" class="pvc-depth-inputs" style="display:none">' +
            '<div class="pvc-input-row">' +
              '<label id="pvc-shallow-label" class="pvc-label">Shallow end (ft)</label>' +
              '<input type="number" id="pvc-shallow" class="pvc-number-input" value="3" step="0.5" min="0.1" max="15">' +
            '</div>' +
            '<div class="pvc-input-row">' +
              '<label id="pvc-deep-label" class="pvc-label">Deep end (ft)</label>' +
              '<input type="number" id="pvc-deep" class="pvc-number-input" value="8" step="0.5" min="0.1" max="30">' +
            '</div>' +
          '</div>' +
          '<div class="pvc-field-group">' +
            '<label class="pvc-label">Units</label>' +
            '<div class="pvc-radios">' +
              '<label class="pvc-radio-label"><input type="radio" name="pvc-units" value="imperial" checked> Imperial (ft / gal)</label>' +
              '<label class="pvc-radio-label"><input type="radio" name="pvc-units" value="metric"> Metric (m / L)</label>' +
            '</div>' +
          '</div>' +
          '<div class="pvc-actions">' +
            '<button id="' + SLUG + '-clear-btn" class="pvc-btn pvc-btn-secondary">Clear Pool</button>' +
            '<button id="' + SLUG + '-share-btn" class="pvc-btn pvc-btn-primary">Share</button>' +
          '</div>' +
        '</div>' +
        '<div class="pvc-results">' +
          '<h3 class="pvc-section-title">Results</h3>' +
          '<p class="pvc-hint">Draw your pool outline on the satellite map to see results.</p>' +
          '<div class="pvc-result-cards">' +
            '<div class="pvc-card"><div id="' + SLUG + '-r-area" class="pvc-card-value">\u2014</div><div class="pvc-card-label">Surface Area</div></div>' +
            '<div class="pvc-card"><div id="' + SLUG + '-r-gallons" class="pvc-card-value">\u2014</div><div class="pvc-card-label">Volume (Gallons)</div></div>' +
            '<div class="pvc-card"><div id="' + SLUG + '-r-litres" class="pvc-card-value">\u2014</div><div class="pvc-card-label">Volume (Litres)</div></div>' +
            '<div class="pvc-card"><div id="' + SLUG + '-r-fill" class="pvc-card-value">\u2014</div><div class="pvc-card-label">Fill Time <span class="pvc-card-note">@ 9 gal/min hose</span></div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ---- App init (runs after libs loaded) ----

  function initApp() {
    var savedState = loadStateFromUrl();
    var initLat = savedState && savedState.lat ? parseFloat(savedState.lat) : 34.0;
    var initLng = savedState && savedState.lng ? parseFloat(savedState.lng) : -118.0;
    var initZoom = savedState && savedState.z ? parseInt(savedState.z) : 5;

    map = L.map(SLUG + '-map', { center: [initLat, initLng], zoom: initZoom });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri', maxZoom: 22 }
    ).addTo(map);

    var polyStyle = { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.25, weight: 2 };

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    var drawControl = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: drawnItems },
      draw: {
        polygon: { allowIntersection: false, shapeOptions: polyStyle, showArea: false },
        polyline: false, rectangle: false, circle: false, circlemarker: false, marker: false
      }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) {
      drawnItems.clearLayers();
      drawnLayer = e.layer;
      drawnItems.addLayer(drawnLayer);
      compute();
      updateShareUrl();
      hidePlaceholder();
    });

    map.on(L.Draw.Event.EDITED, function () {
      var layers = drawnItems.getLayers();
      if (layers.length > 0) { drawnLayer = layers[0]; compute(); updateShareUrl(); }
    });

    map.on(L.Draw.Event.DELETED, function () {
      drawnLayer = null; clearResults(); updateShareUrl(); showPlaceholder();
    });

    map.on('moveend zoomend', updateShareUrl);

    // Restore state
    if (savedState) {
      if (savedState.units) {
        currentUnits = savedState.units;
        var uR = document.querySelector('input[name="pvc-units"][value="' + currentUnits + '"]');
        if (uR) uR.checked = true;
      }
      if (savedState.pt) {
        currentPoolType = savedState.pt;
        var ptR = document.querySelector('input[name="pvc-pool-type"][value="' + currentPoolType + '"]');
        if (ptR) ptR.checked = true;
        togglePoolTypeUI();
      }
      if (savedState.d) document.getElementById('pvc-depth').value = savedState.d;
      if (savedState.sh) document.getElementById('pvc-shallow').value = savedState.sh;
      if (savedState.dp) document.getElementById('pvc-deep').value = savedState.dp;
      updateDepthLabels();

      if (savedState.poly) {
        try {
          var coords = JSON.parse(decodeURIComponent(savedState.poly));
          var latlngs = coords.map(function (c) { return L.latLng(c[0], c[1]); });
          drawnLayer = L.polygon(latlngs, polyStyle);
          drawnItems.addLayer(drawnLayer);
          compute();
          hidePlaceholder();
        } catch (e) {}
      }
    }

    bindEvents();
  }

  // ---- Events ----

  function bindEvents() {
    document.getElementById(SLUG + '-search-btn').addEventListener('click', doSearch);
    document.getElementById(SLUG + '-search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });

    document.getElementById(SLUG + '-locate-btn').addEventListener('click', function () {
      map.locate({ setView: true, maxZoom: 19 });
    });

    document.getElementById(SLUG + '-clear-btn').addEventListener('click', function () {
      drawnItems.clearLayers();
      drawnLayer = null;
      clearResults();
      updateShareUrl();
      showPlaceholder();
    });

    document.getElementById(SLUG + '-share-btn').addEventListener('click', function () {
      updateShareUrl();
      var self = this;
      navigator.clipboard.writeText(window.location.href).then(function () {
        self.textContent = 'Copied!';
        setTimeout(function () { self.textContent = 'Share'; }, 2000);
      });
    });

    document.querySelectorAll('input[name="pvc-units"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var prev = currentUnits;
        currentUnits = this.value;
        convertDepthInputs(prev, currentUnits);
        updateDepthLabels();
        if (drawnLayer) compute();
      });
    });

    document.querySelectorAll('input[name="pvc-pool-type"]').forEach(function (r) {
      r.addEventListener('change', function () {
        currentPoolType = this.value;
        togglePoolTypeUI();
        if (drawnLayer) compute();
      });
    });

    ['pvc-depth', 'pvc-shallow', 'pvc-deep'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () { if (drawnLayer) compute(); });
    });
  }

  // ---- Search ----

  function doSearch() {
    var q = document.getElementById(SLUG + '-search-input').value.trim();
    if (!q) return;
    var btn = document.getElementById(SLUG + '-search-btn');
    btn.textContent = '\u2026';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept-Language': 'en' }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        btn.textContent = 'Search';
        if (data && data[0]) {
          map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 19);
        } else {
          alert('Address not found. Try a more specific address.');
        }
      })
      .catch(function () { btn.textContent = 'Search'; alert('Search failed. Check your connection.'); });
  }

  // ---- Calculations ----

  function getAvgDepthM() {
    var toM = currentUnits === 'imperial' ? FT_TO_M : 1;
    if (currentPoolType === 'flat') {
      return (parseFloat(document.getElementById('pvc-depth').value) || 0) * toM;
    } else {
      var sh = (parseFloat(document.getElementById('pvc-shallow').value) || 0) * toM;
      var dp = (parseFloat(document.getElementById('pvc-deep').value) || 0) * toM;
      return (sh + dp) / 2;
    }
  }

  function compute() {
    if (!drawnLayer) return;
    var latlngs = drawnLayer.getLatLngs()[0];
    var coords = latlngs.map(function (ll) { return [ll.lng, ll.lat]; });
    coords.push(coords[0]);
    var areaM2 = turf.area(turf.polygon([coords]));
    var volM3 = areaM2 * getAvgDepthM();
    renderResults(areaM2, volM3);
  }

  function renderResults(areaM2, volM3) {
    var gallons = volM3 * M3_TO_GAL;
    var litres = volM3 * M3_TO_L;
    var areaDisplay = currentUnits === 'imperial'
      ? fmt(areaM2 * SQM_TO_SQFT) + ' ft\u00b2'
      : areaM2.toFixed(1) + ' m\u00b2';
    var fillMins = gallons / HOSE_GPM;
    var fillHours = Math.floor(fillMins / 60);
    var fillMin = Math.round(fillMins % 60);
    var fillDisplay = fillHours > 0 ? fillHours + 'h ' + fillMin + 'm' : fillMin + 'm';

    document.getElementById(SLUG + '-r-area').textContent = areaDisplay;
    document.getElementById(SLUG + '-r-gallons').textContent = fmt(gallons) + ' gal';
    document.getElementById(SLUG + '-r-litres').textContent = fmt(litres) + ' L';
    document.getElementById(SLUG + '-r-fill').textContent = fillDisplay;
  }

  function clearResults() {
    ['-r-area', '-r-gallons', '-r-litres', '-r-fill'].forEach(function (s) {
      document.getElementById(SLUG + s).textContent = '\u2014';
    });
  }

  function hidePlaceholder() {
    var h = document.querySelector('#' + SLUG + '-container .pvc-hint');
    if (h) h.style.display = 'none';
  }

  function showPlaceholder() {
    var h = document.querySelector('#' + SLUG + '-container .pvc-hint');
    if (h) h.style.display = '';
  }

  // ---- Helpers ----

  function togglePoolTypeUI() {
    document.getElementById(SLUG + '-flat-depth').style.display = currentPoolType === 'flat' ? '' : 'none';
    document.getElementById(SLUG + '-sloped-depth').style.display = currentPoolType === 'sloped' ? '' : 'none';
  }

  function convertDepthInputs(from, to) {
    if (from === to) return;
    var factor = from === 'imperial' ? FT_TO_M : (1 / FT_TO_M);
    var dec = to === 'imperial' ? 1 : 2;
    ['pvc-depth', 'pvc-shallow', 'pvc-deep'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = (parseFloat(el.value) * factor).toFixed(dec);
    });
  }

  function updateDepthLabels() {
    var u = currentUnits === 'imperial' ? 'ft' : 'm';
    var labels = { 'pvc-depth-label': 'Depth (' + u + ')', 'pvc-shallow-label': 'Shallow end (' + u + ')', 'pvc-deep-label': 'Deep end (' + u + ')' };
    Object.keys(labels).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = labels[id];
    });
  }

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  // ---- URL state ----

  function updateShareUrl() {
    if (!map) return;
    var center = map.getCenter();
    var parts = [
      'lat=' + center.lat.toFixed(5),
      'lng=' + center.lng.toFixed(5),
      'z=' + map.getZoom(),
      'units=' + currentUnits,
      'pt=' + currentPoolType,
      'd=' + (document.getElementById('pvc-depth') ? document.getElementById('pvc-depth').value : '5'),
      'sh=' + (document.getElementById('pvc-shallow') ? document.getElementById('pvc-shallow').value : '3'),
      'dp=' + (document.getElementById('pvc-deep') ? document.getElementById('pvc-deep').value : '8')
    ];
    if (drawnLayer) {
      var latlngs = drawnLayer.getLatLngs()[0];
      var coords = JSON.stringify(latlngs.map(function (ll) {
        return [parseFloat(ll.lat.toFixed(6)), parseFloat(ll.lng.toFixed(6))];
      }));
      parts.push('poly=' + encodeURIComponent(coords));
    }
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    try {
      return Object.fromEntries(hash.split('&').map(function (pair) {
        var eq = pair.indexOf('=');
        return [pair.slice(0, eq), pair.slice(eq + 1)];
      }));
    } catch (e) { return null; }
  }

  // ---- Start ----

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
