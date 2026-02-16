// USA Coal Fields Map
(function() {
    'use strict';

    // Configuration
    const FEATURE_SERVICE_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_Coal_Fields_view/FeatureServer/0';
    const MAX_RECORDS = 2000;

    // State
    let map;
    let coalFieldsLayer;
    let selectedField = null;
    const fieldColors = {};

    // Color palette for coal fields
    const COLORS = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#34495e', '#16a085', '#d35400',
        '#c0392b', '#8e44ad', '#2c3e50', '#27ae60', '#2980b9',
        '#f1c40f', '#7f8c8d', '#95a5a6', '#d98880', '#85c1e2'
    ];

    function initApp() {
        console.log('USA Coal Fields Map: Initializing...');

        if (typeof L === 'undefined') {
            console.error('Leaflet not loaded');
            showError('Map library failed to load. Please refresh the page.');
            return;
        }

        const mapElement = document.getElementById('ucf-map');
        if (!mapElement) {
            console.error('Map container not found');
            return;
        }

        initializeMap();
        loadCoalFields();
        setupEventListeners();

        console.log('✓ USA Coal Fields Map initialized');
    }

    function initializeMap() {
        // Initialize map centered on continental USA
        map = L.map('ucf-map', {
            center: [39.8283, -98.5795],
            zoom: 4,
            minZoom: 3,
            maxZoom: 12
        });

        // Add basemap with terrain features
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Create layer for coal fields
        coalFieldsLayer = L.geoJSON(null, {
            style: styleCoalField,
            onEachFeature: onEachField
        }).addTo(map);
    }

    function styleCoalField(feature) {
        const fieldName = feature.properties.NAME || 'Unknown';

        if (!fieldColors[fieldName]) {
            const colorIndex = Object.keys(fieldColors).length % COLORS.length;
            fieldColors[fieldName] = COLORS[colorIndex];
        }

        return {
            fillColor: fieldColors[fieldName],
            weight: 2,
            opacity: 1,
            color: '#333',
            fillOpacity: 0.6
        };
    }

    function onEachField(feature, layer) {
        const props = feature.properties;

        layer.on({
            mouseover: highlightField,
            mouseout: resetHighlight,
            click: selectField
        });
    }

    function highlightField(e) {
        const layer = e.target;
        layer.setStyle({
            weight: 3,
            opacity: 1,
            fillOpacity: 0.8
        });
        layer.bringToFront();
    }

    function resetHighlight(e) {
        coalFieldsLayer.resetStyle(e.target);
    }

    function selectField(e) {
        const feature = e.target.feature;
        const props = feature.properties;

        selectedField = props;
        showInfoPanel(props);

        map.fitBounds(e.target.getBounds(), {
            padding: [50, 50],
            maxZoom: 8
        });
    }


    function showInfoPanel(props) {
        let panel = document.querySelector('.ucf-info-panel');

        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'ucf-info-panel';
            document.getElementById('ucf-container').appendChild(panel);
        }

        const name = props.NAME || 'Unnamed Field';
        const province = props.PROVINCE || 'Unknown';
        const age = props.AGE || 'Unknown';
        const rank = props.RANK || 'Unknown';

        let areaText = '';
        if (props.Shape__Area) {
            const sqMeters = props.Shape__Area;
            const sqMiles = (sqMeters / 2589988.11).toFixed(1);
            const acres = (sqMeters / 4046.86).toFixed(0);
            areaText = `${sqMiles} sq mi (${acres.toLocaleString()} acres)`;
        }

        panel.innerHTML = `
            <button class="ucf-close-btn" onclick="document.querySelector('.ucf-info-panel').remove()">&times;</button>
            <div class="ucf-field-name">${name}</div>
            <p><strong>Rank:</strong> ${rank} | <strong>Age:</strong> ${age}</p>
            ${province !== 'Unknown' ? `<p><strong>Province:</strong> ${province}</p>` : ''}
            ${areaText ? `<p><strong>Area:</strong> ${areaText}</p>` : ''}
        `;

        panel.style.display = 'block';
    }

    function loadCoalFields() {
        showLoading();

        const query = `${FEATURE_SERVICE_URL}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=${MAX_RECORDS}`;

        console.log('Fetching coal fields data...');

        fetch(query)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                hideLoading();

                if (!data.features || data.features.length === 0) {
                    showError('No coal field data available');
                    return;
                }

                console.log(`✓ Loaded ${data.features.length} coal fields`);

                coalFieldsLayer.addData(data);

                if (data.features.length > 0) {
                    map.fitBounds(coalFieldsLayer.getBounds(), {
                        padding: [20, 20]
                    });
                }

                createLegend(data.features);
            })
            .catch(error => {
                hideLoading();
                console.error('Error loading coal fields:', error);
                showError('Failed to load coal fields data. Please try refreshing the page.');
            });
    }

    function createLegend(features) {
        const existingLegend = document.querySelector('.ucf-legend');
        if (existingLegend) {
            existingLegend.remove();
        }

        const legend = document.createElement('div');
        legend.className = 'ucf-legend';

        const uniqueFields = {};
        features.forEach(f => {
            const name = f.properties.NAME || 'Unknown';
            if (!uniqueFields[name]) {
                uniqueFields[name] = true;
            }
        });

        const fieldNames = Object.keys(uniqueFields).sort().slice(0, 10);

        let legendHtml = '<h4>Coal Field Regions</h4>';

        fieldNames.forEach(name => {
            const color = fieldColors[name] || '#999';
            legendHtml += `
                <div class="ucf-legend-item">
                    <div class="ucf-legend-color" style="background-color: ${color}"></div>
                    <span>${name}</span>
                </div>
            `;
        });

        if (Object.keys(uniqueFields).length > 10) {
            legendHtml += `<div class="ucf-legend-item" style="font-style: italic; color: #7f8c8d; margin-top: 8px;">+ ${Object.keys(uniqueFields).length - 10} more fields</div>`;
        }

        legend.innerHTML = legendHtml;
        document.getElementById('ucf-container').appendChild(legend);
    }

    function showLoading() {
        const loading = document.createElement('div');
        loading.className = 'ucf-loading';
        loading.textContent = 'Loading coal fields data';
        document.getElementById('ucf-container').appendChild(loading);
    }

    function hideLoading() {
        const loading = document.querySelector('.ucf-loading');
        if (loading) {
            loading.remove();
        }
    }

    function showError(message) {
        hideLoading();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'ucf-info-panel';
        errorDiv.innerHTML = `
            <h3>Error</h3>
            <p>${message}</p>
        `;
        document.getElementById('ucf-container').appendChild(errorDiv);
    }

    function setupEventListeners() {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, checking for map initialization...');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        setTimeout(initApp, 100);
    }

})();
