(function () {
  'use strict';

  var SLUG   = 'us-lead-service-lines-map';
  var FS_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Community_Water_Systems_March_28_2024/FeatureServer/343';

  var OUT_FIELDS = ['NUM_LEAD_SERVICE_LINES', 'PWS_NAME', 'PRIMACY_AGENCY',
                    'POPULATION_SERVED_COUNT', 'SCHOOL_OR_DAYCARE', 'PWSID', 'COMPLIANCE_EVAL_CODE'];

  var TIERS = [
    { min: 0,     max: 0,        fill: '#e0e0e0', label: 'None reported' },
    { min: 1,     max: 99,       fill: '#ffe082', label: '1 - 99 pipes' },
    { min: 100,   max: 999,      fill: '#fb8c00', label: '100 - 999 pipes' },
    { min: 1000,  max: 9999,     fill: '#e53935', label: '1,000 - 9,999 pipes' },
    { min: 10000, max: Infinity, fill: '#880e4f', label: '10,000+ pipes' }
  ];

  var FILTERS = [
    { label: 'Has Lead Lines',    where: 'NUM_LEAD_SERVICE_LINES > 0' },
    { label: 'All Systems',       where: '1=1' },
    { label: '100+ Lead Pipes',   where: 'NUM_LEAD_SERVICE_LINES >= 100' },
    { label: '1,000+ Lead Pipes', where: 'NUM_LEAD_SERVICE_LINES >= 1000' },
    { label: 'Serves Schools',    where: "SCHOOL_OR_DAYCARE = 'Y' AND NUM_LEAD_SERVICE_LINES > 0" }
  ];

  function getColor(n) {
    if (!n || n === 0) return TIERS[0].fill;
    for (var i = TIERS.length - 1; i >= 0; i--) {
      if (n >= TIERS[i].min) return TIERS[i].fill;
    }
    return TIERS[0].fill;
  }

  function featureStyle(feature) {
    var n = feature.properties.NUM_LEAD_SERVICE_LINES || 0;
    return { fillColor: getColor(n), fillOpacity: 0.75, color: '#555', weight: 0.5, opacity: 1 };
  }

  function fmt(n) {
    return (n !== null && n !== undefined) ? Number(n).toLocaleString() : 'Not reported';
  }

  var urlState = {};
  (window.location.hash.slice(1) || '').split('&').forEach(function (pair) {
    var idx = pair.indexOf('=');
    if (idx > 0) urlState[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
  });

  var map = L.map(SLUG + '-map', {
    center:          [parseFloat(urlState.lat) || 38.5, parseFloat(urlState.lng) || -96.5],
    zoom:            parseInt(urlState.z, 10) || 4,
    scrollWheelZoom: true,
    preferCanvas:    true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(map);

  map.on('moveend', function () {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  });

  var featureLayer = null;

  function bindPopup(feature, layer) {
    var p    = feature.properties;
    var n    = p.NUM_LEAD_SERVICE_LINES;
    var lead = (n !== null && n !== undefined) ? fmt(n) : 'Not reported';
    var school = (p.SCHOOL_OR_DAYCARE === 'Y')
      ? '<br><span style="color:#e53935;font-weight:700;">Serves schools or daycares</span>' : '';
    var echoLink = p.PWSID
      ? '<br><a href="https://echo.epa.gov/drinking-water/drinking-water-dashboard?system_id='
          + p.PWSID + '" target="_blank" rel="noopener">View EPA ECHO record</a>' : '';
    layer.bindPopup(
      '<strong>' + (p.PWS_NAME || 'Water System') + '</strong>' + school +
      '<br>State: '             + (p.PRIMACY_AGENCY || 'N/A') +
      '<br>Population served: ' + fmt(p.POPULATION_SERVED_COUNT) +
      '<br><strong>Lead service lines: ' + lead + '</strong>' +
      '<br>Compliance status: ' + (p.COMPLIANCE_EVAL_CODE || 'Unknown') +
      '<br>PWSID: '             + (p.PWSID || 'N/A') +
      echoLink
    );
  }

  function loadLayer(where) {
    if (featureLayer) { map.removeLayer(featureLayer); }
    featureLayer = L.esri.featureLayer({
      url:           FS_URL,
      where:         where,
      outFields:     OUT_FIELDS,
      precision:     4,
      simplifyFactor: 0.25,
      renderer:      L.canvas(),
      style:         featureStyle,
      onEachFeature: bindPopup
    }).addTo(map);
  }

  var controlsEl = document.getElementById(SLUG + '-controls');

  // Filter buttons
  var filterDiv = document.createElement('div');
  filterDiv.className = SLUG + '-filters';
  FILTERS.forEach(function (f, i) {
    var btn = document.createElement('button');
    btn.textContent = f.label;
    btn.className   = SLUG + '-filter-btn' + (i === 0 ? ' active' : '');
    btn.addEventListener('click', function () {
      document.querySelectorAll('.' + SLUG + '-filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      loadLayer(f.where);
    });
    filterDiv.appendChild(btn);
  });
  controlsEl.appendChild(filterDiv);

  var filterNote = document.createElement('p');
  filterNote.className = SLUG + '-filter-note';
  filterNote.textContent = 'Counts are self-reported by each water system under the EPA Lead and Copper Rule Revisions. "All Systems" includes those reporting zero lead pipes.';
  controlsEl.appendChild(filterNote);

  // Search row
  var searchRow    = document.createElement('div');
  searchRow.className = SLUG + '-search-row';

  var addressInput        = document.createElement('input');
  addressInput.type        = 'text';
  addressInput.placeholder = 'Search for a city or address...';
  addressInput.className   = SLUG + '-address';

  var searchBtn       = document.createElement('button');
  searchBtn.textContent = 'Search';
  searchBtn.className   = SLUG + '-search-btn';

  var locateBtn       = document.createElement('button');
  locateBtn.textContent = 'My Location';
  locateBtn.className   = SLUG + '-locate-btn';

  searchBtn.addEventListener('click', function () {
    var q = addressInput.value.trim();
    if (!q) return;
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data[0]) { map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 10); }
      });
  });
  addressInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') searchBtn.click(); });
  locateBtn.addEventListener('click', function () { map.locate({ setView: true, maxZoom: 11 }); });

  searchRow.appendChild(addressInput);
  searchRow.appendChild(searchBtn);
  searchRow.appendChild(locateBtn);
  controlsEl.appendChild(searchRow);

  // Legend
  var legendDiv = document.createElement('div');
  legendDiv.className = SLUG + '-legend';
  var lTitle = document.createElement('p');
  lTitle.textContent = 'Lead service lines per system';
  legendDiv.appendChild(lTitle);
  TIERS.forEach(function (t) {
    var row    = document.createElement('div');
    row.className = SLUG + '-legend-row';
    var swatch = document.createElement('span');
    swatch.className = SLUG + '-legend-swatch';
    swatch.style.background = t.fill;
    var lbl = document.createElement('span');
    lbl.textContent = t.label;
    row.appendChild(swatch);
    row.appendChild(lbl);
    legendDiv.appendChild(row);
  });
  controlsEl.appendChild(legendDiv);

  var note = document.createElement('p');
  note.className = SLUG + '-note';
  note.innerHTML = 'Source: <a href="https://echo.epa.gov" target="_blank" rel="noopener">EPA ECHO</a> / SDWIS &mdash; Community Water Systems. Lead service line counts self-reported under the EPA Lead and Copper Rule Revisions (LCRR). Data as of March 2024.';
  controlsEl.appendChild(note);

  loadLayer(FILTERS[0].where);

})();
