(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  var map = null;
  var drawnItems = null;
  var allMeasurements = [];

  // ─── Public API ───────────────────────────────────────────────────────────
  window.roofCalc = {
    searchAddress:          searchAddress,
    getCurrentLocation:     getCurrentLocation,
    clearAllDrawings:       clearAllDrawings,
    toggleMeasurementUnits: toggleMeasurementUnits,
    updateCalculations:     updateCalculations,
    toggleAdvanced:         toggleAdvanced,
    exportCalculations:     exportCalculations,
    saveCalculations:       saveCalculations,
    printCalculations:      printCalculations,
    shareCalculations:      shareCalculations
  };

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(message) {
    var toast = document.getElementById('roof-calc-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('roof-calc-toast-show');
    setTimeout(function () {
      toast.classList.remove('roof-calc-toast-show');
    }, 3000);
  }

  // ─── UI toggles ───────────────────────────────────────────────────────────
  function toggleAdvanced() {
    var content = document.getElementById('roof-calc-advanced-content');
    var toggle  = document.getElementById('roof-calc-toggle-advanced');
    if (!content || !toggle) return;
    if (content.classList.contains('roof-calc-show')) {
      content.classList.remove('roof-calc-show');
      toggle.textContent = '\u25B6 Advanced Settings';
    } else {
      content.classList.add('roof-calc-show');
      toggle.textContent = '\u25BC Advanced Settings';
    }
  }

  function toggleMeasurementUnits() {
    var unitEl = document.getElementById('roof-calc-unit-select');
    if (!unitEl) return;
    unitEl.value = unitEl.value === 'feet' ? 'meters' : 'feet';
    updateCalculations();
    showToast('Switched to ' + (unitEl.value === 'feet' ? 'Imperial' : 'Metric') + ' units');
  }

  // ─── Geolocation ──────────────────────────────────────────────────────────
  function getCurrentLocation() {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported');
      return;
    }
    showToast('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        if (map) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 19);
          showToast('Location found!');
        }
      },
      function () { showToast('Could not get your location'); }
    );
  }

  // ─── Map initialisation ───────────────────────────────────────────────────
  function initMap() {
    var mapEl = document.getElementById('roof-calc-map');
    if (!mapEl) return;

    map = L.map('roof-calc-map').setView([40.7128, -74.006], 13);

    // Satellite base layer
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 20 }
    ).addTo(map);

    // Street overlay for reference
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      opacity: 0.3,
      maxZoom: 20
    }).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    var shapeOpts = {
      color: '#36b9cc',
      weight: 3,
      opacity: 0.8,
      fillColor: '#36b9cc',
      fillOpacity: 0.3
    };

    map.addControl(new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          drawError: { color: '#e1e100', message: '<strong>Error:</strong> Edges cannot cross!' },
          shapeOptions: shapeOpts
        },
        rectangle: { shapeOptions: shapeOpts },
        circle:       false,
        marker:       false,
        polyline:     false,
        circlemarker: false
      },
      edit: { featureGroup: drawnItems, remove: true }
    }));

    map.on(L.Draw.Event.CREATED, function (e) {
      drawnItems.addLayer(e.layer);
      recalculate();
      showToast('Roof section added');
    });
    map.on(L.Draw.Event.EDITED,  function () { recalculate(); showToast('Measurements updated'); });
    map.on(L.Draw.Event.DELETED, function () { recalculate(); showToast('Section removed'); });
  }

  // ─── Area / perimeter helpers ─────────────────────────────────────────────
  // Spherical excess formula (returns m²)
  function geodesicArea(latlngs) {
    if (latlngs.length < 3) return 0;
    var R = 6371000;
    var area = 0;
    for (var i = 0; i < latlngs.length; i++) {
      var j  = (i + 1) % latlngs.length;
      var xi = latlngs[i].lat * Math.PI / 180;
      var yi = latlngs[i].lng * Math.PI / 180;
      var xj = latlngs[j].lat * Math.PI / 180;
      var yj = latlngs[j].lng * Math.PI / 180;
      area  += (yj - yi) * (2 + Math.sin(xi) + Math.sin(xj));
    }
    return Math.abs(area) * R * R / 2;
  }

  // ─── Settings helper ──────────────────────────────────────────────────────
  function getSettings() {
    return {
      pitch:      parseFloat((document.getElementById('roof-calc-pitch')          || {}).value) || 30,
      unit:       ((document.getElementById('roof-calc-unit-select')               || {}).value) || 'feet',
      wastePct:   parseFloat((document.getElementById('roof-calc-waste-factor')    || {}).value) || 10,
      eavesIn:    parseFloat((document.getElementById('roof-calc-eaves-overhang')  || {}).value) || 0
    };
  }

  // ─── Core calculation ─────────────────────────────────────────────────────
  function recalculate() {
    allMeasurements = [];

    if (!drawnItems || drawnItems.getLayers().length === 0) {
      renderValues({ baseArea: '0', roofArea: '0', totalArea: '0', perimeter: '0', pitchRatio: '0', squares: '0' });
      updateQuickPanel();
      return;
    }

    var s        = getSettings();
    var areaM2   = 0;
    var perimM   = 0;

    drawnItems.eachLayer(function (layer) {
      if (!(layer instanceof L.Polygon)) return;        // L.Rectangle extends L.Polygon
      var pts       = layer.getLatLngs()[0];
      var secArea   = geodesicArea(pts);
      var secPerim  = 0;
      for (var i = 0; i < pts.length; i++) {
        secPerim += pts[i].distanceTo(pts[(i + 1) % pts.length]);
      }
      areaM2  += secArea;
      perimM  += secPerim;
      allMeasurements.push({ area: secArea, perimeter: secPerim });
    });

    if (areaM2 === 0) return;

    // Eaves overhang: extend footprint by overhang strip around perimeter
    // eavesIn (inches) → metres; strip area = perimeter × overhang_depth
    var eavesM       = s.eavesIn * 0.0254;
    var footprintM2  = areaM2 + perimM * eavesM;

    // Pitch factor: actual slope area = footprint / cos(pitch)
    var pitchRad     = s.pitch * Math.PI / 180;
    var roofM2       = footprintM2 / Math.cos(pitchRad);

    // Waste factor
    var totalM2      = roofM2 * (1 + s.wastePct / 100);

    // Unit conversion
    var imperial     = s.unit === 'feet';
    var SQ_FT        = 10.7639;
    var FT           = 3.28084;

    var dispBase     = imperial ? footprintM2 * SQ_FT : footprintM2;
    var dispRoof     = imperial ? roofM2      * SQ_FT : roofM2;
    var dispTotal    = imperial ? totalM2     * SQ_FT : totalM2;
    var dispPerim    = imperial ? perimM      * FT    : perimM;

    var rise         = Math.tan(pitchRad) * 12;
    var pitchRatio   = (Math.round(rise * 10) / 10) + ':12';

    // Roofing squares always in imperial (1 square = 100 ft²)
    var squares      = Math.ceil((imperial ? dispTotal : totalM2 * SQ_FT) / 100);

    renderValues({
      baseArea:   Math.round(dispBase).toLocaleString(),
      roofArea:   Math.round(dispRoof).toLocaleString(),
      totalArea:  Math.round(dispTotal).toLocaleString(),
      perimeter:  Math.round(dispPerim).toLocaleString(),
      pitchRatio: pitchRatio,
      squares:    squares.toLocaleString()
    });

    updateQuickPanel();
  }

  // ─── DOM updates ──────────────────────────────────────────────────────────
  function renderValues(v) {
    var idMap = {
      'roof-calc-base-area':   v.baseArea,
      'roof-calc-roof-area':   v.roofArea,
      'roof-calc-total-area':  v.totalArea,
      'roof-calc-perimeter':   v.perimeter,
      'roof-calc-pitch-ratio': v.pitchRatio,
      'roof-calc-squares':     v.squares
    };
    Object.keys(idMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = idMap[id];
    });

    // Update unit spans (uses data-unit-type attribute)
    var unit     = getSettings().unit;
    var areaUnit = unit === 'feet' ? 'ft2' : 'm2';
    var lenUnit  = unit === 'feet' ? 'ft'  : 'm';
    var spans    = document.querySelectorAll('#roof-calc-container .roof-calc-result-unit');
    spans.forEach(function (el) {
      var t = el.getAttribute('data-unit-type');
      if (t === 'area')   el.textContent = areaUnit;
      if (t === 'length') el.textContent = lenUnit;
    });
  }

  function updateQuickPanel() {
    var panel   = document.getElementById('roof-calc-quick-panel');
    var countEl = document.getElementById('roof-calc-section-count');
    if (!panel) return;

    var count = drawnItems ? drawnItems.getLayers().length : 0;
    if (count === 0) { panel.style.display = 'none'; return; }

    panel.style.display = 'block';
    if (countEl) countEl.textContent = count;

    var unit     = getSettings().unit;
    var areaUnit = unit === 'feet' ? 'ft2' : 'm2';
    var lenUnit  = unit === 'feet' ? 'ft'  : 'm';

    var qArea  = document.getElementById('roof-calc-quick-area');
    var qPerim = document.getElementById('roof-calc-quick-perimeter');
    var mBase  = document.getElementById('roof-calc-base-area');
    var mPerim = document.getElementById('roof-calc-perimeter');

    if (qArea  && mBase)  qArea.textContent  = mBase.textContent  + ' ' + areaUnit;
    if (qPerim && mPerim) qPerim.textContent = mPerim.textContent + ' ' + lenUnit;
  }

  function updateCalculations() {
    recalculate();
  }

  // ─── Address search ───────────────────────────────────────────────────────
  function searchAddress() {
    var input = document.getElementById('roof-calc-address-input');
    if (!input || !input.value.trim()) { showToast('Please enter an address'); return; }

    showToast('Searching...');
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(input.value))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.length > 0) {
          map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 19);
          showToast('Location found!');
        } else {
          showToast('Address not found. Try a different search term.');
        }
      })
      .catch(function () { showToast('Error searching for address'); });
  }

  // ─── Clear drawings ───────────────────────────────────────────────────────
  function clearAllDrawings() {
    if (!drawnItems || drawnItems.getLayers().length === 0) {
      showToast('No drawings to clear');
      return;
    }
    if (!confirm('Clear all roof sections?')) return;
    drawnItems.clearLayers();
    recalculate();
    showToast('All sections cleared');
  }

  // ─── Export / save ────────────────────────────────────────────────────────
  function exportCalculations() {
    showToast('Export feature coming soon!');
  }

  function saveCalculations() {
    try {
      localStorage.setItem('roofCalculations', JSON.stringify({
        measurements: allMeasurements,
        settings:     getSettings(),
        timestamp:    new Date().toISOString()
      }));
      showToast('Project saved locally!');
    } catch (e) {
      showToast('Error saving project');
    }
  }

  function printCalculations() {
    window.print();
  }

  function shareCalculations() {
    showToast('Share feature coming soon!');
  }

  // ─── Event listeners ──────────────────────────────────────────────────────
  function setupEvents() {
    var addrInput = document.getElementById('roof-calc-address-input');
    if (addrInput) {
      addrInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchAddress();
      });
    }

    ['roof-calc-pitch', 'roof-calc-waste-factor', 'roof-calc-eaves-overhang'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () {
        if (drawnItems && drawnItems.getLayers().length > 0) recalculate();
      });
    });
  }

  // ─── Restore saved settings ───────────────────────────────────────────────
  function loadSavedSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem('roofCalculations') || 'null');
      if (!saved || !saved.settings) return;
      var s = saved.settings;
      var fieldMap = {
        'roof-calc-pitch':          s.pitch,
        'roof-calc-unit-select':    s.unit,
        'roof-calc-waste-factor':   s.wastePct,
        'roof-calc-eaves-overhang': s.eavesIn
      };
      Object.keys(fieldMap).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && fieldMap[id] != null) el.value = fieldMap[id];
      });
    } catch (e) { /* no saved data */ }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    if (typeof L === 'undefined') {
      console.error('roof-calc: Leaflet not loaded');
      return;
    }
    if (!L.Control || !L.Control.Draw) {
      console.error('roof-calc: Leaflet.draw not loaded');
      return;
    }
    initMap();
    setupEvents();
    loadSavedSettings();
  }

  init();

}());
