(function () {
  'use strict';

  var SLUG = 'driveway-size-calculator';

  var CONFIG = {
    mapId: SLUG + '-map',
    initialView: [39.5, -98.35],
    initialZoom: 4
  };

  var state = {
    map: null,
    drawnItems: null,
    unit: 'imperial',
    sections: [],
    combinedBounds: null
  };

  // ---- Utilities ----

  function showToast(msg) {
    var el = document.getElementById(SLUG + '-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function metersToSqFt(m2) { return m2 * 10.7639; }
  function metersToFt(m) { return m * 3.28084; }

  function fmtArea(m2) {
    if (state.unit === 'imperial') {
      return {
        primary: Math.round(metersToSqFt(m2)).toLocaleString() + ' sq ft',
        secondary: Math.round(m2).toLocaleString() + ' sq m'
      };
    }
    return {
      primary: Math.round(m2).toLocaleString() + ' sq m',
      secondary: Math.round(metersToSqFt(m2)).toLocaleString() + ' sq ft'
    };
  }

  function fmtLen(m) {
    if (state.unit === 'imperial') {
      return {
        primary: Math.round(metersToFt(m)).toLocaleString() + ' ft',
        secondary: Math.round(m).toLocaleString() + ' m'
      };
    }
    return {
      primary: Math.round(m).toLocaleString() + ' m',
      secondary: Math.round(metersToFt(m)).toLocaleString() + ' ft'
    };
  }

  // ---- Geodesic calculations ----

  function geodesicArea(latlngs) {
    var R = 6378137;
    var area = 0;
    var n = latlngs.length;
    if (n < 3) return 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var lat1 = latlngs[i].lat * Math.PI / 180;
      var lat2 = latlngs[j].lat * Math.PI / 180;
      var dLng = (latlngs[j].lng - latlngs[i].lng) * Math.PI / 180;
      area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    return Math.abs(area * R * R / 2);
  }

  function perimeterMeters(latlngs) {
    var total = 0;
    var n = latlngs.length;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      total += L.latLng(latlngs[i]).distanceTo(L.latLng(latlngs[j]));
    }
    return total;
  }

  function boundsMeters(bounds) {
    if (!bounds) return { width: 0, height: 0 };
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var se = L.latLng(sw.lat, ne.lng);
    var nw = L.latLng(ne.lat, sw.lng);
    return { width: sw.distanceTo(se), height: sw.distanceTo(nw) };
  }

  function calcSection(layer) {
    var latlngs = layer.getLatLngs();
    if (latlngs.length > 0 && Array.isArray(latlngs[0])) {
      latlngs = latlngs[0];
    }
    return {
      area: geodesicArea(latlngs),
      perimeter: perimeterMeters(latlngs),
      bounds: layer.getBounds()
    };
  }

  // ---- Recalculate all sections ----

  function recalcAll() {
    state.sections = [];
    state.combinedBounds = null;

    state.drawnItems.eachLayer(function (layer) {
      if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
        var s = calcSection(layer);
        state.sections.push(s);
        if (!state.combinedBounds) {
          state.combinedBounds = L.latLngBounds(s.bounds.getSouthWest(), s.bounds.getNorthEast());
        } else {
          state.combinedBounds.extend(s.bounds);
        }
      }
    });

    renderResults();
  }

  // ---- Render results ----

  function renderResults() {
    var totalArea = 0;
    var totalPerim = 0;

    state.sections.forEach(function (s) {
      totalArea += s.area;
      totalPerim += s.perimeter;
    });

    var dims = boundsMeters(state.combinedBounds);

    var areaFmt = fmtArea(totalArea);
    var perimFmt = fmtLen(totalPerim);
    var widthFmt = fmtLen(dims.width);
    var heightFmt = fmtLen(dims.height);

    setText(SLUG + '-total-area', areaFmt.primary);
    setText(SLUG + '-total-area-sub', areaFmt.secondary);
    setText(SLUG + '-total-perim', perimFmt.primary);
    setText(SLUG + '-total-perim-sub', perimFmt.secondary);

    if (state.sections.length > 0) {
      setText(SLUG + '-bbox-dims', widthFmt.primary + ' x ' + heightFmt.primary);
      setText(SLUG + '-bbox-dims-sub', 'width x length');
    } else {
      setText(SLUG + '-bbox-dims', '-- x --');
      setText(SLUG + '-bbox-dims-sub', 'width x length');
    }

    setText(SLUG + '-section-count', state.sections.length.toString());
    setText(SLUG + '-section-count-sub', state.sections.length === 1 ? 'section' : 'sections');

    renderSectionTable();
  }

  function renderSectionTable() {
    var tbody = document.getElementById(SLUG + '-sections-tbody');
    if (!tbody) return;

    if (state.sections.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="dsc-sections-empty">No sections drawn yet - use the polygon tool on the map above.</td></tr>';
      return;
    }

    var rows = state.sections.map(function (s, i) {
      var a = fmtArea(s.area);
      var p = fmtLen(s.perimeter);
      var dims = boundsMeters(s.bounds);
      var wf = fmtLen(dims.width);
      var hf = fmtLen(dims.height);
      return '<tr>' +
        '<td>Section ' + (i + 1) + '</td>' +
        '<td>' + a.primary + '<br><span style="color:#999;font-size:0.76rem">' + a.secondary + '</span></td>' +
        '<td>' + p.primary + '</td>' +
        '<td>' + wf.primary + ' x ' + hf.primary + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = rows.join('');
  }

  // ---- Map init ----

  function initMap() {
    var mapEl = document.getElementById(CONFIG.mapId);
    if (!mapEl) return;

    var hashState = loadStateFromUrl();
    var center = CONFIG.initialView;
    var zoom = CONFIG.initialZoom;
    if (hashState && hashState.lat && hashState.lng && hashState.z) {
      center = [parseFloat(hashState.lat), parseFloat(hashState.lng)];
      zoom = parseInt(hashState.z, 10);
    }

    state.map = L.map(CONFIG.mapId, { center: center, zoom: zoom });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 20
    }).addTo(state.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      opacity: 0.25,
      maxZoom: 19
    }).addTo(state.map);

    state.drawnItems = new L.FeatureGroup();
    state.map.addLayer(state.drawnItems);

    if (L.Control && L.Control.Draw) {
      var drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: { color: '#2d6a4f', weight: 2, fillOpacity: 0.25 }
          },
          rectangle: {
            shapeOptions: { color: '#2d6a4f', weight: 2, fillOpacity: 0.25 }
          },
          circle: false,
          marker: false,
          polyline: false,
          circlemarker: false
        },
        edit: {
          featureGroup: state.drawnItems,
          remove: true
        }
      });
      state.map.addControl(drawControl);

      state.map.on(L.Draw.Event.CREATED, function (e) {
        state.drawnItems.addLayer(e.layer);
        recalcAll();
        showToast('Section added');
      });

      state.map.on(L.Draw.Event.EDITED, function () {
        recalcAll();
        showToast('Sections updated');
      });

      state.map.on(L.Draw.Event.DELETED, function () {
        recalcAll();
        showToast('Section removed');
      });
    }

    state.map.on('moveend zoomend', updateShareUrl);

    recalcAll();
  }

  // ---- Share URL ----

  function updateShareUrl() {
    if (!state.map) return;
    var c = state.map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + state.map.getZoom();
    history.replaceState(null, '', hash);
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var out = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

  // ---- Address search ----

  function searchAddress() {
    var input = document.getElementById(SLUG + '-search-input');
    if (!input || !input.value.trim()) { showToast('Enter an address to search'); return; }
    var q = input.value.trim();
    showToast('Searching...');
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.length) { showToast('Address not found'); return; }
        state.map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 19);
        showToast('Found: ' + data[0].display_name.split(',')[0]);
      })
      .catch(function () { showToast('Search failed'); });
  }

  function geolocate() {
    if (!navigator.geolocation) { showToast('Geolocation not supported'); return; }
    showToast('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        state.map.setView([pos.coords.latitude, pos.coords.longitude], 19);
        showToast('Location found');
      },
      function () { showToast('Could not get location'); }
    );
  }

  // ---- Unit toggle ----

  function setUnit(unit) {
    state.unit = unit;
    document.querySelectorAll('#' + SLUG + '-container .dsc-unit-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.unit === unit);
    });
    recalcAll();
  }

  // ---- Clear ----

  function clearAll() {
    if (!state.drawnItems || state.drawnItems.getLayers().length === 0) {
      showToast('Nothing to clear');
      return;
    }
    if (confirm('Clear all drawn sections?')) {
      state.drawnItems.clearLayers();
      recalcAll();
      showToast('All sections cleared');
    }
  }

  // ---- Downloads ----

  function triggerDownload(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadGeoJSON() {
    if (!state.drawnItems || state.drawnItems.getLayers().length === 0) {
      showToast('Draw at least one section first');
      return;
    }
    triggerDownload(JSON.stringify(state.drawnItems.toGeoJSON(), null, 2), 'driveway.geojson', 'application/geo+json');
    showToast('GeoJSON downloaded');
  }

  function getLayerLatlngs(layer) {
    var lls = layer.getLatLngs();
    return (lls.length > 0 && Array.isArray(lls[0])) ? lls[0] : lls;
  }

  function downloadKML() {
    if (!state.drawnItems || state.drawnItems.getLayers().length === 0) {
      showToast('Draw at least one section first');
      return;
    }
    var placemarks = [];
    var i = 0;
    state.drawnItems.eachLayer(function (layer) {
      if (!(layer instanceof L.Polygon || layer instanceof L.Rectangle)) return;
      i++;
      var lls = getLayerLatlngs(layer);
      // Close the ring by repeating first point
      var coords = lls.map(function (ll) { return ll.lng + ',' + ll.lat + ',0'; });
      coords.push(coords[0]);
      placemarks.push(
        '    <Placemark>\n' +
        '      <name>Section ' + i + '</name>\n' +
        '      <Polygon>\n' +
        '        <outerBoundaryIs>\n' +
        '          <LinearRing>\n' +
        '            <coordinates>' + coords.join(' ') + '</coordinates>\n' +
        '          </LinearRing>\n' +
        '        </outerBoundaryIs>\n' +
        '      </Polygon>\n' +
        '    </Placemark>'
      );
    });
    var kml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">\n' +
      '  <Document>\n' +
      '    <name>Driveway</name>\n' +
      placemarks.join('\n') + '\n' +
      '  </Document>\n' +
      '</kml>';
    triggerDownload(kml, 'driveway.kml', 'application/vnd.google-earth.kml+xml');
    showToast('KML downloaded');
  }

  function downloadGPX() {
    if (!state.drawnItems || state.drawnItems.getLayers().length === 0) {
      showToast('Draw at least one section first');
      return;
    }
    var tracks = [];
    var i = 0;
    state.drawnItems.eachLayer(function (layer) {
      if (!(layer instanceof L.Polygon || layer instanceof L.Rectangle)) return;
      i++;
      var lls = getLayerLatlngs(layer);
      // Close the loop by repeating first point
      var pts = lls.concat([lls[0]]);
      var trkpts = pts.map(function (ll) {
        return '        <trkpt lat="' + ll.lat + '" lon="' + ll.lng + '"></trkpt>';
      });
      tracks.push(
        '  <trk>\n' +
        '    <name>Section ' + i + '</name>\n' +
        '    <trkseg>\n' +
        trkpts.join('\n') + '\n' +
        '    </trkseg>\n' +
        '  </trk>'
      );
    });
    var gpx =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Driveway Size Calculator" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      tracks.join('\n') + '\n' +
      '</gpx>';
    triggerDownload(gpx, 'driveway.gpx', 'application/gpx+xml');
    showToast('GPX downloaded');
  }

  // ---- Wire up UI ----

  function wireUI() {
    var searchBtn = document.getElementById(SLUG + '-search-btn');
    if (searchBtn) searchBtn.addEventListener('click', searchAddress);

    var searchInput = document.getElementById(SLUG + '-search-input');
    if (searchInput) {
      searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchAddress();
      });
    }

    var geoBtn = document.getElementById(SLUG + '-geo-btn');
    if (geoBtn) geoBtn.addEventListener('click', geolocate);

    var clearBtn = document.getElementById(SLUG + '-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    document.querySelectorAll('#' + SLUG + '-container .dsc-unit-btn').forEach(function (b) {
      b.addEventListener('click', function () { setUnit(b.dataset.unit); });
    });

    var geojsonBtn = document.getElementById(SLUG + '-geojson-btn');
    if (geojsonBtn) geojsonBtn.addEventListener('click', downloadGeoJSON);

    var kmlBtn = document.getElementById(SLUG + '-kml-btn');
    if (kmlBtn) kmlBtn.addEventListener('click', downloadKML);

    var gpxBtn = document.getElementById(SLUG + '-gpx-btn');
    if (gpxBtn) gpxBtn.addEventListener('click', downloadGPX);
  }

  // ---- Init ----

  function init() {
    wireUI();
    initMap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
