(function () {
  'use strict';

  var SLUG = 'coral-bleaching';
  var SERVICE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Coral_Reef_Stations/FeatureServer/0';

  // Ordered highest-first for lookup
  var ALERT_TIERS = [
    { min: 4, label: 'Alert Level 2', color: '#7b0d1e', radius: 10 },
    { min: 3, label: 'Alert Level 1', color: '#c32f27', radius:  8 },
    { min: 2, label: 'Warning',       color: '#ff7800', radius:  7 },
    { min: 1, label: 'Watch',         color: '#ffd700', radius:  6 },
    { min: 0, label: 'No Stress',     color: '#4a90d9', radius:  5 }
  ];

  function alertStyle(level) {
    var n = parseInt(level, 10);
    if (isNaN(n)) n = 0;
    for (var i = 0; i < ALERT_TIERS.length; i++) {
      if (n >= ALERT_TIERS[i].min) return ALERT_TIERS[i];
    }
    return ALERT_TIERS[ALERT_TIERS.length - 1];
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtNum(v, decimals) {
    var n = parseFloat(v);
    return isNaN(n) ? '\u2014' : n.toFixed(decimals);
  }

  function fmtDate(d) {
    if (d == null) return '\u2014';
    var dt = (d instanceof Date) ? d : new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function loadHashState() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var p = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx >= 0) p[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return (p.lat && p.lng && p.z) ? { lat: +p.lat, lng: +p.lng, z: +p.z } : null;
  }

  function updateHash(map) {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  }

  var savedState = loadHashState();
  var map = L.map(SLUG + '-map', {
    center: savedState ? [savedState.lat, savedState.lng] : [10, 120],
    zoom:   savedState ? savedState.z : 3,
    minZoom: 2
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18
  }).addTo(map);

  map.on('moveend', function () { updateHash(map); });

  var popup = L.popup({ maxWidth: 300 });

  var stationLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: '1=1',
    pointToLayer: function (feature, latlng) {
      var style = alertStyle(feature.properties.alert);
      return L.circleMarker(latlng, {
        radius:      style.radius,
        fillColor:   style.color,
        color:       '#fff',
        weight:      1.5,
        opacity:     1,
        fillOpacity: 0.88
      });
    }
  }).addTo(map);

  stationLayer.on('click', function (e) {
    var p = e.layer.feature.properties;
    var style = alertStyle(p.alert);

    var rows = [];
    if (p.sst  != null) rows.push(['Sea Surface Temp',  fmtNum(p.sst,  1) + '\u00b0C']);
    if (p.ssta != null) {
      var anomaly = parseFloat(p.ssta);
      rows.push(['Temp Anomaly', ((!isNaN(anomaly) && anomaly >= 0) ? '+' : '') + fmtNum(p.ssta, 2) + '\u00b0C']);
    }
    if (p.hs  != null) rows.push(['Hotspots',         fmtNum(p.hs,  2) + '\u00b0C']);
    if (p.dhw != null) rows.push(['Deg. Heating Wks', fmtNum(p.dhw, 1) + ' DHW']);
    if (p.date != null) rows.push(['Last Updated',    fmtDate(p.date)]);

    var tableHtml = rows.map(function (r) {
      return '<tr><td>' + escHtml(r[0]) + '</td><td>' + escHtml(r[1]) + '</td></tr>';
    }).join('');

    var linkHtml = (p.gauge_page && /^https?:\/\//.test(p.gauge_page))
      ? '<div class="' + SLUG + '-popup-link"><a href="' + encodeURI(p.gauge_page) + '" target="_blank" rel="noopener">View NOAA gauge page</a></div>'
      : '';

    popup
      .setLatLng(e.layer.getLatLng())
      .setContent(
        '<div class="' + SLUG + '-popup">' +
          '<strong>' + escHtml(p.name || 'Station') + '</strong>' +
          '<span class="' + SLUG + '-badge" style="background:' + style.color + '">' + escHtml(style.label) + '</span>' +
          '<table>' + tableHtml + '</table>' +
          linkHtml +
        '</div>'
      )
      .openOn(map);
  });

  function applyFilter(minAlert) {
    stationLayer.setWhere(minAlert > 0 ? 'alert >= ' + minAlert : '1=1');
  }

  function setupControls() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;
    container.querySelectorAll('[data-min]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-min]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyFilter(parseInt(btn.getAttribute('data-min'), 10));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupControls);
  } else {
    setupControls();
  }

})();
