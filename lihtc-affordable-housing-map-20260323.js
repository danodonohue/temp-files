(function () {
  'use strict';

  var SLUG = 'lihtc';
  var SERVICE_URL = 'https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/LIHTC/FeatureServer/0';

  // Unit count tiers: colour + radius
  var TIERS = [
    { label: '1–24 units',   min: 0,   max: 24,  color: '#84d2c5', r: 4  },
    { label: '25–99 units',  min: 25,  max: 99,  color: '#3d9a8b', r: 7  },
    { label: '100–249 units',min: 100, max: 249, color: '#1a5c52', r: 10 },
    { label: '250+ units',   min: 250, max: Infinity, color: '#f4845f', r: 14 }
  ];

  var STATES = [
    'AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID',
    'IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC',
    'ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','PR','RI','SC',
    'SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'
  ];

  var PERIODS = [
    { label: 'All years',   from: null, to: null   },
    { label: 'Since 2015',  from: '2015', to: null },
    { label: 'Since 2010',  from: '2010', to: null },
    { label: 'Since 2000',  from: '2000', to: null },
    { label: 'Since 1990',  from: '1990', to: null },
    { label: '1987–1989',   from: '1987', to: '1989' }
  ];

  var MIN_UNITS_OPTIONS = [
    { label: 'Any size', value: null },
    { label: '25+ units', value: 25 },
    { label: '50+ units', value: 50 },
    { label: '100+ units', value: 100 },
    { label: '250+ units', value: 250 }
  ];

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tierForUnits(n) {
    var units = parseInt(n) || 0;
    for (var i = TIERS.length - 1; i >= 0; i--) {
      if (units >= TIERS[i].min) return TIERS[i];
    }
    return TIERS[0];
  }

  function styleFeature(feature) {
    var t = tierForUnits(feature.properties.N_UNITS);
    return {
      radius: t.r,
      fillColor: t.color,
      color: '#1a3a35',
      weight: 0.7,
      opacity: 0.8,
      fillOpacity: 0.82
    };
  }

  function formatCurrency(val) {
    if (val == null || val === 0) return null;
    return '$' + Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function buildPopupHtml(p) {
    var addr = [p.PROJ_ADD, p.PROJ_CTY, p.PROJ_ST, p.PROJ_ZIP]
      .filter(Boolean).join(', ');

    var rows = [
      ['Address',             addr || null],
      ['Total Units',         p.N_UNITS != null ? p.N_UNITS : null],
      ['Low-Income Units',    p.LI_UNITS != null ? p.LI_UNITS : null],
      ['Year Placed in Svc',  p.YR_PIS  || null],
      ['Year Allocated',      p.YR_ALLOC || null],
      ['Tax Credit ($)',      formatCurrency(p.ALLOCAMT)]
    ];

    var rowHtml = rows
      .filter(function (r) { return r[1] != null && r[1] !== ''; })
      .map(function (r) {
        return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(String(r[1])) + '</td></tr>';
      }).join('');

    return '<div class="lihtc-popup">' +
      '<h4>' + escapeHtml(p.PROJECT || 'LIHTC Property') + '</h4>' +
      '<table>' + rowHtml + '</table></div>';
  }

  // --- Filters ---
  var currentState   = '';
  var currentPeriod  = 0;   // index into PERIODS
  var currentMinUnits = null;

  function buildWhere() {
    var parts = [];
    if (currentState) parts.push("PROJ_ST = '" + currentState + "'");
    var p = PERIODS[currentPeriod];
    if (p.from) parts.push("YR_PIS >= '" + p.from + "'");
    if (p.to)   parts.push("YR_PIS <= '" + p.to + "'");
    if (currentMinUnits) parts.push('N_UNITS >= ' + currentMinUnits);
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  function applyFilters() {
    featureLayer.setWhere(buildWhere());
    saveUrlState();
  }

  function zoomToState(state) {
    if (!state) return;
    var qs = 'where=' + encodeURIComponent("PROJ_ST='" + state + "'") +
      '&returnExtentOnly=true&inSR=4326&outSR=4326&f=json';
    fetch(SERVICE_URL + '/query?' + qs)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.extent) {
          var e = data.extent;
          map.fitBounds([[e.ymin, e.xmin], [e.ymax, e.xmax]], { padding: [24, 24] });
        }
      })
      .catch(function () {});
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
    if (currentState)    hash += '&state=' + encodeURIComponent(currentState);
    if (currentPeriod)   hash += '&period=' + currentPeriod;
    if (currentMinUnits) hash += '&units=' + currentMinUnits;
    history.replaceState(null, '', hash);
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  // --- Map init ---
  var params = loadUrlState() || {};

  if (params.state)  currentState    = params.state;
  if (params.period) currentPeriod   = parseInt(params.period) || 0;
  if (params.units)  currentMinUnits = parseInt(params.units)  || null;

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
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, styleFeature(feature));
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(buildPopupHtml(feature.properties), { maxWidth: 300 });
    },
    where: buildWhere()
  }).addTo(map);

  var statusEl = document.getElementById(SLUG + '-status');

  // Loading overlay
  var loadingEl = document.createElement('div');
  loadingEl.id = SLUG + '-loading';
  loadingEl.innerHTML = '<span class="lihtc-spinner"></span>Loading housing data...';
  loadingEl.classList.add('lihtc-hidden');
  map.getContainer().appendChild(loadingEl);

  featureLayer.on('loading', function () {
    loadingEl.classList.remove('lihtc-hidden');
    setStatus('');
  });
  featureLayer.on('load', function () {
    loadingEl.classList.add('lihtc-hidden');
    setStatus(map.getZoom() < 8 ? 'Zoom in to see all properties' : '');
  });

  map.on('moveend zoomend', function () {
    if (statusEl && statusEl.textContent !== '') {
      setStatus(map.getZoom() < 8 ? 'Zoom in to see all properties' : '');
    }
    saveUrlState();
  });

  // --- Controls ---
  var stateSelect   = document.getElementById(SLUG + '-state');
  var periodSelect  = document.getElementById(SLUG + '-period');
  var unitsSelect   = document.getElementById(SLUG + '-units');

  if (stateSelect) {
    STATES.forEach(function (st) {
      var opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (st === currentState) opt.selected = true;
      stateSelect.appendChild(opt);
    });
    stateSelect.addEventListener('change', function () {
      currentState = this.value;
      applyFilters();
      zoomToState(currentState);
    });
    if (currentState) zoomToState(currentState);
  }

  if (periodSelect) {
    PERIODS.forEach(function (p, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = p.label;
      if (i === currentPeriod) opt.selected = true;
      periodSelect.appendChild(opt);
    });
    periodSelect.addEventListener('change', function () {
      currentPeriod = parseInt(this.value);
      applyFilters();
    });
  }

  if (unitsSelect) {
    MIN_UNITS_OPTIONS.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value || '';
      opt.textContent = o.label;
      if (o.value === currentMinUnits) opt.selected = true;
      unitsSelect.appendChild(opt);
    });
    unitsSelect.addEventListener('change', function () {
      currentMinUnits = this.value ? parseInt(this.value) : null;
      applyFilters();
    });
  }

  // --- Legend ---
  var legendEl = document.getElementById(SLUG + '-legend-items');
  if (legendEl) {
    TIERS.forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'lihtc-legend-item';
      var d = t.r * 2;
      item.innerHTML =
        '<span class="lihtc-legend-dot" style="width:' + d + 'px;height:' + d + 'px;background:' + t.color + ';"></span>' +
        escapeHtml(t.label);
      legendEl.appendChild(item);
    });
  }

})();
