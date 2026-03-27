(function () {
  'use strict';

  var SERVICE_URL = 'https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/NA_Blue_Carbon_Mangrove/FeatureServer/6';

  var CONFIG = {
    mapId: 'na-mangroves-map',
    initialView: [23, -90],
    initialZoom: 5
  };

  var featureLayer = null;
  var map = null;

  function formatArea(sqm) {
    if (!sqm || sqm <= 0) return null;
    var ha = sqm / 10000;
    if (ha >= 100) return (ha / 100).toFixed(1) + ' sq km';
    return ha.toFixed(2) + ' ha';
  }

  function buildPopup(p) {
    var parts = [p.NAME, p.STATEABB, p.COUNTRY].filter(Boolean);
    var location = parts.join(', ');
    var area = formatArea(p.AREA_SQMT);
    var html = '<div class="na-mangroves-popup">';
    if (location) html += '<div class="nam-location">' + location + '</div>';
    if (p.SOURCE_DES) html += '<div class="nam-source">' + p.SOURCE_DES + '</div>';
    if (area) html += '<div class="nam-area">Area: ' + area + '</div>';
    if (p.YEAR_PUB) html += '<div class="nam-meta">Published: ' + p.YEAR_PUB + '</div>';
    if (p.RESP_PARTY) html += '<div class="nam-meta">Source: ' + p.RESP_PARTY + '</div>';
    html += '</div>';
    return html;
  }

  function getWhere() {
    var country = document.getElementById('na-mangroves-country').value;
    return country ? "COUNTRY = '" + country + "'" : '1=1';
  }

  function applyFilter() {
    featureLayer.setWhere(getWhere());
    updateShareUrl();
  }

  function updateShareUrl() {
    var center = map.getCenter();
    var country = document.getElementById('na-mangroves-country').value;
    var parts = [
      'lat=' + center.lat.toFixed(4),
      'lng=' + center.lng.toFixed(4),
      'z=' + map.getZoom()
    ];
    if (country) parts.push('country=' + encodeURIComponent(country));
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

  function init() {
    var state = loadStateFromUrl();
    var lat = parseFloat(state.lat) || CONFIG.initialView[0];
    var lng = parseFloat(state.lng) || CONFIG.initialView[1];
    var zoom = parseInt(state.z, 10) || CONFIG.initialZoom;

    if (state.country) {
      document.getElementById('na-mangroves-country').value = state.country;
    }

    map = L.map(CONFIG.mapId, { center: [lat, lng], zoom: zoom });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    featureLayer = L.esri.featureLayer({
      url: SERVICE_URL,
      where: getWhere(),
      style: function () {
        return {
          color: '#065f46',
          weight: 0.8,
          fillColor: '#10b981',
          fillOpacity: 0.65
        };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature.properties), { maxWidth: 260 });
      }
    });

    featureLayer.addTo(map);

    featureLayer.on('loading', function () {
      document.getElementById('na-mangroves-status').textContent = 'Loading...';
    });

    featureLayer.on('load', function () {
      document.getElementById('na-mangroves-status').textContent = '';
    });

    document.getElementById('na-mangroves-country').addEventListener('change', applyFilter);
    map.on('moveend', updateShareUrl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
