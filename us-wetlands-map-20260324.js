(function () {
  'use strict';

  var SLUG = 'us-wetlands-map';
  var SERVICE_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Wetlands/FeatureServer/0';
  var MIN_DATA_ZOOM = 8;

  var WETLAND_STYLES = {
    'Freshwater Emergent Wetland':       { color: '#3a8a4a', fillColor: '#6aaa64' },
    'Freshwater Forested/Shrub Wetland': { color: '#1a5c1a', fillColor: '#3d8c3d' },
    'Freshwater Pond':                   { color: '#1a78c2', fillColor: '#74c7f0' },
    'Estuarine and Marine Wetland':      { color: '#006661', fillColor: '#0a9e98' },
    'Estuarine and Marine Deepwater':    { color: '#003b7a', fillColor: '#1565c0' },
    'Lake':                              { color: '#1250c2', fillColor: '#4895ef' },
    'Riverine':                          { color: '#0077a0', fillColor: '#48cae4' }
  };
  var DEFAULT_STYLE = { color: '#777', fillColor: '#aaa' };

  function getStyle(feature) {
    var wt = (feature.properties && feature.properties.WETLAND_TYPE) || '';
    var s = WETLAND_STYLES[wt] || DEFAULT_STYLE;
    return { color: s.color, weight: 0.5, fillColor: s.fillColor, fillOpacity: 0.65 };
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

  var hashState = loadStateFromUrl();
  var initCenter = (hashState && hashState.lat && hashState.lng)
    ? [parseFloat(hashState.lat), parseFloat(hashState.lng)]
    : [38.5, -91.5];
  var initZoom = (hashState && hashState.z)
    ? parseInt(hashState.z, 10)
    : 9;

  var map = L.map(SLUG + '-map', {
    center: initCenter,
    zoom: initZoom
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | Wetlands: <a href="https://www.fws.gov/program/national-wetlands-inventory" target="_blank">USFWS NWI</a>',
    maxZoom: 19
  }).addTo(map);

  var currentSystem = (hashState && hashState.sys) ? hashState.sys : 'all';

  function buildWhere() {
    if (currentSystem === 'all') return '1=1';
    return "SYSTEM_NAME='" + currentSystem + "'";
  }

  var wetlandsLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: buildWhere(),
    style: getStyle,
    minZoom: MIN_DATA_ZOOM,
    onEachFeature: function (feature, layer) {
      var p = feature.properties || {};
      var rows = [
        ['System', p.SYSTEM_NAME],
        ['Subsystem', p.SUBSYSTEM_NAME],
        ['Class', p.CLASS_NAME],
        ['Water Regime', p.WATER_REGIME_NAME]
      ].filter(function (r) { return r[1]; });
      if (p.MODIFIER1_NAME) { rows.push(['Modifier', p.MODIFIER1_NAME]); }

      var html = '<div class="' + SLUG + '-popup">';
      html += '<strong>' + (p.WETLAND_TYPE || 'Unknown Type') + '</strong>';
      if (rows.length) {
        html += '<table>' + rows.map(function (r) {
          return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
        }).join('') + '</table>';
      }
      if (p.ATTRIBUTE) {
        html += '<p class="' + SLUG + '-attr">NWI Code: <code>' + p.ATTRIBUTE + '</code></p>';
      }
      html += '</div>';
      layer.bindPopup(html, { maxWidth: 290 });
    }
  }).addTo(map);

  var systemSelect = document.getElementById(SLUG + '-system');
  if (systemSelect) {
    if (currentSystem !== 'all') { systemSelect.value = currentSystem; }
    systemSelect.addEventListener('change', function () {
      currentSystem = this.value;
      wetlandsLayer.setWhere(buildWhere());
      updateShareUrl();
    });
  }

  var zoomWarning = document.getElementById(SLUG + '-zoom-warning');
  function updateZoomWarning() {
    if (!zoomWarning) return;
    zoomWarning.style.display = (map.getZoom() < MIN_DATA_ZOOM) ? 'flex' : 'none';
  }
  updateZoomWarning();
  map.on('zoomend', updateZoomWarning);

  function updateShareUrl() {
    var c = map.getCenter();
    var params = { lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), z: map.getZoom() };
    if (currentSystem !== 'all') { params.sys = currentSystem; }
    var hash = '#' + Object.keys(params)
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    history.replaceState(null, '', hash);
  }
  map.on('moveend', updateShareUrl);

  var legendEl = document.getElementById(SLUG + '-legend');

  function updateLegend() {
    if (!legendEl) return;
    var seen = {};
    wetlandsLayer.eachFeature(function (layer) {
      var wt = (layer.feature && layer.feature.properties && layer.feature.properties.WETLAND_TYPE) || '';
      if (wt) seen[wt] = true;
    });
    var visibleTypes = Object.keys(seen);

    var lHTML = '<h4>Wetland Type</h4>';
    var hasOther = false;

    // Show known types in definition order, only if present in current view
    Object.keys(WETLAND_STYLES).forEach(function (type) {
      if (visibleTypes.indexOf(type) < 0) return;
      var s = WETLAND_STYLES[type];
      lHTML += '<div class="' + SLUG + '-legend-item">';
      lHTML += '<span class="' + SLUG + '-legend-swatch" style="background:' + s.fillColor + ';border-color:' + s.color + '"></span>';
      lHTML += '<span>' + type + '</span>';
      lHTML += '</div>';
    });

    // Any type not in WETLAND_STYLES gets lumped as Other
    visibleTypes.forEach(function (t) {
      if (!WETLAND_STYLES[t]) hasOther = true;
    });
    if (hasOther) {
      lHTML += '<div class="' + SLUG + '-legend-item">';
      lHTML += '<span class="' + SLUG + '-legend-swatch" style="background:#aaa;border-color:#777"></span>';
      lHTML += '<span>Other</span>';
      lHTML += '</div>';
    }

    if (visibleTypes.length === 0) {
      lHTML += '<div style="color:#999;font-size:0.75rem;padding:2px 0;">No data in view</div>';
    }

    legendEl.innerHTML = lHTML;
  }

  wetlandsLayer.on('load', updateLegend);

})();
