(function () {
  'use strict';

  var CONFIG = {
    slug: 'us-mine-shafts',
    typeName: 'ms:points',
    filterXml: '<Filter><Or><PropertyIsEqualTo><PropertyName>ftr_type</PropertyName><Literal>Mine Shaft</Literal></PropertyIsEqualTo><PropertyIsEqualTo><PropertyName>ftr_type</PropertyName><Literal>Adit</Literal></PropertyIsEqualTo></Or></Filter>',
    markerColor: '#5C3317',
    pageSize: 500,
    initialView: [39.5, -110.0],
    initialZoom: 5
  };

  var WFS_BASE = 'https://mrdata.usgs.gov/services/wfs/usmin';
  var allMarkers = [];
  var turfFC = { type: 'FeatureCollection', features: [] };
  var stateSet = {};
  var cluster = null;
  var map = null;
  var selectedState = '';
  var streetsLayer = null;
  var satelliteLayer = null;
  var activeBasemap = null;
  var _suppressNearest = false;

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var out = {};
    hash.split('&').forEach(function (pair) { var idx = pair.indexOf('='); if (idx < 0) return; out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1)); });
    return out.lat && out.lng ? out : null;
  }

  function updateShareUrl() {
    if (!map) return;
    var c = map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + map.getZoom() + (selectedState ? '&state=' + encodeURIComponent(selectedState) : '') + (activeBasemap === satelliteLayer ? '&layer=sat' : ''));
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function getEl(parent, name) { var el = parent.getElementsByTagNameNS('*', name)[0]; return el ? el.textContent.trim() : ''; }
  function setStatus(msg) { var el = document.getElementById(CONFIG.slug + '-status'); if (el) el.textContent = msg; }

  function parseGML(xmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    var members = doc.getElementsByTagNameNS('http://www.opengis.net/wfs/2.0', 'member');
    var features = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var pos = m.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'pos')[0];
      if (!pos) continue;
      var parts = pos.textContent.trim().split(/\s+/);
      var lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng)) continue;
      features.push({ lat: lat, lng: lng, state: getEl(m, 'state'), county: getEl(m, 'county'), ftr_type: getEl(m, 'ftr_type'), ftr_name: getEl(m, 'ftr_name'), topo_name: getEl(m, 'topo_name'), topo_date: getEl(m, 'topo_date'), url: getEl(m, 'url') });
    }
    return features;
  }

  function fetchPage(startIndex) {
    var url = WFS_BASE + '?service=WFS&version=2.0.0&request=GetFeature&typeName=' + CONFIG.typeName + '&count=' + CONFIG.pageSize + '&startIndex=' + startIndex + '&FILTER=' + encodeURIComponent(CONFIG.filterXml);
    fetch(url).then(function (r) { return r.text(); }).then(function (xml) {
      var features = parseGML(xml);
      features.forEach(addFeature);
      setStatus('Loaded ' + allMarkers.length + ' features...');
      if (features.length === CONFIG.pageSize) { fetchPage(startIndex + features.length); } else { setStatus(''); populateStateFilter(); }
    }).catch(function () { setStatus('Error loading data. Please refresh.'); });
  }

  function addFeature(f) {
    stateSet[f.state] = true;
    var marker = L.circleMarker([f.lat, f.lng], { radius: 5, fillColor: CONFIG.markerColor, color: '#fff', weight: 1, opacity: 1, fillOpacity: 0.85 });
    marker.bindPopup(buildPopup(f));
    marker.on('click', function () { _suppressNearest = true; });
    allMarkers.push({ marker: marker, state: f.state, data: f });
    cluster.addLayer(marker);
    turfFC.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { ftr_type: f.ftr_type, ftr_name: f.ftr_name, state: f.state, county: f.county, topo_name: f.topo_name, topo_date: f.topo_date, url: f.url } });
  }

  function buildPopup(f) {
    var html = '<div class="' + CONFIG.slug + '-popup"><strong>' + esc(f.ftr_type) + '</strong>';
    if (f.ftr_name) html += '<br>' + esc(f.ftr_name);
    if (f.county || f.state) html += '<br>' + esc([f.county, f.state].filter(Boolean).join(', '));
    if (f.topo_name) html += '<br><em>Topo: ' + esc(f.topo_name) + ' (' + esc(f.topo_date) + ')</em>';
    if (f.url) html += '<br><a href="' + esc(f.url) + '" target="_blank" rel="noopener">USGS record</a>';
    return html + '</div>';
  }

  function nearestPopup(e) {
    if (!turfFC.features.length) return;
    var clicked = turf.point([e.latlng.lng, e.latlng.lat]);
    var nearest = turf.nearestPoint(clicked, turfFC);
    var dist = turf.distance(clicked, nearest, { units: 'kilometers' });
    var p = nearest.properties;
    var html = '<div class="' + CONFIG.slug + '-popup"><strong>Nearest: ' + esc(p.ftr_type) + '</strong>';
    if (p.ftr_name) html += '<br>' + esc(p.ftr_name);
    html += '<br>' + esc([p.county, p.state].filter(Boolean).join(', '));
    html += '<br><em>' + dist.toFixed(1) + ' km (' + (dist * 0.621371).toFixed(1) + ' mi) away</em>';
    if (p.url) html += '<br><a href="' + esc(p.url) + '" target="_blank" rel="noopener">USGS record</a>';
    html += '</div>';
    L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(html).openOn(map);
  }

  function populateStateFilter() {
    var sel = document.getElementById(CONFIG.slug + '-state-filter');
    if (!sel) return;
    Object.keys(stateSet).sort().forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
    var urlState = loadStateFromUrl();
    if (urlState && urlState.state) { sel.value = urlState.state; selectedState = urlState.state; applyFilter(); }
  }

  function applyFilter() {
    cluster.clearLayers();
    allMarkers.forEach(function (m) { if (!selectedState || m.state === selectedState) cluster.addLayer(m.marker); });
  }

  function downloadGeoJSON() {
    var list = selectedState ? allMarkers.filter(function (m) { return m.state === selectedState; }) : allMarkers;
    var blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: list.map(function (m) { var f = m.data; return { type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { ftr_type: f.ftr_type, ftr_name: f.ftr_name, state: f.state, county: f.county, topo_name: f.topo_name, topo_date: f.topo_date } }; }) })], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = CONFIG.slug + (selectedState ? '-' + selectedState : '') + '.geojson'; a.click(); URL.revokeObjectURL(a.href);
  }

  function init() {
    var urlState = loadStateFromUrl();
    var center = (urlState && urlState.lat) ? [parseFloat(urlState.lat), parseFloat(urlState.lng)] : CONFIG.initialView;
    var zoom = (urlState && urlState.z) ? parseInt(urlState.z) : CONFIG.initialZoom;
    map = L.map(CONFIG.slug + '-map', { center: center, zoom: zoom });
    streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: <a href="https://mrdata.usgs.gov/">USGS Mineral Resources</a>', maxZoom: 19 });
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri | Data: <a href="https://mrdata.usgs.gov/">USGS Mineral Resources</a>', maxZoom: 19 });
    activeBasemap = (urlState && urlState.layer === 'sat') ? satelliteLayer : streetsLayer;
    activeBasemap.addTo(map);
    cluster = L.markerClusterGroup({ chunkedLoading: true });
    map.addLayer(cluster);
    map.on('moveend', updateShareUrl);
    map.on('click', function (e) { if (_suppressNearest) { _suppressNearest = false; return; } nearestPopup(e); });
    var toggleBtn = document.getElementById(CONFIG.slug + '-layer-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = (activeBasemap === satelliteLayer) ? 'Street Map' : 'Satellite';
      toggleBtn.addEventListener('click', function () { map.removeLayer(activeBasemap); activeBasemap = (activeBasemap === streetsLayer) ? satelliteLayer : streetsLayer; activeBasemap.addTo(map); this.textContent = (activeBasemap === streetsLayer) ? 'Satellite' : 'Street Map'; updateShareUrl(); });
    }
    var sel = document.getElementById(CONFIG.slug + '-state-filter');
    if (sel) sel.addEventListener('change', function () { selectedState = this.value; applyFilter(); updateShareUrl(); });
    var dlBtn = document.getElementById(CONFIG.slug + '-download');
    if (dlBtn) dlBtn.addEventListener('click', downloadGeoJSON);
    setStatus('Loading features...');
    fetchPage(0);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
