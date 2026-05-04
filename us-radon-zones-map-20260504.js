(function () {
  'use strict';

  var SLUG = 'us-radon-zones-map';
  var SERVICE_URL = 'https://gispub.epa.gov/arcgis/rest/services/ORD/ROE_Radon/MapServer/0';

  var ZONE_CONFIG = {
    1: { fill: '#DC2626', border: '#991b1b', label: 'Zone 1 — High (>4 pCi/L)',     badge: 'zone-1', desc: 'Predicted average indoor radon level greater than 4 pCi/L. EPA recommends taking action to reduce radon.' },
    2: { fill: '#F59E0B', border: '#b45309', label: 'Zone 2 — Moderate (2–4 pCi/L)', badge: 'zone-2', desc: 'Predicted average indoor radon level between 2 and 4 pCi/L. Testing is strongly recommended.' },
    3: { fill: '#16A34A', border: '#166534', label: 'Zone 3 — Low (<2 pCi/L)',        badge: 'zone-3', desc: 'Predicted average indoor radon level less than 2 pCi/L. Testing is still recommended as local conditions vary.' }
  };

  // State abbreviation lookup keyed by full state name (matches EPA StateName field)
  var STATE_ABBR = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
    'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
    'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
    'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
    'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
    'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
  };

  // AARST Report Card data — scraped May 2026 — keyed by 2-letter state abbreviation
  // Source: https://aarst.org/report-card/
  // Fields: cases = radon-induced lung cancer cases/yr, med = medical costs, econ = economic costs,
  //         tests = cumulative pre-mitigation tests, pol = policy array [cert, standards, buyer, newHome, schoolTest, newSchool]
  var STATE_DATA = {
    AL:{cases:362,  med:'$73M',   econ:'$76M',   tests:12569,   pol:[0,0,0,0,0,0]},
    AK:{cases:52,   med:'$10M',   econ:'$11M',   tests:830,     pol:[0,0,1,0,0,0]},
    AZ:{cases:358,  med:'$72M',   econ:'$76M',   tests:3589,    pol:[0,0,0,0,0,0]},
    AR:{cases:364,  med:'$73M',   econ:'$77M',   tests:668,     pol:[0,0,0,0,0,0]},
    CA:{cases:1117, med:'$225M',  econ:'$236M',  tests:9415,    pol:[1,1,1,0,0,0]},
    CO:{cases:513,  med:'$103M',  econ:'$108M',  tests:168190,  pol:[1,1,1,0,1,0]},
    CT:{cases:371,  med:'$74M',   econ:'$78M',   tests:45708,   pol:[1,1,1,1,1,1]},
    DE:{cases:71,   med:'$14M',   econ:'$15M',   tests:12214,   pol:[0,0,1,0,0,0]},
    FL:{cases:1416, med:'$285M',  econ:'$299M',  tests:197072,  pol:[1,1,1,0,1,0]},
    GA:{cases:742,  med:'$149M',  econ:'$156M',  tests:30152,   pol:[0,0,0,0,0,0]},
    HI:{cases:3,    med:'$1M',    econ:'$1M',    tests:0,       pol:[0,0,0,0,0,0]},
    ID:{cases:189,  med:'$38M',   econ:'$40M',   tests:12961,   pol:[0,0,0,0,0,0]},
    IL:{cases:1476, med:'$297M',  econ:'$311M',  tests:108909,  pol:[1,1,1,1,0,0]},
    IN:{cases:966,  med:'$194M',  econ:'$204M',  tests:43148,   pol:[1,1,1,0,1,0]},
    IA:{cases:664,  med:'$133M',  econ:'$140M',  tests:95245,   pol:[1,1,1,0,1,1]},
    KS:{cases:295,  med:'$59M',   econ:'$62M',   tests:88584,   pol:[1,1,1,0,0,0]},
    KY:{cases:1033, med:'$208M',  econ:'$218M',  tests:28793,   pol:[1,1,1,0,0,0]},
    LA:{cases:120,  med:'$24M',   econ:'$25M',   tests:499,     pol:[0,0,0,0,0,0]},
    ME:{cases:310,  med:'$62M',   econ:'$65M',   tests:11825,   pol:[1,1,1,1,1,1]},
    MD:{cases:485,  med:'$98M',   econ:'$102M',  tests:47941,   pol:[0,0,1,1,0,0]},
    MA:{cases:591,  med:'$119M',  econ:'$125M',  tests:234152,  pol:[0,0,0,1,0,0]},
    MI:{cases:952,  med:'$191M',  econ:'$201M',  tests:114407,  pol:[0,0,1,1,0,0]},
    MN:{cases:638,  med:'$128M',  econ:'$135M',  tests:272872,  pol:[1,1,1,1,0,0]},
    MS:{cases:137,  med:'$27M',   econ:'$29M',   tests:0,       pol:[0,0,1,0,0,0]},
    MO:{cases:850,  med:'$171M',  econ:'$179M',  tests:36073,   pol:[0,0,0,0,0,0]},
    MT:{cases:178,  med:'$36M',   econ:'$37M',   tests:9893,    pol:[0,0,1,0,0,0]},
    NE:{cases:296,  med:'$59M',   econ:'$62M',   tests:42782,   pol:[1,1,1,1,0,1]},
    NV:{cases:139,  med:'$28M',   econ:'$29M',   tests:10930,   pol:[0,0,0,0,0,0]},
    NH:{cases:234,  med:'$47M',   econ:'$49M',   tests:15608,   pol:[1,1,1,0,0,0]},
    NJ:{cases:427,  med:'$86M',   econ:'$90M',   tests:1234094, pol:[1,1,1,1,0,1]},
    NM:{cases:116,  med:'$23M',   econ:'$24M',   tests:3721,    pol:[0,0,0,0,0,0]},
    NY:{cases:1384, med:'$278M',  econ:'$292M',  tests:74733,   pol:[0,0,1,0,1,1]},
    NC:{cases:685,  med:'$138M',  econ:'$145M',  tests:73139,   pol:[0,0,1,0,0,0]},
    ND:{cases:136,  med:'$27M',   econ:'$29M',   tests:6607,    pol:[0,0,0,0,0,0]},
    OH:{cases:2559, med:'$514M',  econ:'$540M',  tests:98840,   pol:[1,1,1,0,0,0]},
    OK:{cases:312,  med:'$63M',   econ:'$66M',   tests:814,     pol:[0,0,1,0,0,0]},
    OR:{cases:282,  med:'$57M',   econ:'$59M',   tests:63056,   pol:[0,0,1,1,1,1]},
    PA:{cases:3018, med:'$607M',  econ:'$637M',  tests:940627,  pol:[1,1,1,0,0,0]},
    RI:{cases:110,  med:'$22M',   econ:'$23M',   tests:42398,   pol:[1,1,1,0,1,1]},
    SC:{cases:274,  med:'$55M',   econ:'$58M',   tests:26481,   pol:[0,0,1,0,0,0]},
    SD:{cases:195,  med:'$39M',   econ:'$41M',   tests:6275,    pol:[0,0,1,0,0,0]},
    TN:{cases:912,  med:'$183M',  econ:'$192M',  tests:31066,   pol:[0,0,1,0,0,0]},
    TX:{cases:1512, med:'$304M',  econ:'$319M',  tests:4615,    pol:[0,0,1,0,0,0]},
    UT:{cases:146,  med:'$29M',   econ:'$31M',   tests:56280,   pol:[1,1,0,0,0,0]},
    VT:{cases:65,   med:'$13M',   econ:'$14M',   tests:11044,   pol:[0,0,0,0,1,0]},
    VA:{cases:695,  med:'$140M',  econ:'$147M',  tests:53199,   pol:[1,1,0,0,1,0]},
    WA:{cases:372,  med:'$75M',   econ:'$78M',   tests:39537,   pol:[0,0,1,1,0,0]},
    WV:{cases:328,  med:'$66M',   econ:'$69M',   tests:10061,   pol:[1,1,0,0,1,0]},
    WI:{cases:962,  med:'$193M',  econ:'$203M',  tests:127605,  pol:[0,0,1,0,0,0]},
    WY:{cases:59,   med:'$12M',   econ:'$12M',   tests:7638,    pol:[0,0,0,0,0,0]}
  };

  var POL_LABELS = ['State certification', 'Radon standards', 'Homebuyer disclosure', 'New home system req.', 'School testing req.', 'New school system req.'];

  var PUBLIC_SCHOOLS_URL  = 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Public_School_Locations_Current/FeatureServer/0';
  var PRIVATE_SCHOOLS_URL = 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Private_School_Locations_Current/FeatureServer/0';

  var appState = {
    map: null,
    countyLayer: null,
    allFeatures: [],
    stateFilter: null,
    visibleZones: { 1: true, 2: true, 3: true },
    schoolLayers: { public: null, private: null },
    schoolsVisible: { public: false, private: false },
    schoolMoveHandlers: { public: null, private: null }
  };

  function init() {
    var mapEl = document.getElementById(SLUG + '-map');
    if (!mapEl) return;
    appState.stateFilter = (mapEl.getAttribute('data-state') || '').trim() || null;

    var saved = loadHashState();
    appState.map = L.map(SLUG + '-map', {
      center: saved ? [parseFloat(saved.lat), parseFloat(saved.lng)] : [39.5, -98.35],
      zoom:   saved ? parseInt(saved.z, 10) : 4
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Radon zones: <a href="https://www.epa.gov/radon/epa-map-radon-zones">US EPA</a> | State data: <a href="https://aarst.org/report-card/">AARST</a>',
      maxZoom: 19
    }).addTo(appState.map);

    appState.map.on('moveend', updateHashState);

    buildLegend();
    setupSearch();
    setupGeolocation();
    loadCounties();
    setupSchoolToggles();
  }

  function buildWhere() {
    if (!appState.stateFilter) return '1=1';
    return "StateName='" + appState.stateFilter.replace(/'/g, "''") + "'";
  }

  function loadCounties() {
    showLoading(true);
    var where  = encodeURIComponent(buildWhere());
    var fields = encodeURIComponent('RadonZone,CountyName,StateName,NAMELSAD,CountyFIPS');
    var url = SERVICE_URL + '/query' +
      '?where=' + where +
      '&outFields=' + fields +
      '&f=geojson&outSR=4326' +
      '&maxAllowableOffset=0.01' +
      '&returnGeometry=true' +
      '&resultRecordCount=4000';

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        appState.allFeatures = data.features || [];
        renderCounties();
        updateStats();
        showLoading(false);
        if (appState.stateFilter && appState.countyLayer) {
          try { appState.map.fitBounds(appState.countyLayer.getBounds(), { padding: [20, 20] }); } catch (e) {}
        }
      })
      .catch(function (err) {
        showLoading(false);
        var el = document.getElementById(SLUG + '-loading');
        if (el) { el.style.display = 'flex'; el.textContent = 'Failed to load data. Please refresh.'; }
        console.error('[radon-map]', err);
      });
  }

  function renderCounties() {
    if (appState.countyLayer) { appState.map.removeLayer(appState.countyLayer); appState.countyLayer = null; }

    var visible = appState.allFeatures.filter(function (f) {
      return !!appState.visibleZones[parseInt(f.properties.RadonZone, 10)];
    });

    appState.countyLayer = L.geoJSON({ type: 'FeatureCollection', features: visible }, {
      style: function (feature) {
        var z   = parseInt(feature.properties.RadonZone, 10);
        var cfg = ZONE_CONFIG[z] || ZONE_CONFIG[3];
        return { fillColor: cfg.fill, fillOpacity: 0.65, color: cfg.border, weight: 0.6 };
      },
      onEachFeature: function (feature, layer) {
        var p   = feature.properties;
        var z   = parseInt(p.RadonZone, 10);
        var cfg = ZONE_CONFIG[z] || ZONE_CONFIG[3];
        var countyLabel = escHtml(p.NAMELSAD || p.CountyName || 'County');
        var stateName   = escHtml(p.StateName || '');
        var abbr        = STATE_ABBR[p.StateName] || '';
        var sd          = abbr ? STATE_DATA[abbr] : null;

        var html =
          '<div class="' + SLUG + '-popup">' +
            '<div class="' + SLUG + '-popup-title">' + countyLabel + ', ' + stateName + '</div>' +
            '<div class="' + SLUG + '-popup-zone ' + cfg.badge + '">' + cfg.label + '</div>' +
            '<div class="' + SLUG + '-popup-desc">' + cfg.desc + '</div>';

        if (sd) {
          html +=
            '<div class="' + SLUG + '-popup-divider"></div>' +
            '<div class="' + SLUG + '-popup-state-title">' + stateName + ' — State Overview</div>' +
            '<div class="' + SLUG + '-popup-stats-grid">' +
              '<div class="' + SLUG + '-popup-stat"><span class="' + SLUG + '-popup-stat-val">' + sd.cases.toLocaleString() + '</span><span class="' + SLUG + '-popup-stat-lbl">Radon lung cancer deaths/yr</span></div>' +
              '<div class="' + SLUG + '-popup-stat"><span class="' + SLUG + '-popup-stat-val">' + fmtTests(sd.tests) + '</span><span class="' + SLUG + '-popup-stat-lbl">Homes tested</span></div>' +
              '<div class="' + SLUG + '-popup-stat"><span class="' + SLUG + '-popup-stat-val">' + sd.med + '</span><span class="' + SLUG + '-popup-stat-lbl">Medical costs/yr</span></div>' +
            '</div>' +
            '<div class="' + SLUG + '-popup-policy-title">State Policy</div>' +
            '<div class="' + SLUG + '-popup-policy">' + buildPolicyHtml(sd.pol) + '</div>';
        }

        html += '</div>';
        layer.bindPopup(html, { maxWidth: 310, maxHeight: 420 });

        layer.on('mouseover', function () { this.setStyle({ weight: 2, fillOpacity: 0.85 }); this.bringToFront(); });
        layer.on('mouseout',  function () { this.setStyle({ weight: 0.6, fillOpacity: 0.65 }); });
      }
    }).addTo(appState.map);
  }

  function buildPolicyHtml(pol) {
    var html = '';
    for (var i = 0; i < POL_LABELS.length; i++) {
      var yes = !!pol[i];
      html += '<div class="' + SLUG + '-pol-item ' + (yes ? 'pol-yes' : 'pol-no') + '">' +
        (yes ? '&#10003;' : '&#10007;') + ' ' + POL_LABELS[i] + '</div>';
    }
    return html;
  }

  function fmtTests(n) {
    if (!n) return 'No data';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return Math.round(n / 1000) + 'K';
    return n.toString();
  }

  function updateStats() {
    var counts = { 1: 0, 2: 0, 3: 0 };
    appState.allFeatures.forEach(function (f) {
      var z = parseInt(f.properties.RadonZone, 10);
      if (counts[z] !== undefined) counts[z]++;
    });
    setCard('total', appState.allFeatures.length.toLocaleString(), 'Counties Shown');
    setCard('z1', counts[1].toLocaleString(), 'Zone 1 — High');
    setCard('z2', counts[2].toLocaleString(), 'Zone 2 — Moderate');
    setCard('z3', counts[3].toLocaleString(), 'Zone 3 — Low');
  }

  function setCard(id, val, label) {
    var el = document.getElementById(SLUG + '-stat-' + id);
    if (!el) return;
    el.innerHTML = '<strong>' + val + '</strong><span>' + label + '</span>';
  }

  function buildLegend() {
    var container = document.getElementById(SLUG + '-legend');
    if (!container) return;
    var html = '<div class="' + SLUG + '-legend-title">EPA Radon Zone</div>';
    [1, 2, 3].forEach(function (z) {
      var cfg = ZONE_CONFIG[z];
      html +=
        '<label class="' + SLUG + '-legend-row">' +
          '<input type="checkbox" data-zone="' + z + '" checked>' +
          '<span class="' + SLUG + '-swatch" style="background:' + cfg.fill + ';border-color:' + cfg.border + '"></span>' +
          '<span>' + cfg.label + '</span>' +
        '</label>';
    });
    html += '<div class="' + SLUG + '-legend-sep"></div>';
    html += '<div class="' + SLUG + '-legend-title">Schools (toggle to load)</div>';
    html +=
      '<label class="' + SLUG + '-legend-row">' +
        '<input type="checkbox" id="' + SLUG + '-toggle-public">' +
        '<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="5.5" fill="#fff" stroke="#1d4ed8" stroke-width="2.5"/></svg>' +
        '<span>Public schools</span>' +
      '</label>';
    html +=
      '<label class="' + SLUG + '-legend-row">' +
        '<input type="checkbox" id="' + SLUG + '-toggle-private">' +
        '<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><rect x="3.5" y="3.5" width="7" height="7" fill="#fff" stroke="#9333ea" stroke-width="2.5" transform="rotate(45 7 7)"/></svg>' +
        '<span>Private schools</span>' +
      '</label>';

    container.innerHTML = html;
    container.querySelectorAll('input[data-zone]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        appState.visibleZones[parseInt(this.dataset.zone, 10)] = this.checked;
        renderCounties();
        updateStats();
      });
    });
  }

  function setupSearch() {
    var btn   = document.getElementById(SLUG + '-search-btn');
    var input = document.getElementById(SLUG + '-address');
    if (!btn || !input) return;
    function doSearch() {
      var q = input.value.trim();
      if (!q) return;
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.length) { alert('Location not found. Try a city or county name.'); return; }
          appState.map.setView([parseFloat(res[0].lat), parseFloat(res[0].lon)], 10);
        })
        .catch(function () { alert('Search unavailable. Please try again.'); });
    }
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
  }

  function setupGeolocation() {
    var btn = document.getElementById(SLUG + '-locate-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!navigator.geolocation) { alert('Geolocation not supported by your browser.'); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { appState.map.setView([pos.coords.latitude, pos.coords.longitude], 10); },
        function ()    { alert('Unable to determine your location.'); }
      );
    });
  }

  function setupSchoolToggles() {
    var pubCb  = document.getElementById(SLUG + '-toggle-public');
    var privCb = document.getElementById(SLUG + '-toggle-private');
    if (pubCb)  pubCb.addEventListener('change',  function () { toggleSchools('public',  this.checked); });
    if (privCb) privCb.addEventListener('change', function () { toggleSchools('private', this.checked); });
  }

  function toggleSchools(type, show) {
    appState.schoolsVisible[type] = show;
    if (!show) {
      if (appState.schoolLayers[type]) {
        appState.map.removeLayer(appState.schoolLayers[type]);
      }
      appState.map.off('moveend', appState.schoolMoveHandlers[type]);
      appState.schoolLayers[type] = null;
      return;
    }
    var cluster = L.markerClusterGroup({
      chunkedLoading: true,
      disableClusteringAtZoom: 8,
      maxClusterRadius: 50,
      showCoverageOnHover: false
    });
    cluster.addTo(appState.map);
    appState.schoolLayers[type] = cluster;

    var abbr = appState.stateFilter ? (STATE_ABBR[appState.stateFilter] || appState.stateFilter) : null;

    if (abbr) {
      fetchSchoolsWhere(type, "STATE='" + abbr + "'", 12000, cluster);
    } else {
      fetchSchoolsByViewport(type, cluster);
      appState.schoolMoveHandlers[type] = function () {
        if (!appState.schoolsVisible[type]) return;
        cluster.clearLayers();
        fetchSchoolsByViewport(type, cluster);
      };
      appState.map.on('moveend', appState.schoolMoveHandlers[type]);
    }
  }

  function fetchSchoolsByViewport(type, cluster) {
    var b   = appState.map.getBounds();
    var env = JSON.stringify({
      xmin: b.getWest(), ymin: b.getSouth(),
      xmax: b.getEast(), ymax: b.getNorth(),
      spatialReference: { wkid: 4326 }
    });
    var params = [
      'where=1%3D1',
      'geometry=' + encodeURIComponent(env),
      'geometryType=esriGeometryEnvelope',
      'inSR=4326',
      'spatialRel=esriSpatialRelIntersects',
      'outFields=' + encodeURIComponent('NAME,CITY,STATE,NMCNTY,NMCBSA'),
      'outSR=4326',
      'returnGeometry=true',
      'resultRecordCount=2000',
      'f=geojson'
    ].join('&');
    var url = (type === 'public' ? PUBLIC_SCHOOLS_URL : PRIVATE_SCHOOLS_URL) + '/query?' + params;
    fetch(url).then(function (r) { return r.json(); })
      .then(function (data) { addSchoolFeatures(data.features || [], type, cluster); })
      .catch(function (e) { console.error('[radon-map] school viewport load:', e); });
  }

  function fetchSchoolsWhere(type, where, limit, cluster) {
    var params = [
      'where=' + encodeURIComponent(where),
      'outFields=' + encodeURIComponent('NAME,CITY,STATE,NMCNTY,NMCBSA'),
      'outSR=4326',
      'returnGeometry=true',
      'resultRecordCount=' + limit,
      'f=geojson'
    ].join('&');
    var url = (type === 'public' ? PUBLIC_SCHOOLS_URL : PRIVATE_SCHOOLS_URL) + '/query?' + params;
    fetch(url).then(function (r) { return r.json(); })
      .then(function (data) { addSchoolFeatures(data.features || [], type, cluster); })
      .catch(function (e) { console.error('[radon-map] school state load:', e); });
  }

  function makeSchoolIcon(isPublic) {
    var stroke = isPublic ? '#1d4ed8' : '#9333ea';
    var shape  = isPublic
      ? '<circle cx="7" cy="7" r="5.5" fill="#fff" stroke="' + stroke + '" stroke-width="2.5"/>'
      : '<rect x="3.5" y="3.5" width="7" height="7" fill="#fff" stroke="' + stroke + '" stroke-width="2.5" transform="rotate(45 7 7)"/>';
    return L.divIcon({
      html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">' + shape + '</svg>',
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8]
    });
  }

  function addSchoolFeatures(features, type, cluster) {
    var isPublic = (type === 'public');
    var icon     = makeSchoolIcon(isPublic);
    var label    = isPublic ? 'Public school' : 'Private school';

    features.forEach(function (f) {
      if (!f.geometry || !f.geometry.coordinates) return;
      var lon = f.geometry.coordinates[0];
      var lat = f.geometry.coordinates[1];
      var p   = f.properties || {};
      var m   = L.marker([lat, lon], { icon: icon });
      m.bindPopup(
        '<div class="' + SLUG + '-popup">' +
          '<div class="' + SLUG + '-popup-title">' + escHtml(p.NAME || 'School') + '</div>' +
          '<div class="' + SLUG + '-popup-zone ' + (isPublic ? 'zone-pub' : 'zone-priv') + '">' + label + '</div>' +
          '<div class="' + SLUG + '-popup-desc">' +
            escHtml(p.CITY || '') + (p.STATE ? ', ' + escHtml(p.STATE) : '') + '<br>' +
            (p.NMCNTY ? 'County: ' + escHtml(p.NMCNTY) + '<br>' : '') +
            (p.NMCBSA && p.NMCBSA !== 'Outside CBSA' ? 'Metro: ' + escHtml(p.NMCBSA) : '') +
          '</div>' +
        '</div>',
        { maxWidth: 260 }
      );
      cluster.addLayer(m);
    });
  }

  function showLoading(show) {
    var el = document.getElementById(SLUG + '-loading');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    if (show) el.textContent = 'Loading radon zone data...';
  }

  function updateHashState() {
    var c = appState.map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + appState.map.getZoom());
  }

  function loadHashState() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return (out.lat && out.lng && out.z) ? out : null;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
