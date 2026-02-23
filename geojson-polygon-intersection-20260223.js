(function () {
  'use strict';

  var SLUG = 'geojson-polygon-intersection';
  var map, layerA, layerB, layerIntersect, layerDiffA, layerDiffB;
  var geomA = null, geomB = null;

  var STYLES = {
    a:           { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.25, weight: 2 },
    b:           { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.25, weight: 2 },
    intersection:{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.45, weight: 2.5, dashArray: null },
    diffA:       { color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.35, weight: 2, dashArray: '5,4' },
    diffB:       { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.35, weight: 2, dashArray: '5,4' }
  };

  function initMap() {
    map = L.map(SLUG + '-map', {
      center: [20, 0],
      zoom: 2
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    layerA          = L.geoJSON(null, { style: STYLES.a }).addTo(map);
    layerB          = L.geoJSON(null, { style: STYLES.b }).addTo(map);
    layerIntersect  = L.geoJSON(null, { style: STYLES.intersection }).addTo(map);
    layerDiffA      = L.geoJSON(null, { style: STYLES.diffA }).addTo(map);
    layerDiffB      = L.geoJSON(null, { style: STYLES.diffB }).addTo(map);
  }

  function parseGeoJSON(raw) {
    var obj;
    try {
      obj = JSON.parse(raw.trim());
    } catch (e) {
      return { error: 'Invalid JSON: ' + e.message };
    }

    // Accept Feature, FeatureCollection (single polygon feature), or Geometry
    var feature;
    if (obj.type === 'Feature') {
      feature = obj;
    } else if (obj.type === 'FeatureCollection') {
      var polys = obj.features.filter(function (f) {
        return f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
      });
      if (polys.length === 0) {
        return { error: 'FeatureCollection has no Polygon or MultiPolygon features.' };
      }
      feature = polys[0];
      if (polys.length > 1) {
        // merge all into a MultiPolygon via union
        feature = polys.reduce(function (acc, f) {
          var result = turf.union(acc, f);
          return result || acc;
        });
      }
    } else if (obj.type === 'Polygon' || obj.type === 'MultiPolygon') {
      feature = turf.feature(obj);
    } else {
      return { error: 'Expected a Polygon, MultiPolygon Feature, FeatureCollection, or raw geometry. Got: ' + obj.type };
    }

    if (!feature.geometry ||
        (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) {
      return { error: 'Geometry must be Polygon or MultiPolygon, got: ' + (feature.geometry ? feature.geometry.type : 'null') };
    }

    return { feature: feature };
  }

  function setMsg(text, type) {
    var el = document.getElementById(SLUG + '-status');
    if (!el) return;
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="gpi-msg gpi-msg-' + type + '">' + text + '</div>';
  }

  function loadLayer(which) {
    var raw = document.getElementById(SLUG + '-textarea-' + which).value;
    if (!raw.trim()) {
      setMsg('Paste GeoJSON or upload a GeoJSON / KML file for Polygon ' + which.toUpperCase() + ' first.', 'warn');
      return;
    }
    var result = parseGeoJSON(raw);
    if (result.error) {
      setMsg('Polygon ' + which.toUpperCase() + ': ' + result.error, 'error');
      return;
    }
    var feature = result.feature;
    if (which === 'a') {
      geomA = feature;
      layerA.clearLayers();
      layerA.addData(feature);
    } else {
      geomB = feature;
      layerB.clearLayers();
      layerB.addData(feature);
    }
    clearResults();

    // Fit map to loaded features
    var bounds = L.featureGroup([layerA, layerB].filter(function (l) {
      return l.getLayers().length > 0;
    })).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
    setMsg('Polygon ' + which.toUpperCase() + ' loaded.', 'ok');
  }

  function clearResults() {
    layerIntersect.clearLayers();
    layerDiffA.clearLayers();
    layerDiffB.clearLayers();
    setCheckbox('show-intersection', true);
    setCheckbox('show-diff-a', true);
    setCheckbox('show-diff-b', true);
    updateResultVisibility('intersection', true);
    updateResultVisibility('diff-a', true);
    updateResultVisibility('diff-b', true);
  }

  function checkBothLoaded() {
    if (!geomA || !geomB) {
      setMsg('Load both Polygon A and Polygon B first.', 'warn');
      return false;
    }
    return true;
  }

  function doIntersect() {
    if (!checkBothLoaded()) return;
    try {
      var result = turf.intersect(geomA, geomB);
      layerIntersect.clearLayers();
      if (!result) {
        setMsg('No intersection found - the polygons do not overlap.', 'info');
        return;
      }
      layerIntersect.addData(result);
      map.fitBounds(layerIntersect.getBounds(), { padding: [20, 20] });
      setMsg('Intersection computed. Area: ' + formatArea(turf.area(result)), 'ok');
    } catch (e) {
      setMsg('Intersection error: ' + e.message, 'error');
    }
  }

  function doDiffA() {
    if (!checkBothLoaded()) return;
    try {
      var result = turf.difference(geomA, geomB);
      layerDiffA.clearLayers();
      if (!result) {
        setMsg('Difference A minus B is empty (B completely covers A).', 'info');
        return;
      }
      layerDiffA.addData(result);
      map.fitBounds(layerDiffA.getBounds(), { padding: [20, 20] });
      setMsg('Difference A \u2212 B computed. Area: ' + formatArea(turf.area(result)), 'ok');
    } catch (e) {
      setMsg('Difference error: ' + e.message, 'error');
    }
  }

  function doDiffB() {
    if (!checkBothLoaded()) return;
    try {
      var result = turf.difference(geomB, geomA);
      layerDiffB.clearLayers();
      if (!result) {
        setMsg('Difference B minus A is empty (A completely covers B).', 'info');
        return;
      }
      layerDiffB.addData(result);
      map.fitBounds(layerDiffB.getBounds(), { padding: [20, 20] });
      setMsg('Difference B \u2212 A computed. Area: ' + formatArea(turf.area(result)), 'ok');
    } catch (e) {
      setMsg('Difference error: ' + e.message, 'error');
    }
  }

  function doRunAll() {
    if (!checkBothLoaded()) return;
    clearResults();
    var msgs = [];

    try {
      var inter = turf.intersect(geomA, geomB);
      if (inter) {
        layerIntersect.addData(inter);
        msgs.push('Intersection: ' + formatArea(turf.area(inter)));
      } else {
        msgs.push('Intersection: none');
      }
    } catch (e) { msgs.push('Intersection error: ' + e.message); }

    try {
      var dA = turf.difference(geomA, geomB);
      if (dA) {
        layerDiffA.addData(dA);
        msgs.push('A \u2212 B: ' + formatArea(turf.area(dA)));
      } else {
        msgs.push('A \u2212 B: empty');
      }
    } catch (e) { msgs.push('Diff A error: ' + e.message); }

    try {
      var dB = turf.difference(geomB, geomA);
      if (dB) {
        layerDiffB.addData(dB);
        msgs.push('B \u2212 A: ' + formatArea(turf.area(dB)));
      } else {
        msgs.push('B \u2212 A: empty');
      }
    } catch (e) { msgs.push('Diff B error: ' + e.message); }

    var allLayers = [layerIntersect, layerDiffA, layerDiffB].filter(function (l) {
      return l.getLayers().length > 0;
    });
    if (allLayers.length > 0) {
      var bounds = L.featureGroup(allLayers).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    }

    setMsg(msgs.join(' &nbsp;|&nbsp; '), 'ok');
  }

  function doClear() {
    geomA = null;
    geomB = null;
    layerA.clearLayers();
    layerB.clearLayers();
    clearResults();
    document.getElementById(SLUG + '-textarea-a').value = '';
    document.getElementById(SLUG + '-textarea-b').value = '';
    setMsg('Cleared.', 'info');
    map.setView([20, 0], 2);
  }

  function downloadLayer(which) {
    var layer = which === 'a' ? layerA :
                which === 'b' ? layerB :
                which === 'intersection' ? layerIntersect :
                which === 'diff-a' ? layerDiffA : layerDiffB;
    var features = [];
    layer.eachLayer(function (l) {
      if (l.toGeoJSON) features.push(l.toGeoJSON());
    });
    if (features.length === 0) {
      setMsg('No data to download for this layer.', 'warn');
      return;
    }
    var fc = { type: 'FeatureCollection', features: features };
    var blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = SLUG + '-' + which + '.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }

  function kmlToGeoJSONText(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'application/xml');
    var parseErr = doc.querySelector('parsererror');
    if (parseErr) throw new Error('KML parse error: ' + parseErr.textContent.slice(0, 120));
    var fc = toGeoJSON.kml(doc);
    return JSON.stringify(fc);
  }

  function loadFile(which, file) {
    if (!file) return;
    var isKml = /\.kml$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      if (isKml) {
        try {
          text = kmlToGeoJSONText(text);
        } catch (err) {
          setMsg('KML conversion failed: ' + err.message, 'error');
          return;
        }
      }
      document.getElementById(SLUG + '-textarea-' + which).value = text;
      loadLayer(which);
    };
    reader.readAsText(file);
  }

  function setCheckbox(id, val) {
    var el = document.getElementById(SLUG + '-' + id);
    if (el) el.checked = val;
  }

  function updateResultVisibility(which, visible) {
    var layer = which === 'intersection' ? layerIntersect :
                which === 'diff-a' ? layerDiffA : layerDiffB;
    if (visible) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }

  function formatArea(m2) {
    if (m2 >= 1e6) return (m2 / 1e6).toFixed(2) + ' km\u00b2';
    return m2.toFixed(0) + ' m\u00b2';
  }

  function buildUI() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;

    container.innerHTML =
      '<div class="gpi-panels">' +
        '<div class="gpi-panel">' +
          '<div class="gpi-panel-header"><span class="gpi-swatch gpi-swatch-a"></span> Polygon A</div>' +
          '<textarea id="' + SLUG + '-textarea-a" class="gpi-textarea" placeholder="Paste GeoJSON here, or upload a .geojson or .kml file..."></textarea>' +
          '<div class="gpi-file-row">' +
            '<button class="gpi-btn gpi-btn-primary gpi-btn-sm" onclick="window._gpi.loadLayer(\'a\')">Load A</button>' +
            '<label class="gpi-btn gpi-btn-outline gpi-btn-sm" style="cursor:pointer;">Upload GeoJSON / KML <input type="file" accept=".geojson,.json,.kml" style="display:none" onchange="window._gpi.loadFile(\'a\',this.files[0])"></label>' +
            '<button class="gpi-btn gpi-btn-outline gpi-btn-sm" onclick="window._gpi.downloadLayer(\'a\')">Download A</button>' +
          '</div>' +
        '</div>' +
        '<div class="gpi-panel">' +
          '<div class="gpi-panel-header"><span class="gpi-swatch gpi-swatch-b"></span> Polygon B</div>' +
          '<textarea id="' + SLUG + '-textarea-b" class="gpi-textarea" placeholder="Paste GeoJSON here, or upload a .geojson or .kml file..."></textarea>' +
          '<div class="gpi-file-row">' +
            '<button class="gpi-btn gpi-btn-amber gpi-btn-sm" onclick="window._gpi.loadLayer(\'b\')">Load B</button>' +
            '<label class="gpi-btn gpi-btn-outline gpi-btn-sm" style="cursor:pointer;">Upload GeoJSON / KML <input type="file" accept=".geojson,.json,.kml" style="display:none" onchange="window._gpi.loadFile(\'b\',this.files[0])"></label>' +
            '<button class="gpi-btn gpi-btn-outline gpi-btn-sm" onclick="window._gpi.downloadLayer(\'b\')">Download B</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div id="' + SLUG + '-status" class="gpi-status"></div>' +

      '<div id="' + SLUG + '-map"></div>' +

      '<hr class="gpi-divider">' +

      '<div class="gpi-ops-row">' +
        '<button class="gpi-btn gpi-btn-primary" onclick="window._gpi.doRunAll()">Run All</button>' +
        '<button class="gpi-btn gpi-btn-intersect" onclick="window._gpi.doIntersect()">Intersection</button>' +
        '<button class="gpi-btn gpi-btn-diff-a" onclick="window._gpi.doDiffA()">A \u2212 B</button>' +
        '<button class="gpi-btn gpi-btn-diff-b" onclick="window._gpi.doDiffB()">B \u2212 A</button>' +
        '<button class="gpi-btn gpi-btn-clear" onclick="window._gpi.doClear()">Clear All</button>' +
      '</div>' +

      '<div class="gpi-results-row">' +
        '<div class="gpi-result-item">' +
          '<span class="gpi-swatch gpi-swatch-intersection"></span>' +
          '<label><input type="checkbox" id="' + SLUG + '-show-intersection" checked onchange="window._gpi.updateResultVisibility(\'intersection\',this.checked)"> Intersection</label>' +
          '<button class="gpi-btn gpi-btn-outline gpi-btn-sm" onclick="window._gpi.downloadLayer(\'intersection\')">Save</button>' +
        '</div>' +
        '<div class="gpi-result-item">' +
          '<span class="gpi-swatch gpi-swatch-diff-a"></span>' +
          '<label><input type="checkbox" id="' + SLUG + '-show-diff-a" checked onchange="window._gpi.updateResultVisibility(\'diff-a\',this.checked)"> A \u2212 B</label>' +
          '<button class="gpi-btn gpi-btn-outline gpi-btn-sm" onclick="window._gpi.downloadLayer(\'diff-a\')">Save</button>' +
        '</div>' +
        '<div class="gpi-result-item">' +
          '<span class="gpi-swatch gpi-swatch-diff-b"></span>' +
          '<label><input type="checkbox" id="' + SLUG + '-show-diff-b" checked onchange="window._gpi.updateResultVisibility(\'diff-b\',this.checked)"> B \u2212 A</label>' +
          '<button class="gpi-btn gpi-btn-outline gpi-btn-sm" onclick="window._gpi.downloadLayer(\'diff-b\')">Save</button>' +
        '</div>' +
      '</div>';

    initMap();
  }

  window._gpi = {
    loadLayer: loadLayer,
    loadFile: loadFile,
    doIntersect: doIntersect,
    doDiffA: doDiffA,
    doDiffB: doDiffB,
    doRunAll: doRunAll,
    doClear: doClear,
    downloadLayer: downloadLayer,
    updateResultVisibility: updateResultVisibility
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})();
