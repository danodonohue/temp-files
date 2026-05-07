(function () {
  'use strict';

  var SERVICE_URL = 'https://services.arcgis.com/jDGuO8tYggdCCnUJ/ArcGIS/rest/services/NatWells_03012024_Co_St_Join/FeatureServer/0';
  var COUNTIES_TOPO = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

  // Quantile class breaks (20th/40th/60th/80th percentile of 2,146 counties with wells)
  var BREAKS = [48, 232, 1368, 4390];
  var COLORS = ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'];
  var LABELS = ['1 - 48', '49 - 232', '233 - 1,368', '1,369 - 4,390', '4,391+'];
  var EMPTY_COLOR = '#f0f0f0';

  // State abbreviation -> spoke URL slug
  var STATE_SLUG = {
    AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas',
    CA: 'california', CO: 'colorado', FL: 'florida', GA: 'georgia',
    ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
    KS: 'kansas', KY: 'kentucky', LA: 'louisiana', MI: 'michigan',
    MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana',
    NE: 'nebraska', NV: 'nevada', NM: 'new-mexico', NY: 'new-york',
    NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio', OK: 'oklahoma',
    OR: 'oregon', PA: 'pennsylvania', SD: 'south-dakota', TN: 'tennessee',
    TX: 'texas', UT: 'utah', VA: 'virginia', WA: 'washington',
    WV: 'west-virginia', WY: 'wyoming'
  };

  var WELL_STATES = [
    ['AL','Alabama'], ['AK','Alaska'], ['AZ','Arizona'], ['AR','Arkansas'],
    ['CA','California'], ['CO','Colorado'], ['FL','Florida'], ['GA','Georgia'],
    ['ID','Idaho'], ['IL','Illinois'], ['IN','Indiana'], ['IA','Iowa'],
    ['KS','Kansas'], ['KY','Kentucky'], ['LA','Louisiana'], ['MI','Michigan'],
    ['MN','Minnesota'], ['MS','Mississippi'], ['MO','Missouri'], ['MT','Montana'],
    ['NE','Nebraska'], ['NV','Nevada'], ['NM','New Mexico'], ['NY','New York'],
    ['NC','North Carolina'], ['ND','North Dakota'], ['OH','Ohio'], ['OK','Oklahoma'],
    ['OR','Oregon'], ['PA','Pennsylvania'], ['SD','South Dakota'], ['TN','Tennessee'],
    ['TX','Texas'], ['UT','Utah'], ['VA','Virginia'], ['WA','Washington'],
    ['WV','West Virginia'], ['WY','Wyoming']
  ];

  function getColor(count) {
    if (!count || count <= 0) return EMPTY_COLOR;
    if (count <= BREAKS[0]) return COLORS[0];
    if (count <= BREAKS[1]) return COLORS[1];
    if (count <= BREAKS[2]) return COLORS[2];
    if (count <= BREAKS[3]) return COLORS[3];
    return COLORS[4];
  }

  function fmt(n) { return (n || 0).toLocaleString(); }

  function readHash() {
    var h = window.location.hash.slice(1), p = {};
    if (!h) return null;
    h.split('&').forEach(function (s) {
      var i = s.indexOf('=');
      if (i > 0) p[s.slice(0, i)] = decodeURIComponent(s.slice(i + 1));
    });
    return (p.lat && p.lng && p.z) ? p : null;
  }

  var map;
  function writeHash() {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  }

  var saved = readHash();
  map = L.map('oil-gas-county-map', {
    center: saved ? [+saved.lat, +saved.lng] : [38.5, -96],
    zoom: saved ? +saved.z : 4
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  map.on('moveend', writeHash);

  var loadDiv = document.getElementById('ogcm-loading');
  var loadMsg = document.getElementById('ogcm-load-msg');

  function setLoadMsg(msg) {
    if (loadMsg) loadMsg.textContent = msg;
    if (loadDiv) loadDiv.style.display = 'flex';
  }

  function hideLoad() {
    if (loadDiv) loadDiv.style.display = 'none';
  }

  // Populate state dropdown
  var sel = document.getElementById('ogcm-state-select');
  if (sel) {
    WELL_STATES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s[0];
      opt.textContent = s[1];
      sel.appendChild(opt);
    });
  }

  // Fetch attribute data from FeatureServer (no geometry, paginated)
  function fetchAttrsPage(offset, acc, done) {
    var params = [
      'where=1%3D1',
      'outFields=GEOID%2CNAME%2CNAME_1%2CSTUSPS%2CPoint_Count%2CPlg%2CPrdW%2CALAND',
      'returnGeometry=false',
      'resultOffset=' + offset,
      'resultRecordCount=2000',
      'f=json'
    ].join('&');

    fetch(SERVICE_URL + '/query?' + params)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        (data.features || []).forEach(function (f) {
          var geoid = f.attributes.GEOID;
          if (geoid) acc[geoid] = f.attributes;
        });
        if (data.exceededTransferLimit) {
          fetchAttrsPage(offset + 2000, acc, done);
        } else {
          done(null, acc);
        }
      })
      .catch(function (err) { done(err); });
  }

  // Coordinate parallel loads
  var lookup = {};
  var topoData = null;
  var pending = 2;
  var countyLayer = null;

  function checkReady() {
    pending--;
    if (pending > 0) return;
    hideLoad();
    buildMap();
  }

  setLoadMsg('Loading county boundaries...');

  // Load 1: US counties TopoJSON (pre-simplified, ~230 KB)
  fetch(COUNTIES_TOPO)
    .then(function (r) { return r.json(); })
    .then(function (us) {
      topoData = topojson.feature(us, us.objects.counties);
      checkReady();
    })
    .catch(function () { checkReady(); });

  // Load 2: Attribute data (no geometry, 2 paginated requests)
  fetchAttrsPage(0, {}, function (err, data) {
    lookup = data || {};
    setLoadMsg('Building map...');
    checkReady();
  });

  function featureStyle(feature, stateCode) {
    var fips = String(feature.id).padStart(5, '0');
    var attrs = lookup[fips];
    var count = attrs ? (attrs.Point_Count || 0) : 0;
    var inFilter = !stateCode || (attrs && attrs.STUSPS === stateCode);
    return {
      fillColor: getColor(count),
      fillOpacity: !inFilter ? 0.07 : (count > 0 ? 0.78 : 0.4),
      color: !inFilter ? '#ddd' : (count > 0 ? '#999' : '#d8d8d8'),
      weight: 0.4,
      opacity: !inFilter ? 0.2 : 0.8
    };
  }

  function buildMap() {
    if (!topoData) return;

    countyLayer = L.geoJSON(topoData.features, {
      renderer: L.canvas({ padding: 0.5 }),
      style: function (f) { return featureStyle(f, null); },
      onEachFeature: function (feature, layer) {
        layer.on('click', function (e) {
          var fips = String(feature.id).padStart(5, '0');
          var p = lookup[fips] || {};
          var total = p.Point_Count || 0;
          var plg = p.Plg || 0;
          var prd = p.PrdW || 0;
          var other = Math.max(0, total - plg - prd);
          var sqmi = p.ALAND ? (p.ALAND / 2589988.11) : 0;
          var dens = (sqmi > 0 && total > 0) ? (total / sqmi).toFixed(1) : 'N/A';
          var stateName = p.NAME_1 || '';
          var stusps = p.STUSPS || '';
          var slug = STATE_SLUG[stusps];
          var countyName = p.NAME || 'County';
          var link = slug
            ? '<br><a href="https://mapscaping.com/' + slug + '-oil-gas-wells/" target="_blank" rel="noopener">View all ' + stateName + ' wells &rarr;</a>'
            : '';
          var body = total > 0
            ? '<strong>' + countyName + ' County, ' + stateName + '</strong><br>' +
              'Total wells: <strong>' + fmt(total) + '</strong><br>' +
              'Producing: ' + fmt(prd) + '<br>' +
              'Plugged: ' + fmt(plg) + '<br>' +
              'Other status: ' + fmt(other) + '<br>' +
              'Density: ' + dens + ' wells/sq&nbsp;mi' + link
            : '<strong>' + countyName + ' County</strong><br>No wells recorded in this county';
          L.popup().setLatLng(e.latlng).setContent(body).openOn(map);
        });
      }
    }).addTo(map);

    // State filter
    if (sel) {
      sel.addEventListener('change', function () {
        var code = this.value;
        countyLayer.setStyle(function (f) { return featureStyle(f, code || null); });
        if (!code) {
          map.setView([38.5, -96], 4);
          return;
        }
        // Zoom to state bounds using a quick service query
        L.esri.query({ url: SERVICE_URL })
          .where("STUSPS = '" + code + "'")
          .bounds(function (err, bounds) {
            if (!err && bounds) map.fitBounds(bounds, { padding: [30, 30] });
          });
      });
    }
  }

  // Legend
  var legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'ogcm-legend');
    div.innerHTML = '<strong>Wells per County</strong>';
    COLORS.forEach(function (c, i) {
      div.innerHTML +=
        '<div class="ogcm-legend-row">' +
        '<span class="ogcm-swatch" style="background:' + c + '"></span>' +
        '<span>' + LABELS[i] + '</span></div>';
    });
    div.innerHTML +=
      '<div class="ogcm-legend-row">' +
      '<span class="ogcm-swatch" style="background:' + EMPTY_COLOR + '"></span>' +
      '<span>No wells</span></div>';
    return div;
  };
  legend.addTo(map);

}());
