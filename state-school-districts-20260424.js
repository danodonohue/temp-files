(function () {
  'use strict';

  var SERVICES = {
    districts: 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/School_Districts_Current/FeatureServer/0',
    pub:       'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Public_School_Locations_Current/FeatureServer/0',
    pri:       'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Private_School_Locations_Current/FeatureServer/0'
  };

  // State bounds: [[south, west], [north, east]]
  var STATE_BOUNDS = {
    AL: [[30.14, -88.47], [35.01, -84.89]], AK: [[51.00, -179.50], [71.50, -130.00]],
    AZ: [[31.33, -114.82], [37.00, -109.05]], AR: [[33.00, -94.62], [36.50, -89.64]],
    CA: [[32.53, -124.48], [42.01, -114.13]], CO: [[36.99, -109.06], [41.00, -102.04]],
    CT: [[40.97, -73.73], [42.05, -71.79]], DE: [[38.45, -75.79], [39.84, -75.05]],
    DC: [[38.79, -77.12], [39.00, -76.91]],
    FL: [[24.40, -87.63], [31.00, -80.03]], GA: [[30.36, -85.61], [35.00, -80.84]],
    HI: [[18.91, -160.25], [22.24, -154.81]], ID: [[41.99, -117.24], [49.00, -111.04]],
    IL: [[36.97, -91.51], [42.51, -87.02]], IN: [[37.77, -88.10], [41.76, -84.78]],
    IA: [[40.38, -96.64], [43.50, -90.14]], KS: [[36.99, -102.05], [40.00, -94.59]],
    KY: [[36.50, -89.57], [39.15, -81.96]], LA: [[28.93, -94.04], [33.02, -88.82]],
    ME: [[43.06, -71.08], [47.46, -66.95]], MD: [[37.89, -79.49], [39.72, -75.05]],
    MA: [[41.19, -73.50], [42.89, -69.93]], MI: [[41.70, -90.42], [48.30, -82.12]],
    MN: [[43.50, -97.24], [49.38, -89.49]], MS: [[30.17, -91.66], [35.00, -88.10]],
    MO: [[35.99, -95.77], [40.61, -89.10]], MT: [[44.36, -116.05], [49.00, -104.04]],
    NE: [[40.00, -104.05], [43.00, -95.31]], NV: [[35.00, -120.01], [42.00, -114.04]],
    NH: [[42.70, -72.56], [45.30, -70.61]], NJ: [[38.93, -75.56], [41.36, -73.89]],
    NM: [[31.33, -109.05], [37.00, -103.00]], NY: [[40.48, -79.76], [45.02, -71.86]],
    NC: [[33.84, -84.32], [36.59, -75.46]], ND: [[45.93, -104.05], [49.00, -96.55]],
    OH: [[38.40, -84.82], [42.00, -80.52]], OK: [[33.62, -103.00], [37.00, -94.43]],
    OR: [[41.99, -124.55], [46.29, -116.46]], PA: [[39.72, -80.52], [42.27, -74.69]],
    RI: [[41.15, -71.86], [42.02, -71.12]], SC: [[32.03, -83.35], [35.22, -78.54]],
    SD: [[42.48, -104.06], [45.95, -96.44]], TN: [[34.98, -90.31], [36.68, -81.64]],
    TX: [[25.84, -106.65], [36.50, -93.51]], UT: [[37.00, -114.05], [42.00, -109.05]],
    VT: [[42.73, -73.44], [45.02, -71.46]], VA: [[36.54, -83.68], [39.47, -75.24]],
    WA: [[45.54, -124.85], [49.00, -116.91]], WV: [[37.20, -82.64], [40.64, -77.72]],
    WI: [[42.49, -92.89], [47.08, -86.25]], WY: [[40.99, -111.06], [45.01, -104.05]]
  };

  var container = document.getElementById('state-school-districts-container');
  if (!container) return;

  var stateFP   = container.getAttribute('data-state-fp')  || '48';
  var stateCode = (container.getAttribute('data-state-code') || 'TX').toUpperCase();
  var stateName = container.getAttribute('data-state-name') || 'Texas';
  var bounds    = STATE_BOUNDS[stateCode] || [[24, -125], [50, -66]];

  // ------ Parse share-link hash (ssd- prefixed) ------
  var hashParams = {};
  if (window.location.hash) {
    window.location.hash.slice(1).split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) hashParams[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
  }

  // ------ Build UI ------
  container.innerHTML =
    '<div class="ssd-stats-strip">' +
      '<div class="ssd-stat-box"><span class="ssd-stat-value" data-ssd="total-districts">--</span><span class="ssd-stat-label">School Districts</span></div>' +
      '<div class="ssd-stat-box"><span class="ssd-stat-value" data-ssd="total-public">--</span><span class="ssd-stat-label">Public Schools</span></div>' +
      '<div class="ssd-stat-box"><span class="ssd-stat-value" data-ssd="total-private">--</span><span class="ssd-stat-label">Private Schools</span></div>' +
      '<div class="ssd-stat-box"><span class="ssd-stat-value sct-stat-sm" data-ssd="top-district">--</span><span class="ssd-stat-label">Largest District</span></div>' +
    '</div>' +
    '<div class="ssd-controls">' +
      '<div class="ssd-search-row">' +
        '<input type="search" class="ssd-search-input" data-ssd="search-input" placeholder="Search address, city or ZIP in ' + stateName + '" aria-label="Search address">' +
        '<button type="button" class="ssd-btn ssd-btn-primary" data-ssd="search">Find my district</button>' +
        '<button type="button" class="ssd-btn" data-ssd="locate">Use my location</button>' +
        '<span class="ssd-search-msg" data-ssd="search-msg"></span>' +
      '</div>' +
      '<div class="ssd-toggle-row">' +
        '<label class="ssd-toggle"><input type="checkbox" data-ssd="show-public"> Show public schools</label>' +
        '<label class="ssd-toggle"><input type="checkbox" data-ssd="show-private"> Show private schools</label>' +
        '<button type="button" class="ssd-btn ssd-btn-ghost" data-ssd="reset">Reset view</button>' +
      '</div>' +
    '</div>' +
    '<div class="ssd-map-wrap">' +
      '<div class="ssd-map" data-ssd="map"></div>' +
      '<div class="ssd-loading" data-ssd="loading">' +
        '<div class="ssd-spinner"></div>' +
        '<p class="ssd-loading-title">Loading ' + stateName + ' school districts...</p>' +
        '<p class="ssd-loading-step" data-ssd="loading-step">Counting public schools per district.</p>' +
      '</div>' +
    '</div>' +
    '<div class="ssd-legend">' +
      '<p class="ssd-legend-title">Districts shaded by number of public schools</p>' +
      '<ul class="ssd-legend-scale">' +
        '<li><span class="ssd-swatch" style="background:#edf8fb"></span>1-5</li>' +
        '<li><span class="ssd-swatch" style="background:#b3cde3"></span>6-15</li>' +
        '<li><span class="ssd-swatch" style="background:#8c96c6"></span>16-40</li>' +
        '<li><span class="ssd-swatch" style="background:#8856a7"></span>41-100</li>' +
        '<li><span class="ssd-swatch" style="background:#810f7c"></span>100+</li>' +
      '</ul>' +
      '<p class="ssd-legend-note" data-ssd="legend-note">Click any district to see its grade range, land area, and school count.</p>' +
    '</div>' +
    '<div class="ssd-attrib">Data: NCES EDGE (school year 2024-25) &middot; Base map &copy; OpenStreetMap / CARTO</div>';

  var get = function (key) { return container.querySelector('[data-ssd="' + key + '"]'); };

  // ------ Map init ------
  var initLat = hashParams['ssd-lat'] ? parseFloat(hashParams['ssd-lat']) : null;
  var initLng = hashParams['ssd-lng'] ? parseFloat(hashParams['ssd-lng']) : null;
  var initZoom = hashParams['ssd-z'] ? parseInt(hashParams['ssd-z'], 10) : null;

  var map = L.map(get('map'), {
    preferCanvas: true,
    zoomControl: true,
    minZoom: 4
  });

  if (initLat !== null && initLng !== null && initZoom !== null) {
    map.setView([initLat, initLng], initZoom);
  } else {
    map.fitBounds(bounds, { padding: [10, 10] });
  }

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // ------ State ------
  var state = {
    districtsLayer: null,
    districtFeatures: [],
    districtById: {},
    schoolCountByLEA: {},
    publicLayer: null,
    privateLayer: null,
    publicLoaded: false,
    privateLoaded: false,
    searchMarker: null
  };

  // ------ Helpers ------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtKm2(m2) {
    var k = Math.round((m2 || 0) / 1e6);
    return k.toLocaleString() + ' km²';
  }

  function esriQuery(url, params) {
    var p = Object.assign({ f: 'json' }, params);
    var qs = Object.keys(p).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
    }).join('&');
    return fetch(url + '/query?' + qs).then(function (r) { return r.json(); });
  }

  // ------ Choropleth scale ------
  function colorFor(cnt) {
    if (cnt >= 100) return '#810f7c';
    if (cnt >= 41)  return '#8856a7';
    if (cnt >= 16)  return '#8c96c6';
    if (cnt >= 6)   return '#b3cde3';
    if (cnt >= 1)   return '#edf8fb';
    return '#f5f5f5';
  }

  function districtStyle(feature) {
    var cnt = state.schoolCountByLEA[feature.properties.GEOID] || 0;
    return {
      color: '#1f2937',
      weight: 1,
      fillColor: colorFor(cnt),
      fillOpacity: 0.42
    };
  }

  function districtPopup(p) {
    var cnt = state.schoolCountByLEA[p.GEOID] || 0;
    var grade = (p.LOGRADE || '?') + '–' + (p.HIGRADE || '?');
    return '<div class="ssd-popup">' +
      '<p class="ssd-pop-title">' + esc(p.NAME) + '</p>' +
      '<ul class="ssd-pop-stats">' +
        '<li><strong>Public schools:</strong> ' + cnt + '</li>' +
        '<li><strong>Grade range:</strong> ' + esc(grade) + '</li>' +
        '<li><strong>Land area:</strong> ' + fmtKm2(p.ALAND) + '</li>' +
        '<li><strong>NCES LEAID:</strong> ' + esc(p.GEOID) + '</li>' +
      '</ul></div>';
  }

  function setLoadingStep(msg) {
    var el = get('loading-step');
    if (el) el.textContent = msg;
  }

  function hideLoading() {
    var el = get('loading');
    if (el) el.style.display = 'none';
  }

  // ------ Load: school counts per district ------
  function loadSchoolCounts() {
    return esriQuery(SERVICES.pub, {
      where: "STATE='" + stateCode + "'",
      outStatistics: JSON.stringify([
        { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'cnt' }
      ]),
      groupByFieldsForStatistics: 'LEAID',
      resultRecordCount: 2000
    }).then(function (r) {
      var totalPublic = 0;
      (r.features || []).forEach(function (f) {
        var c = f.attributes.cnt;
        state.schoolCountByLEA[f.attributes.LEAID] = c;
        totalPublic += c;
      });
      var el = get('total-public');
      if (el) el.textContent = totalPublic.toLocaleString();
      return totalPublic;
    });
  }

  // Private schools count (for stats strip)
  function loadPrivateCount() {
    return esriQuery(SERVICES.pri, {
      where: "STATE='" + stateCode + "'",
      returnCountOnly: true
    }).then(function (r) {
      var el = get('total-private');
      if (el) el.textContent = (r.count || 0).toLocaleString();
    });
  }

  // ------ Load districts (boundary polygons) ------
  function loadDistricts() {
    return esriQuery(SERVICES.districts, {
      where: "STATEFP='" + stateFP + "'",
      outFields: 'GEOID,NAME,LOGRADE,HIGRADE,ALAND,INTPTLAT,INTPTLON,SDTYP',
      outSR: 4326,
      maxAllowableOffset: 0.005,
      returnGeometry: true,
      f: 'geojson'
    }).then(function (r) {
      if (r.type !== 'FeatureCollection') {
        throw new Error('Expected GeoJSON FeatureCollection from districts service');
      }
      state.districtFeatures = r.features;

      // Find the district with most schools for stats strip
      var topLEAID = null, topCount = 0;
      Object.keys(state.schoolCountByLEA).forEach(function (leaid) {
        if (state.schoolCountByLEA[leaid] > topCount) {
          topCount = state.schoolCountByLEA[leaid];
          topLEAID = leaid;
        }
      });

      state.districtsLayer = L.geoJSON(r, {
        style: districtStyle,
        onEachFeature: function (feat, layer) {
          state.districtById[feat.properties.GEOID] = layer;
          layer.on('mouseover', function () { layer.setStyle({ weight: 2, color: '#1f2937' }); });
          layer.on('mouseout',  function () { state.districtsLayer.resetStyle(layer); });
          layer.bindPopup(function () { return districtPopup(feat.properties); }, { maxWidth: 280 });
        }
      }).addTo(map);

      // Update stats strip
      var tEl = get('total-districts');
      if (tEl) tEl.textContent = r.features.length.toLocaleString();

      if (topLEAID) {
        var topFeat = r.features.find(function (f) { return f.properties.GEOID === topLEAID; });
        if (topFeat) {
          var tdEl = get('top-district');
          if (tdEl) tdEl.textContent = topFeat.properties.NAME;
        }
      }

      var lnEl = get('legend-note');
      if (lnEl) {
        lnEl.textContent = r.features.length.toLocaleString() + ' ' + stateName +
          ' school districts loaded. Click any district for details.';
      }
    });
  }

  // ------ Lazy load public/private school points as clusters ------
  function ensurePublicSchools() {
    if (state.publicLoaded) return Promise.resolve(state.publicLayer);
    setLoadingStep('Loading public school locations...');
    return esriQuery(SERVICES.pub, {
      where: "STATE='" + stateCode + "'",
      outFields: 'NAME,CITY,NMCNTY,NMCBSA,LEAID',
      outSR: 4326,
      returnGeometry: true,
      resultRecordCount: 12000,
      f: 'geojson'
    }).then(function (r) {
      var cluster = L.markerClusterGroup({
        chunkedLoading: true,
        disableClusteringAtZoom: 13,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
      });
      cluster._ssdKind = 'public';
      (r.features || []).forEach(function (f) {
        if (!f.geometry || !f.geometry.coordinates) return;
        var lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
        var a = f.properties || {};
        var m = L.circleMarker([lat, lon], {
          radius: 4, color: '#b45309', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.85
        });
        m.bindPopup(
          '<div class="ssd-popup">' +
          '<p class="ssd-pop-title">' + esc(a.NAME) + '</p>' +
          '<ul class="ssd-pop-stats">' +
            '<li><strong>Type:</strong> Public</li>' +
            '<li><strong>City:</strong> ' + esc(a.CITY || '-') + '</li>' +
            '<li><strong>County:</strong> ' + esc(a.NMCNTY || '-') + '</li>' +
            '<li><strong>Metro area:</strong> ' + esc(a.NMCBSA || 'Outside CBSA') + '</li>' +
          '</ul></div>'
        );
        cluster.addLayer(m);
      });
      state.publicLayer = cluster;
      state.publicLoaded = true;
      return cluster;
    });
  }

  function ensurePrivateSchools() {
    if (state.privateLoaded) return Promise.resolve(state.privateLayer);
    setLoadingStep('Loading private school locations...');
    return esriQuery(SERVICES.pri, {
      where: "STATE='" + stateCode + "'",
      outFields: 'NAME,CITY,NMCNTY,NMCBSA',
      outSR: 4326,
      returnGeometry: true,
      resultRecordCount: 5000,
      f: 'geojson'
    }).then(function (r) {
      var cluster = L.markerClusterGroup({
        chunkedLoading: true,
        disableClusteringAtZoom: 13,
        maxClusterRadius: 45,
        showCoverageOnHover: false
      });
      cluster._ssdKind = 'private';
      (r.features || []).forEach(function (f) {
        if (!f.geometry || !f.geometry.coordinates) return;
        var lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
        var a = f.properties || {};
        var m = L.circleMarker([lat, lon], {
          radius: 4, color: '#6b21a8', weight: 1, fillColor: '#c084fc', fillOpacity: 0.85
        });
        m.bindPopup(
          '<div class="ssd-popup">' +
          '<p class="ssd-pop-title">' + esc(a.NAME) + '</p>' +
          '<ul class="ssd-pop-stats">' +
            '<li><strong>Type:</strong> Private</li>' +
            '<li><strong>City:</strong> ' + esc(a.CITY || '-') + '</li>' +
            '<li><strong>County:</strong> ' + esc(a.NMCNTY || '-') + '</li>' +
            '<li><strong>Metro area:</strong> ' + esc(a.NMCBSA || 'Outside CBSA') + '</li>' +
          '</ul></div>'
        );
        cluster.addLayer(m);
      });
      state.privateLayer = cluster;
      state.privateLoaded = true;
      return cluster;
    });
  }

  // ------ Toggle wiring ------
  get('show-public').addEventListener('change', function (e) {
    var btn = e.target;
    btn.disabled = true;
    ensurePublicSchools().then(function (layer) {
      if (btn.checked) map.addLayer(layer); else map.removeLayer(layer);
      btn.disabled = false;
    }).catch(function (err) {
      console.error('ssd:', err);
      btn.checked = false;
      btn.disabled = false;
    });
  });

  get('show-private').addEventListener('change', function (e) {
    var btn = e.target;
    btn.disabled = true;
    ensurePrivateSchools().then(function (layer) {
      if (btn.checked) map.addLayer(layer); else map.removeLayer(layer);
      btn.disabled = false;
    }).catch(function (err) {
      console.error('ssd:', err);
      btn.checked = false;
      btn.disabled = false;
    });
  });

  get('reset').addEventListener('click', function () {
    if (state.searchMarker) { map.removeLayer(state.searchMarker); state.searchMarker = null; }
    if (state.districtsLayer) state.districtsLayer.resetStyle();
    map.fitBounds(bounds, { padding: [10, 10] });
  });

  // ------ Address search (Nominatim, state-bounded) ------
  function doSearch() {
    var q = (get('search-input').value || '').trim();
    if (!q) return;
    var msg = get('search-msg');
    msg.textContent = 'Searching...';

    var vb = [bounds[0][1], bounds[1][0], bounds[1][1], bounds[0][0]].join(',');
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1' +
      '&viewbox=' + vb + '&bounded=1' +
      '&q=' + encodeURIComponent(q + ', ' + stateName);

    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        if (!arr || !arr.length) {
          msg.textContent = 'No match in ' + stateName + '. Try a more specific address.';
          return;
        }
        var res = arr[0];
        var lat = parseFloat(res.lat), lon = parseFloat(res.lon);
        msg.textContent = res.display_name;
        if (state.searchMarker) map.removeLayer(state.searchMarker);
        state.searchMarker = L.marker([lat, lon]).addTo(map)
          .bindPopup('<div class="ssd-popup"><strong>' + esc(res.display_name) + '</strong><br><em>Finding district...</em></div>')
          .openPopup();
        map.setView([lat, lon], 12);
        findContainingDistrict(lat, lon).then(function (d) {
          if (!d || !state.searchMarker) return;
          state.searchMarker.setPopupContent(
            '<div class="ssd-popup">' +
              '<strong>' + esc(res.display_name) + '</strong>' +
              '<p class="ssd-pop-title" style="margin-top:8px">' + esc(d.NAME) + '</p>' +
              '<ul class="ssd-pop-stats">' +
                '<li><strong>Public schools:</strong> ' + (state.schoolCountByLEA[d.GEOID] || 0) + '</li>' +
                '<li><strong>Grades:</strong> ' + esc((d.LOGRADE || '?') + '–' + (d.HIGRADE || '?')) + '</li>' +
                '<li><strong>Land area:</strong> ' + fmtKm2(d.ALAND) + '</li>' +
              '</ul>' +
            '</div>'
          );
          var layer = state.districtById[d.GEOID];
          if (layer && state.districtsLayer) {
            state.districtsLayer.resetStyle();
            layer.setStyle({ weight: 3, color: '#b91c1c', fillOpacity: 0.85 });
          }
        });
      })
      .catch(function () { msg.textContent = 'Search failed. Try again.'; });
  }

  get('search').addEventListener('click', doSearch);
  get('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  // ------ Geolocate ------
  get('locate').addEventListener('click', function () {
    if (!navigator.geolocation) { alert('Geolocation not supported in this browser.'); return; }
    var btn = get('locate');
    btn.disabled = true; btn.textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        if (state.searchMarker) map.removeLayer(state.searchMarker);
        state.searchMarker = L.marker([lat, lon]).addTo(map)
          .bindPopup('<div class="ssd-popup"><strong>Your location</strong><br><em>Finding district...</em></div>')
          .openPopup();
        map.setView([lat, lon], 12);
        btn.disabled = false; btn.textContent = 'Use my location';
        findContainingDistrict(lat, lon).then(function (d) {
          if (!d || !state.searchMarker) return;
          state.searchMarker.setPopupContent(
            '<div class="ssd-popup">' +
              '<strong>Your location</strong>' +
              '<p class="ssd-pop-title" style="margin-top:8px">' + esc(d.NAME) + '</p>' +
              '<ul class="ssd-pop-stats">' +
                '<li><strong>Public schools:</strong> ' + (state.schoolCountByLEA[d.GEOID] || 0) + '</li>' +
                '<li><strong>Grades:</strong> ' + esc((d.LOGRADE || '?') + '–' + (d.HIGRADE || '?')) + '</li>' +
                '<li><strong>Land area:</strong> ' + fmtKm2(d.ALAND) + '</li>' +
              '</ul>' +
            '</div>'
          );
          var layer = state.districtById[d.GEOID];
          if (layer && state.districtsLayer) {
            state.districtsLayer.resetStyle();
            layer.setStyle({ weight: 3, color: '#b91c1c', fillOpacity: 0.85 });
          }
        });
      },
      function () {
        alert('Could not get your location. Check browser permissions.');
        btn.disabled = false; btn.textContent = 'Use my location';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  function findContainingDistrict(lat, lon) {
    var geom = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
    return esriQuery(SERVICES.districts, {
      geometry: geom,
      geometryType: 'esriGeometryPoint',
      inSR: 4326,
      spatialRel: 'esriSpatialRelIntersects',
      where: "STATEFP='" + stateFP + "'",
      outFields: 'GEOID,NAME,LOGRADE,HIGRADE,ALAND',
      returnGeometry: false
    }).then(function (r) {
      return r.features && r.features[0] ? r.features[0].attributes : null;
    });
  }

  // ------ Share-link URL hash ------
  map.on('moveend zoomend', function () {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#ssd-lat=' + c.lat.toFixed(4) + '&ssd-lng=' + c.lng.toFixed(4) + '&ssd-z=' + map.getZoom());
  });

  // ------ Boot ------
  (function init() {
    setLoadingStep('Counting public schools per district...');
    Promise.all([loadSchoolCounts(), loadPrivateCount()])
      .then(function () {
        setLoadingStep('Fetching district boundaries from NCES EDGE...');
        return loadDistricts();
      })
      .then(function () { hideLoading(); })
      .catch(function (err) {
        console.error('ssd:', err);
        var el = get('loading');
        if (el) {
          el.innerHTML = '<p style="color:#c0392b"><strong>Could not load ' + stateName +
            ' school district data.</strong> The NCES service may be slow or offline. ' +
            '<a href="#" onclick="location.reload();return false;">Retry</a></p>';
        }
      });
  }());

}());
