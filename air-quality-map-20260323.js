(function () {
  'use strict';

  var SLUG = 'aq';
  var SERVICE_BASE = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Air_Quality_PM25_Latest_Results/FeatureServer';

  var POLLUTANTS = [
    { key: 'PM2.5', layerId: 0, breaks: [12, 35.4, 55.4, 150.4, 250.4] },
    { key: 'PM10',  layerId: 1, breaks: [54, 154, 254, 354, 424] },
    { key: 'PM1',   layerId: 2, breaks: [12, 35.4, 55.4, 150.4, 250.4] }
  ];

  var AQI_CATS = [
    { label: 'Good',                           color: '#00e400', r: 5  },
    { label: 'Moderate',                       color: '#ffff00', r: 6  },
    { label: 'Unhealthy for Sensitive Groups', color: '#ff7e00', r: 7  },
    { label: 'Unhealthy',                      color: '#ff0000', r: 8  },
    { label: 'Very Unhealthy',                 color: '#8f3f97', r: 9  },
    { label: 'Hazardous',                      color: '#7e0023', r: 10 }
  ];

  function pollutantByKey(k) {
    for (var i = 0; i < POLLUTANTS.length; i++) {
      if (POLLUTANTS[i].key === k) return POLLUTANTS[i];
    }
    return POLLUTANTS[0];
  }

  function getCategory(value, breaks) {
    if (value == null || isNaN(value)) return null;
    var v = parseFloat(value);
    for (var i = 0; i < breaks.length; i++) {
      if (v <= breaks[i]) return AQI_CATS[i];
    }
    return AQI_CATS[AQI_CATS.length - 1];
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildPopupHtml(p, pollutant) {
    var cat = getCategory(p.value, pollutant.breaks);
    var catLabel = cat ? cat.label : 'Unknown';
    var catColor = cat ? cat.color : '#aaaaaa';
    var city = [p.city, p.country_name].filter(Boolean).map(escapeHtml).join(', ');
    var valueStr = (p.value != null)
      ? escapeHtml(String(p.value)) + ' ' + escapeHtml(p.unit || '\u00b5g/m\u00b3')
      : null;

    var rows = [
      ['Pollutant',    escapeHtml(pollutant.key)],
      ['Value',        valueStr],
      ['AQI Category', '<span style="display:inline-block;width:10px;height:10px;background:' + catColor + ';border-radius:50%;margin-right:4px;vertical-align:middle;border:1px solid rgba(0,0,0,0.2);"></span>' + escapeHtml(catLabel)],
      ['Location',     city || null],
      ['Last updated', escapeHtml(p.lastUpdated) || null]
    ];

    var rowHtml = rows
      .filter(function (r) { return r[1] != null && r[1] !== ''; })
      .map(function (r) {
        return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + r[1] + '</td></tr>';
      }).join('');

    var linkHtml = (p.url && p.url.trim())
      ? '<tr><td>Info</td><td><a href="' + encodeURI(p.url.trim()) + '" target="_blank" rel="noopener">Station page</a></td></tr>'
      : '';

    return '<div class="aq-popup">' +
      '<h4 style="border-bottom-color:' + catColor + '">' + escapeHtml(p.location || 'Monitoring Station') + '</h4>' +
      '<table>' + rowHtml + linkHtml + '</table></div>';
  }

  // --- URL state ---
  function loadUrlState() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return out;
  }

  function saveUrlState() {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom();
    if (currentPollutantKey !== 'PM2.5') hash += '&p=' + encodeURIComponent(currentPollutantKey);
    history.replaceState(null, '', hash);
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  // --- Init ---
  var params = loadUrlState() || {};
  var currentPollutantKey = params.p || 'PM2.5';

  var map = L.map(SLUG + '-map', {
    center: (params.lat && params.lng) ? [+params.lat, +params.lng] : [20, 0],
    zoom:   params.z ? +params.z : 3
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var statusEl = document.getElementById(SLUG + '-status');
  var featureLayer = null;

  // Loading overlay
  var loadingEl = document.createElement('div');
  loadingEl.id = SLUG + '-loading';
  loadingEl.innerHTML = '<span class="aq-spinner"></span>Loading air quality data...';
  loadingEl.classList.add('aq-hidden');
  map.getContainer().appendChild(loadingEl);

  function buildLayer(pollutantKey) {
    if (featureLayer) {
      map.removeLayer(featureLayer);
      featureLayer = null;
    }
    var pollutant = pollutantByKey(pollutantKey);
    featureLayer = L.esri.featureLayer({
      url: SERVICE_BASE + '/' + pollutant.layerId,
      pointToLayer: function (feature, latlng) {
        var cat = getCategory(feature.properties.value, pollutant.breaks);
        return L.circleMarker(latlng, {
          radius:      cat ? cat.r : 5,
          fillColor:   cat ? cat.color : '#aaaaaa',
          color:       'rgba(0,0,0,0.25)',
          weight:      0.8,
          opacity:     0.9,
          fillOpacity: 0.85
        });
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopupHtml(feature.properties, pollutant), { maxWidth: 280 });
      }
    }).addTo(map);

    featureLayer.on('loading', function () {
      loadingEl.classList.remove('aq-hidden');
      setStatus('');
    });
    featureLayer.on('load', function () {
      loadingEl.classList.add('aq-hidden');
      setStatus('Data updated hourly \u2022 Source: OpenAQ');
    });
  }

  buildLayer(currentPollutantKey);

  map.on('moveend zoomend', function () {
    saveUrlState();
  });

  // --- Pollutant selector ---
  var pollutantSelect = document.getElementById(SLUG + '-pollutant');
  if (pollutantSelect) {
    POLLUTANTS.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.key;
      if (p.key === currentPollutantKey) opt.selected = true;
      pollutantSelect.appendChild(opt);
    });
    pollutantSelect.addEventListener('change', function () {
      currentPollutantKey = this.value;
      buildLayer(currentPollutantKey);
      saveUrlState();
    });
  }

  // --- Legend ---
  var legendEl = document.getElementById(SLUG + '-legend-items');
  if (legendEl) {
    AQI_CATS.forEach(function (cat) {
      var item = document.createElement('div');
      item.className = 'aq-legend-item';
      var d = cat.r * 2;
      item.innerHTML =
        '<span class="aq-legend-dot" style="width:' + d + 'px;height:' + d + 'px;background:' + cat.color + ';"></span>' +
        escapeHtml(cat.label);
      legendEl.appendChild(item);
    });
  }

})();
