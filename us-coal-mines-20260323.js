(function () {
  'use strict';

  var SLUG = 'us-coal-mines';
  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Surface_and_Underground_Coal_Mines_in_the_US/FeatureServer/0';

  var REGIONS = {
    appalachian: ['Alabama', 'Kentucky', 'Maryland', 'Ohio', 'Pennsylvania', 'Tennessee', 'Virginia', 'West Virginia'],
    interior: ['Arkansas', 'Illinois', 'Indiana', 'Kansas', 'Louisiana', 'Mississippi', 'Missouri', 'Oklahoma', 'Texas'],
    western: ['Alaska', 'Arizona', 'Colorado', 'Montana', 'New Mexico', 'North Dakota', 'Utah', 'Washington', 'Wyoming']
  };

  var COLORS = {
    Surface: '#FF8C00',
    Underground: '#0077BB'
  };

  var currentType = 'all';
  var currentRegion = 'all';

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

  function buildWhere() {
    var parts = [];
    if (currentType !== 'all') {
      parts.push("MINE_TYPE = '" + currentType + "'");
    }
    if (currentRegion !== 'all') {
      var states = REGIONS[currentRegion].map(function (s) { return "'" + s + "'"; }).join(',');
      parts.push('state IN (' + states + ')');
    }
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  function getRadius(prod) {
    if (!prod || prod <= 0) return 5;
    return Math.min(14, Math.max(4, Math.round(Math.log10(prod) * 2.2)));
  }

  function formatNum(n) {
    if (!n) return '0';
    return n.toLocaleString();
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

  var mineLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    pointToLayer: function (feature, latlng) {
      var type = feature.properties.MINE_TYPE || 'Surface';
      var prod = feature.properties.PRODUCTION || 0;
      return L.circleMarker(latlng, {
        radius: getRadius(prod),
        fillColor: COLORS[type] || '#888',
        color: '#333',
        weight: 0.5,
        opacity: 0.8,
        fillOpacity: 0.75
      });
    },
    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      var type = p.MINE_TYPE || 'Unknown';
      var typeCls = type.toLowerCase();
      layer.bindPopup(
        '<div class="' + SLUG + '-popup">' +
          '<strong>' + (p.MINE_NAME || 'Unknown Mine') + '</strong>' +
          '<span class="' + SLUG + '-popup-type ' + SLUG + '-type-' + typeCls + '">' + type + '</span>' +
          (p.state ? '<div class="' + SLUG + '-popup-state">' + p.state + '</div>' : '') +
          '<div>Production: <strong>' + formatNum(p.PRODUCTION) + '</strong> short tons</div>' +
          (p.PERIOD ? '<div class="' + SLUG + '-popup-period">Reporting period: ' + p.PERIOD + '</div>' : '') +
        '</div>',
        { maxWidth: 250 }
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
        el.textContent = count.toLocaleString() + ' mine' + (count !== 1 ? 's' : '') + ' shown';
      });
  }

  function applyFilter() {
    mineLayer.setWhere(buildWhere());
    updateCount();
  }

  function setupControls() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;
    container.querySelectorAll('[data-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-type]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentType = btn.getAttribute('data-type');
        applyFilter();
      });
    });
    container.querySelectorAll('[data-region]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-region]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentRegion = btn.getAttribute('data-region');
        applyFilter();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setupControls();
      updateCount();
    });
  } else {
    setupControls();
    updateCount();
  }

})();
