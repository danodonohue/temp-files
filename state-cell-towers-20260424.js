(function () {
  'use strict';

  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Cellular_Towers_in_the_United_States_view/FeatureServer/0';

  var STATE_CENTERS = {
    AL: { lat: 32.806671, lng: -86.791130, zoom: 7 },
    AK: { lat: 61.370716, lng: -152.404419, zoom: 5 },
    AZ: { lat: 33.729759, lng: -111.431221, zoom: 7 },
    AR: { lat: 34.969704, lng: -92.373123, zoom: 7 },
    CA: { lat: 36.116203, lng: -119.681564, zoom: 6 },
    CO: { lat: 39.059811, lng: -105.311104, zoom: 7 },
    CT: { lat: 41.597782, lng: -72.755371, zoom: 9 },
    DE: { lat: 39.318523, lng: -75.507141, zoom: 9 },
    FL: { lat: 27.766279, lng: -81.686783, zoom: 7 },
    GA: { lat: 33.040619, lng: -83.643074, zoom: 7 },
    HI: { lat: 21.094318, lng: -157.498337, zoom: 7 },
    ID: { lat: 44.240459, lng: -114.478828, zoom: 7 },
    IL: { lat: 40.349457, lng: -88.986137, zoom: 7 },
    IN: { lat: 39.849426, lng: -86.258278, zoom: 7 },
    IA: { lat: 42.011539, lng: -93.210526, zoom: 7 },
    KS: { lat: 38.526600, lng: -96.726486, zoom: 7 },
    KY: { lat: 37.668140, lng: -84.670067, zoom: 7 },
    LA: { lat: 31.169960, lng: -91.867805, zoom: 7 },
    ME: { lat: 44.693947, lng: -69.381927, zoom: 7 },
    MD: { lat: 39.063946, lng: -76.802101, zoom: 8 },
    MA: { lat: 42.230171, lng: -71.530106, zoom: 8 },
    MI: { lat: 43.326618, lng: -84.536095, zoom: 7 },
    MN: { lat: 45.694454, lng: -93.900192, zoom: 7 },
    MS: { lat: 32.741646, lng: -89.678696, zoom: 7 },
    MO: { lat: 38.456085, lng: -92.288368, zoom: 7 },
    MT: { lat: 46.921925, lng: -110.454353, zoom: 7 },
    NE: { lat: 41.125370, lng: -98.268082, zoom: 7 },
    NV: { lat: 38.313515, lng: -117.055374, zoom: 7 },
    NH: { lat: 43.452492, lng: -71.563896, zoom: 8 },
    NJ: { lat: 40.298904, lng: -74.521011, zoom: 8 },
    NM: { lat: 34.840515, lng: -106.248482, zoom: 7 },
    NY: { lat: 42.165726, lng: -74.948051, zoom: 7 },
    NC: { lat: 35.630066, lng: -79.806419, zoom: 7 },
    ND: { lat: 47.528912, lng: -99.784012, zoom: 7 },
    OH: { lat: 40.388783, lng: -82.764915, zoom: 7 },
    OK: { lat: 35.565342, lng: -96.928917, zoom: 7 },
    OR: { lat: 44.572021, lng: -122.070938, zoom: 7 },
    PA: { lat: 40.590752, lng: -77.209755, zoom: 7 },
    RI: { lat: 41.680893, lng: -71.511780, zoom: 10 },
    SC: { lat: 33.856892, lng: -80.945007, zoom: 8 },
    SD: { lat: 44.299782, lng: -99.438828, zoom: 7 },
    TN: { lat: 35.747845, lng: -86.692345, zoom: 7 },
    TX: { lat: 31.054487, lng: -97.563461, zoom: 6 },
    UT: { lat: 40.150032, lng: -111.862434, zoom: 7 },
    VT: { lat: 44.045876, lng: -72.710686, zoom: 8 },
    VA: { lat: 37.769337, lng: -78.169968, zoom: 7 },
    WA: { lat: 47.400902, lng: -121.490494, zoom: 7 },
    WV: { lat: 38.491226, lng: -80.954453, zoom: 7 },
    WI: { lat: 44.268543, lng: -89.616508, zoom: 7 },
    WY: { lat: 42.755966, lng: -107.302490, zoom: 7 },
    DC: { lat: 38.897438, lng: -77.026817, zoom: 12 }
  };

  var container = document.getElementById('state-cell-towers-container');
  if (!container) return;

  var stateAbbr = (container.getAttribute('data-state') || 'TX').toUpperCase();
  var stateName = container.getAttribute('data-state-name') || stateAbbr;
  var center = STATE_CENTERS[stateAbbr] || { lat: 37.8, lng: -96, zoom: 4 };

  var hashParams = {};
  if (window.location.hash) {
    window.location.hash.slice(1).split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx > 0) hashParams[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
  }
  var initLat = hashParams.lat ? parseFloat(hashParams.lat) : center.lat;
  var initLng = hashParams.lng ? parseFloat(hashParams.lng) : center.lng;
  var initZoom = hashParams.z ? parseInt(hashParams.z, 10) : center.zoom;

  container.innerHTML =
    '<div id="sct-stats-strip">' +
      '<div class="sct-stat-box"><span class="sct-stat-value" id="sct-total-count">--</span><span class="sct-stat-label">Cell Towers</span></div>' +
      '<div class="sct-stat-box"><span class="sct-stat-value sct-stat-sm" id="sct-top-carrier">--</span><span class="sct-stat-label">Top Carrier</span></div>' +
      '<div class="sct-stat-box"><span class="sct-stat-value" id="sct-county-count">--</span><span class="sct-stat-label">Counties</span></div>' +
    '</div>' +
    '<div id="sct-controls">' +
      '<div id="sct-carrier-section">' +
        '<span class="sct-ctrl-label">Filter by carrier</span>' +
        '<div id="sct-carrier-filters"><span class="sct-loading">Loading...</span></div>' +
      '</div>' +
      '<div id="sct-geo-section">' +
        '<button id="sct-geolocate" class="sct-geo-btn">Find Towers Near Me</button>' +
        '<label class="sct-radius-label">within <input type="number" id="sct-radius-input" value="10" min="1" max="100" step="1"> miles</label>' +
      '</div>' +
    '</div>' +
    '<div id="state-cell-towers-map"></div>';

  var map = L.map('state-cell-towers-map', {
    center: [initLat, initLng],
    zoom: initZoom,
    preferCanvas: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  var activeCarriers = null;
  var allCarriers = [];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildWhere() {
    var base = "LocState = '" + stateAbbr + "'";
    if (!activeCarriers || activeCarriers.length === allCarriers.length) return base;
    if (activeCarriers.length === 0) return base + ' AND 1=0';
    var parts = activeCarriers.map(function (c) {
      return "Licensee = '" + c.replace(/'/g, "''") + "'";
    });
    return base + ' AND (' + parts.join(' OR ') + ')';
  }

  var towerLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    where: buildWhere(),
    fields: ['OBJECTID', 'Licensee', 'Callsign', 'LocCity', 'LocCounty', 'StrucType', 'LicStatus', 'TowReg'],
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 5,
        fillColor: '#e74c3c',
        color: '#a93226',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.75
      });
    },
    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      var lines = [];
      if (p.Licensee) lines.push('<strong>' + esc(p.Licensee) + '</strong>');
      if (p.LocCity || p.LocCounty) lines.push(esc([p.LocCity, p.LocCounty].filter(Boolean).join(', ')));
      if (p.StrucType) lines.push('Type: ' + esc(p.StrucType));
      if (p.TowReg) lines.push('Height: ' + esc(p.TowReg) + ' ft');
      if (p.LicStatus) lines.push('Status: ' + esc(p.LicStatus));
      if (p.Callsign) lines.push('Call sign: ' + esc(p.Callsign));
      layer.bindPopup('<div class="sct-popup">' + lines.join('<br>') + '</div>');
    }
  }).addTo(map);

  function fetchJson(url, cb) {
    fetch(url).then(function (r) { return r.json(); }).then(cb).catch(function () {});
  }

  function loadStats() {
    var w = encodeURIComponent("LocState='" + stateAbbr + "'");
    fetchJson(SERVICE_URL + '/query?where=' + w + '&returnCountOnly=true&f=json', function (d) {
      var el = document.getElementById('sct-total-count');
      if (el) el.textContent = (d.count || 0).toLocaleString();
    });
    fetchJson(
      SERVICE_URL + '/query?where=' + w +
      '&outStatistics=' + encodeURIComponent('[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"cnt"}]') +
      '&groupByFieldsForStatistics=Licensee&orderByFields=cnt%20DESC&resultRecordCount=15&f=json',
      function (d) {
        allCarriers = (d.features || [])
          .map(function (f) { return { name: f.attributes.Licensee, count: f.attributes.cnt }; })
          .filter(function (c) { return c.name; });
        buildCarrierFilters(allCarriers);
        var el = document.getElementById('sct-top-carrier');
        if (el && allCarriers.length) el.textContent = allCarriers[0].name;
      }
    );
    fetchJson(
      SERVICE_URL + '/query?where=' + w +
      '&outStatistics=' + encodeURIComponent('[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"cnt"}]') +
      '&groupByFieldsForStatistics=LocCounty&f=json',
      function (d) {
        var el = document.getElementById('sct-county-count');
        if (el) el.textContent = (d.features || []).length;
      }
    );
  }

  function buildCarrierFilters(carriers) {
    var wrap = document.getElementById('sct-carrier-filters');
    if (!wrap) return;
    wrap.innerHTML = '';

    var allBtn = document.createElement('button');
    allBtn.className = 'sct-chip sct-chip-on';
    allBtn.textContent = 'All carriers';
    allBtn.addEventListener('click', function () {
      activeCarriers = null;
      wrap.querySelectorAll('.sct-chip').forEach(function (c) { c.classList.remove('sct-chip-on'); });
      allBtn.classList.add('sct-chip-on');
      towerLayer.setWhere(buildWhere());
    });
    wrap.appendChild(allBtn);

    carriers.forEach(function (carrier) {
      var btn = document.createElement('button');
      btn.className = 'sct-chip';
      btn.textContent = carrier.name + ' (' + carrier.count.toLocaleString() + ')';
      btn.dataset.carrier = carrier.name;
      btn.addEventListener('click', function () {
        if (activeCarriers === null) {
          activeCarriers = [carrier.name];
        } else {
          var idx = activeCarriers.indexOf(carrier.name);
          if (idx >= 0) activeCarriers.splice(idx, 1);
          else activeCarriers.push(carrier.name);
          if (activeCarriers.length === carriers.length) activeCarriers = null;
        }
        allBtn.classList.toggle('sct-chip-on', activeCarriers === null);
        wrap.querySelectorAll('.sct-chip[data-carrier]').forEach(function (c) {
          c.classList.toggle('sct-chip-on', activeCarriers === null || activeCarriers.indexOf(c.dataset.carrier) >= 0);
        });
        towerLayer.setWhere(buildWhere());
      });
      wrap.appendChild(btn);
    });
  }

  var geoMarker = null;
  var radiusCircle = null;

  function placeGeoPin(lat, lng) {
    if (geoMarker) map.removeLayer(geoMarker);
    if (radiusCircle) map.removeLayer(radiusCircle);
    var miles = parseFloat((document.getElementById('sct-radius-input') || {}).value) || 10;
    geoMarker = L.circleMarker([lat, lng], {
      radius: 8, fillColor: '#2980b9', color: '#1a5276', weight: 2, fillOpacity: 0.9
    }).addTo(map).bindPopup('Your location').openPopup();
    radiusCircle = L.circle([lat, lng], {
      radius: miles * 1609.34, color: '#2980b9', fillOpacity: 0.08, weight: 2, dashArray: '6 4'
    }).addTo(map);
    map.setView([lat, lng], 11);
  }

  var geoBtn = document.getElementById('sct-geolocate');
  if (geoBtn) {
    geoBtn.addEventListener('click', function () {
      if (!navigator.geolocation) { alert('Geolocation not supported by your browser.'); return; }
      geoBtn.textContent = 'Locating...';
      geoBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          placeGeoPin(pos.coords.latitude, pos.coords.longitude);
          geoBtn.textContent = 'Update Location';
          geoBtn.disabled = false;
        },
        function () {
          alert('Could not get your location. Check browser permissions.');
          geoBtn.textContent = 'Find Towers Near Me';
          geoBtn.disabled = false;
        }
      );
    });
  }

  var radiusInput = document.getElementById('sct-radius-input');
  if (radiusInput) {
    radiusInput.addEventListener('change', function () {
      if (geoMarker) { var ll = geoMarker.getLatLng(); placeGeoPin(ll.lat, ll.lng); }
    });
  }

  map.on('moveend zoomend', function () {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  });

  loadStats();
}());
