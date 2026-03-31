(function () {
  'use strict';

  var CONFIG = {
    mapId: 'us-wildfires-map',
    initialView: [38.5, -96.0],
    initialZoom: 4,
    serviceUrl: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer'
  };

  var state = {
    showPerimeters: true,
    measureMode: false
  };

  // Cache of loaded incident features, keyed by feature ID
  // Populated via createfeature / removefeature events (reliable esri-leaflet API)
  var incidentCache = {};

  function loadHashState() {
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

  function updateHash() {
    var center = map.getCenter();
    var parts = [
      'lat=' + center.lat.toFixed(5),
      'lng=' + center.lng.toFixed(5),
      'z=' + map.getZoom()
    ];
    if (!state.showPerimeters) parts.push('per=0');
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  var savedState = loadHashState();
  var initCenter = CONFIG.initialView;
  var initZoom = CONFIG.initialZoom;
  if (savedState) {
    if (savedState.lat && savedState.lng) {
      initCenter = [parseFloat(savedState.lat), parseFloat(savedState.lng)];
    }
    if (savedState.z) initZoom = parseInt(savedState.z, 10);
    if (savedState.per === '0') state.showPerimeters = false;
  }

  var map = L.map(CONFIG.mapId, {
    center: initCenter,
    zoom: initZoom
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  }).addTo(map);

  function getContainmentColor(pct) {
    if (pct === null || pct === undefined || pct === '') return '#95a5a6';
    pct = parseFloat(pct);
    if (isNaN(pct)) return '#95a5a6';
    if (pct >= 100) return '#27ae60';
    if (pct >= 50) return '#f1c40f';
    if (pct > 0) return '#e67e22';
    return '#e74c3c';
  }

  function buildPopupHtml(p) {
    var contained = (p.PercentContained !== null && p.PercentContained !== undefined)
      ? p.PercentContained + '%' : 'Unknown';
    var acres = p.DailyAcres
      ? Number(p.DailyAcres).toLocaleString() + ' ac'
      : (p.CalculatedAcres ? Number(p.CalculatedAcres).toLocaleString() + ' ac' : 'Unknown');
    var cause = p.FireCauseGeneral || p.FireCause || 'Unknown';
    var location = [p.POOCounty, p.POOState].filter(Boolean).join(', ') || 'Unknown';
    var personnel = p.TotalIncidentPersonnel ? Number(p.TotalIncidentPersonnel).toLocaleString() : '0';
    var structures = (p.ResidencesDestroyed || 0) + (p.OtherStructuresDestroyed || 0);
    var discovered = p.FireDiscoveryDateTime
      ? new Date(p.FireDiscoveryDateTime).toLocaleDateString() : 'Unknown';
    return '<div class="us-wildfires-popup">' +
      '<div class="uwp-title">' + (p.IncidentName || 'Unknown Incident') + '</div>' +
      '<table class="uwp-table">' +
      '<tr><th>Size</th><td>' + acres + '</td></tr>' +
      '<tr><th>Contained</th><td>' + contained + '</td></tr>' +
      '<tr><th>Cause</th><td>' + cause + '</td></tr>' +
      '<tr><th>Location</th><td>' + location + '</td></tr>' +
      '<tr><th>Discovered</th><td>' + discovered + '</td></tr>' +
      '<tr><th>Personnel</th><td>' + personnel + '</td></tr>' +
      '<tr><th>Structures</th><td>' + structures + '</td></tr>' +
      '</table></div>';
  }

  var perimeterStyle = {
    color: '#c0392b',
    weight: 2,
    fillColor: '#e74c3c',
    fillOpacity: 0.45,
    opacity: 1
  };

  var perimetersLayer = L.esri.featureLayer({
    url: CONFIG.serviceUrl + '/1',
    where: '1=1',
    onEachFeature: function (feature, layer) {
      if (layer.setStyle) layer.setStyle(perimeterStyle);
    }
  });

  if (state.showPerimeters) perimetersLayer.addTo(map);

  var incidentsLayer = L.esri.featureLayer({
    url: CONFIG.serviceUrl + '/0',
    where: '1=1',
    pointToLayer: function (feature, latlng) {
      var pct = feature.properties.PercentContained;
      var acres = feature.properties.DailyAcres || feature.properties.CalculatedAcres || 0;
      var radius = Math.max(5, Math.min(20, 5 + Math.sqrt(acres) / 30));
      return L.circleMarker(latlng, {
        radius: radius,
        fillColor: getContainmentColor(pct),
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.9
      });
    }
  });

  // Build feature cache as esri-leaflet loads/unloads features
  incidentsLayer.on('createfeature', function (e) {
    var coords = e.feature.geometry && e.feature.geometry.coordinates;
    if (coords) {
      incidentCache[e.feature.id] = {
        latlng: L.latLng(coords[1], coords[0]),
        properties: e.feature.properties
      };
    }
  });

  incidentsLayer.on('removefeature', function (e) {
    delete incidentCache[e.feature.id];
  });

  incidentsLayer.addTo(map);

  // Handle clicks: popup in normal mode, measure in measure mode
  incidentsLayer.on('click', function (e) {
    if (state.measureMode) {
      runMeasure(e.latlng);
      return;
    }
    L.popup()
      .setLatLng(e.latlng)
      .setContent(buildPopupHtml(e.layer.feature.properties))
      .openOn(map);
  });

  // --- Controls ---

  var controlsEl = document.getElementById('us-wildfires-controls');

  var perimeterToggle = document.createElement('label');
  perimeterToggle.className = 'uwf-toggle-label';
  var perimeterCheck = document.createElement('input');
  perimeterCheck.type = 'checkbox';
  perimeterCheck.id = 'uwf-perimeter-toggle';
  perimeterCheck.checked = state.showPerimeters;
  perimeterToggle.appendChild(perimeterCheck);
  perimeterToggle.appendChild(document.createTextNode(' Show Perimeters'));

  var measureBtn = document.createElement('button');
  measureBtn.id = 'uwf-measure-btn';
  measureBtn.textContent = 'Measure Distance';
  measureBtn.setAttribute('aria-pressed', 'false');

  var perimeterGroup = document.createElement('div');
  perimeterGroup.className = 'uwf-filter-group';
  perimeterGroup.appendChild(perimeterToggle);

  var measureGroup = document.createElement('div');
  measureGroup.className = 'uwf-filter-group';
  measureGroup.appendChild(measureBtn);

  controlsEl.appendChild(perimeterGroup);
  controlsEl.appendChild(measureGroup);

  // --- Legend ---

  var legend = document.createElement('div');
  legend.id = 'uwf-legend';
  legend.innerHTML =
    '<strong>Containment</strong>' +
    '<div><span class="uwf-dot" style="background:#e74c3c"></span>0% (active)</div>' +
    '<div><span class="uwf-dot" style="background:#e67e22"></span>1-49%</div>' +
    '<div><span class="uwf-dot" style="background:#f1c40f"></span>50-99%</div>' +
    '<div><span class="uwf-dot" style="background:#27ae60"></span>100% (out)</div>' +
    '<div><span class="uwf-dot" style="background:#95a5a6"></span>Unknown</div>';
  document.getElementById('us-wildfires-container').appendChild(legend);

  // --- Measure panel ---

  var measurePanel = document.createElement('div');
  measurePanel.id = 'uwf-measure-panel';
  measurePanel.style.display = 'none';
  document.getElementById('us-wildfires-container').appendChild(measurePanel);

  var measureLayerGroup = L.layerGroup().addTo(map);

  // --- Measure ---

  function runMeasure(latlng) {
    measureLayerGroup.clearLayers();

    var clickPt = turf.point([latlng.lng, latlng.lat]);
    var ids = Object.keys(incidentCache);

    if (ids.length === 0) {
      measurePanel.innerHTML =
        '<div class="uwf-mpanel-title">No fires loaded</div>' +
        '<div class="uwf-mnote">Pan or zoom to an area with active fires, then try again.</div>';
      measurePanel.style.display = 'block';

      // Still drop the click marker so user knows the click registered
      L.circleMarker(latlng, {
        radius: 7, fillColor: '#2980b9', color: '#fff', weight: 2, fillOpacity: 1
      }).addTo(measureLayerGroup);
      return;
    }

    // Click marker
    L.circleMarker(latlng, {
      radius: 7, fillColor: '#2980b9', color: '#fff', weight: 2, fillOpacity: 1, zIndexOffset: 500
    }).addTo(measureLayerGroup);

    // Find nearest incident in cache
    var nearest = null;
    var nearestDist = Infinity;
    ids.forEach(function (id) {
      var entry = incidentCache[id];
      var firePt = turf.point([entry.latlng.lng, entry.latlng.lat]);
      var d = turf.distance(clickPt, firePt, { units: 'miles' });
      if (d < nearestDist) {
        nearestDist = d;
        nearest = entry;
      }
    });

    if (nearest) {
      // Draw line to nearest incident
      L.polyline(
        [[latlng.lat, latlng.lng], [nearest.latlng.lat, nearest.latlng.lng]],
        { color: '#e74c3c', weight: 2, dashArray: '6 5', opacity: 0.9 }
      ).addTo(measureLayerGroup);

      var name = nearest.properties.IncidentName || 'Unknown Fire';
      var km = (nearestDist * 1.60934).toFixed(1);

      measurePanel.innerHTML =
        '<div class="uwf-mpanel-title">Nearest fire incident</div>' +
        '<div class="uwf-mline">' +
        '<span class="uwf-mbadge uwf-mbadge-incident">Incident</span>' +
        '<strong>' + name + '</strong>' +
        '</div>' +
        '<div class="uwf-mline">' +
        nearestDist.toFixed(1) + ' mi &nbsp;/&nbsp; ' + km + ' km (straight line)' +
        '</div>' +
        '<div class="uwf-mnote">Based on ' + ids.length + ' fire(s) currently loaded in map view.</div>';
      measurePanel.style.display = 'block';
    }
  }

  // --- Event handlers ---

  perimeterCheck.addEventListener('change', function () {
    state.showPerimeters = this.checked;
    if (state.showPerimeters) {
      perimetersLayer.addTo(map);
    } else {
      map.removeLayer(perimetersLayer);
    }
    updateHash();
  });

  measureBtn.addEventListener('click', function () {
    state.measureMode = !state.measureMode;
    measureBtn.classList.toggle('uwf-measure-active', state.measureMode);
    measureBtn.setAttribute('aria-pressed', String(state.measureMode));
    measureBtn.textContent = state.measureMode ? 'Cancel Measure' : 'Measure Distance';
    document.getElementById(CONFIG.mapId).style.cursor = state.measureMode ? 'crosshair' : '';
    if (!state.measureMode) {
      measureLayerGroup.clearLayers();
      measurePanel.style.display = 'none';
    }
  });

  map.on('click', function (e) {
    if (!state.measureMode) return;
    runMeasure(e.latlng);
  });

  map.on('moveend', updateHash);

})();
