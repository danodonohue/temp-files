(function () {
  'use strict';

  var CONFIG = {
    mapId: 'us-soil-map-map',
    controlsId: 'us-soil-map-controls',
    infoId: 'us-soil-map-info',
    initialView: [39.5, -98.5],
    initialZoom: 4,
    wmsUrl: 'https://SDMDataAccess.nrcs.usda.gov/Spatial/SDM.wms',
    sdaUrl: 'https://SDMDataAccess.nrcs.usda.gov/tabular/post.rest',
    defaultOpacity: 0.75,
    soilMinZoom: 12
  };

  var LAYERS = {
    mapunits: {
      label: 'Soil Map Units',
      wmsLayer: 'mapunitpoly',
      description: 'SSURGO soil map unit polygons (USDA NRCS)'
    }
  };

  var BASEMAPS = {
    streets: {
      label: 'Streets',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    topo: {
      label: 'Topo',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
    },
    satellite: {
      label: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
    }
  };

  var map, soilLayer, currentBasemap;
  var currentLayerKey = 'mapunits';
  var currentBasemapKey = 'streets';
  var basemapTiles = {};

  function init() {
    var urlState = loadStateFromUrl();

    var lat = (urlState && urlState.lat) ? parseFloat(urlState.lat) : CONFIG.initialView[0];
    var lng = (urlState && urlState.lng) ? parseFloat(urlState.lng) : CONFIG.initialView[1];
    var zoom = (urlState && urlState.z) ? parseInt(urlState.z, 10) : CONFIG.initialZoom;
    var opacity = (urlState && urlState.op) ? parseFloat(urlState.op) : CONFIG.defaultOpacity;
    var layerKey = (urlState && urlState.lyr && LAYERS[urlState.lyr]) ? urlState.lyr : 'mapunits';

    currentLayerKey = layerKey;

    map = L.map(CONFIG.mapId, {
      center: [lat, lng],
      zoom: zoom,
      zoomControl: true
    });

    // Build basemaps
    Object.keys(BASEMAPS).forEach(function (key) {
      var bm = BASEMAPS[key];
      basemapTiles[key] = L.tileLayer(bm.url, {
        attribution: bm.attribution,
        maxZoom: 18
      });
    });

    basemapTiles[currentBasemapKey].addTo(map);

    // WMS soil layer
    soilLayer = buildSoilLayer(currentLayerKey, opacity);
    soilLayer.addTo(map);

    buildControls(opacity, layerKey);

    addZoomOverlay();
    map.on('click', onMapClick);
    map.on('moveend', updateShareUrl);
    map.on('zoomend', updateShareUrl);

    setInfo('Zoom in to level 12+ to see soil polygons, then click any location to query USDA SSURGO data.');
    updateShareUrl();
  }

  function buildSoilLayer(layerKey, opacity) {
    return L.tileLayer.wms(CONFIG.wmsUrl, {
      layers: LAYERS[layerKey].wmsLayer,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: opacity,
      minZoom: CONFIG.soilMinZoom,
      attribution: 'USDA NRCS SSURGO &mdash; Soil Data Mart'
    });
  }

  function addZoomOverlay() {
    var el = document.createElement('div');
    el.id = 'us-soil-map-zoom-overlay';
    el.innerHTML = 'Zoom in to level 12 or higher to see SSURGO soil map unit polygons';
    document.getElementById(CONFIG.mapId).appendChild(el);
    updateZoomOverlay();
    map.on('zoomend', updateZoomOverlay);
  }

  function updateZoomOverlay() {
    var el = document.getElementById('us-soil-map-zoom-overlay');
    if (!el) return;
    el.style.display = map.getZoom() >= CONFIG.soilMinZoom ? 'none' : 'block';
  }

  function buildControls(opacity, layerKey) {
    var controls = document.getElementById(CONFIG.controlsId);
    if (!controls) return;


    // Opacity
    var opacityWrap = document.createElement('div');
    opacityWrap.id = 'us-soil-map-opacity-wrap';

    var opacityLabel = document.createElement('label');
    opacityLabel.setAttribute('for', 'us-soil-map-opacity');
    opacityLabel.textContent = 'Opacity:';

    var opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.id = 'us-soil-map-opacity';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = Math.round(opacity * 100);

    var opacityVal = document.createElement('span');
    opacityVal.id = 'us-soil-map-opacity-val';
    opacityVal.textContent = Math.round(opacity * 100) + '%';

    opacitySlider.addEventListener('input', function () {
      var val = parseFloat(this.value) / 100;
      soilLayer.setOpacity(val);
      opacityVal.textContent = this.value + '%';
      updateShareUrl();
    });

    opacityWrap.appendChild(opacityLabel);
    opacityWrap.appendChild(opacitySlider);
    opacityWrap.appendChild(opacityVal);

    // Basemap buttons
    var basemapWrap = document.createElement('div');
    basemapWrap.id = 'us-soil-map-basemap-wrap';
    var basemapLbl = document.createElement('label');
    basemapLbl.textContent = 'Basemap:';
    basemapWrap.appendChild(basemapLbl);

    Object.keys(BASEMAPS).forEach(function (key) {
      var btn = document.createElement('button');
      btn.className = 'us-soil-map-basemap-btn' + (key === currentBasemapKey ? ' active' : '');
      btn.textContent = BASEMAPS[key].label;
      btn.dataset.key = key;
      btn.addEventListener('click', function () {
        if (currentBasemapKey === this.dataset.key) return;
        map.removeLayer(basemapTiles[currentBasemapKey]);
        currentBasemapKey = this.dataset.key;
        basemapTiles[currentBasemapKey].addTo(map);
        basemapTiles[currentBasemapKey].bringToBack();
        document.querySelectorAll('.us-soil-map-basemap-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
      });
      basemapWrap.appendChild(btn);
    });

    // Share button
    var shareBtn = document.createElement('button');
    shareBtn.id = 'us-soil-map-share';
    shareBtn.textContent = 'Copy link';
    shareBtn.addEventListener('click', function () {
      var url = window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          shareBtn.textContent = 'Copied!';
          setTimeout(function () { shareBtn.textContent = 'Copy link'; }, 2000);
        });
      } else {
        window.prompt('Copy this link:', url);
      }
    });

    // Legend toggle button
    var legendBtn = document.createElement('button');
    legendBtn.id = 'us-soil-map-legend-btn';
    legendBtn.className = 'us-soil-map-basemap-btn';
    legendBtn.textContent = '? Legend';
    legendBtn.setAttribute('aria-expanded', 'false');
    legendBtn.addEventListener('click', function () {
      var panel = document.getElementById('us-soil-map-legend');
      var open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      legendBtn.classList.toggle('active', !open);
      legendBtn.setAttribute('aria-expanded', String(!open));
    });

    controls.appendChild(opacityWrap);
    controls.appendChild(basemapWrap);
    controls.appendChild(legendBtn);
    controls.appendChild(shareBtn);

    buildLegend();
  }

  function buildLegend() {
    var container = document.getElementById('us-soil-map-container');
    if (!container) return;

    var panel = document.createElement('div');
    panel.id = 'us-soil-map-legend';
    panel.style.display = 'none';
    panel.innerHTML = [
      '<div class="usm-leg-title">How to Read the Map</div>',
      '<div class="usm-leg-cols">',

      '<div class="usm-leg-col">',
      '<div class="usm-leg-heading">Map Unit Symbol</div>',
      '<p class="usm-leg-para">Each polygon is labelled with a <strong>Map Unit Symbol</strong> such as <code>377C2</code>.</p>',
      '<ul class="usm-leg-list">',
      '<li><strong>377</strong> &mdash; local soil series code</li>',
      '<li><strong>C</strong> &mdash; slope phase (see table)</li>',
      '<li><strong>2</strong> &mdash; erosion phase (1 = slight, 2 = moderate, 3 = severe)</li>',
      '</ul>',
      '<div class="usm-leg-heading" style="margin-top:10px">Slope Phase Letters</div>',
      '<table class="usm-leg-table">',
      '<tr><th>Letter</th><th>Slope</th><th>Description</th></tr>',
      '<tr><td>A</td><td>0&ndash;2%</td><td>Nearly level</td></tr>',
      '<tr><td>B</td><td>2&ndash;6%</td><td>Gently sloping</td></tr>',
      '<tr><td>C</td><td>6&ndash;12%</td><td>Moderately sloping</td></tr>',
      '<tr><td>D</td><td>12&ndash;18%</td><td>Strongly sloping</td></tr>',
      '<tr><td>E</td><td>18&ndash;25%</td><td>Steep</td></tr>',
      '<tr><td>F</td><td>25%+</td><td>Very steep</td></tr>',
      '</table>',
      '</div>',

      '<div class="usm-leg-col">',
      '<div class="usm-leg-heading">Click-Query Fields</div>',
      '<dl class="usm-leg-dl">',
      '<dt>Map Unit Name</dt><dd>Full descriptive name of the soil map unit (e.g. "Tama silty clay loam, 2 to 5 percent slopes")</dd>',
      '<dt>Map Unit Type</dt><dd>How the unit is classified: <em>Consociation</em> (one dominant soil), <em>Complex</em> (two+ soils, indivisible), or <em>Association</em> (two+ soils that can be separated)</dd>',
      '<dt>Soil Taxonomy</dt><dd>USDA hierarchical classification. The Order is the broadest level (e.g. <em>Mollisols</em> = dark, fertile grassland soils; <em>Ultisols</em> = weathered forest soils).</dd>',
      '<dt>Drainage Class</dt><dd>How quickly excess water drains: from <em>Excessively drained</em> to <em>Very poorly drained</em></dd>',
      '<dt>Farmland Class</dt><dd>USDA land capability: <em>Prime farmland</em> is the most productive. <em>Not prime</em> includes steeply sloped, wet, or rocky land.</dd>',
      '</dl>',
      '</div>',

      '</div>',
      '<p class="usm-leg-source">Data: <a href="https://websoilsurvey.nrcs.usda.gov/" target="_blank" rel="noopener">USDA NRCS Web Soil Survey</a> (SSURGO). Polygons appear at zoom level 12 and above.</p>'
    ].join('');

    // Insert after info bar
    var infoEl = document.getElementById(CONFIG.infoId);
    if (infoEl && infoEl.parentNode) {
      infoEl.parentNode.insertBefore(panel, infoEl.nextSibling);
    } else {
      container.appendChild(panel);
    }
  }

  function onMapClick(e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    setInfo('<span class="us-soil-map-loading">Querying USDA NRCS soil data...</span>');

    var wkt = 'POINT(' + lng.toFixed(6) + ' ' + lat.toFixed(6) + ')';

    var sql = [
      'SELECT TOP 1',
      '  mu.muname, mu.musym, mu.mukind,',
      '  mua.farmlndcl, mua.drclassdcd, mua.taxorder, mua.taxsuborder',
      'FROM mapunit mu',
      'INNER JOIN muaggatt mua ON mu.mukey = mua.mukey',
      "INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('" + wkt + "') AS sf ON mu.mukey = sf.mukey"
    ].join(' ');

    var body = 'query=' + encodeURIComponent(sql);

    fetch(CONFIG.sdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderSoilInfo(data, lat, lng);
      })
      .catch(function () {
        setInfo('Could not retrieve soil data at this location. The area may not have SSURGO coverage, or a network error occurred.');
      });
  }

  function renderSoilInfo(data, lat, lng) {
    if (!data || !data.Table || data.Table.length === 0 ||
        !data.Table[0] || data.Table[0].length === 0) {
      setInfo('No SSURGO soil data found at this location (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '). This area may not have soil survey coverage.');
      return;
    }

    var row = data.Table[0];
    // Columns: muname, musym, mukind, farmlndcl, drclassdcd, taxorder, taxsuborder
    var muname   = row[0] || 'Unknown';
    var musym    = row[1] || '--';
    var mukind   = row[2] || '--';
    var farmland = row[3] || '--';
    var drainage = row[4] || '--';
    var taxorder = row[5] || '--';
    var taxsub   = row[6] || '--';

    var slopePhases = { A:'0-2% (level)', B:'2-6% (gentle)', C:'6-12% (moderate)', D:'12-18% (strong)', E:'18-25% (steep)', F:'>25% (very steep)' };
    var phaseChar = musym.replace(/[^A-Za-z]/g,'').slice(-1).toUpperCase();
    var slopeNote = slopePhases[phaseChar] ? ' &mdash; slope ' + slopePhases[phaseChar] : '';

    var attrs = [
      { label: 'Map Unit Name', val: muname + ' <span class="usm-musym">(' + musym + ')</span>' + slopeNote },
      { label: 'Unit Type', val: mukind },
      { label: 'Soil Taxonomy', val: taxorder + (taxsub && taxsub !== '--' ? ' / ' + taxsub : '') },
      { label: 'Drainage', val: drainage },
      { label: 'Farmland Class', val: farmland }
    ];

    var html = '<div class="us-soil-map-attrs">';
    attrs.forEach(function (a) {
      html += '<div class="us-soil-map-attr">' +
        '<span class="us-soil-map-attr-label">' + a.label + '</span>' +
        '<span class="us-soil-map-attr-val">' + a.val + '</span>' +
        '</div>';
    });
    html += '</div>';

    setInfo(html);
  }

  function setInfo(html) {
    var el = document.getElementById(CONFIG.infoId);
    if (el) el.innerHTML = html;
  }

  function updateShareUrl() {
    var center = map.getCenter();
    var opSlider = document.getElementById('us-soil-map-opacity');
    var op = opSlider ? parseFloat(opSlider.value) / 100 : CONFIG.defaultOpacity;

    var state = {
      lat: center.lat.toFixed(5),
      lng: center.lng.toFixed(5),
      z: map.getZoom(),
      op: op.toFixed(2),
      lyr: currentLayerKey
    };

    var hash = '#' + Object.keys(state)
      .map(function (k) { return k + '=' + encodeURIComponent(state[k]); })
      .join('&');

    history.replaceState(null, '', hash);
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

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
