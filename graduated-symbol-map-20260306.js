(function () {
  'use strict';

  var SLUG = 'graduated-symbol-map';

  var CONFIG = {
    mapId: SLUG + '-map',
    initialView: [39.5, -98.35],
    initialZoom: 4,
    defaultMinRadius: 8,
    defaultMaxRadius: 32,
    defaultColor: '#e63946',
    defaultSymbol: 'circle'
  };

  var SAMPLE_CSV = [
    'city,lat,lng,population',
    'New York,40.7128,-74.0060,8336817',
    'Los Angeles,34.0522,-118.2437,3979576',
    'Chicago,41.8781,-87.6298,2693976',
    'Houston,29.7604,-95.3698,2320268',
    'Phoenix,33.4484,-112.0740,1608139',
    'Philadelphia,39.9526,-75.1652,1584064',
    'San Antonio,29.4241,-98.4936,1434625',
    'San Diego,32.7157,-117.1611,1386932',
    'Dallas,32.7767,-96.7970,1304379',
    'San Jose,37.3382,-121.8863,1013240',
    'Austin,30.2672,-97.7431,961855',
    'Jacksonville,30.3322,-81.6557,949611',
    'Fort Worth,32.7555,-97.3308,918915',
    'Columbus,39.9612,-82.9988,905748',
    'Charlotte,35.2271,-80.8431,897062',
    'Indianapolis,39.7684,-86.1581,887642',
    'San Francisco,37.7749,-122.4194,874961',
    'Seattle,47.6062,-122.3321,737255',
    'Denver,39.7392,-104.9903,715522',
    'Nashville,36.1627,-86.7816,689447'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Icon library — Font Awesome 6 Free solid icons, organised by category
  // ---------------------------------------------------------------------------

  var ICON_CATEGORIES = [
    { cat: 'Shapes', icons: [
      { n: 'circle',          l: 'Circle' },
      { n: 'square',          l: 'Square' },
      { n: 'star',            l: 'Star' },
      { n: 'heart',           l: 'Heart' },
      { n: 'bookmark',        l: 'Bookmark' },
      { n: 'gem',             l: 'Diamond' },
      { n: 'shield',          l: 'Shield' },
      { n: 'flag',            l: 'Flag' },
      { n: 'tag',             l: 'Tag' },
      { n: 'thumbtack',       l: 'Thumbtack' },
      { n: 'certificate',     l: 'Certificate' },
      { n: 'award',           l: 'Award' }
    ]},
    { cat: 'Location', icons: [
      { n: 'location-dot',    l: 'Location' },
      { n: 'map-pin',         l: 'Map Pin' },
      { n: 'compass',         l: 'Compass' },
      { n: 'crosshairs',      l: 'Target' },
      { n: 'signs-post',      l: 'Signpost' },
      { n: 'flag-checkered',  l: 'Finish' },
      { n: 'location-arrow',  l: 'Direction' },
      { n: 'map',             l: 'Map' }
    ]},
    { cat: 'Buildings', icons: [
      { n: 'house',           l: 'House' },
      { n: 'building',        l: 'Building' },
      { n: 'city',            l: 'City' },
      { n: 'church',          l: 'Church' },
      { n: 'hospital',        l: 'Hospital' },
      { n: 'warehouse',       l: 'Warehouse' },
      { n: 'industry',        l: 'Factory' },
      { n: 'store',           l: 'Store' },
      { n: 'university',      l: 'University' },
      { n: 'landmark',        l: 'Landmark' },
      { n: 'school',          l: 'School' },
      { n: 'hotel',           l: 'Hotel' },
      { n: 'monument',        l: 'Monument' },
      { n: 'place-of-worship',l: 'Worship' },
      { n: 'vault',           l: 'Bank' }
    ]},
    { cat: 'Transport', icons: [
      { n: 'car',             l: 'Car' },
      { n: 'truck',           l: 'Truck' },
      { n: 'bus',             l: 'Bus' },
      { n: 'train',           l: 'Train' },
      { n: 'plane',           l: 'Plane' },
      { n: 'ship',            l: 'Ship' },
      { n: 'bicycle',         l: 'Bicycle' },
      { n: 'motorcycle',      l: 'Motorcycle' },
      { n: 'rocket',          l: 'Rocket' },
      { n: 'anchor',          l: 'Anchor' },
      { n: 'gas-pump',        l: 'Gas Station' },
      { n: 'helicopter',      l: 'Helicopter' },
      { n: 'ferry',           l: 'Ferry' },
      { n: 'road',            l: 'Road' },
      { n: 'person-walking',  l: 'Walking' }
    ]},
    { cat: 'Nature', icons: [
      { n: 'tree',            l: 'Tree' },
      { n: 'leaf',            l: 'Leaf' },
      { n: 'seedling',        l: 'Plant' },
      { n: 'mountain',        l: 'Mountain' },
      { n: 'fire',            l: 'Fire' },
      { n: 'sun',             l: 'Sun' },
      { n: 'cloud',           l: 'Cloud' },
      { n: 'snowflake',       l: 'Snow' },
      { n: 'bolt',            l: 'Lightning' },
      { n: 'wind',            l: 'Wind' },
      { n: 'water',           l: 'Water' },
      { n: 'globe',           l: 'Globe' },
      { n: 'moon',            l: 'Moon' },
      { n: 'rainbow',         l: 'Rainbow' },
      { n: 'volcano',         l: 'Volcano' }
    ]},
    { cat: 'Food & Drink', icons: [
      { n: 'utensils',        l: 'Restaurant' },
      { n: 'mug-hot',         l: 'Cafe' },
      { n: 'beer-mug-empty',  l: 'Bar' },
      { n: 'wine-glass',      l: 'Wine' },
      { n: 'pizza-slice',     l: 'Pizza' },
      { n: 'burger',          l: 'Burger' },
      { n: 'cake-candles',    l: 'Bakery' },
      { n: 'cookie-bite',     l: 'Bakery' },
      { n: 'apple-whole',     l: 'Food' },
      { n: 'carrot',          l: 'Veg' }
    ]},
    { cat: 'Recreation', icons: [
      { n: 'futbol',          l: 'Soccer' },
      { n: 'golf-ball-tee',   l: 'Golf' },
      { n: 'basketball',      l: 'Basketball' },
      { n: 'baseball',        l: 'Baseball' },
      { n: 'football',        l: 'American Football' },
      { n: 'person-hiking',   l: 'Hiking' },
      { n: 'tent',            l: 'Camping' },
      { n: 'fish',            l: 'Fishing' },
      { n: 'camera',          l: 'Photography' },
      { n: 'music',           l: 'Music' },
      { n: 'dumbbell',        l: 'Gym' },
      { n: 'person-swimming', l: 'Swimming' },
      { n: 'person-biking',   l: 'Cycling' },
      { n: 'horse',           l: 'Equestrian' },
      { n: 'binoculars',      l: 'Wildlife' }
    ]},
    { cat: 'Services', icons: [
      { n: 'shopping-cart',   l: 'Shopping' },
      { n: 'graduation-cap',  l: 'Education' },
      { n: 'stethoscope',     l: 'Medical' },
      { n: 'briefcase',       l: 'Business' },
      { n: 'wrench',          l: 'Repair' },
      { n: 'scissors',        l: 'Salon' },
      { n: 'paw',             l: 'Vet / Pet' },
      { n: 'book',            l: 'Library' },
      { n: 'baby',            l: 'Childcare' },
      { n: 'user-doctor',     l: 'Doctor' },
      { n: 'tooth',           l: 'Dentist' },
      { n: 'glasses',         l: 'Optician' },
      { n: 'pills',           l: 'Pharmacy' },
      { n: 'hand-holding-heart', l: 'Charity' }
    ]},
    { cat: 'Emergency', icons: [
      { n: 'shield-halved',       l: 'Security' },
      { n: 'truck-medical',       l: 'Ambulance' },
      { n: 'fire-extinguisher',   l: 'Fire Ext.' },
      { n: 'triangle-exclamation',l: 'Warning' },
      { n: 'circle-exclamation',  l: 'Alert' },
      { n: 'skull-crossbones',    l: 'Danger' },
      { n: 'kit-medical',         l: 'First Aid' },
      { n: 'person-falling',      l: 'Hazard' },
      { n: 'radiation',           l: 'Radiation' },
      { n: 'biohazard',           l: 'Biohazard' }
    ]},
    { cat: 'Industry', icons: [
      { n: 'tower-broadcast',  l: 'Tower' },
      { n: 'plug',             l: 'Power' },
      { n: 'satellite',        l: 'Satellite' },
      { n: 'satellite-dish',   l: 'Dish' },
      { n: 'flask',            l: 'Lab' },
      { n: 'microscope',       l: 'Science' },
      { n: 'oil-can',          l: 'Oil' },
      { n: 'tractor',          l: 'Farm' },
      { n: 'solar-panel',      l: 'Solar' },
      { n: 'tower-cell',       l: 'Cell Tower' },
      { n: 'wind',             l: 'Wind Energy' },
      { n: 'temperature-half', l: 'Weather Stn.' },
      { n: 'gauge',            l: 'Sensor' }
    ]},
    { cat: 'People', icons: [
      { n: 'person',          l: 'Person' },
      { n: 'people-group',    l: 'Group' },
      { n: 'user',            l: 'User' },
      { n: 'users',           l: 'Users' },
      { n: 'child',           l: 'Child' },
      { n: 'person-cane',     l: 'Elderly' },
      { n: 'venus-mars',      l: 'Gender' },
      { n: 'head-side-mask',  l: 'Health' }
    ]}
  ];

  // Flat list for searching
  var ALL_ICONS = [];
  ICON_CATEGORIES.forEach(function (cat) {
    cat.icons.forEach(function (icon) {
      ALL_ICONS.push({ n: icon.n, l: icon.l, cat: cat.cat });
    });
  });

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------

  var map;
  var markerLayer;

  var state = {
    rows: [],
    headers: [],
    color: CONFIG.defaultColor,
    minRadius: CONFIG.defaultMinRadius,
    maxRadius: CONFIG.defaultMaxRadius,
    classMode: 'proportional',
    numClasses: 5,
    symbol: CONFIG.defaultSymbol
  };

  var el = {};

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function init() {
    map = L.map(CONFIG.mapId, {
      center: CONFIG.initialView,
      zoom: CONFIG.initialZoom
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    cacheEls();
    buildSymbolPicker();
    bindEvents();
    loadStateFromUrl();
    map.on('moveend', updateShareUrl);
  }

  function cacheEls() {
    var ids = [
      'csv-input', 'file-input', 'load-btn', 'sample-btn', 'status',
      'lat-col', 'lng-col', 'val-col', 'label-col',
      'color', 'min-radius', 'max-radius', 'min-r-val', 'max-r-val',
      'class-mode', 'num-classes', 'classes-row', 'legend',
      'download-btn', 'download-format',
      'symbol-picker', 'icon-search', 'icon-cat'
    ];
    ids.forEach(function (id) {
      el[id] = document.getElementById(SLUG + '-' + id);
    });
  }

  // ---------------------------------------------------------------------------
  // Symbol picker
  // ---------------------------------------------------------------------------

  function buildSymbolPicker() {
    // Populate category select
    if (el['icon-cat']) {
      ICON_CATEGORIES.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.cat;
        opt.textContent = cat.cat;
        el['icon-cat'].appendChild(opt);
      });
    }
    renderPickerIcons(ALL_ICONS);
  }

  function renderPickerIcons(icons) {
    var container = el['symbol-picker'];
    if (!container) return;
    container.innerHTML = '';
    if (!icons.length) {
      container.innerHTML = '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:8px 0;">No icons found</p>';
      return;
    }
    icons.forEach(function (icon) {
      var btn = document.createElement('button');
      btn.setAttribute('data-shape', icon.n);
      btn.setAttribute('title', icon.l + ' (' + icon.cat + ')');
      btn.className = SLUG + '-symbol-btn' + (icon.n === state.symbol ? ' gsm-symbol-active' : '');
      btn.innerHTML = '<i class="fa-solid fa-' + escHtml(icon.n) + '"></i>';
      container.appendChild(btn);
    });
  }

  function filterPickerIcons() {
    var query = (el['icon-search'] ? el['icon-search'].value : '').toLowerCase().trim();
    var cat   = el['icon-cat'] ? el['icon-cat'].value : '';
    var filtered = ALL_ICONS.filter(function (icon) {
      var matchCat  = !cat   || icon.cat === cat;
      var matchText = !query || icon.n.indexOf(query) >= 0 || icon.l.toLowerCase().indexOf(query) >= 0;
      return matchCat && matchText;
    });
    renderPickerIcons(filtered);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function bindEvents() {
    el['sample-btn'].addEventListener('click', function () {
      el['csv-input'].value = SAMPLE_CSV;
      parseAndRender();
    });

    el['load-btn'].addEventListener('click', parseAndRender);

    el['file-input'].addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var ext = file.name.split('.').pop().toLowerCase();
      var reader = new FileReader();
      reader.onload = function (evt) {
        var text = evt.target.result;
        if (ext === 'geojson' || ext === 'json') {
          el['csv-input'].value = '';
          parseGeoJSONText(text);
        } else if (ext === 'kml') {
          el['csv-input'].value = '';
          parseKMLText(text);
        } else if (ext === 'gpx') {
          el['csv-input'].value = '';
          parseGPXText(text);
        } else {
          el['csv-input'].value = text;
          parseAndRender();
        }
      };
      reader.readAsText(file);
    });

    el['color'].addEventListener('input', rerenderMarkers);

    el['min-radius'].addEventListener('input', function () {
      el['min-r-val'].textContent = el['min-radius'].value + 'px';
      rerenderMarkers();
    });

    el['max-radius'].addEventListener('input', function () {
      el['max-r-val'].textContent = el['max-radius'].value + 'px';
      rerenderMarkers();
    });

    el['class-mode'].addEventListener('change', function () {
      el['classes-row'].style.display = el['class-mode'].value === 'graduated' ? 'flex' : 'none';
      rerenderMarkers();
    });

    el['num-classes'].addEventListener('change', rerenderMarkers);
    el['lat-col'].addEventListener('change', rerenderMarkers);
    el['lng-col'].addEventListener('change', rerenderMarkers);
    el['val-col'].addEventListener('change', rerenderMarkers);
    el['label-col'].addEventListener('change', rerenderMarkers);

    if (el['icon-search']) {
      el['icon-search'].addEventListener('input', filterPickerIcons);
    }
    if (el['icon-cat']) {
      el['icon-cat'].addEventListener('change', filterPickerIcons);
    }

    el['symbol-picker'].addEventListener('click', function (e) {
      var btn = e.target.closest('[data-shape]');
      if (!btn) return;
      state.symbol = btn.getAttribute('data-shape');
      el['symbol-picker'].querySelectorAll('[data-shape]').forEach(function (b) {
        b.classList.toggle('gsm-symbol-active', b === btn);
      });
      rerenderMarkers();
    });

    el['download-btn'].addEventListener('click', handleDownload);
  }

  // ---------------------------------------------------------------------------
  // Parse — CSV
  // ---------------------------------------------------------------------------

  function parseAndRender() {
    var csv = el['csv-input'].value.trim();
    if (!csv) { setStatus('Paste CSV data or load a file.', true); return; }
    var result = Papa.parse(csv, { header: true, skipEmptyLines: true, dynamicTyping: true });
    if (!result.data.length) { setStatus('Could not parse CSV. Check format.', true); return; }
    normalizeAndRender(result.data, result.meta.fields || []);
  }

  // ---------------------------------------------------------------------------
  // Parse — GeoJSON
  // ---------------------------------------------------------------------------

  function parseGeoJSONText(text) {
    var geojson;
    try { geojson = JSON.parse(text); } catch (e) {
      setStatus('Invalid GeoJSON file.', true); return;
    }
    var features = [];
    if (geojson.type === 'FeatureCollection') features = geojson.features || [];
    else if (geojson.type === 'Feature') features = [geojson];

    var rows = [], headerOrder = ['lat', 'lng'], seenProps = {};
    features.forEach(function (f) {
      if (!f.geometry || f.geometry.type !== 'Point') return;
      var row = { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      if (f.properties) {
        Object.keys(f.properties).forEach(function (k) {
          row[k] = f.properties[k];
          if (!seenProps[k]) { seenProps[k] = true; headerOrder.push(k); }
        });
      }
      rows.push(row);
    });
    if (!rows.length) { setStatus('No Point features found in GeoJSON.', true); return; }
    normalizeAndRender(rows, headerOrder);
  }

  // ---------------------------------------------------------------------------
  // Parse — KML
  // ---------------------------------------------------------------------------

  function parseKMLText(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'text/xml');
    var placemarks = doc.querySelectorAll('Placemark');
    var rows = [], headerOrder = ['lat', 'lng'], seenProps = {};

    function addProp(row, key, val) {
      row[key] = val;
      if (!seenProps[key]) { seenProps[key] = true; headerOrder.push(key); }
    }

    placemarks.forEach(function (pm) {
      var pointEl = pm.querySelector('Point');
      if (!pointEl) return;
      var coordEl = pointEl.querySelector('coordinates');
      if (!coordEl) return;
      var parts = coordEl.textContent.trim().split(',');
      if (parts.length < 2) return;
      var row = { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
      var nameEl = pm.querySelector('name');
      if (nameEl && nameEl.textContent.trim()) addProp(row, 'name', nameEl.textContent.trim());
      var descEl = pm.querySelector('description');
      if (descEl && descEl.textContent.trim()) addProp(row, 'description', descEl.textContent.trim());
      pm.querySelectorAll('SimpleData').forEach(function (sd) {
        var k = sd.getAttribute('name');
        if (k) addProp(row, k, sd.textContent.trim());
      });
      pm.querySelectorAll('Data').forEach(function (d) {
        var k = d.getAttribute('name');
        var v = d.querySelector('value');
        if (k && v) addProp(row, k, v.textContent.trim());
      });
      rows.push(row);
    });
    if (!rows.length) { setStatus('No Point placemarks found in KML.', true); return; }
    normalizeAndRender(rows, headerOrder);
  }

  // ---------------------------------------------------------------------------
  // Parse — GPX
  // ---------------------------------------------------------------------------

  function parseGPXText(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'text/xml');
    var wpts = doc.querySelectorAll('wpt');
    var rows = [], headerOrder = ['lat', 'lng'], seenProps = {};

    function addProp(row, key, val) {
      row[key] = val;
      if (!seenProps[key]) { seenProps[key] = true; headerOrder.push(key); }
    }

    wpts.forEach(function (wpt) {
      var lat = parseFloat(wpt.getAttribute('lat'));
      var lng = parseFloat(wpt.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lng)) return;
      var row = { lat: lat, lng: lng };
      ['name', 'desc', 'ele', 'sym', 'type', 'cmt'].forEach(function (tag) {
        var e2 = wpt.querySelector(tag);
        if (e2 && e2.textContent.trim()) addProp(row, tag, e2.textContent.trim());
      });
      rows.push(row);
    });
    if (!rows.length) { setStatus('No waypoints found in GPX.', true); return; }
    normalizeAndRender(rows, headerOrder);
  }

  // ---------------------------------------------------------------------------
  // Normalize & render
  // ---------------------------------------------------------------------------

  function normalizeAndRender(rows, headers) {
    state.rows = rows;
    state.headers = headers;
    populateSelectors();
    autoDetect();
    renderMarkers(true);
  }

  function populateSelectors() {
    ['lat-col', 'lng-col', 'val-col', 'label-col'].forEach(function (key, i) {
      var prev = el[key].value;
      el[key].innerHTML = '<option value="">' + (i === 3 ? '(none)' : 'Select...') + '</option>';
      state.headers.forEach(function (h) {
        var opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        if (h === prev) opt.selected = true;
        el[key].appendChild(opt);
      });
    });
  }

  function autoDetect() {
    var latRx = /^(lat|latitude|y)$/i;
    var lngRx = /^(lng|lon|long|longitude|x)$/i;
    var valRx = /^(value|val|count|total|population|pop|amount|size|magnitude|score|rate|number|num)$/i;
    var lblRx = /^(name|label|city|place|location|title|id|code|region|country|state|desc|description)$/i;

    state.headers.forEach(function (h) {
      if (!el['lat-col'].value   && latRx.test(h)) el['lat-col'].value   = h;
      if (!el['lng-col'].value   && lngRx.test(h)) el['lng-col'].value   = h;
      if (!el['val-col'].value   && valRx.test(h)) el['val-col'].value   = h;
      if (!el['label-col'].value && lblRx.test(h)) el['label-col'].value = h;
    });

    if (!el['val-col'].value) {
      state.headers.forEach(function (h) {
        if (el['val-col'].value) return;
        if (h === el['lat-col'].value || h === el['lng-col'].value) return;
        var sample = state.rows.slice(0, 5).map(function (r) { return r[h]; });
        if (sample.every(function (v) { return typeof v === 'number' && !isNaN(v); })) {
          el['val-col'].value = h;
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render markers
  // ---------------------------------------------------------------------------

  function rerenderMarkers() {
    if (!state.rows.length) return;
    renderMarkers();
  }

  function makeIcon(iconName, sizePx, fillColor) {
    var fs = Math.max(10, Math.round(sizePx * 0.85));
    return L.divIcon({
      html: '<div class="' + SLUG + '-icon-wrap" style="width:' + sizePx + 'px;height:' + sizePx + 'px;">' +
            '<i class="fa-solid fa-' + escHtml(iconName) + '" style="font-size:' + fs + 'px;color:' + escHtml(fillColor) + ';"></i>' +
            '</div>',
      className: SLUG + '-marker',
      iconSize: [sizePx, sizePx],
      iconAnchor: [sizePx / 2, sizePx / 2]
    });
  }

  function renderMarkers(zoomToData) {
    var latCol   = el['lat-col'].value;
    var lngCol   = el['lng-col'].value;
    var valCol   = el['val-col'].value;
    var labelCol = el['label-col'].value;

    if (!latCol || !lngCol || !valCol) {
      setStatus('Select Latitude, Longitude, and Value columns.', true);
      return;
    }

    state.color      = el['color'].value;
    state.minRadius  = parseInt(el['min-radius'].value);
    state.maxRadius  = parseInt(el['max-radius'].value);
    state.classMode  = el['class-mode'].value;
    state.numClasses = parseInt(el['num-classes'].value);

    markerLayer.clearLayers();

    var values = state.rows
      .map(function (r) { return parseFloat(r[valCol]); })
      .filter(function (v) { return !isNaN(v); });

    if (!values.length) { setStatus('No numeric values in Value column.', true); return; }

    var minVal    = Math.min.apply(null, values);
    var maxVal    = Math.max.apply(null, values);
    var range     = maxVal - minVal || 1;
    var minR      = state.minRadius;
    var maxR      = state.maxRadius;
    var graduated = state.classMode === 'graduated';

    var breaks  = graduated ? computeBreaks(minVal, maxVal, state.numClasses) : [];
    var palette = graduated ? buildPalette(state.color, state.numClasses) : [];

    var bounds = L.latLngBounds();
    var count = 0;
    state.rows.forEach(function (row) {
      var lat = parseFloat(row[latCol]);
      var lng = parseFloat(row[lngCol]);
      var val = parseFloat(row[valCol]);
      if (isNaN(lat) || isNaN(lng) || isNaN(val)) return;

      var sizePx, fillColor;
      if (graduated) {
        var idx = classIndex(val, breaks);
        sizePx    = Math.round(minR + (idx / (state.numClasses - 1)) * (maxR - minR)) * 2;
        fillColor = palette[idx];
      } else {
        sizePx    = Math.round(minR + ((val - minVal) / range) * (maxR - minR)) * 2;
        fillColor = state.color;
      }
      sizePx = Math.max(12, sizePx);

      var marker = L.marker([lat, lng], { icon: makeIcon(state.symbol, sizePx, fillColor) });

      var popupHtml = '<table style="font-size:0.85em;border-collapse:collapse;">';
      state.headers.forEach(function (h) {
        popupHtml += '<tr><td style="padding:2px 8px 2px 0;font-weight:600;">' + escHtml(String(h)) + '</td>';
        popupHtml += '<td style="padding:2px 0;">' + escHtml(String(row[h] != null ? row[h] : '')) + '</td></tr>';
      });
      popupHtml += '</table>';

      var title = labelCol && row[labelCol] != null
        ? '<strong>' + escHtml(String(row[labelCol])) + '</strong><br>'
        : '';
      marker.bindPopup(title + popupHtml);
      marker.addTo(markerLayer);
      bounds.extend([lat, lng]);
      count++;
    });

    buildLegend(minVal, maxVal, breaks, palette, valCol);
    setStatus(count + ' points mapped.');
    if (zoomToData && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    updateShareUrl();
  }

  // ---------------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------------

  function computeBreaks(minVal, maxVal, n) {
    var breaks = [];
    var step = (maxVal - minVal) / n;
    for (var i = 0; i <= n; i++) breaks.push(minVal + i * step);
    return breaks;
  }

  function classIndex(val, breaks) {
    for (var i = 0; i < breaks.length - 1; i++) {
      if (val <= breaks[i + 1]) return i;
    }
    return breaks.length - 2;
  }

  function buildPalette(hex, n) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var colors = [];
    for (var i = 0; i < n; i++) {
      var t = (i + 1) / n;
      colors.push('rgb(' +
        Math.round(r * t + 255 * (1 - t)) + ',' +
        Math.round(g * t + 255 * (1 - t)) + ',' +
        Math.round(b * t + 255 * (1 - t)) + ')');
    }
    return colors;
  }

  // ---------------------------------------------------------------------------
  // Legend
  // ---------------------------------------------------------------------------

  function buildLegend(minVal, maxVal, breaks, palette, valCol) {
    if (!el['legend']) return;
    var maxSz  = state.maxRadius * 2;
    var minSz  = state.minRadius * 2;
    var boxSz  = maxSz + 8;

    function legendRow(sizePx, fillColor, label) {
      var fs = Math.max(10, Math.round(sizePx * 0.85));
      return '<div class="' + SLUG + '-legend-item">' +
        '<div class="' + SLUG + '-legend-icon" style="width:' + boxSz + 'px;height:' + boxSz + 'px;">' +
        '<i class="fa-solid fa-' + escHtml(state.symbol) + '" style="font-size:' + fs + 'px;color:' + escHtml(fillColor) + ';"></i>' +
        '</div>' +
        '<span>' + escHtml(label) + '</span></div>';
    }

    var html = '<div class="' + SLUG + '-legend-title">' + escHtml(valCol) + '</div>';
    html += '<div class="' + SLUG + '-legend-items">';

    if (state.classMode === 'proportional') {
      [
        { sz: minSz,             fill: state.color, val: minVal },
        { sz: (minSz + maxSz)/2, fill: state.color, val: (minVal + maxVal) / 2 },
        { sz: maxSz,             fill: state.color, val: maxVal }
      ].forEach(function (s) { html += legendRow(s.sz, s.fill, fmtNum(s.val)); });
    } else {
      for (var i = 0; i < breaks.length - 1; i++) {
        var sz = minSz + (i / (state.numClasses - 1)) * (maxSz - minSz);
        html += legendRow(sz, palette[i], fmtNum(breaks[i]) + ' - ' + fmtNum(breaks[i + 1]));
      }
    }

    html += '</div>';
    el['legend'].innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Downloads
  // ---------------------------------------------------------------------------

  function handleDownload() {
    var fmt = el['download-format'] ? el['download-format'].value : 'geojson';
    if (fmt === 'csv')     downloadCSV();
    else if (fmt === 'kml')  downloadKML();
    else if (fmt === 'gpx')  downloadGPX();
    else                     downloadGeoJSON();
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadGeoJSON() {
    var latCol = el['lat-col'].value, lngCol = el['lng-col'].value;
    if (!latCol || !lngCol || !state.rows.length) { setStatus('Map data first.', true); return; }
    var features = [];
    state.rows.forEach(function (row) {
      var lat = parseFloat(row[latCol]), lng = parseFloat(row[lngCol]);
      if (isNaN(lat) || isNaN(lng)) return;
      var props = {};
      state.headers.forEach(function (h) { props[h] = row[h]; });
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });
    });
    triggerDownload(
      new Blob([JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2)], { type: 'application/json' }),
      'graduated-symbol-map.geojson'
    );
  }

  function downloadCSV() {
    if (!state.rows.length) { setStatus('Map data first.', true); return; }
    var lines = [state.headers.map(csvCell).join(',')];
    state.rows.forEach(function (row) {
      lines.push(state.headers.map(function (h) { return csvCell(row[h] != null ? String(row[h]) : ''); }).join(','));
    });
    triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), 'graduated-symbol-map.csv');
  }

  function downloadKML() {
    var latCol = el['lat-col'].value, lngCol = el['lng-col'].value, labelCol = el['label-col'].value;
    if (!latCol || !lngCol || !state.rows.length) { setStatus('Map data first.', true); return; }
    var lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'];
    state.rows.forEach(function (row) {
      var lat = parseFloat(row[latCol]), lng = parseFloat(row[lngCol]);
      if (isNaN(lat) || isNaN(lng)) return;
      var name = labelCol && row[labelCol] != null ? escXml(String(row[labelCol])) : '';
      lines.push('<Placemark>');
      if (name) lines.push('<name>' + name + '</name>');
      lines.push('<ExtendedData>');
      state.headers.forEach(function (h) {
        lines.push('<Data name="' + escXml(String(h)) + '"><value>' + escXml(String(row[h] != null ? row[h] : '')) + '</value></Data>');
      });
      lines.push('</ExtendedData><Point><coordinates>' + lng + ',' + lat + ',0</coordinates></Point></Placemark>');
    });
    lines.push('</Document></kml>');
    triggerDownload(new Blob([lines.join('\n')], { type: 'application/vnd.google-earth.kml+xml' }), 'graduated-symbol-map.kml');
  }

  function downloadGPX() {
    var latCol = el['lat-col'].value, lngCol = el['lng-col'].value, labelCol = el['label-col'].value;
    if (!latCol || !lngCol || !state.rows.length) { setStatus('Map data first.', true); return; }
    var lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="MapScaping" xmlns="http://www.topografix.com/GPX/1/1">'];
    state.rows.forEach(function (row) {
      var lat = parseFloat(row[latCol]), lng = parseFloat(row[lngCol]);
      if (isNaN(lat) || isNaN(lng)) return;
      lines.push('<wpt lat="' + lat + '" lon="' + lng + '">');
      var name = labelCol && row[labelCol] != null ? String(row[labelCol]) : '';
      if (name) lines.push('<name>' + escXml(name) + '</name>');
      var descParts = [];
      state.headers.forEach(function (h) {
        if (h === latCol || h === lngCol || h === labelCol) return;
        if (row[h] != null && row[h] !== '') descParts.push(h + ': ' + row[h]);
      });
      if (descParts.length) lines.push('<desc>' + escXml(descParts.join('; ')) + '</desc>');
      lines.push('</wpt>');
    });
    lines.push('</gpx>');
    triggerDownload(new Blob([lines.join('\n')], { type: 'application/gpx+xml' }), 'graduated-symbol-map.gpx');
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function fmtNum(n) {
    if (Math.abs(n) >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
    if (Math.abs(n) >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
    return parseFloat(n.toFixed(2)).toString();
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function csvCell(s) {
    s = String(s);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function setStatus(msg, isError) {
    if (!el['status']) return;
    el['status'].textContent = msg;
    el['status'].style.color = isError ? '#c0392b' : '#27ae60';
  }

  // ---------------------------------------------------------------------------
  // Share URL
  // ---------------------------------------------------------------------------

  function updateShareUrl() {
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) +
      '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom() +
      '&color=' + encodeURIComponent(state.color) +
      '&minr=' + state.minRadius + '&maxr=' + state.maxRadius +
      '&symbol=' + encodeURIComponent(state.symbol));
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var p = {};
    hash.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      p[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    if (p.lat && p.lng && p.z) map.setView([parseFloat(p.lat), parseFloat(p.lng)], parseInt(p.z));
    if (p.color && el['color'])  { el['color'].value = p.color; state.color = p.color; }
    if (p.minr  && el['min-radius']) { el['min-radius'].value = p.minr; el['min-r-val'].textContent = p.minr + 'px'; }
    if (p.maxr  && el['max-radius']) { el['max-radius'].value = p.maxr; el['max-r-val'].textContent = p.maxr + 'px'; }
    if (p.symbol) {
      state.symbol = p.symbol;
      // picker will be re-rendered with active state on next filterPickerIcons or initial render
      if (el['symbol-picker']) {
        el['symbol-picker'].querySelectorAll('[data-shape]').forEach(function (b) {
          b.classList.toggle('gsm-symbol-active', b.getAttribute('data-shape') === p.symbol);
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
