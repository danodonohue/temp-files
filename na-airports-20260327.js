(function () {
  'use strict';

  var SERVICE_URL = 'https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/NA_Airports_2011/FeatureServer/0';

  var TYPE_COLORS = {
    'International':                          '#1d4ed8',
    'National':                               '#16a34a',
    'National - Military / Civilian':         '#0d9488',
    'Regional / Local':                       '#d97706',
    'Regional / Local - Military / Civilian': '#b45309',
    'Military':                               '#dc2626',
    'Military / Civilian':                    '#c2410c',
    'Small':                                  '#7c3aed',
    'Other':                                  '#6b7280',
    'Closed':                                 '#374151',
    'Unknown':                                '#9ca3af'
  };

  var ALL_TYPES = [
    'International', 'National', 'National - Military / Civilian',
    'Regional / Local', 'Regional / Local - Military / Civilian',
    'Military', 'Military / Civilian', 'Small', 'Other', 'Closed', 'Unknown'
  ];

  var CONFIG = {
    mapId: 'na-airports-map',
    initialView: [53, -95],
    initialZoom: 4
  };

  var allFeatures = [];
  var clusterGroup = null;
  var map = null;

  function getColor(type) {
    return TYPE_COLORS[type] || '#9ca3af';
  }

  function createMarker(feature) {
    var p = feature.properties;
    var coords = feature.geometry.coordinates;
    var latlng = L.latLng(coords[1], coords[0]);

    var marker = L.circleMarker(latlng, {
      radius: 6,
      fillColor: getColor(p.TYPE),
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.88
    });

    var name = p.NAME || 'Unknown Airport';
    var location = [p.CITY, p.STATE, p.COUNTRY].filter(Boolean).join(', ');
    var codes = [
      p.IATA ? 'IATA: ' + p.IATA : '',
      p.ICAO ? 'ICAO: ' + p.ICAO : ''
    ].filter(Boolean).join(' | ');
    var elev = (p.ELEVATION !== null && p.ELEVATION !== undefined) ? p.ELEVATION + ' m' : '';

    var html = '<div class="na-airports-popup">' +
      '<div class="nap-name">' + name + '</div>' +
      (location ? '<div class="nap-loc">' + location + '</div>' : '') +
      '<div class="nap-type">' + (p.TYPE || 'Unknown') + '</div>' +
      (codes ? '<div class="nap-codes">' + codes + '</div>' : '') +
      (elev ? '<div class="nap-elev">Elevation: ' + elev + '</div>' : '') +
      '</div>';

    marker.bindPopup(html, { maxWidth: 220 });
    return marker;
  }

  function applyFilters() {
    var country = document.getElementById('na-airports-country').value;
    var type = document.getElementById('na-airports-type').value;

    clusterGroup.clearLayers();

    var markers = [];
    allFeatures.forEach(function (f) {
      var p = f.properties;
      if (country && p.COUNTRY !== country) return;
      if (type && p.TYPE !== type) return;
      markers.push(createMarker(f));
    });

    clusterGroup.addLayers(markers);
    document.getElementById('na-airports-count').textContent =
      markers.length.toLocaleString() + ' airports shown';
    updateShareUrl();
  }

  function updateShareUrl() {
    var center = map.getCenter();
    var country = document.getElementById('na-airports-country').value;
    var type = document.getElementById('na-airports-type').value;
    var parts = [
      'lat=' + center.lat.toFixed(4),
      'lng=' + center.lng.toFixed(4),
      'z=' + map.getZoom()
    ];
    if (country) parts.push('country=' + encodeURIComponent(country));
    if (type) parts.push('type=' + encodeURIComponent(type));
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return {};
    var out = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

  function fetchPage(offset, accumulated, callback) {
    var params = new URLSearchParams({
      where: "COUNTRY <> 'FRANCE'",
      outFields: 'NAME,ICAO,IATA,TYPE,COUNTRY,STATE,CITY,ELEVATION',
      f: 'geojson',
      outSR: '4326',
      resultOffset: offset,
      resultRecordCount: 1000
    });

    fetch(SERVICE_URL + '/query?' + params)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var features = data.features || [];
        var combined = accumulated.concat(features);
        if (features.length === 1000) {
          fetchPage(offset + 1000, combined, callback);
        } else {
          callback(null, combined);
        }
      })
      .catch(function (err) { callback(err); });
  }

  function buildLegend() {
    var el = document.getElementById('na-airports-legend');
    if (!el) return;
    ALL_TYPES.forEach(function (type) {
      var item = document.createElement('div');
      item.className = 'nap-legend-item';
      item.innerHTML =
        '<span class="nap-legend-dot" style="background:' + TYPE_COLORS[type] + '"></span>' + type;
      el.appendChild(item);
    });
  }

  function populateCountryFilter() {
    var countries = {};
    allFeatures.forEach(function (f) {
      var c = f.properties.COUNTRY;
      if (c) countries[c] = true;
    });
    var sel = document.getElementById('na-airports-country');
    Object.keys(countries).sort().forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  function init() {
    var state = loadStateFromUrl();
    var lat = parseFloat(state.lat) || CONFIG.initialView[0];
    var lng = parseFloat(state.lng) || CONFIG.initialView[1];
    var zoom = parseInt(state.z, 10) || CONFIG.initialZoom;

    map = L.map(CONFIG.mapId, { center: [lat, lng], zoom: zoom });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 40 });
    map.addLayer(clusterGroup);

    document.getElementById('na-airports-country').addEventListener('change', applyFilters);
    document.getElementById('na-airports-type').addEventListener('change', applyFilters);
    map.on('moveend', updateShareUrl);

    document.getElementById('na-airports-count').textContent = 'Loading...';

    fetchPage(0, [], function (err, features) {
      if (err) {
        document.getElementById('na-airports-count').textContent = 'Error loading data.';
        console.error(err);
        return;
      }
      allFeatures = features;
      populateCountryFilter();
      buildLegend();

      if (state.country) document.getElementById('na-airports-country').value = state.country;
      if (state.type) document.getElementById('na-airports-type').value = state.type;

      applyFilters();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
