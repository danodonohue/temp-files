(function () {
  'use strict';

  // EPA PFAS Analytic Tools FeatureServer
  var BASE = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/PFAS_Analytic_Tools_Layers/FeatureServer';
  var URL_UCMR     = BASE + '/1/query';   // Drinking water (UCMR 5)
  var URL_SUPER    = BASE + '/2/query';   // Superfund w/ PFAS
  var URL_FED      = BASE + '/13/query';  // Federal / DoD sites
  var URL_SPILLS   = BASE + '/12/query';  // Spills

  // EPA final MCLs (April 2024 NPDWR), all in ng/L = ppt.
  // PFOA + PFOS were retained in May 2025 (compliance deadline now 2031).
  // PFHxS / PFNA / HFPO-DA / Hazard Index are under EPA reconsideration as
  // of spring 2026; we still flag exceedances against the published 2024 MCL
  // but label them clearly as "April 2024 MCL (under reconsideration)".
  var MCL_FINAL = { PFOA: 4.0, PFOS: 4.0 };
  var MCL_2024  = { PFHxS: 10.0, PFNA: 10.0, 'HFPO-DA': 10.0 };

  // Color tiers
  var TIER = {
    red:    { color: '#b03326', label: 'Exceeds final MCL (PFOA/PFOS)' },
    orange: { color: '#c97f15', label: 'Exceeds April 2024 MCL (under EPA reconsideration)' },
    yellow: { color: '#e8c84d', label: 'Detected, no MCL exceedance' }
  };

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

  var container = document.getElementById('pfas-state-spoke-container');
  if (!container) return;

  var stateAbbr = (container.getAttribute('data-state') || 'CA').toUpperCase();
  var stateName = container.getAttribute('data-state-name') || stateAbbr;
  // EPA dataset stores State with leading space (e.g. " CA").
  var stateForQuery = ' ' + stateAbbr;
  var bounds = STATE_BOUNDS[stateAbbr] || [[24, -125], [50, -66]];

  // Hash params (pss- prefix to avoid collisions with hub or other widgets).
  var hashParams = {};
  if (window.location.hash) {
    window.location.hash.slice(1).split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) hashParams[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
  }

  // ------ Build UI ------
  container.innerHTML =
    '<div class="pss-stats-strip">' +
      '<div class="pss-stat-box"><span class="pss-stat-value" data-pss="stat-utilities">--</span><span class="pss-stat-label">Utilities w/ PFAS detected</span></div>' +
      '<div class="pss-stat-box"><span class="pss-stat-value" data-pss="stat-population">--</span><span class="pss-stat-label">People served</span></div>' +
      '<div class="pss-stat-box pss-stat-alert"><span class="pss-stat-value" data-pss="stat-mcl">--</span><span class="pss-stat-label">Above final MCL (PFOA/PFOS)</span></div>' +
      '<div class="pss-stat-box"><span class="pss-stat-value pss-stat-sm" data-pss="stat-top">--</span><span class="pss-stat-label">Most-detected compound</span></div>' +
    '</div>' +
    '<div class="pss-controls">' +
      '<div class="pss-search-row">' +
        '<input type="search" class="pss-search-input" placeholder="Search ZIP, address or city in ' + esc(stateName) + '" aria-label="Search address or ZIP" data-pss="search-input">' +
        '<button type="button" class="pss-btn pss-btn-primary" data-pss="search">Search</button>' +
        '<button type="button" class="pss-btn" data-pss="locate">Find near me</button>' +
        '<span class="pss-search-msg" data-pss="search-msg"></span>' +
      '</div>' +
      '<div class="pss-layer-row">' +
        '<span class="pss-ctrl-label">Show on map</span>' +
        '<div class="pss-layer-chips" data-pss="layer-chips"></div>' +
      '</div>' +
      '<div class="pss-legend-row">' +
        '<span class="pss-ctrl-label">Drinking-water marker key</span>' +
        '<div class="pss-legend">' +
          '<span class="pss-legend-item"><span class="pss-legend-dot" style="background:' + TIER.red.color + '"></span>' + esc(TIER.red.label) + '</span>' +
          '<span class="pss-legend-item"><span class="pss-legend-dot" style="background:' + TIER.orange.color + '"></span>' + esc(TIER.orange.label) + '</span>' +
          '<span class="pss-legend-item"><span class="pss-legend-dot" style="background:' + TIER.yellow.color + '"></span>' + esc(TIER.yellow.label) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="pss-map-wrap">' +
      '<div class="pss-map" data-pss="map"></div>' +
      '<div class="pss-loading" data-pss="loading">' +
        '<div class="pss-spinner"></div>' +
        '<p>Loading ' + esc(stateName) + ' PFAS data...</p>' +
      '</div>' +
    '</div>' +
    '<div class="pss-attrib">Data: <a href="https://echo.epa.gov/trends/pfas-tools" target="_blank" rel="noopener">EPA PFAS Analytic Tools</a> &middot; UCMR 5 (2023&ndash;2025), Superfund, Federal sites, Spills &middot; Base map &copy; OpenStreetMap &copy; CARTO</div>' +
    '<div class="pss-table-wrap" data-pss="table-wrap" hidden>' +
      '<div class="pss-table-title" data-pss="table-title">Top utilities by PFAS impact &mdash; click any row to zoom to it on the map</div>' +
      '<table class="pss-utility-table">' +
        '<thead><tr>' +
          '<th>#</th><th>Utility</th><th class="pss-col-pop pss-th-num">Population</th>' +
          '<th class="pss-col-zip">ZIP(s)</th><th class="pss-th-num">Highest&nbsp;ng/L</th>' +
          '<th>Compound</th><th>Status</th>' +
        '</tr></thead>' +
        '<tbody data-pss="table-body"></tbody>' +
      '</table>' +
    '</div>';

  function get(key) { return container.querySelector('[data-pss="' + key + '"]'); }

  // ------ Map init ------
  var initLat  = hashParams['pss-lat'] ? parseFloat(hashParams['pss-lat']) : null;
  var initLng  = hashParams['pss-lng'] ? parseFloat(hashParams['pss-lng']) : null;
  var initZoom = hashParams['pss-z'] ? parseInt(hashParams['pss-z'], 10) : null;

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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Drinking-water cluster (one marker per utility, MCL-tiered color)
  var utilityCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 12,
    chunkedLoading: true
  });
  map.addLayer(utilityCluster);

  // Optional source-context layers (load on demand)
  var sourceLayers = {
    super:  { group: L.layerGroup(), loaded: false, label: 'Superfund sites',
              color: '#7c3aed', shape: 'square', url: URL_SUPER, on: false },
    fed:    { group: L.layerGroup(), loaded: false, label: 'Federal / DoD sites',
              color: '#1e3a8a', shape: 'diamond', url: URL_FED, on: false },
    spills: { group: L.layerGroup(), loaded: false, label: 'PFAS spills',
              color: '#475569', shape: 'circle', url: URL_SPILLS, on: false }
  };

  // ------ State ------
  var allUtilities = [];        // { F_PWS_ID, name, lat, lng, pop, zips, waterType, samples, tier, maxNgL, maxCompound }
  var utilityMarkerById = {};

  // ------ Helpers ------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Defensive check before rendering a link from EPA data — some "Link" fields
  // in the Federal-sites layer are bare hostnames or malformed strings.
  function isValidUrl(s) {
    if (!s) return false;
    return /^https?:\/\//i.test(String(s).trim());
  }

  function parsePop(s) {
    if (s == null) return null;
    var n = parseInt(String(s).replace(/[^0-9]/g, ''), 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  function parseDate(s) {
    if (!s) return 0;
    // e.g. "5/29/2024"
    var d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function classifyCompound(c, val) {
    if (val == null) return 'yellow';
    if (MCL_FINAL[c] != null && val > MCL_FINAL[c]) return 'red';
    if (MCL_2024[c]  != null && val > MCL_2024[c])  return 'orange';
    return 'yellow';
  }

  function tierRank(t) { return t === 'red' ? 3 : t === 'orange' ? 2 : 1; }

  // (utility tier is computed during aggregation via the worst-exceedance pass)

  // ------ Load drinking-water (UCMR) for state ------
  function fetchPage(offset) {
    var fields = 'F_PWS_ID,PWS_Name,Population_Served,ZIP_Codes_Served,Latitude,Longitude,' +
                 'Contaminant,Analytical_Result_Value__ng_L_,Collection_Date,Most_Recent_Sample,' +
                 'Facility_Water_Type';
    var where = "State='" + stateForQuery + "' AND Result_At_or_Above_UCMR_MRL='Yes'";
    var url = URL_UCMR +
      '?where=' + encodeURIComponent(where) +
      '&outFields=' + fields +
      '&returnGeometry=false' +
      '&resultRecordCount=2000' +
      '&resultOffset=' + offset +
      '&orderByFields=F_PWS_ID' +
      '&f=json';
    return fetch(url).then(function (r) { return r.json(); });
  }

  function loadUcmr() {
    var allRows = [];
    function next(offset) {
      return fetchPage(offset).then(function (j) {
        if (!j || !j.features) throw new Error('No features');
        var batch = j.features.map(function (f) { return f.attributes; });
        allRows = allRows.concat(batch);
        if (j.exceededTransferLimit || batch.length === 2000) {
          return next(offset + 2000);
        }
        return allRows;
      });
    }
    return next(0);
  }

  function aggregateUtilities(rows) {
    var byPws = {};
    rows.forEach(function (r) {
      var id = r.F_PWS_ID;
      if (!id) return;
      var u = byPws[id];
      if (!u) {
        u = byPws[id] = {
          F_PWS_ID: id,
          name: (r.PWS_Name || '').trim(),
          lat: r.Latitude,
          lng: r.Longitude,
          pop: parsePop(r.Population_Served),
          zips: r.ZIP_Codes_Served || '',
          waterType: r.Facility_Water_Type || '',
          samples: {} // compound -> { value, date }
        };
      }
      var c = (r.Contaminant || '').trim();
      var v = r.Analytical_Result_Value__ng_L_;
      var d = parseDate(r.Collection_Date);
      if (!c || v == null) return;
      var prev = u.samples[c];
      // Keep most-recent sample per compound; on tie, keep highest value
      if (!prev || d > prev.date || (d === prev.date && v > prev.value)) {
        u.samples[c] = { value: v, date: d, dateStr: r.Collection_Date };
      }
    });

    var list = [];
    Object.keys(byPws).forEach(function (id) {
      var u = byPws[id];
      if (u.lat == null || u.lng == null) return;
      // Overall max across any compound (for low-detection states with no MCL exceedance)
      var maxC = null, maxV = -Infinity;
      // Worst MCL exceedance — the compound with the highest ratio over its MCL.
      // This is what we report in the utility table when a utility is in red/orange tier
      // so we don't mislead readers by showing an unregulated compound's high reading
      // under a "Final MCL" status tag.
      var worst = null;
      Object.keys(u.samples).forEach(function (c) {
        var v = u.samples[c].value;
        if (v > maxV) { maxV = v; maxC = c; }
        var mcl = MCL_FINAL[c] != null ? MCL_FINAL[c] : (MCL_2024[c] != null ? MCL_2024[c] : null);
        if (mcl != null && v > mcl) {
          var ratio = v / mcl;
          var tier = MCL_FINAL[c] != null ? 'red' : 'orange';
          if (!worst ||
              tierRank(tier) > tierRank(worst.tier) ||
              (tierRank(tier) === tierRank(worst.tier) && ratio > worst.ratio)) {
            worst = { compound: c, value: v, mcl: mcl, ratio: ratio, tier: tier };
          }
        }
      });
      u.maxNgL = isFinite(maxV) ? maxV : null;
      u.maxCompound = maxC;
      u.worst = worst; // null when no MCL exceedance (yellow tier)
      u.tier = worst ? worst.tier : 'yellow';
      list.push(u);
    });
    return list;
  }

  // ------ Markers ------
  function tieredIcon(tier) {
    var c = TIER[tier].color;
    return L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:' + c +
            ';border:1.5px solid rgba(0,0,0,0.45);box-shadow:0 0 0 1px rgba(255,255,255,0.65);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function utilityPopup(u) {
    var rows = Object.keys(u.samples).map(function (c) {
      var s = u.samples[c];
      return { compound: c, value: s.value, date: s.dateStr, tier: classifyCompound(c, s.value) };
    }).sort(function (a, b) { return b.value - a.value; });

    var head =
      '<strong>' + esc(u.name || 'Unknown system') + '</strong><br>' +
      'PWS ID: <code>' + esc(u.F_PWS_ID) + '</code><br>' +
      (u.pop ? 'Population served: ' + u.pop.toLocaleString() + '<br>' : '') +
      (u.zips ? 'ZIP(s): ' + esc(u.zips) + '<br>' : '') +
      (u.waterType ? 'Source type: ' + esc(u.waterType) + '<br>' : '');

    var tableRows = rows.map(function (r) {
      var tag = r.tier === 'red'
        ? '<span class="pss-popup-tag pss-tag-red">&gt; final MCL</span>'
        : r.tier === 'orange'
        ? '<span class="pss-popup-tag pss-tag-orange">&gt; 2024 MCL</span>'
        : '';
      return '<tr class="pss-popup-row-' + r.tier + '">' +
             '<td>' + esc(r.compound) + '</td>' +
             '<td class="pss-num">' + r.value.toFixed(1) + '</td>' +
             '<td>' + tag + '</td>' +
             '</tr>';
    }).join('');

    var table =
      '<table class="pss-popup-table">' +
        '<thead><tr><th>Compound</th><th class="pss-num">ng/L</th><th></th></tr></thead>' +
        '<tbody>' + tableRows + '</tbody>' +
      '</table>';

    return '<div class="pss-popup">' + head + table + '</div>';
  }

  function buildUtilityMarkers() {
    utilityCluster.clearLayers();
    utilityMarkerById = {};
    var batch = [];
    allUtilities.forEach(function (u) {
      var m = L.marker([u.lat, u.lng], { icon: tieredIcon(u.tier), riseOnHover: true });
      m.bindPopup(utilityPopup(u));
      utilityMarkerById[u.F_PWS_ID] = m;
      batch.push(m);
    });
    utilityCluster.addLayers(batch);
  }

  // ------ Stats ------
  function updateStats() {
    var nUtil = allUtilities.length;
    var pop = allUtilities.reduce(function (s, u) { return s + (u.pop || 0); }, 0);
    var nMcl = allUtilities.filter(function (u) { return u.tier === 'red'; }).length;

    // Most-detected compound (count of utilities with that compound in samples)
    var counts = {};
    allUtilities.forEach(function (u) {
      Object.keys(u.samples).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];

    get('stat-utilities').textContent = nUtil.toLocaleString();
    get('stat-population').textContent = pop.toLocaleString();
    get('stat-mcl').textContent = nMcl.toLocaleString();
    get('stat-top').textContent = top
      ? top + ' (' + counts[top].toLocaleString() + ' utilities)'
      : '--';
  }

  // ------ Utility table ------
  // For red/orange utilities the table shows the worst MCL-exceeding compound
  // (e.g. "PFOA 4.1 ng/L" with status "> 4 ppt MCL"), not the overall max — the
  // overall max may be on an unregulated compound with no MCL.
  function renderTable() {
    var top = allUtilities.slice().sort(function (a, b) {
      var rd = tierRank(b.tier) - tierRank(a.tier);
      if (rd !== 0) return rd;
      // Within tier: rank by ratio over MCL (red/orange) or by absolute ng/L (yellow).
      if (a.worst && b.worst) return b.worst.ratio - a.worst.ratio;
      return (b.maxNgL || 0) - (a.maxNgL || 0);
    }).slice(0, 25);

    if (!top.length) return;
    get('table-wrap').hidden = false;
    var tbody = get('table-body');
    tbody.innerHTML = '';
    top.forEach(function (u, i) {
      var headlineCompound, headlineValue, statusTag;
      if (u.worst) {
        headlineCompound = u.worst.compound;
        headlineValue = u.worst.value;
        var tagClass = u.tier === 'red' ? 'pss-tag-red' : 'pss-tag-orange';
        var tagLabel = u.tier === 'red' ? 'Final MCL' : '2024 MCL';
        statusTag = '<span class="pss-popup-tag ' + tagClass + '">' + tagLabel +
                    '</span> ' + (u.worst.value / u.worst.mcl).toFixed(1) + 'x';
      } else {
        headlineCompound = u.maxCompound;
        headlineValue = u.maxNgL;
        statusTag = '<span class="pss-popup-tag pss-tag-yellow">Detected only</span>';
      }
      var tr = document.createElement('tr');
      tr.dataset.pwsId = u.F_PWS_ID;
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td><strong>' + esc(u.name) + '</strong></td>' +
        '<td class="pss-col-pop pss-num">' + (u.pop ? u.pop.toLocaleString() : '--') + '</td>' +
        '<td class="pss-col-zip">' + esc(u.zips || '--') + '</td>' +
        '<td class="pss-num">' + (headlineValue != null ? headlineValue.toFixed(1) : '--') + '</td>' +
        '<td>' + esc(headlineCompound || '--') + '</td>' +
        '<td>' + statusTag + '</td>';
      tr.addEventListener('click', function () {
        var m = utilityMarkerById[u.F_PWS_ID];
        if (!m) return;
        utilityCluster.zoomToShowLayer(m, function () {
          m.openPopup();
          map.panTo(m.getLatLng());
        });
      });
      tbody.appendChild(tr);
    });
  }

  // ------ Source-context layers ------
  function shapeIcon(spec) {
    var s = spec.shape, c = spec.color;
    var html;
    if (s === 'square') {
      html = '<div style="width:11px;height:11px;background:' + c + ';border:1.5px solid rgba(0,0,0,0.5);"></div>';
    } else if (s === 'diamond') {
      html = '<div style="width:11px;height:11px;background:' + c + ';border:1.5px solid rgba(0,0,0,0.5);transform:rotate(45deg);margin:1px;"></div>';
    } else {
      html = '<div style="width:9px;height:9px;background:' + c + ';border:1.5px solid rgba(0,0,0,0.5);border-radius:50%;"></div>';
    }
    return L.divIcon({ className: '', html: html, iconSize: [13, 13], iconAnchor: [6, 6] });
  }

  function loadSourceLayer(key) {
    var spec = sourceLayers[key];
    if (spec.loaded) return Promise.resolve();
    var fields, popupFn;
    if (key === 'super') {
      fields = 'F_Site_Name,City,County,NPL_Status,Site_Type,Address,Link,Latitude,Longitude';
      popupFn = function (a) {
        var lines = [];
        lines.push('<strong>' + esc(a.F_Site_Name) + '</strong>');
        lines.push('Superfund site &middot; PFAS-flagged');
        if (a.NPL_Status) lines.push('NPL status: ' + esc(a.NPL_Status));
        if (a.City || a.County) lines.push(esc([a.City, a.County].filter(Boolean).join(', ')));
        if (a.Address) lines.push(esc(a.Address));
        if (isValidUrl(a.Link)) lines.push('<a href="' + esc(a.Link) + '" target="_blank" rel="noopener">EPA site report</a>');
        return '<div class="pss-popup">' + lines.join('<br>') + '</div>';
      };
    } else if (key === 'fed') {
      fields = 'F_Site_Name,Federal_Agency,Property_Type,DoD_Reported_Cleanup_Status,' +
               'PFOA_Maximum_Detected_in_Groundwater__ppt_,PFOS_Maximum_Detected_in_Groundwater__ppt_,' +
               'Link,Latitude,Longitude';
      popupFn = function (a) {
        var lines = [];
        lines.push('<strong>' + esc(a.F_Site_Name) + '</strong>');
        if (a.Federal_Agency) lines.push('Agency: ' + esc(a.Federal_Agency));
        if (a.Property_Type) lines.push('Type: ' + esc(a.Property_Type));
        if (a.DoD_Reported_Cleanup_Status) lines.push('Cleanup status: ' + esc(a.DoD_Reported_Cleanup_Status));
        var pfoa = a.PFOA_Maximum_Detected_in_Groundwater__ppt_;
        var pfos = a.PFOS_Maximum_Detected_in_Groundwater__ppt_;
        if (pfoa) lines.push('Max PFOA in groundwater: ' + esc(pfoa) + ' ppt');
        if (pfos) lines.push('Max PFOS in groundwater: ' + esc(pfos) + ' ppt');
        if (isValidUrl(a.Link)) lines.push('<a href="' + esc(a.Link) + '" target="_blank" rel="noopener">Site report</a>');
        return '<div class="pss-popup">' + lines.join('<br>') + '</div>';
      };
    } else {
      // spills
      fields = 'Year,Material_Involved,Amount_of_Material,Unit,Responsible_Company,' +
               'Water_Reached_,Amount_in_Water,Unit_Reached_Water,Address,City,County,' +
               'Date,Latitude,Longitude';
      popupFn = function (a) {
        var lines = [];
        lines.push('<strong>' + esc(a.Material_Involved || 'PFAS spill') + '</strong>');
        if (a.Date) lines.push('Date: ' + esc(a.Date));
        if (a.Amount_of_Material != null) lines.push('Amount: ' + esc(a.Amount_of_Material) + ' ' + esc(a.Unit || ''));
        if (a.Water_Reached_) lines.push('Reached water: ' + esc(a.Water_Reached_) +
          (a.Amount_in_Water != null ? ' (' + esc(a.Amount_in_Water) + ' ' + esc(a.Unit_Reached_Water || '') + ')' : ''));
        if (a.Responsible_Company) lines.push('Responsible: ' + esc(a.Responsible_Company));
        if (a.City || a.County) lines.push(esc([a.City, a.County].filter(Boolean).join(', ')));
        return '<div class="pss-popup">' + lines.join('<br>') + '</div>';
      };
    }

    var where = "State='" + stateForQuery + "'";
    var url = spec.url +
      '?where=' + encodeURIComponent(where) +
      '&outFields=' + fields +
      '&returnGeometry=false' +
      '&resultRecordCount=2000' +
      '&f=json';

    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.features) { spec.loaded = true; return; }
      j.features.forEach(function (f) {
        var a = f.attributes;
        if (a.Latitude == null || a.Longitude == null) return;
        var m = L.marker([a.Latitude, a.Longitude], { icon: shapeIcon(spec), riseOnHover: true });
        m.bindPopup(popupFn(a));
        spec.group.addLayer(m);
      });
      spec.loaded = true;
    });
  }

  function buildLayerChips() {
    var wrap = get('layer-chips');
    var data = [
      { key: 'water',  label: 'Drinking-water utilities', color: TIER.red.color, alwaysOn: true },
      { key: 'super',  label: sourceLayers.super.label,   color: sourceLayers.super.color },
      { key: 'fed',    label: sourceLayers.fed.label,     color: sourceLayers.fed.color },
      { key: 'spills', label: sourceLayers.spills.label,  color: sourceLayers.spills.color }
    ];
    data.forEach(function (d) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pss-layer-chip pss-layer-on';
      btn.dataset.layer = d.key;
      btn.innerHTML = '<span class="pss-layer-swatch" style="background:' + d.color + '"></span>' + esc(d.label);
      if (d.alwaysOn) {
        // The drinking-water layer is always on (it's the headline data); chip is informational.
        btn.title = 'Always on';
      } else {
        btn.classList.remove('pss-layer-on');
        btn.addEventListener('click', function () {
          toggleSourceLayer(d.key, btn);
        });
      }
      wrap.appendChild(btn);
    });
  }

  function toggleSourceLayer(key, btn) {
    var spec = sourceLayers[key];
    spec.on = !spec.on;
    btn.classList.toggle('pss-layer-on', spec.on);
    if (spec.on) {
      btn.disabled = true;
      var prevText = btn.innerHTML;
      btn.innerHTML = '<span class="pss-layer-swatch" style="background:' + spec.color + '"></span>Loading...';
      loadSourceLayer(key).then(function () {
        spec.group.addTo(map);
        btn.disabled = false;
        btn.innerHTML = prevText;
      });
    } else {
      map.removeLayer(spec.group);
    }
  }

  // ------ Search (ZIP-aware, then Nominatim) ------
  function onSearch() {
    var input = get('search-input');
    var q = (input.value || '').trim();
    if (!q) return;
    var msg = get('search-msg');

    // ZIP shortcut: if input looks like a 5-digit ZIP, jump to the matching utility(ies).
    if (/^\d{5}$/.test(q)) {
      var hits = allUtilities.filter(function (u) {
        if (!u.zips) return false;
        return u.zips.split(/[;,]\s*/).indexOf(q) !== -1;
      });
      if (hits.length) {
        var u = hits[0];
        msg.textContent = 'ZIP ' + q + ' matched ' + hits.length + ' utility' + (hits.length === 1 ? '' : 'ies') + ' (showing ' + u.name + ').';
        var m = utilityMarkerById[u.F_PWS_ID];
        if (m) {
          utilityCluster.zoomToShowLayer(m, function () {
            m.openPopup();
            map.panTo(m.getLatLng());
          });
        }
        return;
      }
      // No utility match — fall through to geocode so user still gets centered.
      msg.textContent = 'No utility in this dataset listed ZIP ' + q + ' &mdash; centering map on that ZIP. Your water may be served by a small system that wasn\'t required to test under UCMR 5.';
    } else {
      msg.textContent = 'Searching...';
    }

    var vb = [bounds[0][1], bounds[1][0], bounds[1][1], bounds[0][0]].join(','); // W,N,E,S
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
              encodeURIComponent(q) + '&viewbox=' + vb + '&bounded=1&countrycodes=us';
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results || !results.length) {
          if (!/^\d{5}$/.test(q)) msg.textContent = 'No match in ' + stateName + '. Try a more specific address.';
          return;
        }
        var r = results[0];
        var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
        if (!/^\d{5}$/.test(q)) msg.textContent = r.display_name;
        placeUserPin(lat, lng, 'Search: ' + q);
        map.setView([lat, lng], 11);
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
        btn.disabled = false; btn.textContent = 'Find near me';
      },
      function () {
        alert('Could not get your location. Check browser permissions.');
        btn.disabled = false; btn.textContent = 'Find near me';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  get('search').addEventListener('click', onSearch);
  get('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); onSearch(); }
  });

  // ------ Share-link hash ------
  map.on('moveend zoomend', function () {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#pss-lat=' + c.lat.toFixed(4) + '&pss-lng=' + c.lng.toFixed(4) + '&pss-z=' + map.getZoom());
  });

  // ------ Loading ------
  function hideLoading() {
    var el = get('loading');
    if (el) el.style.display = 'none';
  }

  function showError(msg) {
    var el = get('loading');
    if (el) el.innerHTML = '<p style="color:#b03326;text-align:center;padding:0 20px;"><strong>Could not load PFAS data.</strong><br>' + esc(msg) + '<br><a href="#" onclick="location.reload();return false;">Retry</a></p>';
  }

  // ------ Go ------
  buildLayerChips();

  loadUcmr().then(function (rows) {
    allUtilities = aggregateUtilities(rows);
    if (!allUtilities.length) {
      hideLoading();
      var msg = document.createElement('div');
      msg.style.cssText = 'padding:18px;background:#f5faff;border:1px solid #c7d9eb;border-radius:6px;margin-top:10px;font-size:0.9rem;color:#244560;';
      msg.innerHTML = '<strong>No UCMR 5 detections in ' + esc(stateName) + ' at or above the minimum reporting level.</strong><br>' +
                      'Use the layer toggles above to view PFAS-flagged Superfund, federal/DoD, or spill sites in ' + esc(stateName) + '.';
      get('map-wrap') ? null : null;
      container.querySelector('.pss-map-wrap').insertAdjacentElement('afterend', msg);
      return;
    }
    buildUtilityMarkers();
    updateStats();
    renderTable();
    hideLoading();
  }).catch(function (err) {
    console.error('pss: load error', err);
    showError('The EPA service may be slow or temporarily offline.');
  });
}());
