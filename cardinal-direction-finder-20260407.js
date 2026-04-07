(function () {
  'use strict';

  var SLUG    = 'cardinal-direction-finder';
  var NOM_URL = 'https://nominatim.openstreetmap.org';

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var fromInput  = document.getElementById('cdf-from');
  var toInput    = document.getElementById('cdf-to');
  var findBtn    = document.getElementById('cdf-find-btn');
  var locateBtn  = document.getElementById('cdf-locate-btn');
  var statusEl   = document.getElementById('cdf-status');
  var resultEl   = document.getElementById('cdf-result');
  var dirMainEl  = document.getElementById('cdf-dir-main');
  var bearingEl  = document.getElementById('cdf-bearing');
  var reverseEl  = document.getElementById('cdf-reverse');
  var shareBtn   = document.getElementById('cdf-share-btn');

  // ── State ─────────────────────────────────────────────────────────────────
  var fromPt     = null;
  var toPt       = null;
  var fromMarker = null;
  var toMarker   = null;
  var routeLine  = null;
  var arrowMkr   = null;
  var compassCtrl = null;

  // ── Map ───────────────────────────────────────────────────────────────────
  var urlState = loadState();

  var map = L.map(SLUG + '-map', {
    center: [20, 0],
    zoom: 2
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // ── Compass rose Leaflet control ──────────────────────────────────────────
  var CdfCompass = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var el = L.DomUtil.create('div', 'cdf-compass-wrap');
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      this._el = el;
      el.innerHTML = buildCompassSVG(null);
      return el;
    },
    update: function (bearing) {
      if (this._el) { this._el.innerHTML = buildCompassSVG(bearing); }
    }
  });

  compassCtrl = new CdfCompass();
  compassCtrl.addTo(map);

  // ── Compass SVG builder ───────────────────────────────────────────────────
  function buildCompassSVG(bearing) {
    var S = 118, cx = 59, cy = 59;
    var rOuter = 44, rInner = 16;
    var out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '">';

    // Background circle
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (cx - 1) + '" fill="rgba(255,255,255,0.94)" stroke="#ccc" stroke-width="1.5"/>';

    // Outer ring
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" fill="none" stroke="#e0e0e0" stroke-width="1"/>';

    // 16 tick marks at 22.5° intervals
    for (var i = 0; i < 16; i++) {
      var deg = i * 22.5;
      var rad = deg * Math.PI / 180;
      var isCardinal = (i % 4 === 0);
      var r1 = isCardinal ? rInner + 2 : rOuter - 8;
      var r2 = rOuter - (isCardinal ? 0 : 4);
      var color = (i === 0) ? '#c0392b' : '#aaa';
      var sw    = isCardinal ? 2.5 : 1.2;
      var x1 = (cx + r1 * Math.sin(rad)).toFixed(2);
      var y1 = (cy - r1 * Math.cos(rad)).toFixed(2);
      var x2 = (cx + r2 * Math.sin(rad)).toFixed(2);
      var y2 = (cy - r2 * Math.cos(rad)).toFixed(2);
      out += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' +
             ' stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    }

    // N / E / S / W labels
    var cardinals = [
      { deg: 0,   text: 'N', color: '#c0392b' },
      { deg: 90,  text: 'E', color: '#555' },
      { deg: 180, text: 'S', color: '#555' },
      { deg: 270, text: 'W', color: '#555' }
    ];
    cardinals.forEach(function (c) {
      var r = c.deg * Math.PI / 180;
      var lx = (cx + (rOuter + 10) * Math.sin(r)).toFixed(2);
      var ly = (cy - (rOuter + 10) * Math.cos(r) + 4).toFixed(2);
      out += '<text x="' + lx + '" y="' + ly + '" text-anchor="middle"' +
             ' font-size="10" font-weight="700" fill="' + c.color + '"' +
             ' font-family="sans-serif">' + c.text + '</text>';
    });

    // Bearing needle (only when bearing is known)
    if (bearing !== null) {
      var bRad = bearing * Math.PI / 180;
      var tipX  = (cx + (rOuter - 4) * Math.sin(bRad)).toFixed(2);
      var tipY  = (cy - (rOuter - 4) * Math.cos(bRad)).toFixed(2);
      var tailX = (cx - (rInner + 2) * Math.sin(bRad)).toFixed(2);
      var tailY = (cy + (rInner + 2) * Math.cos(bRad)).toFixed(2);

      out += '<line x1="' + tailX + '" y1="' + tailY + '" x2="' + tipX + '" y2="' + tipY + '"' +
             ' stroke="#4a90d9" stroke-width="3" stroke-linecap="round"/>';

      // Arrowhead
      var ah = 25 * Math.PI / 180;
      var al = 9;
      var tipXn = parseFloat(tipX), tipYn = parseFloat(tipY);
      var ah1x = (tipXn - al * Math.sin(bRad + Math.PI - ah)).toFixed(2);
      var ah1y = (tipYn + al * Math.cos(bRad + Math.PI - ah)).toFixed(2);
      var ah2x = (tipXn - al * Math.sin(bRad + Math.PI + ah)).toFixed(2);
      var ah2y = (tipYn + al * Math.cos(bRad + Math.PI + ah)).toFixed(2);
      out += '<polygon points="' + tipX + ',' + tipY + ' ' + ah1x + ',' + ah1y + ' ' + ah2x + ',' + ah2y + '"' +
             ' fill="#4a90d9"/>';
    }

    // Centre dot
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="3.5" fill="#444"/>';
    out += '</svg>';
    return out;
  }

  // ── Bearing calculation ───────────────────────────────────────────────────
  function calcBearing(from, to) {
    var lat1 = from.lat * Math.PI / 180;
    var lat2 = to.lat  * Math.PI / 180;
    var dLon = (to.lng - from.lng) * Math.PI / 180;
    var x = Math.sin(dLon) * Math.cos(lat2);
    var y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360;
  }

  var DIRS = [
    { abbr: 'N',   name: 'North' },
    { abbr: 'NNE', name: 'North-Northeast' },
    { abbr: 'NE',  name: 'Northeast' },
    { abbr: 'ENE', name: 'East-Northeast' },
    { abbr: 'E',   name: 'East' },
    { abbr: 'ESE', name: 'East-Southeast' },
    { abbr: 'SE',  name: 'Southeast' },
    { abbr: 'SSE', name: 'South-Southeast' },
    { abbr: 'S',   name: 'South' },
    { abbr: 'SSW', name: 'South-Southwest' },
    { abbr: 'SW',  name: 'Southwest' },
    { abbr: 'WSW', name: 'West-Southwest' },
    { abbr: 'W',   name: 'West' },
    { abbr: 'WNW', name: 'West-Northwest' },
    { abbr: 'NW',  name: 'Northwest' },
    { abbr: 'NNW', name: 'North-Northwest' }
  ];

  function bearingToDir(bearing) {
    return DIRS[Math.round(bearing / 22.5) % 16];
  }

  // ── Short display name ────────────────────────────────────────────────────
  function shortName(fullName) {
    return (fullName || '').split(',')[0].trim();
  }

  // ── Geocoding ─────────────────────────────────────────────────────────────
  function geocode(query, cb) {
    fetch(NOM_URL + '/search?format=json&limit=1&q=' + encodeURIComponent(query))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.length) { cb(null); return; }
        cb({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name });
      })
      .catch(function () { cb(null); });
  }

  function reverseGeocode(lat, lng, cb) {
    fetch(NOM_URL + '/reverse?format=json&lat=' + lat + '&lon=' + lng)
      .then(function (r) { return r.json(); })
      .then(function (data) { cb(data.display_name || (lat.toFixed(4) + ', ' + lng.toFixed(4))); })
      .catch(function () { cb(lat.toFixed(4) + ', ' + lng.toFixed(4)); });
  }

  // ── Markers ───────────────────────────────────────────────────────────────
  function makeIcon(cls, letter) {
    return L.divIcon({
      html: '<div class="cdf-marker ' + cls + '">' + letter + '</div>',
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16]
    });
  }

  function placeMarker(type, pt) {
    var isCls = type === 'from' ? 'cdf-marker-a' : 'cdf-marker-b';
    var letter = type === 'from' ? 'A' : 'B';
    var label  = type === 'from' ? 'From: ' : 'To: ';
    var icon   = makeIcon(isCls, letter);
    var mkr    = L.marker([pt.lat, pt.lng], { icon: icon })
                  .bindPopup('<b>' + label + '</b>' + shortName(pt.name))
                  .addTo(map);
    if (type === 'from') { if (fromMarker) map.removeLayer(fromMarker); fromMarker = mkr; }
    else                 { if (toMarker)   map.removeLayer(toMarker);   toMarker   = mkr; }
  }

  // ── Map drawing ───────────────────────────────────────────────────────────
  function drawLine(from, to, bearing) {
    if (routeLine) { map.removeLayer(routeLine); }
    if (arrowMkr)  { map.removeLayer(arrowMkr);  }

    routeLine = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
      color: '#4a90d9',
      weight: 2,
      dashArray: '6 5',
      opacity: 0.75
    }).addTo(map);

    // Direction arrow at midpoint
    var midLat = (from.lat + to.lat) / 2;
    var midLng = (from.lng + to.lng) / 2;
    var arrowIcon = L.divIcon({
      html: '<div style="transform:rotate(' + Math.round(bearing) + 'deg);font-size:16px;color:#4a90d9;line-height:1;width:16px;height:16px;margin-top:-8px;margin-left:-8px;">&#9650;</div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    arrowMkr = L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }).addTo(map);
  }

  // ── Result rendering ──────────────────────────────────────────────────────
  function renderResult(from, to, bearing, dir) {
    var fromShort = shortName(from.name);
    var toShort   = shortName(to.name);
    var revBear   = (bearing + 180) % 360;
    var revDir    = bearingToDir(revBear);

    dirMainEl.innerHTML =
      '<span class="cdf-highlight">' + toShort + '</span>' +
      ' is to the <span class="cdf-highlight">' + dir.name.toUpperCase() + '</span>' +
      ' of ' + fromShort;

    bearingEl.textContent = 'Bearing: ' + Math.round(bearing) + '\u00b0 (' + dir.name + ')';
    reverseEl.textContent = 'Reverse: from ' + toShort + ', ' + fromShort +
                            ' is to the ' + revDir.name + ' (' + Math.round(revBear) + '\u00b0)';

    resultEl.style.display = 'block';
    compassCtrl.update(bearing);
  }

  // ── Main action ───────────────────────────────────────────────────────────
  function findDirection() {
    var fromVal = fromInput.value.trim();
    var toVal   = toInput.value.trim();
    if (!fromVal || !toVal) { setStatus('Please enter both a From and To location.'); return; }

    findBtn.disabled = true;
    setStatus('Searching\u2026');

    geocode(fromVal, function (from) {
      if (!from) {
        setStatus('Could not find "' + fromVal + '". Try a more specific name.');
        findBtn.disabled = false; return;
      }
      geocode(toVal, function (to) {
        if (!to) {
          setStatus('Could not find "' + toVal + '". Try a more specific name.');
          findBtn.disabled = false; return;
        }

        fromPt = from; toPt = to;

        placeMarker('from', from);
        placeMarker('to', to);

        var bearing = calcBearing(from, to);
        drawLine(from, to, bearing);

        map.fitBounds(
          [[from.lat, from.lng], [to.lat, to.lng]],
          { padding: [50, 50], maxZoom: 12 }
        );

        renderResult(from, to, bearing, bearingToDir(bearing));
        saveState(from, to);
        setStatus('');
        findBtn.disabled = false;
      });
    });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  function setStatus(msg) { statusEl.textContent = msg; }

  // ── Geolocation ───────────────────────────────────────────────────────────
  if (locateBtn) {
    locateBtn.addEventListener('click', function () {
      if (!navigator.geolocation) { setStatus('Geolocation is not supported by your browser.'); return; }
      setStatus('Getting your location\u2026');
      locateBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude, lng = pos.coords.longitude;
          reverseGeocode(lat, lng, function (name) {
            fromInput.value = shortName(name) || (lat.toFixed(4) + ', ' + lng.toFixed(4));
            fromPt = { lat: lat, lng: lng, name: name };
            setStatus('');
            locateBtn.disabled = false;
          });
        },
        function () { setStatus('Could not get your location.'); locateBtn.disabled = false; }
      );
    });
  }

  // ── Share button ──────────────────────────────────────────────────────────
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var url = window.location.href.split('#')[0] + window.location.hash;
      navigator.clipboard.writeText(url).then(function () {
        var orig = shareBtn.textContent;
        shareBtn.textContent = 'Copied!';
        setTimeout(function () { shareBtn.textContent = orig; }, 2000);
      });
    });
  }

  // ── URL state ─────────────────────────────────────────────────────────────
  function saveState(from, to) {
    var h = 'flat=' + from.lat.toFixed(5) +
            '&flng=' + from.lng.toFixed(5) +
            '&fname=' + encodeURIComponent(shortName(from.name)) +
            '&tlat=' + to.lat.toFixed(5) +
            '&tlng=' + to.lng.toFixed(5) +
            '&tname=' + encodeURIComponent(shortName(to.name));
    history.replaceState(null, '', '#' + h);
  }

  function loadState() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var p = {};
    hash.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      p[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    return (p.flat && p.flng && p.tlat && p.tlng) ? p : null;
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  findBtn.addEventListener('click', findDirection);
  [fromInput, toInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') findDirection(); });
  });

  // ── Restore from URL ──────────────────────────────────────────────────────
  if (urlState) {
    var from = { lat: parseFloat(urlState.flat), lng: parseFloat(urlState.flng), name: urlState.fname };
    var to   = { lat: parseFloat(urlState.tlat), lng: parseFloat(urlState.tlng), name: urlState.tname };
    fromInput.value = urlState.fname;
    toInput.value   = urlState.tname;
    fromPt = from; toPt = to;
    placeMarker('from', from);
    placeMarker('to',   to);
    var b = calcBearing(from, to);
    drawLine(from, to, b);
    map.fitBounds([[from.lat, from.lng], [to.lat, to.lng]], { padding: [50, 50], maxZoom: 12 });
    renderResult(from, to, b, bearingToDir(b));
  }

})();
