(function () {
  'use strict';

  var CONFIG = {
    service: 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_National_Bridge_Inventory/FeatureServer/0',
    mapId: 'us-bridges-map',
    initialView: [39.5, -98.35],
    initialZoom: 4,
    nominatim: 'https://nominatim.openstreetmap.org/search'
  };

  var CONDITION_COLOR = { G: '#16A34A', F: '#F59E0B', P: '#DC2626' };
  var CONDITION_LABEL = { G: 'Good',    F: 'Fair',    P: 'Poor'    };

  var STRUCT_KIND = {
    '1':'Concrete','2':'Concrete Continuous','3':'Steel',
    '4':'Steel Continuous','5':'Prestressed Concrete',
    '6':'Prestressed Concrete Cont.','7':'Wood / Timber',
    '8':'Masonry','9':'Aluminum / Iron / Cast Iron','0':'Other'
  };

  var OWNER_CODES = {
    '01':'State Highway Agency','02':'County Highway Agency',
    '03':'Town/Township Highway Agency','04':'City/Municipal Agency',
    '11':'State Park/Forest Agency','12':'Local Park/Forest Agency',
    '21':'Other State Agency','25':'Other Local Agency',
    '26':'Private','27':'Railroad','31':'State Toll Authority',
    '32':'Local Toll Authority','40':'Other Federal Agency',
    '60':'Bureau of Indian Affairs','61':'Bureau of Fish & Wildlife',
    '62':'US Forest Service','63':'National Park Service',
    '64':'Tennessee Valley Authority','66':'Bureau of Land Management',
    '67':'Bureau of Reclamation','68':'Corps of Engineers (Civil)',
    '69':'Corps of Engineers (Military)','80':'Unknown'
  };

  var RATING_LABELS = {
    '9':'Excellent (9)','8':'Very Good (8)','7':'Good (7)',
    '6':'Satisfactory (6)','5':'Fair (5)','4':'Poor (4)',
    '3':'Serious (3)','2':'Critical (2)','1':'Imminent Failure (1)',
    '0':'Failed (0)','N':'N/A'
  };

  var STATE_FIPS = {
    'Alabama':'01','Alaska':'02','Arizona':'04','Arkansas':'05',
    'California':'06','Colorado':'08','Connecticut':'09','Delaware':'10',
    'District of Columbia':'11','Florida':'12','Georgia':'13','Hawaii':'15',
    'Idaho':'16','Illinois':'17','Indiana':'18','Iowa':'19',
    'Kansas':'20','Kentucky':'21','Louisiana':'22','Maine':'23',
    'Maryland':'24','Massachusetts':'25','Michigan':'26','Minnesota':'27',
    'Mississippi':'28','Missouri':'29','Montana':'30','Nebraska':'31',
    'Nevada':'32','New Hampshire':'33','New Jersey':'34','New Mexico':'35',
    'New York':'36','North Carolina':'37','North Dakota':'38','Ohio':'39',
    'Oklahoma':'40','Oregon':'41','Pennsylvania':'42','Rhode Island':'44',
    'South Carolina':'45','South Dakota':'46','Tennessee':'47','Texas':'48',
    'Utah':'49','Vermont':'50','Virginia':'51','Washington':'53',
    'West Virginia':'54','Wisconsin':'55','Wyoming':'56'
  };

  var STATE_VIEW = {
    'Alabama':{c:[32.8,-86.8],z:7},'Alaska':{c:[64.2,-153.4],z:4},
    'Arizona':{c:[34.3,-111.1],z:6},'Arkansas':{c:[34.8,-92.4],z:7},
    'California':{c:[36.8,-119.4],z:6},'Colorado':{c:[39.0,-105.5],z:7},
    'Connecticut':{c:[41.6,-72.7],z:9},'Delaware':{c:[38.9,-75.5],z:9},
    'District of Columbia':{c:[38.9,-77.0],z:12},'Florida':{c:[27.8,-81.7],z:7},
    'Georgia':{c:[32.7,-83.4],z:7},'Hawaii':{c:[20.8,-156.9],z:7},
    'Idaho':{c:[44.2,-114.5],z:6},'Illinois':{c:[40.0,-89.2],z:7},
    'Indiana':{c:[40.3,-86.1],z:7},'Iowa':{c:[42.0,-93.5],z:7},
    'Kansas':{c:[38.5,-98.3],z:7},'Kentucky':{c:[37.5,-85.3],z:7},
    'Louisiana':{c:[31.0,-91.8],z:7},'Maine':{c:[45.4,-69.0],z:7},
    'Maryland':{c:[39.0,-76.8],z:8},'Massachusetts':{c:[42.2,-71.5],z:8},
    'Michigan':{c:[44.3,-85.4],z:7},'Minnesota':{c:[46.4,-93.9],z:6},
    'Mississippi':{c:[32.7,-89.7],z:7},'Missouri':{c:[38.4,-92.5],z:7},
    'Montana':{c:[46.9,-110.4],z:6},'Nebraska':{c:[41.5,-99.9],z:7},
    'Nevada':{c:[38.5,-116.5],z:6},'New Hampshire':{c:[43.7,-71.6],z:8},
    'New Jersey':{c:[40.1,-74.5],z:8},'New Mexico':{c:[34.5,-106.0],z:7},
    'New York':{c:[42.9,-75.5],z:7},'North Carolina':{c:[35.6,-79.4],z:7},
    'North Dakota':{c:[47.5,-100.4],z:7},'Ohio':{c:[40.4,-82.8],z:7},
    'Oklahoma':{c:[35.6,-97.5],z:7},'Oregon':{c:[44.1,-120.5],z:7},
    'Pennsylvania':{c:[40.9,-77.8],z:7},'Rhode Island':{c:[41.7,-71.5],z:10},
    'South Carolina':{c:[33.9,-80.9],z:7},'South Dakota':{c:[44.4,-100.2],z:7},
    'Tennessee':{c:[35.9,-86.4],z:7},'Texas':{c:[31.1,-99.7],z:6},
    'Utah':{c:[39.5,-111.1],z:7},'Vermont':{c:[44.1,-72.7],z:8},
    'Virginia':{c:[37.8,-79.5],z:7},'Washington':{c:[47.4,-120.5],z:7},
    'West Virginia':{c:[38.9,-80.5],z:7},'Wisconsin':{c:[44.5,-89.5],z:7},
    'Wyoming':{c:[43.0,-107.5],z:7}
  };

  var appState = {
    map: null,
    clusterLayer: null,
    baseLayers: {},
    conditions: { G: true, F: true, P: true },
    stateFilter: null,
    fipsCode: null,
    searchMarker: null
  };

  // ─── Utilities ────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatRating(val) {
    if (val == null || val === '') return 'N/A';
    return RATING_LABELS[String(val)] || String(val);
  }

  function formatInspDate(val) {
    if (!val) return 'N/A';
    var s = String(val).padStart(4, '0');
    var mm = parseInt(s.substr(0, 2), 10);
    var yy = parseInt(s.substr(2, 2), 10);
    if (mm < 1 || mm > 12) return String(val);
    var year = yy + (yy > 50 ? 1900 : 2000);
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mm - 1] + ' ' + year;
  }

  function formatADT(val) {
    if (val == null || val === '') return 'N/A';
    return parseInt(val, 10).toLocaleString() + ' vehicles/day';
  }

  function formatOwner(code) {
    if (code == null || code === '') return 'N/A';
    return OWNER_CODES[String(code).padStart(2,'0')] || 'Code ' + code;
  }

  function formatStructKind(code) {
    if (code == null || code === '') return 'N/A';
    return STRUCT_KIND[String(code)] || 'Type ' + code;
  }

  function tr(label, value) {
    return '<tr><td style="color:#64748b;padding:3px 8px 3px 0;white-space:nowrap;font-size:12px;">'
      + esc(label) + '</td><td style="padding:3px 0;font-size:12px;font-weight:500;">'
      + esc(String(value)) + '</td></tr>';
  }

  function buildPopup(props) {
    var facility = props.FACILITY_CARRIED_007 || 'Bridge';
    var crosses  = props.FEATURES_DESC_006A  || '';
    var location = props.LOCATION_009        || '';
    var cond      = props.BRIDGE_CONDITION   || '';
    var condColor = CONDITION_COLOR[cond] || '#6B7280';
    var condLabel = CONDITION_LABEL[cond] || 'Unknown';

    var html = '<div style="max-width:290px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">';
    html += '<div style="font-weight:700;font-size:14px;margin-bottom:4px;line-height:1.3;">' + esc(facility) + '</div>';
    if (crosses)  html += '<div style="color:#64748b;font-size:12px;margin-bottom:2px;">Crosses: ' + esc(crosses) + '</div>';
    if (location) html += '<div style="color:#64748b;font-size:12px;margin-bottom:6px;">' + esc(location) + '</div>';
    html += '<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:' + condColor
          + ';color:#fff;font-weight:600;font-size:11px;margin-bottom:8px;">' + condLabel + ' Condition</span>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += tr('Deck',           formatRating(props.DECK_COND_058));
    html += tr('Superstructure', formatRating(props.SUPERSTRUCTURE_COND_059));
    html += tr('Substructure',   formatRating(props.SUBSTRUCTURE_COND_060));
    html += tr('Year Built',     props.YEAR_BUILT_027 || 'N/A');
    html += tr('Daily Traffic',  formatADT(props.ADT_029));
    html += tr('Structure',      formatStructKind(props.STRUCTURE_KIND_043A));
    html += tr('Owner',          formatOwner(props.OWNER_022));
    html += tr('Last Inspected', formatInspDate(props.DATE_OF_INSPECT_090));
    html += '</table></div>';
    return html;
  }

  // ─── WHERE clause ─────────────────────────────────────────────────────────

  function buildWhere() {
    var parts = [];
    if (appState.fipsCode) parts.push("STATE_CODE_001='" + appState.fipsCode + "'");
    var condParts = ['G','F','P'].filter(function(k){ return appState.conditions[k]; })
      .map(function(k){ return "BRIDGE_CONDITION='" + k + "'"; });
    if (condParts.length > 0 && condParts.length < 3) {
      parts.push('(' + condParts.join(' OR ') + ')');
    }
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  // ─── Stats strip ─────────────────────────────────────────────────────────

  function addCond(where, extra) {
    return where === '1=1' ? extra : '(' + where + ') AND (' + extra + ')';
  }

  function setStatCard(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    var numEl = el.querySelector('.bridges-stat-num');
    if (numEl) numEl.textContent = Number(count || 0).toLocaleString();
  }

  function loadStats(stateWhere) {
    var base = CONFIG.service + '/query?f=json&returnCountOnly=true&where=';
    Promise.all([
      fetch(base + encodeURIComponent(stateWhere)).then(function(r){return r.json();}),
      fetch(base + encodeURIComponent(addCond(stateWhere,"BRIDGE_CONDITION='P'"))).then(function(r){return r.json();}),
      fetch(base + encodeURIComponent(addCond(stateWhere,"BRIDGE_CONDITION='F'"))).then(function(r){return r.json();}),
      fetch(base + encodeURIComponent(addCond(stateWhere,"BRIDGE_CONDITION='G'"))).then(function(r){return r.json();})
    ]).then(function(res) {
      setStatCard('bridges-stat-total', res[0].count);
      setStatCard('bridges-stat-poor',  res[1].count);
      setStatCard('bridges-stat-fair',  res[2].count);
      setStatCard('bridges-stat-good',  res[3].count);
    }).catch(function(){});
  }

  // ─── Legend ──────────────────────────────────────────────────────────────

  function buildLegend() {
    var el = document.getElementById('bridges-legend');
    if (!el) return;
    var items = [
      { label:'Good', color:'#16A34A', desc:'All components rated 7 or above' },
      { label:'Fair', color:'#F59E0B', desc:'Any component rated 5 or 6'      },
      { label:'Poor', color:'#DC2626', desc:'Any component rated 4 or below'  }
    ];
    var html = '<div class="bridges-legend-title">Bridge Condition</div>';
    items.forEach(function(item) {
      html += '<div class="bridges-legend-row">'
        + '<span class="bridges-legend-dot" style="background:' + item.color + '"></span>'
        + '<span class="bridges-legend-label">' + item.label + '</span>'
        + '<span class="bridges-legend-desc">' + item.desc + '</span>'
        + '</div>';
    });
    html += '<div class="bridges-legend-source">Source: FHWA National Bridge Inventory (NTAD 2025)</div>';
    el.innerHTML = html;
  }

  // ─── Condition filter ─────────────────────────────────────────────────────

  function onConditionChange() {
    ['G','F','P'].forEach(function(k) {
      var el = document.getElementById('bridges-cond-' + k.toLowerCase());
      if (el) appState.conditions[k] = el.checked;
    });
    if (appState.clusterLayer) appState.clusterLayer.setWhere(buildWhere());
  }

  // ─── State filter (called externally from test harness or spoke init) ─────

  function applyStateFilter(stateName) {
    appState.stateFilter = stateName || null;
    appState.fipsCode    = stateName ? (STATE_FIPS[stateName] || null) : null;

    var stateWhere = appState.fipsCode ? "STATE_CODE_001='" + appState.fipsCode + "'" : '1=1';

    if (appState.clusterLayer) appState.clusterLayer.setWhere(buildWhere());
    loadStats(stateWhere);

    var sv = stateName && STATE_VIEW[stateName] ? STATE_VIEW[stateName] : null;
    if (sv && appState.map) {
      appState.map.setView(sv.c, sv.z);
    } else if (!stateName && appState.map) {
      appState.map.setView(CONFIG.initialView, CONFIG.initialZoom);
    }
  }

  // ─── Search & geolocation ─────────────────────────────────────────────────

  function wireSearch() {
    var input = document.getElementById('bridges-address');
    var btn   = document.getElementById('bridges-search-btn');
    if (!input || !btn) return;

    function doSearch() {
      var q = (input.value || '').trim();
      if (!q) return;
      btn.disabled = true; btn.textContent = '...';
      fetch(CONFIG.nominatim + '?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q))
        .then(function(r){return r.json();}).then(function(data) {
          btn.disabled = false; btn.textContent = 'Search';
          if (!data || !data.length) { alert('Location not found.'); return; }
          var lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          appState.map.setView([lat, lng], 13);
          if (appState.searchMarker) appState.map.removeLayer(appState.searchMarker);
          appState.searchMarker = L.marker([lat, lng]).addTo(appState.map)
            .bindPopup(data[0].display_name).openPopup();
        }).catch(function(){ btn.disabled = false; btn.textContent = 'Search'; });
    }
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function(e){ if (e.key==='Enter') doSearch(); });
  }

  function wireGeolocation() {
    var btn = document.getElementById('bridges-locate-btn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(function(pos) {
        btn.disabled = false;
        appState.map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      }, function(){ btn.disabled = false; alert('Could not get location.'); });
    });
  }

  // ─── URL hash ─────────────────────────────────────────────────────────────

  function updateUrlHash() {
    var c = appState.map.getCenter();
    history.replaceState(null,'','#lat='+c.lat.toFixed(5)+'&lng='+c.lng.toFixed(5)+'&z='+appState.map.getZoom());
  }

  function loadUrlHash() {
    var h = window.location.hash.slice(1);
    if (!h) return;
    var p = {};
    h.split('&').forEach(function(pair){
      var i = pair.indexOf('=');
      if (i > 0) p[pair.slice(0,i)] = decodeURIComponent(pair.slice(i+1));
    });
    if (p.lat && p.lng && p.z) {
      appState.map.setView([parseFloat(p.lat), parseFloat(p.lng)], parseInt(p.z,10));
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    var mapEl = document.getElementById(CONFIG.mapId);
    if (!mapEl) return;

    var stateAttr = (mapEl.getAttribute('data-state') || '').trim();
    appState.stateFilter = stateAttr || null;
    appState.fipsCode    = stateAttr ? (STATE_FIPS[stateAttr] || null) : null;

    var stateWhere = appState.fipsCode ? "STATE_CODE_001='" + appState.fipsCode + "'" : '1=1';

    var sv = stateAttr && STATE_VIEW[stateAttr] ? STATE_VIEW[stateAttr] : null;
    appState.map = L.map(CONFIG.mapId, {
      center: sv ? sv.c : CONFIG.initialView,
      zoom:   sv ? sv.z : CONFIG.initialZoom
    });

    // ── Basemaps ──────────────────────────────────────────────────────────
    var streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | FHWA National Bridge Inventory',
      maxZoom: 19
    });

    var satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics | FHWA National Bridge Inventory',
        maxZoom: 19
      }
    );

    streetsLayer.addTo(appState.map);
    appState.baseLayers = { 'Street Map': streetsLayer, 'Satellite': satelliteLayer };

    // Built-in Leaflet layer switcher (top-right)
    L.control.layers(appState.baseLayers, {}, { position: 'topright', collapsed: false }).addTo(appState.map);

    // ── Bridge cluster layer ──────────────────────────────────────────────
    appState.clusterLayer = L.esri.Cluster.featureLayer({
      url: CONFIG.service,
      where: buildWhere(),
      fields: [
        'OBJECTID','FACILITY_CARRIED_007','FEATURES_DESC_006A','LOCATION_009',
        'YEAR_BUILT_027','ADT_029','DECK_COND_058','SUPERSTRUCTURE_COND_059',
        'SUBSTRUCTURE_COND_060','BRIDGE_CONDITION','LOWEST_RATING',
        'OWNER_022','DATE_OF_INSPECT_090','STRUCTURE_KIND_043A','STATE_CODE_001'
      ],
      pointToLayer: function(geojson, latlng) {
        var cond  = geojson.properties.BRIDGE_CONDITION;
        var color = CONDITION_COLOR[cond] || '#6B7280';
        return L.circleMarker(latlng, {
          radius: 6, fillColor: color, color: '#fff',
          weight: 1.5, opacity: 1, fillOpacity: 0.85
        });
      },
      onEachFeature: function(feature, layer) {
        layer.bindPopup(buildPopup(feature.properties), { maxWidth: 310 });
      }
    }).addTo(appState.map);

    loadStats(stateWhere);
    buildLegend();
    wireSearch();
    wireGeolocation();
    loadUrlHash();
    appState.map.on('moveend', updateUrlHash);

    ['g','f','p'].forEach(function(k) {
      var el = document.getElementById('bridges-cond-' + k);
      if (el) el.addEventListener('change', onConditionChange);
    });
  }

  // ─── Public API (test harness & external callers) ─────────────────────────
  window.bridgesMap = { setStateFilter: applyStateFilter };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
