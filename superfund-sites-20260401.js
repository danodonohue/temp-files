(function () {
  'use strict';

  var SLUG = 'superfund-sites';
  var SERVICE_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Superfund_National_Priorities_List_(NPL)_Sites_with_Status_Information/FeatureServer/0/query';

  var STATUS_COLORS = {
    'NPL Site':          '#c0392b',
    'Proposed NPL Site': '#e67e22',
    'Deleted NPL Site':  '#27ae60'
  };

  var STATUS_LABELS = {
    'NPL Site':          'Active NPL Site',
    'Proposed NPL Site': 'Proposed NPL Site',
    'Deleted NPL Site':  'Deleted from NPL'
  };

  var allFeatures = [];
  var filters = { statuses: {}, state: '', search: '' };
  var clusterGroup = null;
  var map = null;

  /* ---- URL state ---- */

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
    var center = map.getCenter();
    var params = {
      lat: center.lat.toFixed(5),
      lng: center.lng.toFixed(5),
      z: map.getZoom()
    };
    var activeStatuses = Object.keys(filters.statuses).filter(function (k) { return filters.statuses[k]; });
    if (activeStatuses.length) params.st = activeStatuses.join(',');
    if (filters.state)  params.s = filters.state;
    if (filters.search) params.q = filters.search;
    var hash = '#' + Object.keys(params)
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    history.replaceState(null, '', hash);
  }

  /* ---- Helpers ---- */

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- Marker ---- */

  function createMarker(feature) {
    var p = feature.properties;
    var status = p.Status || 'NPL Site';
    var color  = STATUS_COLORS[status] || '#888';
    var label  = STATUS_LABELS[status] || status;

    var icon = L.divIcon({
      className: '',
      html: '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';border:1.5px solid rgba(0,0,0,0.35);box-sizing:border-box;"></div>',
      iconSize:    [10, 10],
      iconAnchor:  [5, 5],
      popupAnchor: [0, -7]
    });

    var coords = feature.geometry.coordinates;
    var marker = L.marker([coords[1], coords[0]], { icon: icon });

    var score   = (p.Site_Score != null) ? Number(p.Site_Score).toFixed(2) : 'N/A';
    var locParts = [p.City, p.County ? p.County + ' County' : null, p.State].filter(Boolean);
    var location = locParts.join(', ');
    var profileUrl = (typeof p.Site_Progress_Profile === 'string' && p.Site_Progress_Profile.indexOf('http') === 0)
      ? p.Site_Progress_Profile : null;

    var metaParts = [];
    if (p.Site_EPA_ID) metaParts.push('ID: ' + esc(p.Site_EPA_ID));
    if (p.Region_ID)   metaParts.push('Region ' + esc(p.Region_ID));

    var html = '<div class="superfund-sites-popup">'
      + '<strong>' + esc(p.Site_Name || 'Unknown Site') + '</strong><br>'
      + '<span class="ss-pop-status" style="color:' + color + '">' + esc(label) + '</span>';
    if (location)            html += '<br><small>' + esc(location) + '</small>';
    if (metaParts.length)    html += '<br><small>' + metaParts.join(' &nbsp;|&nbsp; ') + '</small>';
    html += '<br>HRS Score: <strong>' + esc(score) + '</strong>';
    if (p.Proposed_Date)                  html += '<br>Proposed: ' + esc(p.Proposed_Date);
    if (p.Listing_Date)                   html += '<br>Listed: ' + esc(p.Listing_Date);
    if (p.Construction_Completion_Date)   html += '<br>Construction complete: ' + esc(p.Construction_Completion_Date);
    if (p.Deletion_Date)                  html += '<br>Deleted: ' + esc(p.Deletion_Date);
    if (profileUrl) html += '<br><a href="' + esc(profileUrl) + '" target="_blank" rel="noopener noreferrer">EPA Site Profile &rarr;</a>';
    html += '</div>';

    marker.bindPopup(html, { maxWidth: 280 });
    return marker;
  }

  /* ---- Filter logic ---- */

  function getVisibleFeatures() {
    var activeStatuses = Object.keys(filters.statuses).filter(function (k) { return filters.statuses[k]; });
    var filterStatus = activeStatuses.length > 0;
    var filterState  = filters.state  !== '';
    var filterSearch = filters.search !== '';
    var q = filters.search.toLowerCase();

    return allFeatures.filter(function (f) {
      var p = f.properties;
      if (filterStatus && activeStatuses.indexOf(p.Status) === -1) return false;
      if (filterState  && p.State !== filters.state) return false;
      if (filterSearch && (p.Site_Name || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function applyFilters() {
    clusterGroup.clearLayers();
    var visible = getVisibleFeatures();
    clusterGroup.addLayers(visible.map(createMarker));
    updateCount(visible.length);
    updateShareUrl();
  }

  /* ---- UI ---- */

  function updateCount(n) {
    var el = document.getElementById(SLUG + '-count');
    if (el) el.textContent = n.toLocaleString() + ' site' + (n !== 1 ? 's' : '') + ' shown';
  }

  function showLoading(show) {
    var el = document.getElementById(SLUG + '-loading');
    if (el) el.style.display = show ? 'inline' : 'none';
  }

  /* ---- Data ---- */

  function loadData() {
    showLoading(true);
    var qs = [
      'where=1%3D1',
      'outFields=Site_Name,Site_Score,Site_EPA_ID,Region_ID,State,City,County,Status,Proposed_Date,Listing_Date,Construction_Completion_Date,Deletion_Date,Site_Progress_Profile',
      'outSR=4326',
      'f=geojson',
      'resultRecordCount=2000'
    ].join('&');

    fetch(SERVICE_URL + '?' + qs)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        allFeatures = (data.features || []).filter(function (f) {
          return f.geometry && Array.isArray(f.geometry.coordinates);
        });
        populateStateFilter();
        applyFilters();
        showLoading(false);
      })
      .catch(function (err) {
        showLoading(false);
        var el = document.getElementById(SLUG + '-count');
        if (el) el.textContent = 'Failed to load data.';
        console.error('superfund-sites:', err);
      });
  }

  function populateStateFilter() {
    var seen = {};
    allFeatures.forEach(function (f) {
      var s = f.properties.State;
      if (s) seen[s] = true;
    });
    var states = Object.keys(seen).sort();
    var sel = document.getElementById(SLUG + '-state-filter');
    if (!sel) return;
    states.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
    if (filters.state) sel.value = filters.state;
  }

  /* ---- Controls ---- */

  function setupControls() {
    Object.keys(STATUS_COLORS).forEach(function (status) {
      var cbId = SLUG + '-cb-' + status.replace(/\s+/g, '-').toLowerCase();
      var cb = document.getElementById(cbId);
      if (!cb) return;
      cb.checked = !!filters.statuses[status];
      cb.addEventListener('change', function () {
        filters.statuses[status] = cb.checked;
        applyFilters();
      });
    });

    var stateSel = document.getElementById(SLUG + '-state-filter');
    if (stateSel) {
      stateSel.addEventListener('change', function () {
        filters.state = stateSel.value;
        applyFilters();
      });
    }

    var searchInput = document.getElementById(SLUG + '-search');
    if (searchInput) {
      searchInput.value = filters.search;
      searchInput.addEventListener('input', function () {
        filters.search = searchInput.value.trim().toLowerCase();
        applyFilters();
      });
    }

    var resetBtn = document.getElementById(SLUG + '-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        filters.statuses = {};
        filters.state    = '';
        filters.search   = '';
        document.querySelectorAll('#' + SLUG + '-controls input[type=checkbox]')
          .forEach(function (cb) { cb.checked = false; });
        var sel = document.getElementById(SLUG + '-state-filter');
        if (sel) sel.value = '';
        var srch = document.getElementById(SLUG + '-search');
        if (srch) srch.value = '';
        applyFilters();
      });
    }

  }

  /* ---- Init ---- */

  function init() {
    var saved = loadStateFromUrl();
    var lat  = (saved && saved.lat) ? parseFloat(saved.lat)    : 37.8;
    var lng  = (saved && saved.lng) ? parseFloat(saved.lng)    : -96.0;
    var zoom = (saved && saved.z)   ? parseInt(saved.z, 10)    : 4;

    if (saved && saved.st) {
      saved.st.split(',').forEach(function (s) { if (s) filters.statuses[s] = true; });
    }
    if (saved && saved.s) filters.state  = saved.s;
    if (saved && saved.q) filters.search = saved.q;

    map = L.map(SLUG + '-map', { center: [lat, lng], zoom: zoom });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: EPA SEMS',
      maxZoom: 19
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true
    });
    map.addLayer(clusterGroup);

    map.on('moveend zoomend', updateShareUrl);

    setupControls();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
