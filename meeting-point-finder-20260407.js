(function () {
  'use strict';

  var SLUG = 'meeting-point-finder';
  var MAX_LOCATIONS = 3;
  var MIN_LOCATIONS = 2;

  var map;
  var locationMarkers = [];
  var midpointMarker = null;
  var routeLines = [];
  var poiMarkers = null;
  var locationInputs = [];
  var nextInputId = 0;
  var currentMid = null;       // stored after calculation so POI selectors can refresh live
  var poiRefreshTimer = null;  // debounce timer
  var poiRequestId = 0;        // increments each request so stale responses are ignored

  var POI_TYPES = {
    restaurant: { label: 'Restaurants', icon: 'R', osm: 'amenity=restaurant' },
    cafe:       { label: 'Cafes',        icon: 'C', osm: 'amenity=cafe' },
    pub:        { label: 'Pubs & Bars',  icon: 'B', osm: 'amenity=pub' },
    fast_food:  { label: 'Fast Food',    icon: 'F', osm: 'amenity=fast_food' },
    park:       { label: 'Parks',        icon: 'K', osm: 'leisure=park' },
    library:    { label: 'Libraries',    icon: 'L', osm: 'amenity=library' },
    parking:    { label: 'Parking',      icon: 'P', osm: 'amenity=parking' }
  };

  // ── Init ─────────────────────────────────────────────────────────────

  function init() {
    map = L.map(SLUG + '-map', { center: [30, 0], zoom: 2 });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    poiMarkers = L.layerGroup().addTo(map);

    var saved = loadStateFromUrl();
    if (saved && saved.locs) {
      var locs = saved.locs.split('|');
      locs.forEach(function (a) { addLocationInput(decodeURIComponent(a)); });
      var sel = document.getElementById('mpf-poi-type');
      if (sel && saved.poi) sel.value = saved.poi;
    } else {
      addLocationInput('');
      addLocationInput('');
    }

    document.getElementById('mpf-add-location').addEventListener('click', function () {
      if (locationInputs.length < MAX_LOCATIONS) addLocationInput('');
    });
    document.getElementById('mpf-find-btn').addEventListener('click', findMeetingPoint);
    document.getElementById('mpf-share-btn').addEventListener('click', copyShareLink);

    // Live POI refresh when type or radius changes — no need to recalculate meeting point
    document.getElementById('mpf-poi-type').addEventListener('change', refreshPOIs);
    document.getElementById('mpf-radius').addEventListener('change', refreshPOIs);
  }

  function refreshPOIs() {
    if (!currentMid) return; // meeting point not yet calculated
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer = setTimeout(function () {
      var poiKey = document.getElementById('mpf-poi-type').value;
      var radius = parseFloat(document.getElementById('mpf-radius').value) || 5;
      var reqId = ++poiRequestId; // stamp this request
      if (poiMarkers) poiMarkers.clearLayers();
      document.getElementById('mpf-poi-list').innerHTML = '<p class="mpf-status">Searching nearby...</p>';
      var mid = currentMid;
      findNearbyPOIs(mid.lat, mid.lng, poiKey, radius)
        .then(function (els) {
          if (reqId !== poiRequestId) return; // a newer request already fired, discard this
          renderPOIs(els, mid, poiKey);
        });
    }, 600); // wait 600ms after the last change before firing
  }

  // ── Location inputs ───────────────────────────────────────────────────

  function addLocationInput(value) {
    var id = nextInputId++;
    locationInputs.push(id);

    var list = document.getElementById('mpf-locations-list');
    var row = document.createElement('div');
    row.className = 'mpf-location-row';
    row.id = 'mpf-row-' + id;

    var label = document.createElement('span');
    label.className = 'mpf-location-num';
    label.textContent = 'Person ' + locationInputs.length;

    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'mpf-addr-' + id;
    input.className = 'mpf-addr-input';
    input.placeholder = 'Enter address or city...';
    input.value = value || '';
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') findMeetingPoint();
    });

    row.appendChild(label);
    row.appendChild(input);
    if (locationInputs.length > MIN_LOCATIONS) row.appendChild(makeRemoveBtn(id));
    list.appendChild(row);
    updateAddButton();
  }

  function makeRemoveBtn(id) {
    var btn = document.createElement('button');
    btn.className = 'mpf-remove-btn';
    btn.textContent = 'x';
    btn.addEventListener('click', function () { removeLocationInput(id); });
    return btn;
  }

  function removeLocationInput(id) {
    var idx = locationInputs.indexOf(id);
    if (idx > -1) locationInputs.splice(idx, 1);
    var row = document.getElementById('mpf-row-' + id);
    if (row) row.remove();
    renumberInputs();
    updateAddButton();
  }

  function renumberInputs() {
    locationInputs.forEach(function (id, i) {
      var row = document.getElementById('mpf-row-' + id);
      if (!row) return;
      var num = row.querySelector('.mpf-location-num');
      if (num) num.textContent = 'Person ' + (i + 1);
      var removeBtn = row.querySelector('.mpf-remove-btn');
      if (locationInputs.length <= MIN_LOCATIONS && removeBtn) {
        removeBtn.remove();
      } else if (locationInputs.length > MIN_LOCATIONS && !removeBtn) {
        row.appendChild(makeRemoveBtn(id));
      }
    });
  }

  function updateAddButton() {
    var btn = document.getElementById('mpf-add-location');
    if (!btn) return;
    var atMax = locationInputs.length >= MAX_LOCATIONS;
    btn.disabled = atMax;
    btn.textContent = atMax ? 'Max 3 locations' : '+ Add a 3rd location';
  }

  // ── Geocoding (Nominatim) ─────────────────────────────────────────────

  function geocodeAddress(address) {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(address);
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.length === 0) throw new Error('Address not found: "' + address + '"');
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name };
      });
  }

  function reverseGeocode(lat, lng) {
    var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng;
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.display_name || (lat.toFixed(4) + ', ' + lng.toFixed(4)); })
      .catch(function () { return lat.toFixed(4) + ', ' + lng.toFixed(4); });
  }

  // ── Geographic midpoint (fallback seed only) ─────────────────────────

  function geographicMidpoint(coords) {
    var x = 0, y = 0, z = 0;
    coords.forEach(function (c) {
      var lat = c.lat * Math.PI / 180;
      var lng = c.lng * Math.PI / 180;
      x += Math.cos(lat) * Math.cos(lng);
      y += Math.cos(lat) * Math.sin(lng);
      z += Math.sin(lat);
    });
    var n = coords.length;
    x /= n; y /= n; z /= n;
    return {
      lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI,
      lng: Math.atan2(y, x) * 180 / Math.PI
    };
  }

  // ── OSRM: snap point to nearest drivable road ─────────────────────────

  function snapToRoad(point) {
    var url = 'https://router.project-osrm.org/nearest/v1/driving/' +
      point.lng.toFixed(6) + ',' + point.lat.toFixed(6);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.code === 'Ok' && data.waypoints && data.waypoints.length > 0) {
          var wp = data.waypoints[0];
          return { lat: wp.location[1], lng: wp.location[0] };
        }
        return point;
      })
      .catch(function () { return point; });
  }

  // ── OSRM: driving distance + time ─────────────────────────────────────

  function getDrivingInfo(from, to) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      from.lng.toFixed(6) + ',' + from.lat.toFixed(6) + ';' +
      to.lng.toFixed(6) + ',' + to.lat.toFixed(6) +
      '?overview=false';
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
          return { distance: null, duration: null };
        }
        return { distance: data.routes[0].distance, duration: data.routes[0].duration };
      })
      .catch(function () { return { distance: null, duration: null }; });
  }

  // ── Route midpoint: halfway along the actual road between two points ──
  //
  // Fetches the OSRM route geometry between two coords, then interpolates
  // to the point that is equidistant (by road distance) from both ends.
  // Because it uses the real route polyline, the result is always on a road
  // and always reachable by both parties.

  function getRouteMidpoint(from, to) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      from.lng.toFixed(6) + ',' + from.lat.toFixed(6) + ';' +
      to.lng.toFixed(6) + ',' + to.lat.toFixed(6) +
      '?overview=full&geometries=geojson';
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.code !== 'Ok' || !data.routes || !data.routes.length) return null;
        var coords = data.routes[0].geometry.coordinates; // [lng, lat]

        // Accumulate segment distances to find the halfway point
        var segs = [];
        var totalDist = 0;
        for (var i = 1; i < coords.length; i++) {
          var d = haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
          segs.push(d);
          totalDist += d;
        }

        var half = totalDist / 2;
        var cumDist = 0;
        for (var i = 0; i < segs.length; i++) {
          if (cumDist + segs[i] >= half) {
            var frac = segs[i] > 0 ? (half - cumDist) / segs[i] : 0;
            return {
              lat: coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
              lng: coords[i][0] + frac * (coords[i + 1][0] - coords[i][0])
            };
          }
          cumDist += segs[i];
        }
        // Fallback: last coord
        var last = coords[coords.length - 1];
        return { lat: last[1], lng: last[0] };
      })
      .catch(function () { return null; });
  }

  // ── Fair meeting point: pick best pairwise route midpoint ────────────
  //
  // Every candidate comes from a real OSRM route geometry, so it is always
  // on a driveable road — never in a field, lake, or mountain hut.
  //
  // Algorithm:
  //   1. For every pair (i,j), find the route midpoint (on the actual road).
  //   2. For each candidate, fetch drive times from ALL people in parallel.
  //   3. Score each candidate by fairness (smallest gap between longest and
  //      shortest drive) plus a small efficiency term (total drive time).
  //   4. Return the winner.

  function findFairMeetingPoint(coords, onProgress) {
    if (onProgress) onProgress('Finding road-based candidate points...');

    var pairs = [];
    for (var i = 0; i < coords.length; i++) {
      for (var j = i + 1; j < coords.length; j++) {
        pairs.push([i, j]);
      }
    }

    // Step 1: route midpoints for every pair (all on real roads)
    return Promise.all(
      pairs.map(function (pair) {
        return getRouteMidpoint(coords[pair[0]], coords[pair[1]]);
      })
    ).then(function (rawCandidates) {
      var candidates = rawCandidates.filter(function (c) { return c !== null; });

      if (candidates.length === 0) {
        // No routable pairs (e.g. all on different islands) — best effort
        return snapToRoad(geographicMidpoint(coords));
      }

      if (onProgress) {
        onProgress('Evaluating ' + candidates.length + ' candidate meeting point' +
          (candidates.length > 1 ? 's' : '') + '...');
      }

      // Step 2: drive times from every person to every candidate, in parallel
      return Promise.all(
        candidates.map(function (candidate) {
          return Promise.all(
            coords.map(function (c) { return getDrivingInfo(c, candidate); })
          ).then(function (times) {
            return { point: candidate, times: times };
          });
        })
      );
    }).then(function (results) {
      // results might be a raw point (early return from candidates.length === 0 path)
      if (!Array.isArray(results)) return results;

      // Step 3: pick candidate with the best fairness score
      var best = null;
      var bestScore = Infinity;

      results.forEach(function (r) {
        var durations = r.times
          .map(function (t) { return t.duration; })
          .filter(function (d) { return d !== null; });

        if (durations.length === 0) return;

        var maxT = Math.max.apply(null, durations);
        var minT = Math.min.apply(null, durations);
        var totalT = durations.reduce(function (a, b) { return a + b; }, 0);

        // Primary: minimise the gap between longest and shortest drive.
        // Secondary: prefer lower total drive time (small coefficient).
        var score = (maxT - minT) + totalT * 0.05;

        if (score < bestScore) {
          bestScore = score;
          best = r.point;
        }
      });

      return best || results[0].point;

    }).catch(function () {
      return snapToRoad(geographicMidpoint(coords));
    });
  }

  // ── Haversine (km) ────────────────────────────────────────────────────

  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(metres) {
    var km = metres / 1000;
    var mi = km * 0.621371;
    return km.toFixed(1) + ' km (' + mi.toFixed(1) + ' mi)';
  }

  function formatDuration(seconds) {
    var mins = Math.round(seconds / 60);
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + 'h' + (m > 0 ? ' ' + m + 'min' : '');
  }

  // ── Overpass POI search ───────────────────────────────────────────────

  function findNearbyPOIs(lat, lng, poiKey, radiusKm) {
    var poiDef = POI_TYPES[poiKey];
    if (!poiDef) return Promise.resolve([]);
    var parts = poiDef.osm.split('=');
    var key = parts[0], val = parts[1];
    var radiusM = radiusKm * 1000;
    var query = '[out:json][timeout:20];' +
      '(node["' + key + '"="' + val + '"](around:' + radiusM + ',' + lat + ',' + lng + '););' +
      'out body;>;out skel qt;';
    return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.elements || []; })
      .catch(function () { return []; });
  }

  // ── Main orchestration ────────────────────────────────────────────────

  function findMeetingPoint() {
    var addresses = locationInputs.map(function (id) {
      var el = document.getElementById('mpf-addr-' + id);
      return el ? el.value.trim() : '';
    }).filter(function (a) { return a.length > 0; });

    if (addresses.length < 2) {
      setStatus('Please enter at least 2 locations.', true);
      return;
    }

    setStatus('Geocoding addresses...');
    showResults(false);
    clearMapLayers();
    currentMid = null;

    Promise.all(addresses.map(geocodeAddress))
      .then(function (coords) {

        // Place person markers immediately so the map feels responsive
        coords.forEach(function (c, i) {
          var m = L.marker([c.lat, c.lng])
            .bindPopup('<strong>Person ' + (i + 1) + '</strong><br>' + addresses[i])
            .addTo(map);
          locationMarkers.push(m);
        });

        // Fit map to person locations while we calculate
        map.fitBounds(
          L.latLngBounds(coords.map(function (c) { return [c.lat, c.lng]; })),
          { padding: [40, 40] }
        );

        // Run drive-time optimisation
        return findFairMeetingPoint(coords, setStatus)
          .then(function (mid) {

            // Draw dashed lines from each person to meeting point
            coords.forEach(function (c) {
              var line = L.polyline(
                [[c.lat, c.lng], [mid.lat, mid.lng]],
                { color: '#4a90d9', weight: 2, opacity: 0.55, dashArray: '6 5' }
              ).addTo(map);
              routeLines.push(line);
            });

            // Meeting point marker
            midpointMarker = L.marker([mid.lat, mid.lng], {
              icon: L.divIcon({
                className: 'mpf-mid-icon',
                html: '<div class="mpf-mid-dot"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
              })
            }).bindPopup('<strong>Meeting point</strong>').addTo(map);

            // Fit to include meeting point
            var allPts = coords.map(function (c) { return [c.lat, c.lng]; });
            allPts.push([mid.lat, mid.lng]);
            map.fitBounds(L.latLngBounds(allPts), { padding: [40, 40] });

            setStatus('Getting final travel times...');

            // One final OSRM pass to the confirmed meeting point for display
            return Promise.all([
              Promise.resolve(coords),
              Promise.resolve(mid),
              Promise.all(coords.map(function (c) { return getDrivingInfo(c, mid); })),
              reverseGeocode(mid.lat, mid.lng)
            ]);
          });
      })
      .then(function (results) {
        var coords  = results[0];
        var mid     = results[1];
        var driving = results[2];
        var midAddr = results[3];

        currentMid = mid; // store so POI selectors can refresh without recalculating
        renderTravelSummary(coords, mid, driving, addresses, midAddr);
        updateShareUrl(addresses, document.getElementById('mpf-poi-type').value);
        setStatus('');
        showResults(true);

        var poiKey = document.getElementById('mpf-poi-type').value;
        var radius = parseFloat(document.getElementById('mpf-radius').value) || 5;
        return findNearbyPOIs(mid.lat, mid.lng, poiKey, radius)
          .then(function (els) { renderPOIs(els, mid, poiKey); });
      })
      .catch(function (err) {
        setStatus('Error: ' + err.message, true);
      });
  }

  // ── Render travel summary ─────────────────────────────────────────────

  function renderTravelSummary(coords, mid, driving, addresses, midAddr) {
    // Work out fairness: difference between longest and shortest drive time
    var durations = driving
      .map(function (d) { return d.duration; })
      .filter(function (d) { return d !== null; });

    var fairnessNote = '';
    if (durations.length === driving.length && durations.length > 1) {
      var maxT = Math.max.apply(null, durations);
      var minT = Math.min.apply(null, durations);
      var diffMins = Math.round((maxT - minT) / 60);
      fairnessNote = diffMins <= 2
        ? 'All travel times within ' + diffMins + ' min of each other.'
        : 'Travel times differ by up to ' + diffMins + ' min.';
    }

    var html = '<h3 class="mpf-section-title">Suggested meeting point</h3>';
    html += '<p class="mpf-midpoint-addr">' + midAddr + '</p>';
    if (fairnessNote) html += '<p class="mpf-fairness-note">' + fairnessNote + '</p>';
    html += '<h3 class="mpf-section-title">Travel to meeting point</h3>';
    html += '<div class="mpf-travel-grid">';

    coords.forEach(function (c, i) {
      var info = driving[i];
      var straightKm = haversineKm(c.lat, c.lng, mid.lat, mid.lng);
      var straightMi = (straightKm * 0.621371).toFixed(1);

      html += '<div class="mpf-travel-card">';
      html += '<div class="mpf-travel-person">Person ' + (i + 1) + '</div>';
      html += '<div class="mpf-travel-addr">' + addresses[i] + '</div>';
      if (info.distance !== null) {
        html += '<div class="mpf-travel-drive">' +
          '<span class="mpf-drive-time">' + formatDuration(info.duration) + '</span>' +
          ' &bull; ' + formatDistance(info.distance) + ' by road</div>';
      } else {
        html += '<div class="mpf-travel-drive">' +
          straightKm.toFixed(1) + ' km (' + straightMi + ' mi) straight line</div>';
      }
      html += '</div>';
    });

    html += '</div>';
    document.getElementById('mpf-travel-summary').innerHTML = html;
  }

  // ── Render POIs ───────────────────────────────────────────────────────

  function renderPOIs(elements, mid, poiKey) {
    poiMarkers.clearLayers();
    var poiDef = POI_TYPES[poiKey];

    var places = elements
      .filter(function (e) { return e.lat && e.lon; })
      .sort(function (a, b) {
        return haversineKm(mid.lat, mid.lng, a.lat, a.lon) -
               haversineKm(mid.lat, mid.lng, b.lat, b.lon);
      })
      .slice(0, 20);

    var container = document.getElementById('mpf-poi-list');

    if (places.length === 0) {
      container.innerHTML = '<p class="mpf-no-results">No places found nearby. Try increasing the radius.</p>';
      return;
    }

    var title = poiDef ? poiDef.label : 'Nearby places';
    var html = '<h3 class="mpf-section-title">' + title + ' near the meeting point</h3>';
    html += '<div class="mpf-poi-grid">';

    places.forEach(function (el) {
      var name = (el.tags && el.tags.name) ? el.tags.name : 'Unnamed';
      var distKm = haversineKm(mid.lat, mid.lng, el.lat, el.lon);
      var distMi = (distKm * 0.621371).toFixed(1);
      html += '<div class="mpf-poi-card" data-lat="' + el.lat + '" data-lon="' + el.lon + '">';
      html += '<div class="mpf-poi-name">' + name + '</div>';
      html += '<div class="mpf-poi-dist">' + distKm.toFixed(1) + ' km (' + distMi + ' mi) from meeting point</div>';
      html += '</div>';

      var icon = L.divIcon({
        className: 'mpf-poi-marker-icon',
        html: '<div class="mpf-poi-dot">' + (poiDef ? poiDef.icon : '?') + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([el.lat, el.lon], { icon: icon })
        .bindPopup('<strong>' + name + '</strong><br>' + distKm.toFixed(1) + ' km from meeting point')
        .addTo(poiMarkers);
    });

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.mpf-poi-card').forEach(function (card) {
      card.addEventListener('click', function () {
        map.setView([parseFloat(card.dataset.lat), parseFloat(card.dataset.lon)], 16);
      });
    });
  }

  // ── Share URL ─────────────────────────────────────────────────────────

  function updateShareUrl(addresses, poiKey) {
    var locs = addresses.map(encodeURIComponent).join('|');
    history.replaceState(null, '', '#locs=' + locs + '&poi=' + (poiKey || 'restaurant'));
  }

  function loadStateFromUrl() {
    var hash = window.location.hash.slice(1);
    if (!hash) return null;
    var out = {};
    hash.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx < 0) return;
      out[pair.slice(0, idx)] = pair.slice(idx + 1);
    });
    return out;
  }

  function copyShareLink() {
    var url = window.location.href;
    var btn = document.getElementById('mpf-share-btn');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Copy share link'; }, 2000);
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy share link'; }, 2000);
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────

  function setStatus(msg, isError) {
    var el = document.getElementById('mpf-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'mpf-status' + (isError ? ' mpf-status-error' : '');
  }

  function showResults(show) {
    var el = document.getElementById('mpf-results');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function clearMapLayers() {
    locationMarkers.forEach(function (m) { map.removeLayer(m); });
    locationMarkers = [];
    routeLines.forEach(function (l) { map.removeLayer(l); });
    routeLines = [];
    if (midpointMarker) { map.removeLayer(midpointMarker); midpointMarker = null; }
    if (poiMarkers) poiMarkers.clearLayers();
    document.getElementById('mpf-travel-summary').innerHTML = '';
    document.getElementById('mpf-poi-list').innerHTML = '';
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
