(function () {
  'use strict';

  var SLUG = 'us-campgrounds-map';

  var COLORS = {
    'NPS':            '#2d7d46',
    'USFS':           '#7b4f2e',
    'BLM':            '#e07b39',
    'USACE':          '#2166ac',
    'USBR':           '#9b59b6',
    'FWS':            '#16a085',
    'TVA':            '#1abc9c',
    'Maryland SP':    '#c0392b',
    'Texas SP':       '#c0392b',
    'Utah SP':        '#c0392b',
    'New Mexico SP':  '#c0392b',
    'Virginia SP':    '#c0392b',
    'Presidio Trust': '#8e44ad',
    'CNIC':           '#2980b9'
  };
  var OSM_CLR  = '#888888';
  var DFLT_CLR = '#555555';

  function clr(ag) { return COLORS[ag] || DFLT_CLR; }

  function dot(color) {
    return L.divIcon({
      className: '',
      html: '<div style="width:9px;height:9px;border-radius:50%;background:' + color + ';border:1.5px solid rgba(0,0,0,0.3);box-sizing:border-box;"></div>',
      iconSize: [9, 9],
      iconAnchor: [4, 4]
    });
  }

  function getHash() {
    var h = window.location.hash.slice(1), o = {};
    if (!h) return o;
    h.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0) o[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    return o;
  }

  function setHash(map) {
    var c = map.getCenter();
    history.replaceState(null, '',
      '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom());
  }

  var container = document.getElementById(SLUG + '-container');
  if (!container) return;

  var mode    = container.getAttribute('data-mode') || 'hub';
  var jsonUrl = container.getAttribute('data-json-url') || '';
  var hs      = getHash();

  var map = L.map(SLUG + '-map', {
    center: [hs.lat ? +hs.lat : 39.5, hs.lng ? +hs.lng : -98.35],
    zoom:   hs.z   ? +hs.z   : (mode === 'hub' ? 4 : 7)
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  map.on('moveend', function () { setHash(map); });

  // Controls bar
  var ctrl = document.createElement('div');
  ctrl.id = SLUG + '-controls';

  var countEl = document.createElement('span');
  countEl.className = SLUG + '-count';
  countEl.textContent = 'Loading...';
  ctrl.appendChild(countEl);

  var legendItems = [
    ['#2d7d46', 'NPS'],
    ['#7b4f2e', 'USFS'],
    ['#e07b39', 'BLM'],
    ['#2166ac', 'USACE'],
    ['#9b59b6', 'USBR'],
    ['#c0392b', 'State'],
    ['#888888', 'OSM / Other']
  ];
  var leg = document.createElement('div');
  leg.className = SLUG + '-legend';
  legendItems.forEach(function (item) {
    var el = document.createElement('span');
    el.className = SLUG + '-legend-item';
    el.innerHTML =
      '<span class="' + SLUG + '-dot" style="background:' + item[0] + '"></span>' + item[1];
    leg.appendChild(el);
  });
  ctrl.appendChild(leg);

  container.insertBefore(ctrl, container.firstChild);

  var cluster = L.markerClusterGroup({ chunkedLoading: true });
  cluster.addTo(map);

  function ridbMarker(r) {
    var m = L.marker([r.lat, r.lng], { icon: dot(clr(r.ag)) });
    var b = '<strong>' + (r.n || 'Campground') + '</strong><br>';
    if (r.ag)  b += 'Agency: ' + r.ag + '<br>';
    b += 'Reservable: ' + (r.r ? 'Yes' : 'No') + '<br>';
    if (r.ph)  b += 'Phone: ' + r.ph + '<br>';
    if (r.sl)  b += 'Stay limit: ' + r.sl + '<br>';
    if (r.url) b += '<a href="' + r.url + '" target="_blank" rel="noopener">Book / Info &rarr;</a>';
    m.bindPopup(b);
    return m;
  }

  function osmMarker(r) {
    var m = L.marker([r.lat, r.lng], { icon: dot(OSM_CLR) });
    var b = '<strong>' + (r.n || 'Campground') + '</strong><br>';
    if (r.op)  b += 'Operator: ' + r.op + '<br>';
    if (r.fee) b += 'Fee: ' + r.fee + '<br>';
    if (r.w)   b += '<a href="' + r.w + '" target="_blank" rel="noopener">Website &rarr;</a>';
    m.bindPopup(b);
    return m;
  }

  if (!jsonUrl) { countEl.textContent = 'No data URL set'; return; }

  fetch(jsonUrl)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var markers = [];
      var bounds  = [];

      if (mode === 'spoke') {
        var ridb = data.ridb || [];
        var osm  = data.osm  || [];

        ridb.forEach(function (r) {
          if (r.lat && r.lng) {
            markers.push(ridbMarker(r));
            bounds.push([r.lat, r.lng]);
          }
        });
        osm.forEach(function (r) {
          if (r.lat && r.lng) {
            markers.push(osmMarker(r));
            bounds.push([r.lat, r.lng]);
          }
        });

        if (!hs.lat && bounds.length) {
          map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 10 });
        }
        cluster.addLayers(markers);
        countEl.textContent = (ridb.length + osm.length).toLocaleString() + ' campgrounds';

      } else {
        var features = data.features || [];
        features.forEach(function (r) {
          if (r.lat && r.lng) markers.push(ridbMarker(r));
        });
        cluster.addLayers(markers);
        countEl.textContent = features.length.toLocaleString() + ' federal campgrounds';
      }
    })
    .catch(function () {
      countEl.textContent = 'Error loading campground data';
    });

})();
