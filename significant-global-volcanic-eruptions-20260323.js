(function () {
  'use strict';

  var SLUG = 'sgve';
  var QUERY_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/test_Significant_Global_Volcanic_Eruptions_1/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson';

  var TOTAL = 0;

  // VEI color scale (0–8)
  var VEI_COLORS = ['#ffffb2','#ffffb2','#fecc5c','#fd8d3c','#f03b20','#bd0026','#800026','#4a0010','#1a0005'];
  // VEI radius scale in px
  var VEI_RADII  = [4, 5, 6, 8, 10, 13, 17, 21, 25];

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var allFeatures = [];
  var geoJsonLayer = null;

  var filters = { minVei: null, yearFrom: null, tsunamiOnly: false, fatalOnly: false };

  // --- Helpers ---

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function veiColor(vei) {
    var v = parseInt(vei);
    return isNaN(v) ? '#aaaaaa' : (VEI_COLORS[Math.min(v, 8)] || '#aaaaaa');
  }

  function veiRadius(vei) {
    var v = parseInt(vei);
    return isNaN(v) ? 5 : (VEI_RADII[Math.min(v, 8)] || 5);
  }

  function markerOptions(feature) {
    var vei = feature.properties.VEI;
    return {
      radius: veiRadius(vei),
      fillColor: veiColor(vei),
      color: '#1a0005',
      weight: 0.7,
      opacity: 0.9,
      fillOpacity: 0.85
    };
  }

  function passesFilter(feature) {
    var p = feature.properties;
    if (filters.minVei !== null) {
      var v = parseInt(p.VEI);
      if (isNaN(v) || v < filters.minVei) return false;
    }
    if (filters.yearFrom !== null && (p.YEAR == null || p.YEAR < filters.yearFrom)) return false;
    if (filters.tsunamiOnly && !(p.TSU_ID && p.TSU_ID > 0)) return false;
    if (filters.fatalOnly) {
      var d = parseInt(p.DEATHS_TOTAL);
      if (isNaN(d) || d <= 0) return false;
    }
    return true;
  }

  function buildPopupHtml(p) {
    var dateStr = (p.YEAR != null) ? String(p.YEAR) : 'Unknown';
    if (p.MO) dateStr = (MONTHS[(p.MO - 1)] || '') + ' ' + dateStr;
    if (p.DAY) dateStr = p.DAY + ' ' + dateStr;

    var dmg = (p.DAMAGE_MILLIONS_DOLLARS_TOTAL != null && p.DAMAGE_MILLIONS_DOLLARS_TOTAL > 0)
      ? '$' + Number(p.DAMAGE_MILLIONS_DOLLARS_TOTAL).toLocaleString() + 'M' : null;

    var rows = [
      ['Country',    p.COUNTRY],
      ['Location',   p.LOCATION],
      ['Date',       dateStr],
      ['VEI',        (p.VEI != null) ? p.VEI : null],
      ['Elevation',  p.ELEVATION ? p.ELEVATION + ' m' : null],
      ['Morphology', p.MORPHOLOGY],
      ['Deaths',     (p.DEATHS_TOTAL > 0) ? p.DEATHS_TOTAL : null],
      ['Injuries',   (p.INJURIES_TOTAL > 0) ? p.INJURIES_TOTAL : null],
      ['Missing',    (p.MISSING_TOTAL > 0) ? p.MISSING_TOTAL : null],
      ['Damage',     dmg],
      ['Tsunami',    p.ASSOC_TSUNAMI],
      ['Earthquake', p.ASSOC_EARTHQUAKE]
    ];

    var rowHtml = rows
      .filter(function (r) { return r[1] != null && r[1] !== ''; })
      .map(function (r) {
        return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(String(r[1])) + '</td></tr>';
      }).join('');

    var comments = p.COMMENTS
      ? '<p class="sgve-comments">' + escapeHtml(p.COMMENTS) + '</p>'
      : '';

    return '<div class="sgve-popup"><h4>' + escapeHtml(p.NAME || 'Unknown Volcano') + '</h4>' +
      '<table>' + rowHtml + '</table>' + comments + '</div>';
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
    var hash = '#lat=' + c.lat.toFixed(3) + '&lng=' + c.lng.toFixed(3) + '&z=' + map.getZoom();
    if (filters.minVei !== null) hash += '&vei=' + filters.minVei;
    if (filters.yearFrom !== null) hash += '&yf=' + filters.yearFrom;
    if (filters.tsunamiOnly) hash += '&tsu=1';
    if (filters.fatalOnly)   hash += '&fat=1';
    history.replaceState(null, '', hash);
  }

  // --- Render ---

  function applyFilters() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);

    var filtered = allFeatures.filter(passesFilter);

    geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features: filtered }, {
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, markerOptions(feature));
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopupHtml(feature.properties), { maxWidth: 320 });
      }
    }).addTo(map);

    var countEl = document.getElementById(SLUG + '-count');
    if (countEl) countEl.textContent = filtered.length + ' / ' + TOTAL + ' eruptions';

    saveUrlState();
  }

  // --- Map init ---

  var params = loadUrlState() || {};

  var map = L.map('sgve-map', {
    center: [params.lat ? +params.lat : 20, params.lng ? +params.lng : 0],
    zoom:   params.z  ? +params.z  : 2,
    worldCopyJump: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  map.on('moveend zoomend', saveUrlState);

  // --- Loading overlay ---

  var loadingEl = document.createElement('div');
  loadingEl.id = SLUG + '-loading';
  loadingEl.innerHTML = '<span class="sgve-spinner"></span>Loading eruption data...';
  map.getContainer().appendChild(loadingEl);

  // --- Controls ---

  var veiSelect    = document.getElementById(SLUG + '-vei');
  var periodSelect = document.getElementById(SLUG + '-period');
  var tsunamiEl    = document.getElementById(SLUG + '-tsunami');
  var fatalEl      = document.getElementById(SLUG + '-fatal');

  // Restore filters from URL
  if (params.vei) { filters.minVei    = +params.vei; if (veiSelect)    veiSelect.value    = params.vei; }
  if (params.yf)  { filters.yearFrom  = +params.yf;  if (periodSelect) periodSelect.value = params.yf; }
  if (params.tsu) { filters.tsunamiOnly = true;       if (tsunamiEl)    tsunamiEl.checked  = true; }
  if (params.fat) { filters.fatalOnly   = true;       if (fatalEl)      fatalEl.checked    = true; }

  function readControls() {
    filters.minVei      = veiSelect    && veiSelect.value    ? +veiSelect.value    : null;
    filters.yearFrom    = periodSelect && periodSelect.value ? +periodSelect.value : null;
    filters.tsunamiOnly = tsunamiEl ? tsunamiEl.checked : false;
    filters.fatalOnly   = fatalEl   ? fatalEl.checked   : false;
    applyFilters();
  }

  if (veiSelect)    veiSelect.addEventListener('change', readControls);
  if (periodSelect) periodSelect.addEventListener('change', readControls);
  if (tsunamiEl)    tsunamiEl.addEventListener('change', readControls);
  if (fatalEl)      fatalEl.addEventListener('change', readControls);

  // --- Fetch data ---

  fetch(QUERY_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      allFeatures = data.features || [];
      TOTAL = allFeatures.length;
      loadingEl.classList.add('sgve-hidden');
      applyFilters();
    })
    .catch(function () {
      loadingEl.innerHTML = 'Failed to load data. Please refresh.';
    });

  // --- Legend ---

  var legendEl = document.getElementById(SLUG + '-legend-items');
  if (legendEl) {
    var levels = [
      { label: 'VEI 0–1 (Gentle)',    vei: 1 },
      { label: 'VEI 2–3 (Moderate)',  vei: 3 },
      { label: 'VEI 4–5 (Severe)',    vei: 5 },
      { label: 'VEI 6–7 (Colossal)',  vei: 7 },
      { label: 'VEI 8 (Mega-colossal)', vei: 8 }
    ];
    levels.forEach(function (lvl) {
      var r = veiRadius(lvl.vei);
      var item = document.createElement('div');
      item.className = 'sgve-legend-item';
      item.innerHTML =
        '<span class="sgve-legend-dot" style="width:' + (r * 2) + 'px;height:' + (r * 2) + 'px;background:' + veiColor(lvl.vei) + ';"></span>' +
        escapeHtml(lvl.label);
      legendEl.appendChild(item);
    });
  }

})();
