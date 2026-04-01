(function () {
  'use strict';

  var SLUG    = 'us-federal-lands';
  var SVC_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Federal_Lands/FeatureServer/0';

  var AGENCIES = [
    { key: 'Bureau of Land Management', label: 'Bureau of Land Management', abbr: 'BLM',  color: '#C8830A' },
    { key: 'National Park Service',      label: 'National Park Service',     abbr: 'NPS',  color: '#2E7D32' },
    { key: 'Forest Service',             label: 'U.S. Forest Service',       abbr: 'USFS', color: '#6B9E1F' },
    { key: 'Fish and Wildlife Service',  label: 'Fish & Wildlife Service',   abbr: 'FWS',  color: '#0E7AA8' },
    { key: 'Department of Defense',      label: 'Dept. of Defense',          abbr: 'DoD',  color: '#6B6B6B' },
    { key: 'Bureau of Reclamation',      label: 'Bureau of Reclamation',     abbr: 'BOR',  color: '#9B3BCC' }
  ];

  var agencyLookup = {};
  AGENCIES.forEach(function (a) { agencyLookup[a.key] = a; });

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
    var activeKeys = AGENCIES
      .filter(function (a) { return activeSet[a.key]; })
      .map(function (a) { return a.key; });
    var hash = 'lat=' + c.lat.toFixed(4) +
               '&lng=' + c.lng.toFixed(4) +
               '&z='   + map.getZoom() +
               '&ag='  + encodeURIComponent(activeKeys.join('|'));
    history.replaceState(null, '', '#' + hash);
  }

  var urlState = loadStateFromUrl();
  var initLat  = urlState.lat ? +urlState.lat : 38.5;
  var initLng  = urlState.lng ? +urlState.lng : -96.5;
  var initZ    = urlState.z   ? +urlState.z   : 4;

  var activeSet = {};
  AGENCIES.forEach(function (a) { activeSet[a.key] = true; });
  if (urlState.ag) {
    AGENCIES.forEach(function (a) { activeSet[a.key] = false; });
    urlState.ag.split('|').forEach(function (k) {
      if (agencyLookup[k]) activeSet[k] = true;
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
  // Shape__Area is in sq metres (Web Mercator). At mid-US latitudes the
  // projection overstates area by ~1.6x, so we apply a rough correction.
  function formatAcres(sqMetresWebMercator) {
    if (!sqMetresWebMercator || sqMetresWebMercator <= 0) return null;
    // Web Mercator overstates area ~1.61x at mid-US latitudes; divide out
    var acres = sqMetresWebMercator / 6515;
    if (acres < 1)        return '< 1 acre';
    if (acres < 1000)     return '~' + Math.round(acres) + ' acres';
    if (acres < 100000)   return '~' + (Math.round(acres / 100) * 100).toLocaleString() + ' acres';
    if (acres < 1000000)  return '~' + (Math.round(acres / 1000) * 1000).toLocaleString() + ' acres';
    return '~' + (acres / 1000000).toFixed(1) + ' million acres';
  }

  // ── WHERE clause helper ───────────────────────────────────────────────────────
  function buildWhere() {
    var active = AGENCIES.filter(function (a) { return activeSet[a.key]; });
    if (active.length === 0)             return '1=0';
    if (active.length === AGENCIES.length) return '1=1';
    return active.map(function (a) {
      return "Agency='" + a.key + "'";
    }).join(' OR ');
  }

  // ── Feature layer ─────────────────────────────────────────────────────────────
  var federalLayer = L.esri.featureLayer({
    url:   SVC_URL,
    where: buildWhere(),
    style: function (feature) {
      var cfg = agencyLookup[feature.properties.Agency];
      return cfg
        ? { color: cfg.color, weight: 0.8, fillColor: cfg.color, fillOpacity: 0.5 }
        : { color: '#999',    weight: 0.5, fillOpacity: 0.35 };
    },
    onEachFeature: function (feature, layer) {
      var p    = feature.properties;
      var name = p.unit_name || 'Federal Land Unit';
      var cfg  = agencyLookup[p.Agency] || {};
      var area = formatAcres(p.Shape__Area);

      var areaHtml = area
        ? '<div class="' + SLUG + '-popup-row">' +
            '<span class="' + SLUG + '-popup-label">Area</span>' +
            '<span class="' + SLUG + '-popup-value">' + area + ' (approx.)</span>' +
          '</div>'
        : '';

      var linkHtml = (p.link && p.link.indexOf('http') === 0)
        ? '<a class="' + SLUG + '-popup-link" href="' + p.link + '" target="_blank" rel="noopener noreferrer">Official site &rarr;</a>'
        : '';

      layer.bindPopup(
        '<div class="' + SLUG + '-popup">' +
          '<strong class="' + SLUG + '-popup-name">' + name + '</strong>' +
          '<span class="' + SLUG + '-popup-badge" style="background:' + (cfg.color || '#777') + '">' +
            (cfg.abbr || p.Agency || 'Federal') +
          '</span>' +
          areaHtml +
          (linkHtml ? '<div class="' + SLUG + '-popup-footer">' + linkHtml + '</div>' : '') +
        '</div>',
        { maxWidth: 260 }
      );
    }
  });

  // Loading indicator
  var statusBar = document.getElementById(SLUG + '-status');
  federalLayer.on('loading', function () {
    if (statusBar) { statusBar.textContent = 'Loading...'; statusBar.style.display = 'block'; }
  });
  federalLayer.on('load', function () {
    if (statusBar) { statusBar.style.display = 'none'; }
  });

  federalLayer.addTo(map);

  // ── Build controls ────────────────────────────────────────────────────────────
  var controlsEl = document.getElementById(SLUG + '-controls');

  var html = '<div class="' + SLUG + '-filter-row">';
  html += '<span class="' + SLUG + '-filter-title">Show agencies:</span>';
  html += '<div class="' + SLUG + '-checkboxes">';
  AGENCIES.forEach(function (a) {
    html +=
      '<label class="' + SLUG + '-cb-label">' +
        '<input type="checkbox" data-key="' + a.key + '"' + (activeSet[a.key] ? ' checked' : '') + '>' +
        '<span class="' + SLUG + '-swatch" style="background:' + a.color + '"></span>' +
        a.label +
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
      federalLayer.setWhere(buildWhere());
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
