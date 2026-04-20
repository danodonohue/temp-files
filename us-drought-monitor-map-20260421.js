(function () {
  'use strict';

  var SERVICE_URL = 'https://services5.arcgis.com/0OTVzJS4K09zlixn/arcgis/rest/services/USDM_current/FeatureServer/0';

  var CATS = {
    0: { label: 'D0 — Abnormally Dry',     color: '#FFFF00', border: '#b3b300' },
    1: { label: 'D1 — Moderate Drought',    color: '#FCD37F', border: '#d4a030' },
    2: { label: 'D2 — Severe Drought',      color: '#FFAA00', border: '#cc8800' },
    3: { label: 'D3 — Extreme Drought',     color: '#E60000', border: '#990000' },
    4: { label: 'D4 — Exceptional Drought', color: '#730000', border: '#3d0000' }
  };

  function getHash() {
    var h = window.location.hash.slice(1), out = {};
    if (!h) return out;
    h.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i >= 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return out;
  }

  function setHash(map) {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  }

  var hs = getHash();
  var map = L.map('us-drought-monitor-map-map', {
    center: [hs.lat ? +hs.lat : 39.5, hs.lng ? +hs.lng : -98.35],
    zoom: hs.z ? +hs.z : 4
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var active = { 0: true, 1: true, 2: true, 3: true, 4: true };

  function styleFn(feature) {
    var dm = feature.properties.DM;
    var cat = CATS[dm];
    if (!cat || !active[dm]) return { opacity: 0, fillOpacity: 0, weight: 0 };
    return { color: cat.border, weight: 0.5, fillColor: cat.color, fillOpacity: 0.75 };
  }

  function fmtDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  var featureLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    style: styleFn,
    onEachFeature: function (feature, lyr) {
      var p = feature.properties;
      var cat = CATS[p.DM];
      var catLabel = cat ? cat.label : 'Unknown';
      var pct = (p.CumulativePerct !== null && p.CumulativePerct !== undefined)
        ? p.CumulativePerct.toFixed(1) + '% of US'
        : 'N/A';
      var mapDate = fmtDate(p.MapDate);
      lyr.bindPopup(
        '<strong>' + catLabel + '</strong><br>' +
        'Map date: ' + mapDate + '<br>' +
        'Cumulative US coverage: ' + pct
      );
    }
  }).addTo(map);

  map.on('moveend', function () { setHash(map); });

  // Build control bar
  var container = document.getElementById('us-drought-monitor-map-container');
  var ctrl = document.createElement('div');
  ctrl.id = 'us-drought-monitor-map-controls';

  var legend = document.createElement('div');
  legend.className = 'usdm-legend';

  var title = document.createElement('span');
  title.className = 'usdm-legend-title';
  title.textContent = 'Drought Category';
  legend.appendChild(title);

  Object.keys(CATS).forEach(function (key) {
    var cat = CATS[key];
    var lbl = document.createElement('label');
    lbl.className = 'usdm-legend-row';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.setAttribute('data-dm', key);
    cb.addEventListener('change', function () {
      active[key] = this.checked;
      featureLayer.setStyle(styleFn);
    });

    var sw = document.createElement('span');
    sw.className = 'usdm-swatch';
    sw.style.background = cat.color;
    sw.style.border = '1px solid ' + cat.border;

    var txt = document.createElement('span');
    txt.textContent = cat.label;

    lbl.appendChild(cb);
    lbl.appendChild(sw);
    lbl.appendChild(txt);
    legend.appendChild(lbl);
  });

  ctrl.appendChild(legend);

  var src = document.createElement('div');
  src.className = 'usdm-source';
  src.innerHTML = 'Source: <a href="https://droughtmonitor.unl.edu/" target="_blank" rel="noopener">US Drought Monitor</a> (NDMC/NOAA/USDA) &mdash; updated every Thursday';
  ctrl.appendChild(src);

  container.insertBefore(ctrl, container.firstChild);
})();
