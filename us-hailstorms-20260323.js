(function () {
  'use strict';

  var SLUG = 'us-hailstorms';
  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Hailstorms_in_the_US_View/FeatureServer/0';

  var MAG_TIERS = [
    { min: 4.00, color: '#7b0d1e', radius: 8, label: '4"+ (Softball+)' },
    { min: 2.75, color: '#c32f27', radius: 6, label: '2.75-3.99" (Baseball)' },
    { min: 1.75, color: '#f25c54', radius: 5, label: '1.75-2.74" (Golf Ball)' },
    { min: 1.00, color: '#ffa62b', radius: 4, label: '1.00-1.74" (Quarter)' },
    { min: 0,    color: '#ffe66d', radius: 3, label: 'Under 1" (Pea)' }
  ];

  var ERA_WHERE = {
    'pre2000': 'yr < 2000',
    '2000s':   'yr >= 2000 AND yr <= 2009',
    '2010s':   'yr >= 2010 AND yr <= 2019',
    '2020s':   'yr >= 2020'
  };

  var currentMag = '2';
  var currentEra = 'all';

  function getTier(mag) {
    for (var i = 0; i < MAG_TIERS.length; i++) {
      if (mag >= MAG_TIERS[i].min) return MAG_TIERS[i];
    }
    return MAG_TIERS[MAG_TIERS.length - 1];
  }

  function buildWhere() {
    var parts = [];
    if (currentMag !== 'all') parts.push('mag >= ' + currentMag);
    if (currentEra !== 'all' && ERA_WHERE[currentEra]) parts.push(ERA_WHERE[currentEra]);
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  function formatLoss(val) {
    if (!val || val === 0) return null;
    if (val >= 1000) return '$' + (val / 1000).toFixed(1) + 'B';
    if (val >= 1) return '$' + val.toFixed(1) + 'M';
    return '$' + Math.round(val * 1000) + 'K';
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
    center: savedState ? [savedState.lat, savedState.lng] : [38.5, -96.0],
    zoom: savedState ? savedState.z : 4
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18
  }).addTo(map);

  map.on('moveend', function () { updateHash(map); });

  var hailLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: buildWhere(),
    pointToLayer: function (feature, latlng) {
      var tier = getTier(feature.properties.mag || 0);
      return L.circleMarker(latlng, {
        radius: tier.radius,
        fillColor: tier.color,
        color: 'rgba(0,0,0,0.4)',
        weight: 0.5,
        opacity: 0.8,
        fillOpacity: 0.65
      });
    },
    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      var tier = getTier(p.mag || 0);
      var rows = [];
      if (p.date) rows.push('<tr><td>Date</td><td>' + p.date + '</td></tr>');
      if (p.st)   rows.push('<tr><td>State</td><td>' + p.st + '</td></tr>');
      rows.push('<tr><td>Hail Size</td><td><strong>' + (p.mag || '?') + '"</strong></td></tr>');
      if (p.inj > 0) rows.push('<tr><td>Injuries</td><td>' + p.inj + '</td></tr>');
      if (p.fat > 0) rows.push('<tr><td>Fatalities</td><td>' + p.fat + '</td></tr>');
      var loss = formatLoss(p.loss);
      if (loss) rows.push('<tr><td>Property Loss</td><td>' + loss + '</td></tr>');
      var closs = formatLoss(p.closs);
      if (closs) rows.push('<tr><td>Crop Loss</td><td>' + closs + '</td></tr>');

      layer.bindPopup(
        '<div class="' + SLUG + '-popup">' +
          '<div class="' + SLUG + '-popup-badge" style="background:' + tier.color + '">Hail ' + (p.mag || '?') + '"</div>' +
          '<table>' + rows.join('') + '</table>' +
        '</div>',
        { maxWidth: 240 }
      );
    }
  }).addTo(map);

  function updateCount() {
    var el = document.getElementById(SLUG + '-count');
    if (!el) return;
    el.textContent = 'Loading...';
    L.esri.query({ url: SERVICE_URL })
      .where(buildWhere())
      .count(function (err, count) {
        if (err) { el.textContent = ''; return; }
        el.textContent = count.toLocaleString() + ' events';
      });
  }

  function applyFilter() {
    hailLayer.setWhere(buildWhere());
    updateCount();
  }

  function setupControls() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;

    container.querySelectorAll('[data-mag]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-mag]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentMag = btn.getAttribute('data-mag');
        applyFilter();
      });
    });

    container.querySelectorAll('[data-era]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-era]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentEra = btn.getAttribute('data-era');
        applyFilter();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setupControls(); updateCount(); });
  } else {
    setupControls();
    updateCount();
  }

})();
