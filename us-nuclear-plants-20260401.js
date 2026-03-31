(function () {
  'use strict';

  var SLUG = 'us-nuclear-plants';
  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0';
  var BASE_WHERE = "PrimSource = 'nuclear'";

  var CONFIG = {
    mapId: SLUG + '-map',
    initialView: [38.5, -96.5],
    initialZoom: 4
  };

  // --- URL share state ---
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

  function updateShareUrl(map, stateVal) {
    var center = map.getCenter();
    var params = {
      lat: center.lat.toFixed(5),
      lng: center.lng.toFixed(5),
      z: map.getZoom()
    };
    if (stateVal) params.state = stateVal;
    var hash = '#' + Object.keys(params)
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    history.replaceState(null, '', hash);
  }

  var savedState = loadStateFromUrl();
  var initialView = CONFIG.initialView;
  var initialZoom = CONFIG.initialZoom;
  if (savedState && savedState.lat && savedState.lng && savedState.z) {
    initialView = [parseFloat(savedState.lat), parseFloat(savedState.lng)];
    initialZoom = parseInt(savedState.z, 10);
  }
  var currentState = (savedState && savedState.state) ? savedState.state : '';

  // --- Map ---
  var map = L.map(CONFIG.mapId, {
    center: initialView,
    zoom: initialZoom
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // --- Feature layer ---
  function makeWhere(stateVal) {
    if (stateVal && stateVal !== '') {
      return BASE_WHERE + " AND State = '" + stateVal.replace(/'/g, "''") + "'";
    }
    return BASE_WHERE;
  }

  function markerRadius(nucMW) {
    if (nucMW > 3000) return 12;
    if (nucMW > 2000) return 10;
    if (nucMW > 1000) return 8;
    return 6;
  }

  var featureLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: makeWhere(currentState),
    pointToLayer: function (feature, latlng) {
      var mw = feature.properties.Nuclear_MW || 0;
      return L.circleMarker(latlng, {
        radius: markerRadius(mw),
        fillColor: '#FFD700',
        color: '#E07B00',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85
      });
    },
    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      var name = p.Plant_Name || 'Unknown Plant';
      var operator = p.Utility_Na || 'N/A';
      var city = p.City || '';
      var state = p.State || '';
      var county = p.County ? p.County + ' County' : '';
      var location = [city, county, state].filter(Boolean).join(', ');
      var nucMW = p.Nuclear_MW ? Number(p.Nuclear_MW).toLocaleString() + ' MW' : 'N/A';
      var totalMW = p.Total_MW ? Number(p.Total_MW).toLocaleString() + ' MW' : 'N/A';
      layer.bindPopup(
        '<div class="unp-popup">' +
          '<h3>' + name + '</h3>' +
          '<table>' +
            '<tr><th>Operator</th><td>' + operator + '</td></tr>' +
            '<tr><th>Location</th><td>' + location + '</td></tr>' +
            '<tr><th>Nuclear capacity</th><td>' + nucMW + '</td></tr>' +
            '<tr><th>Total capacity</th><td>' + totalMW + '</td></tr>' +
          '</table>' +
        '</div>',
        { maxWidth: 280 }
      );
    }
  }).addTo(map);

  // --- State dropdown ---
  var stateSelect = document.getElementById(SLUG + '-state-select');
  var countEl = document.getElementById(SLUG + '-count');
  var shouldFitBounds = false;

  var statesQueryUrl = SERVICE_URL + '/query?' +
    'where=' + encodeURIComponent(BASE_WHERE) +
    '&outFields=State&returnDistinctValues=true&orderByFields=State&f=json';

  fetch(statesQueryUrl)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.features) return;
      data.features
        .map(function (f) { return f.attributes.State; })
        .filter(Boolean)
        .sort()
        .forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          if (s === currentState) opt.selected = true;
          stateSelect.appendChild(opt);
        });
    })
    .catch(function () {});

  stateSelect.addEventListener('change', function () {
    currentState = this.value;
    shouldFitBounds = (currentState !== '');
    featureLayer.setWhere(makeWhere(currentState));
    updateShareUrl(map, currentState);
  });

  featureLayer.on('load', function () {
    var count = 0;
    var bounds = L.latLngBounds();
    featureLayer.eachFeature(function (layer) {
      count++;
      if (layer.getLatLng) bounds.extend(layer.getLatLng());
    });
    if (countEl) {
      countEl.textContent = count + ' plant' + (count !== 1 ? 's' : '') + ' shown';
    }
    if (shouldFitBounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 8 });
      shouldFitBounds = false;
    }
  });

  map.on('moveend', function () {
    updateShareUrl(map, currentState);
  });

  // --- Measure: distance to nearest reactor ---
  var measureBtn = document.getElementById(SLUG + '-measure-btn');
  var measureInfo = document.getElementById(SLUG + '-measure-info');
  var measureLayers = [];
  var measureMode = false;

  function clearMeasure() {
    measureLayers.forEach(function (l) { map.removeLayer(l); });
    measureLayers = [];
    if (measureInfo) measureInfo.innerHTML = '';
  }

  function exitMeasureMode() {
    measureMode = false;
    if (measureBtn) {
      measureBtn.textContent = 'Measure distance to reactor';
      measureBtn.classList.remove('unp-measure-active');
    }
    map.getContainer().style.cursor = '';
  }

  if (measureBtn) {
    measureBtn.addEventListener('click', function () {
      if (measureMode) {
        clearMeasure();
        exitMeasureMode();
      } else {
        measureMode = true;
        clearMeasure();
        measureBtn.textContent = 'Cancel measure';
        measureBtn.classList.add('unp-measure-active');
        map.getContainer().style.cursor = 'crosshair';
        if (measureInfo) measureInfo.innerHTML = '<em>Click anywhere on the map&hellip;</em>';
      }
    });
  }

  map.on('click', function (e) {
    if (!measureMode) return;

    clearMeasure();

    // Collect visible reactor points
    var turfPoints = [];
    featureLayer.eachFeature(function (layer) {
      if (!layer.getLatLng) return;
      var ll = layer.getLatLng();
      var props = (layer.feature && layer.feature.properties) ? layer.feature.properties : {};
      turfPoints.push(turf.point([ll.lng, ll.lat], props));
    });

    if (turfPoints.length === 0) {
      if (measureInfo) measureInfo.textContent = 'No reactors currently visible.';
      exitMeasureMode();
      return;
    }

    var clickPoint = turf.point([e.latlng.lng, e.latlng.lat]);
    var nearest = turf.nearestPoint(clickPoint, turf.featureCollection(turfPoints));
    var distKm = turf.distance(clickPoint, nearest, { units: 'kilometers' });
    var distMi = distKm * 0.621371;

    var nearestLatLng = L.latLng(
      nearest.geometry.coordinates[1],
      nearest.geometry.coordinates[0]
    );

    // Click marker
    var clickMarker = L.circleMarker(e.latlng, {
      radius: 6,
      fillColor: '#2196F3',
      color: '#0d6efd',
      weight: 2,
      fillOpacity: 0.95,
      interactive: false
    }).addTo(map);
    measureLayers.push(clickMarker);

    // Dashed line to nearest reactor
    var line = L.polyline([e.latlng, nearestLatLng], {
      color: '#2196F3',
      weight: 2,
      dashArray: '8 5',
      opacity: 0.85,
      interactive: false
    }).addTo(map);
    measureLayers.push(line);

    // Result label
    var plantName = nearest.properties.Plant_Name || 'nearest reactor';
    if (measureInfo) {
      measureInfo.innerHTML =
        'Nearest reactor: <strong>' + plantName + '</strong> &mdash; ' +
        '<strong>' + distMi.toFixed(1) + ' mi</strong> (' + distKm.toFixed(1) + ' km)' +
        ' &nbsp;<button class="unp-clear-btn" id="' + SLUG + '-clear-measure">Clear</button>';

      var clearBtn = document.getElementById(SLUG + '-clear-measure');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          clearMeasure();
          exitMeasureMode();
        });
      }
    }

    exitMeasureMode();
  });

})();
