(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------
  var SLUG = 'asphalt-calculator';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';

  // Asphalt density: 145 lb/cu ft = 2,322 kg/m3 (hot mix asphalt industry standard)
  // Tonnage formula: tons = area_sqft * thickness_in * 145 / (12 * 2000)
  //                       = area_sqft * thickness_in * 0.006042
  // We use 0.005958 per spec (lb/ft2/in to tons):
  //   area_sqft * thickness_in * density_lbft3 / (12 in/ft * 2000 lb/ton)
  //   = area_sqft * thickness_in * 145 / 24000 = 0.0060417
  // Brief: industry often quotes 0.0598 tons/sq-ft/inch — we'll use the exact formula
  var DENSITY_LB_FT3 = 145;   // hot mix asphalt density lb/cu ft
  var LB_PER_TON     = 2000;
  var IN_PER_FT      = 12;

  // Compaction allowance: asphalt compacts 8-12%; use 10% (order 10% extra)
  var COMPACTION_FACTOR = 0.10;

  // Truck capacity for full dump trailer (tons)
  var TRUCK_TONS = 22;

  // Base course: crushed stone density ~110 lb/cu ft
  var BASE_DENSITY_LB_FT3 = 110;

  // Mix type cost defaults ($/ton) — user-editable
  var MIX_DEFAULTS = {
    hma:   { label: 'Hot Mix Asphalt (HMA)',        costPerTon: 130, curing: '24-48 hours' },
    wma:   { label: 'Warm Mix Asphalt (WMA)',        costPerTon: 135, curing: '24-48 hours' },
    cold:  { label: 'Cold Mix / Patching',           costPerTon:  90, curing: 'Immediate (light traffic)' },
    rap:   { label: 'Recycled Asphalt (RAP)',         costPerTon:  80, curing: '24-48 hours' },
    porous:{ label: 'Porous Asphalt',                costPerTon: 150, curing: '24-72 hours' }
  };

  // Thickness presets by use case (surface inches)
  var THICKNESS_PRESETS = {
    residential: { label: 'Residential Driveway', surface: 2.5, base: 6 },
    commercial:  { label: 'Commercial Parking Lot', surface: 3.5, base: 10 },
    road:        { label: 'Road / Street',          surface: 5,   base: 12 },
    walkway:     { label: 'Walkway / Path',          surface: 2,   base: 4  },
    custom:      { label: 'Custom',                  surface: 2,   base: 6  }
  };

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var state = {
    drawnItems: null,
    map: null,
    areaSqFt: 0,
    perimeterFt: 0,
    units: 'imperial'
  };

  // ---------------------------------------------------------------------------
  // DOM HELPERS
  // ---------------------------------------------------------------------------
  function el(id) { return document.getElementById(id); }
  function val(id) { return parseFloat(el(id).value) || 0; }
  function setText(id, text) { var e = el(id); if (e) e.textContent = text; }
  function fmt(n, dec) { return n.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function fmtCost(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

  // ---------------------------------------------------------------------------
  // INIT MAP
  // ---------------------------------------------------------------------------
  function initMap() {
    var mapEl = el(SLUG + '-map');
    if (!mapEl) return;

    // Parse URL hash for share state
    var hashState = loadStateFromUrl();

    var initLat  = (hashState && hashState.lat)  ? parseFloat(hashState.lat)  : 39.5;
    var initLng  = (hashState && hashState.lng)  ? parseFloat(hashState.lng)  : -98.35;
    var initZoom = (hashState && hashState.z)    ? parseInt(hashState.z, 10)  : 4;

    var map = L.map(SLUG + '-map', {
      center: [initLat, initLng],
      zoom:   initZoom,
      zoomControl: true
    });

    state.map = map;

    // Satellite basemap
    var satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 20 }
    );

    // Street basemap
    var streets = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
    );

    satellite.addTo(map);

    L.control.layers(
      { 'Satellite': satellite, 'Street Map': streets },
      {},
      { position: 'topright' }
    ).addTo(map);

    // Drawn items layer
    var drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    state.drawnItems = drawnItems;

    // Draw controls
    var drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        poly: { allowIntersection: false }
      },
      draw: {
        polygon:   { shapeOptions: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.25 } },
        rectangle: { shapeOptions: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.25 } },
        polyline:  false,
        circle:    false,
        circlemarker: false,
        marker:    false
      }
    });
    map.addControl(drawControl);

    // Events
    map.on(L.Draw.Event.CREATED, function (e) {
      drawnItems.addLayer(e.layer);
      updateMeasurements();
    });

    map.on(L.Draw.Event.EDITED, function () { updateMeasurements(); });
    map.on(L.Draw.Event.DELETED, function () { updateMeasurements(); });

    map.on('moveend', function () { updateShareUrl(map); });

    return map;
  }

  // ---------------------------------------------------------------------------
  // MEASUREMENTS
  // ---------------------------------------------------------------------------
  function updateMeasurements() {
    var totalSqM = 0;
    var totalPerimM = 0;

    state.drawnItems.eachLayer(function (layer) {
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        var latlngs = layer.getLatLngs()[0];
        totalSqM += L.GeometryUtil.geodesicArea(latlngs);
        // Perimeter: sum of consecutive point distances
        for (var i = 0; i < latlngs.length; i++) {
          var next = latlngs[(i + 1) % latlngs.length];
          totalPerimM += latlngs[i].distanceTo(next);
        }
      }
    });

    // Convert to imperial
    var sqFt = totalSqM * 10.7639;
    var sqYd = sqFt / 9;
    var sqM  = totalSqM;
    var perimFt = totalPerimM * 3.28084;

    state.areaSqFt   = sqFt;
    state.perimeterFt = perimFt;

    // Display measurements
    setText(SLUG + '-area-sqft', fmt(sqFt) + ' sq ft');
    setText(SLUG + '-area-sqm',  fmt(sqM, 1) + ' sq m');
    setText(SLUG + '-area-sqyd', fmt(sqYd) + ' sq yd');
    setText(SLUG + '-area-acres', (sqFt / 43560).toFixed(3) + ' acres');

    updateCalculations();
  }

  // ---------------------------------------------------------------------------
  // CORE CALCULATIONS
  // ---------------------------------------------------------------------------
  function updateCalculations() {
    var sqFt          = state.areaSqFt;
    var thicknessIn   = val(SLUG + '-thickness');
    var baseThickIn   = val(SLUG + '-base-thickness');
    var wastePct      = val(SLUG + '-waste') / 100;
    var mixType       = el(SLUG + '-mix-type').value;
    var includeComp   = el(SLUG + '-compaction').checked;

    // --- Surface course tonnage ---
    // tons = area_sqft * thickness_in * density_lb_ft3 / (12 * 2000)
    var rawTons = sqFt * thicknessIn * DENSITY_LB_FT3 / (IN_PER_FT * LB_PER_TON);

    // Compaction allowance (asphalt laid loose compacts by ~10%)
    var compFactor = includeComp ? (1 + COMPACTION_FACTOR) : 1;
    var tonsWithComp = rawTons * compFactor;

    // Waste factor
    var tonsOrdered  = tonsWithComp * (1 + wastePct);

    // Round up to nearest quarter-truck
    var truckQuarter = TRUCK_TONS / 4;
    var tonsRoundUp  = Math.ceil(tonsOrdered / truckQuarter) * truckQuarter;

    // Cubic yards (loose): 1 ton loose asphalt ~= 0.64 cu yd (based on density 145 lb/ft3 loose)
    // Actually: volume (cu ft) = tons * 2000 / 145; cu yd = cu ft / 27
    var cuFt = tonsOrdered * LB_PER_TON / DENSITY_LB_FT3;
    var cuYd = cuFt / 27;

    // Truck loads (full trailer ~22 tons)
    var truckLoads = Math.ceil(tonsOrdered / TRUCK_TONS);

    // Cold mix bags (50 lb bag covers ~0.5 sq ft at 2 inches, so coverage = 0.5*(2/thicknessIn) sq ft)
    // More precisely: bag_sqft = (50/DENSITY_LB_FT3) * IN_PER_FT / thicknessIn
    var bagSqFt = (50 / DENSITY_LB_FT3) * IN_PER_FT / Math.max(thicknessIn, 0.5);
    var bagsNeeded = sqFt > 0 && thicknessIn > 0 ? Math.ceil(sqFt / bagSqFt) : 0;

    // --- Base course (crushed stone) ---
    var baseTons = sqFt * baseThickIn * BASE_DENSITY_LB_FT3 / (IN_PER_FT * LB_PER_TON);
    var baseTonsOrdered = baseTons * (1 + wastePct);
    var baseCuFt = baseTonsOrdered * LB_PER_TON / BASE_DENSITY_LB_FT3;
    var baseCuYd = baseCuFt / 27;
    var baseLoads = Math.ceil(baseTonsOrdered / 20); // gravel trucks ~20 ton

    // Display surface results
    setText(SLUG + '-tons-raw',       fmt(rawTons, 2) + ' tons');
    setText(SLUG + '-tons-compacted', fmt(tonsWithComp, 2) + ' tons');
    setText(SLUG + '-tons-ordered',   fmt(tonsOrdered, 2) + ' tons');
    setText(SLUG + '-tons-rounded',   fmt(tonsRoundUp, 2) + ' tons');
    setText(SLUG + '-cu-yards',       fmt(cuYd, 1) + ' cu yd');
    setText(SLUG + '-truck-loads',    truckLoads + ' loads (' + TRUCK_TONS + '-ton trailer)');
    setText(SLUG + '-bags-50lb',      fmt(bagsNeeded) + ' bags (50 lb)');

    // Display base results
    setText(SLUG + '-base-tons',      fmt(baseTonsOrdered, 2) + ' tons');
    setText(SLUG + '-base-cuyd',      fmt(baseCuYd, 1) + ' cu yd');
    setText(SLUG + '-base-loads',     baseLoads + ' loads');

    // Curing time from mix
    var mixData = MIX_DEFAULTS[mixType] || MIX_DEFAULTS.hma;
    setText(SLUG + '-curing-time', mixData.curing);

    updateCosts(tonsOrdered, sqFt);
  }

  // ---------------------------------------------------------------------------
  // COST CALCULATIONS
  // ---------------------------------------------------------------------------
  function updateCosts(tonsOrdered, sqFt) {
    var costPerTon   = val(SLUG + '-cost-per-ton');
    var truckingPerLoad = val(SLUG + '-trucking-per-load');
    var laborPerSqFt = val(SLUG + '-labor-per-sqft');
    var sealCoatPerSqFt = val(SLUG + '-sealcoat-per-sqft');
    var stripingPerLf = val(SLUG + '-striping-per-lf');
    var perimFt = state.perimeterFt;

    var truckLoads = Math.ceil(tonsOrdered / TRUCK_TONS) || 0;

    var matCost      = tonsOrdered * costPerTon;
    var truckCost    = truckLoads * truckingPerLoad;
    var laborCost    = sqFt * laborPerSqFt;
    var sealCost     = sqFt * sealCoatPerSqFt;
    var stripingCost = perimFt * stripingPerLf;
    var totalCost    = matCost + truckCost + laborCost + sealCost + stripingCost;
    var costPerSqFt  = sqFt > 0 ? totalCost / sqFt : 0;

    setText(SLUG + '-cost-materials',  fmtCost(matCost));
    setText(SLUG + '-cost-trucking',   fmtCost(truckCost));
    setText(SLUG + '-cost-labor',      fmtCost(laborCost));
    setText(SLUG + '-cost-sealcoat',   fmtCost(sealCost));
    setText(SLUG + '-cost-striping',   fmtCost(stripingCost));
    setText(SLUG + '-cost-total',      fmtCost(totalCost));
    setText(SLUG + '-cost-per-sqft',   '$' + costPerSqFt.toFixed(2) + ' / sq ft');
  }

  // ---------------------------------------------------------------------------
  // ADDRESS SEARCH
  // ---------------------------------------------------------------------------
  function initAddressSearch() {
    var btn   = el(SLUG + '-search-btn');
    var input = el(SLUG + '-address-input');
    if (!btn || !input) return;

    btn.addEventListener('click', function () { doSearch(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

    function doSearch() {
      var q = input.value.trim();
      if (!q) return;
      btn.textContent = 'Searching...';
      btn.disabled = true;

      var url = NOMINATIM + '?q=' + encodeURIComponent(q) + '&format=json&limit=1';
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btn.textContent = 'Search';
          btn.disabled = false;
          if (data && data.length > 0) {
            var lat = parseFloat(data[0].lat);
            var lon = parseFloat(data[0].lon);
            state.map.setView([lat, lon], 18);
          } else {
            alert('Address not found. Try a more specific address.');
          }
        })
        .catch(function () {
          btn.textContent = 'Search';
          btn.disabled = false;
          alert('Search failed. Please try again.');
        });
    }
  }

  // ---------------------------------------------------------------------------
  // THICKNESS PRESETS
  // ---------------------------------------------------------------------------
  function initThicknessPresets() {
    var sel = el(SLUG + '-use-type');
    if (!sel) return;
    sel.addEventListener('change', function () {
      var preset = THICKNESS_PRESETS[sel.value];
      if (!preset || sel.value === 'custom') return;
      el(SLUG + '-thickness').value = preset.surface;
      el(SLUG + '-base-thickness').value = preset.base;
      updateCalculations();
    });
  }

  // ---------------------------------------------------------------------------
  // MIX TYPE COST SYNC
  // ---------------------------------------------------------------------------
  function initMixTypeSync() {
    var sel = el(SLUG + '-mix-type');
    if (!sel) return;
    sel.addEventListener('change', function () {
      var mix = MIX_DEFAULTS[sel.value];
      if (mix) {
        var costEl = el(SLUG + '-cost-per-ton');
        if (costEl) costEl.value = mix.costPerTon;
      }
      updateCalculations();
    });
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------
  function initExport() {
    var geojsonBtn = el(SLUG + '-export-geojson');
    var kmlBtn     = el(SLUG + '-export-kml');
    var printBtn   = el(SLUG + '-print');

    if (geojsonBtn) {
      geojsonBtn.addEventListener('click', function () {
        if (state.drawnItems.getLayers().length === 0) {
          alert('Draw a shape first.'); return;
        }
        var gj = state.drawnItems.toGeoJSON();
        var blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
        triggerDownload(blob, 'asphalt-area.geojson');
      });
    }

    if (kmlBtn) {
      kmlBtn.addEventListener('click', function () {
        if (state.drawnItems.getLayers().length === 0) {
          alert('Draw a shape first.'); return;
        }
        var kml = buildKML();
        var blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        triggerDownload(blob, 'asphalt-area.kml');
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', function () { window.print(); });
    }
  }

  function buildKML() {
    var lines = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      '<Document><name>Asphalt Calculator Area</name>'];

    state.drawnItems.eachLayer(function (layer) {
      if (layer instanceof L.Polygon) {
        lines.push('<Placemark><name>Asphalt Area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>');
        layer.getLatLngs()[0].forEach(function (ll) {
          lines.push(ll.lng + ',' + ll.lat + ',0');
        });
        lines.push('</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>');
      }
    });

    lines.push('</Document></kml>');
    return lines.join('\n');
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a   = document.createElement('a');
    a.href  = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // SHARE URL
  // ---------------------------------------------------------------------------
  function updateShareUrl(map) {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + map.getZoom();
    if (history.replaceState) history.replaceState(null, '', hash);
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var out = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // TABS
  // ---------------------------------------------------------------------------
  function initTabs() {
    var tabs = document.querySelectorAll('#' + SLUG + '-container .ac-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var panel = tab.getAttribute('data-panel');
        var parent = tab.closest('.ac-tabs-wrapper');
        parent.querySelectorAll('.ac-tab').forEach(function (t) { t.classList.remove('active'); });
        parent.querySelectorAll('.ac-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var panelEl = document.getElementById(panel);
        if (panelEl) panelEl.classList.add('active');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // LIVE INPUT LISTENERS
  // ---------------------------------------------------------------------------
  function initInputListeners() {
    var ids = [
      SLUG + '-thickness',
      SLUG + '-base-thickness',
      SLUG + '-waste',
      SLUG + '-cost-per-ton',
      SLUG + '-trucking-per-load',
      SLUG + '-labor-per-sqft',
      SLUG + '-sealcoat-per-sqft',
      SLUG + '-striping-per-lf'
    ];
    ids.forEach(function (id) {
      var e = el(id);
      if (e) e.addEventListener('input', updateCalculations);
    });

    var compEl = el(SLUG + '-compaction');
    if (compEl) compEl.addEventListener('change', updateCalculations);
  }

  // ---------------------------------------------------------------------------
  // CLEAR MAP
  // ---------------------------------------------------------------------------
  function initClearBtn() {
    var btn = el(SLUG + '-clear-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      state.drawnItems.clearLayers();
      state.areaSqFt = 0;
      state.perimeterFt = 0;
      updateMeasurements();
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------
  function boot() {
    initMap();
    initAddressSearch();
    initThicknessPresets();
    initMixTypeSync();
    initTabs();
    initInputListeners();
    initExport();
    initClearBtn();
    updateCalculations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
