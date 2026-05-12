(function () {
  'use strict';

  var CONFIG = {
    service: 'https://services1-nocdn.arcgis.com/0MSEUqKaxRlEPj5g/ArcGIS/rest/services/Hospitals_WFL1/FeatureServer/0',
    fields: 'OBJECTID,NAME,ADDRESS,CITY,STATE,ZIP,TELEPHONE,TYPE,STATUS,COUNTY,LATITUDE,LONGITUDE,WEBSITE,OWNER,BEDS,TRAUMA,HELIPAD',
    maxBatch: 2000,
    parallelBatches: 8,
    initialView: [39.5, -98.35],
    initialZoom: 4,
    nominatim: 'https://nominatim.openstreetmap.org/search'
  };

  var TYPE_COLORS = {
    'GENERAL ACUTE CARE': '#1565C0',
    'CRITICAL ACCESS':    '#2E7D32',
    'PSYCHIATRIC':        '#6A1B9A',
    'LONG TERM CARE':     '#E65100',
    'REHABILITATION':     '#00695C',
    'MILITARY':           '#827717',
    'SPECIAL':            '#546E7A',
    'CHILDREN':           '#AD1457',
    'WOMEN':              '#880E4F',
    'CHRONIC DISEASE':    '#4E342E'
  };

  var EARTH_MILES = 3958.8;

  var state = {
    map: null,
    cluster: null,
    nearestLine: null,
    allFeatures: [],
    stats: { total: 0, open: 0, trauma: 0, beds: 0 },
    stateFilter: null,
    filters: { types: {}, showClosed: true },
    loaded: false
  };

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    var mapEl = document.getElementById('us-hospitals-map');
    if (!mapEl) return;

    state.stateFilter = (mapEl.getAttribute('data-state') || '').trim() || null;

    var hashView = loadHashView();
    var center = hashView ? [parseFloat(hashView.lat), parseFloat(hashView.lng)] : CONFIG.initialView;
    var zoom   = hashView ? parseInt(hashView.z, 10) : CONFIG.initialZoom;

    state.map = L.map('us-hospitals-map', {
      center: center,
      zoom: zoom,
      preferCanvas: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Search by <a href="https://nominatim.openstreetmap.org/">Nominatim</a>',
      maxZoom: 19
    }).addTo(state.map);

    state.cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    state.map.addLayer(state.cluster);

    state.map.on('moveend', saveHashView);
    state.map.on('click',   onMapClick);

    buildLegend();
    wireSearch();
    wireLocate();

    loadHospitals();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  function buildWhere() {
    if (!state.stateFilter) return "1=1";
    return "STATE='" + state.stateFilter.replace(/'/g, "''") + "'";
  }

  function loadHospitals() {
    var where = buildWhere();
    setLoading(true);

    fetch(CONFIG.service + '/query?where=' + encodeURIComponent(where) + '&returnCountOnly=true&f=json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var total = d.count || 0;
        var queue = [];
        for (var off = 0; off < total; off += CONFIG.maxBatch) queue.push(off);
        if (queue.length === 0) { setLoading(false); return; }
        runPool(queue, where);
      })
      .catch(function () { setLoading(false); });
  }

  function runPool(queue, where) {
    if (queue.length === 0) { setLoading(false); finalizeFeatures(); return; }
    var batch     = queue.slice(0, CONFIG.parallelBatches);
    var remaining = queue.slice(CONFIG.parallelBatches);
    var done = 0;

    batch.forEach(function (off) {
      fetchBatch(where, off)
        .then(function (features) {
          features.forEach(addFeature);
          if (++done === batch.length) runPool(remaining, where);
        })
        .catch(function () {
          if (++done === batch.length) runPool(remaining, where);
        });
    });
  }

  function fetchBatch(where, offset) {
    var url = CONFIG.service + '/query?' + [
      'where=' + encodeURIComponent(where),
      'outFields=' + encodeURIComponent(CONFIG.fields),
      'resultOffset=' + offset,
      'resultRecordCount=' + CONFIG.maxBatch,
      'orderByFields=OBJECTID',
      'f=json'
    ].join('&');
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) { return d.features || []; });
  }

  function addFeature(f) {
    var a = f.attributes;
    var lat = a.LATITUDE, lng = a.LONGITUDE;
    if (!lat || !lng) return;

    var type    = (a.TYPE   || 'SPECIAL').toUpperCase();
    var status  = (a.STATUS || 'OPEN').toUpperCase();
    var color   = TYPE_COLORS[type] || '#546E7A';
    var open    = status === 'OPEN';
    var beds    = (a.BEDS > 0) ? a.BEDS : 0;
    var trauma  = (a.TRAUMA || '').toUpperCase();
    var isTrauma = /LEVEL I($|[^V])/.test(trauma) || /LEVEL II($|[^I])/.test(trauma);

    state.stats.total++;
    if (open)     state.stats.open++;
    if (isTrauma) state.stats.trauma++;
    state.stats.beds += beds;

    var marker = L.circleMarker([lat, lng], {
      radius:      open ? 7 : 5,
      fillColor:   color,
      color:       open ? '#fff' : '#999',
      weight:      1,
      fillOpacity: open ? 0.85 : 0.35,
      opacity:     open ? 0.9 : 0.5
    });

    marker.bindPopup(buildPopup(a));
    state.cluster.addLayer(marker);

    state.allFeatures.push({
      marker: marker,
      type:   type,
      status: status,
      name:   a.NAME || '',
      city:   a.CITY || '',
      lat:    lat,
      lng:    lng
    });
  }

  function finalizeFeatures() {
    state.loaded = true;
    updateStats();
    if (state.stateFilter && state.cluster.getLayers().length > 0) {
      try { state.map.fitBounds(state.cluster.getBounds(), { padding: [20, 20] }); } catch (e) {}
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  function isVisible(f) {
    return state.filters.types[f.type] !== false &&
           (f.status === 'OPEN' || state.filters.showClosed);
  }

  function applyFilters() {
    document.querySelectorAll('#us-hospitals-legend-types input[data-filter-type]').forEach(function (chk) {
      state.filters.types[chk.dataset.filterType] = chk.checked;
    });
    state.cluster.clearLayers();
    state.allFeatures.forEach(function (f) {
      if (isVisible(f)) state.cluster.addLayer(f.marker);
    });
  }

  // ── Nearest hospital on map click ─────────────────────────────────────────

  function onMapClick(e) {
    if (!state.loaded || state.allFeatures.length === 0) return;

    var nearest = null, nearestDist = Infinity;
    state.allFeatures.forEach(function (f) {
      if (!isVisible(f)) return;
      var d = haversineMiles(e.latlng.lat, e.latlng.lng, f.lat, f.lng);
      if (d < nearestDist) { nearestDist = d; nearest = f; }
    });

    if (!nearest) return;

    if (state.nearestLine) { state.map.removeLayer(state.nearestLine); state.nearestLine = null; }

    state.nearestLine = L.polyline([e.latlng, [nearest.lat, nearest.lng]], {
      color: '#1565C0', weight: 2, dashArray: '7 5', opacity: 0.75
    }).addTo(state.map);

    var distStr = nearestDist < 0.1
      ? Math.round(nearestDist * 5280) + ' ft'
      : nearestDist.toFixed(1) + ' mi';

    L.popup({ closeButton: true, className: 'hosp-nearest-popup' })
      .setLatLng(e.latlng)
      .setContent(
        '<div class="hosp-nearest">' +
          '<div class="hosp-nearest-label">Nearest visible hospital</div>' +
          '<strong>' + esc(nearest.name) + '</strong>' +
          (nearest.city ? '<span class="hosp-nearest-city">, ' + esc(nearest.city) + '</span>' : '') +
          '<div class="hosp-nearest-dist">' + distStr + ' away</div>' +
        '</div>'
      )
      .openOn(state.map);

    state.map.once('popupclose', function () {
      if (state.nearestLine) { state.map.removeLayer(state.nearestLine); state.nearestLine = null; }
    });
  }

  function haversineMiles(lat1, lng1, lat2, lng2) {
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return EARTH_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Popup ─────────────────────────────────────────────────────────────────

  function buildPopup(a) {
    var name    = a.NAME    || 'Unknown';
    var addr    = [a.ADDRESS, a.CITY, a.STATE, a.ZIP].filter(Boolean).join(', ');
    var type    = a.TYPE    || '';
    var status  = a.STATUS  || '';
    var beds    = (a.BEDS > 0) ? a.BEDS : 'N/A';
    var trauma  = a.TRAUMA  || 'Not designated';
    var owner   = a.OWNER   || '';
    var phone   = a.TELEPHONE || '';
    var helipad = a.HELIPAD || '';
    var web     = a.WEBSITE ? '<a href="' + a.WEBSITE + '" target="_blank" rel="noopener">Website</a>' : '';

    return '<div class="hosp-popup">' +
      '<strong>' + esc(name) + '</strong>' +
      (addr  ? '<div class="hosp-addr">'   + esc(addr)  + '</div>' : '') +
      (type  ? '<div><span class="hosp-badge">' + esc(type) + '</span></div>' : '') +
      '<table class="hosp-tbl">' +
        '<tr><th>Status</th><td>'  + esc(status)  + '</td></tr>' +
        '<tr><th>Beds</th><td>'    + beds          + '</td></tr>' +
        '<tr><th>Trauma</th><td>'  + esc(trauma)  + '</td></tr>' +
        (owner   ? '<tr><th>Owner</th><td>'   + esc(owner)   + '</td></tr>' : '') +
        (phone   ? '<tr><th>Phone</th><td>'   + esc(phone)   + '</td></tr>' : '') +
        (helipad ? '<tr><th>Helipad</th><td>' + esc(helipad) + '</td></tr>' : '') +
      '</table>' +
      (web ? '<div class="hosp-web">' + web + '</div>' : '') +
    '</div>';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Stats strip ───────────────────────────────────────────────────────────

  function updateStats() {
    var s = state.stats;
    var beds = s.beds >= 1000 ? (s.beds / 1000).toFixed(1) + 'K' : String(s.beds);
    var el = document.getElementById('us-hospitals-stats');
    if (!el) return;
    el.innerHTML =
      stat('us-hospitals-stat-total',  s.total.toLocaleString(),  'Total Hospitals') +
      stat('us-hospitals-stat-open',   s.open.toLocaleString(),   'Open') +
      stat('us-hospitals-stat-trauma', s.trauma.toLocaleString(), 'Trauma Centers') +
      stat('us-hospitals-stat-beds',   beds,                      'Total Beds');
  }

  function stat(id, val, label) {
    return '<div class="hosp-stat" id="' + id + '">' +
      '<div class="hosp-stat-val">' + val + '</div>' +
      '<div class="hosp-stat-lbl">' + label + '</div>' +
    '</div>';
  }

  // ── Legend ────────────────────────────────────────────────────────────────

  function buildLegend() {
    var typesEl = document.getElementById('us-hospitals-legend-types');
    if (!typesEl) return;

    Object.keys(TYPE_COLORS).forEach(function (type) {
      var color = TYPE_COLORS[type];
      var label = type.charAt(0) + type.slice(1).toLowerCase();
      var item = document.createElement('label');
      item.className = 'hosp-legend-item';
      item.innerHTML =
        '<input type="checkbox" checked data-filter-type="' + esc(type) + '" />' +
        '<span class="hosp-dot" style="background:' + color + ';"></span>' +
        label;
      item.querySelector('input').addEventListener('change', applyFilters);
      typesEl.appendChild(item);
      state.filters.types[type] = true;
    });

    var closedChk = document.getElementById('us-hospitals-show-closed');
    if (closedChk) {
      closedChk.addEventListener('change', function () {
        state.filters.showClosed = this.checked;
        applyFilters();
      });
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  function setLoading(on) {
    var el = document.getElementById('us-hospitals-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
  }

  // ── Address search ────────────────────────────────────────────────────────

  function wireSearch() {
    var btn   = document.getElementById('us-hospitals-search-btn');
    var input = document.getElementById('us-hospitals-address');
    if (!btn || !input) return;
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
  }

  function doSearch() {
    var q = ((document.getElementById('us-hospitals-address') || {}).value || '').trim();
    if (!q) return;
    fetch(CONFIG.nominatim + '?q=' + encodeURIComponent(q) + '&format=json&limit=1', {
      headers: { 'User-Agent': 'mapscaping.com (us-hospitals-map)' }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d[0]) state.map.setView([parseFloat(d[0].lat), parseFloat(d[0].lon)], 11);
    });
  }

  // ── Geolocation ───────────────────────────────────────────────────────────

  function wireLocate() {
    var btn = document.getElementById('us-hospitals-locate-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.map.setView([pos.coords.latitude, pos.coords.longitude], 11);
      });
    });
  }

  // ── URL hash ──────────────────────────────────────────────────────────────

  function saveHashView() {
    var c = state.map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + state.map.getZoom());
  }

  function loadHashView() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i >= 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return (out.lat && out.lng && out.z) ? out : null;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
