(function () {
  'use strict';

  var SLUG = 'us-state-geologic-map';
  var SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/State_Geologic_Map_Compilation_%E2%80%93_Geology/FeatureServer/0';

  // Category colors (shown in legend)
  var ROCK_COLORS = {
    'Sedimentary':    '#e9c46a',
    'Metamorphic':    '#74b3ce',
    'Plutonic':       '#f4a261',
    'Volcanic':       '#e63946',
    'Ultramafic':     '#52b788',
    'Unconsolidated': '#e9d8a6',
    'Mixed':          '#c77dff',
    'Unknown':        '#cccccc'
  };

  // Map any MAJOR1 value to one of the 8 categories above.
  // The 251 distinct values in the SGMC dataset are all specific rock type names
  // (e.g. "Granite", "Basalt", "Limestone") not the broad terms in ROCK_COLORS.
  function classifyMajor1(val) {
    if (!val || !val.trim()) return 'Unknown';
    var v = val.trim().toLowerCase();

    // Generic category terms (exact)
    var exact = {
      sedimentary: 'Sedimentary', metamorphic: 'Metamorphic',
      plutonic: 'Plutonic',       volcanic: 'Volcanic',
      ultramafic: 'Ultramafic',   unconsolidated: 'Unconsolidated',
      igneous: 'Plutonic',        mixed: 'Mixed',
      ice: 'Unconsolidated',      water: 'Unknown'
    };
    if (exact[v]) return exact[v];

    // Meta- prefix → Metamorphic (covers all ~20 metaXxx values)
    if (/^meta/.test(v)) return 'Metamorphic';

    // Hypabyssal- prefix → Plutonic (shallow intrusive)
    if (/^hypabyssal/.test(v)) return 'Plutonic';

    // Unconsolidated surficial deposits
    if (/^(sand|silt|clay|gravel|peat|boulders|coarse-detrital|fine-detrital)$/.test(v)) return 'Unconsolidated';

    // Metamorphic rock names
    if (/schist|gneiss|phyllite|phyllonite|mylonite|hornfels|granulite|granofels|amphibolite|greenstone|tectonite|cataclasite|calc-silicate|quartzite|slate|marble|migmatite/.test(v)) return 'Metamorphic';

    // Volcanic / extrusive igneous
    if (/volcanic/.test(v)) return 'Volcanic';
    if (/\b(basalt|basaltic|rhyolite|andesite|dacite|trachyte|phonolite|latite|komatiite|basanite|spilite)\b/.test(v)) return 'Volcanic';

    // Ultramafic
    if (/ultramafic|peridotite|pyroxenite|dunite|hornblendite|serpentinite|kimberlite/.test(v)) return 'Ultramafic';

    // Plutonic / intrusive igneous
    if (/granit|granodiorite|diorite|gabbro|tonalite|syenite|monzonite|norite|anorthosite|troctolite|pegmatite|aplite|alaskite|lamprophyre|charnockite|trondhjemite/.test(v)) return 'Plutonic';
    if (/plutonic|granitic|gabbroic|dioritic|syenitic|hypabyssal|felsic-hyp|mafic-hyp|intrusive/.test(v)) return 'Plutonic';

    // Sedimentary
    if (/sedimentary|clastic|carbonate/.test(v)) return 'Sedimentary';
    if (/sandstone|limestone|shale|mudstone|siltstone|conglomerate|dolostone|chalk|marl|chert|evaporite|gypsum|arkose|graywacke|arenite|coquina|novaculite|bentonite|breccia|oil-shale|anhydrite|banded-iron|claystone|argillite|melange|chemical/.test(v)) return 'Sedimentary';
    if (/\b(salt)\b/.test(v)) return 'Sedimentary';

    return 'Unknown';
  }

  function getRockColor(major1) {
    return ROCK_COLORS[classifyMajor1(major1)] || ROCK_COLORS['Unknown'];
  }

  var STATES = [
    'AL','AZ','AR','CA','CO','CT','DE','FL','GA',
    'ID','IL','IN','IA','KS','KY','LA','ME','MD','MA',
    'MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
    'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
    'TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getRockColor(major1) {
    if (!major1) return DEFAULT_COLOR;
    var key = major1.trim();
    if (ROCK_COLORS[key]) return ROCK_COLORS[key];
    var lower = key.toLowerCase();
    var keys = Object.keys(ROCK_COLORS);
    for (var i = 0; i < keys.length; i++) {
      if (lower.indexOf(keys[i].toLowerCase()) >= 0) {
        return ROCK_COLORS[keys[i]];
      }
    }
    return DEFAULT_COLOR;
  }

  function styleFeature(feature) {
    return {
      color: '#444444',
      weight: 0.5,
      opacity: 0.6,
      fillColor: getRockColor(feature.properties.MAJOR1),
      fillOpacity: 0.78
    };
  }

  function buildPopupHtml(p) {
    var rows = [
      ['State', p.STATE],
      ['SGMC Label', p.SGMC_LABEL],
      ['Original Label', p.ORIG_LABEL],
      ['Age Min', p.AGE_MIN],
      ['Age Max', p.AGE_MAX],
      ['Major Rock Type', p.MAJOR1],
      ['Minor Type', p.MINOR1],
      ['Reference', p.REFERENCE]
    ];
    var rowHtml = rows
      .filter(function (r) { return r[1]; })
      .map(function (r) {
        return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + escapeHtml(r[1]) + '</td></tr>';
      }).join('');

    var linkHtml = (p.DIGITAL_UR)
      ? '<tr><td>Source</td><td><a href="' + encodeURI(p.DIGITAL_UR) + '" target="_blank" rel="noopener">View source</a></td></tr>'
      : '';

    return '<div class="sgmc-popup">' +
      '<h4>' + escapeHtml(p.UNIT_NAME || 'Unknown Unit') + '</h4>' +
      '<table>' + rowHtml + linkHtml + '</table>' +
      '</div>';
  }

  // URL hash state
  function loadUrlState() {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var out = {};
    h.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
    return (out.lat && out.lng && out.z) ? out : null;
  }

  function saveUrlState(state) {
    var c = map.getCenter();
    var hash = '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom();
    if (state) hash += '&state=' + encodeURIComponent(state);
    history.replaceState(null, '', hash);
  }

  function zoomToState(state) {
    if (!state) return;
    var qs = 'where=' + encodeURIComponent("STATE='" + state + "'") +
      '&returnExtentOnly=true&inSR=102100&outSR=4326&f=json';
    fetch(SERVICE_URL + '/query?' + qs)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.extent) {
          var e = data.extent;
          map.fitBounds([[e.ymin, e.xmin], [e.ymax, e.xmax]], { padding: [24, 24] });
        }
      })
      .catch(function () {});
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  // --- Init ---
  var params = loadUrlState();
  var currentState = (params && params.state) ? params.state : '';

  var map = L.map(SLUG + '-map', {
    center: (params && params.lat) ? [+params.lat, +params.lng] : [38.5, -97.0],
    zoom: (params && params.z) ? +params.z : 5
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var featureLayer = L.esri.featureLayer({
    url: SERVICE_URL,
    style: styleFeature,
    onEachFeature: function (feature, layer) {
      layer.bindPopup(buildPopupHtml(feature.properties), { maxWidth: 300 });
    },
    where: currentState ? "STATE = '" + currentState + "'" : '1=1'
  }).addTo(map);

  var statusEl = document.getElementById(SLUG + '-status');

  // Loading overlay — created dynamically and appended to the map container
  var loadingEl = document.createElement('div');
  loadingEl.id = SLUG + '-loading';
  loadingEl.innerHTML = '<span class="sgmc-spinner"></span>Loading geology data...';
  loadingEl.classList.add('sgmc-hidden');
  map.getContainer().appendChild(loadingEl);

  featureLayer.on('loading', function () {
    loadingEl.classList.remove('sgmc-hidden');
    setStatus('');
  });

  featureLayer.on('load', function () {
    loadingEl.classList.add('sgmc-hidden');
    setStatus(map.getZoom() < 7 ? 'Zoom in to see more geological units' : '');
  });

  map.on('moveend', function () { saveUrlState(currentState); });
  map.on('zoomend', function () {
    setStatus(map.getZoom() < 7 ? 'Zoom in to see more geological units' : '');
    saveUrlState(currentState);
  });

  // State dropdown
  var stateSelect = document.getElementById(SLUG + '-state-select');
  if (stateSelect) {
    STATES.forEach(function (st) {
      var opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (st === currentState) opt.selected = true;
      stateSelect.appendChild(opt);
    });

    stateSelect.addEventListener('change', function () {
      currentState = this.value;
      var where = currentState ? "STATE = '" + currentState + "'" : '1=1';
      featureLayer.setWhere(where);
      saveUrlState(currentState);
      zoomToState(currentState);
    });

    // Restore zoom if state was in URL
    if (currentState) {
      zoomToState(currentState);
    }
  }

  // Legend
  var legendItems = document.getElementById(SLUG + '-legend-items');
  if (legendItems) {
    Object.keys(ROCK_COLORS).forEach(function (key) {
      var item = document.createElement('div');
      item.className = SLUG + '-legend-item';
      item.innerHTML =
        '<span class="' + SLUG + '-legend-swatch" style="background:' + ROCK_COLORS[key] + '"></span>' +
        escapeHtml(key);
      legendItems.appendChild(item);
    });
  }

})();
