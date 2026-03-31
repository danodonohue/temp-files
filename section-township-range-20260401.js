(function () {
  'use strict';

  var SLUG = 'section-township-range';
  var BLM_MS = 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer';
  var NOM_URL = 'https://nominatim.openstreetmap.org/search';
  var MIN_ZOOM_GRID = 11;   // minimum zoom to enable grid KMZ download

  // Raw attributes from last successful identify (used for KMZ download)
  var lastRaw = null;

  // BLM MapServer layer IDs
  var LYR = { TOWNSHIP: 3, SECTION: 2, SUBDIVISION: 1 };

  // Principal meridian code -> name
  var MERIDIAN_NAMES = {
    '01': 'First Principal Meridian',    '02': 'Second Principal Meridian',
    '03': 'Third Principal Meridian',    '04': 'Fourth Principal Meridian',
    '05': 'Fifth Principal Meridian',    '06': 'Sixth Principal Meridian',
    '08': 'Boise Meridian',              '09': 'Choctaw Meridian',
    '11': 'Cimarron Meridian',           '12': 'Copper River Meridian',
    '13': 'Fairbanks Meridian',          '14': 'Gila and Salt River Meridian',
    '15': 'Humboldt Meridian',           '16': 'Huntsville Meridian',
    '17': 'Indian Meridian',             '18': 'Kateel River Meridian',
    '19': 'Louisiana Meridian',          '20': 'Michigan Meridian',
    '21': 'Mount Diablo Meridian',       '22': 'Navajo Meridian',
    '23': 'New Mexico Principal Meridian','27': 'Saint Helena Meridian',
    '28': 'Saint Stephens Meridian',     '29': 'Salt Lake Meridian',
    '30': 'San Bernardino Meridian',     '31': 'Seward Meridian',
    '32': 'Tallahassee Meridian',        '34': 'Ute Meridian',
    '36': 'Willamette Meridian',         '37': 'Wind River Meridian'
  };

  // State -> primary principal meridian code for manual lookup filtering
  var STATE_MERCD = {
    AK: '12', AL: '16', AR: '05', AZ: '14', CA: '21', CO: '06',
    FL: '32', ID: '08', IL: '03', IN: '02', IA: '05', KS: '06',
    LA: '19', MI: '20', MN: '05', MS: '28', MO: '05', MT: '06',
    NE: '06', NV: '21', NM: '23', ND: '05', OH: '01', OK: '17',
    OR: '36', SD: '05', UT: '29', WA: '36', WI: '04', WY: '37'
  };

  // ── Map init ──────────────────────────────────────────────────────────────
  var hash = parseHash();
  var initLat  = (hash.lat)  ? parseFloat(hash.lat)  : 39.5;
  var initLng  = (hash.lng)  ? parseFloat(hash.lng)  : -98.4;
  var initZoom = (hash.z)    ? parseInt(hash.z, 10)  : 5;

  var map = L.map(SLUG + '-map', {
    center: [initLat, initLng],
    zoom: initZoom
  });

  var tiles = {
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      maxZoom: 19
    }),
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri', maxZoom: 19 }
    )
  };
  tiles.street.addTo(map);

  // ── PLSS overlay ──────────────────────────────────────────────────────────
  var plssActive = { townships: true, sections: true, subdivisions: false };
  var plssOverlay = null;

  // Colors: townships = orange-red, sections = blue, subdivisions = green
  var STYLE = {
    townships:    { color: [220, 70, 0,   255], width: 3.0 },
    sections:     { color: [30,  90, 210, 255], width: 2.0 },
    subdivisions: { color: [20,  150, 60, 255], width: 1.2 }
  };

  function makeSym(key) {
    return {
      type: 'esriSFS',
      style: 'esriSFSNull',
      color: [0, 0, 0, 0],
      outline: {
        type: 'esriSLS',
        style: 'esriSLSSolid',
        color: STYLE[key].color,
        width: STYLE[key].width
      }
    };
  }

  function rebuildOverlay() {
    if (plssOverlay) { map.removeLayer(plssOverlay); plssOverlay = null; }

    var dl = [];
    var dlId = 0;
    if (plssActive.subdivisions) dl.push({ id: dlId++, source: { type: 'mapLayer', mapLayerId: LYR.SUBDIVISION }, drawingInfo: { renderer: { type: 'simple', symbol: makeSym('subdivisions') } } });
    if (plssActive.sections)     dl.push({ id: dlId++, source: { type: 'mapLayer', mapLayerId: LYR.SECTION },     drawingInfo: { renderer: { type: 'simple', symbol: makeSym('sections')     } } });
    if (plssActive.townships)    dl.push({ id: dlId++, source: { type: 'mapLayer', mapLayerId: LYR.TOWNSHIP },    drawingInfo: { renderer: { type: 'simple', symbol: makeSym('townships')    } } });
    if (!dl.length) return;

    plssOverlay = L.esri.dynamicMapLayer({ url: BLM_MS, dynamicLayers: dl, opacity: 1.0 });
    plssOverlay.addTo(map);
  }
  rebuildOverlay();

  // ── Marker ────────────────────────────────────────────────────────────────
  var marker = null;
  function placeMarker(latlng) {
    if (marker) map.removeLayer(marker);
    marker = L.marker(latlng).addTo(map);
  }

  // ── BLM identify ─────────────────────────────────────────────────────────
  function identifyAt(latlng) {
    setStatus('Looking up PLSS data...', 'loading');
    hideResults();

    L.esri.identifyFeatures({ url: BLM_MS })
      .on(map)
      .at(latlng)
      .layers('all')
      .tolerance(4)
      .returnGeometry(false)
      .run(function (err, fc) {
        if (err || !fc || !fc.features || fc.features.length === 0) {
          setStatus(
            'No PLSS data at this location. Coverage is ~30 states (excludes original 13 colonies, Texas, and Hawaii).',
            'error'
          );
          return;
        }
        var result = parseFeatures(fc.features);
        showResults(result);
        setStatus('Click anywhere on the map to look up a different location.', '');
      });
  }

  function parseFeatures(features) {
    var r = { twn: '--', rng: '--', sec: '--', meridian: '--', state: '--', desc: '--' };
    var raw = {};

    features.forEach(function (f) {
      var p = f.properties || {};

      if (r.twn === '--' && p.TWNSHPNO != null) {
        raw.twnshpno  = p.TWNSHPNO;
        raw.twnshpdir = (p.TWNSHPDIR || '').charAt(0).toUpperCase();
        raw.rangeno   = p.RANGENO;
        raw.rangedir  = (p.RANGEDIR  || '').charAt(0).toUpperCase();
        r.twn = 'T' + p.TWNSHPNO + raw.twnshpdir;
        r.rng = 'R' + (p.RANGENO || '') + raw.rangedir;
      }
      if (r.sec === '--' && p.SECTIONNO != null) {
        raw.sectionno = p.SECTIONNO;
        r.sec = String(p.SECTIONNO);
      }
      if (r.meridian === '--' && p.PRINMERCD != null) {
        var code = String(p.PRINMERCD).padStart(2, '0');
        r.meridian = MERIDIAN_NAMES[code] || ('Meridian code ' + p.PRINMERCD);
      }
      if (r.state === '--' && p.STATECD) {
        raw.statecd = p.STATECD;
        r.state = p.STATECD;
      }
    });

    if (r.twn !== '--') {
      r.desc = (r.sec !== '--') ? 'Sec. ' + r.sec + ', ' + r.twn + ' ' + r.rng : r.twn + ' ' + r.rng;
      if (r.meridian !== '--') r.desc += ', ' + r.meridian;
    }

    lastRaw = (raw.twnshpno != null) ? raw : null;
    return r;
  }

  // ── Results panel ─────────────────────────────────────────────────────────
  function showResults(r) {
    var panel = el('results');
    panel.classList.add('str-visible');
    panel.dataset.copy = r.desc;

    setValue('twn',      r.twn);
    setValue('rng',      r.rng);
    setValue('sec',      r.sec);
    setValue('state',    r.state);
    setValue('meridian', r.meridian);
    setValue('desc',     r.desc);
  }

  function hideResults() {
    el('results').classList.remove('str-visible');
  }

  function setValue(field, val) {
    var node = document.querySelector(
      '#' + SLUG + '-results [data-field="' + field + '"]'
    );
    if (!node) return;
    var isNA = !val || val === '--';
    node.textContent = isNA ? 'N/A' : val;
    node.className = 'str-result-value' +
      (field === 'desc' ? ' str-description' : '') +
      (isNA ? ' str-na' : '');
  }

  function setStatus(msg, type) {
    var node = el('status');
    node.textContent = msg;
    node.className = type ? (SLUG + '-status str-' + type) : (SLUG + '-status');
    // className approach won't work since the id is used; set class directly
    node.className = '';
    if (type === 'error')   node.classList.add('str-error');
    if (type === 'loading') node.classList.add('str-loading');
  }

  // ── Map click ─────────────────────────────────────────────────────────────
  map.on('click', function (e) {
    placeMarker(e.latlng);
    identifyAt(e.latlng);
    pushHash(map);
  });

  // ── Address search ────────────────────────────────────────────────────────
  el('search-btn').addEventListener('click', doSearch);
  el('address-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doSearch();
  });

  function doSearch() {
    var q = el('address-input').value.trim();
    if (!q) return;
    setStatus('Searching...', 'loading');
    hideResults();

    fetch(NOM_URL + '?format=json&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept-Language': 'en-US,en' }
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.length) {
          setStatus('Address not found. Try a more specific location.', 'error');
          return;
        }
        var latlng = L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
        map.flyTo(latlng, 14);
        placeMarker(latlng);
        identifyAt(latlng);
        pushHash(map);
      })
      .catch(function () {
        setStatus('Search failed. Please check your connection and try again.', 'error');
      });
  }

  // ── GPS button ────────────────────────────────────────────────────────────
  el('gps-btn').addEventListener('click', function () {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not supported by this browser.', 'error');
      return;
    }
    setStatus('Detecting your location...', 'loading');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        map.flyTo(latlng, 14);
        placeMarker(latlng);
        identifyAt(latlng);
        pushHash(map);
      },
      function () {
        setStatus('Could not detect location. Enable location access in your browser and try again.', 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // ── Layer toggles ─────────────────────────────────────────────────────────
  document.querySelectorAll('.str-layer-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lyr = btn.dataset.layer;
      if (lyr === 'satellite') {
        var isSat = btn.classList.contains('active');
        if (isSat) {
          map.removeLayer(tiles.satellite);
          tiles.street.addTo(map);
        } else {
          map.removeLayer(tiles.street);
          tiles.satellite.addTo(map);
        }
        btn.classList.toggle('active', !isSat);
      } else {
        plssActive[lyr] = !plssActive[lyr];
        btn.classList.toggle('active', plssActive[lyr]);
        rebuildOverlay();
      }
    });
  });

  // ── Manual lookup ─────────────────────────────────────────────────────────
  el('manual-toggle').addEventListener('click', function () {
    var panel = el('manual-panel');
    var open = panel.classList.toggle('str-open');
    this.querySelector('.str-arrow').textContent = open ? '−' : '+';
  });

  el('manual-btn').addEventListener('click', doManualLookup);

  function doManualLookup() {
    var tno   = el('m-tno').value.trim();
    var tdir  = el('m-tdir').value;
    var rno   = el('m-rno').value.trim();
    var rdir  = el('m-rdir').value;
    var sno   = el('m-sno').value.trim();
    var state = el('m-state').value;

    if (!tno || !rno || !state) {
      setStatus('Enter Township number, Range number, and State.', 'error');
      return;
    }

    setStatus('Looking up location...', 'loading');
    hideResults();

    // Use section layer (2) if section provided, else township layer (3)
    var layerId = sno ? 2 : 3;
    var where   = 'TWNSHPNO=' + parseInt(tno, 10) +
                  " AND TWNSHPDIR='" + tdir + "'" +
                  ' AND RANGENO=' + parseInt(rno, 10) +
                  " AND RANGEDIR='" + rdir + "'" +
                  " AND STATECD='" + state + "'";
    if (sno) where += ' AND SECTIONNO=' + parseInt(sno, 10);

    var url = BLM_MS + '/' + layerId + '/query' +
      '?where=' + encodeURIComponent(where) +
      '&outFields=*&returnGeometry=true&f=json';

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.features || !data.features.length) {
          setStatus('No PLSS record found. Check the values and try without a section number first.', 'error');
          return;
        }
        // Compute bounding box center via esri GeoJSON conversion
        var geoFeatures = [];
        data.features.forEach(function (f) {
          if (f.geometry && f.geometry.rings) {
            var coords = f.geometry.rings[0].map(function (pt) { return [pt[1], pt[0]]; });
            geoFeatures.push(L.polygon(coords));
          }
        });

        if (!geoFeatures.length) {
          setStatus('Could not determine map location for that description.', 'error');
          return;
        }

        var group = L.featureGroup(geoFeatures);
        var center = group.getBounds().getCenter();
        var zoom = sno ? 14 : 12;

        map.flyTo(center, zoom);
        placeMarker(center);
        identifyAt(center);
        pushHash(map);
      })
      .catch(function () {
        setStatus('Lookup failed. Please try again.', 'error');
      });
  }

  // ── KMZ download ─────────────────────────────────────────────────────────

  // KML colors are aabbggrr. Orange-red, blue, green matching layer styles.
  var KML_STYLES =
    '<Style id="township"><LineStyle><color>ff0046dc</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>' +
    '<Style id="section"><LineStyle><color>ffd25a1e</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>' +
    '<Style id="subdivision"><LineStyle><color>ff3c9614</color><width>1</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>';

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function ringsToKmlCoords(rings) {
    return rings[0].map(function (pt) {
      return pt[0].toFixed(6) + ',' + pt[1].toFixed(6) + ',0';
    }).join(' ');
  }

  function featureToPlacemark(attrs, rings, styleId) {
    var parts = [];
    if (attrs.SECTIONNO != null) parts.push('Sec. ' + attrs.SECTIONNO);
    if (attrs.TWNSHPNO  != null) parts.push('T' + attrs.TWNSHPNO + (attrs.TWNSHPDIR || '').charAt(0));
    if (attrs.RANGENO   != null) parts.push('R' + attrs.RANGENO  + (attrs.RANGEDIR  || '').charAt(0));
    var name = parts.length ? parts.join(', ') : 'PLSS Feature';
    return '<Placemark><name>' + escXml(name) + '</name>' +
      '<styleUrl>#' + styleId + '</styleUrl>' +
      '<Polygon><outerBoundaryIs><LinearRing>' +
      '<coordinates>' + ringsToKmlCoords(rings) + '</coordinates>' +
      '</LinearRing></outerBoundaryIs></Polygon></Placemark>';
  }

  function buildKml(placemarks, docName) {
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
      '<name>' + escXml(docName) + '</name>' +
      KML_STYLES +
      placemarks.join('') +
      '</Document></kml>';
  }

  function saveKmz(kmlString, filename) {
    var zip = new JSZip();
    zip.file('doc.kml', kmlString);
    zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Download the currently identified section / township
  el('kmz-btn').addEventListener('click', function () {
    if (!lastRaw || lastRaw.twnshpno == null) return;
    setStatus('Building KMZ...', 'loading');

    var hasSec = lastRaw.sectionno != null;
    var layerId = hasSec ? LYR.SECTION : LYR.TOWNSHIP;
    var styleId = hasSec ? 'section' : 'township';

    var where = 'TWNSHPNO=' + lastRaw.twnshpno +
      " AND TWNSHPDIR='" + lastRaw.twnshpdir + "'" +
      ' AND RANGENO='  + lastRaw.rangeno +
      " AND RANGEDIR='" + lastRaw.rangedir + "'";
    if (hasSec)           where += ' AND SECTIONNO=' + lastRaw.sectionno;
    if (lastRaw.statecd)  where += " AND STATECD='" + lastRaw.statecd + "'";

    fetch(BLM_MS + '/' + layerId + '/query' +
      '?where=' + encodeURIComponent(where) +
      '&outFields=TWNSHPNO,TWNSHPDIR,RANGENO,RANGEDIR,SECTIONNO,STATECD' +
      '&returnGeometry=true&outSR=4326&f=json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.features || !data.features.length) {
          setStatus('Could not retrieve geometry for download.', 'error'); return;
        }
        var placemarks = data.features.map(function (f) {
          return featureToPlacemark(f.attributes || {}, f.geometry.rings, styleId);
        });
        var desc = el('results').dataset.copy || 'plss-feature';
        var filename = 'plss-' + desc.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.kmz';
        saveKmz(buildKml(placemarks, desc), filename);
        setStatus('KMZ downloaded — open in Google Earth to view.', '');
      })
      .catch(function () { setStatus('Download failed. Please try again.', 'error'); });
  });

  // Download all visible sections in current map extent
  el('grid-kmz-btn').addEventListener('click', function () {
    if (map.getZoom() < MIN_ZOOM_GRID) return; // button should be disabled, but guard anyway
    setStatus('Fetching visible sections for KMZ...', 'loading');

    var b = map.getBounds();
    var geom = JSON.stringify({
      xmin: b.getWest(),  ymin: b.getSouth(),
      xmax: b.getEast(),  ymax: b.getNorth(),
      spatialReference: { wkid: 4326 }
    });

    fetch(BLM_MS + '/' + LYR.SECTION + '/query' +
      '?geometry=' + encodeURIComponent(geom) +
      '&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects' +
      '&outFields=TWNSHPNO,TWNSHPDIR,RANGENO,RANGEDIR,SECTIONNO,STATECD' +
      '&returnGeometry=true&outSR=4326&resultRecordCount=200&f=json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.features || !data.features.length) {
          setStatus('No PLSS section data found in the current view.', 'error'); return;
        }
        var placemarks = data.features.map(function (f) {
          return featureToPlacemark(f.attributes || {}, f.geometry.rings, 'section');
        });
        var n = data.features.length;
        saveKmz(buildKml(placemarks, 'PLSS Sections Grid'), 'plss-sections-grid.kmz');
        setStatus('KMZ downloaded (' + n + ' sections) — open in Google Earth to view.', '');
      })
      .catch(function () { setStatus('Download failed. Please try again.', 'error'); });
  });

  // Enable / disable grid download button based on zoom
  function updateGridBtn() {
    var btn = el('grid-kmz-btn');
    var zoom = map.getZoom();
    var ready = zoom >= MIN_ZOOM_GRID;
    btn.disabled = !ready;
    btn.textContent = ready
      ? 'Download visible grid KMZ'
      : 'Zoom to level ' + MIN_ZOOM_GRID + '+ to download grid (' + Math.round(zoom) + '/' + MIN_ZOOM_GRID + ')';
  }

  map.on('zoom', updateGridBtn);
  updateGridBtn(); // set initial state

  // ── Copy description ──────────────────────────────────────────────────────
  el('copy-btn').addEventListener('click', function () {
    var desc = el('results').dataset.copy || '';
    if (!desc || desc === '--') return;
    var btn = el('copy-btn');
    navigator.clipboard.writeText(desc).then(function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy Description'; }, 2000);
    }).catch(function () {
      // Fallback for older browsers
      var ta = document.createElement('textarea');
      ta.value = desc;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy Description'; }, 2000);
    });
  });

  // ── URL hash state ────────────────────────────────────────────────────────
  map.on('moveend', function () { pushHash(map); });

  function pushHash(m) {
    var c = m.getCenter();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + m.getZoom()
    );
  }

  function parseHash() {
    var raw = window.location.hash.slice(1);
    if (!raw) return {};
    var out = {};
    raw.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return out;
  }

  // ── Helper ────────────────────────────────────────────────────────────────
  function el(suffix) {
    return document.getElementById(SLUG + '-' + suffix);
  }

})();
