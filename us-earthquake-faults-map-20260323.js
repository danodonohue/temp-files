(function () {
  'use strict';

  var LINES_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Earthquake_Faults_and_Folds_in_the_USA/FeatureServer/1';
  var AREAS_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Earthquake_Faults_and_Folds_in_the_USA/FeatureServer/2';

  // Color by age of last activity (most hazard-relevant attribute)
  var AGE_COLORS = [
    { test: 'historic',       color: '#cc0000' },
    { test: 'holocene',       color: '#cc0000' },
    { test: '<15',            color: '#ff6600' },
    { test: 'latest',         color: '#ff6600' },
    { test: 'pleistocene',    color: '#ff6600' },
    { test: '<130',           color: '#cc8800' },
    { test: 'late quaternary',color: '#cc8800' },
    { test: 'quaternary',     color: '#3377bb' }
  ];

  var LEGEND_ROWS = [
    { color: '#cc0000', label: 'Historic / Holocene (<15 ka)' },
    { color: '#ff6600', label: 'Latest Pleistocene (<130 ka)' },
    { color: '#cc8800', label: 'Late Quaternary (<750 ka)' },
    { color: '#3377bb', label: 'Quaternary (<1.6 Ma)' },
    { color: '#999999', label: 'Undifferentiated / Unknown' }
  ];

  // Fault type filter options (different field names per layer)
  var FAULT_TYPES = [
    { label: 'All Faults',       linesWhere: '1=1',                                                           areasWhere: '1=1' },
    { label: 'Strike-Slip',      linesWhere: "slip_sense LIKE '%lateral%'",                                   areasWhere: "slipsense LIKE '%lateral%'" },
    { label: 'Normal',           linesWhere: "slip_sense LIKE '%Normal%'",                                    areasWhere: "slipsense LIKE '%Normal%'" },
    { label: 'Reverse / Thrust', linesWhere: "slip_sense LIKE '%Reverse%' OR slip_sense LIKE '%Thrust%'",     areasWhere: "slipsense LIKE '%Reverse%' OR slipsense LIKE '%Thrust%'" }
  ];

  var REGIONS = [
    { label: 'Continental US',     bounds: [[24, -125], [50, -66]] },
    { label: 'West Coast',         bounds: [[32, -125], [49, -115]] },
    { label: 'Pacific Northwest',  bounds: [[42, -124], [49, -116]] },
    { label: 'California',         bounds: [[32.5, -124.5], [42.0, -114.1]] },
    { label: 'Southwest',          bounds: [[31, -120], [42, -103]] },
    { label: 'Rocky Mountains',    bounds: [[36, -115], [49, -100]] },
    { label: 'Basin and Range',    bounds: [[31, -117], [42, -108]] },
    { label: 'Alaska',             bounds: [[54, -170], [72, -130]] },
    { label: 'New Madrid Zone',    bounds: [[34, -92], [40, -86]] },
    { label: 'Appalachians',       bounds: [[33, -88], [44, -71]] },
    { label: 'East Coast',         bounds: [[30, -85], [47, -65]] }
  ];

  function getAgeColor(age) {
    if (!age || age === '') return '#999999';
    var a = age.toLowerCase();
    for (var i = 0; i < AGE_COLORS.length; i++) {
      if (a.indexOf(AGE_COLORS[i].test) !== -1) return AGE_COLORS[i].color;
    }
    return '#999999';
  }

  function styleLines(feature) {
    var color = getAgeColor(feature.properties ? feature.properties.age : null);
    return { color: color, weight: 2, opacity: 0.85 };
  }

  function styleAreas(feature) {
    var color = getAgeColor(feature.properties ? feature.properties.age : null);
    return { color: color, weight: 0.5, opacity: 0.5, fillColor: color, fillOpacity: 0.18 };
  }

  function buildLinesPopup(props) {
    var name   = props.fault_name || props.section_name || 'Unnamed Fault';
    var age    = props.age || '-';
    var sense  = props.slip_sense || '-';
    var rate   = props.slip_rate || '-';
    var loc    = props.Location || '-';
    var cls    = props.class || '-';
    var len    = props.total_fault_length;
    var url    = props.fault_url;

    var html = '<div style="font-size:0.85rem;line-height:1.7;max-width:240px;">';
    html += '<strong>' + name + '</strong><br>';
    html += 'Age: ' + age + '<br>';
    html += 'Slip Sense: ' + sense + '<br>';
    if (rate && rate !== '-') html += 'Slip Rate: ' + rate + ' mm/yr<br>';
    if (len && len > 0) html += 'Length: ' + len + ' km<br>';
    html += 'Class: ' + cls + '<br>';
    if (loc && loc !== '-') html += 'Location: ' + loc + '<br>';
    if (url) html += '<a href="' + url + '" target="_blank" rel="noopener" style="color:#3366cc;">USGS Details</a>';
    html += '</div>';
    return html;
  }

  function buildAreasPopup(props) {
    var name  = props.fault_area_name || 'Unnamed Fault Area';
    var age   = props.age || '-';
    var sense = props.slipsense || '-';
    var html = '<div style="font-size:0.85rem;line-height:1.7;">';
    html += '<strong>' + name + '</strong><br>';
    html += 'Age: ' + age + '<br>';
    html += 'Slip Sense: ' + sense;
    html += '</div>';
    return html;
  }

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
    var state = {
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
  var controlsEl = document.getElementById('qf-controls');
  if (!controlsEl) return;

  var typeHtml = '<div class="qf-control-group"><label for="qf-type-select">Fault Type</label><select id="qf-type-select">';
  FAULT_TYPES.forEach(function (ft) {
    typeHtml += '<option value="' + ft.label + '">' + ft.label + '</option>';
  });
  typeHtml += '</select></div>';

  var regionHtml = '<div class="qf-control-group"><label for="qf-region-select">Zoom to</label><select id="qf-region-select">';
  REGIONS.forEach(function (r) {
    regionHtml += '<option value="' + r.label + '">' + r.label + '</option>';
  });
  regionHtml += '</select></div>';

  controlsEl.innerHTML = typeHtml + regionHtml +
    '<div id="qf-fault-info"><span id="qf-fault-count">-</span> faults loaded</div>';

  var legendEl = document.getElementById('qf-legend');
  if (legendEl) {
    legendEl.innerHTML = '<h4>Age of Last Activity</h4>' +
      LEGEND_ROWS.map(function (row) {
        return '<div class="qf-legend-item">' +
          '<div class="qf-legend-swatch" style="background:' + row.color + ';opacity:0.85;"></div>' +
          row.label + '</div>';
      }).join('');
  }

  // --- MAP ---
  var hashState = readHashState();
  var initCenter = [38, -98];
  var initZoom = 4;
  if (hashState && hashState.lat && hashState.lng) {
    initCenter = [parseFloat(hashState.lat), parseFloat(hashState.lng)];
    initZoom = hashState.z ? parseInt(hashState.z, 10) : 4;
  }

  var map = L.map('qf-map', { center: initCenter, zoom: initZoom });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var loadingEl  = document.getElementById('qf-loading');
  var countEl    = document.getElementById('qf-fault-count');
  var loadingCount = 0;

  function startLoading() { loadingCount++; if (loadingEl) loadingEl.style.display = 'flex'; }
  function stopLoading()  { loadingCount = Math.max(0, loadingCount - 1); if (loadingCount === 0 && loadingEl) loadingEl.style.display = 'none'; }

  var linesLoaded = 0;

  // Areas layer added first so it renders beneath lines
  var areasLayer = L.esri.featureLayer({
    url: AREAS_URL,
    fields: ['OBJECTID', 'fault_area_name', 'age', 'slipsense'],
    style: styleAreas,
    onEachFeature: function (feature, layer) {
      layer.on('click', function (e) {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(buildAreasPopup(feature.properties))
          .openOn(map);
      });
    }
  });

  areasLayer.on('loading', startLoading);
  areasLayer.on('load',    stopLoading);
  areasLayer.addTo(map);

  // Lines layer on top
  var linesLayer = L.esri.featureLayer({
    url: LINES_URL,
    fields: ['OBJECTID', 'fault_name', 'section_name', 'age', 'slip_sense', 'slip_rate', 'class', 'Location', 'total_fault_length', 'fault_url'],
    style: styleLines,
    onEachFeature: function (feature, layer) {
      linesLoaded++;
      if (countEl) countEl.textContent = linesLoaded;
      layer.on('click', function (e) {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(buildLinesPopup(feature.properties))
          .openOn(map);
      });
    }
  });

  linesLayer.on('loading', startLoading);
  linesLayer.on('load', function () {
    stopLoading();
    if (countEl) countEl.textContent = linesLoaded > 0 ? linesLoaded : '-';
    writeHashState(map);
  });
  linesLayer.addTo(map);

  // --- EVENTS ---
  document.getElementById('qf-type-select').addEventListener('change', function () {
    var label = this.value;
    for (var i = 0; i < FAULT_TYPES.length; i++) {
      if (FAULT_TYPES[i].label === label) {
        linesLoaded = 0;
        if (countEl) countEl.textContent = '-';
        linesLayer.setWhere(FAULT_TYPES[i].linesWhere);
        areasLayer.setWhere(FAULT_TYPES[i].areasWhere);
        break;
      }
    }
  });

  document.getElementById('qf-region-select').addEventListener('change', function () {
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
