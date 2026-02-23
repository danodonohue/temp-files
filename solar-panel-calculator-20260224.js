(function () {
  'use strict';

  var SLUG = 'solar-panel-calculator';
  var MAP_ID = SLUG + '-map';
  var CONTAINER_ID = SLUG + '-container';

  // Panel presets — width x height in metres (portrait orientation as stored)
  var PRESETS = [
    { label: 'Standard UK / AU / NZ  (1.72 x 1.04 m)', w: 1.722, h: 1.040 },
    { label: 'US Standard  (1.65 x 0.99 m)',            w: 1.651, h: 0.991 },
    { label: 'Large Format  (2.00 x 1.05 m)',           w: 2.000, h: 1.052 },
    { label: 'Custom',                                   w: null,  h: null  }
  ];

  var DEFAULT_GAP_MM = 20;
  var DEFAULT_WATTS  = 400;
  // Rough conservative global estimates — see disclaimer
  var PEAK_SUN_H     = 3.5;   // kWh/m2/day equivalent
  var PERF_RATIO     = 0.75;
  var CO2_KG_PER_KWH = 0.20;

  // ---- App state ----
  var map, drawnItems, drawHandler;
  var roofLayer   = null;
  var roofGeoJSON = null;
  var panelItems  = [];  // [{idx, layer, geoJSON}]
  var removedSet  = {};  // panel idx -> true when removed

  // ---- Cached element refs ----
  var elSearch, elSearchBtn, elBtnDraw, elBtnClear, elBtnShare, elBtnKml;
  var elPreset, elOrient, elGapMm, elWatts, elUnits;
  var elCustomDims, elCustomW, elCustomH, elCwLabel, elChLabel;
  var elStatus, elResCount, elResCap, elResOutput, elResCo2, elResArea;

  // ---- Build UI inside container ----
  function buildUI() {
    var c = document.getElementById(CONTAINER_ID);
    if (!c) return;

    var presetOptions = PRESETS.map(function (p, i) {
      return '<option value="' + i + '">' + p.label + '</option>';
    }).join('');

    c.innerHTML =
      '<div id="spc-toolbar">' +
        '<input type="text" id="spc-search-input" placeholder="Search address or postcode..." autocomplete="off" />' +
        '<button id="spc-search-btn">Search</button>' +
        '<button id="spc-btn-draw">Draw Roof</button>' +
        '<button id="spc-btn-clear">Clear</button>' +
      '</div>' +

      '<div id="' + MAP_ID + '"></div>' +
      '<div id="spc-status">Search for your property, then click "Draw Roof" to outline your roof.</div>' +

      '<div id="spc-controls">' +
        '<div id="spc-controls-title">Panel Configuration</div>' +
        '<div class="spc-control-row">' +
          '<div class="spc-control-group">' +
            '<label>Panel Size</label>' +
            '<select id="spc-preset">' + presetOptions + '</select>' +
          '</div>' +
          '<div class="spc-control-group">' +
            '<label>Orientation</label>' +
            '<select id="spc-orient">' +
              '<option value="portrait">Portrait (tall)</option>' +
              '<option value="landscape">Landscape (wide)</option>' +
            '</select>' +
          '</div>' +
          '<div class="spc-control-group">' +
            '<label>Gap (mm)</label>' +
            '<input type="number" id="spc-gap-mm" value="' + DEFAULT_GAP_MM + '" min="0" max="300" step="5" />' +
          '</div>' +
          '<div class="spc-control-group">' +
            '<label>Panel Watts</label>' +
            '<input type="number" id="spc-watts" value="' + DEFAULT_WATTS + '" min="100" max="800" step="10" />' +
          '</div>' +
          '<div class="spc-control-group">' +
            '<label>Units</label>' +
            '<select id="spc-units">' +
              '<option value="metric">Metric (m / m²)</option>' +
              '<option value="imperial">Imperial (ft / ft²)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div id="spc-custom-dims">' +
          '<div class="spc-control-group">' +
            '<label id="spc-cw-label">Width (m)</label>' +
            '<input type="number" id="spc-custom-w" value="1.722" min="0.1" max="5" step="0.001" />' +
          '</div>' +
          '<div class="spc-control-group">' +
            '<label id="spc-ch-label">Height (m)</label>' +
            '<input type="number" id="spc-custom-h" value="1.040" min="0.1" max="5" step="0.001" />' +
          '</div>' +
          '<span id="spc-custom-label">Enter panel dimensions</span>' +
        '</div>' +
      '</div>' +

      '<div id="spc-results">' +
        '<div class="spc-result-card"><div class="spc-result-value" id="spc-res-count">-</div><div class="spc-result-label">Panels</div></div>' +
        '<div class="spc-result-card"><div class="spc-result-value" id="spc-res-area">-</div><div class="spc-result-label">Roof Area</div></div>' +
        '<div class="spc-result-card"><div class="spc-result-value" id="spc-res-cap">-</div><div class="spc-result-label">Est. Capacity</div></div>' +
        '<div class="spc-result-card"><div class="spc-result-value" id="spc-res-output">-</div><div class="spc-result-label">Est. Output/yr</div></div>' +
        '<div class="spc-result-card"><div class="spc-result-value" id="spc-res-co2">-</div><div class="spc-result-label">CO2 Avoided/yr</div></div>' +
      '</div>' +

      '<div id="spc-actions">' +
        '<button id="spc-btn-share">Share Link</button>' +
        '<button id="spc-btn-kml">Download KML</button>' +
      '</div>' +

      '<div id="spc-disclaimer">' +
        '<strong>Note:</strong> Energy and CO2 figures are rough estimates only, based on conservative global assumptions ' +
        '(3.5 peak sun hours/day, 0.75 performance ratio, 0.20 kg CO2/kWh). ' +
        'Actual output varies significantly by location, roof orientation, shading, panel efficiency, and local grid mix. ' +
        'Always get a quote from a qualified solar installer for accurate figures.' +
      '</div>';
  }

  // ---- Cache element refs ----
  function cacheRefs() {
    elSearch     = document.getElementById('spc-search-input');
    elSearchBtn  = document.getElementById('spc-search-btn');
    elBtnDraw    = document.getElementById('spc-btn-draw');
    elBtnClear   = document.getElementById('spc-btn-clear');
    elBtnShare   = document.getElementById('spc-btn-share');
    elBtnKml     = document.getElementById('spc-btn-kml');
    elPreset     = document.getElementById('spc-preset');
    elOrient     = document.getElementById('spc-orient');
    elGapMm      = document.getElementById('spc-gap-mm');
    elWatts      = document.getElementById('spc-watts');
    elUnits      = document.getElementById('spc-units');
    elCustomDims = document.getElementById('spc-custom-dims');
    elCustomW    = document.getElementById('spc-custom-w');
    elCustomH    = document.getElementById('spc-custom-h');
    elCwLabel    = document.getElementById('spc-cw-label');
    elChLabel    = document.getElementById('spc-ch-label');
    elStatus     = document.getElementById('spc-status');
    elResCount   = document.getElementById('spc-res-count');
    elResCap     = document.getElementById('spc-res-cap');
    elResOutput  = document.getElementById('spc-res-output');
    elResCo2     = document.getElementById('spc-res-co2');
    elResArea    = document.getElementById('spc-res-area');
  }

  // ---- Map init ----
  function initMap() {
    map = L.map(MAP_ID, { center: [30, 0], zoom: 2 });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 21 }
    ).addTo(map);

    drawnItems = new L.FeatureGroup().addTo(map);

    map.on(L.Draw.Event.CREATED, function (e) {
      if (roofLayer) drawnItems.removeLayer(roofLayer);
      // Clear panel layers but keep removedSet if restoring from URL
      removePanelLayers();
      removedSet = {};
      roofLayer   = e.layer;
      roofGeoJSON = roofLayer.toGeoJSON();
      roofLayer.setStyle({ color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.08, weight: 2 });
      drawnItems.addLayer(roofLayer);
      elBtnDraw.textContent = 'Redraw Roof';
      setStatus('Fitting panels...');
      setTimeout(fitPanels, 40);
    });

    map.on('moveend', function () { if (roofGeoJSON) updateUrl(); });
  }

  // ---- Get effective panel dimensions (metres) ----
  function getPanelDims() {
    var pIdx   = parseInt(elPreset.value);
    var orient = elOrient.value;
    var w, h;

    if (pIdx === 3) {
      if (elUnits.value === 'imperial') {
        // User entered inches
        w = (parseFloat(elCustomW.value) || 67.8) * 0.0254;
        h = (parseFloat(elCustomH.value) || 40.9) * 0.0254;
      } else {
        w = parseFloat(elCustomW.value) || 1.722;
        h = parseFloat(elCustomH.value) || 1.040;
      }
    } else {
      w = PRESETS[pIdx].w;
      h = PRESETS[pIdx].h;
    }

    // Portrait: as stored (w = long edge, h = short edge for standard panels)
    // Landscape: rotate 90 deg
    if (orient === 'landscape') {
      return { w: h, h: w };
    }
    return { w: w, h: h };
  }

  // ---- Fit panels into roof polygon using Turf grid ----
  function fitPanels(preserveRemovals) {
    removePanelLayers();
    if (!preserveRemovals) removedSet = {};
    if (!roofGeoJSON) { updateResults(); return; }

    var dims  = getPanelDims();
    var gapM  = (parseFloat(elGapMm.value) || DEFAULT_GAP_MM) / 1000;
    var panW  = dims.w;
    var panH  = dims.h;
    var stepW = panW + gapM;
    var stepH = panH + gapM;

    // [minLng, minLat, maxLng, maxLat]
    var bbox   = turf.bbox(roofGeoJSON);
    var midLat = (bbox[1] + bbox[3]) / 2;

    var mPerDegLat = 111320;
    var mPerDegLng = 111320 * Math.cos(midLat * Math.PI / 180);

    var panHDeg  = panH  / mPerDegLat;
    var panWDeg  = panW  / mPerDegLng;
    var stepHDeg = stepH / mPerDegLat;
    var stepWDeg = stepW / mPerDegLng;

    var idx = 0;

    for (var lat = bbox[1]; lat + panHDeg <= bbox[3]; lat += stepHDeg) {
      for (var lng = bbox[0]; lng + panWDeg <= bbox[2]; lng += stepWDeg) {
        var panelPoly = turf.polygon([[
          [lng,           lat          ],
          [lng + panWDeg, lat          ],
          [lng + panWDeg, lat + panHDeg],
          [lng,           lat + panHDeg],
          [lng,           lat          ]
        ]]);

        var fits = false;
        try { fits = turf.booleanWithin(panelPoly, roofGeoJSON); } catch (e) {}

        if (fits) {
          var isRemoved = removedSet[idx] === true;
          var rect = L.rectangle(
            [[lat, lng], [lat + panHDeg, lng + panWDeg]],
            panelStyle(isRemoved)
          );
          rect.addTo(map);

          (function (i, r, poly) {
            r.on('click', function (ev) {
              L.DomEvent.stopPropagation(ev);
              togglePanel(i, r);
            });
            panelItems.push({ idx: i, layer: r, geoJSON: poly });
          }(idx, rect, panelPoly));

          idx++;
        }
      }
    }

    updateResults();
    updateUrl();
    var n = panelItems.filter(function (p) { return !removedSet[p.idx]; }).length;
    setStatus(n + ' panels fitted. Click a panel to remove it (chimneys, skylights, vents, etc.).');
  }

  function panelStyle(removed) {
    return removed
      ? { color: '#95a5a6', weight: 1, fillColor: '#bdc3c7', fillOpacity: 0.25 }
      : { color: '#e67e22', weight: 1, fillColor: '#f1c40f', fillOpacity: 0.65 };
  }

  function togglePanel(idx, rect) {
    if (removedSet[idx]) {
      delete removedSet[idx];
    } else {
      removedSet[idx] = true;
    }
    rect.setStyle(panelStyle(removedSet[idx] === true));
    updateResults();
    updateUrl();
  }

  function removePanelLayers() {
    panelItems.forEach(function (p) { map.removeLayer(p.layer); });
    panelItems = [];
  }

  // ---- Results ----
  function updateResults() {
    var active  = panelItems.filter(function (p) { return !removedSet[p.idx]; }).length;
    var watts   = parseInt(elWatts.value) || DEFAULT_WATTS;
    var capKW   = (active * watts) / 1000;
    var outKWh  = capKW * PEAK_SUN_H * 365 * PERF_RATIO;
    var co2T    = (outKWh * CO2_KG_PER_KWH) / 1000;
    var isImp   = elUnits.value === 'imperial';

    elResCount.textContent  = active;
    elResCap.textContent    = capKW.toFixed(2) + ' kWp';
    elResOutput.textContent = Math.round(outKWh) + ' kWh';
    elResCo2.textContent    = co2T.toFixed(2) + ' t';

    if (roofGeoJSON) {
      var m2 = turf.area(roofGeoJSON);
      elResArea.textContent = isImp
        ? (m2 * 10.764).toFixed(0) + ' ft\u00b2'
        : m2.toFixed(1) + ' m\u00b2';
    } else {
      elResArea.textContent = '-';
    }
  }

  // ---- Geocode ----
  function geocode(q) {
    if (!q) return;
    setStatus('Searching...');
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept-Language': 'en' }
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data[0]) {
        map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 20);
        var short = data[0].display_name.split(',').slice(0, 2).join(',');
        setStatus('Zoomed to: ' + short + '. Click "Draw Roof" to outline your roof.');
      } else {
        setStatus('Address not found. Try a full address, postcode, or suburb name.');
      }
    })
    .catch(function () { setStatus('Search failed. Check your connection and try again.'); });
  }

  // ---- Draw ----
  function startDraw() {
    if (drawHandler) { try { drawHandler.disable(); } catch (e) {} }
    drawHandler = new L.Draw.Polygon(map, {
      allowIntersection: false,
      shapeOptions: { color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.08, weight: 2 }
    });
    drawHandler.enable();
    elBtnDraw.textContent = 'Drawing...';
    setStatus('Click points around your roof outline. Double-click to finish.');
  }

  function clearAll() {
    if (drawHandler) { try { drawHandler.disable(); } catch (e) {} drawHandler = null; }
    drawnItems.clearLayers();
    removePanelLayers();
    removedSet  = {};
    roofLayer   = null;
    roofGeoJSON = null;
    elBtnDraw.textContent = 'Draw Roof';
    updateResults();
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setStatus('Cleared. Search for your property, then click "Draw Roof".');
  }

  // ---- URL state ----
  function updateUrl() {
    if (!roofGeoJSON) return;
    var ctr  = map.getCenter();
    var poly = JSON.stringify(roofGeoJSON.geometry.coordinates[0]);
    var rm   = Object.keys(removedSet).filter(function (k) { return removedSet[k]; }).join(',');

    var parts = [
      'lat=' + ctr.lat.toFixed(6),
      'lng=' + ctr.lng.toFixed(6),
      'z='   + map.getZoom(),
      'ps='  + elPreset.value,
      'or='  + elOrient.value,
      'gap=' + elGapMm.value,
      'w='   + elWatts.value,
      'u='   + elUnits.value,
      'poly='+ encodeURIComponent(poly)
    ];
    if (rm)                    parts.push('rm='  + encodeURIComponent(rm));
    if (elPreset.value === '3') {
      parts.push('cw=' + elCustomW.value);
      parts.push('ch=' + elCustomH.value);
    }
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  function loadFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return false;
    var p = {};
    hash.split('&').forEach(function (seg) {
      var i = seg.indexOf('=');
      if (i < 0) return;
      p[seg.slice(0, i)] = decodeURIComponent(seg.slice(i + 1));
    });

    if (p.ps)  elPreset.value  = p.ps;
    if (p.or)  elOrient.value  = p.or;
    if (p.gap) elGapMm.value   = p.gap;
    if (p.w)   elWatts.value   = p.w;
    if (p.u)   elUnits.value   = p.u;
    if (p.cw)  elCustomW.value = p.cw;
    if (p.ch)  elCustomH.value = p.ch;
    syncCustomDims();
    syncCustomLabels();

    if (p.poly) {
      try {
        var coords  = JSON.parse(p.poly);
        var latlngs = coords.map(function (c) { return [c[1], c[0]]; });
        roofLayer = L.polygon(latlngs, {
          color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.08, weight: 2
        });
        drawnItems.addLayer(roofLayer);
        roofGeoJSON = roofLayer.toGeoJSON();
        elBtnDraw.textContent = 'Redraw Roof';

        if (p.rm) {
          p.rm.split(',').forEach(function (k) {
            var n = parseInt(k);
            if (!isNaN(n)) removedSet[n] = true;
          });
        }

        if (p.lat && p.lng && p.z) {
          map.setView([+p.lat, +p.lng], +p.z);
        } else {
          map.fitBounds(roofLayer.getBounds().pad(0.3));
        }

        setTimeout(function () { fitPanels(true); }, 150);
        return true;
      } catch (e) { console.warn('Could not restore polygon from URL:', e); }
    }
    return false;
  }

  // ---- KML export ----
  function downloadKML() {
    if (!roofGeoJSON) { setStatus('Draw a roof outline first.'); return; }

    var roofCoords = roofGeoJSON.geometry.coordinates[0];
    var roofCoordsStr = roofCoords
      .map(function (c) { return c[0] + ',' + c[1] + ',0'; })
      .join(' ');

    var active    = panelItems.filter(function (p) { return !removedSet[p.idx]; });
    var watts     = parseInt(elWatts.value) || DEFAULT_WATTS;
    var capKW     = (active.length * watts) / 1000;

    var panelPms  = active.map(function (p, i) {
      var c    = p.geoJSON.geometry.coordinates[0];
      var cStr = c.map(function (pt) { return pt[0] + ',' + pt[1] + ',0'; }).join(' ');
      return '<Placemark><name>Panel ' + (i + 1) + '</name>' +
        '<Style><PolyStyle><color>a0f1c40f</color></PolyStyle>' +
        '<LineStyle><color>ffe67e22</color><width>1</width></LineStyle></Style>' +
        '<Polygon><outerBoundaryIs><LinearRing>' +
        '<coordinates>' + cStr + '</coordinates>' +
        '</LinearRing></outerBoundaryIs></Polygon></Placemark>';
    }).join('');

    var kml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">' +
      '<Document>' +
      '<name>Solar Panel Layout</name>' +
      '<description>' + active.length + ' panels | ~' + capKW.toFixed(2) + ' kWp estimated capacity</description>' +
      '<Folder><name>Roof Outline</name>' +
      '<Placemark><name>Roof Area</name>' +
      '<Style><LineStyle><color>ff0000cc</color><width>2</width></LineStyle>' +
      '<PolyStyle><color>220000cc</color></PolyStyle></Style>' +
      '<Polygon><outerBoundaryIs><LinearRing>' +
      '<coordinates>' + roofCoordsStr + '</coordinates>' +
      '</LinearRing></outerBoundaryIs></Polygon>' +
      '</Placemark></Folder>' +
      '<Folder><name>Solar Panels (' + active.length + ')</name>' +
      panelPms +
      '</Folder></Document></kml>';

    var blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'solar-panel-layout.kml'; a.click();
    URL.revokeObjectURL(url);
    setStatus('KML downloaded.');
  }

  // ---- Share link ----
  function shareLink() {
    updateUrl();
    var href = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(href).then(function () { flashShare(); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = href;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      flashShare();
    }
  }

  function flashShare() {
    elBtnShare.textContent = 'Copied!';
    setTimeout(function () { elBtnShare.textContent = 'Share Link'; }, 2000);
  }

  // ---- UI sync helpers ----
  function setStatus(msg) { if (elStatus) elStatus.textContent = msg; }

  function syncCustomDims() {
    elCustomDims.style.display = elPreset.value === '3' ? 'flex' : 'none';
  }

  function syncCustomLabels() {
    var isImp = elUnits.value === 'imperial';
    elCwLabel.textContent = isImp ? 'Width (inches)' : 'Width (m)';
    elChLabel.textContent = isImp ? 'Height (inches)' : 'Height (m)';
  }

  // ---- Attach UI events ----
  function attachEvents() {
    elSearchBtn.addEventListener('click', function () { geocode(elSearch.value.trim()); });
    elSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') geocode(elSearch.value.trim());
    });

    elBtnDraw.addEventListener('click', startDraw);
    elBtnClear.addEventListener('click', clearAll);
    elBtnShare.addEventListener('click', shareLink);
    elBtnKml.addEventListener('click', downloadKML);

    elPreset.addEventListener('change', function () {
      syncCustomDims();
      if (roofGeoJSON) fitPanels(false);
    });
    elOrient.addEventListener('change', function () { if (roofGeoJSON) fitPanels(false); });
    elGapMm.addEventListener('change',  function () { if (roofGeoJSON) fitPanels(false); });
    elWatts.addEventListener('change',  updateResults);
    elUnits.addEventListener('change',  function () { syncCustomLabels(); updateResults(); });

    elCustomW.addEventListener('change', function () {
      if (roofGeoJSON && elPreset.value === '3') fitPanels(false);
    });
    elCustomH.addEventListener('change', function () {
      if (roofGeoJSON && elPreset.value === '3') fitPanels(false);
    });
  }

  // ---- Init ----
  function init() {
    buildUI();
    cacheRefs();
    initMap();
    syncCustomDims();
    syncCustomLabels();
    attachEvents();
    loadFromUrl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
