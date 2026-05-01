(function () {
  'use strict';

  var SVC = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Superfund_National_Priorities_List_(NPL)_Sites_with_Status_Information/FeatureServer/0';
  var PAGE = 2000;
  var FIELDS = 'Site_Name,Site_Score,State,City,County,Status,Longitude,Latitude,Region_ID,Site_EPA_ID,Site_Progress_Profile,Proposed_Date,Listing_Date,Construction_Completion_Date,Deletion_Date';

  var COLORS = {
    'NPL Site':          '#c0392b',
    'Proposed NPL Site': '#e67e22',
    'Deleted NPL Site':  '#27ae60'
  };

  var LABELS = {
    'NPL Site':          'Active NPL',
    'Proposed NPL Site': 'Proposed',
    'Deleted NPL Site':  'Deleted'
  };

  var STATUS_ORDER = ['NPL Site', 'Proposed NPL Site', 'Deleted NPL Site'];

  function fmtDate(ts) {
    if (!ts) return null;
    try {
      var d = (typeof ts === 'number' || /^\d+$/.test(ts)) ? new Date(+ts) : new Date(ts);
      return isNaN(d) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return null; }
  }

  function extractUrl(val) {
    if (!val) return null;
    var m = String(val).match(/href="([^"]+)"/);
    return m ? m[1] : (/^https?:\/\//.test(val) ? val : null);
  }

  function buildWhere(state) {
    if (state) return "State='" + state.replace(/'/g, "''") + "'";
    return '1=1';
  }

  function fetchPage(where, offset) {
    var url = SVC + '/query?' + [
      'where=' + encodeURIComponent(where),
      'outFields=' + encodeURIComponent(FIELDS),
      'resultOffset=' + offset,
      'resultRecordCount=' + PAGE,
      'outSR=4326',
      'f=json'
    ].join('&');
    return fetch(url).then(function (r) { return r.json(); });
  }

  function fetchAll(where, done) {
    var all = [];
    function next(off) {
      fetchPage(where, off).then(function (data) {
        var feats = (data && data.features) ? data.features : [];
        all = all.concat(feats);
        if (feats.length === PAGE) { next(off + PAGE); } else { done(all); }
      }).catch(function () { done(all); });
    }
    next(0);
  }

  function popupHtml(p) {
    var rows = '';
    var status = LABELS[p.Status] || p.Status || '';
    var color  = COLORS[p.Status] || '#95a5a6';
    var loc    = [p.City, p.County, p.State].filter(Boolean).join(', ');
    if (status) rows += '<tr><td>Status</td><td><span class="ssv2-status-badge" style="background:' + color + '">' + status + '</span></td></tr>';
    if (loc)    rows += '<tr><td>Location</td><td>' + loc + '</td></tr>';
    if (p.Region_ID)   rows += '<tr><td>EPA Region</td><td>' + p.Region_ID + '</td></tr>';
    if (p.Site_EPA_ID) rows += '<tr><td>EPA ID</td><td>' + p.Site_EPA_ID + '</td></tr>';
    if (p.Site_Score != null && p.Site_Score !== '') rows += '<tr><td>HRS Score</td><td>' + p.Site_Score + '</td></tr>';
    var pd = fmtDate(p.Proposed_Date);
    var ld = fmtDate(p.Listing_Date);
    var cd = fmtDate(p.Construction_Completion_Date);
    var dd = fmtDate(p.Deletion_Date);
    if (pd) rows += '<tr><td>Proposed</td><td>' + pd + '</td></tr>';
    if (ld) rows += '<tr><td>Listed</td><td>' + ld + '</td></tr>';
    if (cd) rows += '<tr><td>Construction complete</td><td>' + cd + '</td></tr>';
    if (dd) rows += '<tr><td>Deleted</td><td>' + dd + '</td></tr>';
    var profileUrl = extractUrl(p.Site_Progress_Profile);
    var link = profileUrl ? '<p class="ssv2-popup-link"><a href="' + profileUrl + '" target="_blank" rel="noopener">View EPA site profile &rarr;</a></p>' : '';
    return '<div class="ssv2-popup"><h4>' + (p.Site_Name || 'Unknown Site') + '</h4><table class="ssv2-popup-table"><tbody>' + rows + '</tbody></table>' + link + '</div>';
  }

  function init() {
    var container = document.getElementById('superfund-sites-container');
    if (!container) return;
    var stateFilter = (container.getAttribute('data-state') || '').trim();

    // Map
    var initialView = stateFilter ? [38, -98] : [38, -98];
    var initialZoom = stateFilter ? 6 : 4;
    var map = L.map('superfund-sites-map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);
    map.setView(initialView, initialZoom);

    // Cluster groups — one per status
    var clusters = {};
    STATUS_ORDER.forEach(function (s) {
      clusters[s] = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 40 });
      clusters[s].addTo(map);
    });

    var allMarkers = [];

    // ── Stat helpers ──────────────────────────────────────────────
    function updateStats(feats) {
      var counts = { 'NPL Site': 0, 'Proposed NPL Site': 0, 'Deleted NPL Site': 0 };
      feats.forEach(function (f) {
        var s = f.attributes.Status;
        if (counts[s] !== undefined) counts[s]++;
      });
      function set(id, val) {
        var el = document.getElementById(id);
        if (el) el.querySelector('.ssv2-stat-value').textContent = val.toLocaleString();
      }
      set('ssv2-stat-active',   counts['NPL Site']);
      set('ssv2-stat-proposed', counts['Proposed NPL Site']);
      set('ssv2-stat-deleted',  counts['Deleted NPL Site']);
      set('ssv2-stat-total',    feats.length);
    }

    // ── Legend ────────────────────────────────────────────────────
    function buildLegend() {
      var items = document.getElementById('ssv2-legend-items');
      if (!items) return;
      items.innerHTML = '';
      STATUS_ORDER.forEach(function (s) {
        var grp = clusters[s];
        var count = grp ? grp.getLayers().length : 0;
        var div = document.createElement('div');
        div.className = 'ssv2-legend-item';
        div.innerHTML = '<span class="ssv2-dot" style="background:' + (COLORS[s] || '#aaa') + '"></span>'
          + '<span class="ssv2-legend-label">' + (LABELS[s] || s) + '</span>'
          + '<span class="ssv2-legend-count">' + count.toLocaleString() + '</span>';
        items.appendChild(div);
      });
    }

    // ── Loading ───────────────────────────────────────────────────
    function setLoading(on) {
      var el = document.getElementById('superfund-sites-loading');
      if (el) el.style.display = on ? 'block' : 'none';
    }

    // ── Add markers ───────────────────────────────────────────────
    function addMarkers(feats) {
      feats.forEach(function (f) {
        var p = f.attributes;
        var lat = parseFloat(p.Latitude), lon = parseFloat(p.Longitude);
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) return;
        var color = COLORS[p.Status] || '#95a5a6';
        var m = L.circleMarker([lat, lon], {
          radius: 7, color: '#fff', weight: 1.5,
          fillColor: color, fillOpacity: 0.85
        });
        m.bindPopup(popupHtml(p), { maxWidth: 320 });
        m._ssStatus = p.Status;
        m._ssName   = (p.Site_Name || '').toLowerCase();
        if (clusters[p.Status]) clusters[p.Status].addLayer(m);
        allMarkers.push(m);
      });
    }

    // ── Filters ───────────────────────────────────────────────────
    var cbActive   = document.getElementById('superfund-sites-cb-active');
    var cbProposed = document.getElementById('superfund-sites-cb-proposed');
    var cbDeleted  = document.getElementById('superfund-sites-cb-deleted');
    var nameSearch = document.getElementById('ssv2-name-search');

    function applyFilters() {
      var showActive   = !cbActive   || cbActive.checked;
      var showProposed = !cbProposed || cbProposed.checked;
      var showDeleted  = !cbDeleted  || cbDeleted.checked;
      var nameVal = nameSearch ? nameSearch.value.toLowerCase().trim() : '';

      var showMap = { 'NPL Site': showActive, 'Proposed NPL Site': showProposed, 'Deleted NPL Site': showDeleted };

      allMarkers.forEach(function (m) {
        var grp = clusters[m._ssStatus];
        if (!grp) return;
        var statusOk = !!showMap[m._ssStatus];
        var nameOk   = !nameVal || m._ssName.indexOf(nameVal) !== -1;
        var show = statusOk && nameOk;
        if (show && !grp.hasLayer(m)) grp.addLayer(m);
        if (!show && grp.hasLayer(m)) grp.removeLayer(m);
      });
      buildLegend();
    }

    [cbActive, cbProposed, cbDeleted].forEach(function (cb) {
      if (cb) cb.addEventListener('change', applyFilters);
    });
    if (nameSearch) nameSearch.addEventListener('input', applyFilters);

    // ── Address search (Nominatim) ────────────────────────────────
    var addrInput = document.getElementById('ssv2-address');
    var searchBtn = document.getElementById('ssv2-search-btn');
    if (searchBtn && addrInput) {
      function doSearch() {
        var q = addrInput.value.trim();
        if (!q) return;
        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1',
          { headers: { 'Accept-Language': 'en-US,en' } })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res[0]) map.setView([parseFloat(res[0].lat), parseFloat(res[0].lon)], 12);
          }).catch(function () {});
      }
      searchBtn.addEventListener('click', doSearch);
      addrInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
    }

    // ── Geolocation ───────────────────────────────────────────────
    var locBtn = document.getElementById('ssv2-locate-btn');
    if (locBtn) {
      locBtn.addEventListener('click', function () {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(function (pos) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 11);
        });
      });
    }

    // ── URL hash ──────────────────────────────────────────────────
    function saveHash() {
      var c = map.getCenter(), z = map.getZoom();
      window.location.hash = '#map=' + z + '/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4);
    }
    function loadHash() {
      var m = window.location.hash.match(/#map=(\d+)\/([-\d.]+)\/([-\d.]+)/);
      if (m) { map.setView([parseFloat(m[2]), parseFloat(m[3])], parseInt(m[1])); return true; }
      return false;
    }
    map.on('moveend', saveHash);

    // ── Fetch & render ────────────────────────────────────────────
    setLoading(true);
    fetchAll(buildWhere(stateFilter), function (feats) {
      setLoading(false);
      addMarkers(feats);
      updateStats(feats);
      buildLegend();

      if (stateFilter && allMarkers.length > 0) {
        var latlngs = allMarkers.map(function (m) { return m.getLatLng(); });
        try { map.fitBounds(L.latLngBounds(latlngs).pad(0.15)); } catch (e) {}
      } else {
        loadHash();
      }
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────
  var _attempts = 0;
  function ready() {
    if (typeof L !== 'undefined' &&
        typeof L.markerClusterGroup !== 'undefined' &&
        document.getElementById('superfund-sites-map')) {
      init();
    } else if (_attempts++ < 60) {
      setTimeout(ready, 80);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
}());
