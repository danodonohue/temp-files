(function () {
  'use strict';

  var SLUG = 'geojson-merger';

  var PALETTE = [
    '#3b82f6', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'
  ];

  var map;
  var files = []; // { id, name, color, geojson, layer }
  var nextId = 0;

  // ─── Map ────────────────────────────────────────────────────────────────────

  function initMap() {
    map = L.map(SLUG + '-map', { center: [20, 0], zoom: 2 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);
  }

  // ─── Parsing ─────────────────────────────────────────────────────────────────

  function kmlToFC(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'application/xml');
    var err = doc.querySelector('parsererror');
    if (err) throw new Error('KML parse error');
    return toGeoJSON.kml(doc);
  }

  function parseFile(text, isKml) {
    var obj;
    if (isKml) {
      obj = kmlToFC(text);
    } else {
      try { obj = JSON.parse(text.trim()); }
      catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    }
    // Normalise to FeatureCollection
    if (obj.type === 'FeatureCollection') return obj;
    if (obj.type === 'Feature') return { type: 'FeatureCollection', features: [obj] };
    if (obj.type && obj.type !== 'Feature' && obj.type !== 'FeatureCollection') {
      // raw geometry
      return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: obj, properties: {} }] };
    }
    throw new Error('Unrecognised GeoJSON type: ' + obj.type);
  }

  // ─── Geometry type summary ────────────────────────────────────────────────────

  function geomSummary(fc) {
    var counts = { Point: 0, Line: 0, Polygon: 0, Other: 0 };
    (fc.features || []).forEach(function (f) {
      var t = f.geometry && f.geometry.type || '';
      if (t === 'Point' || t === 'MultiPoint') counts.Point++;
      else if (t === 'LineString' || t === 'MultiLineString') counts.Line++;
      else if (t === 'Polygon' || t === 'MultiPolygon') counts.Polygon++;
      else counts.Other++;
    });
    return Object.keys(counts).filter(function (k) { return counts[k] > 0; })
      .map(function (k) { return counts[k] + ' ' + k + (counts[k] > 1 ? 's' : ''); })
      .join(', ');
  }

  // ─── Layer styling ────────────────────────────────────────────────────────────

  function makeLayer(fc, color) {
    return L.geoJSON(fc, {
      style: function () {
        return { color: color, fillColor: color, fillOpacity: 0.2, weight: 2 };
      },
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
          radius: 5, color: color, fillColor: color, fillOpacity: 0.8, weight: 1.5
        });
      }
    });
  }

  // ─── Add file ─────────────────────────────────────────────────────────────────

  function addFile(name, text, isKml) {
    var fc;
    try { fc = parseFile(text, isKml); }
    catch (e) { setMsg(name + ': ' + e.message, 'error'); return; }

    if (!fc.features || fc.features.length === 0) {
      setMsg(name + ': no features found.', 'warn');
      return;
    }

    var color = PALETTE[files.length % PALETTE.length];
    var id = nextId++;
    var layer = makeLayer(fc, color).addTo(map);

    files.push({ id: id, name: name, color: color, geojson: fc, layer: layer });

    fitAll();
    renderFileList();
    renderSummary();
    setMsg(fc.features.length + ' features loaded from <strong>' + escHtml(name) + '</strong>.', 'ok');
  }

  function removeFile(id) {
    var idx = files.findIndex(function (f) { return f.id === id; });
    if (idx < 0) return;
    map.removeLayer(files[idx].layer);
    files.splice(idx, 1);
    // Reassign colors so they stay consistent
    files.forEach(function (f, i) {
      var col = PALETTE[i % PALETTE.length];
      if (col !== f.color) {
        f.color = col;
        map.removeLayer(f.layer);
        f.layer = makeLayer(f.geojson, col).addTo(map);
      }
    });
    renderFileList();
    renderSummary();
    if (files.length === 0) setMsg('All files removed.', 'info');
    else setMsg('', '');
  }

  function clearAll() {
    files.forEach(function (f) { map.removeLayer(f.layer); });
    files = [];
    renderFileList();
    renderSummary();
    setMsg('Cleared.', 'info');
    map.setView([20, 0], 2);
  }

  // ─── File input / drop ────────────────────────────────────────────────────────

  function loadFileObj(file) {
    var isKml = /\.kml$/i.test(file.name);
    var isJson = /\.(geojson|json)$/i.test(file.name);
    if (!isKml && !isJson) {
      setMsg(file.name + ': unsupported format. Use .geojson, .json, or .kml', 'warn');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) { addFile(file.name, e.target.result, isKml); };
    reader.readAsText(file);
  }

  function loadFiles(fileList) {
    Array.from(fileList).forEach(loadFileObj);
  }

  // ─── KML serialiser ──────────────────────────────────────────────────────────

  function coordsToKml(ring) {
    return ring.map(function (c) { return c[0] + ',' + c[1] + ',0'; }).join(' ');
  }

  function geomToKml(g) {
    if (!g) return '';
    if (g.type === 'Point') {
      return '<Point><coordinates>' + g.coordinates[0] + ',' + g.coordinates[1] + ',0</coordinates></Point>';
    }
    if (g.type === 'MultiPoint') {
      return '<MultiGeometry>' + g.coordinates.map(function (c) {
        return '<Point><coordinates>' + c[0] + ',' + c[1] + ',0</coordinates></Point>';
      }).join('') + '</MultiGeometry>';
    }
    if (g.type === 'LineString') {
      return '<LineString><coordinates>' + coordsToKml(g.coordinates) + '</coordinates></LineString>';
    }
    if (g.type === 'Polygon') {
      var rings = '<outerBoundaryIs><LinearRing><coordinates>' +
        coordsToKml(g.coordinates[0]) + '</coordinates></LinearRing></outerBoundaryIs>';
      for (var i = 1; i < g.coordinates.length; i++) {
        rings += '<innerBoundaryIs><LinearRing><coordinates>' +
          coordsToKml(g.coordinates[i]) + '</coordinates></LinearRing></innerBoundaryIs>';
      }
      return '<Polygon>' + rings + '</Polygon>';
    }
    if (g.type === 'MultiPolygon') {
      return '<MultiGeometry>' + g.coordinates.map(function (poly) {
        return '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
          coordsToKml(poly[0]) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
      }).join('') + '</MultiGeometry>';
    }
    return '';
  }

  function featuresToKml(features) {
    var pm = features.map(function (f, i) {
      var name = (f.properties && (f.properties.name || f.properties.Name)) || ('Feature ' + (i + 1));
      return '<Placemark><name>' + escHtml(String(name)) + '</name>' + geomToKml(f.geometry) + '</Placemark>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>merged</name>' + pm + '</Document></kml>';
  }

  // ─── Merge & download ─────────────────────────────────────────────────────────

  function getMergedFeatures() {
    var tagSource = document.getElementById(SLUG + '-tag-source');
    var doTag = tagSource && tagSource.checked;
    var features = [];
    files.forEach(function (f) {
      f.geojson.features.forEach(function (feat) {
        var clone = JSON.parse(JSON.stringify(feat));
        if (!clone.properties) clone.properties = {};
        if (doTag) clone.properties._source = f.name;
        features.push(clone);
      });
    });
    return features;
  }

  function triggerDownload(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function download(fmt) {
    if (files.length === 0) { setMsg('Add at least one file first.', 'warn'); return; }
    if (files.length === 1) { setMsg('Add at least two files to merge.', 'warn'); return; }
    var features = getMergedFeatures();
    if (fmt === 'kml') {
      triggerDownload(featuresToKml(features), 'merged.kml', 'application/vnd.google-earth.kml+xml');
    } else {
      var fc = { type: 'FeatureCollection', features: features };
      triggerDownload(JSON.stringify(fc, null, 2), 'merged.geojson', 'application/json');
    }
    setMsg(features.length + ' features merged and downloaded.', 'ok');
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function setMsg(text, type) {
    var el = document.getElementById(SLUG + '-status');
    if (!el) return;
    el.innerHTML = text ? '<div class="gjm-msg gjm-msg-' + type + '">' + text + '</div>' : '';
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fitAll() {
    var layers = files.map(function (f) { return f.layer; });
    if (layers.length === 0) return;
    try {
      var bounds = L.featureGroup(layers).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch (e) {}
  }

  function renderSummary() {
    var el = document.getElementById(SLUG + '-summary');
    if (!el) return;
    if (files.length === 0) { el.textContent = ''; return; }
    var total = files.reduce(function (n, f) { return n + f.geojson.features.length; }, 0);
    el.textContent = files.length + ' file' + (files.length > 1 ? 's' : '') +
      ' \u2014 ' + total + ' feature' + (total !== 1 ? 's' : '') + ' total';
  }

  function renderFileList() {
    var el = document.getElementById(SLUG + '-file-list');
    if (!el) return;
    if (files.length === 0) {
      el.innerHTML = '<div class="gjm-empty-state">No files loaded yet. Add two or more files to merge.</div>';
      return;
    }
    el.innerHTML = files.map(function (f) {
      var summary = geomSummary(f.geojson);
      return '<div class="gjm-file-item">' +
        '<span class="gjm-file-swatch" style="background:' + f.color + '"></span>' +
        '<span class="gjm-file-name">' + escHtml(f.name) + '</span>' +
        '<span class="gjm-file-meta">' + f.geojson.features.length + ' features &middot; ' + summary + '</span>' +
        '<button class="gjm-file-remove" title="Remove" onclick="window._gjm.removeFile(' + f.id + ')">&times;</button>' +
        '</div>';
    }).join('');
  }

  // ─── Build UI ─────────────────────────────────────────────────────────────────

  function buildUI() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;

    container.innerHTML =
      '<label id="' + SLUG + '-dropzone" class="gjm-dropzone">' +
        '<input type="file" accept=".geojson,.json,.kml" multiple style="display:none"' +
          ' onchange="window._gjm.loadFiles(this.files); this.value=\'\'">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
          '<polyline points="17 8 12 3 7 8"/>' +
          '<line x1="12" y1="3" x2="12" y2="15"/>' +
        '</svg>' +
        '<span class="gjm-dropzone-title">Drag and drop files here, or click to browse</span>' +
        '<span class="gjm-dropzone-sub">GeoJSON or KML &mdash; add as many files as you need</span>' +
      '</label>' +

      '<div id="' + SLUG + '-file-list" class="gjm-file-list">' +
        '<div class="gjm-empty-state">No files loaded yet. Add two or more files to merge.</div>' +
      '</div>' +

      '<div id="' + SLUG + '-status" class="gjm-status"></div>' +

      '<div id="' + SLUG + '-map"></div>' +

      '<div class="gjm-controls">' +
        '<div class="gjm-controls-row">' +
          '<span id="' + SLUG + '-summary" class="gjm-summary"></span>' +
          '<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button class="gjm-btn gjm-btn-green" onclick="window._gjm.download(\'geojson\')">Save merged GeoJSON</button>' +
            '<button class="gjm-btn gjm-btn-outline" onclick="window._gjm.download(\'kml\')">Save merged KML</button>' +
            '<button class="gjm-btn gjm-btn-gray" onclick="window._gjm.clearAll()">Clear all</button>' +
          '</div>' +
        '</div>' +
        '<div class="gjm-controls-row">' +
          '<label class="gjm-option-row">' +
            '<input type="checkbox" id="' + SLUG + '-tag-source" checked>' +
            'Tag each feature with its source filename (<code>_source</code> property)' +
          '</label>' +
        '</div>' +
      '</div>';

    initMap();

    // Drag-and-drop wiring
    var dz = document.getElementById(SLUG + '-dropzone');
    dz.addEventListener('dragover', function (e) {
      e.preventDefault();
      dz.classList.add('gjm-dropzone-over');
    });
    dz.addEventListener('dragleave', function () {
      dz.classList.remove('gjm-dropzone-over');
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('gjm-dropzone-over');
      if (e.dataTransfer && e.dataTransfer.files) loadFiles(e.dataTransfer.files);
    });
  }

  window._gjm = {
    loadFiles:  loadFiles,
    removeFile: removeFile,
    clearAll:   clearAll,
    download:   download
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})();
