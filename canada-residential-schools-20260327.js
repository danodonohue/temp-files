(function () {
  'use strict';

  var SERVICE_URL = 'https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/NCTR_schools/FeatureServer/0';
  var NCTR_URL = 'https://nctr.ca/map.php';

  var map;
  var markers = [];
  var searchTimeout;

  function makeIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="crs-dot"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  }

  function buildPopup(a) {
    var name = a.Name_1 || 'Unknown';
    var alt = (a.Name_2 && a.Name_2 !== a.Name_1) ? a.Name_2 : null;
    var location = a.placeName || '-';
    var years = (a.start && a.end_)
      ? a.start + '\u2013' + a.end_
      : (a.start ? a.start + '\u2013?' : '-');

    var html = '<div class="crs-popup"><strong>' + name + '</strong>';
    if (alt) html += '<div class="crs-alt">' + alt + '</div>';
    html += '<table>';
    html += '<tr><th>Location</th><td>' + location + '</td></tr>';
    html += '<tr><th>Years operating</th><td>' + years + '</td></tr>';
    if (a.id) html += '<tr><th>NCTR ID</th><td>' + a.id + '</td></tr>';
    html += '</table>';
    html += '<a class="crs-link" href="' + NCTR_URL + '" target="_blank" rel="noopener noreferrer">' +
      'National Centre for Truth and Reconciliation &rarr;</a>';
    html += '</div>';
    return html;
  }

  function applySearch(query) {
    var q = query.trim().toLowerCase();
    var shown = 0;
    markers.forEach(function (entry) {
      var a = entry.attrs;
      var match = !q ||
        (a.Name_1 && a.Name_1.toLowerCase().indexOf(q) >= 0) ||
        (a.Name_2 && a.Name_2.toLowerCase().indexOf(q) >= 0) ||
        (a.placeName && a.placeName.toLowerCase().indexOf(q) >= 0);
      if (match) {
        if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
        shown++;
      } else {
        if (map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
      }
    });
    updateCount(shown);
    updateShareUrl();
  }

  function updateCount(n) {
    var el = document.getElementById('crs-count');
    if (el) el.textContent = n + ' school' + (n !== 1 ? 's' : '');
  }

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

  function updateShareUrl() {
    if (!map) return;
    var c = map.getCenter();
    var searchEl = document.getElementById('crs-search');
    var q = searchEl ? searchEl.value : '';
    var hash = '#lat=' + c.lat.toFixed(4) +
      '&lng=' + c.lng.toFixed(4) +
      '&z=' + map.getZoom() +
      (q ? '&q=' + encodeURIComponent(q) : '');
    history.replaceState(null, '', hash);
  }

  function loadFeatures(initialQuery) {
    var url = SERVICE_URL + '/query?where=1%3D1' +
      '&outFields=Name_1%2CName_2%2CplaceName%2Cstart%2Cend_%2Cid' +
      '&outSR=4326&returnGeometry=true&resultRecordCount=500&f=json';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var features = data.features || [];
        features.forEach(function (f) {
          if (!f.geometry) return;
          var m = L.marker([f.geometry.y, f.geometry.x], { icon: makeIcon() });
          m.bindPopup(buildPopup(f.attributes), { maxWidth: 300 });
          m.addTo(map);
          markers.push({ marker: m, attrs: f.attributes });
        });
        updateCount(features.length);
        if (initialQuery) applySearch(initialQuery);
      })
      .catch(function (err) {
        console.error('Failed to load data:', err);
      });
  }

  function initMap() {
    var state = loadStateFromUrl();
    var lat  = (state && state.lat) ? parseFloat(state.lat) : 57;
    var lng  = (state && state.lng) ? parseFloat(state.lng) : -97;
    var zoom = (state && state.z)   ? parseInt(state.z, 10)  : 4;
    var q    = (state && state.q)   ? state.q                : '';

    map = L.map('canada-residential-schools-map', { center: [lat, lng], zoom: zoom });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    map.on('moveend', updateShareUrl);

    var searchEl = document.getElementById('crs-search');
    if (searchEl) {
      if (q) searchEl.value = q;
      searchEl.addEventListener('input', function () {
        var val = this.value;
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function () { applySearch(val); }, 200);
      });
    }

    loadFeatures(q || null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }

})();
