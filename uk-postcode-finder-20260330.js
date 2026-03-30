(function () {
  'use strict';

  var upfMap, upfMarker;

  function upfUpdateMarker(latlng) {
    if (upfMarker) {
      upfMarker.setLatLng(latlng);
    } else {
      upfMarker = L.marker(latlng).addTo(upfMap);
    }
  }

  function upfGetLocationDetails(lat, lng) {
    var info = document.getElementById('upf-info');
    info.innerHTML = '<div style="text-align:center;color:#666;">Searching...</div>';

    fetch(
      'https://nominatim.openstreetmap.org/reverse?' +
      'format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1'
    )
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.address) {
          var postcode = data.address.postcode || 'Not available';
          var locality = data.address.suburb || data.address.neighbourhood || data.address.locality || '';

          info.innerHTML =
            '<div class="upf-postcode-highlight">' +
              '<h3>Postcode Found</h3>' +
              '<p style="font-size:1.2em;font-weight:bold;">' + postcode + '</p>' +
              (locality ? '<p><strong>Area:</strong> ' + locality + '</p>' : '') +
            '</div>' +
            '<div class="upf-result-card">' +
              '<div><strong>Street:</strong><span>' + (data.address.road || 'Not available') + '</span></div>' +
              '<div><strong>Town/City:</strong><span>' + (data.address.city || data.address.town || data.address.village || 'Not available') + '</span></div>' +
              '<div><strong>County:</strong><span>' + (data.address.county || data.address.state || 'Not available') + '</span></div>' +
              '<div><strong>Full Address:</strong><span>' + data.display_name + '</span></div>' +
            '</div>';
        } else {
          info.innerHTML = '<div style="text-align:center;color:#666;">No postcode found for this location.</div>';
        }
      })
      .catch(function () {
        info.innerHTML = '<div style="text-align:center;color:#dc3545;">Error finding postcode. Please try again.</div>';
      });
  }

  function upfFindMyLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    document.getElementById('upf-info').innerHTML = '<div style="text-align:center;color:#666;">Finding your postcode...</div>';
    navigator.geolocation.getCurrentPosition(
      function (position) {
        var latlng = L.latLng(position.coords.latitude, position.coords.longitude);
        upfMap.setView(latlng, 16);
        upfUpdateMarker(latlng);
        upfGetLocationDetails(latlng.lat, latlng.lng);
      },
      function (error) {
        var msg = 'Error getting location: ';
        if (error.code === error.PERMISSION_DENIED)          msg += 'Permission denied';
        else if (error.code === error.POSITION_UNAVAILABLE)  msg += 'Position unavailable';
        else if (error.code === error.TIMEOUT)               msg += 'Timeout';
        else                                                  msg += 'Unknown error';
        document.getElementById('upf-info').innerHTML =
          '<div style="text-align:center;color:#dc3545;">' + msg + '</div>';
      }
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('uk-postcode-finder-container')) return;

    upfMap = L.map('upf-map').setView([54.5, -2], 6);

    var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });

    osmLayer.addTo(upfMap);
    L.control.layers({ 'Street Map': osmLayer, 'Satellite': satelliteLayer }).addTo(upfMap);

    upfMap.on('click', function (e) {
      upfUpdateMarker(e.latlng);
      upfGetLocationDetails(e.latlng.lat, e.latlng.lng);
    });

    document.getElementById('upf-locate-btn').addEventListener('click', upfFindMyLocation);
  });

})();
