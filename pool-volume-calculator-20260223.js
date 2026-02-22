(function () {
  'use strict';

  var SLUG = 'pool-volume-calculator';
  var HOSE_GPM = 9;          // typical garden hose gallons/minute
  var SQM_TO_SQFT = 10.7639;
  var M3_TO_GAL = 264.172;
  var M3_TO_L = 1000;
  var FT_TO_M = 0.3048;

  // App state
  var drawnLayer = null;
  var currentUnits = 'imperial';
  var currentPoolType = 'flat';

  // ---- URL state helpers ----

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    try {
      var entries = hash.split('&').map(function (pair) {
        var eq = pair.indexOf('=');
        return [pair.slice(0, eq), pair.slice(eq + 1)];
      });
      return Object.fromEntries(entries);
    } catch (e) { return null; }
  }

  function updateShareUrl() {
    var center = map.getCenter();
    var parts = [
      'lat=' + center.lat.toFixed(5),
      'lng=' + center.lng.toFixed(5),
      'z=' + map.getZoom(),
      'units=' + currentUnits,
      'pt=' + currentPoolType,
      'd=' + document.getElementById('pvc-depth').value,
      'sh=' + document.getElementById('pvc-shallow').value,
      'dp=' + document.getElementById('pvc-deep').value
    ];
    if (drawnLayer) {
      var latlngs = drawnLayer.getLatLngs()[0];
      var coords = JSON.stringify(
        latlngs.map(function (ll) {
          return [parseFloat(ll.lat.toFixed(6)), parseFloat(ll.lng.toFixed(6))];
        })
      );
      parts.push('poly=' + encodeURIComponent(coords));
    }
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  // ---- Init map ----

  var savedState = loadStateFromUrl();

  var initLat = savedState && savedState.lat ? parseFloat(savedState.lat) : 34.0;
  var initLng = savedState && savedState.lng ? parseFloat(savedState.lng) : -118.0;
  var initZoom = savedState && savedState.z ? parseInt(savedState.z) : 5;

  var map = L.map(SLUG + '-map', {
    center: [initLat, initLng],
    zoom: initZoom
  });

  // Satellite basemap — pools are clearly visible
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Imagery &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
      maxZoom: 22
    }
  ).addTo(map);

  // ---- Draw layer ----

  var drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  var polyStyle = { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.25, weight: 2 };

  var drawControl = new L.Control.Draw({
    position: 'topleft',
    edit: { featureGroup: drawnItems },
    draw: {
      polygon: {
        allowIntersection: false,
        shapeOptions: polyStyle,
        showArea: false
      },
      polyline: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: false
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
    if (layers.length > 0) {
      drawnLayer = layers[0];
      compute();
      updateShareUrl();
    }
  });

  map.on(L.Draw.Event.DELETED, function () {
    drawnLayer = null;
    clearResults();
    updateShareUrl();
    showPlaceholder();
  });

  map.on('moveend zoomend', updateShareUrl);

  // ---- Restore state from URL ----

  if (savedState) {
    if (savedState.units) {
      currentUnits = savedState.units;
      var uRadio = document.querySelector('input[name="pvc-units"][value="' + currentUnits + '"]');
      if (uRadio) uRadio.checked = true;
    }
    if (savedState.pt) {
      currentPoolType = savedState.pt;
      var ptRadio = document.querySelector('input[name="pvc-pool-type"][value="' + currentPoolType + '"]');
      if (ptRadio) ptRadio.checked = true;
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

  // ---- Search ----

  document.getElementById(SLUG + '-search-btn').addEventListener('click', doSearch);
  document.getElementById(SLUG + '-search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doSearch();
  });

  function doSearch() {
    var q = document.getElementById(SLUG + '-search-input').value.trim();
    if (!q) return;
    var btn = document.getElementById(SLUG + '-search-btn');
    btn.textContent = '…';
    fetch(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q),
      { headers: { 'Accept-Language': 'en' } }
    )
      .then(function (r) { return r.json(); })
      .then(function (data) {
        btn.textContent = 'Search';
        if (data && data[0]) {
          map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 19);
        } else {
          alert('Address not found. Try a more specific address.');
        }
      })
      .catch(function () {
        btn.textContent = 'Search';
        alert('Search failed. Check your connection.');
      });
  }

  // ---- My Location ----

  document.getElementById(SLUG + '-locate-btn').addEventListener('click', function () {
    map.locate({ setView: true, maxZoom: 19 });
  });

  // ---- Clear ----

  document.getElementById(SLUG + '-clear-btn').addEventListener('click', function () {
    drawnItems.clearLayers();
    drawnLayer = null;
    clearResults();
    updateShareUrl();
    showPlaceholder();
  });

  // ---- Share ----

  document.getElementById(SLUG + '-share-btn').addEventListener('click', function () {
    updateShareUrl();
    var self = this;
    navigator.clipboard.writeText(window.location.href).then(function () {
      self.textContent = 'Copied!';
      setTimeout(function () { self.textContent = 'Share'; }, 2000);
    });
  });

  // ---- Units toggle ----

  document.querySelectorAll('input[name="pvc-units"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var prev = currentUnits;
      currentUnits = this.value;
      convertDepthInputs(prev, currentUnits);
      updateDepthLabels();
      if (drawnLayer) compute();
    });
  });

  // ---- Pool type toggle ----

  document.querySelectorAll('input[name="pvc-pool-type"]').forEach(function (r) {
    r.addEventListener('change', function () {
      currentPoolType = this.value;
      togglePoolTypeUI();
      if (drawnLayer) compute();
    });
  });

  function togglePoolTypeUI() {
    document.getElementById(SLUG + '-flat-depth').style.display =
      currentPoolType === 'flat' ? '' : 'none';
    document.getElementById(SLUG + '-sloped-depth').style.display =
      currentPoolType === 'sloped' ? '' : 'none';
  }

  // ---- Depth input listeners ----

  ['pvc-depth', 'pvc-shallow', 'pvc-deep'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { if (drawnLayer) compute(); });
  });

  // ---- Calculation ----

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
    // Turf expects [lng, lat] and a closed ring
    var coords = latlngs.map(function (ll) { return [ll.lng, ll.lat]; });
    coords.push(coords[0]);

    var polygon = turf.polygon([coords]);
    var areaM2 = turf.area(polygon);
    var depthM = getAvgDepthM();
    var volM3 = areaM2 * depthM;

    renderResults(areaM2, volM3);
  }

  function renderResults(areaM2, volM3) {
    var gallons = volM3 * M3_TO_GAL;
    var litres = volM3 * M3_TO_L;

    var areaDisplay = currentUnits === 'imperial'
      ? formatNum(areaM2 * SQM_TO_SQFT) + ' ft²'
      : areaM2.toFixed(1) + ' m²';

    var fillMins = gallons / HOSE_GPM;
    var fillHours = Math.floor(fillMins / 60);
    var fillMin = Math.round(fillMins % 60);
    var fillDisplay = fillHours > 0
      ? fillHours + 'h ' + fillMin + 'm'
      : fillMin + 'm';

    document.getElementById(SLUG + '-r-area').textContent = areaDisplay;
    document.getElementById(SLUG + '-r-gallons').textContent = formatNum(gallons) + ' gal';
    document.getElementById(SLUG + '-r-litres').textContent = formatNum(litres) + ' L';
    document.getElementById(SLUG + '-r-fill').textContent = fillDisplay;
  }

  function clearResults() {
    ['-r-area', '-r-gallons', '-r-litres', '-r-fill'].forEach(function (suffix) {
      document.getElementById(SLUG + suffix).textContent = '—';
    });
  }

  function hidePlaceholder() {
    var hint = document.querySelector('#pool-volume-calculator-container .pvc-hint');
    if (hint) hint.style.display = 'none';
  }

  function showPlaceholder() {
    var hint = document.querySelector('#pool-volume-calculator-container .pvc-hint');
    if (hint) hint.style.display = '';
  }

  // ---- Unit conversion helpers ----

  function convertDepthInputs(from, to) {
    if (from === to) return;
    var factor = (from === 'imperial') ? FT_TO_M : (1 / FT_TO_M);
    var decimals = (to === 'imperial') ? 1 : 2;
    ['pvc-depth', 'pvc-shallow', 'pvc-deep'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = (parseFloat(el.value) * factor).toFixed(decimals);
    });
  }

  function updateDepthLabels() {
    var u = currentUnits === 'imperial' ? 'ft' : 'm';
    var map = {
      'pvc-depth-label': 'Depth (' + u + ')',
      'pvc-shallow-label': 'Shallow end (' + u + ')',
      'pvc-deep-label': 'Deep end (' + u + ')'
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  function formatNum(n) {
    return Math.round(n).toLocaleString('en-US');
  }

})();
