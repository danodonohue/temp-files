/* US Dams Interactive Map v2
 * Data: USACE National Inventory of Dams via services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0
 * Features: hazard-first styling, condition + EAP popups, state filter via data-state,
 *           address search (Nominatim), geolocation, URL hash share links
 */
(function () {
  'use strict';

  var CONFIG = {
    service: 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0',
    maxRecords: 2000,
    parallelBatches: 8,
    fields: [
      'OBJECTID','NAME','NIDID','LATITUDE','LONGITUDE','STATE','COUNTYSTATE','CITY',
      'RIVER_OR_STREAM','PRIMARY_PURPOSE','PRIMARY_DAM_TYPE','NID_HEIGHT','NORMAL_STORAGE',
      'SURFACE_AREA','YEAR_COMPLETED','OWNER_TYPES','HAZARD_POTENTIAL','CONDITION_ASSESSMENT',
      'CONDITION_ASSESS_DATE','LAST_INSPECTION_DATE','INSPECTION_FREQUENCY','EAP_PREPARED',
      'EAP_LAST_REV_DATE','OPERATIONAL_STATUS'
    ].join(','),
    initialView: [39.8283, -98.5795],
    initialZoom: 4,
    nominatim: 'https://nominatim.openstreetmap.org/search'
  };

  var HAZARD_COLORS = {
    'High': '#DC2626',
    'Significant': '#F59E0B',
    'Low': '#16A34A',
    'Undetermined': '#6B7280'
  };

  var PURPOSE_COLORS = {
    'Irrigation': '#228B22',
    'Hydroelectric': '#4169E1',
    'Flood Risk Reduction': '#FF6347',
    'Water Supply': '#00CED1',
    'Recreation': '#FFD700',
    'Navigation': '#8A2BE2',
    'Debris Control': '#D2691E',
    'Tailings': '#A0522D',
    'Fish and Wildlife': '#32CD32',
    'Other': '#808080'
  };

  var state = {
    map: null,
    cluster: null,
    allFeatures: [],
    loadedCount: 0,
    totalCount: 0,
    filters: {
      hazard: {High: true, Significant: true, Low: true, Undetermined: true},
      condition: {},
      purpose: {}
    },
    stateFilter: null
  };

  function $(id) { return document.getElementById(id); }

  function init() {
    if (typeof L === 'undefined') { console.error('Leaflet not loaded'); return; }
    if (typeof L.markerClusterGroup === 'undefined') { console.error('MarkerCluster not loaded'); return; }
    var mapEl = $('us-dams-map');
    if (!mapEl) { console.error('Map element not found'); return; }

    state.stateFilter = (mapEl.getAttribute('data-state') || '').trim() || null;

    state.map = L.map('us-dams-map').setView(CONFIG.initialView, CONFIG.initialZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Data: <a href="https://nid.sec.usace.army.mil/">USACE NID</a>',
      maxZoom: 19
    }).addTo(state.map);

    state.cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 10,
      iconCreateFunction: createClusterIcon
    });
    state.map.addLayer(state.cluster);

    wireEvents();
    applyUrlHash();
    loadDams();
  }

  function wireEvents() {
    state.map.on('moveend zoomend', updateUrlHash);
    var sb = $('us-dams-search-btn'); if (sb) sb.addEventListener('click', onSearch);
    var addr = $('us-dams-address'); if (addr) addr.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); onSearch(); } });
    var lb = $('us-dams-locate-btn'); if (lb) lb.addEventListener('click', onLocate);
  }

  function showLoading(msg) { var el = $('us-dams-loading'); if (el) { el.classList.remove('hidden'); setLoadingProgress(msg || ''); } }
  function hideLoading() { var el = $('us-dams-loading'); if (el) el.classList.add('hidden'); }
  function setLoadingProgress(msg) { var el = $('us-dams-loading'); if (!el) return; var p = el.querySelector('.loading-progress'); if (p) p.textContent = msg; }

  function buildWhere() {
    if (!state.stateFilter) return '1=1';
    var s = state.stateFilter.replace(/'/g, "''");
    return "STATE='" + s + "'";
  }

  function loadDams() {
    showLoading('Counting...');
    var where = buildWhere();
    var countUrl = CONFIG.service + '/query?' + new URLSearchParams({
      where: where, returnCountOnly: 'true', f: 'json'
    }).toString();
    fetch(countUrl).then(function(r){ return r.json(); }).then(function(data){
      var total = data.count || 0;
      state.totalCount = total;
      state.loadedCount = 0;
      state.allFeatures = [];
      if (total === 0) { hideLoading(); return; }
      setLoadingProgress('0 / ' + total.toLocaleString() + ' loaded');
      var batches = Math.ceil(total / CONFIG.maxRecords);
      var queue = [];
      for (var i = 0; i < batches; i++) queue.push(i * CONFIG.maxRecords);
      runPool(queue, where, CONFIG.parallelBatches, finalize);
    }).catch(function(err){ hideLoading(); console.error('Count error', err); });
  }

  function runPool(queue, where, parallel, done) {
    var active = 0;
    function next() {
      if (queue.length === 0 && active === 0) { done(); return; }
      while (active < parallel && queue.length > 0) {
        var offset = queue.shift();
        active++;
        fetchBatch(offset, where).then(function(){ active--; next(); });
      }
    }
    next();
  }

  function fetchBatch(offset, where) {
    var url = CONFIG.service + '/query?' + new URLSearchParams({
      f: 'json', where: where, outFields: CONFIG.fields,
      resultRecordCount: CONFIG.maxRecords, resultOffset: offset, returnGeometry: 'false'
    }).toString();
    return fetch(url).then(function(r){ return r.json(); }).then(function(data){
      if (data.features && data.features.length) {
        state.allFeatures = state.allFeatures.concat(data.features);
        state.loadedCount += data.features.length;
        setLoadingProgress(state.loadedCount.toLocaleString() + ' / ' + state.totalCount.toLocaleString() + ' loaded');
      }
    }).catch(function(err){ console.error('Batch error at offset ' + offset, err); });
  }

  function finalize() {
    buildLegend();
    renderMarkers();
    updateStats();
    if (state.stateFilter && state.allFeatures.length) fitToFeatures();
    hideLoading();
  }

  function renderMarkers() {
    state.cluster.clearLayers();
    var markers = [];
    for (var i = 0; i < state.allFeatures.length; i++) {
      var a = state.allFeatures[i].attributes;
      if (a.LATITUDE == null || a.LONGITUDE == null) continue;
      if (!filterAllows(a)) continue;
      var m = makeMarker(a);
      if (m) markers.push(m);
    }
    state.cluster.addLayers(markers);
  }

  function filterAllows(a) {
    var h = normalizeHazard(a.HAZARD_POTENTIAL);
    if (!state.filters.hazard[h]) return false;
    var c = a.CONDITION_ASSESSMENT || 'Not Available';
    if (state.filters.condition[c] === false) return false;
    var p = normalizePurpose(a.PRIMARY_PURPOSE);
    if (state.filters.purpose[p] === false) return false;
    return true;
  }

  function normalizeHazard(h) {
    if (!h) return 'Undetermined';
    var s = String(h).trim();
    if (/high/i.test(s)) return 'High';
    if (/signif/i.test(s)) return 'Significant';
    if (/low/i.test(s)) return 'Low';
    return 'Undetermined';
  }

  function normalizePurpose(p) {
    if (!p) return 'Other';
    var s = String(p);
    if (/flood/i.test(s)) return 'Flood Risk Reduction';
    if (/hydro/i.test(s)) return 'Hydroelectric';
    if (/irrigat/i.test(s)) return 'Irrigation';
    if (/water supply|^water$/i.test(s)) return 'Water Supply';
    if (/recreation/i.test(s)) return 'Recreation';
    if (/navigation/i.test(s)) return 'Navigation';
    if (/debris/i.test(s)) return 'Debris Control';
    if (/tailing/i.test(s)) return 'Tailings';
    if (/fish|wildlife/i.test(s)) return 'Fish and Wildlife';
    return 'Other';
  }

  function makeMarker(a) {
    var height = a.NID_HEIGHT || 0;
    var radius = height < 25 ? 4 : height < 100 ? 6 : height < 300 ? 8 : 10;
    var haz = normalizeHazard(a.HAZARD_POTENTIAL);
    var cond = a.CONDITION_ASSESSMENT || '';
    var isPoor = (cond === 'Poor' || cond === 'Unsatisfactory');
    var fill = HAZARD_COLORS[haz];
    var border = isPoor ? '#111827' : '#fff';
    var weight = isPoor ? 2.5 : 1.5;
    var m = L.circleMarker([a.LATITUDE, a.LONGITUDE], {
      radius: radius,
      fillColor: fill,
      color: border,
      weight: weight,
      opacity: 1,
      fillOpacity: 0.85
    });
    m.bindPopup(popupHtml(a), { maxWidth: 320 });
    return m;
  }

  function popupHtml(a) {
    var haz = normalizeHazard(a.HAZARD_POTENTIAL);
    var cond = a.CONDITION_ASSESSMENT || 'Not Available';
    var name = a.NAME || 'Unnamed Dam';
    var out = [];
    out.push('<div class="popup-title">' + escapeHtml(name) + '</div>');
    var hPill = '<span class="pill pill-hazard-' + haz.toLowerCase() + '">' + haz + ' Hazard</span>';
    var cPill = '<span class="pill pill-cond-' + slug(cond) + '">' + cond + '</span>';
    out.push('<div class="popup-pills">' + hPill + cPill + '</div>');
    if (a.LAST_INSPECTION_DATE) out.push(row('Last inspected', formatDate(a.LAST_INSPECTION_DATE)));
    if (a.EAP_PREPARED) out.push(row('Emergency Action Plan', a.EAP_PREPARED));
    if (a.PRIMARY_PURPOSE) out.push(row('Primary purpose', a.PRIMARY_PURPOSE));
    if (a.PRIMARY_DAM_TYPE) out.push(row('Dam type', a.PRIMARY_DAM_TYPE));
    if (a.NID_HEIGHT) out.push(row('Height', a.NID_HEIGHT + ' ft'));
    if (a.NORMAL_STORAGE) out.push(row('Normal storage', Math.round(a.NORMAL_STORAGE).toLocaleString() + ' acre-ft'));
    if (a.SURFACE_AREA) out.push(row('Surface area', Math.round(a.SURFACE_AREA).toLocaleString() + ' acres'));
    if (a.RIVER_OR_STREAM) out.push(row('River', a.RIVER_OR_STREAM));
    if (a.COUNTYSTATE) out.push(row('Location', a.COUNTYSTATE));
    if (a.YEAR_COMPLETED) out.push(row('Completed', a.YEAR_COMPLETED));
    if (a.OWNER_TYPES) out.push(row('Owner type', a.OWNER_TYPES));
    if (a.NIDID) out.push('<div class="popup-nid">NID ID: ' + escapeHtml(a.NIDID) + '</div>');
    return out.join('');
  }

  function row(k, v) {
    return '<div class="popup-row"><span class="popup-k">' + k + ':</span> ' + escapeHtml(String(v)) + '</div>';
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function formatDate(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function updateStats() {
    var total = state.allFeatures.length, high = 0, poor = 0, dangerous = 0;
    for (var i = 0; i < state.allFeatures.length; i++) {
      var a = state.allFeatures[i].attributes;
      var isHigh = normalizeHazard(a.HAZARD_POTENTIAL) === 'High';
      var isPoor = a.CONDITION_ASSESSMENT === 'Poor' || a.CONDITION_ASSESSMENT === 'Unsatisfactory';
      if (isHigh) high++;
      if (isPoor) poor++;
      if (isHigh && isPoor) dangerous++;
    }
    setStat('total', total);
    setStat('high', high);
    setStat('poor', poor);
    setStat('dangerous', dangerous);
  }

  function setStat(k, v) {
    var el = document.querySelector('[data-stat="' + k + '"]');
    if (el) el.textContent = v.toLocaleString();
  }

  function buildLegend() {
    var hz = $('dams-hazard-controls');
    if (hz) {
      hz.innerHTML = '';
      var hazardOrder = ['High','Significant','Low','Undetermined'];
      var hCounts = {High:0,Significant:0,Low:0,Undetermined:0};
      for (var i = 0; i < state.allFeatures.length; i++) {
        hCounts[normalizeHazard(state.allFeatures[i].attributes.HAZARD_POTENTIAL)]++;
      }
      hazardOrder.forEach(function(h){
        if (hCounts[h] === 0 && h === 'Undetermined') return;
        hz.appendChild(makeCheckbox('hazard', h, HAZARD_COLORS[h], hCounts[h]));
      });
    }

    var cn = $('dams-condition-controls');
    if (cn) {
      cn.innerHTML = '';
      var cCounts = {};
      for (var j = 0; j < state.allFeatures.length; j++) {
        var c = state.allFeatures[j].attributes.CONDITION_ASSESSMENT || 'Not Available';
        cCounts[c] = (cCounts[c] || 0) + 1;
      }
      var cOrder = ['Satisfactory','Fair','Poor','Unsatisfactory','Not Rated','Not Available'];
      cOrder.forEach(function(c){
        if (!cCounts[c]) return;
        state.filters.condition[c] = true;
        cn.appendChild(makeCheckbox('condition', c, conditionColor(c), cCounts[c]));
      });
      Object.keys(cCounts).forEach(function(c){
        if (cOrder.indexOf(c) === -1) {
          state.filters.condition[c] = true;
          cn.appendChild(makeCheckbox('condition', c, conditionColor(c), cCounts[c]));
        }
      });
    }

    var pp = $('dams-purpose-controls');
    if (pp) {
      pp.innerHTML = '';
      var pCounts = {};
      for (var k = 0; k < state.allFeatures.length; k++) {
        var p = normalizePurpose(state.allFeatures[k].attributes.PRIMARY_PURPOSE);
        pCounts[p] = (pCounts[p] || 0) + 1;
      }
      Object.keys(pCounts).sort(function(a,b){ return pCounts[b]-pCounts[a]; }).forEach(function(p){
        state.filters.purpose[p] = true;
        pp.appendChild(makeCheckbox('purpose', p, PURPOSE_COLORS[p] || '#808080', pCounts[p]));
      });
    }
  }

  function makeCheckbox(group, value, color, count) {
    var wrap = document.createElement('label');
    wrap.className = 'legend-item';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', function(){
      state.filters[group][value] = cb.checked;
      renderMarkers();
    });
    var dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.backgroundColor = color;
    var text = document.createElement('span');
    text.className = 'legend-text';
    text.textContent = value;
    var cnt = document.createElement('span');
    cnt.className = 'legend-count';
    cnt.textContent = count.toLocaleString();
    wrap.appendChild(cb);
    wrap.appendChild(dot);
    wrap.appendChild(text);
    wrap.appendChild(cnt);
    return wrap;
  }

  function conditionColor(c) {
    if (c === 'Satisfactory') return '#16A34A';
    if (c === 'Fair') return '#F59E0B';
    if (c === 'Poor') return '#EA580C';
    if (c === 'Unsatisfactory') return '#B91C1C';
    return '#9CA3AF';
  }

  function createClusterIcon(cluster) {
    var count = cluster.getChildCount();
    var size = count < 20 ? 32 : count < 100 ? 40 : count < 1000 ? 48 : 56;
    var label = count >= 1000 ? Math.round(count/100)/10 + 'k' : count;
    return L.divIcon({
      html: '<div class="dams-cluster" style="width:' + size + 'px;height:' + size + 'px;line-height:' + (size-4) + 'px;">' + label + '</div>',
      className: '',
      iconSize: L.point(size, size)
    });
  }

  function fitToFeatures() {
    var pts = [];
    for (var i = 0; i < state.allFeatures.length; i++) {
      var a = state.allFeatures[i].attributes;
      if (a.LATITUDE != null && a.LONGITUDE != null) pts.push([a.LATITUDE, a.LONGITUDE]);
    }
    if (pts.length) state.map.fitBounds(pts, { padding: [30, 30], maxZoom: 9 });
  }

  function onSearch() {
    var el = $('us-dams-address');
    if (!el) return;
    var q = el.value.trim();
    if (!q) return;
    var btn = $('us-dams-search-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }
    var url = CONFIG.nominatim + '?' + new URLSearchParams({
      q: q, format: 'json', limit: '1', countrycodes: 'us'
    }).toString();
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r){ return r.json(); })
      .then(function(res){
        if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
        if (res && res.length) {
          var lat = parseFloat(res[0].lat), lng = parseFloat(res[0].lon);
          state.map.setView([lat, lng], 11);
          L.marker([lat, lng]).addTo(state.map).bindPopup(escapeHtml(res[0].display_name)).openPopup();
        } else {
          alert('No location found for "' + q + '"');
        }
      })
      .catch(function(err){
        if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
        console.error('Geocode error', err);
        alert('Search failed');
      });
  }

  function onLocate() {
    if (!navigator.geolocation) { alert('Geolocation not supported by your browser'); return; }
    var btn = $('us-dams-locate-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Locating...'; }
    navigator.geolocation.getCurrentPosition(function(pos){
      if (btn) { btn.disabled = false; btn.textContent = 'My location'; }
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      state.map.setView([lat, lng], 11);
      L.circleMarker([lat, lng], {
        radius: 8, fillColor: '#2563EB', color: '#fff', weight: 2, fillOpacity: 1
      }).addTo(state.map).bindPopup('Your location').openPopup();
    }, function(err){
      if (btn) { btn.disabled = false; btn.textContent = 'My location'; }
      alert('Location failed: ' + err.message);
    }, { enableHighAccuracy: false, timeout: 10000 });
  }

  function applyUrlHash() {
    var h = window.location.hash.slice(1);
    if (!h) return;
    var parts = {};
    h.split('&').forEach(function(p){
      var i = p.indexOf('=');
      if (i > 0) parts[p.slice(0,i)] = decodeURIComponent(p.slice(i+1));
    });
    if (parts.lat && parts.lng && parts.z) {
      var lat = parseFloat(parts.lat), lng = parseFloat(parts.lng), z = parseInt(parts.z, 10);
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(z)) state.map.setView([lat, lng], z);
    }
  }

  function updateUrlHash() {
    if (!state.map) return;
    var c = state.map.getCenter();
    var h = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + state.map.getZoom();
    history.replaceState(null, '', h);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
