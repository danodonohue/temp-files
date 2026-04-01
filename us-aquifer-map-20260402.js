(function () {
  'use strict';

  var SLUG    = 'us-aquifer-map';
  var SVC_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Aquifers_Feature_Layer_view/FeatureServer/0';

  var ROCK_TYPES = [
    { key: 'Unconsolidated sand and gravel', label: 'Sand & gravel',            color: '#D4A843' },
    { key: 'Semiconsolidated sand',          label: 'Semiconsolidated sand',    color: '#E8C96B' },
    { key: 'Sandstone',                      label: 'Sandstone',                color: '#C0603A' },
    { key: 'Sandstone and carbonate-rock',   label: 'Sandstone & carbonate',    color: '#9B6E4A' },
    { key: 'Carbonate-rock',                 label: 'Carbonate rock',           color: '#3A9E8B' },
    { key: 'Igneous and metamorphic-rock',   label: 'Igneous & metamorphic',    color: '#7B6FA0' }
  ];

  var rockLookup = {};
  ROCK_TYPES.forEach(function (r) { rockLookup[r.key] = r; });

  // ── URL state ────────────────────────────────────────────────────────────────
  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return {};
    var out = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

  function updateShareUrl() {
    var c = map.getCenter();
    var activeKeys = ROCK_TYPES
      .filter(function (r) { return activeSet[r.key]; })
      .map(function (r) { return r.key; });
    var hash = 'lat=' + c.lat.toFixed(4) +
               '&lng=' + c.lng.toFixed(4) +
               '&z='   + map.getZoom() +
               '&rt='  + encodeURIComponent(activeKeys.join('|'));
    history.replaceState(null, '', '#' + hash);
  }

  var urlState = loadStateFromUrl();
  var initLat  = urlState.lat ? +urlState.lat : 38.5;
  var initLng  = urlState.lng ? +urlState.lng : -96.5;
  var initZ    = urlState.z   ? +urlState.z   : 4;

  var activeSet = {};
  ROCK_TYPES.forEach(function (r) { activeSet[r.key] = true; });
  if (urlState.rt) {
    ROCK_TYPES.forEach(function (r) { activeSet[r.key] = false; });
    urlState.rt.split('|').forEach(function (k) {
      if (rockLookup[k]) activeSet[k] = true;
    });
  }

  // ── Map init ─────────────────────────────────────────────────────────────────
  var map = L.map(SLUG + '-map', {
    center: [initLat, initLng],
    zoom:   initZ
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18
  }).addTo(map);

  // ── Area formatting ───────────────────────────────────────────────────────────
  function formatAcres(sqMetresWebMercator) {
    if (!sqMetresWebMercator || sqMetresWebMercator <= 0) return null;
    var acres = sqMetresWebMercator / 6515;
    if (acres < 1)        return '< 1 acre';
    if (acres < 1000)     return '~' + Math.round(acres) + ' acres';
    if (acres < 100000)   return '~' + (Math.round(acres / 100) * 100).toLocaleString() + ' acres';
    if (acres < 1000000)  return '~' + (Math.round(acres / 1000) * 1000).toLocaleString() + ' acres';
    return '~' + (acres / 1000000).toFixed(1) + ' million acres';
  }

  // ── WHERE clause helper ───────────────────────────────────────────────────────
  function buildWhere() {
    var active = ROCK_TYPES.filter(function (r) { return activeSet[r.key]; });
    if (active.length === 0)               return '1=0';
    if (active.length === ROCK_TYPES.length) return '1=1';
    return active.map(function (r) {
      return "ROCK_NAME='" + r.key.replace(/'/g, "''") + "'";
    }).join(' OR ');
  }

  // ── Feature layer ─────────────────────────────────────────────────────────────
  var aquiferLayer = L.esri.featureLayer({
    url:   SVC_URL,
    where: buildWhere(),
    style: function (feature) {
      var cfg = rockLookup[feature.properties.ROCK_NAME];
      return cfg
        ? { color: cfg.color, weight: 0.6, fillColor: cfg.color, fillOpacity: 0.5 }
        : { color: '#aaa',    weight: 0.5, fillOpacity: 0.3 };
    },
    onEachFeature: function (feature, layer) {
      var p    = feature.properties;
      var name = p.AQ_NAME  || 'Aquifer Unit';
      var rock = p.ROCK_NAME || '';
      var cfg  = rockLookup[rock] || {};
      var area = formatAcres(p.Shape__Area);

      var areaHtml = area
        ? '<div class="' + SLUG + '-popup-row">' +
            '<span class="' + SLUG + '-popup-label">Area</span>' +
            '<span class="' + SLUG + '-popup-value">' + area + ' (approx.)</span>' +
          '</div>'
        : '';

      layer.bindPopup(
        '<div class="' + SLUG + '-popup">' +
          '<strong class="' + SLUG + '-popup-name">' + name + '</strong>' +
          '<span class="' + SLUG + '-popup-badge" style="background:' + (cfg.color || '#777') + '">' +
            (cfg.label || rock || 'Aquifer') +
          '</span>' +
          areaHtml +
        '</div>',
        { maxWidth: 260 }
      );
    }
  });

  // Loading indicator
  var statusBar = document.getElementById(SLUG + '-status');
  aquiferLayer.on('loading', function () {
    if (statusBar) { statusBar.textContent = 'Loading...'; statusBar.style.display = 'block'; }
  });
  aquiferLayer.on('load', function () {
    if (statusBar) { statusBar.style.display = 'none'; }
  });

  aquiferLayer.addTo(map);

  // ── Build controls ────────────────────────────────────────────────────────────
  var controlsEl = document.getElementById(SLUG + '-controls');

  var html = '<div class="' + SLUG + '-filter-row">';
  html += '<span class="' + SLUG + '-filter-title">Rock type:</span>';
  html += '<div class="' + SLUG + '-checkboxes">';
  ROCK_TYPES.forEach(function (r) {
    html +=
      '<label class="' + SLUG + '-cb-label">' +
        '<input type="checkbox" data-key="' + r.key + '"' + (activeSet[r.key] ? ' checked' : '') + '>' +
        '<span class="' + SLUG + '-swatch" style="background:' + r.color + '"></span>' +
        r.label +
      '</label>';
  });
  html += '</div></div>';

  html += '<div class="' + SLUG + '-btn-row">';
  html += '<button id="' + SLUG + '-near-me" class="' + SLUG + '-btn">Near Me</button>';
  html += '</div>';

  controlsEl.innerHTML = html;

  // Checkbox change
  controlsEl.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      activeSet[this.dataset.key] = this.checked;
      aquiferLayer.setWhere(buildWhere());
      updateShareUrl();
    });
  });

  // Near Me
  document.getElementById(SLUG + '-near-me').addEventListener('click', function () {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) { map.setView([pos.coords.latitude, pos.coords.longitude], 9); },
      function ()    { alert('Unable to determine your location.'); }
    );
  });

  // Share URL on map move
  map.on('moveend', updateShareUrl);

}());
