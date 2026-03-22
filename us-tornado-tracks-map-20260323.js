(function () {
  'use strict';

  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Tornado_Tracks_1950_2017_1/FeatureServer/0';
  var MIN_YEAR = 1950;
  var MAX_YEAR = 2024;
  var DEFAULT_YEAR = 2024;

  // EF/F scale colors (mag field: -9=unknown, 0-5=scale)
  var MAG_STYLES = {
    '-9': { color: '#666666', weight: 1.5 },
     '0': { color: '#aaaaaa', weight: 1.5 },
     '1': { color: '#66cc66', weight: 2 },
     '2': { color: '#cc9900', weight: 2.5 },
     '3': { color: '#ff8800', weight: 3 },
     '4': { color: '#ff3300', weight: 3.5 },
     '5': { color: '#cc0000', weight: 4 }
  };

  var LEGEND_ROWS = [
    { color: '#aaaaaa', label: 'EF0 / F0' },
    { color: '#66cc66', label: 'EF1 / F1' },
    { color: '#cc9900', label: 'EF2 / F2' },
    { color: '#ff8800', label: 'EF3 / F3' },
    { color: '#ff3300', label: 'EF4 / F4' },
    { color: '#cc0000', label: 'EF5 / F5' }
  ];

  function getMagStyle(mag) {
    var key = (mag === null || mag === undefined || mag === '') ? '-9' : String(mag);
    return MAG_STYLES[key] || MAG_STYLES['-9'];
  }

  function getMagLabel(mag) {
    var n = parseInt(mag, 10);
    if (isNaN(n) || n < 0) return 'Unknown';
    return 'EF' + n + ' / F' + n;
  }

  var REGIONS = [
    { label: 'Tornado Alley',   bounds: [[33, -103], [43, -90]] },
    { label: 'US Overview',     bounds: [[24, -125], [50, -66]] },
    { label: 'Texas',           bounds: [[25.8, -106.6], [36.5, -93.5]] },
    { label: 'Oklahoma',        bounds: [[33.6, -103.0], [37.0, -94.4]] },
    { label: 'Kansas',          bounds: [[36.9, -102.1], [40.0, -94.6]] },
    { label: 'Nebraska',        bounds: [[39.9, -104.1], [43.0, -95.3]] },
    { label: 'Iowa',            bounds: [[40.4, -96.6], [43.5, -90.1]] },
    { label: 'Missouri',        bounds: [[35.9, -95.8], [40.6, -89.1]] },
    { label: 'Arkansas',        bounds: [[33.0, -94.6], [36.5, -89.6]] },
    { label: 'Mississippi',     bounds: [[30.2, -91.7], [35.0, -88.1]] },
    { label: 'Alabama',         bounds: [[30.2, -88.5], [35.0, -84.9]] },
    { label: 'Tennessee',       bounds: [[34.9, -90.3], [36.7, -81.6]] },
    { label: 'Illinois',        bounds: [[36.9, -91.5], [42.5, -87.5]] },
    { label: 'Indiana',         bounds: [[37.8, -88.1], [41.8, -84.8]] },
    { label: 'Ohio',            bounds: [[38.4, -84.8], [42.0, -80.5]] },
    { label: 'Southeast',       bounds: [[24.0, -92.0], [37.0, -75.0]] },
    { label: 'Midwest',         bounds: [[36.0, -104.0], [49.0, -80.0]] }
  ];

  // --- URL hash state ---
  function readHashState() {
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

  function writeHashState(year, map) {
    var center = map.getCenter();
    var state = {
      year: year,
      lat: center.lat.toFixed(4),
      lng: center.lng.toFixed(4),
      z: map.getZoom()
    };
    var hash = '#' + Object.keys(state)
      .map(function (k) { return k + '=' + encodeURIComponent(state[k]); })
      .join('&');
    history.replaceState(null, '', hash);
  }

  // --- DOM ---
  var controlsEl = document.getElementById('tt-controls');
  if (!controlsEl) return;

  var yearHtml = '<div class="tt-control-group"><label for="tt-year-select">Year</label><select id="tt-year-select">';
  for (var y = MAX_YEAR; y >= MIN_YEAR; y--) {
    yearHtml += '<option value="' + y + '">' + y + '</option>';
  }
  yearHtml += '</select></div>';

  var regionHtml = '<div class="tt-control-group"><label for="tt-state-select">Zoom to</label><select id="tt-state-select">';
  REGIONS.forEach(function (r) {
    regionHtml += '<option value="' + r.label + '">' + r.label + '</option>';
  });
  regionHtml += '</select></div>';

  controlsEl.innerHTML = yearHtml + regionHtml +
    '<div id="tt-track-info"><span id="tt-track-count">-</span> tornadoes loaded</div>';

  var legendEl = document.getElementById('tt-legend');
  if (legendEl) {
    legendEl.innerHTML = '<h4>EF / F Scale</h4>' +
      LEGEND_ROWS.map(function (row) {
        return '<div class="tt-legend-item"><div class="tt-legend-line" style="background:' +
          row.color + '"></div>' + row.label + '</div>';
      }).join('');
  }

  // --- MAP ---
  var hashState = readHashState();
  var initYear = hashState && hashState.year ? parseInt(hashState.year, 10) : DEFAULT_YEAR;
  initYear = Math.max(MIN_YEAR, Math.min(MAX_YEAR, initYear));

  var initCenter = [37, -97];
  var initZoom = 5;
  if (hashState && hashState.lat && hashState.lng) {
    initCenter = [parseFloat(hashState.lat), parseFloat(hashState.lng)];
    initZoom = hashState.z ? parseInt(hashState.z, 10) : 5;
  }

  var yearSel = document.getElementById('tt-year-select');
  yearSel.value = String(initYear);

  var map = L.map('tt-map', { center: initCenter, zoom: initZoom });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var loadingEl = document.getElementById('tt-loading');
  var trackCountEl = document.getElementById('tt-track-count');
  var trackLayer = null;
  var currentYear = initYear;
  var loadedCount = 0;

  function showLoading() { if (loadingEl) loadingEl.style.display = 'flex'; }
  function hideLoading() { if (loadingEl) loadingEl.style.display = 'none'; }

  function styleFeature(feature) {
    var mag = feature.properties ? feature.properties.mag : null;
    var s = getMagStyle(mag);
    return { color: s.color, weight: s.weight, opacity: 0.85 };
  }

  function buildPopup(props) {
    var mag   = props.mag;
    var date  = props.date || (props.mo + '/' + props.dy + '/' + props.yr);
    var st    = props.st || '-';
    var len   = props.len;
    var wid   = props.wid;
    var fat   = props.fat;
    var inj   = props.inj;

    var html = '<div style="font-size:0.85rem;line-height:1.7;">';
    html += '<strong>' + getMagLabel(mag) + ' Tornado</strong><br>';
    html += 'Date: ' + date + '<br>';
    html += 'State: ' + st + '<br>';
    if (len && len > 0) html += 'Path Length: ' + len.toFixed(1) + ' mi<br>';
    if (wid && wid > 0) html += 'Path Width: ' + wid + ' yd<br>';
    if (fat > 0) html += 'Fatalities: ' + fat + '<br>';
    if (inj > 0) html += 'Injuries: ' + inj + '<br>';
    html += '</div>';
    return html;
  }

  function loadYear(year) {
    showLoading();
    currentYear = year;
    loadedCount = 0;
    if (trackCountEl) trackCountEl.textContent = '-';

    if (trackLayer) {
      map.removeLayer(trackLayer);
      trackLayer = null;
    }

    trackLayer = L.esri.featureLayer({
      url: SERVICE_URL,
      where: 'yr = ' + year,
      fields: ['OBJECTID', 'yr', 'mo', 'dy', 'date', 'st', 'mag', 'wid', 'len', 'fat', 'inj'],
      style: styleFeature,
      onEachFeature: function (feature, layer) {
        loadedCount++;
        if (trackCountEl) trackCountEl.textContent = loadedCount;
        layer.on('click', function (e) {
          L.popup()
            .setLatLng(e.latlng)
            .setContent(buildPopup(feature.properties))
            .openOn(map);
        });
      }
    });

    trackLayer.on('load', function () {
      hideLoading();
      if (trackCountEl) trackCountEl.textContent = loadedCount > 0 ? loadedCount : '-';
      writeHashState(currentYear, map);
    });

    trackLayer.on('requesterror', function (e) {
      hideLoading();
      console.error('Tornado layer error', e);
    });

    trackLayer.addTo(map);
  }

  // --- EVENTS ---
  yearSel.addEventListener('change', function () {
    loadYear(parseInt(this.value, 10));
  });

  document.getElementById('tt-state-select').addEventListener('change', function () {
    var label = this.value;
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].label === label) {
        map.fitBounds(REGIONS[i].bounds);
        break;
      }
    }
  });

  map.on('moveend', function () {
    writeHashState(currentYear, map);
  });

  // --- INITIAL LOAD ---
  loadYear(initYear);

})();
