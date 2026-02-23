(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  var CONFIG = {
    containerId:    'farm-field-area-calculator-container',
    mapId:          'farm-field-area-calculator-map',
    defaultCenter:  [39.5, -98.35],
    defaultZoom:    5,
    minDrawZoom:    13,
    snapTolerance:  15,   // pixels — applies to vertex and edge snapping
  };

  // Unit mode definitions — all conversions from m²
  var UNIT_MODES = {
    'ha-ac':   {
      col1: { label: 'Hectares', suffix: 'ha',  dp: 2, fn: function (m2) { return m2 / 10000; } },
      col2: { label: 'Acres',    suffix: 'ac',  dp: 2, fn: function (m2) { return m2 / 4046.856; } },
    },
    'km2-mi2': {
      col1: { label: 'km\u00b2', suffix: 'km\u00b2', dp: 3, fn: function (m2) { return m2 / 1e6; } },
      col2: { label: 'mi\u00b2', suffix: 'mi\u00b2', dp: 4, fn: function (m2) { return m2 / 2589988.11; } },
    },
    'm2-ha': {
      col1: { label: 'm\u00b2',  suffix: 'm\u00b2', dp: 0, fn: function (m2) { return m2; } },
      col2: { label: 'ha',       suffix: 'ha',       dp: 2, fn: function (m2) { return m2 / 10000; } },
    },
  };

  var FIELD_COLORS = [
    '#2ecc71', '#e67e22', '#3498db', '#9b59b6',
    '#e74c3c', '#1abc9c', '#f39c12', '#2980b9',
  ];

  // ─── State ────────────────────────────────────────────────────────────────────
  var map, drawnItems, snapMarker;
  var drawTool     = null;
  var drawingMode  = null;
  var editHandler  = null;
  var editMode     = false;
  var fields       = [];   // [{id, name, layer, areaM2, color}]
  var fieldCounter = 0;
  var unitMode     = 'ha-ac';

  // ─── Build UI ─────────────────────────────────────────────────────────────────
  function buildUI() {
    var c = document.getElementById(CONFIG.containerId);
    if (!c) return;
    c.innerHTML = [
      '<div class="ffac-toolbar ffac-toolbar-draw">',
        '<button class="ffac-btn ffac-btn-poly">\u270f Draw Field (Freeform)</button>',
        '<button class="ffac-btn ffac-btn-rect">\u2b1c Draw Field (Rectangle)</button>',
        '<button class="ffac-btn ffac-btn-edit" id="ffac-btn-edit">\u270e Edit Fields</button>',
        '<button class="ffac-btn ffac-btn-clear">\u2715 Clear All</button>',
        '<span class="ffac-hint">Navigate to your farm, then draw each paddock or field</span>',
      '</div>',
      '<div class="ffac-toolbar ffac-toolbar-edit" style="display:none;">',
        '<button class="ffac-btn ffac-btn-save" id="ffac-btn-save">\u2713 Save Edits</button>',
        '<button class="ffac-btn ffac-btn-cancel" id="ffac-btn-cancel">\u2715 Cancel</button>',
        '<span class="ffac-hint">Drag vertices to reshape fields. Click a field to select it.</span>',
      '</div>',
      '<div class="ffac-drawing-banner"></div>',
      '<div id="' + CONFIG.mapId + '"></div>',
      '<div class="ffac-panel">',
        '<div class="ffac-panel-empty" id="ffac-empty">Draw fields on the map to calculate their area</div>',
        '<div id="ffac-fields-wrap" style="display:none;">',

          // Unit mode toggle
          '<div class="ffac-unit-row">',
            '<span class="ffac-unit-label">Units:</span>',
            '<button class="ffac-unit-btn ffac-unit-active" data-mode="ha-ac">ha / ac</button>',
            '<button class="ffac-unit-btn" data-mode="km2-mi2">km\u00b2 / mi\u00b2</button>',
            '<button class="ffac-unit-btn" data-mode="m2-ha">m\u00b2 / ha</button>',
          '</div>',

          // Field table
          '<table class="ffac-table">',
            '<thead><tr>',
              '<th class="ffac-th-dot"></th>',
              '<th>Field Name</th>',
              '<th id="ffac-col1-head">Hectares</th>',
              '<th id="ffac-col2-head">Acres</th>',
              '<th class="ffac-th-del"></th>',
            '</tr></thead>',
            '<tbody id="ffac-field-rows"></tbody>',
            '<tfoot><tr class="ffac-total-row">',
              '<td colspan="2">Total</td>',
              '<td id="ffac-total-col1">0 ha</td>',
              '<td id="ffac-total-col2">0 ac</td>',
              '<td></td>',
            '</tr></tfoot>',
          '</table>',

          // All-units summary bar
          '<div class="ffac-all-units" id="ffac-all-units"></div>',

          // Download buttons
          '<div class="ffac-downloads">',
            '<span class="ffac-dl-label">Download all fields as:</span>',
            '<button class="ffac-dl-btn" id="ffac-dl-geojson">GeoJSON</button>',
            '<button class="ffac-dl-btn" id="ffac-dl-gpx">GPX</button>',
            '<button class="ffac-dl-btn" id="ffac-dl-kml">KML</button>',
          '</div>',

          // Snap info
          '<p class="ffac-snap-info">Freeform polygons snap to nearby field boundaries (vertices and edges)</p>',

        '</div>',
      '</div>',
    ].join('');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function fmt(n, d) {
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function el(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escXml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function findFieldById(id) {
    for (var i = 0; i < fields.length; i++) { if (fields[i].id === id) return fields[i]; }
    return null;
  }
  function findFieldIndex(id) {
    for (var i = 0; i < fields.length; i++) { if (fields[i].id === id) return i; }
    return -1;
  }
  function triggerDownload(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ─── Snapping ────────────────────────────────────────────────────────────────
  // Returns snapped LatLng within CONFIG.snapTolerance pixels, or null.
  // Vertex snapping takes priority; edge snapping via Turf as fallback.
  function getSnapTarget(latlng) {
    if (!fields.length) return null;
    var tol    = CONFIG.snapTolerance;
    var screenPt = map.latLngToContainerPoint(latlng);
    var best   = null;
    var bestD  = Infinity;

    for (var i = 0; i < fields.length; i++) {
      var ring = fields[i].layer.getLatLngs()[0];

      // 1 — vertex snap
      for (var j = 0; j < ring.length; j++) {
        var vPt = map.latLngToContainerPoint(ring[j]);
        var d   = screenPt.distanceTo(vPt);
        if (d < tol && d < bestD) { bestD = d; best = ring[j]; }
      }

      // 2 — edge snap (only if no vertex found yet)
      if (!best) {
        try {
          var coords = ring.map(function (v) { return [v.lng, v.lat]; });
          coords.push(coords[0]); // close ring
          var nearest = turf.nearestPointOnLine(turf.lineString(coords), turf.point([latlng.lng, latlng.lat]));
          if (nearest) {
            var nll = L.latLng(nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]);
            var nd  = screenPt.distanceTo(map.latLngToContainerPoint(nll));
            if (nd < tol && nd < bestD) { bestD = nd; best = nll; }
          }
        } catch (err) { /* ignore */ }
      }
    }
    return best;
  }

  function updateSnapMarker(snapPt) {
    if (snapPt) {
      snapMarker.setLatLng(snapPt);
      if (!map.hasLayer(snapMarker)) snapMarker.addTo(map);
    } else {
      if (map.hasLayer(snapMarker)) snapMarker.remove();
    }
  }

  // After a polygon is drawn, snap any vertex within tolerance to existing geometry.
  function snapLayerToExisting(layer) {
    if (!fields.length) return;
    var ring    = layer.getLatLngs()[0];
    var snapped = ring.map(function (pt) { return getSnapTarget(pt) || pt; });
    layer.setLatLngs([snapped]);
  }

  // ─── Map Init ────────────────────────────────────────────────────────────────
  function initMap() {
    map = L.map(CONFIG.mapId, { center: CONFIG.defaultCenter, zoom: CONFIG.defaultZoom });

    var esriLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics', maxZoom: 21, maxNativeZoom: 20 }
    );
    var googleLayer = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { attribution: 'Imagery &copy; Google', maxZoom: 21, maxNativeZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'] }
    );
    var osmLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }
    );

    esriLayer.addTo(map);
    L.control.layers(
      { 'ESRI Satellite': esriLayer, 'Google Satellite': googleLayer, 'OpenStreetMap': osmLayer },
      {}, { position: 'topright', collapsed: false }
    ).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Snap indicator marker
    snapMarker = L.circleMarker([0, 0], {
      radius: 9, color: '#f77f00', weight: 2.5,
      fillColor: '#fff', fillOpacity: 0.9, interactive: false,
    });

    // Mousemove: show snap indicator during polygon drawing
    map.on('mousemove', function (e) {
      if (drawingMode !== 'polygon') { updateSnapMarker(null); return; }
      updateSnapMarker(getSnapTarget(e.latlng));
    });

    L.Control.geocoder({
      defaultMarkGeocode: false,
      placeholder: 'Search address\u2026',
      geocoder: L.Control.Geocoder.nominatim(),
    }).on('markgeocode', function (e) { map.fitBounds(e.geocode.bbox); }).addTo(map);

    map.on(L.Draw.Event.CREATED, onDrawCreated);
    map.on(L.Draw.Event.EDITED, function (e) {
      // Recalculate area for every edited layer
      e.layers.eachLayer(function (layer) {
        for (var i = 0; i < fields.length; i++) {
          if (fields[i].layer === layer) {
            fields[i].areaM2 = turf.area(layer.toGeoJSON());
            break;
          }
        }
      });
      renderFieldList();
    });
    map.on('moveend zoomend', saveShareState);
    restoreShareState();
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────────
  function nextColor() { return FIELD_COLORS[fields.length % FIELD_COLORS.length]; }

  function startDraw(mode) {
    if (editMode) { cancelEdit(); }
    if (drawingMode === mode) { stopDraw(); return; }
    stopDraw();
    drawingMode = mode;
    var color = nextColor();
    var opts  = { color: color, fillColor: color, fillOpacity: 0.2, weight: 2 };
    var banner  = document.querySelector('#' + CONFIG.containerId + ' .ffac-drawing-banner');
    var btnPoly = document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-poly');
    var btnRect = document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-rect');

    if (mode === 'polygon') {
      drawTool = new L.Draw.Polygon(map, { shapeOptions: opts, allowIntersection: false });
      drawTool.enable();
      btnPoly.classList.add('active'); btnPoly.textContent = '\u2715 Cancel';
      banner.textContent = 'Click points around the field. Double-click to finish. Snaps to nearby boundaries.';
    } else {
      drawTool = new L.Draw.Rectangle(map, { shapeOptions: opts });
      drawTool.enable();
      btnRect.classList.add('active'); btnRect.textContent = '\u2715 Cancel';
      banner.textContent = 'Click and drag to draw a rectangular field.';
    }
    banner.classList.add('visible');
    if (map.getZoom() < CONFIG.minDrawZoom) map.setZoom(CONFIG.minDrawZoom);
  }

  function stopDraw() {
    if (drawTool) { drawTool.disable(); drawTool = null; }
    drawingMode = null;
    updateSnapMarker(null);
    var banner  = document.querySelector('#' + CONFIG.containerId + ' .ffac-drawing-banner');
    var btnPoly = document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-poly');
    var btnRect = document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-rect');
    if (banner)  { banner.classList.remove('visible'); banner.textContent = ''; }
    if (btnPoly) { btnPoly.classList.remove('active'); btnPoly.textContent = '\u270f Draw Field (Freeform)'; }
    if (btnRect) { btnRect.classList.remove('active'); btnRect.textContent = '\u2b1c Draw Field (Rectangle)'; }
  }

  // ─── Edit mode ───────────────────────────────────────────────────────────────
  function startEdit() {
    if (!fields.length) return;
    stopDraw();
    editMode = true;
    editHandler = new L.EditToolbar.Edit(map, {
      featureGroup: drawnItems,
      poly: { allowIntersection: false },
    });
    editHandler.enable();
    var toolbarDraw = document.querySelector('#' + CONFIG.containerId + ' .ffac-toolbar-draw');
    var toolbarEdit = document.querySelector('#' + CONFIG.containerId + ' .ffac-toolbar-edit');
    toolbarDraw.style.display = 'none';
    toolbarEdit.style.display = '';
  }

  function saveEdit() {
    if (!editHandler) return;
    editHandler.save();   // fires L.Draw.Event.EDITED — areas updated there
    editHandler.disable();
    editHandler = null;
    editMode = false;
    setEditToolbarVisible(false);
  }

  function cancelEdit() {
    if (!editHandler) return;
    editHandler.revertLayers();
    editHandler.disable();
    editHandler = null;
    editMode = false;
    setEditToolbarVisible(false);
  }

  function setEditToolbarVisible(editing) {
    var toolbarDraw = document.querySelector('#' + CONFIG.containerId + ' .ffac-toolbar-draw');
    var toolbarEdit = document.querySelector('#' + CONFIG.containerId + ' .ffac-toolbar-edit');
    if (toolbarDraw) toolbarDraw.style.display = editing ? 'none' : '';
    if (toolbarEdit) toolbarEdit.style.display = editing ? '' : 'none';
  }

  function onDrawCreated(e) {
    stopDraw();
    var layer = e.layer;
    // Apply vertex + edge snapping for freeform polygons
    if (e.layerType === 'polygon') snapLayerToExisting(layer);
    var areaM2 = turf.area(layer.toGeoJSON());
    var color  = layer.options.color || FIELD_COLORS[0];
    var id     = ++fieldCounter;
    fields.push({ id: id, name: 'Field ' + id, layer: layer, areaM2: areaM2, color: color });
    drawnItems.addLayer(layer);
    layer.on('click', function () { highlightField(id); });
    renderFieldList();
  }

  function deleteField(id) {
    var idx = findFieldIndex(id);
    if (idx < 0) return;
    drawnItems.removeLayer(fields[idx].layer);
    fields.splice(idx, 1);
    renderFieldList();
  }

  function highlightField(id) {
    var tbody = el('ffac-field-rows');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('ffac-row-active', parseInt(rows[i].dataset.id) === id);
    }
    var f = findFieldById(id);
    if (f) map.fitBounds(f.layer.getBounds(), { padding: [60, 60] });
  }

  // ─── Units ────────────────────────────────────────────────────────────────────
  function setUnitMode(mode) {
    unitMode = mode;
    var btns = document.querySelectorAll('#' + CONFIG.containerId + ' .ffac-unit-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('ffac-unit-active', btns[i].dataset.mode === mode);
    }
    var def = UNIT_MODES[mode];
    var h1  = el('ffac-col1-head');
    var h2  = el('ffac-col2-head');
    if (h1) h1.textContent = def.col1.label;
    if (h2) h2.textContent = def.col2.label;
    renderFieldList();
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  function renderFieldList() {
    var empty = el('ffac-empty');
    var wrap  = el('ffac-fields-wrap');
    var tbody = el('ffac-field-rows');
    if (!fields.length) { empty.style.display = ''; wrap.style.display = 'none'; return; }
    empty.style.display = 'none'; wrap.style.display = '';

    var def = UNIT_MODES[unitMode];
    tbody.innerHTML = fields.map(function (f) {
      var v1 = def.col1.fn(f.areaM2);
      var v2 = def.col2.fn(f.areaM2);
      return '<tr data-id="' + f.id + '">' +
        '<td><span class="ffac-dot" style="background:' + f.color + '"></span></td>' +
        '<td><input class="ffac-name-input" data-id="' + f.id + '" value="' + escHtml(f.name) + '" /></td>' +
        '<td class="ffac-num">' + fmt(v1, def.col1.dp) + ' ' + def.col1.suffix + '</td>' +
        '<td class="ffac-num">' + fmt(v2, def.col2.dp) + ' ' + def.col2.suffix + '</td>' +
        '<td><button class="ffac-del" data-id="' + f.id + '" title="Delete">\u2715</button></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.ffac-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); deleteField(parseInt(this.dataset.id)); });
    });
    tbody.querySelectorAll('.ffac-name-input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var f = findFieldById(parseInt(this.dataset.id));
        if (f) f.name = this.value.trim() || f.name;
      });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { highlightField(parseInt(this.dataset.id)); });
    });

    var totalM2 = fields.reduce(function (s, f) { return s + f.areaM2; }, 0);
    var tv1 = def.col1.fn(totalM2);
    var tv2 = def.col2.fn(totalM2);
    el('ffac-total-col1').textContent = fmt(tv1, def.col1.dp) + ' ' + def.col1.suffix;
    el('ffac-total-col2').textContent = fmt(tv2, def.col2.dp) + ' ' + def.col2.suffix;
    renderUnitSummary(totalM2);
  }

  function renderUnitSummary(totalM2) {
    var bar = el('ffac-all-units');
    if (!bar) return;
    var ha  = totalM2 / 10000;
    var km2 = totalM2 / 1e6;
    var ac  = totalM2 / 4046.856;
    var mi2 = totalM2 / 2589988.11;
    bar.innerHTML =
      '<span class="ffac-au-label">All units:</span> ' +
      fmt(totalM2, 0)  + ' m\u00b2 &nbsp;&middot;&nbsp; ' +
      fmt(ha,  2)      + ' ha &nbsp;&middot;&nbsp; ' +
      fmt(km2, 3)      + ' km\u00b2 &nbsp;&middot;&nbsp; ' +
      fmt(ac,  2)      + ' ac &nbsp;&middot;&nbsp; ' +
      fmt(mi2, 4)      + ' mi\u00b2';
  }

  // ─── Downloads ────────────────────────────────────────────────────────────────
  function downloadGeoJSON() {
    var features = fields.map(function (f) {
      var feat = f.layer.toGeoJSON();
      feat.properties = {
        name:       f.name,
        area_m2:    parseFloat(f.areaM2.toFixed(2)),
        area_ha:    parseFloat((f.areaM2 / 10000).toFixed(4)),
        area_km2:   parseFloat((f.areaM2 / 1e6).toFixed(6)),
        area_acres: parseFloat((f.areaM2 / 4046.856).toFixed(4)),
        area_mi2:   parseFloat((f.areaM2 / 2589988.11).toFixed(6)),
      };
      return feat;
    });
    triggerDownload(
      JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2),
      'farm-fields.geojson', 'application/geo+json'
    );
  }

  function downloadKML() {
    var placemarks = fields.map(function (f) {
      var ring   = f.layer.getLatLngs()[0];
      var coords = ring.map(function (p) { return p.lng.toFixed(6) + ',' + p.lat.toFixed(6) + ',0'; }).join(' ');
      coords    += ' ' + ring[0].lng.toFixed(6) + ',' + ring[0].lat.toFixed(6) + ',0';
      var ha     = f.areaM2 / 10000;
      var ac     = f.areaM2 / 4046.856;
      return '  <Placemark>\n' +
        '    <name>' + escXml(f.name) + '</name>\n' +
        '    <description>Area: ' + fmt(ha, 2) + ' ha (' + fmt(ac, 2) + ' ac)</description>\n' +
        '    <Polygon><outerBoundaryIs><LinearRing>\n' +
        '      <coordinates>' + coords + '</coordinates>\n' +
        '    </LinearRing></outerBoundaryIs></Polygon>\n  </Placemark>';
    }).join('\n');
    triggerDownload(
      '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>Farm Fields</name>\n' + placemarks + '\n</Document>\n</kml>',
      'farm-fields.kml', 'application/vnd.google-earth.kml+xml'
    );
  }

  function downloadGPX() {
    var tracks = fields.map(function (f) {
      var ring = f.layer.getLatLngs()[0];
      var pts  = ring.map(function (p) {
        return '      <trkpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"></trkpt>';
      });
      pts.push('      <trkpt lat="' + ring[0].lat.toFixed(6) + '" lon="' + ring[0].lng.toFixed(6) + '"></trkpt>');
      var ha = f.areaM2 / 10000;
      var ac = f.areaM2 / 4046.856;
      return '  <trk>\n    <name>' + escXml(f.name) + '</name>\n' +
        '    <desc>Area: ' + fmt(ha, 2) + ' ha (' + fmt(ac, 2) + ' ac)</desc>\n' +
        '    <trkseg>\n' + pts.join('\n') + '\n    </trkseg>\n  </trk>';
    }).join('\n');
    triggerDownload(
      '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MapScaping Farm Field Area Calculator" xmlns="http://www.topografix.com/GPX/1/1">\n' + tracks + '\n</gpx>',
      'farm-fields.gpx', 'application/gpx+xml'
    );
  }

  // ─── Share URL ────────────────────────────────────────────────────────────────
  function saveShareState() {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + map.getZoom());
  }
  function restoreShareState() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var p = {};
    hash.split('&').forEach(function (seg) {
      var i = seg.indexOf('=');
      if (i > 0) p[seg.slice(0, i)] = decodeURIComponent(seg.slice(i + 1));
    });
    if (p.lat && p.lng && p.z) map.setView([+p.lat, +p.lng], +p.z);
  }

  // ─── Bind Events ─────────────────────────────────────────────────────────────
  function bindEvents() {
    document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-poly')
      .addEventListener('click', function () { startDraw('polygon'); });
    document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-rect')
      .addEventListener('click', function () { startDraw('rect'); });
    document.querySelector('#' + CONFIG.containerId + ' .ffac-btn-clear')
      .addEventListener('click', function () {
        stopDraw(); drawnItems.clearLayers();
        fields = []; fieldCounter = 0; renderFieldList();
        history.replaceState(null, '', window.location.pathname + window.location.search);
      });
    document.querySelectorAll('#' + CONFIG.containerId + ' .ffac-unit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { setUnitMode(this.dataset.mode); });
    });
    el('ffac-btn-edit').addEventListener('click', startEdit);
    el('ffac-btn-save').addEventListener('click', saveEdit);
    el('ffac-btn-cancel').addEventListener('click', cancelEdit);
    el('ffac-dl-geojson').addEventListener('click', downloadGeoJSON);
    el('ffac-dl-gpx').addEventListener('click', downloadGPX);
    el('ffac-dl-kml').addEventListener('click', downloadKML);
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  function init() { buildUI(); initMap(); bindEvents(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
