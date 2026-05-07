(function () {
  'use strict';

  var SLUG            = 'us-airports';
  var SVC_URL         = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0';
  var MILES_TO_METERS = 1609.344;

  var TYPE_CFG = {
    AD: { label: 'Airports',       color: '#2563eb', abbr: 'Airport'       },
    HP: { label: 'Heliports',      color: '#d97706', abbr: 'Heliport'      },
    SP: { label: 'Seaplane Bases', color: '#0891b2', abbr: 'Seaplane Base' },
    UL: { label: 'Ultralight',     color: '#7c3aed', abbr: 'Ultralight'    },
    GL: { label: 'Gliderports',    color: '#16a34a', abbr: 'Gliderport'    },
    BP: { label: 'Balloonports',   color: '#dc2626', abbr: 'Balloonport'   }
  };

  // ---- State ---------------------------------------------------------------
  var container  = document.getElementById(SLUG + '-container');
  var spokeState = (container && container.getAttribute('data-state')) || '';
  var activeTypes = {};
  Object.keys(TYPE_CFG).forEach(function (k) { activeTypes[k] = true; });
  var showNonOp   = false;
  var findMode    = 'none';   // 'nearest' | 'radius' | 'none'
  var radiusMiles = 25;
  var clickMarker = null, radiusCircle = null, nearestLine = null;

  // ---- WHERE builder -------------------------------------------------------
  function buildWhere() {
    var parts = [];
    if (spokeState) parts.push("STATE = '" + spokeState + "'");
    var active = Object.keys(activeTypes).filter(function (k) { return activeTypes[k]; });
    if (!active.length) return '1=0';
    if (active.length < Object.keys(TYPE_CFG).length)
      parts.push("TYPE_CODE IN ('" + active.join("','") + "')");
    if (!showNonOp) parts.push("OPERSTATUS = 'OPERATIONAL'");
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  // ---- URL hash ------------------------------------------------------------
  function loadHash() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var o = {};
    h.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) o[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return (o.lat && o.lng && o.z) ? o : null;
  }
  function saveHash() {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  }

  // ---- Map -----------------------------------------------------------------
  var saved = loadHash();
  var map = L.map(SLUG + '-map', {
    center: saved ? [+saved.lat, +saved.lng] : [38.5, -96.5],
    zoom:   saved ? +saved.z : 4,
    zoomControl: true
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);
  map.on('moveend', saveHash);

  // ---- Layer ---------------------------------------------------------------
  function pointToLayer(f, ll) {
    var cfg = TYPE_CFG[f.properties.TYPE_CODE] || TYPE_CFG.AD;
    var op  = f.properties.OPERSTATUS === 'OPERATIONAL';
    return L.circleMarker(ll, {
      radius: 5, fillColor: cfg.color,
      color: '#fff', weight: 1,
      fillOpacity: op ? 0.85 : 0.45, opacity: 1
    });
  }

  function buildPopup(p) {
    var cfg    = TYPE_CFG[p.TYPE_CODE] || TYPE_CFG.AD;
    var ident  = [p.IDENT, p.ICAO_ID].filter(Boolean).join(' / ');
    var access = p.PRIVATEUSE === 'Y' ? 'Private' : 'Public';
    var mil    = p.MIL_CODE ? ' &bull; Military' : '';
    var elev   = p.ELEVATION != null ? p.ELEVATION + ' ft' : '&mdash;';
    var html   = '<strong>' + (p.NAME || '') + '</strong>';
    if (ident) html += '<br><small style="color:#666">' + ident + '</small>';
    html += '<br>' + (p.SERVCITY || '') + ', ' + (p.STATE || '');
    html += '<br>' + cfg.abbr + ' &bull; ' + access + mil;
    html += '<br>Elevation: ' + elev;
    html += '<br><small>Status: ' + (p.OPERSTATUS || 'Unknown') + '</small>';
    return html;
  }

  var airportLayer = L.esri.Cluster.featureLayer({
    url: SVC_URL,
    pointToLayer: pointToLayer,
    onEachFeature: function (f, layer) { layer.bindPopup(buildPopup(f.properties)); },
    where: buildWhere(),
    fields: ['OBJECTID', 'NAME', 'IDENT', 'ICAO_ID', 'STATE', 'SERVCITY',
             'TYPE_CODE', 'ELEVATION', 'OPERSTATUS', 'PRIVATEUSE', 'MIL_CODE']
  }).addTo(map);

  if (spokeState) {
    airportLayer.once('load', function () {
      try {
        var b = airportLayer.getBounds();
        if (b && b.isValid()) map.fitBounds(b, { padding: [30, 30] });
      } catch (e) {}
    });
  }

  // ---- Stats ---------------------------------------------------------------
  var statsEl;
  function updateStats() {
    if (!statsEl) return;
    var count = 0;
    airportLayer.eachFeature(function () { count++; });
    statsEl.textContent = count.toLocaleString() + ' shown';
  }
  airportLayer.on('load', updateStats);

  // ---- Build controls (injected into DOM) ----------------------------------

  // 1. Toolbar above map
  var toolbar = document.createElement('div');
  toolbar.id = SLUG + '-toolbar';
  toolbar.className = SLUG + '-toolbar';
  toolbar.innerHTML =
    '<div class="' + SLUG + '-search-wrap">' +
    '  <input id="' + SLUG + '-search" class="' + SLUG + '-search-input" type="text"' +
    '   placeholder="Search airport name, code or city…" autocomplete="off">' +
    '  <div id="' + SLUG + '-search-dropdown" class="' + SLUG + '-search-dropdown"></div>' +
    '</div>' +
    '<button id="' + SLUG + '-locate" class="' + SLUG + '-icon-btn" title="Use my location">&#9737;</button>';
  container.insertBefore(toolbar, document.getElementById(SLUG + '-map'));

  // 2. Filter bar below map
  var filterBar = document.createElement('div');
  filterBar.id = SLUG + '-filters';
  filterBar.className = SLUG + '-filters';
  var chipsHtml = Object.keys(TYPE_CFG).map(function (k) {
    var c = TYPE_CFG[k];
    return '<button data-type="' + k + '" class="' + SLUG + '-chip ' + SLUG + '-chip-on"' +
           ' style="--chip-clr:' + c.color + '">' +
           '<span class="' + SLUG + '-dot" style="background:' + c.color + '"></span>' +
           c.label + '</button>';
  }).join('');
  filterBar.innerHTML =
    '<div class="' + SLUG + '-chips">' + chipsHtml + '</div>' +
    '<div class="' + SLUG + '-filter-meta">' +
    '  <label class="' + SLUG + '-toggle-label">' +
    '    <input type="checkbox" id="' + SLUG + '-nonop"> Show non-operational' +
    '  </label>' +
    '  <span id="' + SLUG + '-stats" class="' + SLUG + '-stats-badge"></span>' +
    '</div>';
  container.appendChild(filterBar);
  statsEl = document.getElementById(SLUG + '-stats');

  // 3. Find bar
  var findBar = document.createElement('div');
  findBar.id = SLUG + '-findbar';
  findBar.className = SLUG + '-findbar';
  findBar.innerHTML =
    '<span class="' + SLUG + '-find-label">Click-to-find:</span>' +
    '<button id="' + SLUG + '-btn-nearest" class="' + SLUG + '-find-btn">&#10006; Nearest Airport</button>' +
    '<div class="' + SLUG + '-radius-group">' +
    '  <button id="' + SLUG + '-btn-radius" class="' + SLUG + '-find-btn">&#9898; Radius Search</button>' +
    '  <select id="' + SLUG + '-radius-sel" class="' + SLUG + '-radius-sel">' +
    '    <option value="25">25 mi</option>' +
    '    <option value="50">50 mi</option>' +
    '    <option value="100">100 mi</option>' +
    '  </select>' +
    '</div>' +
    '<button id="' + SLUG + '-btn-clear" class="' + SLUG + '-clear-btn" style="display:none">&#10005; Clear</button>';
  container.appendChild(findBar);

  // 4. Results panel
  var resultsPanel = document.createElement('div');
  resultsPanel.id = SLUG + '-results';
  resultsPanel.className = SLUG + '-results';
  resultsPanel.style.display = 'none';
  container.appendChild(resultsPanel);

  // ---- Type chip toggles ---------------------------------------------------
  filterBar.querySelectorAll('[data-type]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = btn.getAttribute('data-type');
      activeTypes[t] = !activeTypes[t];
      btn.classList.toggle(SLUG + '-chip-on',  activeTypes[t]);
      btn.classList.toggle(SLUG + '-chip-off', !activeTypes[t]);
      airportLayer.setWhere(buildWhere());
    });
  });

  // ---- Non-op toggle -------------------------------------------------------
  document.getElementById(SLUG + '-nonop').addEventListener('change', function (e) {
    showNonOp = e.target.checked;
    airportLayer.setWhere(buildWhere());
  });

  // ---- Radius selector -----------------------------------------------------
  document.getElementById(SLUG + '-radius-sel').addEventListener('change', function (e) {
    radiusMiles = +e.target.value;
  });

  // ---- Mode buttons --------------------------------------------------------
  function setMode(m) {
    findMode = m;
    var btnN  = document.getElementById(SLUG + '-btn-nearest');
    var btnR  = document.getElementById(SLUG + '-btn-radius');
    var btnCl = document.getElementById(SLUG + '-btn-clear');
    btnN.classList.toggle(SLUG + '-find-btn-active', m === 'nearest');
    btnR.classList.toggle(SLUG + '-find-btn-active', m === 'radius');
    btnCl.style.display = (m !== 'none') ? '' : 'none';
    map.getContainer().style.cursor = (m !== 'none') ? 'crosshair' : '';
    if (m === 'none') clearFind();
  }

  document.getElementById(SLUG + '-btn-nearest').addEventListener('click', function () {
    setMode(findMode === 'nearest' ? 'none' : 'nearest');
  });
  document.getElementById(SLUG + '-btn-radius').addEventListener('click', function () {
    setMode(findMode === 'radius' ? 'none' : 'radius');
  });
  document.getElementById(SLUG + '-btn-clear').addEventListener('click', function () {
    setMode('none');
  });

  // ---- Map click -----------------------------------------------------------
  map.on('click', function (e) {
    if (findMode === 'nearest') doFindNearest(e.latlng);
    else if (findMode === 'radius') doRadiusSearch(e.latlng);
  });

  // ---- Geolocation ---------------------------------------------------------
  document.getElementById(SLUG + '-locate').addEventListener('click', function () {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        map.setView(ll, 11);
        if (findMode === 'nearest') doFindNearest(ll);
        else if (findMode === 'radius') doRadiusSearch(ll);
      },
      function () { alert('Could not determine your location.'); }
    );
  });

  // ---- Find nearest --------------------------------------------------------
  function doFindNearest(latlng) {
    clearFind();
    showResults('<p class="find-loading">Searching…</p>');

    var q = L.esri.query({ url: SVC_URL });
    q.nearby(latlng, 100 * MILES_TO_METERS);
    q.where(buildWhere());
    q.fields(['OBJECTID', 'NAME', 'IDENT', 'ICAO_ID', 'STATE', 'SERVCITY', 'TYPE_CODE', 'ELEVATION', 'OPERSTATUS']);
    q.returnGeometry(true);
    q.run(function (err, fc) {
      if (err || !fc || !fc.features.length) {
        showResults('<p class="find-empty">No airports found within 100 miles.</p>');
        return;
      }
      var origin  = turf.point([latlng.lng, latlng.lat]);
      var nearest = turf.nearestPoint(origin, fc);
      var distMi  = turf.distance(origin, nearest, { units: 'miles' });
      var p       = nearest.properties;
      var nearLL  = L.latLng(nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]);
      var cfg     = TYPE_CFG[p.TYPE_CODE] || TYPE_CFG.AD;

      clickMarker = L.circleMarker(latlng, {
        radius: 7, fillColor: '#fff', color: '#2563eb', weight: 3, fillOpacity: 1
      }).bindTooltip('Search point').addTo(map);

      nearestLine = L.polyline([latlng, nearLL], {
        color: '#2563eb', weight: 2, dashArray: '6 4', opacity: 0.75
      }).addTo(map);

      L.popup({ className: SLUG + '-popup' })
        .setLatLng(nearLL)
        .setContent(
          '<strong>' + p.NAME + '</strong><br>' +
          (p.SERVCITY || '') + ', ' + (p.STATE || '') + '<br>' +
          cfg.abbr + '<br>' +
          '<strong style="color:#2563eb">' + distMi.toFixed(1) + ' miles away</strong>'
        )
        .openOn(map);

      showResults(
        '<div class="result-heading">Nearest Airport</div>' +
        '<div class="result-item">' +
        '  <div class="ri-dot" style="background:' + cfg.color + '"></div>' +
        '  <div class="ri-body">' +
        '    <div class="ri-name">' + p.NAME + '</div>' +
        '    <div class="ri-sub">' + (p.SERVCITY || '') + ', ' + (p.STATE || '') +
                (p.IDENT ? ' &bull; ' + p.IDENT : '') + ' &bull; ' + cfg.abbr + '</div>' +
        '  </div>' +
        '  <div class="ri-dist">' + distMi.toFixed(1) + ' mi</div>' +
        '</div>'
      );
    });
  }

  // ---- Radius search -------------------------------------------------------
  function doRadiusSearch(latlng) {
    clearFind();
    showResults('<p class="find-loading">Searching…</p>');

    var circleGeo = turf.circle([latlng.lng, latlng.lat], radiusMiles,
      { units: 'miles', steps: 64 });

    radiusCircle = L.geoJSON(circleGeo, {
      style: { color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.06, weight: 2 }
    }).addTo(map);

    clickMarker = L.circleMarker(latlng, {
      radius: 7, fillColor: '#fff', color: '#2563eb', weight: 3, fillOpacity: 1
    }).bindTooltip('Search point').addTo(map);

    var q = L.esri.query({ url: SVC_URL });
    q.within(radiusCircle.getBounds());
    q.where(buildWhere());
    q.fields(['OBJECTID', 'NAME', 'IDENT', 'STATE', 'SERVCITY', 'TYPE_CODE', 'ELEVATION']);
    q.returnGeometry(true);
    q.run(function (err, fc) {
      if (err || !fc) {
        showResults('<p class="find-empty">Search failed. Please try again.</p>');
        return;
      }
      var origin   = turf.point([latlng.lng, latlng.lat]);
      var inCircle = fc.features
        .filter(function (f) { return turf.booleanPointInPolygon(f, circleGeo); })
        .map(function (f) {
          return { f: f, dist: turf.distance(origin, f, { units: 'miles' }) };
        })
        .sort(function (a, b) { return a.dist - b.dist; });

      if (!inCircle.length) {
        showResults('<p class="find-empty">No airports within ' + radiusMiles + ' miles.</p>');
        return;
      }

      var total = inCircle.length;
      var shown = Math.min(total, 40);
      var html  = '<div class="result-heading">' + total.toLocaleString() +
        ' airport' + (total !== 1 ? 's' : '') + ' within ' + radiusMiles + ' miles</div>' +
        '<div class="result-list">';
      inCircle.slice(0, shown).forEach(function (item) {
        var p   = item.f.properties;
        var cfg = TYPE_CFG[p.TYPE_CODE] || TYPE_CFG.AD;
        html += '<div class="result-item">' +
          '<div class="ri-dot" style="background:' + cfg.color + '"></div>' +
          '<div class="ri-body">' +
          '  <div class="ri-name">' + p.NAME + '</div>' +
          '  <div class="ri-sub">' + (p.SERVCITY || '') + ', ' + (p.STATE || '') +
                (p.IDENT ? ' &bull; ' + p.IDENT : '') + ' &bull; ' + cfg.abbr + '</div>' +
          '</div>' +
          '<div class="ri-dist">' + item.dist.toFixed(1) + ' mi</div>' +
          '</div>';
      });
      if (total > shown) {
        html += '<p class="result-more">+ ' + (total - shown) + ' more not shown</p>';
      }
      html += '</div>';
      showResults(html);
    });
  }

  // ---- Helpers -------------------------------------------------------------
  function clearFind() {
    if (clickMarker)  { map.removeLayer(clickMarker);  clickMarker  = null; }
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
    if (nearestLine)  { map.removeLayer(nearestLine);  nearestLine  = null; }
    map.closePopup();
    resultsPanel.style.display = 'none';
    resultsPanel.innerHTML = '';
  }
  function showResults(html) {
    resultsPanel.innerHTML = html;
    resultsPanel.style.display = '';
  }

  // ---- Search --------------------------------------------------------------
  var searchInput    = document.getElementById(SLUG + '-search');
  var searchDropdown = document.getElementById(SLUG + '-search-dropdown');
  var searchTimer;

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var q = searchInput.value.trim();
    if (q.length < 2) {
      searchDropdown.style.display = 'none';
      searchDropdown.innerHTML = '';
      return;
    }
    searchTimer = setTimeout(function () { doSearch(q); }, 350);
  });
  searchInput.addEventListener('blur', function () {
    setTimeout(function () { searchDropdown.style.display = 'none'; }, 200);
  });
  searchInput.addEventListener('focus', function () {
    if (searchDropdown.children.length) searchDropdown.style.display = '';
  });

  function doSearch(q) {
    var esc  = q.replace(/'/g, "''").toUpperCase();
    var wher =
      "UPPER(NAME) LIKE '%" + esc + "%'" +
      " OR UPPER(SERVCITY) LIKE '%" + esc + "%'" +
      " OR UPPER(IDENT) = '" + esc + "'" +
      " OR UPPER(ICAO_ID) = '" + esc + "'";
    if (spokeState) wher = "(" + wher + ") AND STATE = '" + spokeState + "'";

    var query = L.esri.query({ url: SVC_URL });
    query.where(wher);
    query.fields(['OBJECTID', 'NAME', 'IDENT', 'ICAO_ID', 'STATE', 'SERVCITY', 'TYPE_CODE']);
    query.limit(8);
    query.returnGeometry(true);
    query.run(function (err, fc) {
      searchDropdown.innerHTML = '';
      if (err || !fc || !fc.features.length) {
        var none = document.createElement('div');
        none.className = 'sr-empty';
        none.textContent = 'No results found';
        searchDropdown.appendChild(none);
        searchDropdown.style.display = '';
        return;
      }
      fc.features.forEach(function (f) {
        var p   = f.properties;
        var cfg = TYPE_CFG[p.TYPE_CODE] || TYPE_CFG.AD;
        var ll  = L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]);
        var row = document.createElement('div');
        row.className = 'sr-item';
        row.innerHTML =
          '<span class="sr-dot" style="background:' + cfg.color + '"></span>' +
          '<span class="sr-text">' +
          '  <strong>' + p.NAME + '</strong>' +
          '  <small>' + (p.SERVCITY || '') + ', ' + (p.STATE || '') +
               (p.IDENT ? ' &bull; ' + p.IDENT : '') +
          '  </small>' +
          '</span>';
        row.addEventListener('mousedown', function () {
          map.setView(ll, 13);
          searchInput.value = p.NAME;
          searchDropdown.style.display = 'none';
          L.popup()
            .setLatLng(ll)
            .setContent('<strong>' + p.NAME + '</strong><br>' +
              (p.SERVCITY || '') + ', ' + (p.STATE || '') +
              (p.IDENT ? '<br>' + p.IDENT : '') +
              '<br>' + cfg.abbr)
            .openOn(map);
        });
        searchDropdown.appendChild(row);
      });
      searchDropdown.style.display = '';
    });
  }

})();
