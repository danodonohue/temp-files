(function () {
  'use strict';

  var SLUG = 'us-data-centers';
  var CACHE_KEY = 'udc_data_v2';
  var OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  var OVERPASS_QUERY = '[out:json][timeout:60];(node["telecom"="data_center"](24,-125,50,-66);way["telecom"="data_center"](24,-125,50,-66););out center tags;';

  var STATE_NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'Washington D.C.'
  };

  var CONFIG = {
    mapId: SLUG + '-map',
    initialView: [38.5, -96.5],
    initialZoom: 4
  };

  var MARKER_STYLE = {
    radius: 7,
    fillColor: '#2563EB',
    color: '#1d4ed8',
    weight: 1.5,
    opacity: 1,
    fillOpacity: 0.8
  };

  // --- URL state ---
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

  function updateShareUrl(stateVal) {
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

  // --- Cluster group ---
  var clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  });
  map.addLayer(clusterGroup);

  // --- Loading overlay (injected into map div) ---
  var mapEl = document.getElementById(CONFIG.mapId);
  var overlayEl = document.createElement('div');
  overlayEl.className = 'udc-loading-overlay';
  overlayEl.innerHTML = '<div class="udc-spinner"></div><p>Loading US data centers&hellip;</p>';
  mapEl.appendChild(overlayEl);

  function removeOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
  }

  function showError(msg) {
    removeOverlay();
    var errEl = document.createElement('div');
    errEl.className = 'udc-error-overlay';
    errEl.innerHTML = '<p>' + msg + '</p><button class="udc-retry-btn" id="' + SLUG + '-retry">Retry</button>';
    mapEl.appendChild(errEl);
    var retryBtn = document.getElementById(SLUG + '-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        if (errEl.parentNode) errEl.parentNode.removeChild(errEl);
        sessionStorage.removeItem(CACHE_KEY);
        mapEl.appendChild(overlayEl);
        loadData();
      });
    }
  }

  // --- Data store ---
  var allData = [];

  // --- Helpers ---
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Buffer layer ---
  var bufferLayer = null;

  function drawBuffer(latlng, miles) {
    if (bufferLayer) { map.removeLayer(bufferLayer); bufferLayer = null; }
    var radiusMeters = miles * 1609.344;
    bufferLayer = L.circle(latlng, {
      radius: radiusMeters,
      color: '#2563EB',
      weight: 2,
      fillColor: '#2563EB',
      fillOpacity: 0.07,
      dashArray: '7 5',
      interactive: false
    }).addTo(map);
    map.fitBounds(bufferLayer.getBounds(), { padding: [40, 40] });
    var clearBufBtn = document.getElementById(SLUG + '-clear-buffer');
    if (clearBufBtn) clearBufBtn.style.display = '';
  }

  function clearBuffer() {
    if (bufferLayer) { map.removeLayer(bufferLayer); bufferLayer = null; }
    var clearBufBtn = document.getElementById(SLUG + '-clear-buffer');
    if (clearBufBtn) clearBufBtn.style.display = 'none';
  }

  // Wire up the clear-buffer button (defined in HTML controls)
  var clearBufBtn = document.getElementById(SLUG + '-clear-buffer');
  if (clearBufBtn) {
    clearBufBtn.style.display = 'none';
    clearBufBtn.addEventListener('click', clearBuffer);
  }

  // Attach buffer button handler whenever a popup opens
  map.on('popupopen', function (e) {
    var popupEl = e.popup.getElement();
    if (!popupEl) return;
    var bufBtn = popupEl.querySelector('.udc-buffer-btn');
    if (!bufBtn) return;
    bufBtn.addEventListener('click', function () {
      var input = popupEl.querySelector('.udc-buffer-input');
      var miles = Math.max(1, parseFloat(input ? input.value : 25) || 25);
      var ll = e.popup.getLatLng();
      map.closePopup();
      drawBuffer(ll, miles);
    });
  });

  function makePopupHtml(d) {
    var name = d.name || 'Data Center';
    var rows = '';
    if (d.operator) {
      rows += '<tr><th>Operator</th><td>' + escHtml(d.operator) + '</td></tr>';
    }
    var locParts = [d.city];
    if (d.county) locParts.push(d.county + ' County');
    if (d.state) locParts.push(STATE_NAMES[d.state] || d.state);
    var loc = locParts.filter(Boolean).join(', ');
    if (loc) {
      rows += '<tr><th>Location</th><td>' + escHtml(loc) + '</td></tr>';
    }
    if (d.website) {
      var url = d.website.match(/^https?:\/\//) ? d.website : 'https://' + d.website;
      rows += '<tr><th>Website</th><td><a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(d.website.replace(/^https?:\/\//, '')) + '</a></td></tr>';
    }
    var osmTypeStr = d.osmType === 'node' ? 'node' : 'way';
    var osmUrl = 'https://www.openstreetmap.org/' + osmTypeStr + '/' + d.osmId;
    return (
      '<div class="udc-popup">' +
        '<h3>' + escHtml(name) + '</h3>' +
        (rows ? '<table>' + rows + '</table>' : '') +
        '<div class="udc-buffer-control">' +
          '<span class="udc-buffer-label">Draw buffer:</span>' +
          '<input type="number" class="udc-buffer-input" value="25" min="1" max="500" />' +
          '<span class="udc-buffer-unit">miles</span>' +
          '<button class="udc-buffer-btn">Draw</button>' +
        '</div>' +
        '<a href="' + osmUrl + '" target="_blank" rel="noopener" class="udc-osm-link">View on OpenStreetMap</a>' +
      '</div>'
    );
  }

  // --- Count display ---
  function updateCount(shown, total, stateFilter) {
    var countEl = document.getElementById(SLUG + '-count');
    if (!countEl) return;
    if (stateFilter) {
      countEl.textContent = shown.toLocaleString() + ' of ' + total.toLocaleString() + ' data centers';
    } else {
      countEl.textContent = shown.toLocaleString() + ' data centers';
    }
  }

  // --- Render markers ---
  function renderMarkers(stateFilter) {
    clusterGroup.clearLayers();
    var filtered = stateFilter
      ? allData.filter(function (d) { return d.state === stateFilter; })
      : allData;

    var layers = filtered.map(function (d) {
      var marker = L.circleMarker([d.lat, d.lon], MARKER_STYLE);
      marker.bindPopup(makePopupHtml(d), { maxWidth: 290 });
      marker._udcData = d;
      return marker;
    });

    clusterGroup.addLayers(layers);
    updateCount(filtered.length, allData.length, stateFilter);

    if (stateFilter && clusterGroup.getBounds().isValid()) {
      map.fitBounds(clusterGroup.getBounds(), { padding: [40, 40], maxZoom: 9 });
    }
  }

  // --- Build state dropdown ---
  function buildStateDropdown() {
    var stateSet = {};
    allData.forEach(function (d) {
      if (d.state) stateSet[d.state] = true;
    });

    var states = Object.keys(stateSet).sort(function (a, b) {
      return (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b);
    });

    var sel = document.getElementById(SLUG + '-state-select');
    if (!sel) return;

    states.forEach(function (abbr) {
      var opt = document.createElement('option');
      opt.value = abbr;
      opt.textContent = STATE_NAMES[abbr] || abbr;
      if (abbr === currentState) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // --- Process Overpass response ---
  function processData(json) {
    var elements = json.elements || [];
    allData = elements.map(function (el) {
      var lat = (el.type === 'node') ? el.lat : (el.center ? el.center.lat : null);
      var lon = (el.type === 'node') ? el.lon : (el.center ? el.center.lon : null);
      if (!lat || !lon) return null;

      var tags = el.tags || {};
      var stateRaw = (tags['addr:state'] || tags['is_in:state_code'] || '').toUpperCase().trim();
      var state = (stateRaw.length === 2) ? stateRaw : '';

      return {
        lat: lat,
        lon: lon,
        osmId: el.id,
        osmType: el.type,
        name: tags.name || '',
        operator: tags.operator || tags.brand || '',
        city: tags['addr:city'] || '',
        county: tags['addr:county'] || '',
        state: state,
        website: tags.website || tags.url || ''
      };
    }).filter(Boolean);

    buildStateDropdown();
    renderMarkers(currentState);
    removeOverlay();
  }

  // --- Fetch from Overpass ---
  function fetchFromEndpoint(index) {
    if (index >= OVERPASS_ENDPOINTS.length) {
      showError(
        'Data center data could not be loaded. The OpenStreetMap data service may be temporarily unavailable. ' +
        'Please try again in a few minutes.'
      );
      return;
    }
    var url = OVERPASS_ENDPOINTS[index];
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(OVERPASS_QUERY)
    })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data.elements || data.elements.length === 0) throw new Error('empty');
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      processData(data);
    })
    .catch(function () {
      fetchFromEndpoint(index + 1);
    });
  }

  function loadData() {
    try {
      var cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.elements && parsed.elements.length > 0) {
          processData(parsed);
          return;
        }
      }
    } catch (e) {}
    fetchFromEndpoint(0);
  }

  // --- State filter ---
  var stateSelect = document.getElementById(SLUG + '-state-select');
  if (stateSelect) {
    stateSelect.addEventListener('change', function () {
      currentState = this.value;
      renderMarkers(currentState);
      updateShareUrl(currentState);
    });
  }

  map.on('moveend', function () {
    updateShareUrl(currentState);
  });

  // --- Measure: distance to nearest data center ---
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
      measureBtn.textContent = 'Find nearest data center';
      measureBtn.classList.remove('udc-measure-active');
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
        measureBtn.classList.add('udc-measure-active');
        map.getContainer().style.cursor = 'crosshair';
        if (measureInfo) measureInfo.innerHTML = '<em>Click anywhere on the map&hellip;</em>';
      }
    });
  }

  map.on('click', function (e) {
    if (!measureMode) return;
    clearMeasure();

    var pool = currentState ? allData.filter(function (d) { return d.state === currentState; }) : allData;
    var turfPoints = pool.map(function (d) {
      return turf.point([d.lon, d.lat], d);
    });

    if (turfPoints.length === 0) {
      if (measureInfo) measureInfo.textContent = 'No data centers currently shown.';
      exitMeasureMode();
      return;
    }

    var clickPoint = turf.point([e.latlng.lng, e.latlng.lat]);
    var nearest = turf.nearestPoint(clickPoint, turf.featureCollection(turfPoints));
    var distKm = turf.distance(clickPoint, nearest, { units: 'kilometers' });
    var distMi = distKm * 0.621371;
    var nearestLatLng = L.latLng(nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]);

    measureLayers.push(
      L.circleMarker(e.latlng, {
        radius: 6, fillColor: '#2563EB', color: '#1d4ed8',
        weight: 2, fillOpacity: 0.95, interactive: false
      }).addTo(map)
    );

    measureLayers.push(
      L.polyline([e.latlng, nearestLatLng], {
        color: '#2563EB', weight: 2, dashArray: '8 5', opacity: 0.85, interactive: false
      }).addTo(map)
    );

    var dcName = nearest.properties.name || 'nearest data center';
    if (measureInfo) {
      measureInfo.innerHTML =
        'Nearest: <strong>' + escHtml(dcName) + '</strong> &mdash; ' +
        '<strong>' + distMi.toFixed(1) + ' mi</strong> (' + distKm.toFixed(1) + ' km)' +
        ' &nbsp;<button class="udc-clear-btn" id="' + SLUG + '-clear-measure">Clear</button>';
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

  // --- Start ---
  loadData();

})();
