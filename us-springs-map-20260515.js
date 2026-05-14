(function () {
  'use strict';

  var MAP_ID = 'us-springs-map-map';
  var CONTAINER_ID = 'us-springs-map-container';

  var SPRINGS_URL = 'https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/MapServer/20';
  var HOT_URL     = 'https://services4.arcgis.com/3Gy6zyvWSR2Q8akX/arcgis/rest/services/thermal_springs_50_states/FeatureServer/0';
  var STATES_URL  = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_States_Generalized_Boundaries/FeatureServer/0';

  // featuretype 7 = Spring, 3 = Waterbody Outlet (spring runs in FL etc.)
  var WHERE_ALL_SPRINGS   = 'featuretype IN (7,3)';
  var WHERE_NAMED_SPRINGS = "featuretype IN (7,3) AND gnisid IS NOT NULL";

  var container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  var stateAttr = (container.getAttribute('data-state') || '').trim();
  var IS_STATE_VIEW = stateAttr.length > 0;
  var STATE_ABBR = IS_STATE_VIEW ? stateAttr.toUpperCase() : null;

  var DEFAULT_VIEW = { center: [38.5, -97.0], zoom: 4 };

  var hashView = loadHashView();
  var initCenter = hashView ? [parseFloat(hashView.lat), parseFloat(hashView.lng)] : DEFAULT_VIEW.center;
  var initZoom   = hashView ? parseInt(hashView.z, 10) : DEFAULT_VIEW.zoom;

  var map = L.map(MAP_ID, {
    center: initCenter,
    zoom: initZoom,
    minZoom: 3,
    maxZoom: 18,
    preferCanvas: true,
    zoomControl: true
  });

  // ── basemaps ──────────────────────────────────────────────────────────────
  var basemaps = {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }),
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    ),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
      maxZoom: 17
    })
  };
  basemaps.street.addTo(map);
  var activeBase = 'street';
  function setBasemap(name) {
    if (!basemaps[name] || name === activeBase) return;
    map.removeLayer(basemaps[activeBase]);
    basemaps[name].addTo(map);
    activeBase = name;
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  var statusEl = document.getElementById('sp-status');
  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.className = 'sp-status' + (cls ? ' ' + cls : '');
    statusEl.textContent = msg;
  }
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeSql(s) { return String(s).replace(/'/g, "''"); }
  function tidyName(s) { if (!s) return ''; return String(s).replace(/\s+/g, ' ').trim(); }
  function pretty(lat, lng) { return (lat || 0).toFixed(4) + ', ' + (lng || 0).toFixed(4); }

  function springPopupHtml(p, latlng) {
    var name = tidyName(p.gnisidlabel) || 'Unnamed spring';
    var typeLabel = p.featuretypelabel || 'Spring';
    var coords = pretty(latlng.lat, latlng.lng);
    var gmaps = 'https://www.google.com/maps?q=' + latlng.lat + ',' + latlng.lng;
    var html = '<h4>' + escapeHtml(name) + '</h4>'
      + '<div class="sp-meta">' + escapeHtml(typeLabel) + '</div>'
      + '<div class="sp-meta">' + escapeHtml(coords) + '</div>'
      + '<div class="sp-meta"><a href="' + gmaps + '" target="_blank" rel="noopener">Open in Google Maps</a></div>';
    if (p.gnisid) {
      html += '<div class="sp-meta"><a href="https://edits.nationalmap.gov/apps/gaz-domestic/public/gaz-record/' + p.gnisid + '" target="_blank" rel="noopener">USGS GNIS record</a></div>';
    }
    return html;
  }

  function hotPopupHtml(p, latlng) {
    var name = tidyName(p.Name) || 'Thermal spring';
    var tF = (p.TempF || '').toString().replace(/null/i, '').trim();
    var tC = (p.TempC || '').toString().replace(/null/i, '').trim();
    var gmaps = 'https://www.google.com/maps?q=' + latlng.lat + ',' + latlng.lng;
    var html = '<h4>' + escapeHtml(name) + '</h4>'
      + '<div class="sp-meta">Hot / thermal spring' + (p.State ? ' &middot; ' + escapeHtml(p.State) : '') + '</div>';
    if (tF || tC) {
      var bits = [];
      if (tF) bits.push(tF + '&deg;F');
      if (tC) bits.push(tC + '&deg;C');
      html += '<div class="sp-meta"><span class="sp-temp">' + bits.join(' &middot; ') + '</span></div>';
    }
    html += '<div class="sp-meta">' + escapeHtml(pretty(latlng.lat, latlng.lng)) + '</div>'
      + '<div class="sp-meta"><a href="' + gmaps + '" target="_blank" rel="noopener">Open in Google Maps</a></div>'
      + '<div class="sp-meta">Source: NOAA NGDC Thermal Springs of the United States</div>';
    return html;
  }

  // ── springs cluster layer (the 151K+ cold springs + outlets) ──────────────
  var springsLayer = L.esri.Cluster.featureLayer({
    url: SPRINGS_URL,
    where: WHERE_ALL_SPRINGS,
    fields: ['OBJECTID', 'gnisid', 'gnisidlabel', 'featuretype', 'featuretypelabel'],
    polygonOptions: { color: '#1f5fa3', weight: 1.5, fillOpacity: 0.18 },
    pointToLayer: function (geojson, latlng) {
      var p = geojson.properties || {};
      var hasName = !!p.gnisid;
      var isOutlet = p.featuretype === 3;
      var fill = isOutlet ? '#94c1e6' : (hasName ? '#2f86c8' : '#7fbfe4');
      var stroke = isOutlet ? '#3a6fa3' : (hasName ? '#155e93' : '#2f7ed8');
      return L.circleMarker(latlng, {
        radius: hasName ? 5 : 4,
        fillColor: fill,
        color: stroke,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.85
      });
    },
    onEachFeature: function (feature, layer) {
      layer.on('click', function (e) {
        layer.bindPopup(springPopupHtml(feature.properties || {}, e.latlng)).openPopup();
      });
    }
  });

  // ── hot springs layer (NOAA 1,661 thermal points) ─────────────────────────
  var hotLayer = L.layerGroup();
  var hotMarkers = []; // for search

  function loadHotSprings() {
    var where = IS_STATE_VIEW ? "State='" + STATE_ABBR + "'" : '1=1';
    var url = HOT_URL + '/query?where=' + encodeURIComponent(where)
      + '&outFields=*&outSR=4326&returnGeometry=true&f=geojson&resultRecordCount=2000';
    return fetch(url).then(function (r) { return r.json(); }).then(function (gj) {
      if (!gj || !gj.features) return 0;
      gj.features.forEach(function (f) {
        var c = f.geometry && f.geometry.coordinates;
        if (!c || c.length < 2) return;
        var latlng = L.latLng(c[1], c[0]);
        var m = L.circleMarker(latlng, {
          radius: 6,
          fillColor: '#e85d3a',
          color: '#a8290f',
          weight: 1.4,
          opacity: 1,
          fillOpacity: 0.9
        });
        m.bindPopup(hotPopupHtml(f.properties || {}, latlng));
        m.addTo(hotLayer);
        m._hotProps = f.properties || {};
        hotMarkers.push(m);
      });
      return gj.features.length;
    });
  }

  // ── state outlines layer ──────────────────────────────────────────────────
  var statesLayer = L.esri.featureLayer({
    url: STATES_URL,
    style: function () {
      return { color: '#5a6b7a', weight: 1, fill: false, opacity: 0.65, dashArray: '2,3' };
    },
    interactive: false
  });

  // ── named-only filter toggle ──────────────────────────────────────────────
  function applyNamedFilter(namedOnly) {
    var w = namedOnly ? WHERE_NAMED_SPRINGS : WHERE_ALL_SPRINGS;
    if (IS_STATE_VIEW) {
      // viewport already constrains; just swap where
    }
    if (springsLayer.options.where !== w) {
      springsLayer.options.where = w;
      springsLayer.setWhere(w);
    }
  }

  // ── add layers in initial state ───────────────────────────────────────────
  statesLayer.addTo(map);
  springsLayer.addTo(map);
  hotLayer.addTo(map);

  setStatus('Loading hot springs...', 'sp-busy');
  loadHotSprings().then(function (n) {
    setStatus(IS_STATE_VIEW
      ? 'Showing springs in ' + STATE_ABBR + '. Click any marker for details.'
      : 'Showing 151K springs + 1,661 hot springs across the US. Zoom in to see individual points.');
    var hotCnt = document.getElementById('sp-cnt-hot');
    if (hotCnt) hotCnt.textContent = '(' + n.toLocaleString() + ')';
  }).catch(function () {
    setStatus('Could not load hot springs overlay.', 'sp-error');
  });

  // ── toggle wiring ─────────────────────────────────────────────────────────
  var chkSprings = document.getElementById('sp-show-springs');
  var chkNamed   = document.getElementById('sp-show-named');
  var chkHot     = document.getElementById('sp-show-hot');
  var chkStates  = document.getElementById('sp-show-states');

  if (chkSprings) chkSprings.addEventListener('change', function () {
    if (chkSprings.checked) map.addLayer(springsLayer);
    else map.removeLayer(springsLayer);
  });
  if (chkNamed) chkNamed.addEventListener('change', function () {
    applyNamedFilter(chkNamed.checked);
  });
  if (chkHot) chkHot.addEventListener('change', function () {
    if (chkHot.checked) map.addLayer(hotLayer);
    else map.removeLayer(hotLayer);
  });
  if (chkStates) chkStates.addEventListener('change', function () {
    if (chkStates.checked) map.addLayer(statesLayer);
    else map.removeLayer(statesLayer);
  });

  var baseRadios = document.querySelectorAll('input[name="sp-base"]');
  Array.prototype.forEach.call(baseRadios, function (r) {
    r.addEventListener('change', function () { if (r.checked) setBasemap(r.value); });
  });

  // ── search (named springs + hot springs + Nominatim fallback) ─────────────
  var searchEl = document.getElementById('sp-search');
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

  function runSearch(q) {
    if (!q) { setStatus('Click on any marker for details.'); return; }
    var qu = q.toUpperCase();
    setStatus('Searching "' + q + '"...', 'sp-busy');

    // local hot-springs match (instant)
    var hotMatches = hotMarkers.filter(function (m) {
      return (m._hotProps.Name || '').toUpperCase().indexOf(qu) !== -1;
    }).slice(0, 5);

    // 3DHP gnisidlabel match (server)
    var safe = escapeSql(qu);
    var coldUrl = SPRINGS_URL + '/query?where='
      + encodeURIComponent("featuretype IN (7,3) AND UPPER(gnisidlabel) LIKE '%" + safe + "%'")
      + '&outFields=gnisid,gnisidlabel,featuretypelabel&outSR=4326&returnGeometry=true'
      + '&resultRecordCount=10&f=geojson';

    fetch(coldUrl).then(function (r) { return r.json(); }).then(function (gj) {
      var cold = (gj && gj.features) || [];
      var totalDirect = hotMatches.length + cold.length;

      if (totalDirect > 0) {
        var grp = L.featureGroup();
        cold.forEach(function (f) {
          if (!f.geometry || !f.geometry.coordinates) return;
          var c = f.geometry.coordinates;
          grp.addLayer(L.circleMarker([c[1], c[0]], { radius: 8, color: '#155e93', fillColor: '#2f86c8', fillOpacity: 0.9 }));
        });
        hotMatches.forEach(function (m) { grp.addLayer(L.circleMarker(m.getLatLng(), { radius: 8, color: '#a8290f', fillColor: '#e85d3a', fillOpacity: 0.9 })); });
        try {
          var b = grp.getBounds();
          if (b.isValid()) map.fitBounds(b.pad(0.5), { maxZoom: 12 });
        } catch (e) {}
        setStatus('Found ' + totalDirect + ' spring match' + (totalDirect === 1 ? '' : 'es') + ' for "' + q + '". Zoom and click for details.');
        return;
      }

      // fall back to Nominatim place lookup
      fetch('https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q='
        + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (places) {
          if (!places || !places.length) {
            setStatus('No spring or place matches for "' + q + '".', 'sp-error');
            return;
          }
          var p = places[0];
          map.setView([parseFloat(p.lat), parseFloat(p.lon)], 11);
          setStatus('Zoomed to "' + (p.display_name || q) + '". Click markers to see springs near this place.');
        }).catch(function () {
          setStatus('Search failed. Try again.', 'sp-error');
        });
    }).catch(function () {
      setStatus('Search failed. Try again.', 'sp-error');
    });
  }

  // ── geolocate ─────────────────────────────────────────────────────────────
  var locateBtn = document.getElementById('sp-locate');
  if (locateBtn) {
    locateBtn.addEventListener('click', function () {
      setStatus('Locating you...', 'sp-busy');
      map.locate({ setView: true, maxZoom: 11, enableHighAccuracy: false, timeout: 8000 });
    });
    map.on('locationfound', function () { setStatus('Showing springs near your location.'); });
    map.on('locationerror', function () { setStatus('Could not get your location.', 'sp-error'); });
  }

  // ── state-view zoom (spoke pages) ─────────────────────────────────────────
  if (IS_STATE_VIEW) {
    setStatus('Loading ' + STATE_ABBR + '...', 'sp-busy');
    var stateQuery = STATES_URL + '/query?where=' + encodeURIComponent("STATE_ABBR='" + STATE_ABBR + "'")
      + '&outFields=STATE_NAME,STATE_ABBR&returnGeometry=true&outSR=4326&f=geojson';
    fetch(stateQuery).then(function (r) { return r.json(); }).then(function (gj) {
      if (!gj || !gj.features || !gj.features.length) {
        setStatus('Could not load state boundary for ' + STATE_ABBR + '.', 'sp-error');
        return;
      }
      var feat = gj.features[0];
      var outline = L.geoJSON(feat, {
        style: { color: '#1f3f78', weight: 2.5, fill: false, opacity: 0.95 },
        interactive: false
      }).addTo(map);
      map.fitBounds(outline.getBounds(), { padding: [20, 20] });
      setStatus('Showing springs in ' + (feat.properties.STATE_NAME || STATE_ABBR) + '. Click markers for details.');
    }).catch(function () {
      setStatus('State load failed.', 'sp-error');
    });
  }

  // ── share-link hash ───────────────────────────────────────────────────────
  if (!IS_STATE_VIEW) {
    map.on('moveend zoomend', function () { updateShareUrl(map); });
  }
  function updateShareUrl(m) {
    var c = m.getCenter();
    var hash = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + m.getZoom();
    history.replaceState(null, '', hash);
  }
  function loadHashView() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('='); if (i < 0) return;
      out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return (out.lat && out.lng && out.z) ? out : null;
  }

  // ── zoom hint ─────────────────────────────────────────────────────────────
  (function injectZoomHint() {
    var mapEl = document.getElementById(MAP_ID);
    if (!mapEl) return;
    var hint = document.createElement('div');
    hint.className = 'sp-zoom-hint';
    hint.textContent = IS_STATE_VIEW
      ? 'Zoom in to see individual springs'
      : 'Zoom in to your area to see individual springs';
    mapEl.appendChild(hint);
    function update() {
      var z = map.getZoom();
      hint.style.opacity = (z >= 8) ? '0' : '1';
    }
    update();
    map.on('zoomend', update);
  })();

})();
