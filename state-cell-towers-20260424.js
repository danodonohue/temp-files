(function () {
  'use strict';

  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Cellular_Towers_in_the_United_States_view/FeatureServer/0';

  var STATE_BOUNDS = {
    AL: [[30.14, -88.47], [35.01, -84.89]], AK: [[51.00, -179.50], [71.50, -130.00]],
    AZ: [[31.33, -114.82], [37.00, -109.05]], AR: [[33.00, -94.62], [36.50, -89.64]],
    CA: [[32.53, -124.48], [42.01, -114.13]], CO: [[36.99, -109.06], [41.00, -102.04]],
    CT: [[40.97, -73.73], [42.05, -71.79]], DE: [[38.45, -75.79], [39.84, -75.05]],
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
    WI: [[42.49, -92.89], [47.08, -86.25]], WY: [[40.99, -111.06], [45.01, -104.05]],
    DC: [[38.79, -77.12], [39.00, -76.91]]
  };

  var STRUC_LABELS = {
    TOWER: 'Tower', GTOWER: 'Guyed tower', LTOWER: 'Lattice tower',
    MTOWER: 'Monopole', POLE: 'Pole', UPOLE: 'Utility pole',
    MAST: 'Mast', TANK: 'Water tank', B: 'Building', BANT: 'Building w/ antenna',
    SILO: 'Silo', BTWR: 'Building w/ tower', BPIPE: 'Building w/ pipe', '': 'Other'
  };

  var container = document.getElementById('state-cell-towers-container');
  if (!container) return;

  var stateAbbr = (container.getAttribute('data-state') || 'TX').toUpperCase();
  var stateName = container.getAttribute('data-state-name') || stateAbbr;
  var bounds = STATE_BOUNDS[stateAbbr] || [[24, -125], [50, -66]];

  // Parse URL hash for share-link state (sct-prefixed so we don't collide with other scripts)
  var hashParams = {};
  if (window.location.hash) {
    window.location.hash.slice(1).split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) hashParams[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
  }

  // ------ Build UI ------
  container.innerHTML =
    '<div class="sct-stats-strip">' +
      '<div class="sct-stat-box"><span class="sct-stat-value" data-sct="total">--</span><span class="sct-stat-label">Total Towers</span></div>' +
      '<div class="sct-stat-box"><span class="sct-stat-value sct-stat-sm" data-sct="top-carrier">--</span><span class="sct-stat-label">Top Licensee</span></div>' +
      '<div class="sct-stat-box"><span class="sct-stat-value" data-sct="counties">--</span><span class="sct-stat-label">Counties</span></div>' +
      '<div class="sct-stat-box"><span class="sct-stat-value" data-sct="avg-height">--</span><span class="sct-stat-label">Avg Height (ft)</span></div>' +
    '</div>' +
    '<div class="sct-controls">' +
      '<div class="sct-search-row">' +
        '<input type="search" class="sct-search-input" placeholder="Search address, city or ZIP in ' + stateName + '" aria-label="Search address">' +
        '<button type="button" class="sct-btn sct-btn-primary" data-sct="search">Search</button>' +
        '<button type="button" class="sct-btn" data-sct="locate">Find Near Me</button>' +
        '<span class="sct-search-msg" data-sct="search-msg"></span>' +
      '</div>' +
      '<div class="sct-filter-row">' +
        '<span class="sct-ctrl-label">Filter by licensee</span>' +
        '<div class="sct-carrier-chips" data-sct="chips"><span class="sct-loading-msg">Loading...</span></div>' +
      '</div>' +
      '<div class="sct-radius-row">' +
        '<label class="sct-radius-toggle-label">' +
          '<input type="checkbox" data-sct="radius-toggle"> <strong>Select towers</strong> within ' +
          '<input type="number" class="sct-radius-input" data-sct="radius-input" value="10" min="1" max="100" step="1"> miles of a point' +
        '</label>' +
        '<span class="sct-hint" data-sct="radius-hint">Toggle on, then click the map to set a center.</span>' +
        '<div class="sct-export-row" data-sct="export-row" hidden>' +
          '<span class="sct-selection-count" data-sct="selection-count">0 towers selected</span>' +
          '<button type="button" class="sct-btn" data-sct="export-csv" disabled>Export CSV</button>' +
          '<button type="button" class="sct-btn" data-sct="export-geojson" disabled>Export GeoJSON</button>' +
          '<button type="button" class="sct-btn sct-btn-ghost" data-sct="clear-selection" disabled>Clear</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="sct-map-wrap">' +
      '<div class="sct-map" data-sct="map"></div>' +
      '<div class="sct-loading" data-sct="loading">' +
        '<div class="sct-spinner"></div>' +
        '<p>Loading ' + stateName + ' cell tower data...</p>' +
      '</div>' +
    '</div>' +
    '<div class="sct-attrib">Data: FCC Antenna Structure Registration (ASR) &middot; Base map &copy; OpenStreetMap</div>';

  var $ = function (sel) { return container.querySelector(sel); };
  var $$ = function (sel) { return container.querySelectorAll(sel); };
  var get = function (key) { return container.querySelector('[data-sct="' + key + '"]'); };

  // ------ Map init ------
  var initLat = hashParams['sct-lat'] ? parseFloat(hashParams['sct-lat']) : null;
  var initLng = hashParams['sct-lng'] ? parseFloat(hashParams['sct-lng']) : null;
  var initZoom = hashParams['sct-z'] ? parseInt(hashParams['sct-z'], 10) : null;

  var map = L.map(get('map'), {
    preferCanvas: true,
    zoomControl: true,
    minZoom: Math.max(4, (STATE_BOUNDS[stateAbbr] ? 5 : 4))
  });

  if (initLat !== null && initLng !== null && initZoom !== null) {
    map.setView([initLat, initLng], initZoom);
  } else {
    map.fitBounds(bounds, { padding: [10, 10] });
  }

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // ------ Cluster group ------
  var clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 55,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 13,
    chunkedLoading: true
  });
  map.addLayer(clusterGroup);

  // Selection layer (non-clustered) for radius-selected towers
  var selectionLayer = L.layerGroup().addTo(map);
  var radiusCenterMarker = null;
  var radiusCircle = null;

  // ------ State ------
  var allFeatures = [];        // { lat, lng, props }
  var allMarkers = [];         // L.circleMarker[], index-aligned with allFeatures
  var allCarriers = [];        // [{ name, count }]
  var activeCarriers = null;   // null = all; [] = none; [names] = subset
  var radiusMode = false;
  var radiusCenter = null;
  var selectedFeatures = [];

  // ------ Helpers ------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function haversineMiles(lat1, lng1, lat2, lng2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function strucLabel(code) {
    if (code == null) return 'Other';
    var k = String(code).trim().toUpperCase();
    return STRUC_LABELS[k] || (k || 'Other');
  }

  function popupHtml(p) {
    var lines = [];
    if (p.Licensee) lines.push('<strong>' + esc(p.Licensee) + '</strong>');
    var loc = [p.LocCity, p.LocCounty].filter(Boolean).join(', ');
    if (loc) lines.push(esc(loc));
    if (p.StrucType) lines.push('Type: ' + esc(strucLabel(p.StrucType)));
    if (p.TowReg != null && p.TowReg !== '') lines.push('Tower height: ' + esc(p.TowReg) + ' ft');
    if (p.AllStruc != null && p.AllStruc !== '') lines.push('Overall height: ' + esc(p.AllStruc) + ' ft');
    if (p.LicStatus) lines.push('License: ' + esc(p.LicStatus));
    if (p.Callsign) lines.push('Call sign: ' + esc(p.Callsign));
    return '<div class="sct-popup">' + lines.join('<br>') + '</div>';
  }

  // ------ Load all towers for state ------
  function loadTowers() {
    var where = encodeURIComponent("LocState='" + stateAbbr + "'");
    var fields = 'OBJECTID,Licensee,Callsign,LocCity,LocCounty,StrucType,LicStatus,TowReg,AllStruc,SupStruc,latdec,londec';
    var url = SERVICE_URL + '/query?where=' + where + '&outFields=' + fields +
              '&outSR=4326&f=geojson&resultRecordCount=4000&returnGeometry=true';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (gj) {
        if (!gj || !gj.features) throw new Error('No features');
        allFeatures = gj.features.map(function (f) {
          var c = f.geometry && f.geometry.coordinates;
          return c ? { lat: c[1], lng: c[0], props: f.properties || {} } : null;
        }).filter(Boolean);
        buildMarkers();
        computeCarriers();
        renderCarrierChips();
        updateStats();
        hideLoading();
      })
      .catch(function (err) {
        console.error('sct: load error', err);
        var el = get('loading');
        if (el) el.innerHTML = '<p style="color:#c0392b"><strong>Could not load tower data.</strong> The FCC service may be slow or offline. <a href="#" onclick="location.reload();return false;">Retry</a></p>';
      });
  }

  function buildMarkers() {
    allMarkers = allFeatures.map(function (f) {
      var m = L.circleMarker([f.lat, f.lng], {
        radius: 4.5,
        fillColor: '#3b6b8c',
        color: '#244459',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.78
      });
      m.bindPopup(popupHtml(f.props));
      m._sctIndex = allFeatures.indexOf(f);
      return m;
    });
    applyFilter();
  }

  function applyFilter() {
    clusterGroup.clearLayers();
    var visible = [];
    for (var i = 0; i < allFeatures.length; i++) {
      var f = allFeatures[i];
      if (matchesFilter(f)) {
        visible.push(allMarkers[i]);
      }
    }
    if (visible.length) clusterGroup.addLayers(visible);
  }

  function matchesFilter(f) {
    if (activeCarriers === null) return true;
    if (activeCarriers.length === 0) return false;
    return activeCarriers.indexOf(f.props.Licensee) !== -1;
  }

  // ------ Stats ------
  function computeCarriers() {
    var counts = {};
    allFeatures.forEach(function (f) {
      var k = f.props.Licensee || '(Unknown)';
      counts[k] = (counts[k] || 0) + 1;
    });
    allCarriers = Object.keys(counts).map(function (name) {
      return { name: name, count: counts[name] };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  function updateStats() {
    get('total').textContent = allFeatures.length.toLocaleString();

    var countyCounts = {};
    allFeatures.forEach(function (f) {
      var c = f.props.LocCounty;
      if (c) countyCounts[c] = (countyCounts[c] || 0) + 1;
    });
    get('counties').textContent = Object.keys(countyCounts).length.toLocaleString();

    get('top-carrier').textContent = allCarriers.length ? allCarriers[0].name : '--';

    var heights = allFeatures.map(function (f) {
      var h = parseFloat(f.props.TowReg);
      return isFinite(h) && h > 0 ? h : null;
    }).filter(function (h) { return h !== null; });
    var avg = heights.length ? Math.round(heights.reduce(function (a, b) { return a + b; }, 0) / heights.length) : null;
    get('avg-height').textContent = avg !== null ? avg.toLocaleString() : '--';
  }

  // ------ Carrier chips ------
  function renderCarrierChips() {
    var wrap = get('chips');
    wrap.innerHTML = '';

    var allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'sct-chip sct-chip-on';
    allBtn.textContent = 'All (' + allFeatures.length.toLocaleString() + ')';
    allBtn.addEventListener('click', function () {
      activeCarriers = null;
      syncChipStyles();
      applyFilter();
    });
    wrap.appendChild(allBtn);

    var top = allCarriers.slice(0, 12);
    top.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sct-chip sct-chip-on';
      btn.textContent = c.name + ' (' + c.count.toLocaleString() + ')';
      btn.dataset.carrier = c.name;
      btn.addEventListener('click', function () {
        toggleCarrier(c.name);
      });
      wrap.appendChild(btn);
    });

    if (allCarriers.length > 12) {
      var more = document.createElement('span');
      more.className = 'sct-chips-note';
      more.textContent = '+ ' + (allCarriers.length - 12) + ' smaller licensees (shown on map)';
      wrap.appendChild(more);
    }
  }

  function toggleCarrier(name) {
    if (activeCarriers === null) {
      // Start from all-on; clicking one chip selects only that
      activeCarriers = [name];
    } else {
      var i = activeCarriers.indexOf(name);
      if (i >= 0) activeCarriers.splice(i, 1);
      else activeCarriers.push(name);
      // Reset to null if everything top-12 is back on AND no exclusions
      if (activeCarriers.length === Math.min(12, allCarriers.length)) {
        activeCarriers = null;
      }
    }
    syncChipStyles();
    applyFilter();
  }

  function syncChipStyles() {
    var wrap = get('chips');
    var chips = wrap.querySelectorAll('.sct-chip');
    chips.forEach(function (ch) {
      var c = ch.dataset.carrier;
      if (c == null) {
        // All button
        ch.classList.toggle('sct-chip-on', activeCarriers === null);
      } else {
        var on = activeCarriers === null || activeCarriers.indexOf(c) !== -1;
        ch.classList.toggle('sct-chip-on', on);
      }
    });
  }

  // ------ Address search (Nominatim, state-bounded) ------
  function onSearch() {
    var input = $('.sct-search-input');
    var q = (input.value || '').trim();
    if (!q) return;
    var msg = get('search-msg');
    msg.textContent = 'Searching...';

    var vb = [bounds[0][1], bounds[1][0], bounds[1][1], bounds[0][0]].join(','); // W,N,E,S
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
              encodeURIComponent(q) + '&viewbox=' + vb + '&bounded=1&countrycodes=us';
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results || !results.length) {
          msg.textContent = 'No match in ' + stateName + '. Try a more specific address.';
          return;
        }
        var r = results[0];
        var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
        msg.textContent = r.display_name;
        placeUserPin(lat, lng, 'Search: ' + q);
        map.setView([lat, lng], 12);
      })
      .catch(function () {
        msg.textContent = 'Search failed. Try again.';
      });
  }

  // ------ Geolocate ------
  var userPin = null;
  function placeUserPin(lat, lng, label) {
    if (userPin) map.removeLayer(userPin);
    userPin = L.circleMarker([lat, lng], {
      radius: 8, fillColor: '#2c5a7a', color: '#1b3a50', weight: 2, fillOpacity: 0.9
    }).addTo(map).bindPopup(label || 'Location').openPopup();
  }

  get('locate').addEventListener('click', function () {
    var btn = get('locate');
    if (!navigator.geolocation) { alert('Geolocation not supported in this browser.'); return; }
    btn.disabled = true; btn.textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        placeUserPin(pos.coords.latitude, pos.coords.longitude, 'Your location');
        map.setView([pos.coords.latitude, pos.coords.longitude], 11);
        btn.disabled = false; btn.textContent = 'Find Near Me';
      },
      function () {
        alert('Could not get your location. Check browser permissions.');
        btn.disabled = false; btn.textContent = 'Find Near Me';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  get('search').addEventListener('click', onSearch);
  $('.sct-search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); onSearch(); }
  });

  // ------ Click-to-select radius ------
  function setRadiusMode(on) {
    radiusMode = on;
    var mapEl = get('map');
    mapEl.classList.toggle('sct-map-picking', on);
    get('radius-hint').textContent = on
      ? 'Click anywhere on the map to set the center.'
      : 'Toggle on, then click the map to set a center.';
  }

  get('radius-toggle').addEventListener('change', function (e) {
    setRadiusMode(e.target.checked);
    if (!e.target.checked && !radiusCenter) clearSelection();
  });

  get('radius-input').addEventListener('change', function () {
    if (radiusCenter) updateSelection();
  });

  map.on('click', function (e) {
    if (!radiusMode) return;
    radiusCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (radiusCenterMarker) map.removeLayer(radiusCenterMarker);
    radiusCenterMarker = L.circleMarker([radiusCenter.lat, radiusCenter.lng], {
      radius: 7, fillColor: '#c48a1a', color: '#8a6212', weight: 2, fillOpacity: 0.9
    }).addTo(map).bindPopup('Selection center').openPopup();
    updateSelection();
  });

  function updateSelection() {
    if (!radiusCenter) return;
    var miles = parseFloat(get('radius-input').value) || 10;
    if (radiusCircle) map.removeLayer(radiusCircle);
    radiusCircle = L.circle([radiusCenter.lat, radiusCenter.lng], {
      radius: miles * 1609.34,
      color: '#c48a1a', fillColor: '#c48a1a', fillOpacity: 0.07, weight: 1.5, dashArray: '6 4'
    }).addTo(map);

    selectedFeatures = allFeatures.filter(function (f) {
      if (!matchesFilter(f)) return false;
      return haversineMiles(radiusCenter.lat, radiusCenter.lng, f.lat, f.lng) <= miles;
    });

    selectionLayer.clearLayers();
    selectedFeatures.forEach(function (f) {
      L.circleMarker([f.lat, f.lng], {
        radius: 5.5, fillColor: '#d4a41a', color: '#8a6212', weight: 1.5, fillOpacity: 1
      }).bindPopup(popupHtml(f.props)).addTo(selectionLayer);
    });

    get('export-row').hidden = false;
    get('selection-count').textContent = selectedFeatures.length.toLocaleString() +
      ' tower' + (selectedFeatures.length === 1 ? '' : 's') + ' selected';
    var has = selectedFeatures.length > 0;
    get('export-csv').disabled = !has;
    get('export-geojson').disabled = !has;
    get('clear-selection').disabled = false;
  }

  function clearSelection() {
    selectedFeatures = [];
    radiusCenter = null;
    if (radiusCenterMarker) { map.removeLayer(radiusCenterMarker); radiusCenterMarker = null; }
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
    selectionLayer.clearLayers();
    get('selection-count').textContent = '0 towers selected';
    get('export-csv').disabled = true;
    get('export-geojson').disabled = true;
    get('clear-selection').disabled = true;
    get('export-row').hidden = true;
  }

  get('clear-selection').addEventListener('click', function () {
    clearSelection();
    get('radius-toggle').checked = false;
    setRadiusMode(false);
  });

  // ------ Export ------
  function exportCsv() {
    if (!selectedFeatures.length) return;
    var cols = ['Licensee', 'Callsign', 'LocCity', 'LocCounty', 'StrucType', 'LicStatus', 'TowReg', 'AllStruc', 'latdec', 'londec'];
    var headers = ['Licensee', 'Call sign', 'City', 'County', 'Structure type', 'License status', 'Tower height (ft)', 'Overall height (ft)', 'Latitude', 'Longitude'];
    var rows = [headers.map(csvField).join(',')];
    selectedFeatures.forEach(function (f) {
      var p = f.props;
      var line = cols.map(function (c) {
        if (c === 'latdec') return csvField(f.lat.toFixed(6));
        if (c === 'londec') return csvField(f.lng.toFixed(6));
        return csvField(p[c]);
      }).join(',');
      rows.push(line);
    });
    download('cell-towers-' + stateAbbr + '-selection.csv', rows.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function csvField(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportGeoJson() {
    if (!selectedFeatures.length) return;
    var fc = {
      type: 'FeatureCollection',
      features: selectedFeatures.map(function (f) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
          properties: f.props
        };
      })
    };
    download('cell-towers-' + stateAbbr + '-selection.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
  }

  function download(name, body, mime) {
    var blob = new Blob([body], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  get('export-csv').addEventListener('click', exportCsv);
  get('export-geojson').addEventListener('click', exportGeoJson);

  // ------ Share-link hash ------
  map.on('moveend zoomend', function () {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#sct-lat=' + c.lat.toFixed(4) + '&sct-lng=' + c.lng.toFixed(4) + '&sct-z=' + map.getZoom());
  });

  // ------ Loading ------
  function hideLoading() {
    var el = get('loading');
    if (el) el.style.display = 'none';
  }

  // ------ Go ------
  loadTowers();
}());
