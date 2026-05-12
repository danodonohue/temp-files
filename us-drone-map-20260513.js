(function () {
  'use strict';

  var UASFM_URL    = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0';
  var AIRSPACE_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0';
  var FRIA_URL     = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_Recognized_Identification_Areas/FeatureServer/0';
  var FIXED_URL    = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/Recreational_Flyer_Fixed_Sites/FeatureServer/0';
  var AIRPORTS_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0';

  var CEILING_COLORS = {
    0: '#c62828', 50: '#e53935', 100: '#f57c00', 150: '#fbc02d',
    200: '#afb42b', 250: '#7cb342', 300: '#43a047', 350: '#2e7d32', 400: '#1b5e20'
  };
  var CLASS_COLORS = { B: '#0d47a1', C: '#880e4f', D: '#6a1b9a' };
  var BUF_COLORS   = ['#e53935', '#fb8c00', '#1e88e5'];

  function ceilingColor(val) {
    if (val === null || val === undefined || val === '') return '#c62828';
    return CEILING_COLORS[parseInt(val, 10)] || '#66bb6a';
  }

  function parseHash() {
    var out = {};
    var h = window.location.hash.slice(1);
    if (!h) return out;
    h.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      var k = pair.slice(0, idx), v = decodeURIComponent(pair.slice(idx + 1));
      out[k] = (k === 'z') ? parseInt(v, 10) : parseFloat(v);
    });
    return out;
  }

  function metersToDisplay(m) {
    var ft = m * 3.28084, mi = m / 1609.344;
    return mi >= 0.1
      ? mi.toFixed(2) + ' mi (' + Math.round(ft).toLocaleString() + ' ft)'
      : Math.round(ft).toLocaleString() + ' ft';
  }

  function qs(id) { return document.getElementById(id); }

  // ---- State pre-zoom (spoke pages set data-state on the container) ----
  var STATE_BOUNDS = {
    AL:[[30.14,-88.47],[35.01,-84.89]], AK:[[51.18,-179.15],[71.54,-129.99]],
    AZ:[[31.33,-114.82],[37.00,-109.04]], AR:[[33.00,-94.62],[36.50,-89.64]],
    CA:[[32.53,-124.48],[42.01,-114.13]], CO:[[36.99,-109.06],[41.00,-102.04]],
    CT:[[40.98,-73.73],[42.05,-71.79]], DC:[[38.79,-77.12],[38.99,-76.91]],
    DE:[[38.45,-75.79],[39.84,-75.05]], FL:[[24.52,-87.63],[31.00,-80.03]],
    GA:[[30.36,-85.61],[35.00,-80.84]], HI:[[18.92,-160.24],[22.24,-154.81]],
    ID:[[41.99,-117.24],[49.00,-111.04]], IL:[[36.97,-91.51],[42.51,-87.02]],
    IN:[[37.77,-88.10],[41.76,-84.78]], IA:[[40.38,-96.64],[43.50,-90.14]],
    KS:[[36.99,-102.05],[40.00,-94.59]], KY:[[36.50,-89.57],[39.15,-81.96]],
    LA:[[28.93,-94.04],[33.02,-88.82]], ME:[[42.98,-71.08],[47.46,-66.95]],
    MD:[[37.89,-79.49],[39.72,-74.98]], MA:[[41.24,-73.51],[42.89,-69.93]],
    MI:[[41.70,-90.42],[48.19,-82.41]], MN:[[43.50,-97.24],[49.38,-89.49]],
    MS:[[30.18,-91.65],[35.00,-88.10]], MO:[[35.99,-95.77],[40.61,-89.10]],
    MT:[[44.36,-116.05],[49.00,-104.04]], NE:[[40.00,-104.05],[43.00,-95.31]],
    NV:[[35.00,-120.01],[42.00,-114.04]], NH:[[42.70,-72.56],[45.31,-70.61]],
    NJ:[[38.93,-75.56],[41.36,-73.89]], NM:[[31.33,-109.05],[37.00,-103.00]],
    NY:[[40.50,-79.76],[45.02,-71.86]], NC:[[33.84,-84.32],[36.59,-75.46]],
    ND:[[45.94,-104.05],[49.00,-96.56]], OH:[[38.40,-84.82],[41.98,-80.52]],
    OK:[[33.62,-103.00],[37.00,-94.43]], OR:[[41.99,-124.57],[46.24,-116.46]],
    PA:[[39.72,-80.52],[42.27,-74.69]], RI:[[41.15,-71.86],[42.02,-71.12]],
    SC:[[32.04,-83.35],[35.22,-78.53]], SD:[[42.48,-104.06],[45.94,-96.44]],
    TN:[[34.98,-90.31],[36.68,-81.65]], TX:[[25.84,-106.65],[36.50,-93.51]],
    UT:[[37.00,-114.05],[42.00,-109.04]], VT:[[42.73,-73.44],[45.02,-71.46]],
    VA:[[36.54,-83.68],[39.47,-75.23]], WA:[[45.54,-124.84],[49.00,-116.92]],
    WV:[[37.20,-82.64],[40.64,-77.72]], WI:[[42.49,-92.89],[47.08,-86.25]],
    WY:[[40.99,-111.06],[45.01,-104.05]]
  };
  var STATE_NAMES = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
    CO:'Colorado',CT:'Connecticut',DC:'Washington D.C.',DE:'Delaware',
    FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',
    IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
    ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
    MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',
    NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
    NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',
    PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
    TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
    WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
  };
  var _udmCnt = document.getElementById('us-drone-map-container');
  var stateCode = _udmCnt ? (_udmCnt.getAttribute('data-state') || '').toUpperCase() : '';

  // ---- Map init ----
  var hash = parseHash();
  var map = L.map('us-drone-map-map', {
    center: [hash.lat || 38.5, hash.lng || -97.0],
    zoom:   hash.z  || 5,
    zoomControl: true,
    doubleClickZoom: false
  });
  if (!hash.lat && stateCode && STATE_BOUNDS[stateCode]) {
    map.fitBounds(STATE_BOUNDS[stateCode]);
  }

  var streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  var satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
  );

  // ---- Mode state ----
  var activeMode = null; // null | 'measure' | 'buffer'

  function setMode(mode) {
    activeMode = mode;
    map.getContainer().style.cursor = mode ? 'crosshair' : '';
    var mBtn = qs('udm-measure-btn');
    var bBtn = qs('udm-buffer-btn');
    if (mBtn) mBtn.classList.toggle('active', mode === 'measure');
    if (bBtn) bBtn.classList.toggle('active', mode === 'buffer');
  }

  // ---- Loader ----
  var loader = qs('us-drone-map-loader');
  function showLoader() { if (loader) loader.style.display = 'flex'; }
  function hideLoader() { if (loader) loader.style.display = 'none'; }

  // ---- UASFM layer (core altitude grid) ----
  var uasfmLayer = L.esri.featureLayer({
    url: UASFM_URL,
    style: function (feature) {
      var col = ceilingColor(feature.properties.CEILING);
      return { fillColor: col, fillOpacity: 0.55, color: col, weight: 0.4, opacity: 0.7 };
    },
    onEachFeature: function (feature, layer) {
      layer.on('click', function (e) {
        if (activeMode !== null) return;
        var p = feature.properties;
        var ceiling = (p.CEILING !== null && p.CEILING !== undefined) ? p.CEILING + ' ft AGL' : 'No grid data';
        var laanc = false;
        for (var i = 1; i <= 5; i++) { if (p['APT' + i + '_LAANC'] === 1) { laanc = true; break; } }
        var apts = [];
        for (var j = 1; j <= 5; j++) { if (p['APT' + j + '_NAME']) apts.push(p['APT' + j + '_NAME']); }
        L.popup({ maxWidth: 285 }).setLatLng(e.latlng).setContent(
          '<div class="udm-popup">'
          + '<strong>Max Authorized Altitude: ' + ceiling + '</strong>'
          + '<span class="udm-laanc ' + (laanc ? 'yes' : 'no') + '">'
          + (laanc ? 'LAANC available &mdash; instant authorization' : 'Manual FAA DroneZone approval required')
          + '</span>'
          + (apts.length ? '<small>Near: ' + apts.join(', ') + '</small>' : '')
          + '<small class="udm-disc">Not an FAA authorization. Verify at FAA.GOV/UAS</small>'
          + '</div>'
        ).openOn(map);
      });
    }
  });
  uasfmLayer.on('loading', showLoader);
  uasfmLayer.on('load', hideLoader);
  uasfmLayer.addTo(map);

  // ---- Class Airspace (B/C/D) ----
  var airspaceLayer = L.esri.featureLayer({
    url: AIRSPACE_URL,
    where: "CLASS IN ('B','C','D')",
    style: function (feature) {
      var cls = (feature.properties.CLASS || '').toUpperCase().trim();
      var col = CLASS_COLORS[cls] || '#455a64';
      return { fillColor: 'transparent', fillOpacity: 0, color: col, weight: cls === 'B' ? 2.5 : 2, opacity: 0.85, dashArray: cls === 'D' ? '5 4' : null };
    },
    onEachFeature: function (feature, layer) {
      layer.on('click', function (e) {
        if (activeMode !== null) return;
        var p = feature.properties, cls = p.CLASS || '?';
        var notes = {
          B: 'Class B: Authorization required at all altitudes. LAANC available at most Class B airports.',
          C: 'Class C: Authorization required. LAANC available at most Class C airports.',
          D: 'Class D: Authorization required while tower is active. Reverts to Class G after tower hours.'
        };
        L.popup({ maxWidth: 285 }).setLatLng(e.latlng).setContent(
          '<div class="udm-popup"><strong>Class ' + cls + ' Airspace: ' + (p.NAME || '') + '</strong>'
          + (p.UPPER_DESC ? 'Ceiling: ' + p.UPPER_DESC + '<br>' : '')
          + (p.LOWER_DESC ? 'Floor: ' + p.LOWER_DESC + '<br>' : '')
          + (p.WKHR_CODE  ? 'Hours: '  + p.WKHR_CODE  + '<br>' : '')
          + '<small>' + (notes[cls] || '') + '</small></div>'
        ).openOn(map);
      });
    }
  });

  // ---- FRIA zones ----
  var friaLayer = L.esri.featureLayer({
    url: FRIA_URL,
    style: function () { return { fillColor: '#0097a7', fillOpacity: 0.28, color: '#0097a7', weight: 1.5 }; },
    onEachFeature: function (feature, layer) {
      var p = feature.properties, name = p.title || p.orgName || 'Flying Site';
      layer.bindPopup(
        '<div class="udm-popup"><strong>FRIA: ' + name + '</strong>'
        + (p.orgName && p.orgName !== name ? p.orgName + '<br>' : '')
        + (p.city ? p.city + (p.state ? ', ' + p.state : '') + '<br>' : '')
        + '<small>Remote ID broadcast not required here</small></div>'
      );
    }
  });

  // ---- Fixed flying sites ----
  var fixedLayer = L.esri.featureLayer({
    url: FIXED_URL,
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, { radius: 7, fillColor: '#00c853', color: '#fff', weight: 1.5, fillOpacity: 0.9 });
    },
    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      layer.bindPopup(
        '<div class="udm-popup"><strong>' + (p.SITE_NAME || 'Fixed Flying Site') + '</strong>'
        + (p.CITY ? p.CITY + (p.STATE ? ', ' + p.STATE : '') + '<br>' : '')
        + (p.CEILING ? 'Site ceiling: ' + p.CEILING + ' ft AGL<br>' : '')
        + '<small>Sanctioned recreational flying site</small></div>'
      );
    }
  });

  // ---- Airports ----
  var airportLayer = L.esri.featureLayer({
    url: AIRPORTS_URL,
    minZoom: 7,
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, { radius: 5, fillColor: '#37474f', color: '#fff', weight: 1, fillOpacity: 0.9 });
    },
    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      layer.bindPopup(
        '<div class="udm-popup"><strong>' + (p.NAME || 'Airport') + '</strong>'
        + (p.IDENT  ? 'FAA: ' + p.IDENT  : '') + (p.ICAO_ID ? ' &nbsp;ICAO: ' + p.ICAO_ID : '') + '<br>'
        + (p.TYPE_CODE || '') + '<br>'
        + (p.SERVCITY ? p.SERVCITY + (p.STATE ? ', ' + p.STATE : '') : '') + '</div>'
      );
    }
  });

  // ---- Collapsible legend ----
  var legendExpanded = (window.innerWidth > 600);
  var legendCtrl = L.control({ position: 'bottomright' });
  legendCtrl.onAdd = function () {
    var div = L.DomUtil.create('div', 'udm-legend');
    var rows = [
      { c: '#c62828', l: '0 ft &ndash; Manual auth only' },
      { c: '#e53935', l: '50 ft' }, { c: '#f57c00', l: '100 ft' }, { c: '#fbc02d', l: '150 ft' },
      { c: '#afb42b', l: '200 ft' }, { c: '#7cb342', l: '250 ft' }, { c: '#43a047', l: '300 ft' },
      { c: '#2e7d32', l: '350 ft' }, { c: '#1b5e20', l: '400 ft' }
    ];
    div.innerHTML =
      '<div class="udm-leg-hdr"><span>UASFM Ceiling (ft AGL)</span><button class="udm-leg-tog" id="udm-leg-tog">' + (legendExpanded ? '&#9660;' : '&#9650;') + '</button></div>'
      + '<div class="udm-leg-body" id="udm-leg-body" style="display:' + (legendExpanded ? 'block' : 'none') + '">'
      + rows.map(function (r) { return '<div class="udm-leg-row"><span class="udm-leg-sw" style="background:' + r.c + '"></span><span>' + r.l + '</span></div>'; }).join('')
      + '<div class="udm-leg-note">No grid = Class G &mdash; 400 ft rule applies</div>'
      + '</div>';
    L.DomEvent.disableClickPropagation(div);
    div.querySelector('#udm-leg-tog').addEventListener('click', function () {
      legendExpanded = !legendExpanded;
      qs('udm-leg-body').style.display = legendExpanded ? 'block' : 'none';
      this.innerHTML = legendExpanded ? '&#9660;' : '&#9650;';
    });
    return div;
  };
  legendCtrl.addTo(map);

  // ---- Measurement tool ----
  var mPoints = [], mLayers = [];

  function clearMeasure() {
    mLayers.forEach(function (l) { map.removeLayer(l); });
    mLayers = []; mPoints = [];
    setMeasureStatus('Click the map to place your first point.');
  }

  function setMeasureStatus(txt) { var el = qs('udm-msr-status'); if (el) el.textContent = txt; }

  function addMeasurePoint(latlng) {
    mPoints.push(latlng);
    var dot = L.circleMarker(latlng, { radius: 4, fillColor: '#f57f17', color: '#fff', weight: 1.5, fillOpacity: 1 }).addTo(map);
    mLayers.push(dot);
    if (mPoints.length < 2) { setMeasureStatus('First point placed. Click for next point.'); return; }
    // remove old line + distance label, keep dots
    mLayers = mLayers.filter(function (l) {
      if ((l instanceof L.Polyline && !(l instanceof L.CircleMarker)) || (l.options && l.options._udmDistLabel)) {
        map.removeLayer(l); return false;
      }
      return true;
    });
    var line = L.polyline(mPoints, { color: '#f57f17', weight: 2.5, dashArray: '6 4', opacity: 0.9 }).addTo(map);
    mLayers.push(line);
    var total = 0;
    for (var i = 1; i < mPoints.length; i++) total += mPoints[i - 1].distanceTo(mPoints[i]);
    var lastSeg = mPoints[mPoints.length - 2].distanceTo(mPoints[mPoints.length - 1]);
    var lbl = L.marker(latlng, {
      icon: L.divIcon({ html: '<div class="udm-msr-lbl">' + metersToDisplay(total) + '</div>', className: '', iconAnchor: [-6, 10] }),
      _udmDistLabel: true
    }).addTo(map);
    mLayers.push(lbl);
    var segs = mPoints.length - 1;
    setMeasureStatus('Total: ' + metersToDisplay(total) + '  |  Last: ' + metersToDisplay(lastSeg) + '  |  ' + segs + ' segment' + (segs > 1 ? 's' : '') + '. Click to continue.');
  }

  // ---- Buffer tool ----
  var bCircles = [];

  function clearBuffers() { bCircles.forEach(function (l) { map.removeLayer(l); }); bCircles = []; }

  function placeBuffers(latlng) {
    clearBuffers();
    var unit = qs('udm-buf-unit') ? qs('udm-buf-unit').value : 'miles';
    var ids  = ['udm-buf-1', 'udm-buf-2', 'udm-buf-3'];
    var toM  = unit === 'miles' ? 1609.344 : 0.3048;
    var placed = 0;
    ids.forEach(function (id, idx) {
      var val = parseFloat(qs(id) ? qs(id).value : 0);
      if (!val || val <= 0 || isNaN(val)) return;
      var rm = val * toM;
      var c = L.circle(latlng, {
        radius: rm, fillColor: BUF_COLORS[idx], fillOpacity: 0.08,
        color: BUF_COLORS[idx], weight: 2.5, opacity: 0.9
      }).addTo(map);
      var labelLat = latlng.lat + (rm / 111320);
      var lm = L.marker(L.latLng(labelLat, latlng.lng), {
        icon: L.divIcon({ html: '<div class="udm-buf-lbl" style="color:' + BUF_COLORS[idx] + '">' + val + ' ' + unit + '</div>', className: '', iconAnchor: [20, 10] }),
        interactive: false
      }).addTo(map);
      bCircles.push(c, lm);
      placed++;
    });
    setMode(null);
    var st = qs('udm-buf-status');
    if (st) st.textContent = placed ? 'Buffers placed. Click "Place on Map" to reposition.' : 'Enter at least one radius value.';
  }

  // ---- Map click router ----
  map.on('click', function (e) {
    if      (activeMode === 'measure') addMeasurePoint(e.latlng);
    else if (activeMode === 'buffer')  placeBuffers(e.latlng);
  });

  // ---- Satellite toggle ----
  var satOn = false;
  (function () {
    var btn = qs('udm-sat-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      satOn = !satOn;
      if (satOn) { map.removeLayer(streets); satellite.addTo(map); btn.classList.add('active'); btn.textContent = 'Street Map'; }
      else       { map.removeLayer(satellite); streets.addTo(map); btn.classList.remove('active'); btn.textContent = 'Satellite'; }
    });
  }());

  // ---- Layer toggles ----
  var layerMap = { airspace: airspaceLayer, fria: friaLayer, fixed: fixedLayer, airports: airportLayer };
  document.querySelectorAll('[data-udm-layer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lyr = layerMap[this.getAttribute('data-udm-layer')];
      if (!lyr) return;
      if (map.hasLayer(lyr)) { map.removeLayer(lyr); this.classList.remove('active'); }
      else                   { lyr.addTo(map);       this.classList.add('active'); }
    });
  });

  // ---- Locate ----
  (function () {
    var btn = qs('udm-locate-btn');
    if (btn) btn.addEventListener('click', function () { map.locate({ setView: true, maxZoom: 11 }); });
    map.on('locationfound', function (e) { L.popup().setLatLng(e.latlng).setContent('Your location').openOn(map); });
    map.on('locationerror', function () { alert('Location unavailable. Allow location access or pan manually.'); });
  }());

  // ---- Measure button ----
  (function () {
    var btn  = qs('udm-measure-btn');
    var pnl  = qs('udm-measure-panel');
    var stop = qs('udm-msr-stop');
    var clr  = qs('udm-msr-clear');
    if (btn) btn.addEventListener('click', function () {
      if (activeMode === 'measure') { setMode(null); if (pnl) pnl.style.display = 'none'; }
      else { clearMeasure(); setMode('measure'); if (pnl) pnl.style.display = 'flex'; }
    });
    if (stop) stop.addEventListener('click', function () { setMode(null); if (pnl) pnl.style.display = 'none'; });
    if (clr)  clr.addEventListener('click',  function () { clearMeasure(); });
  }());

  // ---- Buffer button ----
  (function () {
    var btn   = qs('udm-buffer-btn');
    var pnl   = qs('udm-buffer-panel');
    var place = qs('udm-buf-place');
    var clr   = qs('udm-buf-clear');
    if (btn) btn.addEventListener('click', function () {
      var open = pnl && pnl.style.display !== 'none';
      if (open) { if (pnl) pnl.style.display = 'none'; btn.classList.remove('active'); if (activeMode === 'buffer') setMode(null); }
      else      { if (pnl) pnl.style.display = 'flex'; btn.classList.add('active'); }
    });
    if (place) place.addEventListener('click', function () {
      setMode('buffer');
      var st = qs('udm-buf-status');
      if (st) st.textContent = 'Click anywhere on the map to place your buffers.';
    });
    if (clr) clr.addEventListener('click', function () { clearBuffers(); if (activeMode === 'buffer') setMode(null); });
  }());

  // ---- Print ----
  (function () {
    var btn = qs('udm-print-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var el = qs('udm-print-date');
      if (el) el.textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      var hdr = document.querySelector('.udm-print-header strong');
      if (hdr && stateCode && STATE_NAMES[stateCode]) {
        hdr.textContent = STATE_NAMES[stateCode] + ' Drone No-Fly Zone Map — mapscaping.com';
      }
      window.print();
    });
  }());

  // ---- Share URL ----
  map.on('moveend', function () {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  });

}());
