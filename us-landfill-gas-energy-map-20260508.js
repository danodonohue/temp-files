(function () {
  'use strict';

  var SLUG = 'us-landfill-gas-energy-map';

  var STATE_ABBR = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
    'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
    'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
    'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
    'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'District of Columbia':'DC'
  };

  var STATES_WITH_DATA = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Idaho','Illinois','Indiana','Iowa','Kansas',
    'Kentucky','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
    'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico',
    'New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania',
    'Rhode Island','South Carolina','Tennessee','Texas','Utah','Vermont','Virginia',
    'Washington','West Virginia','Wisconsin'
  ];

  var LAYER_DEFS = [
    { url:'https://geodata.epa.gov/arcgis/rest/services/AgSTAR/EPA_AgSTAR_LMOP/MapServer/1', label:'Electricity', color:'#1565C0' },
    { url:'https://geodata.epa.gov/arcgis/rest/services/AgSTAR/EPA_AgSTAR_LMOP/MapServer/0', label:'Direct Use', color:'#2E7D32' },
    { url:'https://geodata.epa.gov/arcgis/rest/services/AgSTAR/EPA_AgSTAR_LMOP/MapServer/2', label:'Renewable Natural Gas', color:'#E65100' }
  ];

  var container = document.getElementById(SLUG + '-container');
  var rawState  = container ? (container.getAttribute('data-state') || '').trim() : '';
  var stateAbbr = rawState ? (STATE_ABBR[rawState] || rawState) : null;

  var hashParams = parseHash();
  var initLat  = hashParams.lat  ? parseFloat(hashParams.lat)  : (stateAbbr ? 39 : 38.0);
  var initLng  = hashParams.lng  ? parseFloat(hashParams.lng)  : (stateAbbr ? -97 : -96.0);
  var initZoom = hashParams.z    ? parseInt(hashParams.z, 10)  : (stateAbbr ? 6   : 4);

  var map = L.map(SLUG + '-map', {
    center: [initLat, initLng],
    zoom:   initZoom,
    scrollWheelZoom: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Source: EPA LMOP',
    maxZoom: 18
  }).addTo(map);

  map.on('moveend', updateHash);

  var markerLayer = L.layerGroup().addTo(map);

  function loadMarkers(filterAbbr, filterLabel, forceFit) {
    markerLayer.clearLayers();
    var totalLoaded  = 0;
    var layersDone   = 0;
    var layerCounts  = { 'Electricity': 0, 'Direct Use': 0, 'Renewable Natural Gas': 0 };
    var bounds       = L.latLngBounds();
    var boundsHasPoints = false;

    var statsEl = document.getElementById(SLUG + '-stats');
    if (statsEl) statsEl.innerHTML = 'Loading&hellip;';

    LAYER_DEFS.forEach(function (def) {
      var qry = L.esri.query({ url: def.url });
      qry.where(filterAbbr ? "State = '" + filterAbbr.replace(/'/g, "''") + "'" : '1=1');
      qry.fields(['*']).run(function (err, fc) {
        layersDone++;
        if (!err && fc && fc.features) {
          fc.features.forEach(function (f) {
            if (!f.geometry || !f.geometry.coordinates) return;
            var lng = f.geometry.coordinates[0];
            var lat = f.geometry.coordinates[1];
            if (!lat || !lng) return;

            var p = f.properties;
            var ll = L.latLng(lat, lng);
            bounds.extend(ll);
            boundsHasPoints = true;

            var marker = L.circleMarker(ll, {
              radius:      7,
              fillColor:   def.color,
              color:       '#fff',
              weight:      1.5,
              opacity:     1,
              fillOpacity: 0.88
            });

            var waste  = p.Waste_Place    ? formatNum(Math.round(p.Waste_Place)) + ' tons' : 'N/A';
            var opened = p.Year_Landfill_Opened || '?';
            var closed = p.Landfill_Closure_Yr  ? ' – ' + p.Landfill_Closure_Yr : '';
            var lfgCol = p.LFG_Collected  ? p.LFG_Collected + ' MMSCFD' : 'N/A';

            var html =
              '<div class="' + SLUG + '-popup">' +
              '<strong>' + esc(p.Landfill_Owner_Org || 'Unknown facility') + '</strong><br>' +
              esc(p.City || '') + (p.County ? ', ' + esc(p.County) + ' Co.' : '') + ', ' + esc(p.State || '') + '<br>' +
              '<span class="' + SLUG + '-type-badge" style="background:' + def.color + '">' + def.label + '</span><br>' +
              '<table class="' + SLUG + '-pop-tbl">' +
              '<tr><td>Project status</td><td>' + esc(p.Current_Proj_Status || 'N/A') + '</td></tr>' +
              '<tr><td>Landfill</td><td>' + esc(p.Current_Landfill_Stat || 'N/A') + ' (' + opened + closed + ')</td></tr>' +
              '<tr><td>Ownership</td><td>' + esc(p.Ownership_Type || 'N/A') + '</td></tr>' +
              '<tr><td>Waste in place</td><td>' + waste + '</td></tr>' +
              '<tr><td>LFG collected</td><td>' + lfgCol + '</td></tr>' +
              '</table>' +
              '</div>';

            marker.bindPopup(html, { maxWidth: 280 });
            marker.addTo(markerLayer);
            totalLoaded++;
            layerCounts[def.label]++;
          });
        }
        if (layersDone === LAYER_DEFS.length) {
          updateStats(totalLoaded, layerCounts, filterLabel);
          updateLegendCounts(layerCounts);
          if (boundsHasPoints && (forceFit || !hashParams.lat)) {
            map.fitBounds(bounds.pad(filterAbbr ? 0.1 : 0.05), { maxZoom: filterAbbr ? 9 : 8 });
          }
        }
      });
    });
  }

  loadMarkers(stateAbbr, rawState || null);

  function updateStats(total, counts, filterLabel) {
    var el = document.getElementById(SLUG + '-stats');
    if (!el) return;
    el.innerHTML =
      '<span>' + (filterLabel ? '<strong>' + filterLabel + '</strong> &mdash; ' : '') +
      '<strong>' + total + '</strong> LFG projects</span>' +
      '<span><strong>' + counts['Electricity'] + '</strong> electricity</span>' +
      '<span><strong>' + counts['Direct Use'] + '</strong> direct use</span>' +
      '<span><strong>' + counts['Renewable Natural Gas'] + '</strong> RNG</span>';
  }

  function updateLegendCounts(counts) {
    LAYER_DEFS.forEach(function (def) {
      var el = document.getElementById(SLUG + '-lcount-' + def.label.replace(/\s+/g,'-'));
      if (el) el.textContent = '(' + counts[def.label] + ')';
    });
  }

  function buildUI() {
    var wrap = document.getElementById(SLUG + '-container');
    if (!wrap) return;

    var statsBar = document.createElement('div');
    statsBar.id = SLUG + '-stats';
    statsBar.className = SLUG + '-stats';
    statsBar.innerHTML = 'Loading LFG project data&hellip;';
    wrap.insertBefore(statsBar, wrap.firstChild);

    var legend = document.createElement('div');
    legend.className = SLUG + '-legend';
    var legendHtml = '<strong>Project Type</strong>';
    LAYER_DEFS.forEach(function (def) {
      var key = def.label.replace(/\s+/g, '-');
      legendHtml +=
        '<div class="' + SLUG + '-leg-row">' +
        '<span class="' + SLUG + '-leg-dot" style="background:' + def.color + '"></span>' +
        def.label +
        ' <span id="' + SLUG + '-lcount-' + key + '" class="' + SLUG + '-leg-cnt"></span>' +
        '</div>';
    });
    legend.innerHTML = legendHtml;
    document.getElementById(SLUG + '-map').appendChild(legend);

    buildStateFilter(wrap);
    buildSearch(wrap);
    buildGeoBtn();
  }

  function buildStateFilter(wrap) {
    if (stateAbbr) return;
    var bar = document.createElement('div');
    bar.className = SLUG + '-filter-bar';
    var opts = '<option value="">All states (national)</option>';
    STATES_WITH_DATA.forEach(function (s) {
      opts += '<option value="' + s + '">' + s + '</option>';
    });
    bar.innerHTML = '<label for="' + SLUG + '-state-select">Filter by state:</label>' +
      '<select id="' + SLUG + '-state-select">' + opts + '</select>';
    wrap.insertBefore(bar, document.getElementById(SLUG + '-map'));

    document.getElementById(SLUG + '-state-select').addEventListener('change', function () {
      var sel  = this.value;
      var abbr = sel ? (STATE_ABBR[sel] || sel) : null;
      loadMarkers(abbr, sel || null, true);
    });
  }

  function buildSearch(wrap) {
    var bar = document.createElement('div');
    bar.className = SLUG + '-search-bar';
    bar.innerHTML =
      '<input id="' + SLUG + '-search-input" type="text" placeholder="Search address or place&hellip;" autocomplete="off" />' +
      '<button id="' + SLUG + '-search-btn" aria-label="Search">&#128269;</button>';
    wrap.insertBefore(bar, document.getElementById(SLUG + '-map'));

    var searchMarker = null;
    document.getElementById(SLUG + '-search-btn').addEventListener('click', doSearch);
    document.getElementById(SLUG + '-search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });

    function doSearch() {
      var q = document.getElementById(SLUG + '-search-input').value.trim();
      if (!q) return;
      fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=1', {
        headers: { 'Accept-Language': 'en' }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.length) { alert('Location not found.'); return; }
          var lat = parseFloat(data[0].lat);
          var lon = parseFloat(data[0].lon);
          if (searchMarker) map.removeLayer(searchMarker);
          searchMarker = L.marker([lat, lon]).addTo(map).bindPopup(data[0].display_name).openPopup();
          map.setView([lat, lon], 11);
        })
        .catch(function () { alert('Search failed. Check your connection.'); });
    }
  }

  function buildGeoBtn() {
    var btn = L.control({ position: 'topleft' });
    btn.onAdd = function () {
      var d = L.DomUtil.create('div', SLUG + '-geo-btn leaflet-bar');
      d.innerHTML = '<a href="#" title="My location" role="button">&#9654;</a>';
      d.style.fontSize = '12px';
      d.firstChild.addEventListener('click', function (e) {
        e.preventDefault();
        if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
        navigator.geolocation.getCurrentPosition(function (pos) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 10);
        }, function () { alert('Could not get your location.'); });
      });
      return d;
    };
    btn.addTo(map);
  }

  function updateHash() {
    var c = map.getCenter();
    var h = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom();
    history.replaceState(null, '', h);
  }

  function parseHash() {
    var h = window.location.hash.slice(1);
    if (!h) return {};
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return out;
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatNum(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  buildUI();
})();
