(function () {
  'use strict';

  var SERVICE_URL = 'https://services7.arcgis.com/rUSNqhFNeFnLs98e/ArcGIS/rest/services/SAR_Fixed_Infrastructure/FeatureServer/0';

  var CONF_COLORS = {
    high:   '#e65100',
    medium: '#f57c00',
    low:    '#ffb74d'
  };

  var activeConf = { high: true, medium: true, low: true };
  var map, clusterLayer;

  // --- Helpers ---

  function buildWhere() {
    var active = Object.keys(activeConf).filter(function (k) { return activeConf[k]; });
    if (!active.length) return "1=0";
    return "label='oil' AND label_confidence IN (" +
      active.map(function (c) { return "'" + c + "'"; }).join(',') + ")";
  }

  function fmtDate(ms) {
    if (!ms) return 'Unknown';
    return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  function buildPopup(props) {
    var conf  = (props.label_confidence || '').toLowerCase();
    var color = CONF_COLORS[conf] || '#ffb74d';
    var active = !props.structure_end_date;
    var dur = props.structure_duration
      ? props.structure_duration.toLocaleString() + ' days'
      : (active ? 'Active' : 'Unknown');

    return '<div style="font-family:-apple-system,sans-serif;min-width:195px;font-size:0.82rem;">' +
      '<div style="font-weight:700;font-size:0.88rem;color:#e65100;margin-bottom:7px;padding-bottom:5px;border-bottom:2px solid ' + color + ';">Oil &amp; Gas Platform</div>' +
      '<table style="width:100%;border-collapse:collapse;line-height:1.8;">' +
      '<tr><td style="color:#666;white-space:nowrap;padding-right:10px;">Confidence</td>' +
      '<td><span style="background:' + color + ';color:#fff;padding:1px 7px;border-radius:3px;">' + (props.label_confidence || 'unknown') + '</span></td></tr>' +
      '<tr><td style="color:#666;">First detected</td><td>' + fmtDate(props.structure_start_date) + '</td></tr>' +
      '<tr><td style="color:#666;">Last detected</td><td>' + (active ? '<em style="color:#2e7d32;">Still active</em>' : fmtDate(props.structure_end_date)) + '</td></tr>' +
      '<tr><td style="color:#666;">Duration</td><td>' + dur + '</td></tr>' +
      '<tr><td style="color:#666;">Lat / Lon</td><td>' +
        (props.lat !== null ? props.lat.toFixed(3) : '?') + ', ' +
        (props.lon !== null ? props.lon.toFixed(3) : '?') +
      '</td></tr>' +
      '</table></div>';
  }

  // --- Count ---

  function updateCount() {
    var url = SERVICE_URL + '/query?where=' +
      encodeURIComponent(buildWhere()) +
      '&returnCountOnly=true&f=json';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el = document.getElementById('opm-count');
        if (el && d.count !== undefined) {
          el.textContent = d.count.toLocaleString() + ' platforms';
        }
      })
      .catch(function () {});
  }

  // --- Share URL ---

  function updateShareUrl() {
    var c    = map.getCenter();
    var conf = Object.keys(activeConf).filter(function (k) { return activeConf[k]; }).join(',');
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(4) +
      '&lng=' + c.lng.toFixed(4) +
      '&z='   + map.getZoom() +
      '&conf='+ encodeURIComponent(conf));
  }

  function loadUrlState() {
    var hash = window.location.hash.slice(1);
    if (!hash) return {};
    var out = {};
    hash.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return out;
  }

  // --- Map init ---

  function initMap() {
    var state = loadUrlState();
    var lat = state.lat ? parseFloat(state.lat) : 25;
    var lng = state.lng ? parseFloat(state.lng) : 50;
    var z   = state.z  ? parseInt(state.z,  10) : 3;

    if (state.conf) {
      activeConf = { high: false, medium: false, low: false };
      state.conf.split(',').forEach(function (c) {
        if (c in activeConf) activeConf[c] = true;
      });
    }

    syncCheckboxes();

    map = L.map('offshore-oil-platform-map-map', { center: [lat, lng], zoom: z });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    clusterLayer = L.esri.Cluster.featureLayer({
      url: SERVICE_URL,
      where: buildWhere(),
      maxClusterRadius: 35,
      disableClusteringAtZoom: 8,
      pointToLayer: function (f, ll) {
        var conf  = (f.properties.label_confidence || '').toLowerCase();
        var color = CONF_COLORS[conf] || '#ffb74d';
        return L.circleMarker(ll, {
          radius: 5,
          fillColor: color,
          color: '#fff',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.9
        });
      }
    });

    clusterLayer.bindPopup(function (layer) {
      return buildPopup(layer.feature.properties);
    });

    clusterLayer.addTo(map);
    map.on('moveend', updateShareUrl);
    updateCount();
  }

  // --- Controls ---

  function syncCheckboxes() {
    ['high', 'medium', 'low'].forEach(function (k) {
      var cb = document.getElementById('opm-cb-' + k);
      if (cb) cb.checked = activeConf[k];
    });
  }

  function onFilterChange() {
    ['high', 'medium', 'low'].forEach(function (k) {
      var cb = document.getElementById('opm-cb-' + k);
      if (cb) activeConf[k] = cb.checked;
    });
    clusterLayer.setWhere(buildWhere());
    clusterLayer.refresh();
    updateCount();
    updateShareUrl();
  }

  // --- Boot ---

  document.addEventListener('DOMContentLoaded', function () {
    ['high', 'medium', 'low'].forEach(function (k) {
      var cb = document.getElementById('opm-cb-' + k);
      if (cb) cb.addEventListener('change', onFilterChange);
    });

    var shareBtn = document.getElementById('opm-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        updateShareUrl();
        var href = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(href).catch(function () {});
        }
        shareBtn.textContent = 'Copied!';
        setTimeout(function () { shareBtn.textContent = 'Share'; }, 2000);
      });
    }

    initMap();
  });

})();
