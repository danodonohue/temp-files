(function () {
  'use strict';

  var SLUG = 'us-oil-gas-wells';
  var FS_URL = 'https://services.arcgis.com/jDGuO8tYggdCCnUJ/ArcGIS/rest/services/O_G_Wells_in_the_US___3_1_2024_WFL1/FeatureServer/0';

  var STATE_BOUNDS = {
    'Texas':         [[25.8, -106.6], [36.5, -93.5]],
    'Kansas':        [[36.9, -102.1], [40.0, -94.6]],
    'Oklahoma':      [[33.6, -103.0], [37.0, -94.4]],
    'Ohio':          [[38.4, -84.8],  [42.3, -80.5]],
    'California':    [[32.5, -124.5], [42.0, -114.1]],
    'Louisiana':     [[28.9, -94.0],  [33.0, -88.8]],
    'Pennsylvania':  [[39.7, -80.5],  [42.3, -74.7]],
    'Illinois':      [[36.9, -91.5],  [42.5, -87.5]],
    'Kentucky':      [[36.5, -89.6],  [39.1, -81.9]],
    'Wyoming':       [[40.9, -111.1], [45.0, -104.0]],
    'New Mexico':    [[31.3, -109.0], [37.0, -103.0]],
    'Colorado':      [[36.9, -109.0], [41.0, -102.0]],
    'West Virginia': [[37.2, -82.6],  [40.6, -77.7]],
    'Michigan':      [[41.7, -90.4],  [48.2, -82.4]],
    'Indiana':       [[37.8, -88.1],  [41.8, -84.8]],
    'New York':      [[40.5, -79.8],  [45.0, -71.9]],
    'Montana':       [[44.4, -116.0], [49.0, -104.0]],
    'North Dakota':  [[45.9, -104.0], [49.0, -96.6]],
    'Utah':          [[36.9, -114.0], [42.0, -109.0]],
    'Arkansas':      [[33.0, -94.6],  [36.5, -89.6]],
    'Mississippi':   [[30.1, -91.7],  [35.0, -88.1]],
    'Nebraska':      [[40.0, -104.1], [43.0, -95.3]],
    'Alabama':       [[30.1, -88.5],  [35.0, -84.9]],
    'Tennessee':     [[34.9, -90.3],  [36.7, -81.6]],
    'Virginia':      [[36.5, -83.7],  [39.5, -75.2]],
    'Missouri':      [[35.9, -95.8],  [40.6, -89.1]],
    'Alaska':        [[51.0, -180.0], [71.5, -130.0]],
    'South Dakota':  [[42.5, -104.1], [45.9, -96.4]],
    'Florida':       [[24.4, -87.6],  [31.0, -80.0]],
    'Arizona':       [[31.3, -114.8], [37.0, -109.0]],
    'Washington':    [[45.5, -124.7], [49.0, -116.9]],
    'Nevada':        [[35.0, -120.0], [42.0, -114.0]],
    'Maryland':      [[37.9, -79.5],  [39.7, -75.0]],
    'Idaho':         [[41.9, -117.2], [49.0, -111.0]],
    'Oregon':        [[41.9, -124.6], [46.3, -116.5]],
    'Iowa':          [[40.4, -96.6],  [43.5, -90.1]],
    'Minnesota':     [[43.5, -97.2],  [49.4, -89.5]]
  };

  var TYPE_WHERES = {
    '':          '1=1',
    'oil':       "well_type IN ('Oil Well','Oil','O','OW','Oil & Gas','Oil / Gas Well','OG_R')",
    'gas':       "well_type IN ('Gas Well','Gas','G','GW','Gas Production')",
    'dry':       "well_type IN ('Dry Hole','DRY','D&A','Drilled and Abandoned','Plugged and Abandoned')",
    'injection': "well_type IN ('Injection / Disposal from Oil','SWD','SWDI','WD','WDI') OR well_type LIKE 'Inject%' OR well_type LIKE 'Disposal%'"
  };

  var STATUS_COLORS = {
    'Active':    '#27ae60',
    'Plugged':   '#7f8c8d',
    'Permitted': '#3498db',
    'Idle':      '#e67e22',
    'Injection': '#9b59b6',
    'Other':     '#bdc3c7'
  };

  function normalizeStatus(raw) {
    if (!raw) return 'Other';
    var s = String(raw).toLowerCase().trim();
    if (s === 'active' || s === 'active well' || s === 'ac' || s === 'oil' || s === 'gas' ||
        s.indexOf('produc') !== -1 || s === 'og_r' || s === 'ow' || s === 'gw' ||
        s === 'o' || s === 'g' || s === 'open' ||
        (s.indexOf('active') !== -1 && s.indexOf('plug') === -1)) {
      return 'Active';
    }
    if (s.indexOf('plug') !== -1 || s.indexOf('abandon') !== -1 || s === 'pa' ||
        s.indexOf('p&a') !== -1 || s === 'd&a' || s.indexOf('dry') !== -1) {
      return 'Plugged';
    }
    if (s.indexOf('permit') !== -1 || s === 'not drilled' || s.indexOf('location') !== -1) {
      return 'Permitted';
    }
    if (s === 'idle' || s.indexOf('shut') !== -1 || s.indexOf('inactive') !== -1) {
      return 'Idle';
    }
    if (s.indexOf('inject') !== -1 || s.indexOf('disposal') !== -1 ||
        s === 'wd' || s === 'wdi' || s === 'swdi') {
      return 'Injection';
    }
    return 'Other';
  }

  function parseHash() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return (out.lat && out.lng && out.z) ? out : null;
  }

  function buildPopup(p) {
    var status = normalizeStatus(p.well_status);
    var color  = STATUS_COLORS[status] || STATUS_COLORS['Other'];
    var html   = '<div class="ogw-popup">';
    html += '<strong>' + (p.well_name || 'Unknown Well') + '</strong>';
    if (p.api_number) html += '<span class="ogw-api">API: ' + p.api_number + '</span>';
    html += '<table class="ogw-popup-table">';
    if (p.operator)    html += '<tr><td>Operator</td><td>' + p.operator + '</td></tr>';
    if (p.well_type)   html += '<tr><td>Type</td><td>' + p.well_type + '</td></tr>';
    if (p.well_status) html += '<tr><td>Status</td><td><span class="ogw-status-badge" style="background:' + color + '">' + p.well_status + '</span></td></tr>';
    if (p.county)      html += '<tr><td>County</td><td>' + p.county + '</td></tr>';
    if (p.state)       html += '<tr><td>State</td><td>' + p.state + '</td></tr>';
    html += '</table></div>';
    return html;
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var container    = document.getElementById(SLUG + '-container');
  var dataState    = container ? (container.getAttribute('data-state') || '').trim() : '';
  var currentType  = '';
  var measureActive = false;
  var measureRadius = 25;
  var measureCircle = null;
  var measureLine   = null;
  var measureMarker = null;

  function buildWhere() {
    var parts = [];
    if (dataState) parts.push("state='" + dataState.replace(/'/g, "''") + "'");
    var tw = TYPE_WHERES[currentType];
    if (tw && tw !== '1=1') parts.push('(' + tw + ')');
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  // ── Map init ──────────────────────────────────────────────────────────────
  var hashState  = parseHash();
  var initCenter = [39.5, -98.0];
  var initZoom   = 4;
  if (hashState) {
    initCenter = [parseFloat(hashState.lat), parseFloat(hashState.lng)];
    initZoom   = parseInt(hashState.z, 10);
  }

  var map = L.map(SLUG + '-map', { center: initCenter, zoom: initZoom });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  if (dataState && STATE_BOUNDS[dataState] && !hashState) {
    map.fitBounds(STATE_BOUNDS[dataState]);
  }

  // ── Well cluster layer ────────────────────────────────────────────────────
  var wellLayer = L.esri.Cluster.featureLayer({
    url:    FS_URL,
    where:  buildWhere(),
    clusterOptions: { maxClusterRadius: 50, chunkedLoading: true },
    pointToLayer: function (geojson, latlng) {
      var status = normalizeStatus(geojson.properties.well_status);
      return L.circleMarker(latlng, {
        radius:      5,
        fillColor:   STATUS_COLORS[status] || STATUS_COLORS['Other'],
        color:       '#fff',
        weight:      0.5,
        opacity:     1,
        fillOpacity: 0.85
      });
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(buildPopup(feature.properties), { maxWidth: 300 });
    }
  });

  var loadingEl  = document.getElementById(SLUG + '-loading');
  var countEl    = document.getElementById(SLUG + '-count');
  var loadTextEl = document.getElementById(SLUG + '-loading-text');

  function showLoading(on) {
    if (loadingEl)  loadingEl.style.display  = on ? 'flex'   : 'none';
    if (loadTextEl) loadTextEl.style.display = on ? 'inline' : 'none';
  }

  wellLayer.on('loading', function () { showLoading(true); });
  wellLayer.on('load', function () {
    showLoading(false);
    if (countEl) {
      var n = 0;
      wellLayer.eachFeature(function () { n++; });
      countEl.textContent = n.toLocaleString() + ' wells in view';
    }
  });

  wellLayer.addTo(map);

  // ── Type filter ───────────────────────────────────────────────────────────
  var typeSelect = document.getElementById(SLUG + '-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      currentType = this.value;
      wellLayer.setWhere(buildWhere());
    });
  }

  // ── Address search ────────────────────────────────────────────────────────
  var searchInput = document.getElementById(SLUG + '-search');
  var searchBtn   = document.getElementById(SLUG + '-search-btn');

  function doSearch() {
    var q = searchInput ? searchInput.value.trim() : '';
    if (!q) return;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
          encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data[0]) map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 11);
      })
      .catch(function () {});
  }

  if (searchBtn)   searchBtn.addEventListener('click', doSearch);
  if (searchInput) {
    searchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') doSearch();
    });
  }

  // ── Geolocation ───────────────────────────────────────────────────────────
  var geoBtn = document.getElementById(SLUG + '-geo');
  if (geoBtn) {
    geoBtn.addEventListener('click', function () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 11);
      });
    });
  }

  // ── URL hash ──────────────────────────────────────────────────────────────
  map.on('moveend', function () {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  });

  // ── Nearest well (turf.js) ────────────────────────────────────────────────
  var measureBtn    = document.getElementById(SLUG + '-measure-btn');
  var measureCancel = document.getElementById(SLUG + '-measure-cancel');
  var measureClear  = document.getElementById(SLUG + '-measure-clear');
  var radiusSelect  = document.getElementById(SLUG + '-radius');
  var resultPanel   = document.getElementById(SLUG + '-result');
  var resultText    = document.getElementById(SLUG + '-result-text');
  var mapWrap       = container ? container.querySelector('.ogw-map-wrap') : null;

  if (radiusSelect) {
    radiusSelect.addEventListener('change', function () {
      measureRadius = parseInt(this.value, 10);
    });
  }

  function setMeasureMode(on) {
    measureActive = on;
    if (measureBtn) {
      measureBtn.textContent = on ? 'Cancel' : 'Find nearest well';
      measureBtn.classList.toggle('ogw-measure-on', on);
    }
    if (mapWrap) mapWrap.classList.toggle('ogw-crosshair', on);
    if (!on && measureCancel) measureCancel.style.display = 'none';
  }

  function clearMeasure() {
    if (measureCircle) { map.removeLayer(measureCircle); measureCircle = null; }
    if (measureLine)   { map.removeLayer(measureLine);   measureLine   = null; }
    if (measureMarker) { map.removeLayer(measureMarker); measureMarker = null; }
    if (resultPanel)   resultPanel.style.display = 'none';
    if (resultText)    resultText.textContent = '';
    setMeasureMode(false);
  }

  if (measureBtn) {
    measureBtn.addEventListener('click', function () {
      if (measureActive) { clearMeasure(); } else { clearMeasure(); setMeasureMode(true); }
    });
  }

  if (measureClear) measureClear.addEventListener('click', clearMeasure);

  map.on('click', function (e) {
    if (!measureActive) return;

    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    if (resultText) resultText.textContent = 'Searching within ' + measureRadius + ' miles...';
    if (resultPanel) resultPanel.style.display = 'flex';

    // Draw circle immediately so user gets feedback
    if (measureCircle) map.removeLayer(measureCircle);
    var circleGeo = turf.circle([lng, lat], measureRadius, { units: 'miles', steps: 64 });
    measureCircle = L.geoJSON(circleGeo, {
      style: { color: '#e67e22', weight: 2, dashArray: '6 4', fillColor: '#e67e22', fillOpacity: 0.06 }
    }).addTo(map);

    // Query FeatureServer within radius
    var geomParam = encodeURIComponent(JSON.stringify({ x: lng, y: lat }));
    var queryUrl = FS_URL + '/query?geometryType=esriGeometryPoint' +
      '&geometry=' + geomParam +
      '&inSR=4326&outSR=4326' +
      '&spatialRel=esriSpatialRelWithin' +
      '&distance=' + measureRadius +
      '&units=esriSRUnit_StatuteMile' +
      '&outFields=well_name,operator,well_type,well_status,state,county,api_number' +
      '&resultRecordCount=500' +
      '&f=geojson';

    fetch(queryUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setMeasureMode(false);

        var count = data.features ? data.features.length : 0;

        if (!count) {
          if (resultText) resultText.textContent = 'No wells found within ' + measureRadius + ' miles of this location.';
          return;
        }

        // Find nearest using turf
        var clickPt  = turf.point([lng, lat]);
        var fc       = turf.featureCollection(data.features);
        var nearest  = turf.nearestPoint(clickPt, fc);
        var distMiles = turf.distance(clickPt, nearest, { units: 'miles' });
        var distFeet  = distMiles * 5280;
        var distDisplay = distMiles < 0.1
          ? Math.round(distFeet) + ' ft'
          : distMiles.toFixed(2) + ' miles';

        var p = nearest.properties;

        // Draw line
        if (measureLine) map.removeLayer(measureLine);
        measureLine = L.polyline([
          [lat, lng],
          [nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]]
        ], { color: '#e67e22', weight: 2, dashArray: '4 3' }).addTo(map);

        // Marker on nearest well
        if (measureMarker) map.removeLayer(measureMarker);
        measureMarker = L.circleMarker(
          [nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]],
          { radius: 8, fillColor: '#e74c3c', color: '#fff', weight: 2, fillOpacity: 1 }
        ).addTo(map);
        measureMarker.bindPopup(buildPopup(p)).openPopup();

        // Result text
        var wellName = p.well_name || 'Unnamed well';
        var countLabel = count >= 500 ? '500+' : count.toString();
        if (resultText) {
          resultText.innerHTML =
            '<strong>Nearest well:</strong> ' + wellName +
            ' &mdash; <strong>' + distDisplay + ' away</strong>' +
            (p.operator ? ' (' + p.operator + ')' : '') +
            '<br><span class="ogw-result-sub">' + countLabel + ' wells within ' + measureRadius + ' miles</span>';
        }
      })
      .catch(function () {
        if (resultText) resultText.textContent = 'Query failed. Please try again.';
        setMeasureMode(false);
      });
  });

})();
