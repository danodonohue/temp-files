(function () {
  'use strict';

  // -----------------------------------------------------------------------
  //  HIFLD US Electric Power Transmission Lines (authoritative, CORS-open)
  // -----------------------------------------------------------------------
  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/ArcGIS/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0';
  var STATES_URL  = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_States_Generalized_Boundaries/FeatureServer/0';

  var FIELDS = ['OBJECTID','TYPE','STATUS','OWNER','VOLTAGE','VOLT_CLASS','SUB_1','SUB_2','SOURCE','INFERRED'].join(',');

  // Conterminous US bounds (used for hub view)
  var US_BOUNDS = [[24.4, -125.0], [49.5, -66.5]];

  var STATE_NAMES = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
    CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
    HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
    KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
    MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri',
    MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey',
    NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio',
    OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
    SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
    VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
    DC:'District of Columbia'
  };

  // Voltage class -> { display name, color, group key, weight }
  // Risk/importance ordered so the "backbone" is visually dominant.
  var VOLT_CLASSES = [
    { key: 'EHV735',  match: ['735 AND ABOVE'],     label: '735 kV and above (EHV backbone)', color: '#7f1d1d', weight: 3.4 },
    { key: 'EHV500',  match: ['500'],               label: '500 kV',                          color: '#b91c1c', weight: 3.0 },
    { key: 'EHV345',  match: ['345'],               label: '345 kV',                          color: '#dc2626', weight: 2.6 },
    { key: 'HV220',   match: ['220-287'],           label: '220 - 287 kV',                    color: '#ea580c', weight: 2.2 },
    { key: 'HV100',   match: ['100-161'],           label: '100 - 161 kV',                    color: '#f59e0b', weight: 1.8 },
    { key: 'DC',      match: ['DC'],                label: 'HVDC',                            color: '#7c3aed', weight: 3.0 },
    { key: 'SUB100',  match: ['UNDER 100','SUB 100'], label: 'Under 100 kV (sub-transmission)', color: '#9ca3af', weight: 1.4 },
    { key: 'NA',      match: ['NOT AVAILABLE','Unknown',null,'',undefined], label: 'Voltage not available', color: '#cbd5e1', weight: 1.2 }
  ];

  function classifyVolt(vc) {
    var raw = (vc == null) ? '' : String(vc).trim();
    for (var i = 0; i < VOLT_CLASSES.length; i++) {
      if (VOLT_CLASSES[i].match.indexOf(raw) >= 0) return VOLT_CLASSES[i];
    }
    return VOLT_CLASSES[VOLT_CLASSES.length - 1];
  }

  // -----------------------------------------------------------------------
  var container = document.getElementById('state-transmission-container');
  if (!container) return;

  var stateAbbr = (container.getAttribute('data-state') || '').toUpperCase().trim();
  var isUnfiltered = !stateAbbr;
  var stateName = isUnfiltered ? 'United States' : (STATE_NAMES[stateAbbr] || stateAbbr);

  // ----- DOM scaffolding -----
  container.innerHTML =
    '<div class="stm-stats">' +
      '<div class="stm-stat"><span class="stm-stat-value" data-stm="total-mi">--</span><span class="stm-stat-label">Line Miles</span></div>' +
      '<div class="stm-stat"><span class="stm-stat-value" data-stm="ehv-mi">--</span><span class="stm-stat-label">EHV Miles (345 kV+)</span></div>' +
      '<div class="stm-stat"><span class="stm-stat-value" data-stm="seg-count">--</span><span class="stm-stat-label">Line Segments</span></div>' +
      '<div class="stm-stat"><span class="stm-stat-value" data-stm="owner-count">--</span><span class="stm-stat-label">Operators</span></div>' +
    '</div>' +
    '<div class="stm-toolbar">' +
      '<input type="search" class="stm-search" data-stm="search-input" placeholder="Search address, city or ZIP in ' + stateName + '">' +
      '<button type="button" class="stm-btn stm-btn-primary" data-stm="search-btn">Search</button>' +
      '<button type="button" class="stm-btn" data-stm="locate-btn">Find me</button>' +
      '<button type="button" class="stm-btn stm-btn-ghost" data-stm="share-btn">Copy share link</button>' +
      '<span class="stm-search-msg" data-stm="search-msg"></span>' +
    '</div>' +
    '<div class="stm-map-wrap">' +
      '<div class="stm-map" data-stm="map"></div>' +
      '<div class="stm-loading" data-stm="loading">' +
        '<div class="stm-spinner"></div>' +
        '<div class="stm-progress-bar"><div class="stm-progress-fill" data-stm="progress"></div></div>' +
        '<p data-stm="loading-msg">Loading ' + stateName + ' transmission grid...</p>' +
      '</div>' +
      '<div class="stm-toast" data-stm="toast">Link copied to clipboard</div>' +
    '</div>' +
    '<div class="stm-legend" data-stm="legend">' +
      '<div class="stm-legend-section">' +
        '<h4>Voltage class</h4>' +
        '<div data-stm="legend-volt"></div>' +
      '</div>' +
      '<div class="stm-legend-section">' +
        '<h4>Top operators (line miles)</h4>' +
        '<div data-stm="legend-owners"></div>' +
      '</div>' +
    '</div>' +
    '<div class="stm-attrib">' +
      'Data: <a href="https://hifld-geoplatform.hub.arcgis.com/" target="_blank" rel="noopener">HIFLD US Electric Power Transmission Lines</a> &middot; ' +
      'State boundaries: <a href="https://www.arcgis.com/home/item.html?id=8c2d6d7df8fa4142b0a1211c8dd66903" target="_blank" rel="noopener">Esri USA States Generalized</a> &middot; ' +
      'Geocoding: <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noopener">OSM Nominatim</a> &middot; ' +
      'Tiles &copy; OpenStreetMap contributors' +
    '</div>';

  var $ = function (sel) { return container.querySelector('[data-stm="' + sel + '"]'); };

  // ----- Hash params -----
  var hashParams = {};
  if (window.location.hash) {
    window.location.hash.slice(1).split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) hashParams[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
  }

  // ----- Map -----
  var map = L.map($('map'), {
    zoomControl: true,
    attributionControl: false,
    preferCanvas: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Initial view: hash > US (will refit to state polygon once it loads)
  if (hashParams.lat && hashParams.lng && hashParams.z) {
    map.setView([+hashParams.lat, +hashParams.lng], +hashParams.z);
  } else {
    map.fitBounds(US_BOUNDS, { padding: [10, 10] });
  }

  setTimeout(function () { map.invalidateSize(); }, 100);
  setTimeout(function () { map.invalidateSize(); }, 600);
  window.addEventListener('resize', function () { map.invalidateSize(); });

  // ----- Filter state -----
  var voltFilters = {};
  VOLT_CLASSES.forEach(function (vc) { voltFilters[vc.key] = true; });

  var allFeatures = [];     // { attrs, paths(latlng), miles, voltClass, color, weight }
  var statePolygon = null;  // L.GeoJSON layer

  // ----- Helpers -----
  function setProgress(p, msg) {
    $('progress').style.width = Math.min(100, Math.max(0, p)) + '%';
    if (msg) $('loading-msg').textContent = msg;
  }

  function haversineKm(a, b) {
    var R = 6371;
    var lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
    var dLat = (b[0] - a[0]) * Math.PI / 180;
    var dLon = (b[1] - a[1]) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function pathMiles(latlngs) {
    var km = 0;
    for (var i = 1; i < latlngs.length; i++) km += haversineKm(latlngs[i - 1], latlngs[i]);
    return km * 0.621371;
  }

  function formatMi(n) {
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    if (n >= 1000)  return Math.round(n).toLocaleString();
    if (n >= 100)   return Math.round(n).toLocaleString();
    return n.toFixed(0);
  }

  function formatNum(n) { return n.toLocaleString(); }

  // ----- Step 1: load state polygon (if filtered) then start data load -----
  function init() {
    if (isUnfiltered) {
      loadAllUSStats().then(function () { return loadDataAllUS(); });
      return;
    }
    setProgress(2, 'Loading ' + stateName + ' boundary...');
    var polyUrl = STATES_URL + '/query?where=' +
      encodeURIComponent("STATE_ABBR='" + stateAbbr.replace(/'/g, "''") + "'") +
      '&outFields=STATE_ABBR&returnGeometry=true&outSR=4326&geometryPrecision=4&f=json';
    fetch(polyUrl).then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.features || !j.features.length) {
          setProgress(100, 'State boundary not found.');
          return;
        }
        var geom = j.features[0].geometry;
        // Render outline as MultiLineString (avoids Esri ring orientation pitfalls)
        var outlineCoords = (geom.rings || []).map(function (r) { return r; });
        statePolygon = L.geoJSON({
          type: 'Feature',
          geometry: { type: 'MultiLineString', coordinates: outlineCoords }
        }, {
          style: { color: '#1f2937', weight: 1.6, dashArray: '5 4', opacity: 0.7 },
          interactive: false
        }).addTo(map);
        map.fitBounds(statePolygon.getBounds(), { padding: [10, 10] });
        // Stash original esri polygon for spatial query
        loadDataState(geom);
      })
      .catch(function (e) { setProgress(100, 'Error loading boundary: ' + e.message); });
  }

  // ----- State-filtered data load (POST query with polygon geometry) -----
  function loadDataState(esriPolygon) {
    var polyJson = JSON.stringify({
      rings: esriPolygon.rings,
      spatialReference: { wkid: 4326 }
    });

    var commonBody = {
      where: '1=1',
      geometry: polyJson,
      geometryType: 'esriGeometryPolygon',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outSR: '4326'
    };

    setProgress(8, 'Counting transmission lines in ' + stateName + '...');
    var countBody = Object.assign({}, commonBody, { returnCountOnly: 'true', f: 'json' });
    fetch(SERVICE_URL + '/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm(countBody)
    }).then(function (r) { return r.json(); }).then(function (j) {
      var total = j.count || 0;
      if (!total) { setProgress(100, 'No transmission features found in ' + stateName + '.'); return; }
      var batchSize = 1000;
      var batchCount = Math.ceil(total / batchSize);
      var offsets = [];
      for (var i = 0; i < batchCount; i++) offsets.push(i * batchSize);
      setProgress(12, 'Loading ' + total.toLocaleString() + ' lines in ' + batchCount + ' batches...');
      runBatches(offsets, batchSize, 4, commonBody).then(finalize);
    }).catch(function (e) { setProgress(100, 'Error: ' + e.message); });
  }

  function encodeForm(obj) {
    return Object.keys(obj).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
    }).join('&');
  }

  function runBatches(offsets, batchSize, parallel, commonBody) {
    var idx = 0, completed = 0, total = offsets.length;
    return new Promise(function (resolve) {
      function next() {
        if (idx >= offsets.length) {
          if (completed >= total) resolve();
          return;
        }
        var off = offsets[idx++];
        var body = Object.assign({}, commonBody, {
          outFields: FIELDS,
          geometryPrecision: '4',
          maxAllowableOffset: '0.002',
          resultOffset: String(off),
          resultRecordCount: String(batchSize),
          f: 'json'
        });
        fetch(SERVICE_URL + '/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: encodeForm(body)
        })
          .then(function (r) { return r.json(); })
          .then(function (j) { ingestBatch(j); })
          .catch(function () {})
          .then(function () {
            completed++;
            setProgress(12 + (completed / total) * 70,
              'Loaded ' + completed + '/' + total + ' batches (' + formatNum(allFeatures.length) + ' segments)');
            next();
          });
      }
      for (var k = 0; k < Math.min(parallel, offsets.length); k++) next();
    });
  }

  function ingestBatch(j) {
    if (!j.features) return;
    j.features.forEach(function (f) {
      if (!f.geometry || !f.geometry.paths) return;
      var vc = classifyVolt(f.attributes.VOLT_CLASS);
      var paths = f.geometry.paths.map(function (path) {
        return path.map(function (pt) { return [pt[1], pt[0]]; });
      });
      // Sum miles across all sub-paths
      var miles = 0;
      paths.forEach(function (p) { miles += pathMiles(p); });
      allFeatures.push({
        attrs: f.attributes,
        paths: paths,
        miles: miles,
        voltClass: vc.key,
        color: vc.color,
        weight: vc.weight
      });
    });
  }

  function finalize() {
    setProgress(85, 'Rendering ' + formatNum(allFeatures.length) + ' segments...');
    // Sort: low voltage first, high voltage rendered on top
    var order = { NA:0, SUB100:1, HV100:2, HV220:3, EHV345:4, EHV500:5, EHV735:6, DC:7 };
    allFeatures.sort(function (a, b) { return (order[a.voltClass] || 0) - (order[b.voltClass] || 0); });

    var i = 0, chunk = 600;
    function step() {
      var end = Math.min(i + chunk, allFeatures.length);
      for (; i < end; i++) renderFeature(allFeatures[i]);
      var pct = 85 + (i / allFeatures.length) * 14;
      setProgress(pct);
      if (i < allFeatures.length) requestAnimationFrame(step);
      else done();
    }
    requestAnimationFrame(step);
  }

  function renderFeature(rec) {
    var line = L.polyline(rec.paths, {
      color: rec.color,
      weight: rec.weight,
      opacity: 0.92,
      lineCap: 'round',
      lineJoin: 'round'
    });
    line.on('click', function (e) {
      L.popup({ maxWidth: 320 })
        .setLatLng(e.latlng)
        .setContent(buildPopup(rec))
        .openOn(map);
    });
    rec._line = line;
    if (voltFilters[rec.voltClass] !== false) line.addTo(map);
  }

  function buildPopup(rec) {
    var a = rec.attrs;
    var owner = (a.OWNER && a.OWNER !== 'NOT AVAILABLE') ? a.OWNER : 'Owner not reported';
    var vClass = a.VOLT_CLASS || 'Voltage not available';
    var voltKv = (a.VOLTAGE && a.VOLTAGE > 0) ? a.VOLTAGE.toFixed(0) + ' kV' : null;
    var rows = [];
    rows.push(row('Owner', titleCase(owner)));
    rows.push(row('Voltage class', vClass + (voltKv ? ' (' + voltKv + ')' : '')));
    if (a.STATUS) rows.push(row('Status', titleCase(a.STATUS)));
    if (a.TYPE && a.TYPE !== 'NOT AVAILABLE') rows.push(row('Type', titleCase(a.TYPE)));
    if (a.SUB_1 && a.SUB_1 !== 'NOT AVAILABLE') rows.push(row('From substation', titleCase(a.SUB_1)));
    if (a.SUB_2 && a.SUB_2 !== 'NOT AVAILABLE') rows.push(row('To substation', titleCase(a.SUB_2)));
    rows.push(row('Segment length', rec.miles.toFixed(2) + ' mi'));
    if (a.SOURCE) rows.push(row('Data source', a.SOURCE));
    return '<div class="stm-popup">' +
      '<div class="stm-popup-title">' + titleCase(owner) + '</div>' +
      rows.join('') +
      '</div>';
  }

  function row(k, v) {
    return '<div class="stm-popup-row"><span class="stm-popup-key">' + k +
      '</span><span class="stm-popup-val">' + v + '</span></div>';
  }

  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Strip corporate suffixes so "ONCOR ELECTRIC DELIVERY COMPANY" and
  // "ONCOR ELECTRIC DELIVERY COMPANY LLC" collapse into one bucket.
  function normalizeOwner(name) {
    if (!name) return '';
    var n = String(name).trim().toUpperCase();
    // Repeatedly strip trailing corporate tokens
    var stripped;
    do {
      stripped = false;
      n = n.replace(/[\s,\.]+$/g, '');
      var m = n.match(/^(.+?)[\s,\.]+(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|HOLDINGS|LP|LIMITED|LTD)$/);
      if (m) { n = m[1]; stripped = true; }
    } while (stripped);
    return n;
  }

  function done() {
    setProgress(100, 'Done.');
    $('loading').classList.add('is-hidden');
    updateStats();
    buildLegend();
  }

  function updateStats() {
    var totalMi = 0, ehvMi = 0, owners = {};
    allFeatures.forEach(function (r) {
      totalMi += r.miles;
      if (r.voltClass === 'EHV345' || r.voltClass === 'EHV500' || r.voltClass === 'EHV735' || r.voltClass === 'DC') ehvMi += r.miles;
      var raw = (r.attrs.OWNER || '').trim();
      if (!raw || raw === 'NOT AVAILABLE') return;
      var o = normalizeOwner(raw);
      owners[o] = (owners[o] || 0) + r.miles;
    });
    $('total-mi').textContent = formatMi(totalMi);
    $('ehv-mi').textContent = formatMi(ehvMi);
    $('seg-count').textContent = formatNum(allFeatures.length);
    $('owner-count').textContent = formatNum(Object.keys(owners).length);
  }

  function buildLegend() {
    // Voltage class legend with miles
    var voltMi = {};
    allFeatures.forEach(function (r) { voltMi[r.voltClass] = (voltMi[r.voltClass] || 0) + r.miles; });
    var voltHtml = VOLT_CLASSES
      .filter(function (vc) { return (voltMi[vc.key] || 0) > 0; })
      .map(function (vc) {
        var mi = Math.round(voltMi[vc.key] || 0);
        return '<label class="stm-legend-item">' +
          '<input type="checkbox" data-volt-class="' + vc.key + '" checked>' +
          '<span class="stm-swatch" style="background:' + vc.color + '"></span>' +
          '<span>' + vc.label + '</span>' +
          '<span class="stm-legend-count">' + mi.toLocaleString() + ' mi</span>' +
          '</label>';
      }).join('');
    $('legend-volt').innerHTML = voltHtml;

    // Top owners by miles (normalized)
    var owners = {};
    allFeatures.forEach(function (r) {
      var raw = (r.attrs.OWNER || '').trim();
      if (!raw || raw === 'NOT AVAILABLE') return;
      var o = normalizeOwner(raw);
      owners[o] = (owners[o] || 0) + r.miles;
    });
    var ownerList = Object.keys(owners).map(function (o) { return { name: o, miles: owners[o] }; })
      .sort(function (a, b) { return b.miles - a.miles; }).slice(0, 8);
    var ownerHtml = ownerList.map(function (o) {
      return '<div class="stm-owner-row">' +
        '<span class="stm-owner-name" title="' + o.name + '">' + titleCase(o.name) + '</span>' +
        '<span class="stm-owner-mi">' + Math.round(o.miles).toLocaleString() + ' mi</span>' +
        '</div>';
    }).join('') || '<div class="stm-owner-row"><em>No operator data reported.</em></div>';
    $('legend-owners').innerHTML = ownerHtml;

    container.querySelectorAll('[data-volt-class]').forEach(function (el) {
      el.addEventListener('change', function () {
        voltFilters[el.getAttribute('data-volt-class')] = el.checked;
        applyFilters();
      });
    });
  }

  function applyFilters() {
    allFeatures.forEach(function (r) {
      var visible = voltFilters[r.voltClass] !== false;
      var onMap = map.hasLayer(r._line);
      if (visible && !onMap) r._line.addTo(map);
      else if (!visible && onMap) map.removeLayer(r._line);
    });
  }

  // ----- Hub (no state) data load: dynamic loading via paged BBOX queries by viewport -----
  // Simpler approach: use esri-leaflet-style dynamic load. Since we kept the JS small, we use
  // a single nationwide grouped-stats query for the stats strip and skip rendering all 94k lines.
  function loadAllUSStats() {
    return fetch(SERVICE_URL + '/query?where=1%3D1&groupByFieldsForStatistics=VOLT_CLASS&outStatistics=' +
      encodeURIComponent('[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"n"}]') + '&f=json')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.features) return;
        var summary = {};
        j.features.forEach(function (f) { summary[f.attributes.VOLT_CLASS || 'NA'] = f.attributes.n; });
        var total = 0;
        Object.keys(summary).forEach(function (k) { total += summary[k]; });
        $('seg-count').textContent = formatNum(total);
        $('total-mi').textContent = '~' + formatMi(642000); // ~rough HIFLD published total
        $('ehv-mi').textContent = '~' + formatMi(150000);
        $('owner-count').textContent = '600+';
      });
  }

  function loadDataAllUS() {
    // For the hub view we just build a static legend from the volt-class summary
    setProgress(50, 'Loading nationwide grid (this may take 20-40 seconds)...');
    // Use esri-leaflet-style dynamic feature layer if available, otherwise paged load with bbox-on-demand.
    // To keep payload reasonable, we render only the >=345 kV backbone for the hub.
    var where = "VOLT_CLASS IN ('345','500','735 AND ABOVE','DC')";
    fetch(SERVICE_URL + '/query?where=' + encodeURIComponent(where) + '&returnCountOnly=true&f=json')
      .then(function (r) { return r.json(); }).then(function (j) {
        var total = j.count || 0;
        var batchSize = 1000;
        var batchCount = Math.ceil(total / batchSize);
        var offsets = [];
        for (var i = 0; i < batchCount; i++) offsets.push(i * batchSize);
        setProgress(60, 'Loading ' + total.toLocaleString() + ' EHV backbone segments...');
        var commonBody = { where: where, outSR: '4326' };
        runBatches(offsets, batchSize, 4, commonBody).then(finalize);
      });
  }

  // ----- Address search via Nominatim -----
  function doSearch() {
    var q = $('search-input').value.trim();
    if (!q) return;
    $('search-msg').textContent = 'Searching...';
    var b = map.getBounds();
    var viewbox = b.getWest() + ',' + b.getNorth() + ',' + b.getEast() + ',' + b.getSouth();
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q) +
      '&viewbox=' + viewbox + '&bounded=' + (isUnfiltered ? '0' : '1');
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results.length) { $('search-msg').textContent = 'No match found.'; return; }
        var hit = results[0];
        map.setView([+hit.lat, +hit.lon], 13);
        L.marker([+hit.lat, +hit.lon]).bindPopup('<strong>' + (hit.display_name || q) + '</strong>')
          .addTo(map).openPopup();
        $('search-msg').textContent = '';
      })
      .catch(function () { $('search-msg').textContent = 'Search error.'; });
  }
  $('search-btn').addEventListener('click', doSearch);
  $('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  // ----- Geolocate -----
  $('locate-btn').addEventListener('click', function () {
    if (!navigator.geolocation) { $('search-msg').textContent = 'Geolocation not supported.'; return; }
    $('search-msg').textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
        radius: 7, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.5
      }).bindPopup('You are here').addTo(map).openPopup();
      $('search-msg').textContent = '';
    }, function () { $('search-msg').textContent = 'Location unavailable.'; });
  });

  // ----- Share link -----
  $('share-btn').addEventListener('click', function () {
    var c = map.getCenter(); var z = map.getZoom();
    var hash = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + z;
    var url = window.location.href.split('#')[0] + hash;
    history.replaceState(null, '', hash);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(showToast);
    } else {
      var ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });

  function showToast() {
    var t = $('toast');
    t.classList.add('is-visible');
    setTimeout(function () { t.classList.remove('is-visible'); }, 1800);
  }

  // ----- Update hash on map move -----
  var hashTimer;
  map.on('moveend', function () {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var c = map.getCenter();
      history.replaceState(null, '',
        '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
    }, 250);
  });

  // ----- Kick off -----
  init();
})();
