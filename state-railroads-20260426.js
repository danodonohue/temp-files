(function () {
  'use strict';

  // -----------------------------------------------------------------------
  //  USDOT NTAD North American Rail Network Lines (authoritative, CORS-open)
  // -----------------------------------------------------------------------
  var SERVICE_URL = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_North_American_Rail_Network_Lines/FeatureServer/0';

  var FIELDS = ['OBJECTID','RROWNER1','RROWNER2','RROWNER3','TRKRGHTS1','MILES',
    'DIVISION','SUBDIV','BRANCH','YARDNAME','PASSNGR','STRACNET','TRACKS','NET'].join(',');

  // State bounding boxes (lat/lng SW + NE corners)
  var STATE_BOUNDS = {
    AL: [[30.14,-88.47],[35.01,-84.89]], AK: [[51.00,-179.50],[71.50,-130.00]],
    AZ: [[31.33,-114.82],[37.00,-109.05]], AR: [[33.00,-94.62],[36.50,-89.64]],
    CA: [[32.53,-124.48],[42.01,-114.13]], CO: [[36.99,-109.06],[41.00,-102.04]],
    CT: [[40.97,-73.73],[42.05,-71.79]], DE: [[38.45,-75.79],[39.84,-75.05]],
    FL: [[24.40,-87.63],[31.00,-80.03]], GA: [[30.36,-85.61],[35.00,-80.84]],
    ID: [[41.99,-117.24],[49.00,-111.04]], IL: [[36.97,-91.51],[42.51,-87.02]],
    IN: [[37.77,-88.10],[41.76,-84.78]], IA: [[40.38,-96.64],[43.50,-90.14]],
    KS: [[36.99,-102.05],[40.00,-94.59]], KY: [[36.50,-89.57],[39.15,-81.96]],
    LA: [[28.93,-94.04],[33.02,-88.82]], ME: [[43.06,-71.08],[47.46,-66.95]],
    MD: [[37.89,-79.49],[39.72,-75.05]], MA: [[41.19,-73.50],[42.89,-69.93]],
    MI: [[41.70,-90.42],[48.30,-82.12]], MN: [[43.50,-97.24],[49.38,-89.49]],
    MS: [[30.17,-91.66],[35.00,-88.10]], MO: [[35.99,-95.77],[40.61,-89.10]],
    MT: [[44.36,-116.05],[49.00,-104.04]], NE: [[40.00,-104.05],[43.00,-95.31]],
    NV: [[35.00,-120.01],[42.00,-114.04]], NH: [[42.70,-72.56],[45.30,-70.61]],
    NJ: [[38.93,-75.56],[41.36,-73.89]], NM: [[31.33,-109.05],[37.00,-103.00]],
    NY: [[40.48,-79.76],[45.02,-71.86]], NC: [[33.84,-84.32],[36.59,-75.46]],
    ND: [[45.93,-104.05],[49.00,-96.55]], OH: [[38.40,-84.82],[42.00,-80.52]],
    OK: [[33.62,-103.00],[37.00,-94.43]], OR: [[41.99,-124.55],[46.29,-116.46]],
    PA: [[39.72,-80.52],[42.27,-74.69]], RI: [[41.15,-71.86],[42.02,-71.12]],
    SC: [[32.03,-83.35],[35.22,-78.54]], SD: [[42.48,-104.06],[45.95,-96.44]],
    TN: [[34.98,-90.31],[36.68,-81.64]], TX: [[25.84,-106.65],[36.50,-93.51]],
    UT: [[37.00,-114.05],[42.00,-109.05]], VT: [[42.73,-73.44],[45.02,-71.46]],
    VA: [[36.54,-83.68],[39.47,-75.24]], WA: [[45.54,-124.85],[49.00,-116.91]],
    WV: [[37.20,-82.64],[40.64,-77.72]], WI: [[42.49,-92.89],[47.08,-86.25]],
    WY: [[40.99,-111.06],[45.01,-104.05]], DC: [[38.79,-77.12],[39.00,-76.91]]
  };

  var STATE_NAMES = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
    CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
    ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky',
    LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan',
    MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska',
    NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
    NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon',
    PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
    TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia',
    WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming', DC:'District of Columbia'
  };

  // Owner code -> { display name, color, group key for legend }
  // Class I freight + Amtrak get distinct colors; everything else collapses into "Shortline / Regional"
  var OWNER_TABLE = {
    UP:    { name: 'Union Pacific',                 color: '#FBBF24', group: 'UP' },
    BNSF:  { name: 'BNSF Railway',                  color: '#F37735', group: 'BNSF' },
    CSXT:  { name: 'CSX Transportation',            color: '#003F87', group: 'CSX' },
    CSX:   { name: 'CSX Transportation',            color: '#003F87', group: 'CSX' },
    NS:    { name: 'Norfolk Southern',              color: '#1F2937', group: 'NS' },
    CPRS:  { name: 'CPKC (Canadian Pacific KC)',    color: '#C8102E', group: 'CPKC' },
    KCS:   { name: 'CPKC (Canadian Pacific KC)',    color: '#C8102E', group: 'CPKC' },
    CPKC:  { name: 'CPKC (Canadian Pacific KC)',    color: '#C8102E', group: 'CPKC' },
    CN:    { name: 'Canadian National',             color: '#0E7C3A', group: 'CN' },
    CNRR:  { name: 'Canadian National',             color: '#0E7C3A', group: 'CN' },
    AMTK:  { name: 'Amtrak (passenger)',            color: '#1D4ED8', group: 'AMTK' }
  };
  var SHORTLINE = { name: 'Shortline / Regional',   color: '#9CA3AF', group: 'OTHER' };

  // Legend group display order + readable labels
  var LEGEND_GROUPS = [
    { key: 'UP',    label: 'Union Pacific',                color: '#FBBF24' },
    { key: 'BNSF',  label: 'BNSF Railway',                 color: '#F37735' },
    { key: 'CPKC',  label: 'CPKC',                         color: '#C8102E' },
    { key: 'CSX',   label: 'CSX Transportation',           color: '#003F87' },
    { key: 'NS',    label: 'Norfolk Southern',             color: '#1F2937' },
    { key: 'CN',    label: 'Canadian National',            color: '#0E7C3A' },
    { key: 'AMTK',  label: 'Amtrak (passenger track)',     color: '#1D4ED8' },
    { key: 'OTHER', label: 'Shortline / Regional',         color: '#9CA3AF' }
  ];

  var STRACNET_COLOR = '#9333EA';

  // -----------------------------------------------------------------------
  var container = document.getElementById('state-railroad-container');
  if (!container) return;

  var stateAbbr = (container.getAttribute('data-state') || '').toUpperCase().trim();
  var isUnfiltered = !stateAbbr;
  var stateName = isUnfiltered ? 'United States' : (STATE_NAMES[stateAbbr] || stateAbbr);
  var bounds = stateAbbr ? STATE_BOUNDS[stateAbbr] : [[24, -125], [50, -66]];

  // ----- Build DOM -----
  container.innerHTML =
    '<div class="srm-stats">' +
      '<div class="srm-stat"><span class="srm-stat-value" data-srm="total-mi">--</span><span class="srm-stat-label">Track Miles</span></div>' +
      '<div class="srm-stat"><span class="srm-stat-value" data-srm="class1-mi">--</span><span class="srm-stat-label">Class I Miles</span></div>' +
      '<div class="srm-stat"><span class="srm-stat-value" data-srm="passenger-mi">--</span><span class="srm-stat-label">Passenger Miles</span></div>' +
      '<div class="srm-stat"><span class="srm-stat-value" data-srm="stracnet-mi">--</span><span class="srm-stat-label">STRACNET Miles</span></div>' +
    '</div>' +
    '<div class="srm-toolbar">' +
      '<input type="search" class="srm-search" data-srm="search-input" placeholder="Search address, city or ZIP in ' + stateName + '">' +
      '<button type="button" class="srm-btn srm-btn-primary" data-srm="search-btn">Search</button>' +
      '<button type="button" class="srm-btn" data-srm="locate-btn">Find me</button>' +
      '<button type="button" class="srm-btn srm-btn-ghost" data-srm="share-btn">Copy share link</button>' +
      '<span class="srm-search-msg" data-srm="search-msg"></span>' +
    '</div>' +
    '<div class="srm-map-wrap">' +
      '<div class="srm-map" data-srm="map"></div>' +
      '<div class="srm-loading" data-srm="loading">' +
        '<div class="srm-spinner"></div>' +
        '<div class="srm-progress-bar"><div class="srm-progress-fill" data-srm="progress"></div></div>' +
        '<p data-srm="loading-msg">Loading ' + stateName + ' rail network...</p>' +
      '</div>' +
      '<div class="srm-toast" data-srm="toast">Link copied to clipboard</div>' +
    '</div>' +
    '<div class="srm-legend" data-srm="legend">' +
      '<div class="srm-legend-section">' +
        '<h4>Operating railroad</h4>' +
        '<div data-srm="legend-owners"></div>' +
      '</div>' +
      '<div class="srm-legend-section">' +
        '<h4>Designations</h4>' +
        '<div data-srm="legend-flags"></div>' +
      '</div>' +
    '</div>' +
    '<div class="srm-attrib">' +
      'Rail data: <a href="https://geodata.bts.gov/" target="_blank" rel="noopener">USDOT BTS NTAD</a> &middot; ' +
      'Geocoding: <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noopener">OSM Nominatim</a> &middot; ' +
      'Tiles &copy; OpenStreetMap contributors' +
    '</div>';

  var $ = function (sel) { return container.querySelector('[data-srm="' + sel + '"]'); };

  // ----- Initial state from URL hash -----
  var hashParams = {};
  if (window.location.hash) {
    window.location.hash.slice(1).split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) hashParams[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
  }

  // ----- Build Leaflet map -----
  var map = L.map($('map'), {
    zoomControl: true,
    attributionControl: false,
    preferCanvas: true   // Canvas renderer is much faster for thousands of polylines
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  if (hashParams.lat && hashParams.lng && hashParams.z) {
    map.setView([+hashParams.lat, +hashParams.lng], +hashParams.z);
  } else if (bounds) {
    map.fitBounds(bounds, { padding: [10, 10] });
  } else {
    map.setView([39.83, -98.58], 4);
  }

  // ----- Filter state -----
  var filters = {};
  LEGEND_GROUPS.forEach(function (g) { filters[g.key] = true; });
  var flagFilters = { stracnet: true, passenger: true };

  var allFeatures = [];          // [{ attrs, lines: [latlng[]], group, isStracnet, isPassenger }]
  var renderedLayers = {};       // key -> L.Polyline

  var classIGroups = ['UP','BNSF','CPKC','CSX','NS','CN'];

  // ----- Data load -----
  var where = stateAbbr ? "STATEAB='" + stateAbbr.replace(/'/g, "''") + "'" : "COUNTRY='US'";
  var encodedWhere = encodeURIComponent(where);

  function setProgress(p, msg) {
    $('progress').style.width = Math.min(100, Math.max(0, p)) + '%';
    if (msg) $('loading-msg').textContent = msg;
  }

  function pickOwner(attrs) {
    var code = (attrs.RROWNER1 || '').trim();
    if (OWNER_TABLE[code]) return OWNER_TABLE[code];
    // Amtrak might appear as TRKRGHTS rather than primary owner — flag passenger via PASSNGR field instead
    return SHORTLINE;
  }

  function loadData() {
    // 1. Count first
    fetch(SERVICE_URL + '/query?where=' + encodedWhere + '&returnCountOnly=true&f=json')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var total = j.count || 0;
        if (!total) {
          setProgress(100, 'No rail features found for ' + stateName + '.');
          return;
        }
        var batchSize = 2000;
        var batchCount = Math.ceil(total / batchSize);
        var offsets = [];
        for (var i = 0; i < batchCount; i++) offsets.push(i * batchSize);
        setProgress(5, 'Loading ' + total.toLocaleString() + ' rail segments in ' + batchCount + ' batches...');
        runPool(offsets, batchSize, 6).then(function () {
          finalize();
        });
      })
      .catch(function (e) { setProgress(100, 'Error loading data: ' + e.message); });
  }

  function fetchBatch(offset, batchSize) {
    var url = SERVICE_URL + '/query?where=' + encodedWhere +
      '&outFields=' + FIELDS +
      '&outSR=4326' +
      '&geometryPrecision=4' +
      '&maxAllowableOffset=0.002' +
      '&resultOffset=' + offset +
      '&resultRecordCount=' + batchSize +
      '&f=json';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.features) return;
      j.features.forEach(function (f) {
        if (!f.geometry || !f.geometry.paths) return;
        var owner = pickOwner(f.attributes);
        var rec = {
          attrs: f.attributes,
          paths: f.geometry.paths,
          group: owner.group,
          color: owner.color,
          ownerName: owner.name,
          isStracnet: !!(f.attributes.STRACNET || '').trim(),
          isPassenger: !!(f.attributes.PASSNGR || '').trim()
        };
        allFeatures.push(rec);
      });
    });
  }

  function runPool(queue, batchSize, parallel) {
    var idx = 0, completed = 0, total = queue.length;
    return new Promise(function (resolve) {
      function next() {
        if (idx >= queue.length) {
          if (completed >= total) resolve();
          return;
        }
        var off = queue[idx++];
        fetchBatch(off, batchSize)
          .catch(function () {})
          .then(function () {
            completed++;
            setProgress(5 + (completed / total) * 75,
              'Loaded ' + completed + '/' + total + ' batches (' +
              allFeatures.length.toLocaleString() + ' segments)');
            next();
          });
      }
      for (var k = 0; k < Math.min(parallel, queue.length); k++) next();
    });
  }

  function finalize() {
    setProgress(85, 'Rendering ' + allFeatures.length.toLocaleString() + ' segments...');
    // Render with a small chunked async loop so UI stays responsive
    var i = 0, chunk = 800;
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
    var visible = filters[rec.group] !== false;
    if (visible && !flagFilters.stracnet && rec.isStracnet) visible = false;
    if (visible && !flagFilters.passenger && rec.isPassenger) visible = false;

    var latlngs = rec.paths.map(function (path) {
      return path.map(function (pt) { return [pt[1], pt[0]]; });
    });

    // Class I gets a touch more weight; STRACNET gets a violet halo polyline behind
    var weight = (classIGroups.indexOf(rec.group) >= 0) ? 2.4 : 1.6;
    var halo = null;
    if (rec.isStracnet) {
      halo = L.polyline(latlngs, {
        color: STRACNET_COLOR,
        weight: weight + 3,
        opacity: 0.35,
        interactive: false
      });
    }
    var line = L.polyline(latlngs, {
      color: rec.color,
      weight: weight,
      opacity: 0.95,
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
    rec._halo = halo;
    if (visible) {
      if (halo) halo.addTo(map);
      line.addTo(map);
    }
  }

  function buildPopup(rec) {
    var a = rec.attrs;
    var rows = [];
    rows.push(row('Owner', rec.ownerName + (a.RROWNER1 ? ' (' + a.RROWNER1 + ')' : '')));
    if (a.RROWNER2) rows.push(row('Co-owner', a.RROWNER2));
    if (a.TRKRGHTS1) rows.push(row('Trackage rights', a.TRKRGHTS1));
    if (a.DIVISION) rows.push(row('Division', titleCase(a.DIVISION)));
    if (a.SUBDIV) rows.push(row('Subdivision', titleCase(a.SUBDIV)));
    if (a.BRANCH && a.BRANCH !== '#N\\A') rows.push(row('Branch', titleCase(a.BRANCH)));
    if (a.YARDNAME) rows.push(row('Yard', titleCase(a.YARDNAME)));
    if (a.TRACKS && a.TRACKS > 0) rows.push(row('Parallel tracks', a.TRACKS));
    rows.push(row('Segment length', (+a.MILES).toFixed(2) + ' mi'));
    var tags = '';
    if (rec.isPassenger) tags += '<span class="srm-popup-tag srm-tag-pass">Passenger</span>';
    if (rec.isStracnet) tags += '<span class="srm-popup-tag srm-tag-stra">STRACNET</span>';
    return '<div class="srm-popup">' +
      '<div class="srm-popup-title">' + rec.ownerName + '</div>' +
      rows.join('') +
      (tags ? '<div>' + tags + '</div>' : '') +
      '</div>';
  }

  function row(k, v) {
    return '<div class="srm-popup-row"><span class="srm-popup-key">' + k +
      '</span><span class="srm-popup-val">' + v + '</span></div>';
  }

  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function done() {
    setProgress(100, 'Done.');
    $('loading').classList.add('is-hidden');
    updateStats();
    buildLegend();
  }

  function updateStats() {
    var totalMi = 0, class1Mi = 0, passMi = 0, straMi = 0;
    allFeatures.forEach(function (r) {
      var m = +r.attrs.MILES || 0;
      totalMi += m;
      if (classIGroups.indexOf(r.group) >= 0 && r.group !== 'AMTK') class1Mi += m;
      if (r.isPassenger) passMi += m;
      if (r.isStracnet) straMi += m;
    });
    $('total-mi').textContent = formatMi(totalMi);
    $('class1-mi').textContent = formatMi(class1Mi);
    $('passenger-mi').textContent = formatMi(passMi);
    $('stracnet-mi').textContent = formatMi(straMi);
  }

  function formatMi(n) {
    if (n >= 1000) return Math.round(n).toLocaleString();
    return n.toFixed(0);
  }

  function buildLegend() {
    // Counts per owner group
    var groupMi = {}, flagMi = { stracnet: 0, passenger: 0 };
    allFeatures.forEach(function (r) {
      var m = +r.attrs.MILES || 0;
      groupMi[r.group] = (groupMi[r.group] || 0) + m;
      if (r.isStracnet) flagMi.stracnet += m;
      if (r.isPassenger) flagMi.passenger += m;
    });

    var ownersHtml = LEGEND_GROUPS
      .filter(function (g) { return (groupMi[g.key] || 0) > 0; })
      .map(function (g) {
        var miles = Math.round(groupMi[g.key]).toLocaleString();
        return '<label class="srm-legend-item">' +
          '<input type="checkbox" data-owner-group="' + g.key + '" checked>' +
          '<span class="srm-swatch" style="background:' + g.color + '"></span>' +
          '<span>' + g.label + '</span>' +
          '<span class="srm-legend-count">' + miles + ' mi</span>' +
        '</label>';
      }).join('');
    $('legend-owners').innerHTML = ownersHtml;

    var flagsHtml =
      '<label class="srm-legend-item">' +
        '<input type="checkbox" data-flag="stracnet" checked>' +
        '<span class="srm-swatch dashed"></span>' +
        '<span>STRACNET (military strategic)</span>' +
        '<span class="srm-legend-count">' + Math.round(flagMi.stracnet).toLocaleString() + ' mi</span>' +
      '</label>' +
      '<label class="srm-legend-item">' +
        '<input type="checkbox" data-flag="passenger" checked>' +
        '<span class="srm-swatch" style="background:#1D4ED8"></span>' +
        '<span>Passenger service</span>' +
        '<span class="srm-legend-count">' + Math.round(flagMi.passenger).toLocaleString() + ' mi</span>' +
      '</label>';
    $('legend-flags').innerHTML = flagsHtml;

    container.querySelectorAll('[data-owner-group]').forEach(function (el) {
      el.addEventListener('change', function () {
        filters[el.getAttribute('data-owner-group')] = el.checked;
        applyFilters();
      });
    });
    container.querySelectorAll('[data-flag]').forEach(function (el) {
      el.addEventListener('change', function () {
        flagFilters[el.getAttribute('data-flag')] = el.checked;
        applyFilters();
      });
    });
  }

  function applyFilters() {
    allFeatures.forEach(function (r) {
      var visible = filters[r.group] !== false;
      if (visible && !flagFilters.stracnet && r.isStracnet) visible = false;
      if (visible && !flagFilters.passenger && r.isPassenger) visible = false;
      var onMap = map.hasLayer(r._line);
      if (visible && !onMap) {
        if (r._halo) r._halo.addTo(map);
        r._line.addTo(map);
      } else if (!visible && onMap) {
        if (r._halo) map.removeLayer(r._halo);
        map.removeLayer(r._line);
      }
    });
  }

  // ----- Address search via Nominatim -----
  function doSearch() {
    var q = $('search-input').value.trim();
    if (!q) return;
    $('search-msg').textContent = 'Searching...';
    var viewbox = bounds ?
      bounds[0][1] + ',' + bounds[1][0] + ',' + bounds[1][1] + ',' + bounds[0][0] : null;
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q) +
      (viewbox ? '&viewbox=' + viewbox + '&bounded=1' : '');
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results.length) {
          $('search-msg').textContent = 'No match found.';
          return;
        }
        var hit = results[0];
        map.setView([+hit.lat, +hit.lon], 13);
        L.marker([+hit.lat, +hit.lon])
          .bindPopup('<strong>' + (hit.display_name || q) + '</strong>')
          .addTo(map).openPopup();
        $('search-msg').textContent = '';
      })
      .catch(function () { $('search-msg').textContent = 'Search error.'; });
  }
  $('search-btn').addEventListener('click', doSearch);
  $('search-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

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
    var c = map.getCenter();
    var z = map.getZoom();
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
  loadData();
})();
