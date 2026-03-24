(function () {
  'use strict';

  var SLUG = 'us-flood-zones';
  var SERVICE_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0';
  var MIN_DATA_ZOOM = 11;

  // Zone categories in display order
  var CATEGORIES = [
    { key: 'floodway', label: 'Floodway',                        fillColor: '#b91c1c', color: '#7f1d1d', fillOpacity: 0.75 },
    { key: 'coastal',  label: 'Coastal High Hazard (V, VE)',      fillColor: '#1d4ed8', color: '#1e3a8a', fillOpacity: 0.70 },
    { key: 'a-zone',   label: '1% Annual Chance SFHA (A zones)',  fillColor: '#3b82f6', color: '#1e40af', fillOpacity: 0.60 },
    { key: 'x-zone',   label: '0.2% Annual Chance (Zone X)',      fillColor: '#bae6fd', color: '#60a5fa', fillOpacity: 0.50 },
    { key: 'other',    label: 'Other',                            fillColor: '#d1d5db', color: '#9ca3af', fillOpacity: 0.40 }
  ];

  var CAT_MAP = {};
  CATEGORIES.forEach(function (c) { CAT_MAP[c.key] = c; });

  function getCategory(p) {
    var z   = (p.FLD_ZONE   || '').toUpperCase().trim();
    var sub = (p.ZONE_SUBTY || '').toUpperCase();
    if (sub.indexOf('FLOODWAY') >= 0)                                  return 'floodway';
    if (z === 'V' || z === 'VE')                                       return 'coastal';
    if (z === 'A' || z === 'AE' || z === 'AH' || z === 'AO' ||
        z === 'AR' || z === 'A99')                                     return 'a-zone';
    if (z === 'X')                                                     return 'x-zone';
    return 'other';
  }

  function getStyle(feature) {
    var cat = CAT_MAP[getCategory(feature.properties || {})];
    return { color: cat.color, weight: 0.5, fillColor: cat.fillColor, fillOpacity: cat.fillOpacity };
  }

  // Filter WHERE clauses
  var FILTERS = {
    all:      '1=1',
    sfha:     "SFHA_TF = 'T'",
    coastal:  "FLD_ZONE IN ('V', 'VE')",
    moderate: "FLD_ZONE = 'X'"
  };

  function loadStateFromUrl() {
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

  var hashState  = loadStateFromUrl();
  var initCenter = (hashState && hashState.lat && hashState.lng)
    ? [parseFloat(hashState.lat), parseFloat(hashState.lng)]
    : [29.95, -90.07];
  var initZoom   = (hashState && hashState.z)
    ? parseInt(hashState.z, 10)
    : 11;
  var currentFilter = (hashState && FILTERS[hashState.f]) ? hashState.f : 'all';

  var map = L.map(SLUG + '-map', { center: initCenter, zoom: initZoom });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | Flood zones: <a href="https://www.fema.gov/flood-maps" target="_blank">FEMA NFHL</a>',
    maxZoom: 19
  }).addTo(map);

  var floodLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: FILTERS[currentFilter],
    style: getStyle,
    minZoom: MIN_DATA_ZOOM,
    fields: ['OBJECTID', 'FLD_ZONE', 'ZONE_SUBTY', 'SFHA_TF', 'STATIC_BFE', 'DEPTH', 'STUDY_TYP'],
    onEachFeature: function (feature, layer) {
      var p = feature.properties || {};
      var zone    = p.FLD_ZONE   || '-';
      var subty   = p.ZONE_SUBTY || '';
      var sfha    = p.SFHA_TF === 'T' ? 'Yes' : (p.SFHA_TF === 'F' ? 'No' : '-');
      var sfhaCls = p.SFHA_TF === 'T' ? 'us-flood-zones-sfha-yes' : 'us-flood-zones-sfha-no';
      var bfe     = (p.STATIC_BFE && p.STATIC_BFE > -9000) ? p.STATIC_BFE + ' ft' : null;
      var depth   = (p.DEPTH     && p.DEPTH     > -9000) ? p.DEPTH     + ' ft' : null;

      var rows = [];
      if (subty) rows.push(['Subtype', subty]);
      if (p.STUDY_TYP) rows.push(['Study Type', p.STUDY_TYP]);
      if (bfe)   rows.push(['Base Flood Elevation', bfe]);
      if (depth) rows.push(['Flood Depth', depth]);

      var html = '<div class="' + SLUG + '-popup">';
      html += '<strong>Flood Zone ' + zone + '</strong>';
      html += '<span class="' + SLUG + '-sfha-badge ' + SLUG + '-sfha-' + (p.SFHA_TF === 'T' ? 'yes' : 'no') + '">';
      html += 'SFHA: ' + sfha + '</span>';
      if (rows.length) {
        html += '<table>' + rows.map(function (r) {
          return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
        }).join('') + '</table>';
      }
      html += '</div>';
      layer.bindPopup(html, { maxWidth: 290 });
    }
  }).addTo(map);

  // Filter dropdown
  var filterSelect = document.getElementById(SLUG + '-filter');
  if (filterSelect) {
    if (currentFilter !== 'all') filterSelect.value = currentFilter;
    filterSelect.addEventListener('change', function () {
      currentFilter = this.value;
      floodLayer.setWhere(FILTERS[currentFilter] || '1=1');
      updateShareUrl();
    });
  }

  // Zoom warning
  var zoomWarning = document.getElementById(SLUG + '-zoom-warning');
  function updateZoomWarning() {
    if (!zoomWarning) return;
    zoomWarning.style.display = (map.getZoom() < MIN_DATA_ZOOM) ? 'flex' : 'none';
  }
  updateZoomWarning();
  map.on('zoomend', updateZoomWarning);

  // Share URL
  function updateShareUrl() {
    var c = map.getCenter();
    var params = { lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), z: map.getZoom() };
    if (currentFilter !== 'all') params.f = currentFilter;
    var hash = '#' + Object.keys(params)
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    history.replaceState(null, '', hash);
  }
  map.on('moveend', updateShareUrl);

  // Dynamic legend
  var legendEl = document.getElementById(SLUG + '-legend');

  function updateLegend() {
    if (!legendEl) return;
    var seen = {};
    floodLayer.eachFeature(function (layer) {
      var p = layer.feature && layer.feature.properties;
      if (p) seen[getCategory(p)] = true;
    });

    var lHTML = '<h4>Flood Zone</h4>';
    var anyVisible = false;
    CATEGORIES.forEach(function (cat) {
      if (!seen[cat.key]) return;
      anyVisible = true;
      lHTML += '<div class="' + SLUG + '-legend-item">';
      lHTML += '<span class="' + SLUG + '-legend-swatch" style="background:' + cat.fillColor + ';border-color:' + cat.color + '"></span>';
      lHTML += '<span>' + cat.label + '</span>';
      lHTML += '</div>';
    });
    if (!anyVisible) {
      lHTML += '<div style="color:#999;font-size:0.75rem;padding:2px 0;">No data in view</div>';
    }
    legendEl.innerHTML = lHTML;
  }

  floodLayer.on('load', updateLegend);

})();
