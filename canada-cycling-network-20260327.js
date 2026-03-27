(function () {
  'use strict';

  var SERVICE_URL = 'https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/CycleNetwork_2025_gdb/FeatureServer/0';

  var CANBICS_STYLES = {
    bike_path:            { color: '#2d8a2d', weight: 2,   label: 'Bike Path' },
    cycle_track:          { color: '#0055cc', weight: 2.5, label: 'Cycle Track' },
    gravel_trail:         { color: '#8b6914', weight: 1.5, label: 'Gravel Trail' },
    local_street_bikeway: { color: '#e07b00', weight: 1.5, label: 'Local Street Bikeway' },
    major_shared_roadway: { color: '#cc3300', weight: 1.5, label: 'Major Shared Roadway' },
    multi_use_path:       { color: '#00997a', weight: 2,   label: 'Multi-Use Path' },
    painted_bike_lane:    { color: '#8800aa', weight: 2,   label: 'Painted Bike Lane' },
    shared_roadway:       { color: '#888888', weight: 1,   label: 'Shared Roadway' }
  };

  var PROVINCE_LABELS = {
    ab: 'Alberta', bc: 'British Columbia', mb: 'Manitoba',
    nb: 'New Brunswick', nl: 'Newfoundland and Labrador', ns: 'Nova Scotia',
    nt: 'Northwest Territories', on: 'Ontario', pe: 'Prince Edward Island',
    qc: 'Quebec', sk: 'Saskatchewan', yt: 'Yukon'
  };

  var CONFIG = {
    mapId: 'canada-cycling-network-map',
    initialView: [56, -96],
    initialZoom: 4
  };

  var state = {
    province: 'ALL',
    canbics: 'ALL',
    basemap: 'streets'
  };

  var map = null;
  var baseLayers = {};
  var cyclingLayer = null;

  function buildWhere() {
    var parts = [];
    if (state.province !== 'ALL') parts.push("province_territory = '" + state.province + "'");
    if (state.canbics  !== 'ALL') parts.push("canbics_class = '" + state.canbics + "'");
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  function getStyle(feature) {
    var cls = feature.properties.canbics_class;
    var s = CANBICS_STYLES[cls];
    return s ? { color: s.color, weight: s.weight, opacity: 0.85 }
             : { color: '#aaaacc', weight: 1.5, opacity: 0.7 };
  }

  function buildPopup(props) {
    var cls   = props.canbics_class || '—';
    var label = (CANBICS_STYLES[cls] && CANBICS_STYLES[cls].label) || cls;
    var muni  = props.municipality  || props.csdname || '—';
    var prov  = props.province_territory ? (PROVINCE_LABELS[props.province_territory] || props.province_territory) : '—';
    var surf  = props.surface_type  || '—';
    var len   = props.length_km     != null ? props.length_km.toFixed(2) + ' km' : '—';
    var wid   = props.width_m       != null ? props.width_m.toFixed(1)   + ' m'  : '—';

    return '<div style="font-family:-apple-system,sans-serif;min-width:190px;">' +
      '<div style="font-size:0.85rem;font-weight:700;color:#222;margin-bottom:6px;">' + label + '</div>' +
      '<table style="font-size:0.77rem;border-collapse:collapse;width:100%;">' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Municipality</td><td style="color:#222;">' + muni + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Province</td><td style="color:#222;">' + prov + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Surface</td><td style="color:#222;">' + surf + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Length</td><td style="color:#222;">' + len + '</td></tr>' +
      '<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap;">Width</td><td style="color:#222;">' + wid + '</td></tr>' +
      '</table></div>';
  }

  function setStatus(msg) {
    var el = document.getElementById('canada-cycling-network-status');
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

  function initLayer() {
    cyclingLayer = L.esri.featureLayer({
      url: SERVICE_URL,
      where: buildWhere(),
      style: getStyle,
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature.properties), { maxWidth: 300 });
        layer.on('mouseover', function () {
          var s = getStyle(feature);
          layer.setStyle({ weight: s.weight + 2, opacity: 1 });
        });
        layer.on('mouseout', function () {
          layer.setStyle(getStyle(feature));
        });
      }
    });

    cyclingLayer.on('loading', function () { setStatus('Loading cycling network...'); });
    cyclingLayer.on('load',    function () { setStatus('Canadian Cycling Network Database (Statistics Canada, 2025) | Open Government Licence'); });
    cyclingLayer.on('requesterror', function () { setStatus('Error loading data. Please refresh.'); });

    cyclingLayer.addTo(map);
  }

  function applyFilters() {
    if (cyclingLayer) {
      cyclingLayer.setWhere(buildWhere());
      setStatus('Loading cycling network...');
    }
    updateHash();
  }

  function switchBasemap(id) {
    state.basemap = id;
    Object.keys(baseLayers).forEach(function (key) {
      if (key === id) {
        if (!map.hasLayer(baseLayers[key])) baseLayers[key].addTo(map);
        baseLayers[key].setZIndex(0);
        if (cyclingLayer) cyclingLayer.bringToFront();
      } else {
        if (map.hasLayer(baseLayers[key])) map.removeLayer(baseLayers[key]);
      }
    });
    document.querySelectorAll('.ccn-basemap-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.basemap === id);
    });
    updateHash();
  }

  function bindControls() {
    document.getElementById('ccn-province-select').addEventListener('change', function () {
      state.province = this.value;
      applyFilters();
    });

    document.getElementById('ccn-type-select').addEventListener('change', function () {
      state.canbics = this.value;
      applyFilters();
    });

    document.querySelectorAll('.ccn-basemap-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchBasemap(btn.dataset.basemap); });
    });
  }

  function updateHash() {
    var center = map.getCenter();
    var h = 'lat=' + center.lat.toFixed(4) +
            '&lng=' + center.lng.toFixed(4) +
            '&z=' + map.getZoom() +
            '&province=' + encodeURIComponent(state.province) +
            '&type=' + encodeURIComponent(state.canbics) +
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
    if (params.province) state.province = params.province;
    if (params.type)     state.canbics  = params.type;
    if (params.basemap)  state.basemap  = params.basemap;
  }

  function syncControls() {
    var provSel = document.getElementById('ccn-province-select');
    var typeSel = document.getElementById('ccn-type-select');
    if (provSel) provSel.value = state.province;
    if (typeSel) typeSel.value = state.canbics;
    document.querySelectorAll('.ccn-basemap-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.basemap === state.basemap);
    });
  }

  function buildLegend() {
    var container = document.getElementById('canada-cycling-network-legend');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(CANBICS_STYLES).forEach(function (key) {
      var s = CANBICS_STYLES[key];
      var item = document.createElement('div');
      item.className = 'ccn-legend-item';
      item.innerHTML = '<div class="ccn-legend-line" style="background:' + s.color + ';height:' + Math.max(2, s.weight) + 'px;"></div><span>' + s.label + '</span>';
      container.appendChild(item);
    });
  }

  function init() {
    map = L.map(CONFIG.mapId, {
      center: CONFIG.initialView,
      zoom: CONFIG.initialZoom
    });

    initBasemaps();
    loadHash();

    if (state.basemap !== 'streets') switchBasemap(state.basemap);

    initLayer();
    bindControls();
    syncControls();
    buildLegend();

    map.on('moveend zoomend', updateHash);

    setStatus('Loading cycling network...');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
