(function () {
  'use strict';

  var SLUG = 'marine-tracklines';
  var MAP_URL = 'https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/trackline_combined_dynamic/MapServer';

  var WMS_URL = 'https://gis.ngdc.noaa.gov/arcgis/services/web_mercator/trackline_combined_dynamic/MapServer/WMSServer';

  var LAYER_SETS = {
    bathymetry:   '1',
    gravity:      '2',
    magnetics:    '3',
    seismics:     '4,5,8,9',
    sonar:        '7',
    aeromagnetic: '10'
  };

  // MapServer layer IDs for identify (must be integers)
  var IDENTIFY_LAYERS = {
    bathymetry:   [1],
    gravity:      [2],
    magnetics:    [3],
    seismics:     [4, 5, 8, 9],
    sonar:        [7],
    aeromagnetic: [10]
  };

  var currentType = 'bathymetry';
  var popup = L.popup({ maxWidth: 320 });

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

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  var savedState = loadHashState();
  var map = L.map(SLUG + '-map', {
    center: savedState ? [savedState.lat, savedState.lng] : [20, 0],
    zoom: savedState ? savedState.z : 2,
    minZoom: 2
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18
  }).addTo(map);

  map.on('moveend', function () { updateHash(map); });

  var trackLayer = L.tileLayer.wms(WMS_URL, {
    layers: LAYER_SETS['bathymetry'],
    format: 'image/png',
    transparent: true,
    opacity: 0.85,
    attribution: 'NOAA / NGDC',
    tileSize: 256
  }).addTo(map);

  function setStatus(msg) {
    var el = document.getElementById(SLUG + '-status');
    if (el) el.textContent = msg;
  }

  map.on('click', function (e) {
    setStatus('Querying...');
    L.esri.identifyFeatures({ url: MAP_URL })
      .on(map)
      .at(e.latlng)
      .layers('all:' + IDENTIFY_LAYERS[currentType].join(','))
      .tolerance(6)
      .run(function (err, featureCollection) {
        setStatus('');
        if (err || !featureCollection || !featureCollection.features || !featureCollection.features.length) {
          return;
        }
        var f = featureCollection.features[0].properties;
        var rows = [];
        if (f['Survey Type'])        rows.push(['Type',        f['Survey Type']]);
        if (f['Platform Name'])      rows.push(['Vessel',      f['Platform Name']]);
        if (f['Source Institution']) rows.push(['Institution', f['Source Institution']]);
        if (f['Country'])            rows.push(['Country',     f['Country']]);
        if (f['Chief Scientist'])    rows.push(['Chief Sci.',  f['Chief Scientist']]);
        if (f['Survey Year'] || f['Survey Start Year']) {
          var startYr = f['Survey Start Year'] || f['Survey Year'];
          var endYr   = f['Survey End Year'];
          var yr = endYr && endYr !== startYr ? startYr + '\u2013' + endYr : startYr;
          rows.push(['Year', yr]);
        }
        if (f['Project']) rows.push(['Project', f['Project']]);

        var tableHtml = rows.map(function (r) {
          return '<tr><td>' + escHtml(r[0]) + '</td><td>' + escHtml(r[1]) + '</td></tr>';
        }).join('');

        var dlUrl = f['Download URL'];
        var downloadHtml = dlUrl
          ? '<div class="' + SLUG + '-popup-dl"><a href="' + encodeURI(dlUrl) + '" target="_blank" rel="noopener">Request survey data</a></div>'
          : '';

        popup
          .setLatLng(e.latlng)
          .setContent(
            '<div class="' + SLUG + '-popup">' +
              '<strong>' + escHtml(f['Survey ID'] || 'Marine Survey') + '</strong>' +
              '<table>' + tableHtml + '</table>' +
              downloadHtml +
            '</div>'
          )
          .openOn(map);
      });
  });

  function applyType(type) {
    currentType = type;
    trackLayer.setParams({ layers: LAYER_SETS[type] });
  }

  function setupControls() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;
    container.querySelectorAll('[data-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-type]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyType(btn.getAttribute('data-type'));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupControls);
  } else {
    setupControls();
  }

})();
