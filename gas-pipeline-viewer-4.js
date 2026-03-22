(function() {
    'use strict';

    let map;
    let pipelineLayer;
    let currentFilters = {
        operator: 'all',
        type: 'all'
    };
    let operatorOptions = new Set();
    let isLoading = false;
    let operatorsLoaded = false;
    let legendVisible = false;

    // Updated public EIA pipeline service (FiaPA4ga0iQKduv3) replaces the
    // previous service (FGr1D95XCGALKXqM) which now requires authentication.
    const PIPELINE_SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0';

    function initMap() {
        // Start at zoom 9 (regional view) instead of 7 (national view) so the
        // initial bounding box query fetches far fewer features on first load.
        map = L.map('gas-pipeline-map', {
            center: [39.8283, -98.5795],
            zoom: 9,
            minZoom: 3,
            maxZoom: 18
        });

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, Maxar, Earthstar Geographics'
        });

        const baseMaps = {
            "OpenStreetMap": osmLayer,
            "Satellite": satelliteLayer
        };

        osmLayer.addTo(map);
        L.control.layers(baseMaps).addTo(map);

        initPipelineLayer();
        setupEventHandlers();
        updateZoomLevel();
        showInstruction();
    }

    function initPipelineLayer() {
        showLoading(true);

        pipelineLayer = L.esri.featureLayer({
            url: PIPELINE_SERVICE_URL,
            // Restrict to only the fields this app uses. FID is the object ID
            // field on this service (required by esri-leaflet for feature tracking).
            fields: ['FID', 'TYPEPIPE', 'Operator', 'Status'],
            minZoom: 6,
            style: stylePipeline,
            onEachFeature: onEachPipeline,
            simplifyFactor: 0.5,
            precision: 5
        });

        pipelineLayer.addTo(map);

        pipelineLayer.on('loading', function() {
            showLoading(true);
        });

        pipelineLayer.on('load', function() {
            showLoading(false);
            updatePipelineCount();
            // Only build operator dropdown once, not on every pan/zoom.
            if (!operatorsLoaded) {
                loadFilterOptions();
                operatorsLoaded = true;
            }
        });

        pipelineLayer.on('error', function(error) {
            showLoading(false);
            console.error('Error loading pipeline data:', error);
            showErrorMessage('Failed to load pipeline data. Please try zooming in more or refresh the page.');
        });
    }

    function stylePipeline(feature) {
        const properties = feature.properties;

        let color = '#666666';
        let weight = 2;
        let opacity = 0.8;
        let dashArray = null;

        if (properties.TYPEPIPE === 'Interstate') {
            color = '#1976D2';
        } else if (properties.TYPEPIPE === 'Intrastate') {
            color = '#388E3C';
        }

        const currentZoom = map.getZoom();
        if (currentZoom >= 10) {
            weight = 3;
        } else if (currentZoom >= 8) {
            weight = 2;
        } else {
            weight = 1;
        }

        return {
            color: color,
            weight: weight,
            opacity: opacity,
            dashArray: dashArray
        };
    }

    function onEachPipeline(feature, layer) {
        const props = feature.properties;

        const pipelineClass = getPipelineClass(props);
        if (pipelineClass) {
            layer.options.className = (layer.options.className || '') + ' ' + pipelineClass;
        }

        // Lazy popup: only created when the user clicks, not for every feature.
        layer.on('click', function() {
            layer.bindPopup(createPopupContent(props)).openPopup();
            updateInfoPanel(props);
        });

        if (props.Operator) {
            operatorOptions.add(props.Operator);
        }
    }

    function getPipelineClass(properties) {
        if (properties.TYPEPIPE === 'Interstate') {
            return 'interstate-pipeline';
        } else if (properties.TYPEPIPE === 'Intrastate') {
            return 'intrastate-pipeline';
        }
        return '';
    }

    function createPopupContent(properties) {
        const operator = properties.Operator || 'Unknown Operator';
        const type = properties.TYPEPIPE || 'Unknown';
        const status = properties.Status || 'Unknown';

        return `
            <div style="min-width: 200px;">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">${operator}</h4>
                <p style="margin: 5px 0;"><strong>Type:</strong> ${type}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> ${status}</p>
            </div>
        `;
    }

    function updateInfoPanel(properties) {
        const infoContent = document.getElementById('info-content');
        const operator = properties.Operator || 'Unknown Operator';
        const type = properties.TYPEPIPE || 'Unknown';
        const status = properties.Status || 'Unknown';

        infoContent.innerHTML = `
            <h5 style="margin: 0 0 10px 0; color: #333;">${operator}</h5>
            <p><strong>Type:</strong> ${type}</p>
            <p><strong>Status:</strong> ${status}</p>
            <div class="info-stats">
                <div class="stat-item">
                    <span class="stat-label">Zoom Level:</span>
                    <span id="zoom-level">${map.getZoom()}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Visible Pipelines:</span>
                    <span id="pipeline-count">Loading...</span>
                </div>
            </div>
        `;
        updatePipelineCount();
    }

    function loadFilterOptions() {
        const operatorSelect = document.getElementById('operator-filter');
        while (operatorSelect.options.length > 1) {
            operatorSelect.remove(1);
        }
        Array.from(operatorOptions).sort().forEach(operator => {
            const option = document.createElement('option');
            option.value = operator;
            option.textContent = operator;
            operatorSelect.appendChild(option);
        });
    }

    function applyFilters() {
        if (!pipelineLayer) return;

        let whereClause = '1=1';

        if (currentFilters.operator !== 'all') {
            whereClause += ` AND Operator = '${currentFilters.operator}'`;
        }

        if (currentFilters.type !== 'all') {
            whereClause += ` AND TYPEPIPE = '${currentFilters.type}'`;
        }

        pipelineLayer.setWhere(whereClause);
    }

    function clearFilters() {
        currentFilters = {
            operator: 'all',
            type: 'all'
        };

        document.getElementById('operator-filter').value = 'all';
        document.getElementById('type-filter').value = 'all';

        applyFilters();
    }

    function toggleLegend() {
        const legend = document.getElementById('pipeline-legend');
        legendVisible = !legendVisible;

        legend.style.display = legendVisible ? 'block' : 'none';

        const button = document.getElementById('toggle-legend');
        button.textContent = legendVisible ? 'Hide Legend' : 'Legend';
    }

    function showLoading(show) {
        const spinner = document.getElementById('loading-spinner');
        spinner.style.display = show ? 'flex' : 'none';
        isLoading = show;
    }

    function showInstruction() {
        const currentZoom = map.getZoom();
        if (currentZoom < 4) {
            const infoContent = document.getElementById('info-content');
            infoContent.innerHTML = `
                <p>Zoom in and out to explore the US natural gas pipeline network. Click on pipelines for details.</p>
                <div class="info-stats">
                    <div class="stat-item">
                        <span class="stat-label">Zoom Level:</span>
                        <span id="zoom-level">${currentZoom}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Visible Pipelines:</span>
                        <span id="pipeline-count">Zoom in to load</span>
                    </div>
                </div>
            `;
        }
    }

    function updateZoomLevel() {
        const zoomElement = document.getElementById('zoom-level');
        if (zoomElement) {
            zoomElement.textContent = map.getZoom();
        }
    }

    function updatePipelineCount() {
        const countElement = document.getElementById('pipeline-count');
        if (countElement) {
            const currentZoom = map.getZoom();
            if (currentZoom < 6) {
                countElement.textContent = 'Zoom in to load';
            } else if (isLoading) {
                countElement.textContent = 'Loading...';
            } else {
                countElement.textContent = 'Loaded';
            }
        }
    }

    function showErrorMessage(message) {
        const infoContent = document.getElementById('info-content');
        infoContent.innerHTML = `<p style="color: #f44336; font-weight: 500;">${message}</p>`;
    }

    function setupEventHandlers() {
        document.getElementById('operator-filter').addEventListener('change', function() {
            currentFilters.operator = this.value;
            applyFilters();
        });

        document.getElementById('type-filter').addEventListener('change', function() {
            currentFilters.type = this.value;
            applyFilters();
        });

        document.getElementById('clear-filters').addEventListener('click', clearFilters);
        document.getElementById('toggle-legend').addEventListener('click', toggleLegend);

        map.on('zoomend', function() {
            updateZoomLevel();
            updatePipelineCount();
            showInstruction();
        });

        map.on('moveend', function() {
            updatePipelineCount();
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        if (typeof L !== 'undefined' && typeof L.esri !== 'undefined') {
            initMap();
        } else {
            console.error('Leaflet or Esri Leaflet library not loaded');
            showErrorMessage('Map libraries failed to load. Please refresh the page.');
        }
    });

})();
