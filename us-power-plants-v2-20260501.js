// US Power Plants Interactive Map v2 — mapscaping.com
// Supports data-state filter for per-state spoke pages
(function () {
  'use strict';

  var CONFIG = {
    service: 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0',
    maxRecords: 2000,
    parallelBatches: 8,
    fields: 'OBJECTID,Plant_Name,Utility_Na,City,County,State,PrimSource,source_des,tech_desc,Install_MW,Total_MW,sector_nam,Period,Latitude,Longitude',
    initialView: [39.83, -98.58],
    initialZoom: 4,
    nominatim: 'https://nominatim.openstreetmap.org/search'
  };

  var FUEL_COLORS = {
    'solar':          '#F59E0B',
    'wind':           '#60A5FA',
    'natural gas':    '#F97316',
    'coal':           '#57534E',
    'nuclear':        '#22C55E',
    'hydroelectric':  '#2563EB',
    'geothermal':     '#A16207',
    'biomass':        '#16A34A',
    'petroleum':      '#9333EA',
    'batteries':      '#EC4899',
    'pumped storage': '#0E7490',
    'other':          '#9CA3AF'
  };

  var FUEL_LABELS = {
    'solar':          'Solar',
    'wind':           'Wind',
    'natural gas':    'Natural Gas',
    'coal':           'Coal',
    'nuclear':        'Nuclear',
    'hydroelectric':  'Hydroelectric',
    'geothermal':     'Geothermal',
    'biomass':        'Biomass',
    'petroleum':      'Petroleum',
    'batteries':      'Batteries',
    'pumped storage': 'Pumped Storage',
    'other':          'Other'
  };

  var RENEWABLE_FUELS = ['solar', 'wind', 'hydroelectric', 'geothermal', 'biomass', 'pumped storage'];

  var st = {
    map: null,
    fuelClusters: {},   // fuel → L.markerClusterGroup
    fuelCounts: {},     // fuel → count
    allFeatures: [],
    stateFilter: null,
    totalCount: 0,
    loadedCount: 0,
    hashView: null
  };

  /* ── Init ─────────────────────────────────────────────────────── */

  function init() {
    var mapEl = document.getElementById('us-power-plants-map');
    if (!mapEl) return;

    st.stateFilter = (mapEl.getAttribute('data-state') || '').trim() || null;
    readHash();

    var viewLatLng = st.hashView ? [st.hashView[0], st.hashView[1]] : CONFIG.initialView;
    var viewZoom   = st.hashView ? st.hashView[2] : CONFIG.initialZoom;

    st.map = L.map('us-power-plants-map', { zoomControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: EIA'
    }).addTo(st.map);

    st.map.setView(viewLatLng, viewZoom);
    st.map.on('moveend zoomend', writeHash);

    var searchBtn  = document.getElementById('us-power-plants-search-btn');
    var locateBtn  = document.getElementById('us-power-plants-locate-btn');
    var addrInput  = document.getElementById('us-power-plants-address');

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (addrInput) addrInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') doSearch(); });
    if (locateBtn) locateBtn.addEventListener('click', doLocate);

    loadData();
  }

  /* ── Data loading ─────────────────────────────────────────────── */

  function buildWhere() {
    if (!st.stateFilter) return '1=1';
    return "State='" + st.stateFilter.replace(/'/g, "''") + "'";
  }

  function loadData() {
    var where = buildWhere();
    showLoading('Counting plants…');

    fetch(CONFIG.service + '/query?where=' + encodeURIComponent(where) + '&returnCountOnly=true&f=json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        st.totalCount = d.count || 0;
        setStatCard('us-power-plants-stat-total', st.totalCount.toLocaleString(), 'Plants');

        if (st.totalCount === 0) {
          hideLoading();
          return;
        }

        var offsets = [];
        for (var i = 0; i < Math.ceil(st.totalCount / CONFIG.maxRecords); i++) {
          offsets.push(i * CONFIG.maxRecords);
        }
        runPool(offsets, where);
      })
      .catch(function (e) { console.error('Count error', e); hideLoading(); });
  }

  function runPool(offsets, where) {
    var remaining = offsets.slice();
    var active = 0;
    var completed = 0;
    var total = offsets.length;

    function next() {
      while (active < CONFIG.parallelBatches && remaining.length > 0) {
        var offset = remaining.shift();
        active++;
        fetchBatch(where, offset).then(function (features) {
          active--;
          completed++;
          st.allFeatures = st.allFeatures.concat(features);
          st.loadedCount += features.length;
          showLoading('Loading ' + st.loadedCount.toLocaleString() + ' / ' + st.totalCount.toLocaleString() + ' plants…');
          addMarkers(features);
          if (completed === total) {
            finalizeMap();
          } else {
            next();
          }
        }).catch(function () { active--; next(); });
      }
    }
    next();
  }

  function fetchBatch(where, offset) {
    var params = new URLSearchParams({
      f: 'json',
      where: where,
      outFields: CONFIG.fields,
      resultOffset: String(offset),
      resultRecordCount: String(CONFIG.maxRecords)
    });
    return fetch(CONFIG.service + '/query?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.features || []; });
  }

  /* ── Markers ──────────────────────────────────────────────────── */

  function normFuel(raw) {
    var s = (raw || '').toLowerCase().trim();
    if (FUEL_COLORS[s]) return s;
    // fuzzy match
    if (s.indexOf('solar') >= 0) return 'solar';
    if (s.indexOf('wind') >= 0) return 'wind';
    if (s.indexOf('natural gas') >= 0 || s === 'gas') return 'natural gas';
    if (s.indexOf('coal') >= 0) return 'coal';
    if (s.indexOf('nuclear') >= 0) return 'nuclear';
    if (s.indexOf('hydro') >= 0 && s.indexOf('pumped') < 0) return 'hydroelectric';
    if (s.indexOf('pumped') >= 0) return 'pumped storage';
    if (s.indexOf('geo') >= 0) return 'geothermal';
    if (s.indexOf('bio') >= 0 || s.indexOf('wood') >= 0) return 'biomass';
    if (s.indexOf('petrol') >= 0 || s.indexOf('oil') >= 0 || s.indexOf('crude') >= 0) return 'petroleum';
    if (s.indexOf('batter') >= 0 || s.indexOf('storage') >= 0) return 'batteries';
    return 'other';
  }

  function addMarkers(features) {
    features.forEach(function (f) {
      var p = f.attributes;
      if (!p.Latitude || !p.Longitude) return;

      var fuel  = normFuel(p.PrimSource);
      var color = FUEL_COLORS[fuel];

      if (!st.fuelClusters[fuel]) {
        var clusterColor = color;
        st.fuelClusters[fuel] = L.markerClusterGroup({
          chunkedLoading: true,
          iconCreateFunction: (function (c) {
            return function (cluster) {
              var n = cluster.getChildCount();
              return L.divIcon({
                html: '<div style="background:' + c + ';color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">' + n + '</div>',
                className: '',
                iconSize: [36, 36]
              });
            };
          })(clusterColor)
        });
        st.map.addLayer(st.fuelClusters[fuel]);
        st.fuelCounts[fuel] = 0;
      }

      var marker = L.circleMarker([p.Latitude, p.Longitude], {
        radius: 6,
        fillColor: color,
        color: '#fff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.88
      });
      marker.bindPopup(buildPopup(p, fuel));
      st.fuelClusters[fuel].addLayer(marker);
      st.fuelCounts[fuel]++;
    });
  }

  function buildPopup(p, fuel) {
    var fuelLabel = FUEL_LABELS[fuel] || fuel;
    var mw  = p.Total_MW   ? (+p.Total_MW).toLocaleString(undefined, {maximumFractionDigits:1}) + ' MW' : 'N/A';
    var ins = p.Install_MW ? (+p.Install_MW).toLocaleString(undefined, {maximumFractionDigits:1}) + ' MW' : 'N/A';
    var loc = [p.City, p.County, p.State].filter(Boolean).join(', ') || 'N/A';
    var row = function (label, val) {
      return '<tr><td style="color:#888;padding:2px 6px 2px 0;white-space:nowrap">' + label + '</td><td style="padding:2px 0"><strong>' + val + '</strong></td></tr>';
    };
    return '<div style="min-width:210px;font-size:13px">' +
      '<div style="font-weight:700;font-size:14px;margin-bottom:2px">' + escHtml(p.Plant_Name || 'Unknown Plant') + '</div>' +
      '<div style="color:#555;margin-bottom:6px">' + escHtml(p.Utility_Na || '') + '</div>' +
      '<table style="width:100%;border-collapse:collapse">' +
      row('Fuel type', fuelLabel) +
      row('Capacity', mw) +
      row('Installed', ins) +
      row('Technology', escHtml(p.tech_desc || p.source_des || 'N/A')) +
      row('Sector', escHtml(p.sector_nam || 'N/A')) +
      row('Location', escHtml(loc)) +
      row('Period', escHtml(p.Period || 'N/A')) +
      '</table></div>';
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Finalize ─────────────────────────────────────────────────── */

  function finalizeMap() {
    hideLoading();
    computeStats();
    buildLegend();
  }

  function computeStats() {
    var totalMW = 0;
    var renewCount = 0;

    st.allFeatures.forEach(function (f) {
      var p    = f.attributes;
      var fuel = normFuel(p.PrimSource);
      totalMW += +(p.Total_MW) || 0;
      if (RENEWABLE_FUELS.indexOf(fuel) >= 0) renewCount++;
    });

    var renewPct = st.allFeatures.length > 0
      ? Math.round((renewCount / st.allFeatures.length) * 100) : 0;

    var topFuel = Object.keys(st.fuelCounts).sort(function (a, b) {
      return st.fuelCounts[b] - st.fuelCounts[a];
    })[0] || '';

    setStatCard('us-power-plants-stat-total', st.allFeatures.length.toLocaleString(), 'Plants');
    setStatCard('us-power-plants-stat-mw',
      Math.round(totalMW).toLocaleString() + ' MW', 'Total Capacity');
    setStatCard('us-power-plants-stat-renew', renewPct + '%', 'Renewable');
    setStatCard('us-power-plants-stat-top', FUEL_LABELS[topFuel] || topFuel, 'Top Fuel Type');
  }

  /* ── Legend ───────────────────────────────────────────────────── */

  function buildLegend() {
    var container = document.getElementById('us-power-plants-legend-items');
    if (!container) return;
    container.innerHTML = '';

    var fuels = Object.keys(st.fuelCounts).sort(function (a, b) {
      return st.fuelCounts[b] - st.fuelCounts[a];
    });

    fuels.forEach(function (fuel) {
      var color = FUEL_COLORS[fuel];
      var label = FUEL_LABELS[fuel] || fuel;
      var count = st.fuelCounts[fuel];

      var li = document.createElement('label');
      li.className = 'ppv2-legend-item';
      li.innerHTML =
        '<input type="checkbox" checked data-fuel="' + fuel + '" style="margin-right:4px">' +
        '<span class="ppv2-dot" style="background:' + color + '"></span>' +
        '<span class="ppv2-legend-label">' + label + '</span>' +
        '<span class="ppv2-legend-count">' + count.toLocaleString() + '</span>';

      li.querySelector('input').addEventListener('change', function (e) {
        var cluster = st.fuelClusters[fuel];
        if (!cluster) return;
        if (e.target.checked) {
          st.map.addLayer(cluster);
        } else {
          st.map.removeLayer(cluster);
        }
      });

      container.appendChild(li);
    });
  }

  /* ── UI helpers ───────────────────────────────────────────────── */

  function setStatCard(id, value, label) {
    var el = document.getElementById(id);
    if (!el) return;
    var vEl = el.querySelector('.ppv2-stat-value');
    var lEl = el.querySelector('.ppv2-stat-label');
    if (vEl) vEl.textContent = value;
    if (lEl) lEl.textContent = label;
  }

  function showLoading(msg) {
    var el = document.getElementById('us-power-plants-loading');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function hideLoading() {
    var el = document.getElementById('us-power-plants-loading');
    if (el) el.style.display = 'none';
  }

  /* ── Search & locate ──────────────────────────────────────────── */

  function doSearch() {
    var input = document.getElementById('us-power-plants-address');
    if (!input) return;
    var addr = input.value.trim();
    if (!addr) return;

    fetch(CONFIG.nominatim + '?format=json&q=' + encodeURIComponent(addr) + '&limit=1', {
      headers: { 'Accept': 'application/json' }
    })
    .then(function (r) { return r.json(); })
    .then(function (results) {
      if (results && results.length > 0) {
        var lat = parseFloat(results[0].lat);
        var lon = parseFloat(results[0].lon);
        st.map.setView([lat, lon], 10);
        L.marker([lat, lon]).addTo(st.map)
          .bindPopup('<strong>' + escHtml(results[0].display_name) + '</strong>').openPopup();
      }
    })
    .catch(function (e) { console.error('Search error', e); });
  }

  function doLocate() {
    if (!navigator.geolocation) { alert('Geolocation not supported by your browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      function (pos) { st.map.setView([pos.coords.latitude, pos.coords.longitude], 11); },
      function ()    { alert('Unable to retrieve your location.'); }
    );
  }

  /* ── URL hash ─────────────────────────────────────────────────── */

  function writeHash() {
    var c = st.map.getCenter();
    var z = st.map.getZoom();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + z);
  }

  function readHash() {
    var hash = window.location.hash.replace('#', '');
    if (!hash) return;
    var parts = {};
    hash.split('&').forEach(function (seg) {
      var kv = seg.split('=');
      if (kv.length === 2) parts[kv[0]] = kv[1];
    });
    if (parts.lat && parts.lng && parts.z) {
      st.hashView = [parseFloat(parts.lat), parseFloat(parts.lng), parseInt(parts.z, 10)];
    }
  }

  /* ── Bootstrap ────────────────────────────────────────────────── */

  function ready() {
    if (typeof L === 'undefined' || !document.getElementById('us-power-plants-map')) {
      setTimeout(ready, 80);
      return;
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

})();
