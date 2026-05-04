(function () {
  'use strict';

  var SERVICE_URL = 'https://gisportal.ers.usda.gov/server/rest/services/Hosted/FARA_General2019/FeatureServer/0';

  var COLORS = {
    foodDesert: '#c0392b',
    nonDesert:  '#cccccc',
    hoverDesert:'#e74c3c',
    hoverOther: '#aaaaaa',
    stroke:     '#ffffff'
  };

  var OUT_FIELDS = [
    'objectid', 'st_name', 'cnty_name', 'censustract',
    'lilatracts_1and10', 'povertyrate', 'medianfamilyincome',
    'lapop1share', 'lahunv1share', 'urban'
  ];

  var container = document.getElementById('us-food-desert-map-container');
  if (!container) return;

  var stateAttr = container.getAttribute('data-state') || '';
  var isSpoke = stateAttr.length > 0;

  // --- Share URL helpers ---
  function parseHash() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > -1) out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return (out.lat && out.lng && out.z) ? out : null;
  }

  function pushHash(map) {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(4) +
      '&lng=' + c.lng.toFixed(4) +
      '&z='   + map.getZoom()
    );
  }

  var saved = parseHash();
  var initCenter = saved ? [parseFloat(saved.lat), parseFloat(saved.lng)] : [38.5, -96.0];
  var initZoom   = saved ? parseInt(saved.z, 10) : (isSpoke ? 7 : 4);

  // --- Map ---
  var map = L.map('us-food-desert-map-map', {
    center: initCenter,
    zoom:   initZoom,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: USDA ERS FARA 2019',
    maxZoom: 18
  }).addTo(map);

  map.on('moveend', function () { pushHash(map); });

  // --- Loading indicator ---
  var loadingEl = document.getElementById('us-food-desert-map-loading');
  var loaded = false;

  function hideLoading() {
    if (!loaded && loadingEl) {
      loadingEl.classList.add('fdm-hidden');
      loaded = true;
    }
  }

  function showError(msg) {
    if (loadingEl) {
      loadingEl.textContent = msg || 'Error loading data.';
      loadingEl.classList.remove('fdm-hidden');
    }
  }

  // --- WHERE clause ---
  var whereClause = isSpoke
    ? "st_name='" + stateAttr.replace(/'/g, "''") + "'"
    : 'lilatracts_1and10=1';

  // --- Feature layer ---
  var flayer;

  flayer = L.esri.featureLayer({
    url:       SERVICE_URL,
    where:     whereClause,
    outFields: OUT_FIELDS,

    style: function (feature) {
      var isDesert = feature.properties.lilatracts_1and10 === 1;
      return {
        fillColor:   isDesert ? COLORS.foodDesert : COLORS.nonDesert,
        fillOpacity: isDesert ? 0.75 : 0.35,
        color:       COLORS.stroke,
        weight:      0.4,
        opacity:     0.9
      };
    },

    onEachFeature: function (feature, layer) {
      var p = feature.properties;
      var isDesert = p.lilatracts_1and10 === 1;

      var incomeStr = (p.medianfamilyincome != null)
        ? '$' + Number(p.medianfamilyincome).toLocaleString()
        : 'N/A';

      var pop = (p.lapop1share != null)   ? p.lapop1share + '%'  : 'N/A';
      var veh = (p.lahunv1share != null)  ? p.lahunv1share + '%' : 'N/A';
      var pov = (p.povertyrate != null)   ? p.povertyrate + '%'  : 'N/A';
      var areaType = (p.urban === 1) ? 'Urban' : (p.urban === 0 ? 'Rural' : null);

      var rows = [
        '<tr><td>Food Desert</td><td><b style="color:' + (isDesert ? '#c0392b' : '#555') + '">' + (isDesert ? 'Yes' : 'No') + '</b></td></tr>',
        '<tr><td>County</td><td>' + (p.cnty_name || 'N/A') + '</td></tr>',
        '<tr><td>Tract</td><td>' + (p.censustract || 'N/A') + '</td></tr>',
        '<tr><td>Poverty Rate</td><td>' + pov + '</td></tr>',
        '<tr><td>Median Family Income</td><td>' + incomeStr + '</td></tr>',
        '<tr><td>Low-Access Population</td><td>' + pop + '</td></tr>',
        '<tr><td>No-Vehicle (Low-Access)</td><td>' + veh + '</td></tr>'
      ];
      if (areaType) rows.push('<tr><td>Area Type</td><td>' + areaType + '</td></tr>');

      var html =
        '<table style="font-size:0.8rem;border-collapse:collapse;min-width:200px">' +
        '<tbody>' + rows.join('') + '</tbody>' +
        '</table>';

      layer.bindPopup(html, { maxWidth: 260 });

      layer.on({
        mouseover: function (e) {
          e.target.setStyle({
            fillOpacity: 0.95,
            weight: 1.5,
            color: '#444'
          });
          if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            e.target.bringToFront();
          }
        },
        mouseout: function (e) {
          flayer.resetStyle(e.target);
        }
      });
    }
  }).addTo(map);

  flayer.once('load', function () {
    hideLoading();
    if (isSpoke && !saved) {
      var b = flayer.getBounds();
      if (b && b.isValid()) {
        map.fitBounds(b, { padding: [24, 24] });
      }
    }
  });

  flayer.on('requesterror', function () {
    hideLoading();
    showError('Could not load USDA food desert data. Please refresh the page.');
  });

  // --- Legend ---
  var legendEl = document.getElementById('us-food-desert-map-legend');
  if (legendEl) {
    var items = [
      '<div class="fdm-item"><div class="fdm-swatch" style="background:#c0392b;"></div>Food Desert Tract</div>'
    ];
    if (isSpoke) {
      items.push('<div class="fdm-item"><div class="fdm-swatch" style="background:#cccccc;"></div>Other Census Tract</div>');
    }
    legendEl.innerHTML = items.join('');
  }

  // --- Share button ---
  var shareBtn = document.getElementById('us-food-desert-map-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      pushHash(map);
      var url = window.location.href.split('#')[0] + window.location.hash;
      if (navigator && navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          shareBtn.textContent = 'Copied!';
          setTimeout(function () { shareBtn.textContent = 'Copy link'; }, 2000);
        }).catch(function () {
          shareBtn.textContent = 'Copy link';
        });
      } else {
        shareBtn.textContent = 'Copied!';
        setTimeout(function () { shareBtn.textContent = 'Copy link'; }, 2000);
      }
    });
  }

})();
