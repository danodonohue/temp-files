(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Paver size presets: { label, widthIn, heightIn, sqFtEach, paversPerSqFt }
  // ---------------------------------------------------------------------------
  var PAVER_PRESETS = {
    '4x8':   { label: '4" x 8" Brick',   widthIn: 4,  heightIn: 8,  sqFtEach: 0.2222, paversPerSqFt: 4.50  },
    '6x6':   { label: '6" x 6"',         widthIn: 6,  heightIn: 6,  sqFtEach: 0.25,   paversPerSqFt: 4.00  },
    '6x9':   { label: '6" x 9"',         widthIn: 6,  heightIn: 9,  sqFtEach: 0.375,  paversPerSqFt: 2.67  },
    '8x8':   { label: '8" x 8"',         widthIn: 8,  heightIn: 8,  sqFtEach: 0.4444, paversPerSqFt: 2.25  },
    '8x16':  { label: '8" x 16"',        widthIn: 8,  heightIn: 16, sqFtEach: 0.8889, paversPerSqFt: 1.125 },
    '12x12': { label: '12" x 12"',       widthIn: 12, heightIn: 12, sqFtEach: 1.0,    paversPerSqFt: 1.00  },
    '16x16': { label: '16" x 16"',       widthIn: 16, heightIn: 16, sqFtEach: 1.7778, paversPerSqFt: 0.5625},
    '24x24': { label: '24" x 24"',       widthIn: 24, heightIn: 24, sqFtEach: 4.0,    paversPerSqFt: 0.25  },
    'custom': { label: 'Custom Size',    widthIn: 12, heightIn: 12, sqFtEach: 1.0,    paversPerSqFt: 1.00  }
  };

  // Pattern waste additions (percentage points added to base waste)
  var PATTERN_WASTE = {
    'running-bond': 5,
    'stack-bond':   5,
    'basket-weave': 7,
    'herringbone':  15,
    'pinwheel':     10
  };

  var state = {
    areaSqFt: 0,
    perimeterFt: 0,
    unit: 'imperial',
    drawnLayers: [],
    currentPreset: '12x12',
    customWidthIn: 12,
    customHeightIn: 12,
    pattern: 'running-bond',
    wastePct: 10
  };

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    initMap();
    populatePresets();
    bindEvents();
    loadFromHash();
    updateCalculations();
  }

  // ---------------------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------------------
  var map, drawnItems, drawControl;

  function initMap() {
    map = L.map('paver-calculator-map', {
      center: [39.8283, -98.5795],
      zoom: 4,
      zoomControl: true
    });

    var satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community', maxZoom: 19 }
    );

    var streetLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
    );

    satelliteLayer.addTo(map);

    L.control.layers({ 'Satellite': satelliteLayer, 'Street Map': streetLayer }, {}).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: {
        polygon:   { shapeOptions: { color: '#a1887f', fillColor: '#a1887f', fillOpacity: 0.25 } },
        rectangle: { shapeOptions: { color: '#a1887f', fillColor: '#a1887f', fillOpacity: 0.25 } },
        polyline:  { shapeOptions: { color: '#6d4c41' } },
        circle:    false,
        circlemarker: false,
        marker:    false
      }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) {
      drawnItems.addLayer(e.layer);
      recalcFromDrawn();
    });

    map.on(L.Draw.Event.EDITED, function () { recalcFromDrawn(); });
    map.on(L.Draw.Event.DELETED, function () { recalcFromDrawn(); });
    map.on('moveend zoomend', saveToHash);
  }

  function recalcFromDrawn() {
    var totalAreaSqM = 0;
    var totalPerimM = 0;
    drawnItems.eachLayer(function (layer) {
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        var latlngs = layer.getLatLngs()[0];
        totalAreaSqM += L.GeometryUtil.geodesicArea(latlngs);
        for (var i = 0; i < latlngs.length; i++) {
          var next = latlngs[(i + 1) % latlngs.length];
          totalPerimM += latlngs[i].distanceTo(next);
        }
      } else if (layer instanceof L.Polyline) {
        var pts = layer.getLatLngs();
        for (var j = 0; j < pts.length - 1; j++) {
          totalPerimM += pts[j].distanceTo(pts[j + 1]);
        }
      }
    });
    // Convert: 1 sq m = 10.7639 sq ft; 1 m = 3.28084 ft
    state.areaSqFt = totalAreaSqM * 10.7639;
    state.perimeterFt = totalPerimM * 3.28084;
    updateCalculations();
  }

  // ---------------------------------------------------------------------------
  // Address search
  // ---------------------------------------------------------------------------
  function searchAddress() {
    var query = document.getElementById('paver-address-input').value.trim();
    if (!query) return;
    var btn = document.getElementById('paver-search-btn');
    btn.textContent = 'Searching...';
    btn.disabled = true;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.length > 0) {
          var lat = parseFloat(data[0].lat);
          var lon = parseFloat(data[0].lon);
          map.setView([lat, lon], 19);
        } else {
          alert('Address not found. Try a more specific address.');
        }
      })
      .catch(function () { alert('Search failed. Please try again.'); })
      .finally(function () {
        btn.textContent = 'Search';
        btn.disabled = false;
      });
  }

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------
  function populatePresets() {
    var sel = document.getElementById('paver-size-preset');
    sel.innerHTML = '';
    Object.keys(PAVER_PRESETS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = PAVER_PRESETS[key].label;
      sel.appendChild(opt);
    });
    sel.value = '12x12';
    toggleCustomInputs('12x12');
  }

  function toggleCustomInputs(key) {
    var row = document.getElementById('paver-custom-row');
    row.style.display = (key === 'custom') ? 'flex' : 'none';
  }

  function getEffectivePreset() {
    var key = state.currentPreset;
    if (key === 'custom') {
      var w = parseFloat(document.getElementById('paver-custom-width').value) || 12;
      var h = parseFloat(document.getElementById('paver-custom-height').value) || 12;
      var sqFt = (w * h) / 144;
      return { sqFtEach: sqFt, paversPerSqFt: sqFt > 0 ? 1 / sqFt : 0 };
    }
    return PAVER_PRESETS[key];
  }

  // ---------------------------------------------------------------------------
  // Core calculations
  // ---------------------------------------------------------------------------
  function updateCalculations() {
    var areaSqFt = state.areaSqFt;
    var perimFt  = state.perimeterFt;
    var preset   = getEffectivePreset();

    // Waste
    var patternExtra = PATTERN_WASTE[state.pattern] || 5;
    var wastePct = parseFloat(document.getElementById('paver-waste-pct').value) || 10;
    state.wastePct = wastePct;
    var wasteFactor = 1 + (wastePct / 100);

    // Paver count
    var paverCount = Math.ceil(areaSqFt * preset.paversPerSqFt * wasteFactor);

    // Base gravel: 4" default → 4/12 ft depth; density ~110 lb/cu ft → 0.0611 cu yd/cu ft
    var baseDepthIn = parseFloat(document.getElementById('paver-base-depth').value) || 4;
    var baseVolCuFt = areaSqFt * (baseDepthIn / 12);
    var baseVolCuYd = baseVolCuFt / 27;

    // Bedding sand: 1" layer → 1/12 ft depth
    var sandDepthIn = parseFloat(document.getElementById('paver-sand-depth').value) || 1;
    var sandVolCuFt = areaSqFt * (sandDepthIn / 12);

    // Polymeric joint sand: ~1 bag per 50 sq ft (with waste applied)
    var jointSandBags = Math.ceil((areaSqFt * wasteFactor) / 50);

    // Edge restraint: perimeter in linear feet
    var edgeLf = Math.ceil(perimFt);

    // Costs
    var costPerPaver = parseFloat(document.getElementById('paver-cost-per-paver').value) || 1.50;
    var costGravelCuYd = parseFloat(document.getElementById('paver-cost-gravel').value) || 45;
    var costSandBag = parseFloat(document.getElementById('paver-cost-joint-sand').value) || 30;
    var costEdgingLf = parseFloat(document.getElementById('paver-cost-edging').value) || 2;
    var laborSqFt   = parseFloat(document.getElementById('paver-labor-sqft').value) || 8;
    var permitFee   = parseFloat(document.getElementById('paver-permit-fee').value) || 0;

    var costPavers    = paverCount * costPerPaver;
    var costGravel    = baseVolCuYd * costGravelCuYd;
    var costSand      = jointSandBags * costSandBag;
    var costEdging    = edgeLf * costEdgingLf;
    var costLabor     = areaSqFt * laborSqFt;
    var totalCost     = costPavers + costGravel + costSand + costEdging + costLabor + permitFee;
    var costPerSqFt   = areaSqFt > 0 ? totalCost / areaSqFt : 0;

    // Unit display
    var isMetric = (state.unit === 'metric');
    var displayArea = isMetric ? (areaSqFt / 10.7639).toFixed(2) + ' sq m' : areaSqFt.toFixed(2) + ' sq ft';
    var displayAreaSqFt = areaSqFt.toFixed(2) + ' sq ft';
    var displayAreaSqM  = (areaSqFt / 10.7639).toFixed(2) + ' sq m';
    var displayAreaSqYd = (areaSqFt / 9).toFixed(2) + ' sq yd';
    var displayPerim = isMetric ? (perimFt / 3.28084).toFixed(1) + ' m' : perimFt.toFixed(1) + ' ft';

    // Update DOM
    setText('paver-area-sqft',   displayAreaSqFt);
    setText('paver-area-sqm',    displayAreaSqM);
    setText('paver-area-sqyd',   displayAreaSqYd);
    setText('paver-perimeter',   displayPerim);

    setText('paver-count',       paverCount.toLocaleString() + ' pavers');
    setText('paver-base-cuyd',   baseVolCuYd.toFixed(2) + ' cu yd');
    setText('paver-sand-cuft',   sandVolCuFt.toFixed(2) + ' cu ft');
    setText('paver-joint-bags',  jointSandBags.toLocaleString() + ' bags');
    setText('paver-edge-lf',     edgeLf.toLocaleString() + ' lf');

    setText('paver-cost-pavers-total',  '$' + costPavers.toFixed(2));
    setText('paver-cost-gravel-total',  '$' + costGravel.toFixed(2));
    setText('paver-cost-sand-total',    '$' + costSand.toFixed(2));
    setText('paver-cost-edging-total',  '$' + costEdging.toFixed(2));
    setText('paver-cost-labor-total',   '$' + costLabor.toFixed(2));
    setText('paver-cost-permit-total',  '$' + parseFloat(permitFee).toFixed(2));
    setText('paver-total-cost',         '$' + totalCost.toFixed(2));
    setText('paver-cost-per-sqft',      areaSqFt > 0 ? '$' + costPerSqFt.toFixed(2) + '/sq ft' : '--');
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ---------------------------------------------------------------------------
  // Pattern selector
  // ---------------------------------------------------------------------------
  function bindPatternCards() {
    var cards = document.querySelectorAll('.pc-pattern-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        cards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        state.pattern = card.getAttribute('data-pattern');
        // Suggest waste pct based on pattern
        var extra = PATTERN_WASTE[state.pattern] || 5;
        var baseWaste = 10;
        document.getElementById('paver-waste-pct').value = baseWaste + (extra - 5);
        updateCalculations();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  function bindEvents() {
    // Address search
    document.getElementById('paver-search-btn').addEventListener('click', searchAddress);
    document.getElementById('paver-address-input').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') searchAddress();
    });

    // Unit toggle
    document.getElementById('paver-units-select').addEventListener('change', function () {
      state.unit = this.value;
      updateCalculations();
    });

    // Paver size preset
    document.getElementById('paver-size-preset').addEventListener('change', function () {
      state.currentPreset = this.value;
      toggleCustomInputs(this.value);
      updateCalculations();
    });

    // Custom dimensions
    ['paver-custom-width', 'paver-custom-height'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateCalculations);
    });

    // Waste, base, sand depth
    ['paver-waste-pct', 'paver-base-depth', 'paver-sand-depth'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateCalculations);
    });

    // Cost inputs
    ['paver-cost-per-paver', 'paver-cost-gravel', 'paver-cost-joint-sand',
     'paver-cost-edging', 'paver-labor-sqft', 'paver-permit-fee'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateCalculations);
    });

    // Pattern cards
    bindPatternCards();

    // Export buttons
    document.getElementById('paver-export-geojson').addEventListener('click', exportGeoJSON);
    document.getElementById('paver-print').addEventListener('click', function () { window.print(); });

    // Clear button
    document.getElementById('paver-clear-btn').addEventListener('click', function () {
      drawnItems.clearLayers();
      state.areaSqFt = 0;
      state.perimeterFt = 0;
      updateCalculations();
    });
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  function exportGeoJSON() {
    var features = [];
    drawnItems.eachLayer(function (layer) {
      if (layer.toGeoJSON) features.push(layer.toGeoJSON());
    });
    var geojson = { type: 'FeatureCollection', features: features };
    var blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'paver-project.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Hash state
  // ---------------------------------------------------------------------------
  function saveToHash() {
    var center = map.getCenter();
    var hash = '#lat=' + center.lat.toFixed(5) +
               '&lng=' + center.lng.toFixed(5) +
               '&z=' + map.getZoom();
    history.replaceState(null, '', hash);
  }

  function loadFromHash() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    if (params.lat && params.lng && params.z) {
      map.setView([parseFloat(params.lat), parseFloat(params.lng)], parseInt(params.z, 10));
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
