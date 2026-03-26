(function () {
  'use strict';

  var CONFIG = {
    mapId: 'na-roads-2020-map',
    serviceUrl: 'https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/North_America_Roads_2020/FeatureServer/8',
    initialView: [40, -100],
    initialZoom: 4,
    typeLabels: { P: 'Primary Roads', S: 'Secondary Roads', F: 'Ferry Routes' },
    styles: {
      P: { color: '#a80000', weight: 1.5, opacity: 0.9 },
      S: { color: '#828282', weight: 0.8, opacity: 0.8 },
      F: { color: '#005ce6', weight: 1.8, opacity: 0.9, dashArray: '6 4' }
    }
  };

  var state = {
    filter: 'ALL',
    basemap: 'streets'
  };

  var baseLayers = {};
  var roadsLayer = null;
  var map = null;

  function getWhereClause(filter) {
    if (filter === 'ALL') return '1=1';
    return "Type = '" + filter + "'";
  }

  function getStyle(feature) {
    var type = feature.properties.Type;
    return CONFIG.styles[type] || CONFIG.styles.S;
  }

  function buildPopup(feature) {
    var p = feature.properties;
    var typeLabel = CONFIG.typeLabels[p.Type] || p.Type;
    var country = p.Country || 'N/A';
    var name = (p.Name_Code && p.Name_Code.trim() !== '' && p.Name_Code !== ' ') ? p.Name_Code : '—';
    var len = p.LengthKm != null ? (p.LengthKm.toLocaleString() + ' km') : '—';

    return '<div style="font-family:-apple-system,sans-serif;min-width:160px;">' +
      '<div style="font-size:0.85rem;font-weight:700;color:#222;margin-bottom:6px;">' + typeLabel + '</div>' +
      '<table style="font-size:0.78rem;border-collapse:collapse;width:100%;">' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;">Country</td><td style="color:#222;font-weight:600;">' + country + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;">Name / Code</td><td style="color:#222;font-weight:600;">' + name + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;">Length</td><td style="color:#222;font-weight:600;">' + len + '</td></tr>' +
      '</table></div>';
  }

  function setStatus(msg) {
    var el = document.getElementById('na-roads-2020-status');
    if (el) el.textContent = msg;
  }

  function initBasemaps() {
    baseLayers.streets = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }
    );
    baseLayers.satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri', maxZoom: 19 }
    );
    baseLayers.streets.addTo(map);
  }

  function initRoadsLayer() {
    roadsLayer = L.esri.featureLayer({
      url: CONFIG.serviceUrl,
      where: getWhereClause(state.filter),
      style: getStyle,
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature), { maxWidth: 280 });
        layer.on('mouseover', function () {
          var s = getStyle(feature);
          layer.setStyle({ weight: s.weight + 2, opacity: 1 });
        });
        layer.on('mouseout', function () {
          layer.setStyle(getStyle(feature));
        });
      }
    });

    roadsLayer.on('loading', function () { setStatus('Loading roads...'); });
    roadsLayer.on('load', function () { setStatus('Data: North America Roads 2020 (CEC) | CC BY 4.0'); });
    roadsLayer.on('requesterror', function () { setStatus('Error loading data. Please refresh.'); });

    roadsLayer.addTo(map);
  }

  function applyFilter(filter) {
    state.filter = filter;

    document.querySelectorAll('.na-roads-2020-filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    if (roadsLayer) {
      roadsLayer.setWhere(getWhereClause(filter));
      setStatus('Loading roads...');
    }

    updateHash();
  }

  function switchBasemap(id) {
    state.basemap = id;

    Object.keys(baseLayers).forEach(function (key) {
      if (key === id) {
        if (!map.hasLayer(baseLayers[key])) baseLayers[key].addTo(map);
        baseLayers[key].setZIndex(0);
        if (roadsLayer) roadsLayer.bringToFront();
      } else {
        if (map.hasLayer(baseLayers[key])) map.removeLayer(baseLayers[key]);
      }
    });

    document.querySelectorAll('.na-roads-2020-basemap-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.basemap === id);
    });

    updateHash();
  }

  function bindControls() {
    document.querySelectorAll('.na-roads-2020-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { applyFilter(btn.dataset.filter); });
    });

    document.querySelectorAll('.na-roads-2020-basemap-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchBasemap(btn.dataset.basemap); });
    });
  }

  function updateHash() {
    var center = map.getCenter();
    var h = 'lat=' + center.lat.toFixed(4) +
            '&lng=' + center.lng.toFixed(4) +
            '&z=' + map.getZoom() +
            '&filter=' + encodeURIComponent(state.filter) +
            '&basemap=' + encodeURIComponent(state.basemap);
    history.replaceState(null, '', '#' + h);
  }

  function loadHash() {
    var raw = window.location.hash.slice(1);
    if (!raw) return;
    var params = {};
    raw.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      params[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    if (params.lat && params.lng && params.z) {
      map.setView([parseFloat(params.lat), parseFloat(params.lng)], parseInt(params.z, 10));
    }
    if (params.filter) state.filter = params.filter;
    if (params.basemap) state.basemap = params.basemap;
  }

  function init() {
    map = L.map(CONFIG.mapId, {
      center: CONFIG.initialView,
      zoom: CONFIG.initialZoom,
      zoomControl: true
    });

    initBasemaps();
    loadHash();

    if (state.basemap !== 'streets') switchBasemap(state.basemap);

    initRoadsLayer();
    bindControls();

    if (state.filter !== 'ALL') applyFilter(state.filter);

    document.querySelectorAll('.na-roads-2020-basemap-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.basemap === state.basemap);
    });
    document.querySelectorAll('.na-roads-2020-filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === state.filter);
    });

    map.on('moveend zoomend', updateHash);

    setStatus('Data: North America Roads 2020 (CEC) | CC BY 4.0');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
