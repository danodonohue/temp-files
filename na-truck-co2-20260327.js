(function () {
  'use strict';

  var BASE_URL = 'https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/NA_Estimated_Annual_Truck_CO2_Emissions_2035/FeatureServer/';

  var LAYER_DEFS = [
    { id: 'canada',  label: 'Canada',        layerId: 2, nameField: 'DESCRIP', trafficField: 'AADTT35' },
    { id: 'usa',     label: 'United States',  layerId: 3, nameField: 'LNAME',   trafficField: 'FAF35'   },
    { id: 'mexico',  label: 'Mexico',         layerId: 4, nameField: 'DESCRIP', trafficField: 'AADTT35' }
  ];

  var CO2_BREAKS = [
    { max: 2,        color: '#F5F500', label: '0 - 2 kt/km'   },
    { max: 5,        color: '#FFAA00', label: '2 - 5 kt/km'   },
    { max: 9,        color: '#E03000', label: '5 - 9 kt/km'   },
    { max: Infinity, color: '#7B0000', label: '9+ kt/km'      }
  ];

  var map;
  var featureLayers = {};
  var activeFlags = { canada: true, usa: true, mexico: true };

  function co2Color(val) {
    if (val == null) return '#aaaaaa';
    for (var i = 0; i < CO2_BREAKS.length; i++) {
      if (val < CO2_BREAKS[i].max) return CO2_BREAKS[i].color;
    }
    return CO2_BREAKS[CO2_BREAKS.length - 1].color;
  }

  function fmt(val, decimals, suffix) {
    if (val == null || isNaN(val)) return '-';
    var n = parseFloat(val);
    return (decimals != null ? n.toFixed(decimals) : Math.round(n).toLocaleString()) + (suffix || '');
  }

  function buildPopup(feature, def) {
    var p = feature.properties || {};
    var name = p[def.nameField] || p.DESCRIP || p.LNAME || 'Unnamed segment';
    var sign = p.SIGN1 || p.SIGN2 || '';
    var state = p.STATE || '';

    var rows = [];
    if (state) rows.push(['State / Province', state]);
    rows.push(['CO2 intensity', fmt(p.CO2_kmtkm, 2, ' kt/km')]);
    rows.push(['Annual CO2 (2035)', fmt(p.CO2_kmtyr, 1, ' kt/yr')]);
    rows.push(['Truck traffic (2035)', fmt(p[def.trafficField], null, ' trucks/day')]);

    var html = '<div class="nco2-popup"><strong>' + name + '</strong>';
    if (sign) html += ' <span class="nco2-sign">' + sign + '</span>';
    html += '<table>';
    rows.forEach(function (r) {
      html += '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>';
    });
    html += '</table></div>';
    return html;
  }

  function addFeatureLayer(def, visible) {
    var fl = L.esri.featureLayer({
      url: BASE_URL + def.layerId,
      style: function (feature) {
        var val = feature.properties ? feature.properties.CO2_kmtkm : null;
        return { color: co2Color(val), weight: 3.5, opacity: 0.9 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature, def), { maxWidth: 300 });
      }
    });

    featureLayers[def.id] = fl;
    activeFlags[def.id] = visible;

    if (visible) fl.addTo(map);
  }

  function setLayerVisible(id, visible) {
    var fl = featureLayers[id];
    if (!fl) return;
    if (visible) {
      fl.addTo(map);
    } else {
      map.removeLayer(fl);
    }
    activeFlags[id] = visible;
    updateShareUrl();
  }

  function buildLegend() {
    var el = document.getElementById('nco2-legend');
    if (!el) return;
    var html = '<span class="nco2-legend-label">CO2 intensity (kt/km):</span>';
    CO2_BREAKS.forEach(function (b) {
      html += '<span class="nco2-legend-item">' +
        '<span class="nco2-swatch" style="background:' + b.color + ';"></span>' +
        b.label + '</span>';
    });
    el.innerHTML = html;
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

  function updateShareUrl() {
    if (!map) return;
    var c = map.getCenter();
    var bits = LAYER_DEFS.map(function (d) { return activeFlags[d.id] ? '1' : '0'; }).join('');
    var hash = '#lat=' + c.lat.toFixed(4) +
      '&lng=' + c.lng.toFixed(4) +
      '&z=' + map.getZoom() +
      '&layers=' + bits;
    history.replaceState(null, '', hash);
  }

  function initMap() {
    var state = loadStateFromUrl();
    var lat    = (state && state.lat)    ? parseFloat(state.lat)    : 38;
    var lng    = (state && state.lng)    ? parseFloat(state.lng)    : -93;
    var zoom   = (state && state.z)      ? parseInt(state.z, 10)    : 4;
    var bits   = (state && state.layers) ? state.layers             : '111';

    map = L.map('na-truck-co2-map', { center: [lat, lng], zoom: zoom });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    map.on('moveend', updateShareUrl);

    buildLegend();

    LAYER_DEFS.forEach(function (def, i) {
      var visible = bits[i] !== '0';
      addFeatureLayer(def, visible);

      var cb = document.getElementById('nco2-toggle-' + def.id);
      if (cb) {
        cb.checked = visible;
        cb.addEventListener('change', function () {
          setLayerVisible(def.id, this.checked);
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }

})();
