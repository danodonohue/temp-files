(function () {
  'use strict';

  var CONFIG = {
    mapId: 'us-industrial-stormwater-map-map',
    containerId: 'us-industrial-stormwater-map-container',
    serviceUrl: 'https://echogeo.epa.gov/arcgis/rest/services/ECHO/FacilityFinderStateStormWater/MapServer/0',
    initialView: [39.5, -98.35],
    initialZoom: 4
  };

  var SIC_LABELS = {
    '5015': 'Motor Vehicle Parts (Used) / Auto Dismantlers',
    '5093': 'Scrap and Waste Materials',
    '1442': 'Construction Sand and Gravel',
    '3273': 'Ready-Mixed Concrete',
    '4212': 'Local Trucking',
    '4213': 'Trucking, Long Distance',
    '4225': 'General Warehousing and Storage',
    '4953': 'Refuse Systems',
    '1440': 'Sand, Gravel, Clay and Ceramic Minerals',
    '2951': 'Asphalt Paving Mixtures',
    '3089': 'Plastics Products',
    '4952': 'Sewerage Systems',
    '4581': 'Airports and Flying Fields',
    '4215': 'Courier Services',
    '2084': 'Wines, Brandy and Spirits',
    '3714': 'Motor Vehicle Parts and Accessories',
    '2421': 'Sawmills and Planing Mills',
    '3599': 'Industrial and Commercial Machinery',
    '3499': 'Fabricated Metal Products',
    '5171': 'Petroleum Bulk Stations and Terminals',
    '4231': 'Trucking Terminal Facilities',
    '4151': 'School Buses',
    '3471': 'Plating and Polishing',
    '3272': 'Concrete Products',
    '1420': 'Crushed and Broken Stone',
    '1429': 'Crushed and Broken Stone',
    '2434': 'Wood Kitchen Cabinets',
    '2493': 'Reconstituted Wood Products',
    '3441': 'Fabricated Structural Metal',
    '5211': 'Lumber and Building Materials',
    '5311': 'Department Stores',
    '7538': 'General Automotive Repair',
    '4011': 'Railroads, Line-Haul',
    '4731': 'Freight Transportation Arrangement',
    '4911': 'Electric Services',
    '2026': 'Fluid Milk',
    '2099': 'Food Preparations',
    '3334': 'Primary Aluminum',
    '5411': 'Grocery Stores'
  };

  var STATE_FULL_NAMES = {
    'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia','PR':'Puerto Rico'
  };

  var STATE_NAME_TO_CODE = {};
  Object.keys(STATE_FULL_NAMES).forEach(function (code) {
    STATE_NAME_TO_CODE[STATE_FULL_NAMES[code].toUpperCase()] = code;
  });

  function resolveStateCode(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (!s) return null;
    var upper = s.toUpperCase();
    if (s.length === 2 && STATE_FULL_NAMES[upper]) return upper;
    if (STATE_NAME_TO_CODE[upper]) return STATE_NAME_TO_CODE[upper];
    return null;
  }

  var containerEl = document.getElementById(CONFIG.containerId);
  var stateRaw = containerEl ? (containerEl.getAttribute('data-state') || '') : '';
  var STATE_CODE = resolveStateCode(stateRaw);
  var STATE_NAME = STATE_CODE ? STATE_FULL_NAMES[STATE_CODE] : null;
  var BASE_WHERE = STATE_CODE ? "STATE='" + STATE_CODE + "'" : '1=1';

  var map = L.map(CONFIG.mapId, {
    center: CONFIG.initialView,
    zoom: CONFIG.initialZoom,
    minZoom: 3,
    worldCopyJump: false
  });

  var streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap | Data: <a href="https://echo.epa.gov/" target="_blank" rel="noopener">EPA ECHO</a>',
    maxZoom: 19
  });

  var satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics | Data: <a href="https://echo.epa.gov/" target="_blank" rel="noopener">EPA ECHO</a>',
      maxZoom: 19
    }
  );

  var labelsOverlay = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, opacity: 0.9 }
  );

  streetLayer.addTo(map);

  L.control.layers(
    {
      'Street': streetLayer,
      'Satellite': satelliteLayer
    },
    {
      'Place labels (satellite)': labelsOverlay
    },
    { position: 'topright', collapsed: false }
  ).addTo(map);

  map.on('baselayerchange', function (e) {
    if (e.name === 'Satellite') {
      if (!map.hasLayer(labelsOverlay)) labelsOverlay.addTo(map);
    } else {
      if (map.hasLayer(labelsOverlay)) map.removeLayer(labelsOverlay);
    }
  });

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function formatSic(raw) {
    if (!raw) return '';
    var firstCode = String(raw).trim().split(/[\s,;]+/)[0];
    var label = SIC_LABELS[firstCode];
    if (label) return firstCode + ' &mdash; ' + label;
    return firstCode;
  }

  function buildPopup(props) {
    var name = props.BUSINESS_NAME || 'Unnamed facility';
    var addr = props.ADDRESS ? escapeHtml(props.ADDRESS) : '';
    var city = props.CITY ? escapeHtml(props.CITY) : '';
    var state = props.STATE ? escapeHtml(props.STATE) : '';
    var zip = props.ZIP ? escapeHtml(props.ZIP) : '';
    var sic = props.SIC ? formatSic(props.SIC) : '';
    var stateName = state && STATE_FULL_NAMES[state] ? STATE_FULL_NAMES[state] : state;

    var html = '<div class="usism-popup-title">' + escapeHtml(name) + '</div>';
    if (addr) {
      html += '<div class="usism-popup-row"><span class="usism-popup-label">Address</span> ' + addr + '</div>';
    }
    var locLine = [city, stateName, zip].filter(Boolean).join(', ');
    if (locLine) {
      html += '<div class="usism-popup-row"><span class="usism-popup-label">Location</span> ' + locLine + '</div>';
    }
    if (sic) {
      html += '<div class="usism-popup-row"><span class="usism-popup-label">SIC</span> ' + sic + '</div>';
    }
    html += '<div class="usism-popup-row"><span class="usism-popup-label">Source</span> EPA Industrial Stormwater Permit (MSGP / state)</div>';
    return html;
  }

  var clusterLayer = L.esri.Cluster.featureLayer({
    url: CONFIG.serviceUrl,
    where: BASE_WHERE,
    pointToLayer: function (geojson, latlng) {
      return L.circleMarker(latlng, {
        radius: 5,
        color: '#01579b',
        weight: 1,
        fillColor: '#0277bd',
        fillOpacity: 0.85
      });
    },
    polygonOptions: {
      color: '#0277bd',
      weight: 1.5,
      fillOpacity: 0.15
    },
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    chunkedLoading: true,
    maxClusterRadius: 60
  }).addTo(map);

  clusterLayer.bindPopup(function (layer) {
    return buildPopup(layer.feature.properties);
  });

  var statTotal = document.getElementById('usism-stat-total');
  var statShown = document.getElementById('usism-stat-shown');
  var statStates = document.getElementById('usism-stat-states');

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function loadHeadlineStats() {
    L.esri.query({ url: CONFIG.serviceUrl })
      .where(BASE_WHERE)
      .count(function (err, count) {
        if (err) { setText(statTotal, '-'); return; }
        setText(statTotal, (count || 0).toLocaleString());
      });

    if (STATE_CODE) {
      setText(statStates, STATE_NAME || STATE_CODE);
      var statStatesLabel = statStates ? statStates.parentElement.querySelector('.usism-stat-label') : null;
      if (statStatesLabel) statStatesLabel.textContent = 'State';
    }
  }
  loadHeadlineStats();

  function fitToState() {
    if (!STATE_CODE) return;
    L.esri.query({ url: CONFIG.serviceUrl })
      .where(BASE_WHERE)
      .bounds(function (err, bounds) {
        if (err || !bounds || !bounds.isValid || !bounds.isValid()) return;
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 });
      });
  }
  fitToState();

  function updateShownCount() {
    if (!statShown) return;
    setText(statShown, 'Loading...');
    clusterLayer.query()
      .within(map.getBounds())
      .count(function (err, count) {
        if (err) { setText(statShown, '-'); return; }
        setText(statShown, (count || 0).toLocaleString());
      });
  }
  map.on('moveend', updateShownCount);
  clusterLayer.on('load', updateShownCount);

  var searchInput = document.getElementById('usism-search');
  var searchBtn = document.getElementById('usism-search-btn');
  var clearBtn = document.getElementById('usism-clear-btn');
  var locateBtn = document.getElementById('usism-locate-btn');

  function buildWhere(searchText) {
    var raw = (searchText || '').trim();
    if (!raw) return BASE_WHERE;
    var q = raw.replace(/'/g, "''").toUpperCase();
    var search =
      "(UPPER(BUSINESS_NAME) LIKE '%" + q + "%'" +
      " OR UPPER(SECONDARY_NAME) LIKE '%" + q + "%'" +
      " OR UPPER(CITY) LIKE '%" + q + "%'" +
      " OR ZIP LIKE '%" + q + "%'" +
      " OR UPPER(ADDRESS) LIKE '%" + q + "%')";
    if (BASE_WHERE === '1=1') return search;
    return BASE_WHERE + ' AND ' + search;
  }

  function applySearch() {
    var raw = (searchInput.value || '').trim();
    var where = buildWhere(raw);
    clusterLayer.setWhere(where);
    if (!raw) return;
    clusterLayer.query()
      .where(where)
      .bounds(function (err, bounds) {
        if (!err && bounds && bounds.isValid && bounds.isValid()) {
          map.fitBounds(bounds, { maxZoom: 13, padding: [40, 40] });
        }
      });
  }

  if (searchBtn) searchBtn.addEventListener('click', applySearch);
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (searchInput) searchInput.value = '';
    clusterLayer.setWhere(BASE_WHERE);
    if (STATE_CODE) {
      fitToState();
    } else {
      map.setView(CONFIG.initialView, CONFIG.initialZoom);
    }
  });
  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySearch();
      }
    });
  }

  var locateMarker = null;
  if (locateBtn) {
    locateBtn.addEventListener('click', function () {
      map.locate({ setView: true, maxZoom: 12, enableHighAccuracy: false });
    });
    map.on('locationfound', function (e) {
      if (locateMarker) map.removeLayer(locateMarker);
      locateMarker = L.circleMarker(e.latlng, {
        radius: 8,
        color: '#d32f2f',
        weight: 2,
        fillColor: '#ef5350',
        fillOpacity: 0.6
      }).addTo(map).bindPopup('Your location').openPopup();
    });
    map.on('locationerror', function () {
      alert('Could not determine your location. Please allow location access in your browser.');
    });
  }

  function updateShareUrl() {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom();
    history.replaceState(null, '', hash);
  }
  map.on('moveend', updateShareUrl);

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var out = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx > 0) out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    var lat = parseFloat(out.lat);
    var lng = parseFloat(out.lng);
    var z = parseInt(out.z, 10);
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(z)) {
      map.setView([lat, lng], z);
    }
  }
  loadStateFromUrl();
})();
