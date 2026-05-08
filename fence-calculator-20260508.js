var fenceCalc = (function () {
  'use strict';

  var GATE_COST = { installed: 350, diy: 165 };
  var FT_PER_M = 3.28084;

  var map, drawnItems;
  var totalLengthFt = 0;
  var unitMode = 'ft';
  var segments = [];
  var segCounter = 0;

  // ---- Init ----

  function init() {
    if (!document.getElementById('fence-calc-map')) return;

    map = L.map('fence-calc-map', { center: [39.5, -98.35], zoom: 4 });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri', maxZoom: 20 }
    ).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, opacity: 0.85 }
    ).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    map.addControl(new L.Control.Draw({
      position: 'topright',
      draw: {
        polyline: {
          shapeOptions: { color: '#f59e0b', weight: 4, opacity: 0.95 },
          repeatMode: true
        },
        polygon: false, circle: false, rectangle: false, marker: false, circlemarker: false
      },
      edit: { featureGroup: drawnItems, remove: true }
    }));

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);

    bindUI();
    loadFromHash();
    updateCost();
    renderSegmentList();
  }

  // ---- Drawing events ----

  function onCreated(e) {
    segCounter++;
    var layer = e.layer;
    layer._fenceId = segCounter;
    drawnItems.addLayer(layer);
    segments.push({ id: segCounter, layer: layer });
    updateLength();
    renderSegmentList();
  }

  function onEdited() {
    updateLength();
    renderSegmentList();
  }

  function onDeleted() {
    segments = segments.filter(function (s) { return drawnItems.hasLayer(s.layer); });
    updateLength();
    renderSegmentList();
  }

  // ---- Length ----

  function calcLayerFt(layer) {
    var lls = layer.getLatLngs();
    var m = 0;
    for (var i = 1; i < lls.length; i++) m += lls[i - 1].distanceTo(lls[i]);
    return m * FT_PER_M;
  }

  function updateLength() {
    var total = 0;
    drawnItems.eachLayer(function (layer) {
      var ft = calcLayerFt(layer);
      total += ft;
      var label = unitMode === 'ft' ? Math.round(ft) + ' ft' : (ft / FT_PER_M).toFixed(1) + ' m';
      setLayerTooltip(layer, label);
    });
    totalLengthFt = total;
    renderLength();
    updateCost();
    updatePosts();
  }

  function renderLength() {
    var el = document.getElementById('fence-calc-length-value');
    var unitEl = document.getElementById('fence-calc-length-unit');
    if (!el) return;
    if (unitMode === 'ft') {
      el.textContent = Math.round(totalLengthFt).toLocaleString();
      if (unitEl) unitEl.textContent = 'linear ft';
    } else {
      el.textContent = (totalLengthFt / FT_PER_M).toFixed(1);
      if (unitEl) unitEl.textContent = 'linear m';
    }
  }

  function setLayerTooltip(layer, label) {
    if (layer.getTooltip && layer.getTooltip()) {
      layer.setTooltipContent(label);
    } else {
      layer.bindTooltip(label, { permanent: false, direction: 'center' });
    }
  }

  // ---- Post estimator ----

  function updatePosts() {
    var el = document.getElementById('fence-calc-posts-count');
    if (!el) return;
    if (totalLengthFt === 0 || segments.length === 0) { el.textContent = '0'; return; }

    var spacingInput = document.getElementById('fence-calc-spacing');
    var spacingVal = parseFloat(spacingInput ? spacingInput.value : (unitMode === 'ft' ? 8 : 2.4));
    if (!spacingVal || spacingVal <= 0) spacingVal = unitMode === 'ft' ? 8 : 2.4;

    var spacingFt = unitMode === 'ft' ? spacingVal : spacingVal * FT_PER_M;

    var posts = 0;
    segments.forEach(function (seg) {
      var ft = calcLayerFt(seg.layer);
      posts += Math.round(ft / spacingFt) + 1;
    });

    el.textContent = posts;
  }

  // ---- Segment list ----

  function renderSegmentList() {
    var container = document.getElementById('fence-calc-segments');
    if (!container) return;

    if (segments.length === 0) {
      container.innerHTML = '<p class="fence-calc-no-runs">No fence runs drawn yet</p>';
      return;
    }

    var html = '';
    segments.forEach(function (seg, i) {
      var ft = calcLayerFt(seg.layer);
      var lenStr = unitMode === 'ft'
        ? Math.round(ft) + ' ft'
        : (ft / FT_PER_M).toFixed(1) + ' m';
      html += '<div class="fence-calc-seg-row">' +
        '<span class="fence-calc-seg-name">Run ' + (i + 1) + '</span>' +
        '<span class="fence-calc-seg-len">' + lenStr + '</span>' +
        '<button class="fence-calc-seg-del" onclick="fenceCalc.deleteSegment(' + seg.id + ')">Remove</button>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function deleteSegment(id) {
    var seg = null;
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].id === id) { seg = segments[i]; break; }
    }
    if (!seg) return;
    drawnItems.removeLayer(seg.layer);
    segments = segments.filter(function (s) { return s.id !== id; });
    updateLength();
    renderSegmentList();
  }

  // ---- Cost ----

  function updateCost() {
    var rateInput = document.getElementById('fence-calc-rate');
    var rateUnitEl = document.getElementById('fence-calc-rate-unit');
    var resultEl = document.getElementById('fence-calc-cost-result');
    var descEl = document.getElementById('fence-calc-cost-desc');
    if (!resultEl) return;

    if (rateUnitEl) rateUnitEl.textContent = unitMode === 'ft' ? '/ linear ft' : '/ linear m';

    var rate = rateInput ? parseFloat(rateInput.value) : 0;
    var gates = parseInt((document.getElementById('fence-calc-gates') || {}).value, 10) || 0;
    var gateCostInput = document.getElementById('fence-calc-gate-cost');
    var gateCost = gateCostInput ? parseFloat(gateCostInput.value) || 0 : 0;

    if (!isFinite(rate) || rate < 0) rate = 0;

    if (totalLengthFt === 0) {
      resultEl.textContent = 'Draw your fence to see estimate';
      descEl.textContent = 'Click the line tool on the map, then trace your fence route on the satellite imagery';
      return;
    }

    var lengthInUnit = unitMode === 'ft' ? totalLengthFt : totalLengthFt / FT_PER_M;
    var total = Math.round(lengthInUnit * rate + gates * gateCost);

    resultEl.textContent = rate > 0 ? '$' + total.toLocaleString() : 'Enter a cost per unit to see estimate';

    var heightInput = document.getElementById('fence-calc-height');
    var htVal = heightInput ? parseFloat(heightInput.value) : '';
    var htStr = htVal ? htVal + ' ' + unitMode : '';
    var lenStr = unitMode === 'ft'
      ? Math.round(totalLengthFt) + ' ft'
      : (totalLengthFt / FT_PER_M).toFixed(1) + ' m';
    var gateStr = gates > 0 ? ', ' + gates + ' gate' + (gates > 1 ? 's' : '') : '';
    descEl.textContent = lenStr + (htStr ? ' of ' + htStr + ' fence' : '') + gateStr;
  }

  // ---- Unit toggle ----

  function toggleUnits() {
    var heightInput = document.getElementById('fence-calc-height');
    var spacingInput = document.getElementById('fence-calc-spacing');
    var rateInput = document.getElementById('fence-calc-rate');

    if (unitMode === 'ft') {
      unitMode = 'm';
      if (heightInput) heightInput.value = round1(parseFloat(heightInput.value) / FT_PER_M);
      if (spacingInput) spacingInput.value = round1(parseFloat(spacingInput.value) / FT_PER_M);
      if (rateInput) rateInput.value = round1(parseFloat(rateInput.value) * FT_PER_M);
    } else {
      unitMode = 'ft';
      if (heightInput) heightInput.value = round1(parseFloat(heightInput.value) * FT_PER_M);
      if (spacingInput) spacingInput.value = round1(parseFloat(spacingInput.value) * FT_PER_M);
      if (rateInput) rateInput.value = round1(parseFloat(rateInput.value) / FT_PER_M);
    }

    var btn = document.getElementById('fence-calc-unit-toggle');
    if (btn) btn.textContent = unitMode === 'ft' ? 'Switch to Metres' : 'Switch to Feet';

    var huEl = document.getElementById('fence-calc-height-unit');
    var suEl = document.getElementById('fence-calc-spacing-unit');
    if (huEl) huEl.textContent = unitMode;
    if (suEl) suEl.textContent = unitMode;

    renderLength();
    drawnItems.eachLayer(function (layer) {
      var ft = calcLayerFt(layer);
      var label = unitMode === 'ft' ? Math.round(ft) + ' ft' : (ft / FT_PER_M).toFixed(1) + ' m';
      setLayerTooltip(layer, label);
    });
    renderSegmentList();
    updateCost();
    updatePosts();
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  // ---- Labor toggle ----

  function onLaborChange() {
    var labor = document.querySelector('input[name="fence-calc-labor"]:checked').value;
    var gateCostInput = document.getElementById('fence-calc-gate-cost');
    if (gateCostInput) gateCostInput.value = GATE_COST[labor];
    updateCost();
  }

  // ---- UI binding ----

  function bindUI() {
    var btns = {
      'fence-calc-search-btn': searchAddress,
      'fence-calc-location-btn': useMyLocation,
      'fence-calc-clear': clearAll,
      'fence-calc-unit-toggle': toggleUnits,
      'fence-calc-share': shareLink
    };
    Object.keys(btns).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', btns[id]);
    });

    var addr = document.getElementById('fence-calc-address');
    if (addr) addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') searchAddress(); });

    ['fence-calc-rate', 'fence-calc-gates', 'fence-calc-gate-cost', 'fence-calc-height'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', updateCost);
    });

    var spacing = document.getElementById('fence-calc-spacing');
    if (spacing) spacing.addEventListener('input', updatePosts);

    document.querySelectorAll('input[name="fence-calc-labor"]').forEach(function (r) {
      r.addEventListener('change', onLaborChange);
    });
  }

  // ---- Address / location ----

  function searchAddress() {
    var q = (document.getElementById('fence-calc-address') || {}).value;
    if (!q || !q.trim()) return;
    setStatus('Searching...');
    fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q.trim()) + '&limit=1')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.length) { setStatus('Address not found'); return; }
        map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 18);
        setStatus('');
      })
      .catch(function () { setStatus('Search failed'); });
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setStatus('Geolocation not supported'); return; }
    setStatus('Getting location...');
    navigator.geolocation.getCurrentPosition(function (pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 18);
      setStatus('');
    }, function () { setStatus('Location access denied'); });
  }

  // ---- Utility ----

  function clearAll() {
    drawnItems.clearLayers();
    segments = [];
    segCounter = 0;
    totalLengthFt = 0;
    renderLength();
    updateCost();
    updatePosts();
    renderSegmentList();
  }

  function shareLink() {
    var c = map.getCenter();
    var url = window.location.href.split('#')[0] +
      '#lat=' + c.lat.toFixed(5) + '&lng=' + c.lng.toFixed(5) + '&z=' + map.getZoom();
    var btn = document.getElementById('fence-calc-share');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        if (btn) { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = 'Share Link'; }, 2000); }
      });
    } else { window.prompt('Share this link:', url); }
  }

  function loadFromHash() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var p = {};
    hash.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      p[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    if (p.lat && p.lng && p.z) map.setView([parseFloat(p.lat), parseFloat(p.lng)], parseInt(p.z, 10));
  }

  function setStatus(msg) {
    var el = document.getElementById('fence-calc-status');
    if (el) el.textContent = msg;
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    searchAddress: searchAddress,
    useMyLocation: useMyLocation,
    clearAll: clearAll,
    deleteSegment: deleteSegment
  };
})();
