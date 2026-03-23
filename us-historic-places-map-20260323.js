(function () {
  'use strict';

  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/nrhp_points_v1/FeatureServer/0';

  // Dynamic color palette — colors assigned to ResType values as they appear in data
  var COLOR_PALETTE = [
    '#2266cc', // blue
    '#228833', // green
    '#dd5500', // orange
    '#882299', // purple
    '#44aaaa', // teal
    '#cc4422', // rust
    '#669933', // olive
    '#995522'  // brown
  ];

  var NHL_COLOR        = '#cc9900';
  var NHL_BORDER_COLOR = '#886600';

  var typeColorMap  = {};  // ResType value -> color (built dynamically)
  var paletteIdx    = 0;
  var nhlFieldValue = null; // actual Is_NHL value for Landmarks (discovered from data)

  function isNHL(val) {
    // Is_NHL uses "X" to mark landmarks; treat any non-empty, non-null value as true
    return val !== null && val !== undefined && String(val).trim() !== '';
  }

  function getTypeColor(resType) {
    var key = resType ? String(resType).trim() : 'Unknown';
    if (!typeColorMap[key]) {
      typeColorMap[key] = COLOR_PALETTE[paletteIdx % COLOR_PALETTE.length];
      paletteIdx++;
      updateLegend();
      updateTypeDropdown(key);
    }
    return typeColorMap[key];
  }

  // --- DOM refs (set after DOM build) ---
  var legendEl = null;
  var typeSel  = null;

  function updateLegend() {
    if (!legendEl) return;
    var rows = '<h4>Resource Type</h4>';
    // NHL row always first
    rows += '<div class="hp-legend-item">' +
      '<div class="hp-legend-dot nhl" style="background:' + NHL_COLOR + ';border-color:' + NHL_BORDER_COLOR + ';"></div>' +
      'National Historic Landmark</div>';
    // Dynamic ResType rows
    Object.keys(typeColorMap).forEach(function (type) {
      rows += '<div class="hp-legend-item">' +
        '<div class="hp-legend-dot" style="background:' + typeColorMap[type] + ';"></div>' +
        type.charAt(0).toUpperCase() + type.slice(1) + '</div>';
    });
    legendEl.innerHTML = rows;
  }

  function updateTypeDropdown(newType) {
    if (!typeSel) return;
    // Check if option already exists
    for (var i = 0; i < typeSel.options.length; i++) {
      if (typeSel.options[i].value === newType) return;
    }
    var opt = document.createElement('option');
    opt.value = newType;
    opt.textContent = newType.charAt(0).toUpperCase() + newType.slice(1);
    // Insert before the last static option (Landmarks Only)
    var lastOpt = typeSel.querySelector('option[value="__landmarks__"]');
    typeSel.insertBefore(opt, lastOpt || null);
  }

  var REGIONS = [
    { label: 'Continental US',        bounds: [[24, -125], [50, -66]] },
    { label: 'New England',           bounds: [[41.0, -73.7], [47.5, -66.9]] },
    { label: 'Mid-Atlantic',          bounds: [[38.5, -80.5], [43.0, -73.5]] },
    { label: 'Virginia / Carolinas',  bounds: [[33.5, -84.5], [39.5, -75.0]] },
    { label: 'Southeast',             bounds: [[24.0, -92.0], [37.0, -75.0]] },
    { label: 'Florida',               bounds: [[24.4, -87.6], [31.0, -80.0]] },
    { label: 'Midwest',               bounds: [[36.0, -97.0], [49.0, -80.0]] },
    { label: 'South / Gulf Coast',    bounds: [[28.0, -97.5], [36.0, -81.0]] },
    { label: 'Texas',                 bounds: [[25.8, -106.6], [36.5, -93.5]] },
    { label: 'Rocky Mountains',       bounds: [[36.0, -115.0], [49.0, -100.0]] },
    { label: 'Southwest',             bounds: [[31.0, -120.0], [42.0, -103.0]] },
    { label: 'California',            bounds: [[32.5, -124.5], [42.0, -114.1]] },
    { label: 'Pacific Northwest',     bounds: [[42.0, -124.5], [49.0, -116.0]] },
    { label: 'Alaska',                bounds: [[54.0, -170.0], [72.0, -130.0]] },
    { label: 'Hawaii',                bounds: [[18.9, -160.3], [22.2, -154.8]] }
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

  function writeHashState(map) {
    var center = map.getCenter();
    var state = { lat: center.lat.toFixed(4), lng: center.lng.toFixed(4), z: map.getZoom() };
    var hash = '#' + Object.keys(state).map(function (k) { return k + '=' + encodeURIComponent(state[k]); }).join('&');
    history.replaceState(null, '', hash);
  }

  // --- DOM ---
  var controlsEl = document.getElementById('hp-controls');
  if (!controlsEl) return;

  // Type dropdown — starts with All + Landmarks; ResType options added dynamically
  var typeHtml = '<div class="hp-control-group"><label for="hp-type-select">Type</label>' +
    '<select id="hp-type-select">' +
    '<option value="__all__">All Types</option>' +
    '<option value="__landmarks__">National Landmarks Only</option>' +
    '</select></div>';

  var regionHtml = '<div class="hp-control-group"><label for="hp-region-select">Zoom to</label><select id="hp-region-select">';
  REGIONS.forEach(function (r) {
    regionHtml += '<option value="' + r.label + '">' + r.label + '</option>';
  });
  regionHtml += '</select></div>';

  controlsEl.innerHTML = typeHtml + regionHtml +
    '<div id="hp-place-info"><span id="hp-place-count">-</span> places loaded</div>';

  legendEl = document.getElementById('hp-legend');
  typeSel  = document.getElementById('hp-type-select');

  // Initial legend (NHL entry only; ResType rows added as data loads)
  updateLegend();

  // --- MAP ---
  var hashState  = readHashState();
  var initCenter = [38, -96];
  var initZoom   = 4;
  if (hashState && hashState.lat && hashState.lng) {
    initCenter = [parseFloat(hashState.lat), parseFloat(hashState.lng)];
    initZoom   = hashState.z ? parseInt(hashState.z, 10) : 4;
  }

  var map = L.map('hp-map', { center: initCenter, zoom: initZoom });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var loadingEl   = document.getElementById('hp-loading');
  var countEl     = document.getElementById('hp-place-count');
  var loadedCount = 0;

  function showLoading() { if (loadingEl) loadingEl.style.display = 'flex'; }
  function hideLoading() { if (loadingEl) loadingEl.style.display = 'none'; }

  function buildPopup(props) {
    var name     = props.RESNAME || 'Unknown';
    var type     = props.ResType ? props.ResType.charAt(0).toUpperCase() + props.ResType.slice(1) : '-';
    var city     = props.City  || '';
    var state    = props.State || '';
    var location = [city, state].filter(Boolean).join(', ');
    var nhl      = isNHL(props.Is_NHL);
    var certDate = props.CertDate || '';
    var url      = props.NARA_URL;

    var html = '<div style="font-size:0.85rem;line-height:1.7;max-width:260px;">';
    if (nhl) {
      html += '<div style="background:#cc9900;color:#fff;padding:2px 8px;border-radius:3px;font-size:0.72rem;font-weight:700;margin-bottom:5px;display:inline-block;">National Historic Landmark</div><br>';
    }
    html += '<strong style="font-size:0.9rem;">' + name + '</strong><br>';
    html += 'Type: ' + type + '<br>';
    if (location) html += location + '<br>';
    if (certDate) html += 'Listed: ' + certDate + '<br>';
    if (url) html += '<a href="' + url + '" target="_blank" rel="noopener" style="color:#2266cc;">NPS Record</a>';
    html += '</div>';
    return html;
  }

  var placeLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    fields: ['OBJECTID', 'RESNAME', 'ResType', 'City', 'State', 'Is_NHL', 'CertDate', 'NARA_URL'],
    pointToLayer: function (geojson, latlng) {
      var props = geojson.properties || {};
      var nhl   = isNHL(props.Is_NHL);

      // Capture the actual Is_NHL value for WHERE clause use
      if (nhl && !nhlFieldValue && props.Is_NHL) {
        nhlFieldValue = String(props.Is_NHL).trim();
      }

      var color = nhl ? NHL_COLOR : getTypeColor(props.ResType);
      return L.circleMarker(latlng, {
        radius:      nhl ? 7 : 5,
        fillColor:   color,
        color:       nhl ? NHL_BORDER_COLOR : 'rgba(255,255,255,0.7)',
        weight:      nhl ? 2 : 0.8,
        opacity:     1,
        fillOpacity: 0.85
      });
    },
    onEachFeature: function (feature, layer) {
      loadedCount++;
      if (countEl) countEl.textContent = loadedCount;
      layer.on('click', function (e) {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(buildPopup(feature.properties))
          .openOn(map);
      });
    }
  });

  placeLayer.on('loading', showLoading);
  placeLayer.on('load', function () {
    hideLoading();
    if (countEl) countEl.textContent = loadedCount > 0 ? loadedCount : '-';
    writeHashState(map);
  });
  placeLayer.on('requesterror', hideLoading);
  placeLayer.addTo(map);

  // --- EVENTS ---
  typeSel.addEventListener('change', function () {
    var val = this.value;
    loadedCount = 0;
    if (countEl) countEl.textContent = '-';

    if (val === '__all__') {
      placeLayer.setWhere('1=1');
    } else if (val === '__landmarks__') {
      var nhlWhere = nhlFieldValue
        ? "Is_NHL = '" + nhlFieldValue + "'"
        : "Is_NHL IS NOT NULL AND Is_NHL <> ''";
      placeLayer.setWhere(nhlWhere);
    } else {
      placeLayer.setWhere("ResType = '" + val.replace(/'/g, "''") + "'");
    }
  });

  document.getElementById('hp-region-select').addEventListener('change', function () {
    var label = this.value;
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].label === label) {
        map.fitBounds(REGIONS[i].bounds);
        break;
      }
    }
  });

  map.on('moveend', function () { writeHashState(map); });

})();
