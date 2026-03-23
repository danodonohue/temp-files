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
      .layers('visible:' + IDENTIFY_LAYERS[currentType].join(','))
      .tolerance(6)
      .run(function (err, featureCollection) {
        setStatus('');
        if (err || !featureCollection || !featureCollection.features || !featureCollection.features.length) {
          return;
        }
        var f = featureCollection.features[0].properties;
        var rows = [];
        if (f.SURVEY_ID)  rows.push(['Survey ID',   f.SURVEY_ID]);
        if (f.SURVEY_TYPE) rows.push(['Type',        f.SURVEY_TYPE]);
        if (f.PLATFORM)   rows.push(['Vessel',       f.PLATFORM]);
        if (f.INST_SRC)   rows.push(['Institution',  f.INST_SRC]);
        if (f.COUNTRY)    rows.push(['Country',      f.COUNTRY]);
        if (f.SURVEY_YEAR || f.START_YR) {
          var yr = f.SURVEY_YEAR || (f.START_YR + (f.END_YR && f.END_YR !== f.START_YR ? '-' + f.END_YR : ''));
          rows.push(['Year', yr]);
        }
        if (f.PROJECT)    rows.push(['Project',      f.PROJECT]);

        var tableHtml = rows.map(function (r) {
          return '<tr><td>' + escHtml(r[0]) + '</td><td>' + escHtml(r[1]) + '</td></tr>';
        }).join('');

        var downloadHtml = f.DOWNLOAD_URL
          ? '<div class="' + SLUG + '-popup-dl"><a href="' + encodeURI(f.DOWNLOAD_URL) + '" target="_blank" rel="noopener">Request survey data</a></div>'
          : '';

        popup
          .setLatLng(e.latlng)
          .setContent(
            '<div class="' + SLUG + '-popup">' +
              '<strong>' + escHtml(f.SURVEY_ID || 'Marine Survey') + '</strong>' +
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
