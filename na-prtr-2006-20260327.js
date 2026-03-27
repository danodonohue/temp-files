(function () {
  'use strict';

  var SERVICE = 'https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/NA_PRTR_Reporting_Facilities_2006/FeatureServer';

  var CONFIG = {
    mapId: 'na-prtr-2006-map',
    initialView: [40, -100],
    initialZoom: 4,
    layers: {
      CA: { id: 1, color: '#c00000', label: 'Canada (NPRI)' },
      US: { id: 2, color: '#0055aa', label: 'USA (TRI)'     },
      MX: { id: 3, color: '#237a23', label: 'Mexico (RETC)' }
    }
  };

  var state = {
    country: 'ALL',
    basemap: 'streets'
  };

  var map = null;
  var baseLayers = {};
  var featureLayers = {};

  function makeCircleIcon(color) {
    return L.divIcon({
      className: '',
      html: '<div style="width:8px;height:8px;border-radius:50%;background:' + color + ';border:1px solid rgba(0,0,0,0.4);"></div>',
      iconSize: [8, 8],
      iconAnchor: [4, 4]
    });
  }

  function makeClusterIcon(cluster, color) {
    var count = cluster.getChildCount();
    var size = count < 10 ? 28 : count < 100 ? 34 : count < 1000 ? 40 : 46;
    var label = count >= 1000 ? (Math.floor(count / 1000) + 'k') : String(count);
    return L.divIcon({
      className: '',
      html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
            'background:' + color + ';border:2px solid rgba(255,255,255,0.55);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:0.68rem;font-weight:700;color:#fff;' +
            'box-shadow:0 1px 4px rgba(0,0,0,0.4);">' + label + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function buildPopup(props, countryCode) {
    var name  = props.FACILITY_N || '—';
    var addr  = props.ADDRESS1   || '—';
    var city  = props.CITY       || '—';
    var prov  = props.STATE_PROV || '—';
    var naics = props.NAICSCODE  ? String(props.NAICSCODE) : '—';
    var regMap = { CA: 'Canada — NPRI', US: 'United States — TRI', MX: 'Mexico — RETC' };
    var reg = regMap[countryCode] || countryCode;

    return '<div style="font-family:-apple-system,sans-serif;min-width:180px;">' +
      '<div style="font-size:0.85rem;font-weight:700;color:#222;margin-bottom:6px;line-height:1.3;">' + name + '</div>' +
      '<table style="font-size:0.77rem;border-collapse:collapse;width:100%;">' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Register</td><td style="color:#222;font-weight:600;">' + reg + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Address</td><td style="color:#222;">' + addr + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">City</td><td style="color:#222;">' + city + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">State / Province</td><td style="color:#222;">' + prov + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">NAICS Code</td><td style="color:#222;">' + naics + '</td></tr>' +
      '</table></div>';
  }

  function setStatus(msg) {
    var el = document.getElementById('na-prtr-2006-status');
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

  function initLayers() {
    var loadingCount = 0;

    Object.keys(CONFIG.layers).forEach(function (code) {
      var cfg = CONFIG.layers[code];
      var icon = makeCircleIcon(cfg.color);

      var layer = L.esri.Cluster.featureLayer({
        url: SERVICE + '/' + cfg.id,
        pointToLayer: function (feature, latlng) {
          return L.marker(latlng, { icon: icon });
        },
        onEachFeature: function (feature, lyr) {
          lyr.bindPopup(buildPopup(feature.properties, code), { maxWidth: 300 });
        },
        iconCreateFunction: function (cluster) {
          return makeClusterIcon(cluster, cfg.color);
        }
      });

      layer.on('loading', function () {
        loadingCount++;
        setStatus('Loading facilities...');
      });

      layer.on('load', function () {
        loadingCount = Math.max(0, loadingCount - 1);
        if (loadingCount === 0) {
          setStatus('~35,000 industrial facilities | North America PRTR 2006 (CEC) | CC BY 4.0');
        }
      });

      featureLayers[code] = layer;
      layer.addTo(map);
    });
  }

  function applyCountryFilter(code) {
    state.country = code;

    document.querySelectorAll('.na-prtr-2006-country-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.country === code);
    });

    Object.keys(featureLayers).forEach(function (c) {
      var shouldShow = (code === 'ALL' || code === c);
      if (shouldShow && !map.hasLayer(featureLayers[c])) {
        featureLayers[c].addTo(map);
      } else if (!shouldShow && map.hasLayer(featureLayers[c])) {
        map.removeLayer(featureLayers[c]);
      }
    });

    updateHash();
  }

  function switchBasemap(id) {
    state.basemap = id;

    Object.keys(baseLayers).forEach(function (key) {
      if (key === id) {
        if (!map.hasLayer(baseLayers[key])) baseLayers[key].addTo(map);
        baseLayers[key].setZIndex(0);
      } else {
        if (map.hasLayer(baseLayers[key])) map.removeLayer(baseLayers[key]);
      }
    });

    document.querySelectorAll('.na-prtr-2006-basemap-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.basemap === id);
    });

    updateHash();
  }

  function bindControls() {
    document.querySelectorAll('.na-prtr-2006-country-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { applyCountryFilter(btn.dataset.country); });
    });
    document.querySelectorAll('.na-prtr-2006-basemap-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchBasemap(btn.dataset.basemap); });
    });
  }

  function updateHash() {
    var center = map.getCenter();
    var h = 'lat=' + center.lat.toFixed(4) +
            '&lng=' + center.lng.toFixed(4) +
            '&z=' + map.getZoom() +
            '&country=' + encodeURIComponent(state.country) +
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
    if (params.country) state.country = params.country;
    if (params.basemap) state.basemap = params.basemap;
  }

  function init() {
    map = L.map(CONFIG.mapId, {
      center: CONFIG.initialView,
      zoom: CONFIG.initialZoom
    });

    initBasemaps();
    loadHash();

    if (state.basemap !== 'streets') switchBasemap(state.basemap);

    initLayers();
    bindControls();

    if (state.country !== 'ALL') applyCountryFilter(state.country);

    document.querySelectorAll('.na-prtr-2006-basemap-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.basemap === state.basemap);
    });
    document.querySelectorAll('.na-prtr-2006-country-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.country === state.country);
    });

    map.on('moveend zoomend', updateHash);

    setStatus('Loading facilities...');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
