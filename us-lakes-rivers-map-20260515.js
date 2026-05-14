(function () {
  'use strict';

  var MAP_ID = 'us-lakes-rivers-map-map';
  var CONTAINER_ID = 'us-lakes-rivers-map-container';

  var RIVERS_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Rivers_and_Streams/FeatureServer/0';
  var LAKES_URL  = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Detailed_Water_Bodies/FeatureServer/0';
  var STATES_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_States_Generalized_Boundaries/FeatureServer/0';

  var container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  var stateAttr = (container.getAttribute('data-state') || '').trim();
  var IS_STATE_VIEW = stateAttr.length > 0;
  var STATE_ABBR = IS_STATE_VIEW ? stateAttr.toUpperCase() : null;

  var DEFAULT_VIEW = { center: [38.5, -97.0], zoom: 4 };

  var canvasRenderer = L.canvas({ padding: 0.5, tolerance: 10 });

  var map = L.map(MAP_ID, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: 3,
    maxZoom: 17,
    renderer: canvasRenderer,
    zoomControl: true
  });

  (function injectZoomHint() {
    var mapEl = document.getElementById(MAP_ID);
    if (!mapEl) return;
    var hint = document.createElement('div');
    hint.className = 'lr-zoom-hint';
    hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);'
      + 'background:rgba(31,63,120,0.92);color:#fff;font-size:12.5px;font-weight:500;'
      + 'padding:6px 14px;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,0.18);'
      + 'z-index:500;pointer-events:none;transition:opacity .35s ease;'
      + 'letter-spacing:0.2px;white-space:nowrap;max-width:92%;text-align:center;';
    hint.textContent = IS_STATE_VIEW
      ? 'Zoom in to see smaller rivers and lakes'
      : 'Zoom in to your area to see more rivers and lakes';
    mapEl.appendChild(hint);

    function update() {
      var z = map.getZoom();
      if (z >= 8) {
        hint.style.opacity = '0';
      } else {
        hint.style.opacity = '1';
        hint.textContent = z >= 7
          ? 'Zoom in for full detail'
          : (IS_STATE_VIEW
            ? 'Zoom in to see smaller rivers and lakes'
            : 'Zoom in to your area to see more rivers and lakes');
      }
    }
    update();
    map.on('zoomend', update);
  })();

  var basemaps = {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }),
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    ),
    terrain: L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      { attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)', maxZoom: 17 }
    )
  };
  basemaps.street.addTo(map);
  var activeBase = 'street';

  function setBasemap(name) {
    if (!basemaps[name] || name === activeBase) return;
    map.removeLayer(basemaps[activeBase]);
    basemaps[name].addTo(map);
    activeBase = name;
  }

  var statusEl = document.getElementById('lr-status');
  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.className = 'lr-status' + (cls ? ' ' + cls : '');
    statusEl.textContent = msg;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits || 0 });
  }

  function lakeStyleFor(ftype) {
    var fill = '#5ba3e0', stroke = '#1f5fa3', dashed = null;
    if (ftype === 'Reservoir')      { fill = '#94c1e6'; stroke = '#1f3f78'; dashed = '3,3'; }
    else if (ftype === 'Swamp/Marsh') { fill = '#8db4a8'; stroke = '#3a6450'; }
    else if (ftype === 'Stream/River') { fill = '#7fbfe4'; stroke = '#2f7ed8'; }
    return { color: stroke, weight: 0.8, fillColor: fill, fillOpacity: 0.55, dashArray: dashed };
  }

  function lakePopupHtml(p) {
    var html = '<h4>' + escapeHtml(p.NAME || 'Unnamed water body') + '</h4>'
      + '<div class="lr-meta">' + escapeHtml(p.FCODE_DESC || p.FTYPE || 'Water body') + '</div>';
    if (p.SQMI != null) html += '<div class="lr-meta">Area: ' + fmt(p.SQMI, 2) + ' sq mi</div>';
    return html;
  }

  function riverPopupHtml(p) {
    var html = '<h4>' + escapeHtml(p.Name || 'Unnamed waterway') + '</h4>'
      + '<div class="lr-meta">'
      + (p.Feature ? escapeHtml(p.Feature) : 'Stream')
      + (p.State ? ', ' + escapeHtml(p.State) : '')
      + '</div>';
    if (p.Miles) html += '<div class="lr-meta">Mapped length: ' + fmt(p.Miles, 1) + ' mi</div>';
    return html;
  }

  var ZOOM_WHERE_RIVERS = [
    { maxZoom: 5,  where: "Miles >= 200" },
    { maxZoom: 6,  where: "Miles >= 100" },
    { maxZoom: 7,  where: "Miles >= 40" },
    { maxZoom: 8,  where: "Miles >= 15" },
    { maxZoom: 9,  where: "Miles >= 6" },
    { maxZoom: 99, where: "Miles >= 0" }
  ];
  var ZOOM_WHERE_LAKES = [
    { maxZoom: 5,  where: "SQMI >= 8" },
    { maxZoom: 6,  where: "SQMI >= 3" },
    { maxZoom: 7,  where: "SQMI >= 1" },
    { maxZoom: 8,  where: "SQMI >= 0.3" },
    { maxZoom: 9,  where: "SQMI >= 0.1" },
    { maxZoom: 99, where: "SQMI >= 0" }
  ];

  function pickWhere(rules, zoom) {
    for (var i = 0; i < rules.length; i++) {
      if (zoom <= rules[i].maxZoom) return rules[i].where;
    }
    return rules[rules.length - 1].where;
  }

  function combineWhere(base, extra) {
    if (!extra || extra === '1=1') return base;
    if (!base || base === '1=1') return extra;
    return '(' + base + ') AND (' + extra + ')';
  }

  function riverStyle(feature) {
    var miles = feature.properties && feature.properties.Miles;
    var weight = 1.0;
    if (miles >= 200) weight = 2.2;
    else if (miles >= 100) weight = 1.8;
    else if (miles >= 40) weight = 1.4;
    else if (miles >= 10) weight = 1.1;
    return { color: '#2f7ed8', weight: weight, opacity: 0.85 };
  }

  var statesLayer = L.esri.featureLayer({
    url: STATES_URL,
    style: function () {
      return { color: '#5a6b7a', weight: 1, fill: false, opacity: 0.65, dashArray: '2,3' };
    },
    interactive: false
  });

  var STATE_FILTER_RIVERS = STATE_ABBR ? "State = '" + STATE_ABBR + "'" : null;

  var riversLayer = L.esri.featureLayer({
    url: RIVERS_URL,
    where: combineWhere(STATE_FILTER_RIVERS, pickWhere(ZOOM_WHERE_RIVERS, map.getZoom())),
    simplifyFactor: 0.5,
    precision: 5,
    style: riverStyle
  });
  riversLayer.bindPopup(function (l) { return riverPopupHtml(l.feature.properties || {}); });

  var lakesLayer = L.esri.featureLayer({
    url: LAKES_URL,
    where: pickWhere(ZOOM_WHERE_LAKES, map.getZoom()),
    simplifyFactor: 0.5,
    precision: 5,
    style: function (f) { return lakeStyleFor(f.properties && f.properties.FTYPE); }
  });
  lakesLayer.bindPopup(function (l) { return lakePopupHtml(l.feature.properties || {}); });

  function refreshZoomFilters() {
    var z = map.getZoom();
    var newRiversWhere = combineWhere(STATE_FILTER_RIVERS, pickWhere(ZOOM_WHERE_RIVERS, z));
    if (riversLayer.options.where !== newRiversWhere) {
      riversLayer.setWhere(newRiversWhere);
      riversLayer.options.where = newRiversWhere;
    }
    var newLakesWhere = pickWhere(ZOOM_WHERE_LAKES, z);
    if (lakesLayer.options.where !== newLakesWhere) {
      lakesLayer.setWhere(newLakesWhere);
      lakesLayer.options.where = newLakesWhere;
    }
  }
  map.on('zoomend', refreshZoomFilters);

  statesLayer.addTo(map);
  riversLayer.addTo(map);
  lakesLayer.addTo(map);

  var chkRivers = document.getElementById('lr-show-rivers');
  var chkLakes  = document.getElementById('lr-show-lakes');
  var chkStates = document.getElementById('lr-show-states');

  function bindToggle(el, layer) {
    if (!el) return;
    el.addEventListener('change', function () {
      if (!layer) return;
      if (el.checked) map.addLayer(layer);
      else map.removeLayer(layer);
    });
  }
  bindToggle(chkRivers, riversLayer);
  bindToggle(chkLakes, lakesLayer);
  bindToggle(chkStates, statesLayer);

  var baseRadios = document.querySelectorAll('input[name="lr-base"]');
  Array.prototype.forEach.call(baseRadios, function (r) {
    r.addEventListener('change', function () { if (r.checked) setBasemap(r.value); });
  });

  var searchEl = document.getElementById('lr-search');
  var searchTimer = null;
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { runSearch(searchEl.value.trim()); }, 350);
    });
    searchEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(searchEl.value.trim()); }
    });
  }

  function escapeSql(s) { return s.replace(/'/g, "''"); }

  function runSearch(q) {
    if (!q) { setStatus('Click on any river or lake to see details.'); return; }
    var safe = escapeSql(q).toUpperCase();
    setStatus('Searching for "' + q + '"...', 'lr-busy');

    var stateClauseRivers = STATE_ABBR ? " AND State='" + STATE_ABBR + "'" : '';

    var rivPromise = fetch(RIVERS_URL + '/query?where='
      + encodeURIComponent("UPPER(Name) LIKE '%" + safe + "%'" + stateClauseRivers)
      + '&outFields=Name,Feature,State,Miles&outSR=4326&returnGeometry=true&f=geojson'
      + '&resultRecordCount=10&orderByFields=Miles%20DESC').then(function (r) { return r.json(); });

    var lakePromise = fetch(LAKES_URL + '/query?where='
      + encodeURIComponent("UPPER(NAME) LIKE '%" + safe + "%'")
      + '&outFields=NAME,FTYPE,FCODE_DESC,SQMI&outSR=4326&returnGeometry=true&f=geojson'
      + '&resultRecordCount=10&orderByFields=SQMI%20DESC').then(function (r) { return r.json(); });

    Promise.all([rivPromise, lakePromise]).then(function (results) {
      var rivers = (results[0] && results[0].features) || [];
      var lakes  = (results[1] && results[1].features) || [];
      if (!rivers.length && !lakes.length) {
        setStatus('No matches for "' + q + '". Try another name.', 'lr-error');
        return;
      }
      var group = L.featureGroup();
      lakes.forEach(function (f) { group.addLayer(L.geoJSON(f)); });
      rivers.forEach(function (f) { group.addLayer(L.geoJSON(f)); });
      try {
        var b = group.getBounds();
        if (b.isValid()) map.fitBounds(b.pad(0.25), { maxZoom: 12 });
      } catch (e) {}
      setStatus('Found ' + (rivers.length + lakes.length) + ' match'
        + ((rivers.length + lakes.length) === 1 ? '' : 'es') + ' for "' + q + '". Map zoomed to results.');
    }).catch(function () {
      setStatus('Search failed. Try again.', 'lr-error');
    });
  }

  if (IS_STATE_VIEW) {
    setStatus('Loading ' + STATE_ABBR + '...', 'lr-busy');
    var stateQuery = STATES_URL + '/query?where=' + encodeURIComponent("STATE_ABBR='" + STATE_ABBR + "'")
      + '&outFields=STATE_NAME,STATE_ABBR&returnGeometry=true&outSR=4326&f=geojson';

    fetch(stateQuery).then(function (r) { return r.json(); }).then(function (gj) {
      if (!gj || !gj.features || !gj.features.length) {
        setStatus('Unable to load state boundary for ' + STATE_ABBR + '.', 'lr-error');
        return;
      }
      var feat = gj.features[0];
      var stateLayer = L.geoJSON(feat, {
        style: { color: '#1f3f78', weight: 2.5, fill: false, opacity: 0.95 },
        interactive: false
      }).addTo(map);

      var bounds = stateLayer.getBounds();
      map.fitBounds(bounds, { padding: [20, 20] });

      refreshZoomFilters();
      setStatus('Showing ' + (feat.properties.STATE_NAME || STATE_ABBR)
        + '. Click rivers or lakes for details.');
    }).catch(function () {
      setStatus('State load failed.', 'lr-error');
    });
  } else {
    var hash = loadStateFromUrl();
    if (hash && hash.lat && hash.lng && hash.z) {
      map.setView([parseFloat(hash.lat), parseFloat(hash.lng)], parseInt(hash.z, 10));
    }
    map.on('moveend zoomend', function () { updateShareUrl(map); });
  }

  function updateShareUrl(m) {
    var c = m.getCenter();
    var state = { lat: c.lat.toFixed(4), lng: c.lng.toFixed(4), z: m.getZoom() };
    var hash = '#' + Object.keys(state).map(function (k) { return k + '=' + encodeURIComponent(state[k]); }).join('&');
    history.replaceState(null, '', hash);
  }
  function loadStateFromUrl() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('='); if (i < 0) return;
      out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return out;
  }
})();
