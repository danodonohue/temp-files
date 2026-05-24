(function () {
  'use strict';

  var CONFIG = {
    mapId: 'us-wild-scenic-rivers-map-map',
    dataBase: 'https://mapscaping.com/wp-content/uploads/2026/05/',
    version: '20260525',
    studyService: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_WildScenicRiverActiveStudyRivers_01/MapServer/1',
    eligibleService: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_WildScenicRiverEligibleSuitable_01/MapServer/1',
    statesOutline: 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json',
    initialView: [39.5, -98.35],
    initialZoom: 4,
    nominatim: 'https://nominatim.openstreetmap.org/search'
  };

  function fileUrl(key) {
    return CONFIG.dataBase + 'wsr-' + key + '-' + CONFIG.version + '.json';
  }

  // Convert compact pre-baked feature to internal shape with built LineString GeoJSON
  function inflate(f) {
    var geom = f.geom && f.geom.length === 1
      ? { type: 'LineString', coordinates: f.geom[0] }
      : { type: 'MultiLineString', coordinates: f.geom || [] };
    var orv = f.orv || {};
    return {
      objectid: f.id,
      river_id: f.rid,
      wsr_river_name: f.name,
      wsr_river_shortname: f.sname,
      classification: f.cls,
      segment_miles: f.mi,
      agency: f.ag,
      state: f.st,
      county: f.co,
      administrative_unit: f.au,
      orv_culture: orv.culture ? 'Y' : 'N',
      orv_fish: orv.fish ? 'Y' : 'N',
      orv_geologic: orv.geologic ? 'Y' : 'N',
      orv_historic: orv.historic ? 'Y' : 'N',
      orv_recreational: orv.recreational ? 'Y' : 'N',
      orv_scenic: orv.scenic ? 'Y' : 'N',
      orv_wildlife: orv.wildlife ? 'Y' : 'N',
      _geom: geom
    };
  }

  var CLASSES = {
    'Wild':         { color: '#1e3a8a', order: 0 },
    'Scenic':       { color: '#2563eb', order: 1 },
    'Recreational': { color: '#60a5fa', order: 2 },
    'Unclassified': { color: '#94a3b8', order: 3 }
  };
  var CLASS_ORDER = ['Wild', 'Scenic', 'Recreational', 'Unclassified'];

  var AGENCIES = {
    'USFS': { color: '#15803d', label: 'US Forest Service' },
    'NPS':  { color: '#a16207', label: 'National Park Service' },
    'BLM':  { color: '#b45309', label: 'Bureau of Land Management' },
    'FWS':  { color: '#0e7490', label: 'US Fish and Wildlife Service' }
  };
  var AGENCY_ORDER = ['USFS', 'NPS', 'BLM', 'FWS'];

  var NAME2ABBR = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
    'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Puerto Rico': 'PR', 'Rhode Island': 'RI',
    'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
    'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
  };
  var ABBR2NAME = {};
  for (var _nm in NAME2ABBR) { ABBR2NAME[NAME2ABBR[_nm]] = _nm; }

  var ORV_FIELDS = [
    ['orv_culture', 'Culture'], ['orv_fish', 'Fish'], ['orv_geologic', 'Geologic'],
    ['orv_historic', 'Historic'], ['orv_recreational', 'Recreational'],
    ['orv_scenic', 'Scenic'], ['orv_wildlife', 'Wildlife']
  ];

  var S = {
    map: null,
    renderer: null,
    stateLabel: null,
    stateOutline: null,
    baseLayers: {},
    activeBase: null,
    segments: [],
    classOn: {},
    agencyOn: {},
    nameQuery: '',
    locateMarker: null,
    studyLayer: null,
    studyLoaded: false,
    eligibleLayer: null,
    eligibleLoaded: false,
    segmentsLayer: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function showMsg(text, kind) {
    var el = $('us-wild-scenic-rivers-map-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'wsr-msg wsr-show ' + (kind === 'err' ? 'wsr-err' : 'wsr-info');
  }
  function clearMsg() {
    var el = $('us-wild-scenic-rivers-map-msg');
    if (el) el.className = 'wsr-msg';
  }
  function setLoading(on, text, sub) {
    var el = $('us-wild-scenic-rivers-map-loading');
    if (!el) return;
    el.className = 'wsr-loading' + (on ? '' : ' wsr-hidden');
    if (text) { var t = el.querySelector('.wsr-loading-text'); if (t) t.textContent = text; }
    if (sub) { var s = el.querySelector('.wsr-loading-sub'); if (s) s.textContent = sub; }
  }

  /* ---- basemaps ---- */
  function buildBasemaps() {
    S.baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    });
    S.baseLayers.carto = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: 'abcd', maxZoom: 19
    });
    S.baseLayers.esri = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri', maxZoom: 19
    });
  }
  function setBasemap(key) {
    if (!S.baseLayers[key]) return;
    if (S.activeBase) S.map.removeLayer(S.activeBase);
    S.activeBase = S.baseLayers[key];
    S.activeBase.addTo(S.map);
  }

  /* ---- map setup ---- */
  function initMap() {
    S.renderer = L.canvas({ tolerance: 10 });
    S.map = L.map(CONFIG.mapId, {
      center: CONFIG.initialView,
      zoom: CONFIG.initialZoom,
      scrollWheelZoom: true,
      preferCanvas: true,
      renderer: S.renderer
    });
    buildBasemaps();
    setBasemap('osm');
    S.segmentsLayer = L.featureGroup().addTo(S.map);
    CLASS_ORDER.forEach(function (c) { S.classOn[c] = true; });
    AGENCY_ORDER.forEach(function (a) { S.agencyOn[a] = true; });
    S.map.on('moveend', updateShareUrl);
  }

  function updateShareUrl() {
    if (!S.map) return;
    var c = S.map.getCenter();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + S.map.getZoom());
  }

  function applyHashView() {
    var hash = window.location.hash.slice(1);
    if (!hash) return false;
    var o = {};
    hash.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) o[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    if (o.lat && o.lng && o.z) {
      S.map.setView([parseFloat(o.lat), parseFloat(o.lng)], parseInt(o.z, 10));
      return true;
    }
    return false;
  }

  /* ---- styling ---- */
  function classOf(seg) {
    var c = seg.classification || 'Unclassified';
    return CLASSES[c] ? c : 'Unclassified';
  }
  function primaryAgency(seg) {
    var raw = (seg.agency || '').split(',')[0].trim();
    return AGENCIES[raw] ? raw : null;
  }
  function baseStyle(seg) {
    return { color: CLASSES[classOf(seg)].color, weight: 3.5, opacity: 0.85 };
  }
  function hiStyle(seg) {
    return { color: CLASSES[classOf(seg)].color, weight: 7, opacity: 1 };
  }

  function orvList(seg) {
    var found = [];
    ORV_FIELDS.forEach(function (pair) {
      var v = seg[pair[0]];
      if (v && String(v).toLowerCase() !== 'n') found.push(pair[1]);
    });
    return found;
  }

  function popupHtml(seg) {
    var cls = classOf(seg);
    var name = seg.wsr_river_name || seg.gnis_name || 'Wild and Scenic River';
    var miles = parseFloat(seg.segment_miles) || 0;
    var html = '<div class="wsr-popup"><h4>' + esc(name) + '</h4>';
    html += '<p><span class="wsr-popup-tag" style="background:' + CLASSES[cls].color + '">' +
      esc(cls) + '</span></p>';
    if (seg.agency) {
      html += '<p><span class="wsr-popup-label">Administered by:</span> ' +
        esc(seg.agency) + '</p>';
    }
    if (miles >= 0.1) {
      html += '<p><span class="wsr-popup-label">Segment length:</span> ' +
        (miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString()) + ' mi</p>';
    }
    if (seg.administrative_unit) {
      html += '<p><span class="wsr-popup-label">Unit:</span> ' +
        esc(seg.administrative_unit) + '</p>';
    }
    if (seg.county) {
      html += '<p><span class="wsr-popup-label">County:</span> ' +
        esc(seg.county) + '</p>';
    }
    if (!S.stateLabel && seg.state) {
      html += '<p><span class="wsr-popup-label">State:</span> ' + esc(seg.state) + '</p>';
    }
    var orvs = orvList(seg);
    if (orvs.length) {
      html += '<p><span class="wsr-popup-label">Outstanding Remarkable Values:</span></p>';
      html += '<div class="wsr-popup-orvs">';
      orvs.forEach(function (o) {
        html += '<span class="wsr-popup-orv">' + esc(o) + '</span>';
      });
      html += '</div>';
    }
    if (seg.wsr_river_shortname) {
      var slug = String(seg.wsr_river_shortname).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      html += '<p><a class="wsr-popup-link" target="_blank" rel="noopener" href="https://www.rivers.gov/rivers/' +
        encodeURIComponent(slug) + '.php">Read more on rivers.gov &raquo;</a></p>';
    }
    html += '</div>';
    return html;
  }

  /* ---- data loading ---- */
  function stateSlug(name) {
    return String(name).toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');
  }

  function loadHub() {
    setLoading(true, 'Loading wild and scenic rivers...', 'Fetching the river map');
    fetch(fileUrl('manifest')).then(function (r) {
      if (!r.ok) throw new Error('manifest HTTP ' + r.status);
      return r.json();
    }).then(function (manifest) {
      var chunks = (manifest && manifest.hubChunks) || ['hub1'];
      return Promise.all(chunks.map(function (key) {
        return fetch(fileUrl(key)).then(function (r) {
          if (!r.ok) throw new Error('chunk ' + key + ' HTTP ' + r.status);
          return r.json();
        });
      }));
    }).then(function (parts) {
      var feats = [];
      parts.forEach(function (p) {
        if (p && p.features) feats = feats.concat(p.features);
      });
      setLoading(true, 'Drawing ' + feats.length.toLocaleString() + ' river segments...',
        'Almost ready');
      setTimeout(function () {
        renderSegments(feats);
        applyHashView();
        setLoading(false);
      }, 30);
    }).catch(function (e) {
      setLoading(false);
      showMsg('Could not load river data. Please refresh to try again.', 'err');
      console.error('WSR fetch error:', e);
    });
  }

  function loadSpoke(stateName) {
    setLoading(true, 'Loading ' + stateName + ' rivers...', 'Preparing the map');
    fetch(fileUrl(stateSlug(stateName))).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var feats = (data && data.features) || [];
      setTimeout(function () {
        renderSegments(feats);
        drawStateOutline(stateName);
        if (feats.length && S.segmentsLayer.getLayers().length) {
          S.map.fitBounds(S.segmentsLayer.getBounds(), { padding: [25, 25] });
        }
        if (!feats.length) {
          showMsg('No designated Wild and Scenic Rivers found for ' + stateName + '.', 'info');
        }
        setLoading(false);
      }, 30);
    }).catch(function (e) {
      setLoading(false);
      showMsg('Could not load rivers for ' + stateName + '.', 'err');
      console.error('WSR spoke fetch:', e);
    });
  }

  function drawStateOutline(stateName) {
    fetch(CONFIG.statesOutline).then(function (r) { return r.json(); }).then(function (gj) {
      if (!gj || !gj.features) return;
      var feat = gj.features.filter(function (f) {
        return (f.properties && f.properties.name === stateName);
      })[0];
      if (!feat) return;
      if (S.stateOutline) S.map.removeLayer(S.stateOutline);
      S.stateOutline = L.geoJSON(feat, {
        interactive: false, renderer: S.renderer,
        style: { color: '#0c4a6e', weight: 2, fill: false, dashArray: '6 4' }
      }).addTo(S.map);
    }).catch(function () { /* outline optional */ });
  }

  function renderSegments(rawFeats) {
    S.segmentsLayer.clearLayers();
    S.segments = [];
    rawFeats.forEach(function (raw) {
      // raw may be compact (from pre-baked JSON) or already-inflated
      var p = raw.geom ? inflate(raw) : raw;
      var gj = { type: 'Feature', geometry: p._geom, properties: p };
      var layer = L.geoJSON(gj, { style: baseStyle(p), renderer: S.renderer });
      layer.bindPopup(popupHtml(p), { maxWidth: 320 });
      (function (pp) {
        layer.on('mouseover', function () { layer.setStyle(hiStyle(pp)); });
        layer.on('mouseout', function () { layer.setStyle(baseStyle(pp)); });
        layer.on('popupopen', function () { layer.setStyle(hiStyle(pp)); });
        layer.on('popupclose', function () { layer.setStyle(baseStyle(pp)); });
      })(p);
      S.segments.push({ props: p, layer: layer, onMap: false,
        nameLc: ((p.wsr_river_name || '') + '').toLowerCase() });
    });
    buildLegends();
    updateStats();
    applyFilters();
  }

  /* ---- filtering ---- */
  function applyFilters() {
    var q = S.nameQuery;
    var shown = 0;
    S.segments.forEach(function (s) {
      var cls = classOf(s.props);
      var agency = primaryAgency(s.props);
      var classOk = S.classOn[cls];
      var agencyOk = !agency || S.agencyOn[agency];
      var nameOk = !q || s.nameLc.indexOf(q) !== -1;
      var ok = classOk && agencyOk && nameOk;
      if (ok) {
        if (!s.onMap) { S.segmentsLayer.addLayer(s.layer); s.onMap = true; }
        shown++;
      } else if (s.onMap) {
        S.segmentsLayer.removeLayer(s.layer);
        s.onMap = false;
      }
    });
    var el = $('us-wild-scenic-rivers-map-showing');
    if (el) {
      var noun = S.stateLabel ? 'segments in ' + S.stateLabel : 'river segments';
      el.textContent = 'Showing ' + shown.toLocaleString() + ' of ' +
        S.segments.length.toLocaleString() + ' ' + noun;
    }
  }

  /* ---- legends ---- */
  function buildLegends() {
    var classBox = $('us-wild-scenic-rivers-map-legend-class');
    var agencyBox = $('us-wild-scenic-rivers-map-legend-agency');
    if (!classBox || !agencyBox) return;

    var classCounts = {};
    var agencyCounts = {};
    CLASS_ORDER.forEach(function (c) { classCounts[c] = 0; });
    AGENCY_ORDER.forEach(function (a) { agencyCounts[a] = 0; });
    S.segments.forEach(function (s) {
      classCounts[classOf(s.props)]++;
      var ag = primaryAgency(s.props);
      if (ag) agencyCounts[ag]++;
    });

    classBox.innerHTML = '';
    CLASS_ORDER.forEach(function (c) {
      if (!classCounts[c]) return;
      var item = document.createElement('label');
      item.className = 'wsr-legend-item';
      item.innerHTML =
        '<input type="checkbox" class="wsr-legend-cb" checked />' +
        '<span class="wsr-swatch" style="background:' + CLASSES[c].color + '"></span>' +
        '<span class="wsr-legend-label">' + c + '</span>' +
        '<span class="wsr-legend-count">' + classCounts[c].toLocaleString() + '</span>';
      var cb = item.querySelector('input');
      cb.addEventListener('change', function () {
        S.classOn[c] = cb.checked;
        item.className = 'wsr-legend-item' + (cb.checked ? '' : ' wsr-off');
        applyFilters();
      });
      classBox.appendChild(item);
    });

    agencyBox.innerHTML = '';
    AGENCY_ORDER.forEach(function (a) {
      if (!agencyCounts[a]) return;
      var item = document.createElement('label');
      item.className = 'wsr-legend-item';
      item.innerHTML =
        '<input type="checkbox" class="wsr-legend-cb" checked />' +
        '<span class="wsr-swatch" style="background:' + AGENCIES[a].color + '"></span>' +
        '<span class="wsr-legend-label">' + AGENCIES[a].label + '</span>' +
        '<span class="wsr-legend-count">' + agencyCounts[a].toLocaleString() + '</span>';
      var cb = item.querySelector('input');
      cb.addEventListener('change', function () {
        S.agencyOn[a] = cb.checked;
        item.className = 'wsr-legend-item' + (cb.checked ? '' : ' wsr-off');
        applyFilters();
      });
      agencyBox.appendChild(item);
    });
  }

  /* ---- stats ---- */
  function updateStats() {
    var rivers = {};
    var states = {};
    var miles = 0;
    var wild = 0;
    S.segments.forEach(function (s) {
      var p = s.props;
      var rid = p.river_id || p.wsr_river_name;
      if (rid) rivers[rid] = true;
      if (p.state) {
        String(p.state).split(/[,&]/).forEach(function (st) {
          var t = st.trim();
          if (t && t !== 'and') states[t] = true;
        });
      }
      miles += parseFloat(p.segment_miles) || 0;
      if (classOf(p) === 'Wild') wild++;
    });
    setStat('rivers', Object.keys(rivers).length.toLocaleString());
    setStat('miles', Math.round(miles).toLocaleString());
    setStat('wild', wild.toLocaleString());
    setStat('states', S.stateLabel ? '1' : Object.keys(states).length.toLocaleString());
  }
  function setStat(key, val) {
    var el = $('us-wild-scenic-rivers-map-stat-' + key);
    if (el) el.textContent = val;
  }

  /* ---- extra layers (study + eligible) ---- */
  function loadStudyLayer() {
    if (S.studyLoaded) return Promise.resolve();
    S.studyLoaded = true;
    var url = CONFIG.studyService + '/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
    var whereExtra = S.stateLabel ?
      "&where=" + encodeURIComponent("state LIKE '%" + S.stateLabel.replace(/'/g, "''") + "%'") : '';
    if (whereExtra) {
      url = CONFIG.studyService + '/query?outFields=*&outSR=4326&f=geojson' + whereExtra;
    }
    return fetch(url).then(function (r) { return r.json(); }).then(function (gj) {
      S.studyLayer = L.geoJSON(gj, {
        renderer: S.renderer,
        style: { color: '#a16207', weight: 3, opacity: 0.9, dashArray: '6 4' },
        onEachFeature: function (f, layer) {
          var p = f.properties || {};
          var name = p.wsr_river_name || p.gnis_name || 'Study River';
          layer.bindPopup('<div class="wsr-popup"><h4>' + esc(name) + '</h4>' +
            '<p><span class="wsr-popup-tag" style="background:#a16207">Active Study</span></p>' +
            (p.state ? '<p><span class="wsr-popup-label">State:</span> ' + esc(p.state) + '</p>' : '') +
            '</div>', { maxWidth: 280 });
        }
      });
    });
  }

  function loadEligibleLayer() {
    if (S.eligibleLoaded) return Promise.resolve();
    S.eligibleLoaded = true;
    var base = CONFIG.eligibleService + '/query?outFields=*&outSR=4326&f=geojson&where=';
    var where = S.stateLabel ?
      "state LIKE '%" + S.stateLabel.replace(/'/g, "''") + "%'" : '1=1';
    return fetch(base + encodeURIComponent(where)).then(function (r) {
      return r.json();
    }).then(function (gj) {
      S.eligibleLayer = L.geoJSON(gj, {
        renderer: S.renderer,
        style: { color: '#475569', weight: 2, opacity: 0.55 },
        onEachFeature: function (f, layer) {
          var p = f.properties || {};
          var name = p.wsr_river_name || p.gnis_name || 'Eligible River';
          layer.bindPopup('<div class="wsr-popup"><h4>' + esc(name) + '</h4>' +
            '<p><span class="wsr-popup-tag" style="background:#475569">Eligible / Suitable</span></p>' +
            (p.agency ? '<p><span class="wsr-popup-label">Agency:</span> ' + esc(p.agency) + '</p>' : '') +
            (p.state ? '<p><span class="wsr-popup-label">State:</span> ' + esc(p.state) + '</p>' : '') +
            '</div>', { maxWidth: 280 });
        }
      });
    });
  }

  /* ---- address search ---- */
  function doSearch() {
    var input = $('us-wild-scenic-rivers-map-search');
    var q = (input.value || '').trim();
    if (!q) return;
    clearMsg();
    fetch(CONFIG.nominatim + '?format=json&limit=1&countrycodes=us&q=' +
        encodeURIComponent(q), { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.length) { showMsg('No match found for that location.', 'err'); return; }
        var lat = parseFloat(res[0].lat), lon = parseFloat(res[0].lon);
        S.map.setView([lat, lon], 9);
        dropMarker(lat, lon, '#b91c1c', '#ef4444', 'Searched location');
      })
      .catch(function () { showMsg('Location search is unavailable right now.', 'err'); });
  }

  function doLocate() {
    if (!navigator.geolocation) {
      showMsg('Geolocation is not supported by this browser.', 'err'); return;
    }
    clearMsg();
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      S.map.setView([lat, lon], 9);
      dropMarker(lat, lon, '#1d4ed8', '#3b82f6', 'Your location');
    }, function () { showMsg('Could not determine your location.', 'err'); });
  }

  function dropMarker(lat, lon, stroke, fill, label) {
    if (S.locateMarker) S.map.removeLayer(S.locateMarker);
    S.locateMarker = L.circleMarker([lat, lon], {
      radius: 8, color: stroke, fillColor: fill, fillOpacity: 0.9, weight: 2
    }).addTo(S.map).bindPopup(label).openPopup();
  }

  /* ---- init ---- */
  function resolveState(raw) {
    var v = (raw || '').trim();
    if (!v) return null;
    if (NAME2ABBR[v]) return v;
    var up = v.toUpperCase();
    if (ABBR2NAME[up]) return ABBR2NAME[up];
    return null;
  }

  function init() {
    var mapEl = $(CONFIG.mapId);
    if (!mapEl) return;
    var stateName = resolveState(mapEl.getAttribute('data-state'));
    S.stateLabel = stateName;

    initMap();

    var searchBtn = $('us-wild-scenic-rivers-map-search-btn');
    var locateBtn = $('us-wild-scenic-rivers-map-locate-btn');
    var searchInput = $('us-wild-scenic-rivers-map-search');
    var nameInput = $('us-wild-scenic-rivers-map-namefilter');
    var resetBtn = $('us-wild-scenic-rivers-map-reset');
    var basemapSel = $('us-wild-scenic-rivers-map-basemap');
    var studyCb = $('us-wild-scenic-rivers-map-toggle-study');
    var eligibleCb = $('us-wild-scenic-rivers-map-toggle-eligible');

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (locateBtn) locateBtn.addEventListener('click', doLocate);
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
      });
    }
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        S.nameQuery = nameInput.value.trim().toLowerCase();
        applyFilters();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (nameInput) nameInput.value = '';
        S.nameQuery = '';
        CLASS_ORDER.forEach(function (c) { S.classOn[c] = true; });
        AGENCY_ORDER.forEach(function (a) { S.agencyOn[a] = true; });
        var cbs = document.querySelectorAll(
          '#us-wild-scenic-rivers-map-legend-class .wsr-legend-cb,' +
          '#us-wild-scenic-rivers-map-legend-agency .wsr-legend-cb'
        );
        Array.prototype.forEach.call(cbs, function (cb) {
          cb.checked = true;
          cb.parentNode.className = 'wsr-legend-item';
        });
        applyFilters();
      });
    }
    if (basemapSel) {
      basemapSel.addEventListener('change', function () { setBasemap(basemapSel.value); });
    }
    if (studyCb) {
      studyCb.addEventListener('change', function () {
        var parent = studyCb.parentNode;
        if (studyCb.checked) {
          parent.className = 'wsr-legend-item';
          loadStudyLayer().then(function () {
            if (S.studyLayer && studyCb.checked) S.studyLayer.addTo(S.map);
          });
        } else {
          parent.className = 'wsr-legend-item wsr-off';
          if (S.studyLayer) S.map.removeLayer(S.studyLayer);
        }
      });
    }
    if (eligibleCb) {
      eligibleCb.addEventListener('change', function () {
        var parent = eligibleCb.parentNode;
        if (eligibleCb.checked) {
          parent.className = 'wsr-legend-item';
          setLoading(true, 'Loading eligible / suitable rivers...', '4,154 segments');
          loadEligibleLayer().then(function () {
            if (S.eligibleLayer && eligibleCb.checked) S.eligibleLayer.addTo(S.map);
            setLoading(false);
          }).catch(function () {
            setLoading(false);
            showMsg('Could not load eligible/suitable layer.', 'err');
          });
        } else {
          parent.className = 'wsr-legend-item wsr-off';
          if (S.eligibleLayer) S.map.removeLayer(S.eligibleLayer);
        }
      });
    }

    if (stateName) {
      loadSpoke(stateName);
    } else {
      loadHub();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
