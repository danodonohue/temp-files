// Maryland Voting Districts - Powered by esri-leaflet
(function() {
    'use strict';

    // Configuration
    const FEATURE_SERVICE_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/15';
    const STATE_FIPS = '24';
    const STATE_NAME = 'Maryland';

    // State
    let map;
    let districtLayer;
    let selectedDistrict = null;

    function initApp() {
        console.log('Maryland Voting Districts: Initializing...');

        // Show loading indicator immediately
        showLoading();

        if (typeof L === 'undefined') {
            console.error('Leaflet not loaded');
            showError('Map library failed to load. Please refresh the page.');
            return;
        }

        if (typeof L.esri === 'undefined') {
            console.error('Esri Leaflet not loaded');
            showError('Map library failed to load. Please refresh the page.');
            return;
        }

        const mapElement = document.getElementById('vde-map');
        if (!mapElement) {
            console.error('Map container not found');
            return;
        }

        initializeMap();

        console.log('✓ Maryland Voting Districts initialized');
    }

    function initializeMap() {
        // Initialize map centered on Maryland
        map = L.map('vde-map', {
            center: [39.0458, -76.6413],
            zoom: 8,
            minZoom: 6,
            maxZoom: 16
        });

        // Add basemap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Set bounds to Maryland
        const bounds = L.latLngBounds(
            [37.9, -79.5],
            [39.7, -75]
        );
        map.fitBounds(bounds);

        // Add Maryland voting districts layer
        districtLayer = L.esri.featureLayer({
            url: FEATURE_SERVICE_URL,
            where: "STATE='24'",  // Filter to Maryland only
            simplifyFactor: 0.75,
            precision: 4,
            style: styleDistrict,
            onEachFeature: onEachDistrict,
            fields: ['OBJECTID', 'NAME', 'GEOID', 'STATE', 'COUNTY', 'VTD', 'POP100', 'AREALAND', 'FUNCSTAT']
        }).addTo(map);

        // Show loading indicator
        districtLayer.on('loading', showLoading);
        districtLayer.on('load', hideLoading);

        // Handle errors
        districtLayer.on('requesterror', function(e) {
            console.error('Error loading districts:', e);
            hideLoading();
            showError('Failed to load voting districts. Please try refreshing the page.');
        });

        console.log('Map initialized with Maryland districts');
    }

    function styleDistrict(feature) {
        return {
            fillColor: '#3498db',
            weight: 1,
            opacity: 1,
            color: '#2c3e50',
            fillOpacity: 0.35
        };
    }

    function onEachDistrict(feature, layer) {
        layer.on({
            mouseover: highlightDistrict,
            mouseout: resetHighlight,
            click: selectDistrict
        });
    }

    function highlightDistrict(e) {
        const layer = e.target;
        layer.setStyle({
            weight: 2,
            opacity: 1,
            fillOpacity: 0.6
        });
        layer.bringToFront();
    }

    function resetHighlight(e) {
        if (selectedDistrict && e.target.feature.properties.OBJECTID === selectedDistrict.properties.OBJECTID) {
            return;
        }
        districtLayer.resetStyle(e.target);
    }

    function selectDistrict(e) {
        const feature = e.target.feature;

        // Reset previously selected district
        if (selectedDistrict) {
            districtLayer.resetStyle();
        }

        selectedDistrict = feature;
        showInfoPanel(feature);

        e.target.setStyle({
            weight: 3,
            color: '#e74c3c',
            fillOpacity: 0.6
        });
    }

    function showInfoPanel(feature) {
        // Remove existing panel
        const existingPanel = document.querySelector('.vde-info-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'vde-info-panel';

        const props = feature.properties;
        const districtName = props.NAME || 'Unnamed District';
        const geoid = props.GEOID || 'N/A';
        const county = props.COUNTY || 'N/A';
        const vtd = props.VTD || 'N/A';
        const population = props.POP100 ? props.POP100.toLocaleString() : 'N/A';
        const funcStatus = props.FUNCSTAT || 'N/A';

        let areaText = '';
        if (props.AREALAND) {
            const sqMiles = (props.AREALAND / 2589988.11).toFixed(2);
            const acres = (props.AREALAND / 4046.86).toFixed(0);
            areaText = `<p><strong>Land Area:</strong> ${parseFloat(sqMiles).toLocaleString()} sq mi (${parseFloat(acres).toLocaleString()} acres)</p>`;
        }

        panel.innerHTML = `
            <button class="vde-close-btn" onclick="this.parentElement.remove();">&times;</button>
            <div class="vde-district-name">${districtName}</div>
            <p class="vde-geoid">GEOID: ${geoid}</p>
            <p><strong>State:</strong> Maryland</p>
            <p><strong>County FIPS:</strong> ${county}</p>
            <p><strong>VTD Code:</strong> ${vtd}</p>
            <p><strong>Population:</strong> ${population}</p>
            ${areaText}
            <p><strong>Status:</strong> ${funcStatus}</p>
            <div class="vde-download-section">
                <h4>Download District Boundary</h4>
                <div class="vde-download-buttons">
                    <button class="vde-btn vde-btn-download" onclick="window.downloadGeoJSON()">GeoJSON</button>
                    <button class="vde-btn vde-btn-download" onclick="window.downloadKML()">KML</button>
                    <button class="vde-btn vde-btn-download" onclick="window.downloadGPX()">GPX</button>
                </div>
            </div>
            <p class="vde-hint">Choose format for your GIS or mapping application</p>
        `;

        document.getElementById('vde-container').appendChild(panel);
    }

    // Download functions
    window.downloadGeoJSON = function() {
        if (!selectedDistrict) return;
        fetchFullDetailAndDownload('geojson');
    };

    window.downloadKML = function() {
        if (!selectedDistrict) return;
        fetchFullDetailAndDownload('kml');
    };

    window.downloadGPX = function() {
        if (!selectedDistrict) return;
        fetchFullDetailAndDownload('gpx');
    };

    function fetchFullDetailAndDownload(format) {
        const objectId = selectedDistrict.properties.OBJECTID;
        const name = selectedDistrict.properties.NAME || 'voting-district';

        const query = `${FEATURE_SERVICE_URL}/query?` +
            `where=OBJECTID%3D${objectId}&` +
            `outFields=*&` +
            `outSR=4326&` +
            `f=geojson`;

        console.log(`Fetching full detail for download: ${name}`);

        fetch(query)
            .then(response => response.json())
            .then(data => {
                if (!data.features || data.features.length === 0) {
                    alert('Failed to fetch district details for download');
                    return;
                }

                const fullDetailFeature = data.features[0];

                if (format === 'geojson') {
                    const geojson = {
                        type: 'FeatureCollection',
                        features: [fullDetailFeature]
                    };
                    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
                    downloadBlob(blob, `${sanitizeFilename(name)}.geojson`);
                } else if (format === 'kml') {
                    const kml = convertToKML(fullDetailFeature);
                    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
                    downloadBlob(blob, `${sanitizeFilename(name)}.kml`);
                } else if (format === 'gpx') {
                    const gpx = convertToGPX(fullDetailFeature);
                    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
                    downloadBlob(blob, `${sanitizeFilename(name)}.gpx`);
                }
            })
            .catch(error => {
                console.error('Download error:', error);
                alert('Failed to download district boundary');
            });
    }

    function convertToKML(feature) {
        const props = feature.properties;
        const name = props.NAME || 'Voting District';
        const description = `GEOID: ${props.GEOID || 'N/A'}\nState: Maryland\nPopulation: ${props.POP100 ? props.POP100.toLocaleString() : 'N/A'}`;

        let coordinates = '';
        if (feature.geometry.type === 'Polygon') {
            coordinates = feature.geometry.coordinates[0].map(coord =>
                `${coord[0]},${coord[1]},0`
            ).join(' ');
        } else if (feature.geometry.type === 'MultiPolygon') {
            coordinates = feature.geometry.coordinates[0][0].map(coord =>
                `${coord[0]},${coord[1]},0`
            ).join(' ');
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Placemark>
      <name>${escapeXml(name)}</name>
      <description>${escapeXml(description)}</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
    }

    function convertToGPX(feature) {
        const props = feature.properties;
        const name = props.NAME || 'Voting District';

        let trackPoints = '';
        if (feature.geometry.type === 'Polygon') {
            trackPoints = feature.geometry.coordinates[0].map(coord =>
                `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>`
            ).join('\n');
        } else if (feature.geometry.type === 'MultiPolygon') {
            trackPoints = feature.geometry.coordinates[0][0].map(coord =>
                `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>`
            ).join('\n');
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Voting Districts Explorer" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>Voting District</type>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
    }

    function sanitizeFilename(name) {
        return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }

    function escapeXml(str) {
        return str.replace(/[<>&'"]/g, function(c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case "'": return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function showLoading() {
        if (document.querySelector('.vde-loading')) return;

        const loading = document.createElement('div');
        loading.className = 'vde-loading';
        loading.innerHTML = `
            <div class="vde-loading-spinner"></div>
            <div class="vde-loading-text">Loading Maryland Voting Districts</div>
            <div class="vde-loading-subtext">Fetching precinct data from U.S. Census Bureau...</div>
        `;
        document.getElementById('vde-container').appendChild(loading);
    }

    function hideLoading() {
        const loading = document.querySelector('.vde-loading');
        if (loading) {
            loading.remove();
        }
    }

    function showError(message) {
        hideLoading();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'vde-info-panel';
        errorDiv.innerHTML = `
            <h3>Error</h3>
            <p>${message}</p>
        `;
        document.getElementById('vde-container').appendChild(errorDiv);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        setTimeout(initApp, 100);
    }

})();
