(function () {
  'use strict';

  var SLUG = 'point-in-polygon-checker';
  var pointIdCounter = 0;

  var state = {
    polygonGeoJSON: null,
    polygonLayer: null,
    clickMode: true,
    points: [],        // [{id, lat, lng, inside}]
    pointLayers: {}    // id -> L.circleMarker
  };

  // --- MAP ---
  var map = L.map(SLUG + '-map', { center: [20, 0], zoom: 2 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // --- DOM ---
  var uploadArea    = document.getElementById('pip-upload-area');
  var fileInput     = document.getElementById('pip-file-input');
  var pasteSection  = document.getElementById('pip-paste-section');
  var uploadSection = document.getElementById('pip-upload-section');
  var tabUpload     = document.getElementById('pip-tab-upload');
  var tabPaste      = document.getElementById('pip-tab-paste');
  var clickToggle   = document.getElementById('pip-click-toggle');
  var manualRow     = document.getElementById('pip-manual-row');
  var latInput      = document.getElementById('pip-lat');
  var lngInput      = document.getElementById('pip-lng');
  var addPointBtn   = document.getElementById('pip-add-point-btn');
  var clearAllBtn   = document.getElementById('pip-clear-all-btn');
  var resultsDiv    = document.getElementById('pip-results');
  var summaryDiv    = document.getElementById('pip-summary');
  var tableBody     = document.getElementById('pip-table-body');
  var downloadBtn   = document.getElementById('pip-download-btn');
  var statusEl      = document.getElementById('pip-status');
  var mapEl         = document.getElementById(SLUG + '-map');
  var csvSection    = document.getElementById('pip-csv-section');
  var pointsTabClick  = document.getElementById('pip-points-tab-click');
  var pointsTabManual = document.getElementById('pip-points-tab-manual');
  var pointsTabCsv    = document.getElementById('pip-points-tab-csv');
  var pointsTabUpload = document.getElementById('pip-points-tab-upload');
  var pointsUploadSection  = document.getElementById('pip-points-upload-section');
  var pointsFileInput = document.getElementById('pip-points-file-input');

  // Build paste section dynamically
  var pasteArea = document.createElement('textarea');
  pasteArea.id = 'pip-paste-area';
  pasteArea.placeholder = 'Paste GeoJSON or KML here...';
  var pasteActions = document.createElement('div');
  pasteActions.className = 'pip-input-actions';
  var applyPasteBtn = document.createElement('button');
  applyPasteBtn.className = 'pip-btn pip-btn-primary pip-btn-sm';
  applyPasteBtn.textContent = 'Apply';
  applyPasteBtn.addEventListener('click', function () {
    loadPolygonText(pasteArea.value, 'pasted');
  });
  var pasteSampleBtn = document.createElement('button');
  pasteSampleBtn.className = 'pip-btn pip-btn-secondary pip-btn-sm pip-sample-btn';
  pasteSampleBtn.textContent = 'Load Sample';
  pasteSampleBtn.addEventListener('click', loadSample);
  pasteActions.appendChild(applyPasteBtn);
  pasteActions.appendChild(pasteSampleBtn);
  pasteSection.appendChild(pasteArea);
  pasteSection.appendChild(pasteActions);

  // Build CSV section dynamically
  var csvArea = document.createElement('textarea');
  csvArea.id = 'pip-csv-area';
  csvArea.placeholder = 'lat,lng (one per line)\n51.505,-0.09\n51.51,-0.1';
  var csvActions = document.createElement('div');
  csvActions.className = 'pip-input-actions';
  var applyCsvBtn = document.createElement('button');
  applyCsvBtn.className = 'pip-btn pip-btn-primary pip-btn-sm';
  applyCsvBtn.textContent = 'Check All Points';
  applyCsvBtn.addEventListener('click', applyCSV);
  csvActions.appendChild(applyCsvBtn);
  csvSection.appendChild(csvArea);
  csvSection.appendChild(csvActions);

  // Build points upload section dynamically
  var pointsUploadArea = document.createElement('div');
  pointsUploadArea.id = 'pip-points-upload-area';
  pointsUploadArea.className = 'pip-points-upload-area';
  pointsUploadArea.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
    '<span>Drop file or click to browse</span>' +
    '<span style="font-size:11px;color:#4a5568;">GeoJSON, KML, or GPX</span>';
  pointsUploadArea.addEventListener('click', function () { pointsFileInput.click(); });
  pointsUploadArea.addEventListener('dragover', function (e) {
    e.preventDefault(); pointsUploadArea.classList.add('drag-over');
  });
  pointsUploadArea.addEventListener('dragleave', function () {
    pointsUploadArea.classList.remove('drag-over');
  });
  pointsUploadArea.addEventListener('drop', function (e) {
    e.preventDefault();
    pointsUploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) readPointsFile(e.dataTransfer.files[0]);
  });
  pointsUploadSection.appendChild(pointsUploadArea);

  pointsFileInput.addEventListener('change', function () {
    if (pointsFileInput.files.length) readPointsFile(pointsFileInput.files[0]);
  });

  // --- POLYGON TABS ---
  tabUpload.addEventListener('click', function () {
    tabUpload.classList.add('active');
    tabPaste.classList.remove('active');
    uploadSection.style.display = '';
    pasteSection.style.display = 'none';
  });

  tabPaste.addEventListener('click', function () {
    tabPaste.classList.add('active');
    tabUpload.classList.remove('active');
    pasteSection.style.display = '';
    uploadSection.style.display = 'none';
  });

  // --- POINTS INPUT TABS ---
  pointsTabClick.addEventListener('click', function () { setPointsTab('click'); });
  pointsTabManual.addEventListener('click', function () { setPointsTab('manual'); });
  pointsTabCsv.addEventListener('click', function () { setPointsTab('csv'); });
  pointsTabUpload.addEventListener('click', function () { setPointsTab('upload'); });

  function setPointsTab(mode) {
    pointsTabClick.classList.toggle('active', mode === 'click');
    pointsTabManual.classList.toggle('active', mode === 'manual');
    pointsTabCsv.classList.toggle('active', mode === 'csv');
    pointsTabUpload.classList.toggle('active', mode === 'upload');
    clickToggle.style.display          = mode === 'click'  ? '' : 'none';
    manualRow.style.display            = mode === 'manual' ? '' : 'none';
    csvSection.style.display           = mode === 'csv'    ? '' : 'none';
    pointsUploadSection.style.display  = mode === 'upload' ? '' : 'none';
    if (mode !== 'click') setClickMode(false);
  }

  // --- POLYGON FILE UPLOAD ---
  uploadArea.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) readPolygonFile(fileInput.files[0]);
  });

  uploadArea.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', function () {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) readPolygonFile(e.dataTransfer.files[0]);
  });

  function readPolygonFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) { loadPolygonText(e.target.result, file.name); };
    reader.readAsText(file);
  }

  // --- SAMPLE BUTTONS ---
  document.querySelectorAll('.pip-sample-btn').forEach(function (btn) {
    btn.addEventListener('click', loadSample);
  });

  function loadSample() {
    var sample = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.15, 51.48], [0.02, 51.48],
            [0.02, 51.55], [-0.15, 51.55],
            [-0.15, 51.48]
          ]]
        },
        properties: { name: 'Sample Polygon (central London)' }
      }]
    };
    loadPolygonText(JSON.stringify(sample), 'sample-london');
  }

  // --- LOAD POLYGON ---
  function loadPolygonText(text, filename) {
    var gj = tryParseGeoJSON(text) || tryParseKML(text);
    if (!gj) {
      setStatus('Could not parse file - supports GeoJSON and KML', 'error');
      return;
    }
    // Filter to polygon/multipolygon features only
    var polyFeatures = gj.features.filter(function (f) {
      var t = f.geometry && f.geometry.type;
      return t === 'Polygon' || t === 'MultiPolygon';
    });
    if (polyFeatures.length === 0) {
      setStatus('No polygon geometries found in file', 'error');
      return;
    }
    state.polygonGeoJSON = { type: 'FeatureCollection', features: polyFeatures };

    if (state.polygonLayer) { map.removeLayer(state.polygonLayer); }
    state.polygonLayer = L.geoJSON(state.polygonGeoJSON, {
      style: { color: '#facc15', fillColor: '#facc15', fillOpacity: 0.15, weight: 2.5, opacity: 1 }
    }).addTo(map);

    try {
      var b = state.polygonLayer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
    } catch (e) {}

    var name = (filename || 'file').replace(/\.[^.]+$/, '');
    uploadArea.classList.add('loaded');
    uploadArea.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#68d391" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span style="color:#68d391;font-weight:600;">' + escHtml(name) + '</span>' +
      '<span style="font-size:11px;color:#4a5568;">Click to replace</span>';

    // Re-check any existing points against the new polygon
    if (state.points.length > 0) recheckAllPoints();

    setStatus('Polygon loaded (' + polyFeatures.length + ' feature' + (polyFeatures.length !== 1 ? 's' : '') + ')', 'success');
    addPointBtn.disabled = false;
  }

  // --- PARSERS ---
  function tryParseGeoJSON(text) {
    try {
      var gj = JSON.parse(text.trim());
      if (gj.type === 'FeatureCollection') return gj;
      if (gj.type === 'Feature') return { type: 'FeatureCollection', features: [gj] };
      if (gj.type && gj.coordinates) return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: gj, properties: {} }] };
      return null;
    } catch (e) { return null; }
  }

  function tryParseKML(text) {
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(text, 'text/xml');
      if (doc.querySelector('parsererror')) return null;

      var features = [];
      var polygons = doc.querySelectorAll('Polygon');

      polygons.forEach(function (poly) {
        var outerRing = poly.querySelector('outerBoundaryIs coordinates, outerBoundaryIs > LinearRing > coordinates');
        if (!outerRing) return;
        var outerCoords = parseKMLCoords(outerRing.textContent);
        if (outerCoords.length < 4) return;

        var rings = [outerCoords];
        var innerRings = poly.querySelectorAll('innerBoundaryIs coordinates, innerBoundaryIs > LinearRing > coordinates');
        innerRings.forEach(function (inner) {
          var coords = parseKMLCoords(inner.textContent);
          if (coords.length >= 4) rings.push(coords);
        });

        // Get name from parent Placemark
        var placemark = poly.closest ? poly.closest('Placemark') : null;
        var name = placemark ? (placemark.querySelector('name') || {}).textContent || '' : '';

        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: rings },
          properties: { name: name }
        });
      });

      if (features.length === 0) return null;
      return { type: 'FeatureCollection', features: features };
    } catch (e) { return null; }
  }

  // --- POINTS FILE UPLOAD ---
  function readPointsFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      var ext = file.name.split('.').pop().toLowerCase();
      var points = [];
      if (ext === 'gpx') {
        points = parseGPXPoints(text);
      } else if (ext === 'kml') {
        points = parseKMLPoints(text);
      } else {
        points = parseGeoJSONPoints(text);
      }
      if (points.length === 0) {
        setStatus('No point features found in ' + file.name, 'error');
        return;
      }
      points.forEach(function (p) { addPoint(p[0], p[1]); });
      setStatus('Loaded ' + points.length + ' point' + (points.length !== 1 ? 's' : '') + ' from ' + file.name, 'success');
      pointsUploadArea.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#68d391" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        '<span style="color:#68d391;font-weight:600;">' + escHtml(file.name) + '</span>' +
        '<span style="font-size:11px;color:#4a5568;">' + points.length + ' points loaded &mdash; click to replace</span>';
    };
    reader.readAsText(file);
  }

  function parseGeoJSONPoints(text) {
    try {
      var gj = JSON.parse(text.trim());
      var features = gj.type === 'FeatureCollection' ? gj.features
        : gj.type === 'Feature' ? [gj] : [];
      var pts = [];
      features.forEach(function (f) {
        if (!f.geometry) return;
        if (f.geometry.type === 'Point') {
          var c = f.geometry.coordinates;
          pts.push([c[1], c[0]]);
        } else if (f.geometry.type === 'MultiPoint') {
          f.geometry.coordinates.forEach(function (c) { pts.push([c[1], c[0]]); });
        }
      });
      return pts;
    } catch (e) { return []; }
  }

  function parseKMLPoints(text) {
    try {
      var doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.querySelector('parsererror')) return [];
      var pts = [];
      doc.querySelectorAll('Point coordinates').forEach(function (el) {
        var parts = el.textContent.trim().split(',');
        var lng = parseFloat(parts[0]);
        var lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) pts.push([lat, lng]);
      });
      return pts;
    } catch (e) { return []; }
  }

  function parseGPXPoints(text) {
    try {
      var doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.querySelector('parsererror')) return [];
      var pts = [];
      // waypoints
      doc.querySelectorAll('wpt').forEach(function (el) {
        var lat = parseFloat(el.getAttribute('lat'));
        var lng = parseFloat(el.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) pts.push([lat, lng]);
      });
      // track points
      doc.querySelectorAll('trkpt').forEach(function (el) {
        var lat = parseFloat(el.getAttribute('lat'));
        var lng = parseFloat(el.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) pts.push([lat, lng]);
      });
      // route points
      doc.querySelectorAll('rtept').forEach(function (el) {
        var lat = parseFloat(el.getAttribute('lat'));
        var lng = parseFloat(el.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) pts.push([lat, lng]);
      });
      return pts;
    } catch (e) { return []; }
  }

  function parseKMLCoords(raw) {
    return raw.trim().split(/\s+/).map(function (triplet) {
      var parts = triplet.split(',');
      var lng = parseFloat(parts[0]);
      var lat = parseFloat(parts[1]);
      return (isNaN(lat) || isNaN(lng)) ? null : [lng, lat];
    }).filter(Boolean);
  }

  // --- CLICK MODE ---
  clickToggle.addEventListener('click', function () {
    setClickMode(!state.clickMode);
  });

  function setClickMode(active) {
    state.clickMode = active;
    clickToggle.classList.toggle('active', active);
    document.getElementById('pip-click-label').textContent = active
      ? 'Click mode ON — click map to add points'
      : 'Click mode OFF — click to enable';
    mapEl.classList.toggle('normal-cursor', !active);
  }

  map.on('click', function (e) {
    if (!state.clickMode) return;
    addPoint(e.latlng.lat, e.latlng.lng);
  });

  // --- MANUAL POINT ENTRY ---
  addPointBtn.addEventListener('click', function () {
    var lat = parseFloat(latInput.value);
    var lng = parseFloat(lngInput.value);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setStatus('Invalid coordinates', 'error');
      return;
    }
    addPoint(lat, lng);
    latInput.value = '';
    lngInput.value = '';
    latInput.focus();
  });

  lngInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addPointBtn.click();
  });

  // --- CSV POINTS ---
  function applyCSV() {
    var lines = csvArea.value.trim().split('\n');
    var added = 0;
    var errors = 0;
    lines.forEach(function (line) {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      var parts = line.split(/[,\t ]+/);
      var lat = parseFloat(parts[0]);
      var lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        addPoint(lat, lng);
        added++;
      } else {
        errors++;
      }
    });
    if (errors > 0) {
      setStatus('Added ' + added + ' points (' + errors + ' invalid lines skipped)', 'error');
    } else {
      setStatus('Added ' + added + ' points', 'success');
    }
    csvArea.value = '';
  }

  // --- ADD POINT ---
  function addPoint(lat, lng) {
    var id = ++pointIdCounter;
    var inside = checkPoint(lat, lng);
    var point = { id: id, lat: lat, lng: lng, inside: inside };
    state.points.push(point);
    renderPointMarker(point);
    renderResults();
    if (inside === null) {
      setStatus('Point added (load a polygon to check)', '');
    }
  }

  function checkPoint(lat, lng) {
    if (!state.polygonGeoJSON) return null;
    var pt = turf.point([lng, lat]);
    for (var i = 0; i < state.polygonGeoJSON.features.length; i++) {
      var f = state.polygonGeoJSON.features[i];
      try {
        if (turf.booleanPointInPolygon(pt, f)) return true;
      } catch (e) {}
    }
    return false;
  }

  function recheckAllPoints() {
    state.points.forEach(function (p) {
      p.inside = checkPoint(p.lat, p.lng);
      updatePointMarker(p);
    });
    renderResults();
  }

  function renderPointMarker(point) {
    var color = point.inside === null ? '#94a3b8' : point.inside ? '#22c55e' : '#ef4444';
    var marker = L.circleMarker([point.lat, point.lng], {
      radius: 7,
      color: color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2
    });
    marker.bindTooltip(
      (point.inside === null ? '?' : point.inside ? 'Inside' : 'Outside') +
      '<br>' + point.lat.toFixed(5) + ', ' + point.lng.toFixed(5),
      { permanent: false, direction: 'top' }
    );
    marker.addTo(map);
    state.pointLayers[point.id] = marker;
  }

  function updatePointMarker(point) {
    var marker = state.pointLayers[point.id];
    if (!marker) return;
    var color = point.inside === null ? '#94a3b8' : point.inside ? '#22c55e' : '#ef4444';
    marker.setStyle({ color: color, fillColor: color });
    marker.setTooltipContent(
      (point.inside === null ? '?' : point.inside ? 'Inside' : 'Outside') +
      '<br>' + point.lat.toFixed(5) + ', ' + point.lng.toFixed(5)
    );
  }

  function removePoint(id) {
    state.points = state.points.filter(function (p) { return p.id !== id; });
    if (state.pointLayers[id]) {
      map.removeLayer(state.pointLayers[id]);
      delete state.pointLayers[id];
    }
    renderResults();
  }

  // --- CLEAR ALL ---
  clearAllBtn.addEventListener('click', function () {
    state.points.forEach(function (p) {
      if (state.pointLayers[p.id]) map.removeLayer(state.pointLayers[p.id]);
    });
    state.points = [];
    state.pointLayers = {};
    resultsDiv.classList.remove('visible');
    setStatus('', '');
  });

  // --- RESULTS TABLE ---
  function renderResults() {
    if (state.points.length === 0) {
      resultsDiv.classList.remove('visible');
      return;
    }

    var total   = state.points.length;
    var inside  = state.points.filter(function (p) { return p.inside === true; }).length;
    var outside = state.points.filter(function (p) { return p.inside === false; }).length;
    var pending = state.points.filter(function (p) { return p.inside === null; }).length;

    summaryDiv.innerHTML =
      '<span class="pip-summary-chip pip-chip-total">' + total + ' point' + (total !== 1 ? 's' : '') + '</span>' +
      (inside  > 0 ? '<span class="pip-summary-chip pip-chip-inside">&#10003; ' + inside  + ' inside</span>'  : '') +
      (outside > 0 ? '<span class="pip-summary-chip pip-chip-outside">&#10007; ' + outside + ' outside</span>' : '') +
      (pending > 0 ? '<span class="pip-summary-chip pip-chip-total">' + pending + ' unchecked</span>' : '');

    tableBody.innerHTML = '';
    state.points.forEach(function (p, idx) {
      var tr = document.createElement('tr');
      var statusHtml = p.inside === null
        ? '<span style="color:#718096;">&#8212;</span>'
        : p.inside
          ? '<span class="pip-status-inside">&#10003; Inside</span>'
          : '<span class="pip-status-outside">&#10007; Outside</span>';

      tr.innerHTML =
        '<td>' + (idx + 1) + '</td>' +
        '<td>' + p.lat.toFixed(6) + '</td>' +
        '<td>' + p.lng.toFixed(6) + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td><button class="pip-row-remove" data-id="' + p.id + '" title="Remove">&times;</button></td>';

      tableBody.appendChild(tr);
    });

    // Remove row buttons
    tableBody.querySelectorAll('.pip-row-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        removePoint(parseInt(this.dataset.id, 10));
      });
    });

    resultsDiv.classList.add('visible');
    downloadBtn.style.display = '';
  }

  // --- DOWNLOAD CSV ---
  downloadBtn.addEventListener('click', function () {
    var rows = ['#,latitude,longitude,status'];
    state.points.forEach(function (p, idx) {
      var status = p.inside === null ? 'unchecked' : p.inside ? 'inside' : 'outside';
      rows.push((idx + 1) + ',' + p.lat.toFixed(6) + ',' + p.lng.toFixed(6) + ',' + status);
    });
    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    triggerDownload(blob, 'point-in-polygon-results.csv');
  });

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- STATUS ---
  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = type ? ('pip-status ' + type) : '';
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // --- SHARE URL ---
  function updateShareUrl() {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + map.getZoom());
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var p = {};
    hash.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i >= 0) p[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    if (p.lat && p.lng && p.z) map.setView([parseFloat(p.lat), parseFloat(p.lng)], parseInt(p.z, 10));
  }

  map.on('moveend', updateShareUrl);
  loadStateFromUrl();

  // Start with click mode active
  setClickMode(true);
  setPointsTab('click');

})();
