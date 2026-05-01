(function () {
  'use strict';

  var SERVICE_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/US_Wind_Turbine_Database/FeatureServer/0';

  var CAP_RANGES = [
    { label: 'All Capacities', where: '' },
    { label: '< 1 MW',         where: 't_cap > 0 AND t_cap < 1000' },
    { label: '1 - 2 MW',       where: 't_cap >= 1000 AND t_cap < 2000' },
    { label: '2 - 3 MW',       where: 't_cap >= 2000 AND t_cap < 3000' },
    { label: '3+ MW',          where: 't_cap >= 3000' }
  ];

  var filters  = { mfr: '', capIdx: 0 };
  var analysis = { active: false, marker: null, circle: null, radiusMi: 25 };
  var analysisControl = null;
  var initialHash = parseHash();

  // ── Where clause ──────────────────────────────────────────────────────────
  function buildWhere() {
    var parts = [];
    if (filters.mfr) parts.push("t_manu = '" + filters.mfr.replace(/'/g, "''") + "'");
    var capWhere = CAP_RANGES[filters.capIdx].where;
    if (capWhere) parts.push(capWhere);
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  function turbineColor(cap) {
    if (!cap || cap <= 0) return '#95a5a6';
    if (cap < 1000)       return '#f39c12';
    if (cap < 2000)       return '#27ae60';
    if (cap < 3000)       return '#2980b9';
    return '#8e44ad';
  }

  // ── Map init ──────────────────────────────────────────────────────────────
  var initLat  = initialHash.lat ? parseFloat(initialHash.lat) : 39.5;
  var initLng  = initialHash.lng ? parseFloat(initialHash.lng) : -98.35;
  var initZoom = initialHash.z   ? parseInt(initialHash.z, 10) : 4;

  var map = L.map('us-wind-turbines-map-map', {
    center: [initLat, initLng],
    zoom: initZoom
  });

  var cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abcd',
    maxZoom: 19
  });

  var esriSatellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, USDA USGS, AeroGRID, IGN',
    maxZoom: 19
  });

  cartoLight.addTo(map);

  L.control.layers(
    { 'Map': cartoLight, 'Satellite': esriSatellite },
    {},
    { position: 'topright', collapsed: false }
  ).addTo(map);

  // ── Controls ──────────────────────────────────────────────────────────────
  var capOpts = CAP_RANGES.map(function (r, i) {
    return '<option value="' + i + '">' + r.label + '</option>';
  }).join('');

  var controlsEl = document.querySelector('#us-wind-turbines-map-container .wt-controls');
  controlsEl.innerHTML =
    '<select id="wt-mfr" aria-label="Filter by manufacturer"><option value="">All Manufacturers</option></select>' +
    '<select id="wt-cap" aria-label="Filter by capacity">' + capOpts + '</select>' +
    '<button id="wt-analyze-btn" type="button">Analyze Area</button>' +
    '<span class="wt-stats"><strong id="wt-count">—</strong> turbines | <strong id="wt-mw">—</strong> MW</span>';

  if (initialHash.cap !== undefined) {
    var capIdx = parseInt(initialHash.cap, 10);
    if (capIdx >= 0 && capIdx < CAP_RANGES.length) {
      filters.capIdx = capIdx;
      document.getElementById('wt-cap').value = capIdx;
    }
  }

  // ── Turbine layer ─────────────────────────────────────────────────────────
  var turbineLayer = L.esri.Cluster.featureLayer({
    url: SERVICE_URL,
    where: buildWhere(),
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 5,
        fillColor: turbineColor(feature.properties.t_cap),
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.85
      });
    },
    onEachFeature: function (feature, layer) {
      var p    = feature.properties;
      var capMW = (p.t_cap && p.t_cap > 0)   ? (p.t_cap / 1000).toFixed(2) + ' MW' : '—';
      var hh    = (p.t_hh  && p.t_hh  > 0)   ? p.t_hh  + ' m'               : '—';
      var year  = (p.p_year && p.p_year > 1900) ? p.p_year                   : '—';
      var mfr   = (p.t_manu && p.t_manu !== 'missing') ? p.t_manu             : '—';
      var model = (p.t_model && p.t_model !== 'missing') ? ' ' + p.t_model    : '';
      layer.bindPopup(
        '<strong>' + (p.p_name || 'Wind Farm') + '</strong><br>' +
        mfr + model + '<br>' +
        'Capacity: ' + capMW + '<br>' +
        'Hub height: ' + hh + '<br>' +
        'Year online: ' + year + '<br>' +
        'State: ' + (p.t_state || '—'),
        { maxWidth: 260 }
      );
    }
  }).addTo(map);

  // ── Stats ─────────────────────────────────────────────────────────────────
  function refreshStats() {
    document.getElementById('wt-count').textContent = '…';
    document.getElementById('wt-mw').textContent    = '…';
    var stats = JSON.stringify([
      { statisticType: 'count', onStatisticField: 'FID',   outStatisticFieldName: 'cnt' },
      { statisticType: 'sum',   onStatisticField: 't_cap', outStatisticFieldName: 'total_kw' }
    ]);
    var base = buildWhere();
    var statsWhere = base === '1=1' ? 't_cap > 0' : base + ' AND t_cap > 0';
    fetch(SERVICE_URL + '/query?where=' + encodeURIComponent(statsWhere) +
      '&outStatistics=' + encodeURIComponent(stats) +
      '&returnGeometry=false&f=json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.features && data.features[0]) {
          var a  = data.features[0].attributes;
          var mw = a.total_kw ? Math.round(a.total_kw / 1000) : 0;
          document.getElementById('wt-count').textContent = (a.cnt || 0).toLocaleString();
          document.getElementById('wt-mw').textContent    = mw.toLocaleString();
        }
      })
      .catch(function () {
        document.getElementById('wt-count').textContent = '—';
        document.getElementById('wt-mw').textContent    = '—';
      });
  }

  turbineLayer.on('load', refreshStats);

  function applyFilters() {
    turbineLayer.setWhere(buildWhere());
    refreshStats();
    updateShareUrl();
  }

  document.getElementById('wt-mfr').addEventListener('change', function () {
    filters.mfr = this.value;
    applyFilters();
  });
  document.getElementById('wt-cap').addEventListener('change', function () {
    filters.capIdx = parseInt(this.value, 10);
    applyFilters();
  });

  // ── Manufacturers dropdown ────────────────────────────────────────────────
  fetch(SERVICE_URL + '/query?where=1%3D1&outFields=t_manu&returnDistinctValues=true&returnGeometry=false&f=json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.features) return;
      var bad  = { 'missing': 1, '-9999': 1, 'unknown': 1, 'Unknown': 1 };
      var mfrs = data.features
        .map(function (f) { return f.attributes.t_manu; })
        .filter(function (m) { return m && m.trim() && !bad[m]; })
        .sort();
      var sel = document.getElementById('wt-mfr');
      mfrs.forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        sel.appendChild(opt);
      });
      if (initialHash.mfr) {
        filters.mfr = initialHash.mfr;
        sel.value   = initialHash.mfr;
        applyFilters();
      }
    })
    .catch(function () {});

  // ── Analysis mode ─────────────────────────────────────────────────────────
  var analyzeBtn = document.getElementById('wt-analyze-btn');

  analyzeBtn.addEventListener('click', function () {
    if (analysis.active) {
      exitAnalysis();
    } else {
      enterAnalysis();
    }
  });

  function enterAnalysis() {
    analysis.active = true;
    analyzeBtn.classList.add('active');
    analyzeBtn.textContent = 'Cancel Analysis';
    map.getContainer().style.cursor = 'crosshair';
  }

  function exitAnalysis() {
    analysis.active = false;
    analyzeBtn.classList.remove('active');
    analyzeBtn.textContent = 'Analyze Area';
    map.getContainer().style.cursor = '';
    clearAnalysisLayers();
    if (analysisControl) {
      map.removeControl(analysisControl);
      analysisControl = null;
    }
  }

  function clearAnalysisLayers() {
    if (analysis.marker) { map.removeLayer(analysis.marker); analysis.marker = null; }
    if (analysis.circle) { map.removeLayer(analysis.circle); analysis.circle = null; }
  }

  map.on('click', function (e) {
    if (!analysis.active) return;
    runAnalysis(e.latlng);
  });

  function runAnalysis(latlng) {
    clearAnalysisLayers();

    analysis.marker = L.circleMarker(latlng, {
      radius: 8, fillColor: '#e74c3c', color: '#fff', weight: 2,
      opacity: 1, fillOpacity: 1
    }).addTo(map);

    analysis.circle = L.circle(latlng, {
      radius: analysis.radiusMi * 1609.34,
      color: '#e74c3c', weight: 1.5,
      fillColor: '#e74c3c', fillOpacity: 0.07
    }).addTo(map);

    showAnalysisPanel(latlng, '…', null);
    queryAnalysis(latlng);
  }

  function queryAnalysis(latlng) {
    var geomStr  = encodeURIComponent(JSON.stringify({ x: latlng.lng, y: latlng.lat }));
    var spatialQ =
      '&geometryType=esriGeometryPoint' +
      '&geometry='    + geomStr +
      '&inSR=4326' +
      '&spatialRel=esriSpatialRelIntersects' +
      '&distance='    + analysis.radiusMi +
      '&units=esriSRUnit_StatuteMile';

    // Parallel: count + nearby features for nearest calculation
    var countPromise = fetch(
      SERVICE_URL + '/query?where=1%3D1' + spatialQ + '&returnCountOnly=true&f=json'
    ).then(function (r) { return r.json(); });

    var featPromise = fetch(
      SERVICE_URL + '/query?where=1%3D1' + spatialQ +
      '&outFields=xlong,ylat,p_name,t_manu,t_cap,t_hh,p_year' +
      '&returnGeometry=false&resultRecordCount=200&f=json'
    ).then(function (r) { return r.json(); });

    Promise.all([countPromise, featPromise])
      .then(function (results) {
        var count   = results[0].count || 0;
        var nearby  = results[1].features || [];
        var nearest = findNearest(latlng, nearby);
        showAnalysisPanel(latlng, count, nearest);
      })
      .catch(function () {
        showAnalysisPanel(latlng, '—', null);
      });
  }

  function findNearest(latlng, features) {
    if (!features.length) return null;
    var clickPt  = turf.point([latlng.lng, latlng.lat]);
    var best     = null;
    var bestDist = Infinity;
    features.forEach(function (f) {
      var a = f.attributes;
      if (!a.xlong || !a.ylat) return;
      var d = turf.distance(clickPt, turf.point([a.xlong, a.ylat]), { units: 'miles' });
      if (d < bestDist) { bestDist = d; best = { attrs: a, distMi: d }; }
    });
    return best;
  }

  function showAnalysisPanel(latlng, count, nearest) {
    if (analysisControl) { map.removeControl(analysisControl); analysisControl = null; }

    analysisControl = L.control({ position: 'bottomleft' });
    analysisControl.onAdd = function () {
      var div = L.DomUtil.create('div', 'wt-analysis-panel');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      var nearestHtml = '';
      if (nearest) {
        var a     = nearest.attrs;
        var capMW = (a.t_cap && a.t_cap > 0) ? (a.t_cap / 1000).toFixed(2) + ' MW' : '—';
        var hh    = (a.t_hh  && a.t_hh  > 0) ? a.t_hh + ' m' : '—';
        var year  = (a.p_year && a.p_year > 1900) ? a.p_year : '—';
        nearestHtml =
          '<div class="wt-ap-nearest">' +
            '<div class="wt-ap-label">Nearest turbine</div>' +
            '<strong>' + (a.p_name || 'Wind Farm') + '</strong><br>' +
            (a.t_manu || '—') + ' &bull; ' + capMW + '<br>' +
            'Hub height: ' + hh + ' &bull; Year: ' + year + '<br>' +
            '<span class="wt-ap-dist">' + nearest.distMi.toFixed(1) + ' miles away</span>' +
          '</div>';
      } else if (count !== '…') {
        nearestHtml = '<div class="wt-ap-nearest wt-ap-empty">No turbines found within radius.</div>';
      }

      div.innerHTML =
        '<div class="wt-ap-header">' +
          '<strong>Area Analysis</strong>' +
          '<button class="wt-ap-close" type="button">&times;</button>' +
        '</div>' +
        '<div class="wt-ap-count">' +
          '<span class="wt-ap-num">' + (typeof count === 'number' ? count.toLocaleString() : count) + '</span>' +
          ' turbines within ' + analysis.radiusMi + ' mi' +
        '</div>' +
        '<div class="wt-ap-radius">' +
          '<label>Radius: <strong id="wt-radius-val">' + analysis.radiusMi + ' mi</strong>' +
          '<input id="wt-radius-slider" type="range" min="5" max="100" step="5" value="' + analysis.radiusMi + '" /></label>' +
        '</div>' +
        nearestHtml;

      div.querySelector('.wt-ap-close').addEventListener('click', exitAnalysis);

      var slider = div.querySelector('#wt-radius-slider');
      slider.addEventListener('input', function () {
        var mi = parseInt(this.value, 10);
        div.querySelector('#wt-radius-val').textContent = mi + ' mi';
        analysis.radiusMi = mi;
        if (analysis.circle) {
          analysis.circle.setRadius(mi * 1609.34);
        }
      });
      slider.addEventListener('change', function () {
        analysis.radiusMi = parseInt(this.value, 10);
        queryAnalysis(latlng);
      });

      return div;
    };
    analysisControl.addTo(map);
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  var legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'wt-legend');
    div.innerHTML =
      '<strong>Capacity</strong>' +
      '<span><i style="background:#f39c12"></i>&lt; 1 MW</span>' +
      '<span><i style="background:#27ae60"></i>1 - 2 MW</span>' +
      '<span><i style="background:#2980b9"></i>2 - 3 MW</span>' +
      '<span><i style="background:#8e44ad"></i>3+ MW</span>' +
      '<span><i style="background:#95a5a6"></i>Unknown</span>';
    return div;
  };
  legend.addTo(map);

  // ── Share URL ─────────────────────────────────────────────────────────────
  function updateShareUrl() {
    var c = map.getCenter();
    var p = { lat: c.lat.toFixed(4), lng: c.lng.toFixed(4), z: map.getZoom() };
    if (filters.mfr)    p.mfr = filters.mfr;
    if (filters.capIdx) p.cap = filters.capIdx;
    var hash = '#' + Object.keys(p).map(function (k) {
      return k + '=' + encodeURIComponent(p[k]);
    }).join('&');
    history.replaceState(null, '', hash);
  }
  map.on('moveend', updateShareUrl);

  function parseHash() {
    var h = window.location.hash.slice(1);
    if (!h) return {};
    var out = {};
    h.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

})();
