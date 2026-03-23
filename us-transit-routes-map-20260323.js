(function () {
  'use strict';

  var SLUG = 'transit';
  var SERVICE_URL = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/NTAD_National_Transit_Map_Routes/FeatureServer/0';

  // Fallback colors and weights per route_type_text (used when route_color is empty)
  var MODE_STYLES = {
    'Bus':                          { color: '#f4a261', weight: 1.2 },
    'Subway, Metro':                { color: '#e63946', weight: 2.5 },
    'Rail':                         { color: '#1d3557', weight: 2.5 },
    'Tram, Streetcar, Light rail':  { color: '#52b788', weight: 2.0 },
    'Ferry':                        { color: '#4cc9f0', weight: 2.0 },
    'Trolleybus':                   { color: '#f77f00', weight: 1.5 },
    'Cable tram':                   { color: '#9d4edd', weight: 2.0 },
    'Funicular':                    { color: '#c77dff', weight: 2.0 },
    'Monorail':                     { color: '#adb5bd', weight: 2.0 },
    'Aerial lift, suspended cable car': { color: '#ffd60a', weight: 1.5 }
  };

  var DEFAULT_STYLE = { color: '#3f9b98', weight: 1.5 };

  // Don't load any routes below this zoom level
  var ZOOM_THRESHOLD = 9;

  // State abbreviation → [lat, lng, zoom] — zooms to a sensible metro-level view
  var STATE_CENTERS = {
    AL:[32.80,-86.79,9], AK:[61.21,-149.9,10], AZ:[33.45,-112.1,10],
    AR:[34.75,-92.29,9], CA:[34.05,-118.2,10], CO:[39.74,-104.9,10],
    CT:[41.76,-72.68,10],DE:[39.74,-75.54,11],FL:[25.77,-80.19,10],
    GA:[33.75,-84.39,10],HI:[21.31,-157.8,11],ID:[43.62,-116.2,10],
    IL:[41.85,-87.65,10],IN:[39.77,-86.16,10],IA:[41.59,-93.62,10],
    KS:[39.05,-95.69,10],KY:[38.25,-85.76,10],LA:[29.95,-90.07,10],
    ME:[44.10,-70.22,10],MD:[39.29,-76.61,10],MA:[42.36,-71.06,10],
    MI:[42.33,-83.05,10],MN:[44.98,-93.27,10],MS:[32.30,-90.18,10],
    MO:[38.63,-90.20,10],MT:[46.60,-112.0,10],NE:[41.26,-96.05,10],
    NV:[36.17,-115.1,10],NH:[43.21,-71.54,10],NJ:[40.72,-74.17,10],
    NM:[35.08,-106.6,10],NY:[40.71,-74.01,11],NC:[35.23,-80.84,10],
    ND:[46.81,-100.8,9], OH:[39.96,-82.99,10],OK:[35.47,-97.52,10],
    OR:[45.52,-122.7,10],PA:[39.95,-75.17,10],RI:[41.82,-71.42,11],
    SC:[34.00,-81.03,10],SD:[44.37,-100.3,9], TN:[36.17,-86.78,10],
    TX:[29.76,-95.37,10],UT:[40.76,-111.9,10],VT:[44.48,-73.21,10],
    VA:[37.54,-77.43,10],WA:[47.61,-122.3,10],WV:[38.35,-81.63,10],
    WI:[43.07,-89.40,10],WY:[41.14,-104.8,9]
  };

  var MODES = [
    'Bus',
    'Subway, Metro',
    'Rail',
    'Tram, Streetcar, Light rail',
    'Ferry',
    'Trolleybus',
    'Monorail',
    'Cable tram',
    'Funicular',
    'Aerial lift, suspended cable car'
  ];

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function modeStyle(routeTypeText) {
    return MODE_STYLES[routeTypeText] || DEFAULT_STYLE;
  }

  function styleFeature(feature) {
    var p = feature.properties;
    var ms = modeStyle(p.route_type_text);
    // Use GTFS route_color if present, else fall back to mode color
    var color = (p.route_color && p.route_color.trim() !== '')
      ? '#' + p.route_color.trim()
      : ms.color;
    return {
      color: color,
      weight: ms.weight,
      opacity: 0.85
    };
  }

  function routeLabel(p) {
    var parts = [p.route_short_name, p.route_long_name].filter(function (s) {
      return s && s.trim() !== '';
    });
    return parts.join(' - ') || 'Transit Route';
  }

  function buildPopupHtml(p) {
    var ms = modeStyle(p.route_type_text);
    var borderColor = (p.route_color && p.route_color.trim() !== '')
      ? '#' + p.route_color.trim() : ms.color;

    var rows = [
      ['Mode',    p.route_type_text],
      ['Agency',  p.agency_id],
      ['Route ID', p.route_id]
    ];

    if (p.route_desc && p.route_desc.trim()) {
      rows.push(['Description', p.route_desc]);
    }

    var rowHtml = rows
      .filter(function (r) { return r[1] && r[1].trim(); })
      .map(function (r) {
        return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(r[1]) + '</td></tr>';
      }).join('');

    var linkHtml = (p.route_url && p.route_url.trim())
      ? '<tr><td>Info</td><td><a href="' + encodeURI(p.route_url.trim()) + '" target="_blank" rel="noopener">Agency route page</a></td></tr>'
      : '';

    return '<div class="transit-popup">' +
      '<h4 style="border-bottom-color:' + borderColor + '">' + escapeHtml(routeLabel(p)) + '</h4>' +
      '<table>' + rowHtml + linkHtml + '</table></div>';
  }

  // --- URL state ---
  function loadUrlState() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

  function saveUrlState() {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom();
    if (currentMode)  hash += '&mode='  + encodeURIComponent(currentMode);
    if (currentState) hash += '&state=' + encodeURIComponent(currentState);
    history.replaceState(null, '', hash);
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function getActiveWhere() {
    if (map.getZoom() < ZOOM_THRESHOLD) return '1=0';
    return currentMode
      ? "route_type_text = '" + currentMode.replace(/'/g, "''") + "'"
      : '1=1';
  }

  // --- Init ---
  var params = loadUrlState() || {};
  var currentMode  = params.mode  ? decodeURIComponent(params.mode)  : '';
  var currentState = params.state ? decodeURIComponent(params.state) : '';

  var map = L.map(SLUG + '-map', {
    center: (params.lat && params.lng) ? [+params.lat, +params.lng] : [38.5, -97.0],
    zoom:   params.z ? +params.z : 5
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var featureLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    style: styleFeature,
    onEachFeature: function (feature, layer) {
      layer.bindPopup(buildPopupHtml(feature.properties), { maxWidth: 300 });
    },
    where: getActiveWhere()
  }).addTo(map);

  var statusEl = document.getElementById(SLUG + '-status');

  // Loading overlay
  var loadingEl = document.createElement('div');
  loadingEl.id = SLUG + '-loading';
  loadingEl.innerHTML = '<span class="transit-spinner"></span>Loading transit routes...';
  loadingEl.classList.add('transit-hidden');
  map.getContainer().appendChild(loadingEl);

  featureLayer.on('loading', function () {
    loadingEl.classList.remove('transit-hidden');
    setStatus('');
  });

  featureLayer.on('load', function () {
    loadingEl.classList.add('transit-hidden');
    setStatus(map.getZoom() < ZOOM_THRESHOLD ? 'Select a state or zoom in to see routes' : '');
  });

  map.on('zoomend', function () {
    featureLayer.setWhere(getActiveWhere());
    setStatus(map.getZoom() < ZOOM_THRESHOLD ? 'Select a state or zoom in to see routes' : '');
    saveUrlState();
  });

  map.on('moveend', function () {
    saveUrlState();
  });

  // --- Mode filter ---
  var modeSelect = document.getElementById(SLUG + '-mode');
  if (modeSelect) {
    MODES.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === currentMode) opt.selected = true;
      modeSelect.appendChild(opt);
    });

    modeSelect.addEventListener('change', function () {
      currentMode = this.value;
      featureLayer.setWhere(getActiveWhere());
      saveUrlState();
    });
  }

  // --- State filter ---
  var stateSelect = document.getElementById(SLUG + '-state');
  if (stateSelect) {
    Object.keys(STATE_CENTERS).sort().forEach(function (st) {
      var opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (st === currentState) opt.selected = true;
      stateSelect.appendChild(opt);
    });
    stateSelect.addEventListener('change', function () {
      currentState = this.value;
      if (currentState && STATE_CENTERS[currentState]) {
        var ctr = STATE_CENTERS[currentState];
        map.setView([ctr[0], ctr[1]], ctr[2]);
      }
      saveUrlState();
    });
    if (currentState && STATE_CENTERS[currentState] && !params.lat) {
      var ctr = STATE_CENTERS[currentState];
      map.setView([ctr[0], ctr[1]], ctr[2]);
    }
  }

  // --- Legend ---
  var legendEl = document.getElementById(SLUG + '-legend-items');
  if (legendEl) {
    var legendModes = [
      'Bus', 'Subway, Metro', 'Rail', 'Tram, Streetcar, Light rail',
      'Ferry', 'Trolleybus', 'Monorail'
    ];
    legendModes.forEach(function (m) {
      var s = modeStyle(m);
      var item = document.createElement('div');
      item.className = 'transit-legend-item';
      item.innerHTML =
        '<span class="transit-legend-line" style="background:' + s.color + ';height:' + Math.max(s.weight, 2) + 'px;"></span>' +
        escapeHtml(m);
      legendEl.appendChild(item);
    });
  }

})();
