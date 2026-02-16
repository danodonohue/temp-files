// USA Parks Explorer - Powered by esri-leaflet
(function() {
    'use strict';

    // Configuration
    const FEATURE_SERVICE_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_Detailed_Parks/FeatureServer/0';

    // State
    let map;
    let parksLayer;
    let selectedPark = null;

    // Color palette for parks
    const COLORS = [
        '#27ae60', '#2ecc71', '#16a085', '#1abc9c', '#2980b9',
        '#3498db', '#8e44ad', '#9b59b6', '#e67e22', '#f39c12'
    ];

    function initApp() {
        console.log('USA Parks Explorer: Initializing...');

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

        const mapElement = document.getElementById('upe-map');
        if (!mapElement) {
            console.error('Map container not found');
            return;
        }

        initializeMap();

        console.log('✓ USA Parks Explorer initialized');
    }

    function initializeMap() {
        // Initialize map centered on continental USA (excluding Alaska/Hawaii)
        // Zoom level 5-6 loads much less data initially while keeping US clearly visible
        map = L.map('upe-map', {
            center: [39.5, -98.35],  // Slightly adjusted for contiguous US
            zoom: 5,                  // Higher zoom = less data loaded initially
            minZoom: 4,               // Prevent zooming out too far
            maxZoom: 15
        });

        // Add basemap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Add parks layer using esri-leaflet
        // This automatically handles:
        // - PBF format (faster than GeoJSON)
        // - Tile-based loading (only loads what's visible)
        // - Geometry simplification
        // - Caching
        parksLayer = L.esri.featureLayer({
            url: FEATURE_SERVICE_URL,
            simplifyFactor: 0.75,  // More aggressive geometry simplification for performance
            precision: 4,          // Coordinate precision (4 decimal places ~11m accuracy)
            minZoom: 4,            // Don't load parks at very low zoom levels
            style: stylePark,
            onEachFeature: onEachPark,
            // Only load essential fields for better performance
            fields: ['OBJECTID', 'NAME', 'FEATTYPE', 'SQMI']
        }).addTo(map);

        // Show loading indicator
        parksLayer.on('loading', function() {
            showLoading();
        });

        parksLayer.on('load', function() {
            hideLoading();
        });

        // Handle errors
        parksLayer.on('requesterror', function(e) {
            console.error('Error loading parks:', e);
            hideLoading();
            showError('Failed to load parks data. Please try refreshing the page.');
        });

        console.log('Map initialized with esri-leaflet FeatureLayer');
    }

    function stylePark(feature) {
        const colorIndex = Math.abs(hashCode(feature.properties.NAME || '')) % COLORS.length;

        return {
            fillColor: COLORS[colorIndex],
            weight: 2,
            opacity: 1,
            color: '#2c3e50',
            fillOpacity: 0.5
        };
    }

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    function onEachPark(feature, layer) {
        layer.on({
            mouseover: highlightPark,
            mouseout: resetHighlight,
            click: selectPark
        });
    }

    function highlightPark(e) {
        const layer = e.target;
        layer.setStyle({
            weight: 3,
            opacity: 1,
            fillOpacity: 0.7
        });
        layer.bringToFront();
    }

    function resetHighlight(e) {
        if (selectedPark && e.target.feature.properties.OBJECTID === selectedPark.properties.OBJECTID) {
            return;
        }
        parksLayer.resetStyle(e.target);
    }

    function selectPark(e) {
        const feature = e.target.feature;

        // Reset previously selected park
        if (selectedPark) {
            parksLayer.resetStyle();
        }

        selectedPark = feature;
        showInfoPanel(feature);

        e.target.setStyle({
            weight: 4,
            color: '#e74c3c',
            fillOpacity: 0.7
        });
    }

    function showInfoPanel(feature) {
        // Remove existing panel
        const existingPanel = document.querySelector('.upe-info-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'upe-info-panel';

        const props = feature.properties;
        const name = props.NAME || 'Unnamed Park';
        const type = props.FEATTYPE || 'Unknown';

        let areaText = '';
        if (props.SQMI) {
            const sqMiles = parseFloat(props.SQMI).toFixed(2);
            const acres = (props.SQMI * 640).toFixed(0);
            areaText = `<p><strong>Area:</strong> ${sqMiles} sq mi (${acres.toLocaleString()} acres)</p>`;
        }

        panel.innerHTML = `
            <button class="upe-close-btn" onclick="this.parentElement.remove();">&times;</button>
            <div class="upe-park-name">${name}</div>
            <p><strong>Type:</strong> ${type}</p>
            ${areaText}
            <div class="upe-download-section">
                <h4>Download Park Boundary</h4>
                <div class="upe-download-buttons">
                    <button class="upe-btn upe-btn-download" onclick="window.downloadGeoJSON()">GeoJSON</button>
                    <button class="upe-btn upe-btn-download" onclick="window.downloadKML()">KML</button>
                    <button class="upe-btn upe-btn-download" onclick="window.downloadGPX()">GPX</button>
                </div>
            </div>
            <p class="upe-hint">Choose format for your GPS or mapping tool</p>
        `;

        document.getElementById('upe-container').appendChild(panel);
    }

    // Download functions - fetch full detail for accurate boundaries
    window.downloadGeoJSON = function() {
        if (!selectedPark) return;
        fetchFullDetailAndDownload('geojson');
    };

    window.downloadKML = function() {
        if (!selectedPark) return;
        fetchFullDetailAndDownload('kml');
    };

    window.downloadGPX = function() {
        if (!selectedPark) return;
        fetchFullDetailAndDownload('gpx');
    };

    function fetchFullDetailAndDownload(format) {
        const objectId = selectedPark.properties.OBJECTID;
        const name = selectedPark.properties.NAME || 'park';

        // Fetch full detail (no simplification) for this specific park
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
                    alert('Failed to fetch park details for download');
                    return;
                }

                const fullDetailFeature = data.features[0];

                // Generate download based on format
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
                alert('Failed to download park boundary');
            });
    }

    function convertToKML(feature) {
        const props = feature.properties;
        const name = props.NAME || 'Unnamed Park';
        const description = `Type: ${props.FEATTYPE || 'Unknown'}${props.SQMI ? `\nArea: ${props.SQMI.toFixed(2)} sq mi` : ''}`;

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
        const name = props.NAME || 'Unnamed Park';

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
<gpx version="1.1" creator="USA Parks Explorer" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>Park Boundary</type>
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
        // Don't show multiple loading indicators
        if (document.querySelector('.upe-loading')) return;

        const loading = document.createElement('div');
        loading.className = 'upe-loading';
        loading.textContent = 'Loading parks data';
        document.getElementById('upe-container').appendChild(loading);
    }

    function hideLoading() {
        const loading = document.querySelector('.upe-loading');
        if (loading) {
            loading.remove();
        }
    }

    function showError(message) {
        hideLoading();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'upe-info-panel';
        errorDiv.innerHTML = `
            <h3>Error</h3>
            <p>${message}</p>
        `;
        document.getElementById('upe-container').appendChild(errorDiv);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        setTimeout(initApp, 100);
    }

})();
