(function () {
  'use strict';

  var SLUG = 'us-wastewater-plants';
  var BASE = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/National_Sewershed_Web_Map_Internal_WFL1/FeatureServer';
  var POINTS_URL = BASE + '/0';
  var POLYGONS_URL = BASE + '/8';
  var POINT_FIELDS = [
    'OBJECTID', 'CWNS_ID', 'FACILITY_NAME', 'CITY', 'COUNTY_NAME',
    'STATE_CODE', 'ZIP_CODE', 'ADDRESS', 'Authority_Name', 'Permit_Number',
    'POPULATION_TYPE', 'PART_OF_SEWERSHED', 'END_FACILITY',
    'RESIDENTIAL_POP_2022', 'NONRESIDENTIAL_POP_2022',
    'TOTAL_RES_POPULATION_2022', 'TOTAL_NONRES_POPULATION_2022',
    'TOTAL_RES_POPULATION_2042',
    'CURRENT_EFFLUENT_TREATMENT_LEVE', 'FUTURE_EFFLUENT_TREATMENT_LEVEL'
  ];
  var POLY_ATTR_FIELDS = ['CWNS_ID', 'Method', 'Pop_2020', 'Buildings', 'Mean_Prob'];
  var PAGE_SIZE = 2000;

  var STATE_NAMES = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
    CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
    FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
    IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
    ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
    MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
    NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
    NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon',
    PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
    TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia',
    WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
    PR:'Puerto Rico', VI:'U.S. Virgin Islands', GU:'Guam', AS:'American Samoa', MP:'N. Mariana Islands'
  };

  // Symbology: source data quality is the primary visual axis
  var COLOR_SOURCED = '#16a34a';   // green: state/utility-supplied real boundary
  var COLOR_MODELLED = '#f59e0b';  // amber: EPA modelled (concave hull from buildings)
  var COLOR_UNKNOWN = '#94a3b8';   // grey: no matching sewershed polygon

  var allPoints = [];
  var polygonAttrs = {};            // CWNS_ID -> { method, pop2020, buildings, meanProb }
  var filteredPoints = [];
  var clusterLayer = null;
  var polygonLayer = null;
  var map = null;

  function $(s) { return document.querySelector(s); }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function setLoading(msg) {
    var el = document.getElementById(SLUG + '-loading');
    if (msg) {
      if (!el) {
        el = document.createElement('div');
        el.id = SLUG + '-loading';
        el.className = 'uwp-loading';
        document.getElementById(SLUG + '-map').appendChild(el);
      }
      el.textContent = msg;
    } else if (el) {
      el.parentNode.removeChild(el);
    }
  }

  // ------- Paginated data fetch -------
  function paginated(url, fields, withGeometry) {
    var params = {
      where: '1=1',
      outFields: fields.join(','),
      returnGeometry: withGeometry ? 'true' : 'false',
      outSR: '4326',
      f: 'json',
      orderByFields: 'OBJECTID',
      resultRecordCount: String(PAGE_SIZE)
    };
    var collected = [];
    function next(offset) {
      params.resultOffset = String(offset);
      var qs = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      return fetch(url + '/query?' + qs).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || !data.features) return;
        collected.push.apply(collected, data.features);
        if (data.features.length === PAGE_SIZE) {
          return next(offset + PAGE_SIZE);
        }
      });
    }
    return next(0).then(function () { return collected; });
  }

  function fetchPolygonAttrs() {
    setLoading('Loading sewershed metadata...');
    return paginated(POLYGONS_URL, POLY_ATTR_FIELDS, false).then(function (features) {
      features.forEach(function (f) {
        var a = f.attributes || {};
        if (!a.CWNS_ID) return;
        polygonAttrs[a.CWNS_ID] = {
          method: a.Method || null,
          pop2020: a.Pop_2020 != null ? +a.Pop_2020 : null,
          buildings: a.Buildings != null ? +a.Buildings : null,
          meanProb: a.Mean_Prob != null ? +a.Mean_Prob : null
        };
      });
    });
  }

  function fetchPoints() {
    setLoading('Loading wastewater treatment plants...');
    return paginated(POINTS_URL, POINT_FIELDS, true).then(function (features) {
      features.forEach(function (f) {
        if (!f.geometry) return;
        var a = f.attributes || {};
        allPoints.push({
          id: a.OBJECTID,
          cwns: a.CWNS_ID,
          name: a.FACILITY_NAME || 'Unnamed Facility',
          city: a.CITY || '',
          county: a.COUNTY_NAME || '',
          state: a.STATE_CODE || '',
          zip: a.ZIP_CODE || '',
          address: a.ADDRESS || '',
          authority: a.Authority_Name || '',
          permit: a.Permit_Number || '',
          popType: a.POPULATION_TYPE || '',
          partOf: a.PART_OF_SEWERSHED || '',
          endFac: a.END_FACILITY || '',
          resPop: a.RESIDENTIAL_POP_2022 != null ? +a.RESIDENTIAL_POP_2022 : null,
          nonResPop: a.NONRESIDENTIAL_POP_2022 != null ? +a.NONRESIDENTIAL_POP_2022 : null,
          totalRes: a.TOTAL_RES_POPULATION_2022 != null ? +a.TOTAL_RES_POPULATION_2022 : null,
          totalNonRes: a.TOTAL_NONRES_POPULATION_2022 != null ? +a.TOTAL_NONRES_POPULATION_2022 : null,
          pop2042: a.TOTAL_RES_POPULATION_2042 != null ? +a.TOTAL_RES_POPULATION_2042 : null,
          treat: a.CURRENT_EFFLUENT_TREATMENT_LEVE || '',
          futureTreat: a.FUTURE_EFFLUENT_TREATMENT_LEVEL || '',
          lat: f.geometry.y,
          lng: f.geometry.x
        });
      });
    });
  }

  // ------- Symbology -------
  function sourceFor(p) {
    var a = polygonAttrs[p.cwns];
    if (!a || !a.method) return 'unknown';
    return a.method.toLowerCase() === 'sourced' ? 'sourced' : 'modelled';
  }
  function pointColor(p) {
    var src = sourceFor(p);
    if (src === 'sourced') return COLOR_SOURCED;
    if (src === 'modelled') return COLOR_MODELLED;
    return COLOR_UNKNOWN;
  }
  function pointRadius(p) {
    // Anchor on TOTAL_RES_POPULATION_2022 (100% coverage)
    var pop = p.totalRes || 0;
    if (pop <= 0) return 4;
    if (pop < 1000) return 4;
    if (pop < 5000) return 5;
    if (pop < 25000) return 7;
    if (pop < 100000) return 9;
    if (pop < 500000) return 12;
    return 16;
  }
  function makeMarker(p) {
    return L.circleMarker([p.lat, p.lng], {
      radius: pointRadius(p),
      color: '#0f172a',
      weight: 1,
      fillColor: pointColor(p),
      fillOpacity: 0.85
    }).bindPopup(makePopup(p), { maxWidth: 340 });
  }

  // ------- Popup -------
  function row(label, value) {
    return '<div class="uwp-pop-row"><span class="uwp-pop-label">' + esc(label) +
           '</span><span class="uwp-pop-value">' + esc(value) + '</span></div>';
  }
  function makePopup(p) {
    var a = polygonAttrs[p.cwns] || {};
    var src = sourceFor(p);
    var html = '<div class="uwp-pop-name">' + esc(p.name) + '</div>';
    var meta = [p.city, p.state].filter(Boolean).join(', ');
    if (meta) html += '<div class="uwp-pop-meta">' + esc(meta) + '</div>';

    // Tags row
    var tags = '';
    if (src === 'sourced') {
      tags += '<span class="uwp-pop-tag uwp-tag-sourced">Sourced boundary</span>';
    } else if (src === 'modelled') {
      tags += '<span class="uwp-pop-tag uwp-tag-modelled">EPA modelled</span>';
    }
    if (p.popType === 'Total Receiving Treatment') {
      tags += '<span class="uwp-pop-tag uwp-tag-treatment">Treatment endpoint</span>';
    } else if (p.popType === 'Receiving Collection') {
      tags += '<span class="uwp-pop-tag uwp-tag-collection">Collection point</span>';
    }
    if (tags) html += tags;

    // Operator + location
    html += '<div class="uwp-pop-section">';
    html += '<div class="uwp-pop-section-title">Plant info</div>';
    if (p.authority) html += row('Operator', p.authority);
    if (p.county) html += row('County', p.county);
    if (p.address) {
      var fullAddr = p.address + (p.zip ? ' ' + p.zip : '');
      html += row('Address', fullAddr);
    }
    if (p.endFac) html += row('Routes to', p.endFac);
    html += '</div>';

    // Population block
    html += '<div class="uwp-pop-section">';
    html += '<div class="uwp-pop-section-title">Population served (2022)</div>';
    if (p.totalRes != null) html += row('Residential', fmtNum(p.totalRes));
    if (p.totalNonRes != null && p.totalNonRes > 0) html += row('Non-residential', fmtNum(p.totalNonRes));
    if (p.pop2042 != null && p.pop2042 > 0) html += row('Projected 2042', fmtNum(p.pop2042));
    html += '</div>';

    // Sewershed block
    if (a.method || a.pop2020 || a.buildings) {
      html += '<div class="uwp-pop-section">';
      html += '<div class="uwp-pop-section-title">Sewershed boundary</div>';
      if (a.method) {
        var srcLabel = a.method.toLowerCase() === 'sourced'
          ? 'State / utility-supplied'
          : 'EPA modelled (concave hull)';
        html += row('Source', srcLabel);
      }
      if (a.pop2020 != null) html += row('Pop. inside boundary', fmtNum(a.pop2020));
      if (a.buildings != null) html += row('Buildings inside', fmtNum(a.buildings));
      if (a.method && a.method.toLowerCase() === 'modelled' && a.meanProb != null) {
        html += row('Model confidence', (a.meanProb * 100).toFixed(0) + '%');
      }
      html += '</div>';
    }

    // Treatment block (sparse — only ~8% have it)
    if (p.treat || p.futureTreat) {
      html += '<div class="uwp-pop-section">';
      html += '<div class="uwp-pop-section-title">Effluent treatment</div>';
      if (p.treat) html += row('Current level', p.treat);
      if (p.futureTreat) html += row('Planned level', p.futureTreat);
      html += '</div>';
    }

    // ECHO link
    if (p.permit) {
      html += '<div class="uwp-pop-section">';
      html += row('NPDES permit', p.permit);
      var echoUrl = 'https://echo.epa.gov/detailed-facility-report?fid=' + encodeURIComponent(p.permit);
      html += '<a class="uwp-pop-link" href="' + echoUrl + '" target="_blank" rel="noopener">View EPA ECHO compliance record</a>';
      html += '</div>';
    }

    return html;
  }

  // ------- Filtering -------
  function applyFilters() {
    var search = ($('#' + SLUG + '-search').value || '').trim().toLowerCase();
    var state = $('#' + SLUG + '-state').value;
    var sourceMode = (document.querySelector('input[name="' + SLUG + '-source"]:checked') || {}).value || 'all';

    filteredPoints = allPoints.filter(function (p) {
      if (state && p.state !== state) return false;
      if (sourceMode !== 'all') {
        var src = sourceFor(p);
        if (sourceMode === 'sourced' && src !== 'sourced') return false;
        if (sourceMode === 'modelled' && src !== 'modelled') return false;
      }
      if (search) {
        var hay = (p.name + ' ' + p.city + ' ' + p.zip + ' ' + p.county + ' ' + p.authority).toLowerCase();
        if (hay.indexOf(search) < 0) return false;
      }
      return true;
    });

    renderClusters();
    updateStats();
    updatePolygonFilter();
    updateShareUrl();
  }

  function renderClusters() {
    if (clusterLayer) map.removeLayer(clusterLayer);
    clusterLayer = L.markerClusterGroup({
      maxClusterRadius: 55,
      chunkedLoading: true,
      iconCreateFunction: function (cluster) {
        var n = cluster.getChildCount();
        var size = 'sm';
        if (n >= 1000) size = 'xl';
        else if (n >= 200) size = 'lg';
        else if (n >= 25) size = 'md';
        return L.divIcon({
          html: '<div class="uwp-cluster uwp-cluster-' + size + '">' + n.toLocaleString() + '</div>',
          className: '',
          iconSize: null
        });
      }
    });
    var batch = filteredPoints.map(makeMarker);
    clusterLayer.addLayers(batch);
    map.addLayer(clusterLayer);

    var search = ($('#' + SLUG + '-search').value || '').trim();
    var state = $('#' + SLUG + '-state').value;
    if ((state || search) && filteredPoints.length > 0 && filteredPoints.length < 1500) {
      try {
        var b = clusterLayer.getBounds();
        if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 11 });
      } catch (e) {}
    }
  }

  function updateStats() {
    var total = filteredPoints.length;
    var pop = 0, sourced = 0, modelled = 0, withTreat = 0;
    filteredPoints.forEach(function (p) {
      if (p.totalRes) pop += p.totalRes;
      var s = sourceFor(p);
      if (s === 'sourced') sourced++;
      else if (s === 'modelled') modelled++;
      if (p.treat) withTreat++;
    });
    var html =
      '<span class="uwp-stat"><strong>' + fmtNum(total) + '</strong> plants shown</span>' +
      '<span class="uwp-stat">serving <strong>' + fmtNum(pop) + '</strong> people</span>' +
      '<span class="uwp-stat"><strong>' + fmtNum(sourced) + '</strong> sourced</span>' +
      '<span class="uwp-stat"><strong>' + fmtNum(modelled) + '</strong> modelled</span>';
    if (withTreat > 0) {
      html += '<span class="uwp-stat"><strong>' + fmtNum(withTreat) + '</strong> with treatment data</span>';
    }
    $('#' + SLUG + '-stats').innerHTML = html;
  }

  // ------- Polygon layer -------
  function buildPolygonLayer() {
    polygonLayer = L.esri.featureLayer({
      url: POLYGONS_URL,
      simplifyFactor: 0.5,
      precision: 5,
      where: '1=0',
      style: function (feature) {
        var m = (feature.properties && feature.properties.Method || '').toLowerCase();
        if (m === 'sourced') {
          return { color: '#15803d', weight: 1.4, fillColor: '#22c55e', fillOpacity: 0.18, dashArray: null };
        }
        return { color: '#b45309', weight: 1, fillColor: '#fbbf24', fillOpacity: 0.13, dashArray: '4 3' };
      },
      onEachFeature: function (feature, layer) {
        var a = feature.properties || {};
        var name = a.FACILITY_NAME || 'Sewershed';
        var html = '<div class="uwp-pop-name">' + esc(name) + '</div>';
        if (a.City || a.STATE_CODE) {
          html += '<div class="uwp-pop-meta">' + esc([a.City, a.STATE_CODE].filter(Boolean).join(', ')) + '</div>';
        }
        if (a.Method) {
          var label = a.Method.toLowerCase() === 'sourced' ? 'Sourced boundary' : 'EPA modelled';
          var cls = a.Method.toLowerCase() === 'sourced' ? 'uwp-tag-sourced' : 'uwp-tag-modelled';
          html += '<span class="uwp-pop-tag ' + cls + '">' + label + '</span>';
        }
        html += '<div class="uwp-pop-section">';
        if (a.TOTAL_RES_POPULATION_2022) html += row('Pop. served (2022)', fmtNum(a.TOTAL_RES_POPULATION_2022));
        if (a.Pop_2020) html += row('Pop. inside boundary', fmtNum(a.Pop_2020));
        if (a.Buildings) html += row('Buildings', fmtNum(a.Buildings));
        if (a.Mean_Prob != null && a.Method && a.Method.toLowerCase() === 'modelled') {
          html += row('Model confidence', (a.Mean_Prob * 100).toFixed(0) + '%');
        }
        html += '</div>';
        html += '<div class="uwp-pop-help">Click the central marker for full plant details.</div>';
        layer.bindPopup(html, { maxWidth: 320 });
      }
    }).addTo(map);
  }

  function updatePolygonFilter() {
    if (!polygonLayer) return;
    var state = $('#' + SLUG + '-state').value;
    var sourceMode = (document.querySelector('input[name="' + SLUG + '-source"]:checked') || {}).value || 'all';
    var z = map.getZoom();

    var clauses = [];
    if (state) clauses.push("STATE_CODE='" + state + "'");
    if (sourceMode === 'sourced') clauses.push("Method='Sourced'");
    if (sourceMode === 'modelled') clauses.push("Method='Modeled'");

    if (clauses.length > 0) {
      polygonLayer.setWhere(clauses.join(' AND '));
    } else if (z >= 8) {
      polygonLayer.setWhere('1=1');
    } else {
      polygonLayer.setWhere('1=0');
    }
  }

  // ------- Hash share -------
  function updateShareUrl() {
    var c = map.getCenter();
    var state = $('#' + SLUG + '-state').value;
    var search = ($('#' + SLUG + '-search').value || '').trim();
    var src = (document.querySelector('input[name="' + SLUG + '-source"]:checked') || {}).value || 'all';
    var parts = ['z=' + map.getZoom(), 'lat=' + c.lat.toFixed(4), 'lng=' + c.lng.toFixed(4)];
    if (state) parts.push('state=' + encodeURIComponent(state));
    if (search) parts.push('q=' + encodeURIComponent(search));
    if (src !== 'all') parts.push('src=' + src);
    history.replaceState(null, '', '#' + parts.join('&'));
  }
  function loadShareUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var out = {};
    hash.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }

  function resetFilters() {
    $('#' + SLUG + '-search').value = '';
    $('#' + SLUG + '-state').value = '';
    var allRadio = document.getElementById(SLUG + '-src-all');
    if (allRadio) allRadio.checked = true;
    applyFilters();
    map.setView([39.5, -98.5], 4);
  }

  // ------- UI shell -------
  function buildUi() {
    var container = document.getElementById(SLUG + '-container');
    if (!container) return;
    var mapDiv = document.getElementById(SLUG + '-map');

    var toolbar = document.createElement('div');
    toolbar.className = 'uwp-toolbar';
    toolbar.innerHTML =
      '<input class="uwp-search" id="' + SLUG + '-search" type="search" placeholder="Search by plant, city, ZIP, county, or operator" />' +
      '<select class="uwp-state" id="' + SLUG + '-state" aria-label="Filter by state"><option value="">All states</option></select>' +
      '<span class="uwp-group-label">Boundary source:</span>' +
      '<div class="uwp-radio-group" role="radiogroup" aria-label="Boundary source">' +
        '<input type="radio" name="' + SLUG + '-source" id="' + SLUG + '-src-all" value="all" checked>' +
        '<label for="' + SLUG + '-src-all" title="Show every plant regardless of how its sewershed was defined">All</label>' +
        '<input type="radio" name="' + SLUG + '-source" id="' + SLUG + '-src-sourced" value="sourced">' +
        '<label for="' + SLUG + '-src-sourced" title="Boundaries supplied by state agencies or utilities (3,219 plants) — most accurate">Sourced</label>' +
        '<input type="radio" name="' + SLUG + '-source" id="' + SLUG + '-src-modelled" value="modelled">' +
        '<label for="' + SLUG + '-src-modelled" title="Boundaries inferred by EPA from building footprints (13,864 plants)">Modelled</label>' +
      '</div>' +
      '<button class="uwp-reset" id="' + SLUG + '-reset" type="button">Reset</button>';

    var stats = document.createElement('div');
    stats.className = 'uwp-stats';
    stats.id = SLUG + '-stats';
    stats.textContent = 'Loading data...';

    container.insertBefore(toolbar, mapDiv);
    container.insertBefore(stats, mapDiv);

    var sel = $('#' + SLUG + '-state');
    Object.keys(STATE_NAMES).sort(function (a, b) {
      return STATE_NAMES[a].localeCompare(STATE_NAMES[b]);
    }).forEach(function (code) {
      var o = document.createElement('option');
      o.value = code;
      o.textContent = STATE_NAMES[code];
      sel.appendChild(o);
    });
  }

  // ------- Init -------
  function init() {
    buildUi();

    map = L.map(SLUG + '-map', {
      center: [39.5, -98.5],
      zoom: 4,
      preferCanvas: true,
      worldCopyJump: true
    });
    var streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | EPA Sewersheds',
      maxZoom: 19
    });
    var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    });
    streets.addTo(map);
    L.control.layers({ 'Streets': streets, 'Satellite': sat }, null, { position: 'topleft' }).addTo(map);

    var legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      var div = L.DomUtil.create('div', 'uwp-legend');
      div.innerHTML =
        '<button type="button" class="uwp-legend-toggle" aria-expanded="false">' +
          '<span>Legend</span><span class="uwp-chev"></span>' +
        '</button>' +
        '<div class="uwp-legend-body">' +
          '<strong>Plant marker colour</strong>' +
          '<div class="uwp-legend-section">' +
            '<div><span class="uwp-swatch" style="background:' + COLOR_SOURCED + '"></span>Sourced sewershed (state-supplied)</div>' +
            '<div><span class="uwp-swatch" style="background:' + COLOR_MODELLED + '"></span>EPA modelled sewershed</div>' +
            '<div><span class="uwp-swatch" style="background:' + COLOR_UNKNOWN + '"></span>No sewershed boundary</div>' +
          '</div>' +
          '<div class="uwp-legend-section">' +
            '<strong>Marker size = population served</strong>' +
            '<div class="uwp-size-row"><span class="uwp-size-dot" style="width:8px;height:8px"></span>&lt;1k people</div>' +
            '<div class="uwp-size-row"><span class="uwp-size-dot" style="width:14px;height:14px"></span>25k&ndash;100k</div>' +
            '<div class="uwp-size-row"><span class="uwp-size-dot" style="width:24px;height:24px"></span>500k+ people</div>' +
          '</div>' +
          '<div class="uwp-legend-section">' +
            '<strong>Sewershed boundary</strong>' +
            '<div><span class="uwp-swatch uwp-swatch-poly" style="background:#22c55e;border-color:#15803d"></span>Sourced (real boundary)</div>' +
            '<div><span class="uwp-swatch uwp-swatch-poly" style="background:#fbbf24;border-color:#b45309;border-style:dashed"></span>EPA modelled (estimated)</div>' +
          '</div>' +
        '</div>';
      // stop map drag/click bubbling through the legend
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      var btn = div.querySelector('.uwp-legend-toggle');
      btn.addEventListener('click', function () {
        var open = div.classList.toggle('uwp-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      return div;
    };
    legend.addTo(map);

    buildPolygonLayer();

    $('#' + SLUG + '-search').addEventListener('input', debounce(applyFilters, 250));
    $('#' + SLUG + '-state').addEventListener('change', applyFilters);
    document.querySelectorAll('input[name="' + SLUG + '-source"]').forEach(function (el) {
      el.addEventListener('change', applyFilters);
    });
    $('#' + SLUG + '-reset').addEventListener('click', resetFilters);
    map.on('moveend zoomend', function () {
      updateShareUrl();
      updatePolygonFilter();
    });

    // Polygons must load FIRST so we can join Method to points for symbology.
    fetchPolygonAttrs()
      .then(fetchPoints)
      .then(function () {
        setLoading(null);
        var saved = loadShareUrl();
        if (saved) {
          if (saved.state) $('#' + SLUG + '-state').value = saved.state;
          if (saved.q) $('#' + SLUG + '-search').value = saved.q;
          if (saved.src) {
            var radio = document.getElementById(SLUG + '-src-' + saved.src);
            if (radio) radio.checked = true;
          }
        }
        applyFilters();
        if (saved && saved.lat && saved.lng && saved.z) {
          map.setView([+saved.lat, +saved.lng], +saved.z);
        }
      })
      .catch(function (err) {
        setLoading('Error loading data');
        console.error(err);
      });
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
