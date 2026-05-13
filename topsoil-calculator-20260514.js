(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  var SLUG = 'topsoil-calculator';
  var MAP_ID = SLUG + '-map';
  var CONTAINER_ID = SLUG + '-container';

  // Soil type data: label, bulk cost per cu yd, bag cost per 40-lb bag
  var SOIL_TYPES = {
    screened: {
      label: 'Screened Topsoil',
      bulkCostPerCuYd: 35,
      bagCostPer40lb: 4.50
    },
    unscreened: {
      label: 'Unscreened Topsoil',
      bulkCostPerCuYd: 22,
      bagCostPer40lb: 3.50
    },
    garden_mix: {
      label: 'Garden Mix / Planter Mix',
      bulkCostPerCuYd: 55,
      bagCostPer40lb: 6.00
    },
    compost_amended: {
      label: 'Compost-Amended Topsoil',
      bulkCostPerCuYd: 65,
      bagCostPer40lb: 7.50
    },
    sandy_loam: {
      label: 'Sandy Loam',
      bulkCostPerCuYd: 30,
      bagCostPer40lb: 4.00
    },
    mushroom_compost: {
      label: 'Mushroom Compost',
      bulkCostPerCuYd: 45,
      bagCostPer40lb: 5.50
    }
  };

  // Density: tons per cubic yard (moisture-averaged)
  var DENSITY_TONS_PER_CU_YD = 1.2;
  // Volume per 40-lb bag in cubic feet
  var CU_FT_PER_40LB_BAG = 0.75;
  // Volume per 1-cu-ft bag
  var CU_FT_PER_1CUFT_BAG = 1.0;
  // Cubic yards per truck load
  var CU_YD_PER_TRUCK = 10;
  // sq ft covered per cu yd at 1" depth  (1 cu yd = 27 cu ft = 324 sq ft at 1")
  var SQFT_PER_CU_YD_PER_INCH = 324;

  // ─── State ────────────────────────────────────────────────────────────────────
  var state = {
    areas: [],          // array of { id, sqFt, label }
    depthIn: 4,
    soilType: 'screened',
    useMetric: false,
    deliveryFee: 75,
    spreadLaborPerSqFt: 0.10,
    layers: {}          // id -> L.layer
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function sqFtToSqM(sqFt) { return sqFt * 0.092903; }
  function cuYdToCuM(cuYd) { return cuYd * 0.764555; }
  function numFmt(n, dp) {
    if (isNaN(n) || !isFinite(n)) return '—';
    return n.toFixed(dp !== undefined ? dp : 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function currencyFmt(n) { return '$' + numFmt(n, 2); }

  function totalSqFt() {
    return state.areas.reduce(function (s, a) { return s + a.sqFt; }, 0);
  }

  // core volume calculation: cubic yards from area (sq ft) + depth (inches)
  function calcCuYd(sqFt, depthIn) {
    return (sqFt * depthIn) / SQFT_PER_CU_YD_PER_INCH;
  }

  // ─── Map init ─────────────────────────────────────────────────────────────────
  var map = L.map(MAP_ID, {
    center: [39.5, -98.35],
    zoom: 4,
    zoomControl: true
  });

  var tiles = {
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 20 }
    ),
    street: L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
    )
  };
  tiles.satellite.addTo(map);

  var currentBasemap = 'satellite';

  // ─── Leaflet.Draw ─────────────────────────────────────────────────────────────
  var drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  var drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
      polygon: {
        allowIntersection: false,
        shapeOptions: { color: '#6d4c41', weight: 3, fillOpacity: 0.25, fillColor: '#a1887f' }
      },
      rectangle: {
        shapeOptions: { color: '#6d4c41', weight: 3, fillOpacity: 0.25, fillColor: '#a1887f' }
      },
      circle: false,
      circlemarker: false,
      marker: false,
      polyline: false
    }
  });
  map.addControl(drawControl);

  var areaCounter = 0;

  map.on(L.Draw.Event.CREATED, function (e) {
    var layer = e.layer;
    areaCounter++;
    var id = 'area-' + areaCounter;
    var sqFt = geodesicAreaSqFt(layer);

    layer._tcId = id;
    drawnItems.addLayer(layer);
    state.areas.push({ id: id, sqFt: sqFt, label: 'Area ' + areaCounter });
    state.layers[id] = layer;

    addMeasureLabel(layer, sqFt);
    renderAreaList();
    recalc();
  });

  map.on(L.Draw.Event.EDITED, function (e) {
    e.layers.eachLayer(function (layer) {
      var id = layer._tcId;
      if (!id) return;
      var sqFt = geodesicAreaSqFt(layer);
      state.areas.forEach(function (a) {
        if (a.id === id) { a.sqFt = sqFt; }
      });
      addMeasureLabel(layer, sqFt);
    });
    renderAreaList();
    recalc();
  });

  map.on(L.Draw.Event.DELETED, function (e) {
    e.layers.eachLayer(function (layer) {
      var id = layer._tcId;
      state.areas = state.areas.filter(function (a) { return a.id !== id; });
      delete state.layers[id];
    });
    renderAreaList();
    recalc();
  });

  // ─── Geodesic area ────────────────────────────────────────────────────────────
  function geodesicAreaSqFt(layer) {
    var latlngs = layer.getLatLngs ? layer.getLatLngs() : null;
    if (!latlngs) return 0;
    var rings = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    var sqM = L.GeometryUtil ? L.GeometryUtil.geodesicArea(rings) : roughAreaSqM(rings);
    return sqM * 10.7639; // sq m -> sq ft
  }

  function roughAreaSqM(latlngs) {
    // Shoelace on projected coords — fallback if GeometryUtil not present
    var n = latlngs.length;
    if (n < 3) return 0;
    var area = 0;
    var R = 6378137;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var xi = latlngs[i].lng * Math.PI / 180 * R * Math.cos(latlngs[i].lat * Math.PI / 180);
      var xj = latlngs[j].lng * Math.PI / 180 * R * Math.cos(latlngs[j].lat * Math.PI / 180);
      var yi = latlngs[i].lat * Math.PI / 180 * R;
      var yj = latlngs[j].lat * Math.PI / 180 * R;
      area += (xi * yj) - (xj * yi);
    }
    return Math.abs(area) / 2;
  }

  // ─── Measure labels ───────────────────────────────────────────────────────────
  var measureLabels = {};

  function addMeasureLabel(layer, sqFt) {
    var id = layer._tcId;
    if (measureLabels[id]) { map.removeLayer(measureLabels[id]); }

    var center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
    var primary = state.useMetric
      ? numFmt(sqFtToSqM(sqFt), 1) + ' m²'
      : numFmt(sqFt, 0) + ' sq ft';
    var secondary = state.useMetric
      ? numFmt(sqFt, 0) + ' sq ft'
      : numFmt(sqFtToSqM(sqFt), 1) + ' m²';

    var icon = L.divIcon({
      className: 'tc-measure-label',
      html: '<div class="tc-label-primary">' + primary + '</div><div class="tc-label-secondary">' + secondary + '</div>',
      iconAnchor: [50, 20],
      iconSize: [100, 40]
    });
    measureLabels[id] = L.marker(center, { icon: icon, interactive: false });
    map.addLayer(measureLabels[id]);
  }

  // ─── Address search ───────────────────────────────────────────────────────────
  var searchInput = document.getElementById(SLUG + '-address-input');
  var searchBtn = document.getElementById(SLUG + '-search-btn');

  function doSearch() {
    var q = searchInput.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.length > 0) {
          var lat = parseFloat(data[0].lat);
          var lon = parseFloat(data[0].lon);
          map.setView([lat, lon], 17);
        } else {
          alert('Address not found. Try a more specific address.');
        }
      })
      .catch(function () { alert('Search failed. Check your connection.'); })
      .finally(function () {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Go';
      });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { doSearch(); }
    });
  }

  // ─── Basemap toggle ───────────────────────────────────────────────────────────
  var toggleBasemapBtn = document.getElementById(SLUG + '-toggle-basemap');
  if (toggleBasemapBtn) {
    toggleBasemapBtn.addEventListener('click', function () {
      if (currentBasemap === 'satellite') {
        map.removeLayer(tiles.satellite);
        tiles.street.addTo(map);
        currentBasemap = 'street';
        toggleBasemapBtn.textContent = 'Satellite View';
      } else {
        map.removeLayer(tiles.street);
        tiles.satellite.addTo(map);
        currentBasemap = 'satellite';
        toggleBasemapBtn.textContent = 'Street View';
      }
    });
  }

  // ─── Unit toggle ──────────────────────────────────────────────────────────────
  var unitToggle = document.getElementById(SLUG + '-unit-toggle');
  if (unitToggle) {
    unitToggle.addEventListener('change', function () {
      state.useMetric = this.checked;
      Object.keys(state.layers).forEach(function (id) {
        var layer = state.layers[id];
        var area = state.areas.find(function (a) { return a.id === id; });
        if (area) { addMeasureLabel(layer, area.sqFt); }
      });
      recalc();
    });
  }

  // ─── Soil type select ─────────────────────────────────────────────────────────
  var soilSelect = document.getElementById(SLUG + '-soil-type');
  if (soilSelect) {
    soilSelect.addEventListener('change', function () {
      state.soilType = this.value;
      var costs = SOIL_TYPES[state.soilType];
      var bulkInput = document.getElementById(SLUG + '-bulk-cost');
      var bagInput = document.getElementById(SLUG + '-bag-cost');
      if (bulkInput) bulkInput.value = costs.bulkCostPerCuYd;
      if (bagInput) bagInput.value = costs.bagCostPer40lb;
      recalc();
    });
  }

  // ─── Depth input ──────────────────────────────────────────────────────────────
  var depthInput = document.getElementById(SLUG + '-depth');
  if (depthInput) {
    depthInput.addEventListener('input', function () {
      var v = parseFloat(this.value);
      if (v > 0) { state.depthIn = v; recalc(); }
    });
  }

  // ─── Cost inputs ──────────────────────────────────────────────────────────────
  ['bulk-cost', 'bag-cost', 'delivery-fee', 'spread-labor'].forEach(function (id) {
    var el = document.getElementById(SLUG + '-' + id);
    if (el) {
      el.addEventListener('input', function () {
        if (id === 'bulk-cost') { SOIL_TYPES[state.soilType].bulkCostPerCuYd = parseFloat(this.value) || 0; }
        if (id === 'bag-cost') { SOIL_TYPES[state.soilType].bagCostPer40lb = parseFloat(this.value) || 0; }
        if (id === 'delivery-fee') { state.deliveryFee = parseFloat(this.value) || 0; }
        if (id === 'spread-labor') { state.spreadLaborPerSqFt = parseFloat(this.value) || 0; }
        recalc();
      });
    }
  });

  // ─── Clear button ─────────────────────────────────────────────────────────────
  var clearBtn = document.getElementById(SLUG + '-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      drawnItems.clearLayers();
      Object.keys(measureLabels).forEach(function (id) { map.removeLayer(measureLabels[id]); });
      measureLabels = {};
      state.areas = [];
      state.layers = {};
      renderAreaList();
      recalc();
    });
  }

  // ─── Area list UI ─────────────────────────────────────────────────────────────
  function renderAreaList() {
    var listEl = document.getElementById(SLUG + '-area-list');
    if (!listEl) return;
    if (state.areas.length === 0) {
      listEl.innerHTML = '<p class="tc-empty-areas">Draw a polygon on the map to get started.</p>';
      return;
    }
    var html = '';
    state.areas.forEach(function (a) {
      var display = state.useMetric
        ? numFmt(sqFtToSqM(a.sqFt), 1) + ' m²'
        : numFmt(a.sqFt, 0) + ' sq ft';
      html += '<div class="tc-area-row"><span class="tc-area-label">' + a.label + '</span><span class="tc-area-val">' + display + '</span></div>';
    });
    if (state.areas.length > 1) {
      var total = totalSqFt();
      var totalDisplay = state.useMetric
        ? numFmt(sqFtToSqM(total), 1) + ' m²'
        : numFmt(total, 0) + ' sq ft';
      html += '<div class="tc-area-row tc-area-total"><span class="tc-area-label">Total</span><span class="tc-area-val">' + totalDisplay + '</span></div>';
    }
    listEl.innerHTML = html;
  }

  // ─── Recalculate ──────────────────────────────────────────────────────────────
  function recalc() {
    var sqFt = totalSqFt();
    var depthIn = state.depthIn;
    var soilData = SOIL_TYPES[state.soilType];

    // Volume
    var cuYd = calcCuYd(sqFt, depthIn);
    var cuFt = cuYd * 27;
    var tons = cuYd * DENSITY_TONS_PER_CU_YD;
    var bags40lb = cuFt / CU_FT_PER_40LB_BAG;
    var bags1cuft = cuFt / CU_FT_PER_1CUFT_BAG;
    var truckLoads = cuYd / CU_YD_PER_TRUCK;

    // Costs
    var bulkMaterialCost = cuYd * soilData.bulkCostPerCuYd;
    var baggedCost = bags40lb * soilData.bagCostPer40lb;
    var deliveryCost = sqFt > 0 ? state.deliveryFee : 0;
    var laborCost = sqFt * state.spreadLaborPerSqFt;
    var bulkTotal = bulkMaterialCost + deliveryCost + laborCost;
    var baggedTotal = baggedCost + laborCost;

    // Coverage at current depth
    var coveragePer1CuYd = SQFT_PER_CU_YD_PER_INCH / depthIn;

    // Metric conversions
    var sqM = sqFtToSqM(sqFt);
    var cuM = cuYdToCuM(cuYd);

    // ── Area summary
    setText(SLUG + '-result-area-primary', state.useMetric ? numFmt(sqM, 1) + ' m²' : numFmt(sqFt, 0) + ' sq ft');
    setText(SLUG + '-result-area-secondary', state.useMetric ? numFmt(sqFt, 0) + ' sq ft' : numFmt(sqM, 1) + ' m²');

    // ── Volume
    setText(SLUG + '-result-cu-yd', numFmt(cuYd, 2) + ' cu yd');
    setText(SLUG + '-result-cu-ft', numFmt(cuFt, 1) + ' cu ft');
    setText(SLUG + '-result-cu-m', numFmt(cuM, 2) + ' m³');
    setText(SLUG + '-result-tons', numFmt(tons, 2) + ' tons');

    // ── Bag counts
    setText(SLUG + '-result-bags-40lb', numFmt(Math.ceil(bags40lb), 0) + ' bags (40 lb)');
    setText(SLUG + '-result-bags-1cuft', numFmt(Math.ceil(bags1cuft), 0) + ' bags (1 cu ft)');
    setText(SLUG + '-result-truck-loads', numFmt(truckLoads, 2) + ' loads (10 cu yd each)');

    // ── Coverage helper
    setText(SLUG + '-result-coverage', '1 cu yd covers ~' + numFmt(coveragePer1CuYd, 0) + ' sq ft at ' + depthIn + '"');

    // ── Cost panel — bulk
    setText(SLUG + '-cost-bulk-material', currencyFmt(bulkMaterialCost));
    setText(SLUG + '-cost-delivery', currencyFmt(deliveryCost));
    setText(SLUG + '-cost-labor', currencyFmt(laborCost));
    setText(SLUG + '-cost-bulk-total', currencyFmt(bulkTotal));

    // ── Cost panel — bagged
    setText(SLUG + '-cost-bagged-material', currencyFmt(baggedCost));
    setText(SLUG + '-cost-bagged-total', currencyFmt(baggedTotal));

    // ── Crossover hint
    var crossoverCuYd = (state.deliveryFee) / (soilData.bagCostPer40lb / CU_FT_PER_40LB_BAG * 27 - soilData.bulkCostPerCuYd);
    var crossoverText = (crossoverCuYd > 0 && crossoverCuYd < 20)
      ? 'Bulk delivery saves money above ~' + numFmt(crossoverCuYd, 1) + ' cu yd'
      : 'Compare bulk vs bagged costs above';
    setText(SLUG + '-cost-crossover', crossoverText);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ─── Export / Print ───────────────────────────────────────────────────────────
  var printBtn = document.getElementById(SLUG + '-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', function () { window.print(); });
  }

  var exportBtn = document.getElementById(SLUG + '-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      var sqFt = totalSqFt();
      var cuYd = calcCuYd(sqFt, state.depthIn);
      var tons = cuYd * DENSITY_TONS_PER_CU_YD;
      var soilData = SOIL_TYPES[state.soilType];
      var lines = [
        'Topsoil Calculator Export — mapscaping.com',
        '---',
        'Soil type: ' + soilData.label,
        'Total area: ' + numFmt(sqFt, 0) + ' sq ft (' + numFmt(sqFtToSqM(sqFt), 1) + ' m²)',
        'Depth: ' + state.depthIn + ' inches',
        'Cubic yards: ' + numFmt(cuYd, 2),
        'Cubic feet: ' + numFmt(cuYd * 27, 1),
        'Tons: ' + numFmt(tons, 2),
        '40-lb bags: ' + Math.ceil(cuYd * 27 / CU_FT_PER_40LB_BAG),
        'Bulk cost: $' + numFmt(cuYd * soilData.bulkCostPerCuYd, 2),
        'Delivery: $' + numFmt(state.deliveryFee, 2),
        'Labor: $' + numFmt(sqFt * state.spreadLaborPerSqFt, 2),
        'Total (bulk): $' + numFmt(cuYd * soilData.bulkCostPerCuYd + state.deliveryFee + sqFt * state.spreadLaborPerSqFt, 2)
      ];
      var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'topsoil-estimate.txt'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ─── Share URL ────────────────────────────────────────────────────────────────
  function updateShareUrl() {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + map.getZoom() + '&depth=' + state.depthIn + '&soil=' + state.soilType;
    if (history.replaceState) { history.replaceState(null, '', hash); }
  }

  function loadFromHash() {
    var h = window.location.hash.slice(1);
    if (!h) return;
    var params = {};
    h.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    if (params.lat && params.lng && params.z) {
      map.setView([parseFloat(params.lat), parseFloat(params.lng)], parseInt(params.z, 10));
    }
    if (params.depth) {
      state.depthIn = parseFloat(params.depth) || 4;
      var di = document.getElementById(SLUG + '-depth');
      if (di) di.value = state.depthIn;
    }
    if (params.soil && SOIL_TYPES[params.soil]) {
      state.soilType = params.soil;
      var ss = document.getElementById(SLUG + '-soil-type');
      if (ss) ss.value = state.soilType;
    }
  }

  map.on('moveend', updateShareUrl);
  loadFromHash();

  // ─── Init ─────────────────────────────────────────────────────────────────────
  recalc();

})();
