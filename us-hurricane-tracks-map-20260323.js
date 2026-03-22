(function () {
  'use strict';

  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/IBTrACS_ALL_list_v04r00_lines_1/FeatureServer/0';
  var MIN_YEAR = 1851;
  var MAX_YEAR = 2024;
  var DEFAULT_YEAR = 2024;

  var SSHS_COLORS = {
    '-5': '#888888',
    '-4': '#888888',
    '-3': '#888888',
    '-2': '#888888',
    '-1': '#aaaaaa',
     '0': '#4499ff',
     '1': '#44bb44',
     '2': '#ffdd00',
     '3': '#ff8800',
     '4': '#ff4400',
     '5': '#cc0000'
  };

  function getSshsColor(val) {
    var key = (val === null || val === undefined || val === '') ? 'none' : String(val);
    return SSHS_COLORS[key] || '#666666';
  }

  function getSshsLabel(val) {
    var n = (val === null || val === undefined || val === '') ? NaN : parseInt(val, 10);
    if (isNaN(n) || n < -1) return 'Disturbance / Other';
    if (n === -1) return 'Tropical Depression';
    if (n === 0) return 'Tropical Storm';
    return 'Category ' + n + ' Hurricane';
  }

  var REGIONS = [
    { label: 'US Overview',    bounds: [[20, -100], [50, -60]] },
    { label: 'Florida',        bounds: [[24.4, -87.6], [31.0, -80.0]] },
    { label: 'Texas',          bounds: [[25.8, -97.0], [36.5, -93.5]] },
    { label: 'Louisiana',      bounds: [[28.9, -94.0], [33.0, -88.8]] },
    { label: 'Gulf Coast',     bounds: [[24.0, -97.5], [35.0, -80.0]] },
    { label: 'MS / AL',        bounds: [[30.2, -89.5], [35.0, -86.0]] },
    { label: 'Georgia',        bounds: [[30.4, -85.6], [35.0, -80.8]] },
    { label: 'South Carolina', bounds: [[32.0, -83.4], [35.2, -78.5]] },
    { label: 'North Carolina', bounds: [[33.8, -84.3], [36.6, -75.5]] },
    { label: 'Virginia',       bounds: [[36.5, -83.7], [39.5, -75.2]] },
    { label: 'NJ / DE',        bounds: [[38.9, -75.6], [41.4, -73.9]] },
    { label: 'New York',       bounds: [[40.5, -74.3], [45.0, -71.8]] },
    { label: 'New England',    bounds: [[41.0, -73.7], [47.5, -66.9]] },
    { label: 'Puerto Rico',    bounds: [[17.9, -67.4], [18.5, -65.6]] }
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
  var controlsEl = document.getElementById('ht-controls');
  if (!controlsEl) return;

  var yearHtml = '<div class="ht-control-group"><label for="ht-year-select">Year</label><select id="ht-year-select">';
  for (var y = MAX_YEAR; y >= MIN_YEAR; y--) {
    yearHtml += '<option value="' + y + '">' + y + '</option>';
  }
  yearHtml += '</select></div>';

  var regionHtml = '<div class="ht-control-group"><label for="ht-state-select">Zoom to</label><select id="ht-state-select">';
  REGIONS.forEach(function (r) {
    regionHtml += '<option value="' + r.label + '">' + r.label + '</option>';
  });
  regionHtml += '</select></div>';

  controlsEl.innerHTML = yearHtml + regionHtml +
    '<div id="ht-track-info"><span id="ht-track-count">-</span> tracks</div>';

  // Build legend
  var legendEl = document.getElementById('ht-legend');
  if (legendEl) {
    var legendRows = [
      ['#aaaaaa', 'Tropical Depression'],
      ['#4499ff', 'Tropical Storm'],
      ['#44bb44', 'Category 1'],
      ['#ffdd00', 'Category 2'],
      ['#ff8800', 'Category 3'],
      ['#ff4400', 'Category 4'],
      ['#cc0000', 'Category 5']
    ];
    legendEl.innerHTML = '<h4>Saffir-Simpson Scale</h4>' +
      legendRows.map(function (row) {
        return '<div class="ht-legend-item"><div class="ht-legend-line" style="background:' +
          row[0] + '"></div>' + row[1] + '</div>';
      }).join('');
  }

  // --- MAP INIT ---
  var hashState = readHashState();
  var initYear = hashState && hashState.year ? parseInt(hashState.year, 10) : DEFAULT_YEAR;
  initYear = Math.max(MIN_YEAR, Math.min(MAX_YEAR, initYear));

  var initCenter = [32, -82];
  var initZoom = 5;
  if (hashState && hashState.lat && hashState.lng) {
    initCenter = [parseFloat(hashState.lat), parseFloat(hashState.lng)];
    initZoom = hashState.z ? parseInt(hashState.z, 10) : 5;
  }

  var yearSel = document.getElementById('ht-year-select');
  yearSel.value = String(initYear);

  var map = L.map('ht-map', { center: initCenter, zoom: initZoom });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var loadingEl = document.getElementById('ht-loading');
  var trackCountEl = document.getElementById('ht-track-count');
  var trackLayer = null;
  var currentYear = initYear;

  function showLoading() { if (loadingEl) loadingEl.style.display = 'flex'; }
  function hideLoading() { if (loadingEl) loadingEl.style.display = 'none'; }

  function styleFeature(feature) {
    var sshs = feature.properties ? feature.properties.USA_SSHS : null;
    return { color: getSshsColor(sshs), weight: 2.5, opacity: 0.85 };
  }

  function buildPopup(props) {
    var name = props.NAME || 'Unnamed';
    var season = props.SEASON || '-';
    var wind = props.USA_WIND;
    var pres = props.USA_PRES;
    var status = props.USA_STATUS || '-';
    return '<div style="font-size:0.85rem;line-height:1.7;">' +
      '<strong>' + name + ' (' + season + ')</strong><br>' +
      getSshsLabel(props.USA_SSHS) + '<br>' +
      (wind && wind > 0 ? 'Max Wind: ' + wind + ' kt<br>' : '') +
      (pres && pres > 0 ? 'Min Pressure: ' + pres + ' mb<br>' : '') +
      'Status: ' + status +
      '</div>';
  }

  function loadYear(year) {
    showLoading();
    currentYear = year;

    if (trackLayer) {
      map.removeLayer(trackLayer);
      trackLayer = null;
    }

    var seenSids = {};
    var count = 0;

    trackLayer = L.esri.featureLayer({
      url: SERVICE_URL,
      where: "SEASON = " + year + " AND BASIN = 'NA'",
      fields: ['OBJECTID', 'SID', 'SEASON', 'NAME', 'BASIN', 'USA_STATUS', 'USA_SSHS', 'USA_WIND', 'USA_PRES', 'ISO_TIME'],
      fetchAllFeatures: true,
      style: styleFeature,
      onEachFeature: function (feature, layer) {
        var sid = feature.properties.SID;
        if (sid && !seenSids[sid]) { seenSids[sid] = true; count++; }
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
      if (trackCountEl) trackCountEl.textContent = count > 0 ? count : '-';
      writeHashState(currentYear, map);
    });

    trackLayer.on('requesterror', function (e) {
      hideLoading();
      console.error('IBTrACS request error', e);
    });

    trackLayer.addTo(map);
  }

  // --- EVENTS ---
  yearSel.addEventListener('change', function () {
    loadYear(parseInt(this.value, 10));
  });

  document.getElementById('ht-state-select').addEventListener('change', function () {
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
