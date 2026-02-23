(function () {
  'use strict';

  var SLUG = 'geojson-buffer-generator';
  var DEFAULT_COLORS = [
    '#3b82f6', '#f97316', '#22c55e', '#ef4444',
    '#a855f7', '#eab308', '#06b6d4', '#f43f5e'
  ];

  var ringIdCounter = 0;

  var state = {
    sourceGeoJSON: null,
    fileName: null,
    rings: [],
    bufferLayers: [],
    sourceLayer: null,
    results: []
  };

  // --- MAP ---
  var map = L.map(SLUG + '-map', { center: [20, 0], zoom: 2 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // --- DOM ---
  var uploadArea    = document.getElementById('gbg-upload-area');
  var fileInput     = document.getElementById('gbg-file-input');
  var pasteArea     = document.getElementById('gbg-paste-area');
  var pasteSection  = document.getElementById('gbg-paste-section');
  var uploadSection = document.getElementById('gbg-upload-section');
  var tabUpload     = document.getElementById('gbg-tab-upload');
  var tabPaste      = document.getElementById('gbg-tab-paste');
  var ringsList     = document.getElementById('gbg-rings-list');
  var generateBtn   = document.getElementById('gbg-generate-btn');
  var addRingBtn    = document.getElementById('gbg-add-ring-btn');
  var clearBtn      = document.getElementById('gbg-clear-btn');
  var resultsDiv    = document.getElementById('gbg-results');
  var resultsGrid   = document.getElementById('gbg-results-grid');
  var downloadBtn   = document.getElementById('gbg-download-btn');
  var copyBtn       = document.getElementById('gbg-copy-btn');
  var statusEl      = document.getElementById('gbg-status');

  // --- INITIAL RING ---
  addRing(1, 'kilometers', DEFAULT_COLORS[0]);

  // --- TABS ---
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

  // --- FILE UPLOAD ---
  uploadArea.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) readFile(fileInput.files[0]);
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
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) { loadGeoJSONText(e.target.result, file.name); };
    reader.readAsText(file);
  }

  // --- PASTE ---
  document.getElementById('gbg-apply-paste').addEventListener('click', function () {
    loadGeoJSONText(pasteArea.value, 'pasted.geojson');
  });

  // --- SAMPLE BUTTONS ---
  document.querySelectorAll('.gbg-sample-btn').forEach(function (btn) {
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
    loadGeoJSONText(JSON.stringify(sample), 'sample-london.geojson');
  }

  // --- LOAD GEOJSON ---
  function loadGeoJSONText(text, filename) {
    var gj = parseGeoJSON(text);
    if (!gj) {
      setStatus('Invalid GeoJSON - check your input', 'error');
      return;
    }
    state.sourceGeoJSON = gj;
    state.fileName = filename || 'input.geojson';

    clearBufferLayers();
    resultsDiv.classList.remove('visible');

    renderSourceLayer();

    var fCount = gj.features.length;
    setStatus('Loaded: ' + escHtml(state.fileName) + ' (' + fCount + ' feature' + (fCount !== 1 ? 's' : '') + ')', 'success');

    uploadArea.classList.add('loaded');
    uploadArea.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#68d391" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span style="color:#68d391;font-weight:600;">' + escHtml(state.fileName) + '</span>' +
      '<span style="font-size:11px;color:#4a5568;">Click to replace</span>';

    generateBtn.disabled = false;
  }

  function parseGeoJSON(text) {
    try {
      var gj = JSON.parse(text.trim());
      if (gj.type === 'FeatureCollection') return gj;
      if (gj.type === 'Feature') return { type: 'FeatureCollection', features: [gj] };
      if (gj.type && gj.coordinates) {
        return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: gj, properties: {} }] };
      }
      return null;
    } catch (e) { return null; }
  }

  function renderSourceLayer() {
    if (state.sourceLayer) { map.removeLayer(state.sourceLayer); state.sourceLayer = null; }
    state.sourceLayer = L.geoJSON(state.sourceGeoJSON, {
      style: { color: '#facc15', fillColor: '#facc15', fillOpacity: 0.2, weight: 2.5, opacity: 1 },
      pointToLayer: function (f, ll) {
        return L.circleMarker(ll, { radius: 7, color: '#facc15', fillColor: '#facc15', fillOpacity: 0.85, weight: 2 });
      }
    }).addTo(map);
    try {
      var b = state.sourceLayer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
    } catch (e) {}
  }

  // --- RING MANAGEMENT ---
  function addRing(distance, units, color) {
    var id = ++ringIdCounter;
    var colorIdx = state.rings.length % DEFAULT_COLORS.length;
    state.rings.push({
      id: id,
      distance: distance !== undefined ? distance : 1,
      units: units || 'kilometers',
      color: color || DEFAULT_COLORS[colorIdx]
    });
    renderRingsList();
  }

  function removeRing(id) {
    state.rings = state.rings.filter(function (r) { return r.id !== id; });
    renderRingsList();
  }

  function getRing(id) {
    return state.rings.find(function (r) { return r.id === id; });
  }

  function renderRingsList() {
    ringsList.innerHTML = '';
    state.rings.forEach(function (ring, idx) {
      var row = document.createElement('div');
      row.className = 'gbg-ring-row';

      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'gbg-ring-color';
      colorInput.value = ring.color;
      colorInput.title = 'Pick color';
      colorInput.addEventListener('input', function () { getRing(ring.id).color = this.value; });

      var label = document.createElement('span');
      label.className = 'gbg-ring-label';
      label.textContent = 'Ring ' + (idx + 1);

      var distInput = document.createElement('input');
      distInput.type = 'number';
      distInput.className = 'gbg-ring-distance';
      distInput.value = ring.distance;
      distInput.min = '0.001';
      distInput.step = '0.1';
      distInput.addEventListener('change', function () {
        var v = parseFloat(this.value);
        if (v > 0) getRing(ring.id).distance = v;
      });

      var unitsSelect = document.createElement('select');
      unitsSelect.className = 'gbg-ring-units';
      ['meters', 'kilometers', 'miles', 'feet'].forEach(function (u) {
        var opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        if (u === ring.units) opt.selected = true;
        unitsSelect.appendChild(opt);
      });
      unitsSelect.addEventListener('change', function () { getRing(ring.id).units = this.value; });

      var removeBtn = document.createElement('button');
      removeBtn.className = 'gbg-ring-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', function () { removeRing(ring.id); });

      row.appendChild(colorInput);
      row.appendChild(label);
      row.appendChild(distInput);
      row.appendChild(unitsSelect);
      row.appendChild(removeBtn);
      ringsList.appendChild(row);
    });
  }

  addRingBtn.addEventListener('click', function () { addRing(); });

  // --- GENERATE ---
  generateBtn.addEventListener('click', generateBuffers);

  function generateBuffers() {
    if (!state.sourceGeoJSON || state.rings.length === 0) return;
    setStatus('Calculating\u2026', 'working');

    clearBufferLayers();
    state.results = [];

    // sort largest first so smaller buffers render on top
    var sortedRings = state.rings.slice().sort(function (a, b) {
      return toMeters(b.distance, b.units) - toMeters(a.distance, a.units);
    });

    var errors = 0;
    sortedRings.forEach(function (ring) {
      try {
        var buffered = turf.buffer(state.sourceGeoJSON, ring.distance, { units: ring.units });
        if (!buffered || !buffered.features || buffered.features.length === 0) { errors++; return; }

        var area = turf.area(buffered);

        var layer = L.geoJSON(buffered, {
          style: {
            color: ring.color,
            fillColor: ring.color,
            fillOpacity: 0.22,
            weight: 2,
            opacity: 0.85
          }
        }).addTo(map);

        state.bufferLayers.push(layer);
        state.results.push({ ring: ring, area: area, geojson: buffered });
      } catch (e) {
        errors++;
        console.error('Buffer error for ring', ring, e);
      }
    });

    if (state.sourceLayer) state.sourceLayer.bringToFront();

    if (state.bufferLayers.length > 0) {
      try {
        var bounds = state.bufferLayers[0].getBounds();
        state.bufferLayers.forEach(function (l) { bounds.extend(l.getBounds()); });
        map.fitBounds(bounds, { padding: [25, 25] });
      } catch (e) {}
    }

    renderResults();

    if (errors > 0 && state.results.length === 0) {
      setStatus('Buffer generation failed - check your GeoJSON', 'error');
    } else if (errors > 0) {
      setStatus(errors + ' ring(s) failed to generate', 'error');
    } else {
      setStatus(state.results.length + ' buffer zone' + (state.results.length !== 1 ? 's' : '') + ' generated', 'success');
    }
  }

  function clearBufferLayers() {
    state.bufferLayers.forEach(function (l) { map.removeLayer(l); });
    state.bufferLayers = [];
    state.results = [];
  }

  function toMeters(distance, units) {
    var f = { meters: 1, kilometers: 1000, miles: 1609.34, feet: 0.3048 };
    return distance * (f[units] || 1);
  }

  // --- RESULTS ---
  function renderResults() {
    if (state.results.length === 0) { resultsDiv.classList.remove('visible'); return; }

    resultsGrid.innerHTML = '';

    var sorted = state.results.slice().sort(function (a, b) {
      return toMeters(a.ring.distance, a.ring.units) - toMeters(b.ring.distance, b.ring.units);
    });

    sorted.forEach(function (r, idx) {
      var km2    = r.area / 1e6;
      var ha     = r.area / 1e4;
      var acres  = r.area / 4046.86;
      var miles2 = r.area / 2589988.11;
      var ft2    = r.area * 10.7639;

      var primaryStr = formatPrimaryArea(r.area, r.ring.units);

      var subParts;
      if (r.ring.units === 'miles') {
        subParts = [
          acres.toFixed(2) + ' acres',
          km2.toFixed(3) + ' km&sup2;',
          ha.toFixed(2) + ' ha'
        ];
      } else if (r.ring.units === 'feet') {
        subParts = [
          acres.toFixed(2) + ' acres',
          Math.round(r.area).toLocaleString() + ' m&sup2;',
          km2.toFixed(4) + ' km&sup2;'
        ];
      } else if (r.ring.units === 'meters') {
        subParts = [
          ha.toFixed(2) + ' ha',
          acres.toFixed(2) + ' acres',
          miles2.toFixed(4) + ' mi&sup2;'
        ];
      } else {
        // kilometers
        subParts = [
          ha.toFixed(2) + ' ha',
          acres.toFixed(2) + ' acres',
          miles2.toFixed(4) + ' mi&sup2;'
        ];
      }

      var card = document.createElement('div');
      card.className = 'gbg-result-card';
      card.style.borderLeftColor = r.ring.color;

      card.innerHTML =
        '<div class="gbg-result-card-label">Ring ' + (idx + 1) + ' &mdash; ' + r.ring.distance + ' ' + r.ring.units + '</div>' +
        '<div class="gbg-result-card-value">' + primaryStr + '</div>' +
        '<div class="gbg-result-card-sub">' + subParts.join(' &nbsp;&bull;&nbsp; ') + '</div>';

      resultsGrid.appendChild(card);
    });

    resultsDiv.classList.add('visible');
    downloadBtn.style.display = '';
    copyBtn.style.display = '';
  }

  function formatPrimaryArea(sqm, units) {
    var km2    = sqm / 1e6;
    var miles2 = sqm / 2589988.11;
    var ft2    = sqm * 10.7639;

    if (units === 'miles') {
      return miles2.toFixed(3) + ' mi\u00b2';
    }
    if (units === 'feet') {
      // switch to mi\u00b2 only if extremely large
      if (ft2 >= 2.788e7) return (ft2 / 2.788e7).toFixed(3) + ' mi\u00b2';
      return Math.round(ft2).toLocaleString() + ' ft\u00b2';
    }
    if (units === 'meters') {
      // show m\u00b2 unless the number gets unwieldy
      if (sqm >= 1e6) return km2.toFixed(3) + ' km\u00b2';
      return Math.round(sqm).toLocaleString() + ' m\u00b2';
    }
    // kilometers (default)
    if (km2 >= 1) return km2.toFixed(3) + ' km\u00b2';
    return (sqm / 1e4).toFixed(2) + ' ha';
  }

  // --- CLEAR ---
  clearBtn.addEventListener('click', function () {
    clearBufferLayers();
    resultsDiv.classList.remove('visible');
    setStatus('', '');
  });

  // --- DOWNLOAD / COPY ---
  downloadBtn.addEventListener('click', function () {
    var text = buildOutputGeoJSON();
    var blob = new Blob([text], { type: 'application/json' });
    var base = state.fileName ? state.fileName.replace(/\.[^.]+$/, '') : 'geojson';
    triggerDownload(blob, base + '-buffered.geojson');
  });

  copyBtn.addEventListener('click', function () {
    var text = buildOutputGeoJSON();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setStatus('Copied to clipboard', 'success');
      }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus('Copied to clipboard', 'success');
  }

  function buildOutputGeoJSON() {
    var features = [];

    state.sourceGeoJSON.features.forEach(function (f) {
      var copy = JSON.parse(JSON.stringify(f));
      copy.properties = Object.assign({}, copy.properties || {}, { _layer: 'source' });
      features.push(copy);
    });

    var sorted = state.results.slice().sort(function (a, b) {
      return toMeters(a.ring.distance, a.ring.units) - toMeters(b.ring.distance, b.ring.units);
    });

    sorted.forEach(function (r, idx) {
      r.geojson.features.forEach(function (f) {
        var copy = JSON.parse(JSON.stringify(f));
        copy.properties = {
          _layer: 'buffer',
          bufferIndex: idx + 1,
          bufferDistance: r.ring.distance,
          bufferUnits: r.ring.units,
          bufferColor: r.ring.color,
          areaM2: Math.round(r.area),
          areaKm2: parseFloat((r.area / 1e6).toFixed(4)),
          areaHa: parseFloat((r.area / 1e4).toFixed(2)),
          areaAcres: parseFloat((r.area / 4046.86).toFixed(2))
        };
        features.push(copy);
      });
    });

    return JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2);
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- STATUS ---
  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = type ? ('gbg-status ' + type) : '';
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- SHARE URL ---
  function updateShareUrl() {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + map.getZoom();
    history.replaceState(null, '', hash);
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var p = {};
    hash.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i >= 0) p[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    if (p.lat && p.lng && p.z) {
      map.setView([parseFloat(p.lat), parseFloat(p.lng)], parseInt(p.z, 10));
    }
  }

  map.on('moveend', updateShareUrl);
  loadStateFromUrl();

})();
