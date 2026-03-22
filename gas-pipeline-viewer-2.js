(function() {
    'use strict';

    var map;
    var pipelineLayer;
    var currentFilters = {
        operator: 'all',
        type: 'all'
    };
    var operatorOptions = new Set();
    var operatorsLoaded = false;
    var isLoading = false;
    var legendVisible = false;

    // ESRI Feature Service URL
    var PIPELINE_SERVICE_URL = 'https://services7.arcgis.com/FGr1D95XCGALKXqM/arcgis/rest/services/NaturalGas_InterIntrastate_Pipelines_US_EIA/FeatureServer/0';

    // FIX 1: Only fetch the fields we actually use, not all columns
    var PIPELINE_FIELDS = ['PIPE_NAME', 'Operator', 'TYPEPIPE', 'Status', 'DIAMETER', 'STATE'];

    function initMap() {
        // FIX 2: Start at zoom 9 instead of 7. At zoom 7 the viewport covers
        // roughly one third of the continental US, triggering a massive initial
        // request. Zoom 9 covers a single state/region and keeps the first
        // payload manageable.
        map = L.map('gas-pipeline-map', {
            center: [39.8283, -98.5795],
            zoom: 9,
            minZoom: 3,
            maxZoom: 18
        });

        var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        });

        var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri, Maxar, Earthstar Geographics'
        });

        var baseMaps = {
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
            // FIX 1: Restrict returned fields to only those the app uses.
            // This dramatically reduces the per-feature payload from the ESRI service.
            fields: PIPELINE_FIELDS,
            // FIX 4: Raise minZoom from 6 to 7. This reduces the bounding box
            // sent on each query, which shrinks the result set and prevents the
            // esri-leaflet pagination loop from firing on large low-zoom extents.
            minZoom: 7,
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
            // FIX 4 (part 2): Only build the operator dropdown once.
            // Previously loadFilterOptions() ran on every pan/zoom load event,
            // causing repeated DOM teardown and rebuild of the entire <select>.
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
        var properties = feature.properties;
        var color = '#666666';
        var opacity = 0.8;

        if (properties.TYPEPIPE === 'Interstate') {
            color = '#1976D2';
        } else if (properties.TYPEPIPE === 'Intrastate') {
            color = '#388E3C';
        }

        // Cache zoom so we are not calling map.getZoom() per-feature
        var currentZoom = map.getZoom();
        var weight = currentZoom >= 10 ? 3 : currentZoom >= 8 ? 2 : 1;

        return {
            color: color,
            weight: weight,
            opacity: opacity
        };
    }

    function onEachPipeline(feature, layer) {
        var props = feature.properties;

        // FIX 3: Do not bind a popup eagerly for every feature.
        // Previously createPopupContent() ran and bindPopup() was called for
        // every loaded feature — potentially thousands of DOM operations before
        // the user has clicked anything. Now the popup is created only when the
        // user actually clicks a pipeline segment.
        layer.on('click', function() {
            layer.bindPopup(createPopupContent(props)).openPopup();
            updateInfoPanel(props);
        });

        var pipelineClass = getPipelineClass(props);
        if (pipelineClass) {
            layer.options.className = (layer.options.className || '') + ' ' + pipelineClass;
        }

        if (props.Operator) {
            operatorOptions.add(props.Operator);
        }
    }

    function getPipelineClass(properties) {
        if (properties.TYPEPIPE === 'Interstate') return 'interstate-pipeline';
        if (properties.TYPEPIPE === 'Intrastate') return 'intrastate-pipeline';
        return '';
    }

    function createPopupContent(properties) {
        var name = properties.PIPE_NAME || 'Unnamed Pipeline';
        var operator = properties.Operator || 'Unknown';
        var type = properties.TYPEPIPE || 'Unknown';
        var status = properties.Status || 'Unknown';
        var diameter = properties.DIAMETER || 'Unknown';
        var state = properties.STATE || 'Unknown';

        return '<div style="min-width:250px;">' +
            '<h4 style="margin:0 0 10px 0;color:#333;font-size:16px;">' + name + '</h4>' +
            '<p style="margin:5px 0;"><strong>Operator:</strong> ' + operator + '</p>' +
            '<p style="margin:5px 0;"><strong>Type:</strong> ' + type + '</p>' +
            '<p style="margin:5px 0;"><strong>Status:</strong> ' + status + '</p>' +
            '<p style="margin:5px 0;"><strong>Diameter:</strong> ' + diameter + '</p>' +
            '<p style="margin:5px 0;"><strong>State:</strong> ' + state + '</p>' +
            '</div>';
    }

    function updateInfoPanel(properties) {
        var infoContent = document.getElementById('info-content');
        var name = properties.PIPE_NAME || 'Unnamed Pipeline';
        var operator = properties.Operator || 'Unknown';
        var type = properties.TYPEPIPE || 'Unknown';
        var status = properties.Status || 'Unknown';

        infoContent.innerHTML = '<h5 style="margin:0 0 10px 0;color:#333;">' + name + '</h5>' +
            '<p><strong>Operator:</strong> ' + operator + '</p>' +
            '<p><strong>Type:</strong> ' + type + '</p>' +
            '<p><strong>Status:</strong> ' + status + '</p>' +
            '<div class="info-stats">' +
            '<div class="stat-item"><span class="stat-label">Zoom Level:</span>' +
            '<span id="zoom-level">' + map.getZoom() + '</span></div>' +
            '<div class="stat-item"><span class="stat-label">Visible Pipelines:</span>' +
            '<span id="pipeline-count">Loading...</span></div>' +
            '</div>';
        updatePipelineCount();
    }

    function loadFilterOptions() {
        var operatorSelect = document.getElementById('operator-filter');
        while (operatorSelect.options.length > 1) {
            operatorSelect.remove(1);
        }
        Array.from(operatorOptions).sort().forEach(function(operator) {
            var option = document.createElement('option');
            option.value = operator;
            option.textContent = operator;
            operatorSelect.appendChild(option);
        });
    }

    function applyFilters() {
        if (!pipelineLayer) return;

        var whereClause = '1=1';

        if (currentFilters.operator !== 'all') {
            whereClause += " AND Operator = '" + currentFilters.operator + "'";
        }

        if (currentFilters.type !== 'all') {
            whereClause += " AND TYPEPIPE = '" + currentFilters.type + "'";
        }

        pipelineLayer.setWhere(whereClause);
    }

    function clearFilters() {
        currentFilters = { operator: 'all', type: 'all' };
        document.getElementById('operator-filter').value = 'all';
        document.getElementById('type-filter').value = 'all';
        applyFilters();
    }

    function toggleLegend() {
        var legend = document.getElementById('pipeline-legend');
        legendVisible = !legendVisible;
        legend.style.display = legendVisible ? 'block' : 'none';
        document.getElementById('toggle-legend').textContent = legendVisible ? 'Hide Legend' : 'Legend';
    }

    function showLoading(show) {
        var spinner = document.getElementById('loading-spinner');
        spinner.style.display = show ? 'flex' : 'none';
        isLoading = show;
    }

    function showInstruction() {
        var currentZoom = map.getZoom();
        if (currentZoom < 4) {
            var infoContent = document.getElementById('info-content');
            infoContent.innerHTML = '<p>Zoom in and out to explore the US natural gas pipeline network. Click on pipelines for details.</p>' +
                '<div class="info-stats">' +
                '<div class="stat-item"><span class="stat-label">Zoom Level:</span>' +
                '<span id="zoom-level">' + currentZoom + '</span></div>' +
                '<div class="stat-item"><span class="stat-label">Visible Pipelines:</span>' +
                '<span id="pipeline-count">Zoom in to load</span></div>' +
                '</div>';
        }
    }

    function updateZoomLevel() {
        var zoomElement = document.getElementById('zoom-level');
        if (zoomElement) {
            zoomElement.textContent = map.getZoom();
        }
    }

    function updatePipelineCount() {
        var countElement = document.getElementById('pipeline-count');
        if (countElement) {
            var currentZoom = map.getZoom();
            if (currentZoom < 7) {
                countElement.textContent = 'Zoom in to load';
            } else if (isLoading) {
                countElement.textContent = 'Loading...';
            } else {
                countElement.textContent = 'Loaded';
            }
        }
    }

    function showErrorMessage(message) {
        var infoContent = document.getElementById('info-content');
        infoContent.innerHTML = '<p style="color:#f44336;font-weight:500;">' + message + '</p>';
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
