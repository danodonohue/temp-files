(function () {
  'use strict';

  var CONFIG = {
    mapId: 'us-area-codes-map',
    controlsId: 'us-area-codes-controls',
    infoId: 'us-area-codes-info',
    serviceUrl: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Telephone_Area_Codes/FeatureServer/0',
    initialView: [38.5, -97.0],
    initialZoom: 4
  };

  // 20-colour palette — enough variation across 50+ states
  var PALETTE = [
    '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
    '#edc948','#b07aa1','#ff9da7','#9c755f','#66c2a5',
    '#1b9e77','#d95f02','#7570b3','#e7298a','#66a61e',
    '#e6ab02','#a6761d','#386cb0','#7fc97f','#beaed4'
  ];

  // Assign colours deterministically by state abbreviation
  var STATE_PALETTE = (function () {
    var states = ['AK','AL','AR','AS','AZ','CA','CO','CT','DC','DE',
      'FL','GA','GU','HI','IA','ID','IL','IN','KS','KY',
      'LA','MA','MD','ME','MI','MN','MO','MP','MS','MT',
      'NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK',
      'OR','PA','PR','RI','SC','SD','TN','TX','UT','VA',
      'VI','VT','WA','WI','WV','WY'];
    var map = {};
    states.forEach(function (s, i) {
      map[s] = PALETTE[i % PALETTE.length];
    });
    return map;
  }());

  function getStateColor(state) {
    return STATE_PALETTE[state] || '#aaaaaa';
  }

  function defaultStyle(feature) {
    var color = getStateColor(feature.properties.STATE);
    return {
      color: color,
      weight: 1,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.35
    };
  }

  function highlightStyle(feature) {
    var color = getStateColor(feature.properties.STATE);
    return {
      color: '#222',
      weight: 2.5,
      opacity: 1,
      fillColor: color,
      fillOpacity: 0.7
    };
  }

  var map, featureLayer;
  var areaCodeIndex = {};   // AREA_CODE -> Leaflet layer
  var activeLayer = null;
  var currentBasemapKey = 'light';
  var basemapTiles = {};

  var BASEMAPS = {
    light: {
      label: 'Light',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
    },
    streets: {
      label: 'Streets',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    satellite: {
      label: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri'
    }
  };

  function init() {
    var urlState = loadStateFromUrl();
    var lat  = (urlState && urlState.lat)  ? parseFloat(urlState.lat)  : CONFIG.initialView[0];
    var lng  = (urlState && urlState.lng)  ? parseFloat(urlState.lng)  : CONFIG.initialView[1];
    var zoom = (urlState && urlState.z)    ? parseInt(urlState.z, 10)  : CONFIG.initialZoom;
    var initAc = urlState && urlState.ac   ? urlState.ac               : null;

    map = L.map(CONFIG.mapId, { center: [lat, lng], zoom: zoom, zoomControl: true });

    Object.keys(BASEMAPS).forEach(function (key) {
      var bm = BASEMAPS[key];
      basemapTiles[key] = L.tileLayer(bm.url, { attribution: bm.attribution, maxZoom: 19 });
    });
    basemapTiles[currentBasemapKey].addTo(map);

    setInfo('<span class="usac-loading">Loading area code boundaries...</span>');
    buildFeatureLayer(initAc);
    buildControls();

    map.on('moveend', updateShareUrl);
    map.on('zoomend', updateShareUrl);
    updateShareUrl();
  }

  var loadingCleared = false;

  function clearLoadingState() {
    if (loadingCleared) return;
    loadingCleared = true;
    setInfo('Click any area code polygon to see details, or search by code above.');
  }

  function buildFeatureLayer(initAc) {
    featureLayer = L.esri.featureLayer({
      url: CONFIG.serviceUrl,
      style: defaultStyle,
      onEachFeature: function (feature, layer) {
        var code = feature.properties.AREA_CODE;
        if (code) areaCodeIndex[code] = layer;

        layer.bindTooltip('<strong>' + code + '</strong>', {
          sticky: true,
          className: 'usac-tooltip'
        });

        layer.on('click', function () {
          activateLayer(layer, feature.properties);
        });
        layer.on('mouseover', function () {
          if (layer !== activeLayer) {
            layer.setStyle({ weight: 2, fillOpacity: 0.55 });
          }
        });
        layer.on('mouseout', function () {
          if (layer !== activeLayer) {
            layer.setStyle(defaultStyle(feature));
          }
        });
      }
    });

    featureLayer.on('createfeature', clearLoadingState);
    featureLayer.on('load', function () {
      clearLoadingState();
      if (initAc && areaCodeIndex[initAc]) {
        activateLayer(areaCodeIndex[initAc], areaCodeIndex[initAc].feature.properties);
        map.fitBounds(areaCodeIndex[initAc].getBounds(), { padding: [40, 40] });
      }
    });

    featureLayer.addTo(map);
  }

  function activateLayer(layer, props) {
    if (activeLayer && activeLayer !== layer) {
      activeLayer.setStyle(defaultStyle(activeLayer.feature));
    }
    layer.setStyle(highlightStyle(layer.feature));
    layer.bringToFront();
    activeLayer = layer;

    var code  = props.AREA_CODE || '--';
    var state = props.STATE     || '--';
    var sqmi  = props.SQMI      ? Math.round(props.SQMI).toLocaleString() + ' sq mi' : '--';

    var html = '<div class="usac-attrs">' +
      '<div class="usac-attr"><span class="usac-attr-label">Area Code</span>' +
      '<span class="usac-attr-val"><span class="usac-badge">' + code + '</span></span></div>' +
      '<div class="usac-attr"><span class="usac-attr-label">State / Territory</span>' +
      '<span class="usac-attr-val">' + state + '</span></div>' +
      '<div class="usac-attr"><span class="usac-attr-label">Coverage Area</span>' +
      '<span class="usac-attr-val">' + sqmi + '</span></div>' +
      '</div>';

    setInfo(html);
    updateShareUrl(code);
  }

  function buildControls() {
    var controls = document.getElementById(CONFIG.controlsId);
    if (!controls) return;

    // Search
    var searchLabel = document.createElement('label');
    searchLabel.setAttribute('for', 'us-area-codes-search');
    searchLabel.textContent = 'Search:';

    var searchWrap = document.createElement('div');
    searchWrap.id = 'us-area-codes-search-wrap';

    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'us-area-codes-search';
    searchInput.placeholder = '212';
    searchInput.maxLength = 3;
    searchInput.setAttribute('inputmode', 'numeric');

    var goBtn = document.createElement('button');
    goBtn.id = 'us-area-codes-go';
    goBtn.textContent = 'Go';
    goBtn.addEventListener('click', function () { doSearch(searchInput.value.trim()); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch(searchInput.value.trim());
    });

    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(goBtn);

    // Basemap
    var basemapWrap = document.createElement('div');
    basemapWrap.id = 'us-area-codes-basemap-wrap';
    var bmLabel = document.createElement('label');
    bmLabel.textContent = 'Basemap:';
    basemapWrap.appendChild(bmLabel);

    Object.keys(BASEMAPS).forEach(function (key) {
      var btn = document.createElement('button');
      btn.className = 'usac-basemap-btn' + (key === currentBasemapKey ? ' active' : '');
      btn.textContent = BASEMAPS[key].label;
      btn.dataset.key = key;
      btn.addEventListener('click', function () {
        if (currentBasemapKey === this.dataset.key) return;
        map.removeLayer(basemapTiles[currentBasemapKey]);
        currentBasemapKey = this.dataset.key;
        basemapTiles[currentBasemapKey].addTo(map);
        basemapTiles[currentBasemapKey].bringToBack();
        document.querySelectorAll('.usac-basemap-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
      });
      basemapWrap.appendChild(btn);
    });

    // Share
    var shareBtn = document.createElement('button');
    shareBtn.id = 'us-area-codes-share';
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

    controls.appendChild(searchLabel);
    controls.appendChild(searchWrap);
    controls.appendChild(basemapWrap);
    controls.appendChild(shareBtn);
  }

  function doSearch(code) {
    if (!code || code.length !== 3) {
      setInfo('Please enter a valid 3-digit area code.');
      return;
    }
    var layer = areaCodeIndex[code];
    if (!layer) {
      setInfo('Area code ' + code + ' not found. Data may still be loading — try again in a moment.');
      return;
    }
    map.fitBounds(layer.getBounds(), { padding: [60, 60] });
    activateLayer(layer, layer.feature.properties);
  }

  function setInfo(html) {
    var el = document.getElementById(CONFIG.infoId);
    if (el) el.innerHTML = html;
  }

  function updateShareUrl(acOverride) {
    var center = map.getCenter();
    var ac = (typeof acOverride === 'string') ? acOverride
      : (activeLayer ? activeLayer.feature.properties.AREA_CODE : null);

    var state = {
      lat: center.lat.toFixed(5),
      lng: center.lng.toFixed(5),
      z: map.getZoom()
    };
    if (ac) state.ac = ac;

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
