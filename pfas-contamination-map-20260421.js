(function () {
  'use strict';

  var SERVICE_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/PFAS_Analytic_Tools_Layers/FeatureServer/1';

  var US_STATES = [
    'AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN',
    'KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ',
    'NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA',
    'WI','WV','WY'
  ];

  function getHash() {
    var h = window.location.hash.slice(1), out = {};
    if (!h) return out;
    h.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i >= 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return out;
  }

  function setHash(map, stateFilter) {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom() + '&state=' + encodeURIComponent(stateFilter));
  }

  var hs = getHash();
  var currentState = hs.state || 'all';

  var map = L.map('pfas-contamination-map-map', {
    center: [hs.lat ? +hs.lat : 39.5, hs.lng ? +hs.lng : -98.35],
    zoom: hs.z ? +hs.z : 4
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  function makeIcon(aboveMRL) {
    var color = aboveMRL ? '#c0392b' : '#e67e22';
    return L.divIcon({
      className: '',
      html: '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';border:1.5px solid rgba(0,0,0,0.4);"></div>',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }

  function buildWhere(state) {
    var base = "Result_At_or_Above_UCMR_MRL='Yes'";
    if (state && state !== 'all') {
      base += " AND State='" + state + "'";
    }
    return base;
  }

  var countEl;
  var clusterGroup = L.markerClusterGroup({ chunkedLoading: true }).addTo(map);
  var markerIndex = {};

  var featureLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: buildWhere(currentState),
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0, interactive: false });
    },
    onEachFeature: function (feature, lyr) {
      var p = feature.properties;
      var aboveMRL = p.Result_At_or_Above_UCMR_MRL === 'Yes';
      var cm = L.marker(lyr.getLatLng(), { icon: makeIcon(aboveMRL) });
      var name = p.PWS_Name || p.Facility_Name || 'Unknown System';
      var state = p.State || 'N/A';
      var pop = p.Population_Served ? (+p.Population_Served).toLocaleString() : 'N/A';
      var contaminant = p.Contaminant || 'N/A';
      var result = (p.Analytical_Result_Value__ng_L_ !== null && p.Analytical_Result_Value__ng_L_ !== undefined)
        ? p.Analytical_Result_Value__ng_L_.toFixed(1) + ' ng/L' : 'N/A';
      var aboveHBSL = p.Result_Above_HBSL === 'Yes' ? '<strong style="color:#c0392b">Yes</strong>' : 'No';
      var date = p.Collection_Date || 'N/A';
      cm.bindPopup(
        '<strong>' + name + '</strong><br>' +
        'State: ' + state + '<br>' +
        'Population served: ' + pop + '<br>' +
        '<hr style="margin:4px 0">' +
        'Contaminant: ' + contaminant + '<br>' +
        'Result: ' + result + '<br>' +
        'Above MRL: ' + (aboveMRL ? 'Yes' : 'No') + '<br>' +
        'Above health advisory: ' + aboveHBSL + '<br>' +
        'Sample date: ' + date
      );
      markerIndex[feature.id] = cm;
      clusterGroup.addLayer(cm);
    }
  }).addTo(map);

  featureLayer.on('removefeature', function (e) {
    var cm = markerIndex[e.id];
    if (cm) { clusterGroup.removeLayer(cm); delete markerIndex[e.id]; }
  });

  featureLayer.on('load', function () {
    var count = Object.keys(markerIndex).length;
    if (countEl) countEl.textContent = count.toLocaleString() + ' detection' + (count !== 1 ? 's' : '') + ' shown';
  });

  function applyFilter(state) {
    currentState = state;
    clusterGroup.clearLayers();
    markerIndex = {};
    featureLayer.setWhere(buildWhere(state));
    setHash(map, state);
  }

  map.on('moveend', function () { setHash(map, currentState); });

  // Build controls
  var container = document.getElementById('pfas-contamination-map-container');
  var ctrl = document.createElement('div');
  ctrl.id = 'pfas-contamination-map-controls';

  // State filter
  var stateLabel = document.createElement('span');
  stateLabel.className = 'pfas-label';
  stateLabel.textContent = 'State:';
  ctrl.appendChild(stateLabel);

  var stateSelect = document.createElement('select');
  stateSelect.className = 'pfas-select';
  var allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All States';
  stateSelect.appendChild(allOpt);
  US_STATES.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === currentState) opt.selected = true;
    stateSelect.appendChild(opt);
  });
  stateSelect.addEventListener('change', function () { applyFilter(this.value); });
  ctrl.appendChild(stateSelect);

  // Legend
  var legend = document.createElement('div');
  legend.className = 'pfas-legend';
  [
    { color: '#c0392b', label: 'Above min. reporting level' },
    { color: '#e67e22', label: 'Detected (below MRL)' }
  ].forEach(function (item) {
    var el = document.createElement('span');
    el.className = 'pfas-legend-item';
    el.innerHTML = '<span class="pfas-dot" style="background:' + item.color + '"></span>' + item.label;
    legend.appendChild(el);
  });
  ctrl.appendChild(legend);

  // Count
  countEl = document.createElement('span');
  countEl.className = 'pfas-count';
  countEl.textContent = 'Loading...';
  ctrl.appendChild(countEl);

  // Source
  var src = document.createElement('div');
  src.className = 'pfas-source';
  src.innerHTML = 'Source: <a href="https://echo.epa.gov/trends/pfas-tools" target="_blank" rel="noopener">EPA PFAS Analytic Tools</a> &mdash; UCMR 5 unregulated contaminant monitoring data';
  ctrl.appendChild(src);

  container.insertBefore(ctrl, container.firstChild);

  if (currentState !== 'all') {
    stateSelect.value = currentState;
  }
})();
