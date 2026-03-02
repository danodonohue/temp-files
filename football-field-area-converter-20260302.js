(function () {
  'use strict';

  // NFL football field including end zones: 360 ft x 160 ft = 57,600 sq ft = 5,350.9 m2
  var FIELD_M2 = 5350.9;

  var CONFIG = {
    mapId: 'football-field-area-converter-map',
    initialView: [39.5, -98.35],
    initialZoom: 4,
    geocodeUrl: 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q='
  };

  // --- Map ---
  var map = L.map(CONFIG.mapId, {
    center: CONFIG.initialView,
    zoom: CONFIG.initialZoom
  });

  var streetTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  var satelliteTile = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community',
      maxZoom: 19
    }
  );

  satelliteTile.addTo(map);
  var currentTile = 'satellite';

  // --- Drawn items ---
  var drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  var shapeStyle = { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25, weight: 2 };

  var drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: shapeStyle
      },
      rectangle: { shapeOptions: shapeStyle },
      polyline: false,
      circle: false,
      circlemarker: false,
      marker: false
    }
  });
  map.addControl(drawControl);

  // --- Area helpers ---
  function getTotalAreaM2() {
    var total = 0;
    drawnItems.eachLayer(function (layer) {
      total += turf.area(layer.toGeoJSON());
    });
    return total;
  }

  function fmt(n, dec) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function updateResults() {
    var sqm = getTotalAreaM2();
    var fields = sqm / FIELD_M2;
    var acres = sqm * 0.000247105;
    var sqft = sqm * 10.76391;
    var sqmi = sqm * 3.861e-7;
    var ha = sqm / 10000;

    var emptyEl = document.getElementById('ffc-empty');
    var resultsEl = document.getElementById('ffc-results');

    if (sqm === 0) {
      emptyEl.style.display = 'block';
      resultsEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    resultsEl.style.display = 'block';

    var displayFields = fields < 10 ? fmt(fields, 2) : fmt(Math.round(fields * 10) / 10, 1);
    document.getElementById('ffc-field-count').textContent = displayFields;
    document.getElementById('ffc-field-label').textContent =
      parseFloat(displayFields) === 1 ? 'NFL football field' : 'NFL football fields';

    document.getElementById('ffc-acres').textContent = fmt(acres, 2);
    document.getElementById('ffc-sqft').textContent = fmt(sqft, 0);
    document.getElementById('ffc-sqm').textContent = fmt(sqm, 0);
    document.getElementById('ffc-sqmi').textContent = fmt(sqmi, 4);
    document.getElementById('ffc-ha').textContent = fmt(ha, 2);
  }

  // --- Draw events ---
  map.on(L.Draw.Event.CREATED, function (e) {
    drawnItems.addLayer(e.layer);
    updateResults();
    updateShareUrl();
  });

  map.on(L.Draw.Event.EDITED, function () {
    updateResults();
    updateShareUrl();
  });

  map.on(L.Draw.Event.DELETED, function () {
    updateResults();
    updateShareUrl();
  });

  // --- Controls ---
  document.getElementById('ffc-toggle-layer').addEventListener('click', function () {
    if (currentTile === 'satellite') {
      map.removeLayer(satelliteTile);
      streetTile.addTo(map);
      currentTile = 'street';
      this.textContent = 'Satellite';
    } else {
      map.removeLayer(streetTile);
      satelliteTile.addTo(map);
      currentTile = 'satellite';
      this.textContent = 'Street Map';
    }
  });

  document.getElementById('ffc-clear').addEventListener('click', function () {
    drawnItems.clearLayers();
    updateResults();
    updateShareUrl();
  });

  document.getElementById('ffc-share').addEventListener('click', function () {
    updateShareUrl();
    var btn = this;
    navigator.clipboard.writeText(window.location.href).then(function () {
      btn.textContent = 'Link Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = 'Share Link';
        btn.classList.remove('copied');
      }, 2000);
    }).catch(function () {
      // Fallback: select a temporary input
      var tmp = document.createElement('input');
      tmp.value = window.location.href;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      btn.textContent = 'Link Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = 'Share Link';
        btn.classList.remove('copied');
      }, 2000);
    });
  });

  // --- Geocoder ---
  var searchInput = document.getElementById('ffc-search-input');
  var searchResults = document.getElementById('ffc-search-results');
  var searchTimeout;

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimeout);
    var q = this.value.trim();
    if (q.length < 3) {
      searchResults.style.display = 'none';
      return;
    }
    searchTimeout = setTimeout(function () {
      fetch(CONFIG.geocodeUrl + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          searchResults.innerHTML = '';
          if (!data.length) { searchResults.style.display = 'none'; return; }
          data.slice(0, 5).forEach(function (item) {
            var li = document.createElement('li');
            li.textContent = item.display_name;
            li.addEventListener('click', function () {
              map.setView([parseFloat(item.lat), parseFloat(item.lon)], 14);
              searchResults.style.display = 'none';
              searchInput.value = item.display_name.split(',')[0];
            });
            searchResults.appendChild(li);
          });
          searchResults.style.display = 'block';
        })
        .catch(function () { searchResults.style.display = 'none'; });
    }, 400);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#ffc-search-wrap')) {
      searchResults.style.display = 'none';
    }
  });

  // --- Share URL (map position + shapes) ---
  function updateShareUrl() {
    var center = map.getCenter();
    var hash = 'lat=' + center.lat.toFixed(5) + '&lng=' + center.lng.toFixed(5) + '&z=' + map.getZoom();

    var shapes = [];
    drawnItems.eachLayer(function (layer) {
      shapes.push(layer.toGeoJSON());
    });
    if (shapes.length) {
      hash += '&shapes=' + encodeURIComponent(JSON.stringify(shapes));
    }

    history.replaceState(null, '', '#' + hash);
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = pair.slice(idx + 1);
    });

    if (params.lat && params.lng && params.z) {
      map.setView([parseFloat(params.lat), parseFloat(params.lng)], parseInt(params.z, 10));
    }

    if (params.shapes) {
      try {
        var shapes = JSON.parse(decodeURIComponent(params.shapes));
        shapes.forEach(function (geojson) {
          L.geoJSON(geojson, { style: shapeStyle }).eachLayer(function (l) {
            drawnItems.addLayer(l);
          });
        });
        updateResults();
      } catch (e) { /* ignore malformed hash */ }
    }
  }

  map.on('moveend', updateShareUrl);
  loadStateFromUrl();

})();
