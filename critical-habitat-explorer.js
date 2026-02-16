// Critical Habitat Explorer - Powered by esri-leaflet
(function() {
    'use strict';

    // Configuration
    const SERVICE_BASE_URL = 'https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer';
    const FINAL_LAYER_URL = `${SERVICE_BASE_URL}/0`;
    const PROPOSED_LAYER_URL = `${SERVICE_BASE_URL}/2`;

    // State
    let map;
    let finalLayer;
    let proposedLayer;
    let selectedFeature = null;
    let layersVisible = {
        final: true,
        proposed: true
    };

    // Colors
    const FINAL_COLOR = '#27ae60';      // Green for final/designated
    const PROPOSED_COLOR = '#f39c12';   // Orange for proposed

    function initApp() {
        console.log('Critical Habitat Explorer: Initializing...');

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

        const mapElement = document.getElementById('che-map');
        if (!mapElement) {
            console.error('Map container not found');
            return;
        }

        initializeMap();
        setupControls();

        console.log('✓ Critical Habitat Explorer initialized');
    }

    function initializeMap() {
        // Initialize map centered on continental USA
        map = L.map('che-map', {
            center: [39.5, -98.35],
            zoom: 5,
            minZoom: 4,
            maxZoom: 15
        });

        // Add basemap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Add Final Critical Habitat layer
        finalLayer = L.esri.featureLayer({
            url: FINAL_LAYER_URL,
            simplifyFactor: 0.75,
            precision: 4,
            minZoom: 4,
            style: function() {
                return {
                    fillColor: FINAL_COLOR,
                    weight: 2,
                    opacity: 1,
                    color: '#1e8449',
                    fillOpacity: 0.4
                };
            },
            onEachFeature: function(feature, layer) {
                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: function(e) { selectFeature(e, 'Final'); }
                });
            },
            fields: ['OBJECTID', 'comname', 'sciname', 'listing_status', 'unitname', 'subunitname', 'status', 'pubdate', 'effectdate', 'Shape__Area']
        }).addTo(map);

        // Add Proposed Critical Habitat layer
        proposedLayer = L.esri.featureLayer({
            url: PROPOSED_LAYER_URL,
            simplifyFactor: 0.75,
            precision: 4,
            minZoom: 4,
            style: function() {
                return {
                    fillColor: PROPOSED_COLOR,
                    weight: 2,
                    opacity: 1,
                    color: '#d68910',
                    fillOpacity: 0.4
                };
            },
            onEachFeature: function(feature, layer) {
                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: function(e) { selectFeature(e, 'Proposed'); }
                });
            },
            fields: ['OBJECTID', 'comname', 'sciname', 'listing_status', 'unitname', 'subunitname', 'status', 'pubdate', 'effectdate', 'Shape__Area']
        }).addTo(map);

        // Show loading indicator
        finalLayer.on('loading', showLoading);
        proposedLayer.on('loading', showLoading);

        finalLayer.on('load', hideLoading);
        proposedLayer.on('load', hideLoading);

        // Handle errors
        finalLayer.on('requesterror', function(e) {
            console.error('Error loading final habitats:', e);
            hideLoading();
        });

        proposedLayer.on('requesterror', function(e) {
            console.error('Error loading proposed habitats:', e);
            hideLoading();
        });

        console.log('Map initialized with both habitat layers');
    }

    function setupControls() {
        // Layer toggle handlers
        const finalToggle = document.getElementById('che-toggle-final');
        const proposedToggle = document.getElementById('che-toggle-proposed');

        if (finalToggle) {
            finalToggle.addEventListener('change', function() {
                layersVisible.final = this.checked;
                if (this.checked) {
                    map.addLayer(finalLayer);
                } else {
                    map.removeLayer(finalLayer);
                }
            });
        }

        if (proposedToggle) {
            proposedToggle.addEventListener('change', function() {
                layersVisible.proposed = this.checked;
                if (this.checked) {
                    map.addLayer(proposedLayer);
                } else {
                    map.removeLayer(proposedLayer);
                }
            });
        }
    }

    function highlightFeature(e) {
        const layer = e.target;
        layer.setStyle({
            weight: 3,
            opacity: 1,
            fillOpacity: 0.7
        });
        layer.bringToFront();
    }

    function resetHighlight(e) {
        if (selectedFeature && e.target.feature.properties.OBJECTID === selectedFeature.properties.OBJECTID) {
            return;
        }

        const layer = e.target;
        const props = layer.feature.properties;
        const isFinal = layer.options.url && layer.options.url.includes('/0');

        if (isFinal) {
            finalLayer.resetStyle(layer);
        } else {
            proposedLayer.resetStyle(layer);
        }
    }

    function selectFeature(e, layerType) {
        const feature = e.target.feature;

        // Reset previously selected feature
        if (selectedFeature) {
            finalLayer.resetStyle();
            proposedLayer.resetStyle();
        }

        // Store layer type with feature for downloads
        feature.layerType = layerType;
        selectedFeature = feature;
        showInfoPanel(feature, layerType);

        e.target.setStyle({
            weight: 4,
            color: '#e74c3c',
            fillOpacity: 0.7
        });
    }

    function showInfoPanel(feature, layerType) {
        // Remove existing panel
        const existingPanel = document.querySelector('.che-info-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'che-info-panel';

        const props = feature.properties;
        const commonName = props.comname || 'Unknown Species';
        const scientificName = props.sciname || 'N/A';
        const listingStatus = props.listing_status || 'N/A';
        const unitName = props.unitname || 'N/A';
        const subunitName = props.subunitname || '';
        const status = props.status || 'N/A';
        const pubDate = props.pubdate ? formatDate(props.pubdate) : 'N/A';
        const effectDate = props.effectdate ? formatDate(props.effectdate) : 'N/A';

        let areaText = '';
        if (props.Shape__Area) {
            const acres = (props.Shape__Area / 4046.86).toFixed(2);
            const sqMiles = (props.Shape__Area / 2589988.11).toFixed(2);
            areaText = `<p><strong>Area:</strong> ${parseFloat(acres).toLocaleString()} acres (${parseFloat(sqMiles).toLocaleString()} sq mi)</p>`;
        }

        const statusBadge = `<span class="che-badge che-badge-${layerType.toLowerCase()}">${layerType}</span>`;

        panel.innerHTML = `
            <button class="che-close-btn" onclick="this.parentElement.remove();">&times;</button>
            <div class="che-species-header">
                <div class="che-species-name">${commonName}</div>
                ${statusBadge}
            </div>
            <p class="che-scientific-name">${scientificName}</p>
            <p><strong>Listing Status:</strong> ${listingStatus}</p>
            <p><strong>Unit:</strong> ${unitName}${subunitName ? ` - ${subunitName}` : ''}</p>
            <p><strong>Status:</strong> ${status}</p>
            ${areaText}
            <p><strong>Publication Date:</strong> ${pubDate}</p>
            <p><strong>Effective Date:</strong> ${effectDate}</p>
            <div class="che-download-section">
                <h4>Download Habitat Boundary</h4>
                <div class="che-download-buttons">
                    <button class="che-btn che-btn-download" onclick="window.downloadGeoJSON()">GeoJSON</button>
                    <button class="che-btn che-btn-download" onclick="window.downloadKML()">KML</button>
                    <button class="che-btn che-btn-download" onclick="window.downloadGPX()">GPX</button>
                </div>
            </div>
            <p class="che-hint">Choose format for your GIS or mapping tool</p>
        `;

        document.getElementById('che-container').appendChild(panel);
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {
            return dateString;
        }
    }

    // Download functions
    window.downloadGeoJSON = function() {
        if (!selectedFeature) return;
        fetchFullDetailAndDownload('geojson');
    };

    window.downloadKML = function() {
        if (!selectedFeature) return;
        fetchFullDetailAndDownload('kml');
    };

    window.downloadGPX = function() {
        if (!selectedFeature) return;
        fetchFullDetailAndDownload('gpx');
    };

    function fetchFullDetailAndDownload(format) {
        const objectId = selectedFeature.properties.OBJECTID;
        const name = selectedFeature.properties.comname || 'habitat';

        // Determine which layer this feature belongs to
        const layerUrl = selectedFeature.layerType === 'Final' ? FINAL_LAYER_URL : PROPOSED_LAYER_URL;

        const query = `${layerUrl}/query?` +
            `where=OBJECTID%3D${objectId}&` +
            `outFields=*&` +
            `outSR=4326&` +
            `f=geojson`;

        console.log(`Fetching full detail for download: ${name}`);

        fetch(query)
            .then(response => response.json())
            .then(data => {
                if (!data.features || data.features.length === 0) {
                    alert('Failed to fetch habitat details for download');
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
                alert('Failed to download habitat boundary');
            });
    }

    function convertToKML(feature) {
        const props = feature.properties;
        const name = props.comname || 'Critical Habitat';
        const description = `Scientific Name: ${props.sciname || 'N/A'}\nListing Status: ${props.listing_status || 'N/A'}${props.Shape__Area ? `\nArea: ${(props.Shape__Area / 4046.86).toFixed(2)} acres` : ''}`;

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
        const name = props.comname || 'Critical Habitat';

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
<gpx version="1.1" creator="Critical Habitat Explorer" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>Critical Habitat</type>
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
        if (document.querySelector('.che-loading')) return;

        const loading = document.createElement('div');
        loading.className = 'che-loading';
        loading.textContent = 'Loading habitat data...';
        document.getElementById('che-container').appendChild(loading);
    }

    function hideLoading() {
        const loading = document.querySelector('.che-loading');
        if (loading) {
            loading.remove();
        }
    }

    function showError(message) {
        hideLoading();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'che-info-panel';
        errorDiv.innerHTML = `
            <h3>Error</h3>
            <p>${message}</p>
        `;
        document.getElementById('che-container').appendChild(errorDiv);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        setTimeout(initApp, 100);
    }

})();
