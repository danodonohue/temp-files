(function () {
  'use strict';

  var SERVICE_URL = 'https://services7.arcgis.com/oF9CDB4lUYF7Um9q/arcgis/rest/services/North_American_Landfills/FeatureServer/0';

  var STATUS_COLORS = {
    'Open': '#c0392b',
    'Closed': '#7f8c8d',
    'Unknown': '#e67e22'
  };

  var allFeatures = [];
  var activeCountry = 'All';
  var activeStatus = 'All';
  var clusterGroup = null;
  var map = null;

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

  function updateShareUrl() {
    if (!map) return;
    var center = map.getCenter();
    var hash = '#lat=' + center.lat.toFixed(4) +
      '&lng=' + center.lng.toFixed(4) +
      '&z=' + map.getZoom() +
      '&country=' + encodeURIComponent(activeCountry) +
      '&status=' + encodeURIComponent(activeStatus);
    history.replaceState(null, '', hash);
  }

  function makeIcon(status) {
    var color = STATUS_COLORS[status] || '#95a5a6';
    return L.divIcon({
      className: '',
      html: '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';border:1.5px solid rgba(0,0,0,0.35);box-sizing:border-box;"></div>',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }

  function buildPopup(attrs) {
    var rows = [
      ['Country', attrs.Country],
      ['Region', attrs.Region],
      ['Status', attrs.Status],
      ['Owner / Mgmt', attrs.OwnerMgmt],
      ['Data Source', attrs.DataSource],
      ['Notes', attrs.Notes]
    ].filter(function (r) { return r[1]; });

    var html = '<div class="nal-popup"><strong>' + (attrs.Name || 'Unnamed site') + '</strong><table>';
    rows.forEach(function (r) {
      html += '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>';
    });
    html += '</table></div>';
    return html;
  }

  function applyFilters() {
    if (!clusterGroup) return;
    clusterGroup.clearLayers();

    var filtered = allFeatures.filter(function (f) {
      var a = f.attributes;
      var countryOk = activeCountry === 'All' || a.Country === activeCountry;
      var statusOk = activeStatus === 'All' || a.Status === activeStatus;
      return countryOk && statusOk;
    });

    var markers = [];
    filtered.forEach(function (f) {
      var g = f.geometry;
      if (!g) return;
      var m = L.marker([g.y, g.x], { icon: makeIcon(f.attributes.Status) });
      m.bindPopup(buildPopup(f.attributes), { maxWidth: 280 });
      markers.push(m);
    });

    clusterGroup.addLayers(markers);
    updateCount(filtered.length);
    updateShareUrl();
  }

  function updateCount(n) {
    var el = document.getElementById('nal-count');
    if (el) el.textContent = (n !== undefined ? n.toLocaleString() : '0') + ' sites';
  }

  function setLoading(msg) {
    var el = document.getElementById('nal-loading');
    if (!el) return;
    if (msg) {
      el.style.display = 'inline';
      el.textContent = msg;
    } else {
      el.style.display = 'none';
      el.textContent = '';
    }
  }

  function fetchPage(offset, accumulated) {
    var url = SERVICE_URL + '/query?' +
      'where=1%3D1' +
      '&outFields=Name%2CCountry%2CRegion%2CStatus%2COwnerMgmt%2CDataSource%2CNotes' +
      '&outSR=4326' +
      '&returnGeometry=true' +
      '&resultOffset=' + offset +
      '&resultRecordCount=2000' +
      '&f=json';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var batch = data.features || [];
        accumulated = accumulated.concat(batch);
        setLoading('Loading... ' + accumulated.length + ' sites');

        if (data.exceededTransferLimit && batch.length > 0) {
          fetchPage(offset + batch.length, accumulated);
        } else {
          allFeatures = accumulated;
          setLoading(null);
          applyFilters();
        }
      })
      .catch(function (err) {
        console.error('Fetch error:', err);
        setLoading('Failed to load data.');
      });
  }

  function initMap() {
    var state = loadStateFromUrl();
    var lat = (state && state.lat) ? parseFloat(state.lat) : 40;
    var lng = (state && state.lng) ? parseFloat(state.lng) : -100;
    var zoom = (state && state.z) ? parseInt(state.z, 10) : 4;
    if (state && state.country) activeCountry = state.country;
    if (state && state.status) activeStatus = state.status;

    map = L.map('na-landfills-map', { center: [lat, lng], zoom: zoom });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    map.addLayer(clusterGroup);

    map.on('moveend', updateShareUrl);

    // Sync filter dropdowns to URL state
    var countryEl = document.getElementById('nal-filter-country');
    var statusEl = document.getElementById('nal-filter-status');
    if (countryEl) countryEl.value = activeCountry;
    if (statusEl) statusEl.value = activeStatus;

    // Filter events
    if (countryEl) {
      countryEl.addEventListener('change', function () {
        activeCountry = this.value;
        applyFilters();
      });
    }
    if (statusEl) {
      statusEl.addEventListener('change', function () {
        activeStatus = this.value;
        applyFilters();
      });
    }

    setLoading('Loading...');
    fetchPage(0, []);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }

})();
