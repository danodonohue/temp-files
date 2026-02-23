(function () {
  'use strict';

  var SLUG = 'points-to-polygon';
  var map, layerPoints, layerHull;
  var pointFeatures = null;
  var hullMode = 'convex'; // 'convex' | 'concave'
  var maxEdgeKm = 50;

  var STYLES = {
    points: { radius: 5, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 1.5 },
    hull:   { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.25, weight: 2.5 }
  };

  // ─── Map ────────────────────────────────────────────────────────────────────

  function initMap() {
    map = L.map(SLUG + '-map', { center: [20, 0], zoom: 2 });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    layerPoints = L.featureGroup().addTo(map);
    layerHull   = L.geoJSON(null, { style: STYLES.hull }).addTo(map);
  }

  // ─── Parsing ─────────────────────────────────────────────────────────────────

  function kmlToGeoJSONText(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'application/xml');
    var err = doc.querySelector('parsererror');
    if (err) throw new Error('KML parse error: ' + err.textContent.slice(0, 120));
    return toGeoJSON.kml(doc);
  }

  // Extract all point coordinates from any GeoJSON geometry/feature/collection
  function extractPoints(obj) {
    var pts = [];

    function fromCoord(c) {
      // GeoJSON coords are [lng, lat, ?elev]
      if (Array.isArray(c) && typeof c[0] === 'number') {
        pts.push(turf.point([c[0], c[1]]));
      }
    }

    function fromGeom(g) {
      if (!g) return;
      switch (g.type) {
        case 'Point':
          fromCoord(g.coordinates);
          break;
        case 'MultiPoint':
          g.coordinates.forEach(fromCoord);
          break;
        case 'LineString':
          g.coordinates.forEach(fromCoord);
          break;
        case 'MultiLineString':
          g.coordinates.forEach(function (r) { r.forEach(fromCoord); });
          break;
        case 'Polygon':
          g.coordinates.forEach(function (r) { r.forEach(fromCoord); });
          break;
        case 'MultiPolygon':
          g.coordinates.forEach(function (p) {
            p.forEach(function (r) { r.forEach(fromCoord); });
          });
          break;
        case 'GeometryCollection':
          g.geometries.forEach(fromGeom);
          break;
      }
    }

    function fromFeature(f) {
      if (f && f.geometry) fromGeom(f.geometry);
    }

    if (obj.type === 'FeatureCollection') {
      obj.features.forEach(fromFeature);
    } else if (obj.type === 'Feature') {
      fromFeature(obj);
    } else {
      fromGeom(obj);
    }

    // Deduplicate to within ~1cm
    var seen = {};
    pts = pts.filter(function (p) {
      var k = p.geometry.coordinates[0].toFixed(7) + ',' + p.geometry.coordinates[1].toFixed(7);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });

    return pts;
  }

  function parseInput(raw, isKml) {
    var obj;
    if (isKml) {
      try { obj = kmlToGeoJSONText(raw); }
      catch (e) { return { error: e.message }; }
    } else {
      try { obj = JSON.parse(raw.trim()); }
      catch (e) { return { error: 'Invalid JSON: ' + e.message }; }
    }
    var pts = extractPoints(obj);
    if (pts.length === 0) return { error: 'No point coordinates found in this file.' };
    return { points: pts };
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function setMsg(text, type) {
    var el = document.getElementById(SLUG + '-status');
    if (!el) return;
    el.innerHTML = text
      ? '<div class="ptp-msg ptp-msg-' + type + '">' + text + '</div>'
      : '';
  }

  function setCount(n) {
    var el = document.getElementById(SLUG + '-point-count');
    if (el) el.textContent = n !== null ? n + ' point' + (n === 1 ? '' : 's') + ' loaded' : '';
  }

  function setConcaveRowVisible(visible) {
    var row = document.getElementById(SLUG + '-concave-row');
    if (row) row.style.display = visible ? 'flex' : 'none';
  }

  // ─── Load points ─────────────────────────────────────────────────────────────

  function loadFromText(raw, isKml) {
    if (!raw.trim()) {
      setMsg('Paste GeoJSON or upload a file first.', 'warn');
      return;
    }
    var result = parseInput(raw, isKml);
    if (result.error) {
      setMsg(result.error, 'error');
      return;
    }
    pointFeatures = result.points;
    renderPoints();
    layerHull.clearLayers();
    setCount(pointFeatures.length);
    setMsg(pointFeatures.length + ' points loaded. Click <strong>Generate Boundary</strong> to wrap a polygon around them.', 'ok');
  }

  function loadFile(file) {
    if (!file) return;
    var isKml = /\.kml$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function (e) {
      var ta = document.getElementById(SLUG + '-textarea');
      if (ta && !isKml) ta.value = e.target.result;
      loadFromText(e.target.result, isKml);
    };
    reader.readAsText(file);
  }

  function loadFromUI() {
    var raw = document.getElementById(SLUG + '-textarea').value;
    loadFromText(raw, false);
  }

  function renderPoints() {
    layerPoints.clearLayers();
    if (!pointFeatures) return;
    pointFeatures.forEach(function (pt) {
      var c = pt.geometry.coordinates;
      L.circleMarker([c[1], c[0]], STYLES.points).addTo(layerPoints);
    });
    if (layerPoints.getLayers().length > 0) {
      map.fitBounds(layerPoints.getBounds(), { padding: [30, 30] });
    }
  }

  // ─── Area formatting ─────────────────────────────────────────────────────────

  function formatArea(m2) {
    var lang = (navigator.language || '').toUpperCase();
    var us = lang === 'EN-US' || lang.indexOf('EN-US') === 0;
    if (us) {
      var acres   = m2 / 4046.86;
      var sqmiles = m2 / 2589988;
      if (acres < 0.1)  return (m2 * 10.7639).toFixed(0) + ' sq ft';
      if (sqmiles < 1)  return acres.toFixed(2) + ' acres';
      return sqmiles.toFixed(2) + ' sq miles';
    }
    var ha  = m2 / 10000;
    var km2 = m2 / 1e6;
    if (m2 < 10000) return m2.toFixed(0) + ' m\u00b2';
    if (km2 < 1)    return ha.toFixed(2) + ' ha';
    return km2.toFixed(2) + ' km\u00b2';
  }

  // ─── Hull generation ─────────────────────────────────────────────────────────

  function generateHull() {
    if (!pointFeatures || pointFeatures.length === 0) {
      setMsg('Load some points first.', 'warn');
      return;
    }
    if (pointFeatures.length < 3) {
      setMsg('At least 3 points are needed to generate a boundary polygon.', 'warn');
      return;
    }

    var fc = turf.featureCollection(pointFeatures);
    var result = null;

    try {
      if (hullMode === 'convex') {
        result = turf.convex(fc);
        if (!result) {
          setMsg('Could not compute a convex boundary - points may be collinear.', 'warn');
          return;
        }
      } else {
        result = turf.concave(fc, { maxEdge: maxEdgeKm, units: 'kilometers' });
        if (!result) {
          setMsg('Could not compute a concave boundary at this tightness. Try increasing the Max Edge Distance.', 'warn');
          return;
        }
      }
    } catch (e) {
      setMsg('Error generating boundary: ' + e.message, 'error');
      return;
    }

    layerHull.clearLayers();
    layerHull.addData(result);

    var area = turf.area(result);
    var areaStr = formatArea(area);

    var modeLabel = hullMode === 'convex' ? 'Convex' : 'Concave';
    setMsg(modeLabel + ' boundary generated. Area: ' + areaStr, 'ok');

    var allBounds = L.featureGroup([layerPoints, layerHull]).getBounds();
    if (allBounds.isValid()) map.fitBounds(allBounds, { padding: [30, 30] });
  }

  // ─── KML serializer ───────────────────────────────────────────────────────────

  function coordsToKml(ring) {
    return ring.map(function (c) { return c[0] + ',' + c[1] + ',0'; }).join(' ');
  }

  function geomToKml(g) {
    if (!g) return '';
    if (g.type === 'Point') {
      return '<Point><coordinates>' + g.coordinates[0] + ',' + g.coordinates[1] + ',0</coordinates></Point>';
    }
    if (g.type === 'Polygon') {
      var rings = '<outerBoundaryIs><LinearRing><coordinates>' +
        coordsToKml(g.coordinates[0]) +
        '</coordinates></LinearRing></outerBoundaryIs>';
      for (var i = 1; i < g.coordinates.length; i++) {
        rings += '<innerBoundaryIs><LinearRing><coordinates>' +
          coordsToKml(g.coordinates[i]) +
          '</coordinates></LinearRing></innerBoundaryIs>';
      }
      return '<Polygon>' + rings + '</Polygon>';
    }
    if (g.type === 'MultiPolygon') {
      return '<MultiGeometry>' + g.coordinates.map(function (poly) {
        var rings = '<outerBoundaryIs><LinearRing><coordinates>' +
          coordsToKml(poly[0]) +
          '</coordinates></LinearRing></outerBoundaryIs>';
        return '<Polygon>' + rings + '</Polygon>';
      }).join('') + '</MultiGeometry>';
    }
    return '';
  }

  function featuresToKml(features, docName) {
    var placemarks = features.map(function (f, i) {
      return '<Placemark><name>' + (docName || 'Feature') + ' ' + (i + 1) + '</name>' +
        geomToKml(f.geometry) + '</Placemark>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">' +
      '<Document><name>' + (docName || 'export') + '</name>' +
      placemarks + '</Document></kml>';
  }

  // ─── Download ─────────────────────────────────────────────────────────────────

  function triggerDownload(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadHull(fmt) {
    var features = [];
    layerHull.eachLayer(function (l) { if (l.toGeoJSON) features.push(l.toGeoJSON()); });
    if (features.length === 0) { setMsg('Generate a boundary first.', 'warn'); return; }
    if (fmt === 'kml') {
      triggerDownload(featuresToKml(features, 'boundary'), SLUG + '-boundary.kml', 'application/vnd.google-earth.kml+xml');
    } else {
      triggerDownload(JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2),
        SLUG + '-boundary.geojson', 'application/json');
    }
  }

  function downloadPoints(fmt) {
    if (!pointFeatures || pointFeatures.length === 0) { setMsg('No points to download.', 'warn'); return; }
    var features = pointFeatures;
    if (fmt === 'kml') {
      triggerDownload(featuresToKml(features, 'point'), SLUG + '-points.kml', 'application/vnd.google-earth.kml+xml');
    } else {
      triggerDownload(JSON.stringify(turf.featureCollection(features), null, 2),
        SLUG + '-points.geojson', 'application/json');
    }
  }

  // ─── Hull mode toggle ─────────────────────────────────────────────────────────

  function setHullMode(mode) {
    hullMode = mode;
    var btnConvex  = document.getElementById(SLUG + '-btn-convex');
    var btnConcave = document.getElementById(SLUG + '-btn-concave');
    if (btnConvex)  btnConvex.classList.toggle('active', mode === 'convex');
    if (btnConcave) btnConcave.classList.toggle('active', mode === 'concave');
    setConcaveRowVisible(mode === 'concave');
    layerHull.clearLayers();
  }

  function updateMaxEdge(val) {
    maxEdgeKm = parseFloat(val);
    var el = document.getElementById(SLUG + '-maxedge-val');
    if (el) el.textContent = maxEdgeKm + ' km';
  }

  // ─── Clear ────────────────────────────────────────────────────────────────────

  function clearAll() {
    pointFeatures = null;
    layerPoints.clearLayers();
    layerHull.clearLayers();
    var ta = document.getElementById(SLUG + '-textarea');
    if (ta) ta.value = '';
    setCount(null);
    setMsg('Cleared.', 'info');
    map.setView([20, 0], 2);
  }

  // ─── Toggle layer visibility ──────────────────────────────────────────────────

  function toggleLayer(which, visible) {
    var layer = which === 'points' ? layerPoints : layerHull;
    if (visible) { if (!map.hasLayer(layer)) map.addLayer(layer); }
    else         { if (map.hasLayer(layer))  map.removeLayer(layer); }
  }

  // ─── Build UI ─────────────────────────────────────────────────────────────────

  function buildUI() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;

    container.innerHTML =
      '<label id="' + SLUG + '-dropzone" class="ptp-dropzone">' +
        '<input type="file" accept=".geojson,.json,.kml" style="display:none"' +
          ' onchange="window._ptp.loadFile(this.files[0])">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
          '<polyline points="17 8 12 3 7 8"/>' +
          '<line x1="12" y1="3" x2="12" y2="15"/>' +
        '</svg>' +
        '<span class="ptp-dropzone-title">Drag and drop a file here, or click to browse</span>' +
        '<span class="ptp-dropzone-sub">GeoJSON (.geojson, .json) or KML (.kml)</span>' +
      '</label>' +

      '<div class="ptp-paste-row">' +
        '<textarea id="' + SLUG + '-textarea" class="ptp-textarea"' +
          ' placeholder="Or paste GeoJSON here (any geometry type - points, lines, polygons, or mixed FeatureCollections)..."></textarea>' +
        '<button class="ptp-btn ptp-btn-primary" style="align-self:flex-end" onclick="window._ptp.loadFromUI()">Load</button>' +
        '<button class="ptp-btn ptp-btn-gray" style="align-self:flex-end" onclick="window._ptp.clearAll()">Clear</button>' +
      '</div>' +

      '<div id="' + SLUG + '-point-count" class="ptp-point-count"></div>' +
      '<div id="' + SLUG + '-status" class="ptp-status"></div>' +

      '<div id="' + SLUG + '-map"></div>' +

      '<div class="ptp-controls">' +

        '<div class="ptp-controls-row">' +
          '<span class="ptp-label">Boundary type:</span>' +
          '<div class="ptp-hull-toggle">' +
            '<button id="' + SLUG + '-btn-convex" class="active" onclick="window._ptp.setHullMode(\'convex\')">Convex (outer wrap)</button>' +
            '<button id="' + SLUG + '-btn-concave" onclick="window._ptp.setHullMode(\'concave\')">Concave (tight fit)</button>' +
          '</div>' +
          '<button class="ptp-btn ptp-btn-green" onclick="window._ptp.generateHull()">Generate Boundary</button>' +
        '</div>' +

        '<div id="' + SLUG + '-concave-row" class="ptp-controls-row ptp-slider-row" style="display:none;">' +
          '<span class="ptp-label">Max edge distance:</span>' +
          '<input type="range" min="1" max="500" step="1" value="50"' +
            ' oninput="window._ptp.updateMaxEdge(this.value)">' +
          '<span id="' + SLUG + '-maxedge-val" class="ptp-slider-val">50 km</span>' +
          '<span class="ptp-concave-hint">Smaller = tighter boundary</span>' +
        '</div>' +

        '<div class="ptp-controls-row">' +
          '<div class="ptp-result-item">' +
            '<span class="ptp-swatch ptp-swatch-points"></span>' +
            '<label><input type="checkbox" checked onchange="window._ptp.toggleLayer(\'points\',this.checked)"> Points</label>' +
            '<button class="ptp-btn ptp-btn-outline ptp-btn-save" onclick="window._ptp.downloadPoints(\'geojson\')">Save GeoJSON</button>' +
            '<button class="ptp-btn ptp-btn-outline ptp-btn-save" onclick="window._ptp.downloadPoints(\'kml\')">Save KML</button>' +
          '</div>' +
          '<div class="ptp-result-item">' +
            '<span class="ptp-swatch ptp-swatch-hull"></span>' +
            '<label><input type="checkbox" checked onchange="window._ptp.toggleLayer(\'hull\',this.checked)"> Boundary</label>' +
            '<button class="ptp-btn ptp-btn-outline ptp-btn-save" onclick="window._ptp.downloadHull(\'geojson\')">Save GeoJSON</button>' +
            '<button class="ptp-btn ptp-btn-outline ptp-btn-save" onclick="window._ptp.downloadHull(\'kml\')">Save KML</button>' +
          '</div>' +
        '</div>' +

      '</div>';

    initMap();

    // Drag-and-drop on the drop zone
    var dz = document.getElementById(SLUG + '-dropzone');
    if (dz) {
      dz.addEventListener('dragover', function (e) {
        e.preventDefault();
        dz.classList.add('ptp-dropzone-over');
      });
      dz.addEventListener('dragleave', function () {
        dz.classList.remove('ptp-dropzone-over');
      });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('ptp-dropzone-over');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) loadFile(file);
      });
    }
  }

  window._ptp = {
    loadFile:       loadFile,
    loadFromUI:     loadFromUI,
    generateHull:   generateHull,
    downloadHull:   downloadHull,
    downloadPoints: downloadPoints,
    setHullMode:    setHullMode,
    updateMaxEdge:  updateMaxEdge,
    clearAll:       clearAll,
    toggleLayer:    toggleLayer
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})();
