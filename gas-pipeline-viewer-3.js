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

    // ESRI Feature Service URL
    const PIPELINE_SERVICE_URL = 'https://services7.arcgis.com/FGr1D95XCGALKXqM/arcgis/rest/services/NaturalGas_InterIntrastate_Pipelines_US_EIA/FeatureServer/0';

    function initMap() {
        // Initialize map centered on continental US
        map = L.map('gas-pipeline-map', {
            center: [39.8283, -98.5795],
            zoom: 9,
            minZoom: 3,
            maxZoom: 18
        });

        // Add base layers
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

        // Initialize pipeline layer
        initPipelineLayer();

        // Set up event handlers
        setupEventHandlers();

        // Update zoom level display
        updateZoomLevel();

        // Show initial instruction
        showInstruction();
    }

    function initPipelineLayer() {
        showLoading(true);

        // Create ESRI Feature Layer with performance optimizations
        pipelineLayer = L.esri.featureLayer({
            url: PIPELINE_SERVICE_URL,
            fields: ['OBJECTID', 'PIPE_NAME', 'Operator', 'TYPEPIPE', 'Status', 'DIAMETER', 'STATE'],
            minZoom: 6, // Only load data when zoomed in enough for performance
            style: stylePipeline,
            onEachFeature: onEachPipeline,
            simplifyFactor: 0.5, // Simplify geometries for better performance
            precision: 5 // Reduce coordinate precision
        });

        // Add layer to map
        pipelineLayer.addTo(map);

        // Handle layer events
        pipelineLayer.on('loading', function() {
            showLoading(true);
        });

        pipelineLayer.on('load', function() {
            showLoading(false);
            updatePipelineCount();
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

        // Determine color and style based on attributes
        let color = '#666666'; // default
        let weight = 2;
        let opacity = 0.8;
        let dashArray = null;

        // Style by pipeline type using correct field name TYPEPIPE
        if (properties.TYPEPIPE === 'Interstate') {
            color = '#1976D2'; // Blue for Interstate
        } else if (properties.TYPEPIPE === 'Intrastate') {
            color = '#388E3C'; // Green for Intrastate
        }


        // Adjust weight based on zoom level
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

        // Add CSS class for styling
        const pipelineClass = getPipelineClass(props);
        if (pipelineClass) {
            layer.options.className = (layer.options.className || '') + ' ' + pipelineClass;
        }

        // Handle click events - popup created lazily on first click
        layer.on('click', function() {
            layer.bindPopup(createPopupContent(props)).openPopup();
            updateInfoPanel(props);
        });

        // Store operator for filter options
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
        const name = properties.PIPE_NAME || properties.NAME || 'Unnamed Pipeline';
        const operator = properties.Operator || 'Unknown';
        const type = properties.TYPEPIPE || 'Unknown';
        const status = properties.Status || 'Unknown';
        const diameter = properties.DIAMETER || properties.PIPE_DIAM || 'Unknown';
        const state = properties.STATE || properties.STATE_NAME || 'Unknown';

        return `
            <div style="min-width: 250px;">
                <h4 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">${name}</h4>
                <p style="margin: 5px 0;"><strong>Operator:</strong> ${operator}</p>
                <p style="margin: 5px 0;"><strong>Type:</strong> ${type}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> ${status}</p>
                <p style="margin: 5px 0;"><strong>Diameter:</strong> ${diameter}</p>
                <p style="margin: 5px 0;"><strong>State:</strong> ${state}</p>
            </div>
        `;
    }

    function updateInfoPanel(properties) {
        const infoContent = document.getElementById('info-content');
        const name = properties.PIPE_NAME || properties.NAME || 'Unnamed Pipeline';
        const operator = properties.Operator || 'Unknown';
        const type = properties.TYPEPIPE || 'Unknown';
        const status = properties.Status || 'Unknown';

        infoContent.innerHTML = `
            <h5 style="margin: 0 0 10px 0; color: #333;">${name}</h5>
            <p><strong>Operator:</strong> ${operator}</p>
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
        // Load operator options
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

        // Build where clause for ESRI layer
        let whereClause = '1=1'; // Start with always true

        if (currentFilters.operator !== 'all') {
            whereClause += ` AND Operator = '${currentFilters.operator}'`;
        }

        if (currentFilters.type !== 'all') {
            whereClause += ` AND TYPEPIPE = '${currentFilters.type}'`;
        }

        // Apply filter to layer
        pipelineLayer.setWhere(whereClause);
    }

    function clearFilters() {
        currentFilters = {
            operator: 'all',
            type: 'all'
        };

        // Reset select elements
        document.getElementById('operator-filter').value = 'all';
        document.getElementById('type-filter').value = 'all';

        // Apply filters (which will remove all filters)
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
        // Only show if significantly zoomed out
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
                // Estimate count based on visible features
                countElement.textContent = 'Loaded';
            }
        }
    }

    function showErrorMessage(message) {
        const infoContent = document.getElementById('info-content');
        infoContent.innerHTML = `<p style="color: #f44336; font-weight: 500;">${message}</p>`;
    }

    function setupEventHandlers() {
        // Filter change handlers
        document.getElementById('operator-filter').addEventListener('change', function() {
            currentFilters.operator = this.value;
            applyFilters();
        });

        document.getElementById('type-filter').addEventListener('change', function() {
            currentFilters.type = this.value;
            applyFilters();
        });


        // Button handlers
        document.getElementById('clear-filters').addEventListener('click', clearFilters);
        document.getElementById('toggle-legend').addEventListener('click', toggleLegend);

        // Map event handlers
        map.on('zoomend', function() {
            updateZoomLevel();
            updatePipelineCount();
            showInstruction();
        });

        map.on('moveend', function() {
            updatePipelineCount();
        });
    }

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof L !== 'undefined' && typeof L.esri !== 'undefined') {
            initMap();
        } else {
            console.error('Leaflet or Esri Leaflet library not loaded');
            showErrorMessage('Map libraries failed to load. Please refresh the page.');
        }
    });

})();