// NPS Trails Explorer
(function() {
    'use strict';

    // Configuration
    const FEATURE_SERVICE_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/ArcGIS/rest/services/National_Park_Service_Trails/FeatureServer/0';
    const MAX_RECORDS = 2000;

    // State
    let map;
    let trailsLayer;
    let selectedTrails = [];
    let drawnItems;
    let drawControl;

    function initApp() {
        if (typeof L === 'undefined') {
            console.error('Leaflet not loaded');
            return;
        }

        const mapElement = document.getElementById('nps-map');
        if (!mapElement) {
            console.error('Map container not found');
            return;
        }

        initializeMap();
        setupDrawingTools();
        setupEventListeners();
        loadInitialTrails();
    }

    function initializeMap() {
        // Initialize map centered on USA
        map = L.map('nps-map').setView([39.8283, -98.5795], 4);

        // Add basemap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        // Create layer for trails
        trailsLayer = L.geoJSON(null, {
            style: {
                color: '#2d7a3e',
                weight: 3,
                opacity: 0.7
            },
            onEachFeature: onEachTrail
        }).addTo(map);

        // Initialize drawn items layer
        drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
    }

    function setupDrawingTools() {
        // Drawing control for polygon and rectangle
        drawControl = new L.Control.Draw({
            draw: {
                polyline: false,
                polygon: {
                    allowIntersection: false,
                    showArea: true
                },
                rectangle: {
                    showArea: true
                },
                circle: false,
                marker: false,
                circlemarker: false
            },
            edit: {
                featureGroup: drawnItems,
                remove: true
            }
        });

        map.addControl(drawControl);

        // Handle drawn shapes
        map.on(L.Draw.Event.CREATED, function(event) {
            const layer = event.layer;
            drawnItems.clearLayers();
            drawnItems.addLayer(layer);
            selectTrailsInShape(layer);
        });

        map.on(L.Draw.Event.DELETED, function() {
            clearSelection();
        });
    }

    function setupEventListeners() {
        // Download buttons
        document.getElementById('nps-download-geojson').addEventListener('click', () => downloadSelection('geojson'));
        document.getElementById('nps-download-kml').addEventListener('click', () => downloadSelection('kml'));
        document.getElementById('nps-download-gpx').addEventListener('click', () => downloadSelection('gpx'));
    }

    function loadInitialTrails() {
        showLoading(true);
        const bounds = map.getBounds();
        queryTrails(bounds);
    }

    function queryTrails(bounds) {
        const bbox = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth()
        ].join(',');

        const url = `${FEATURE_SERVICE_URL}/query?` +
            `where=1=1&` +
            `geometry=${bbox}&` +
            `geometryType=esriGeometryEnvelope&` +
            `spatialRel=esriSpatialRelIntersects&` +
            `outFields=OBJECTID,TRLNAME,TRLTYPE,TRLCLASS,TRLSURFACE,TRLSTATUS,UNITNAME,Shape__Length&` +
            `returnGeometry=true&` +
            `outSR=4326&` +
            `f=geojson&` +
            `resultRecordCount=${MAX_RECORDS}`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                trailsLayer.clearLayers();
                trailsLayer.addData(data);
                showLoading(false);
            })
            .catch(error => {
                console.error('Error loading trails:', error);
                showLoading(false);
            });
    }

    function onEachTrail(feature, layer) {
        // Click handler for individual trails
        layer.on('click', function() {
            showTrailInfo(feature, layer);
        });

        // Store feature reference on layer
        layer.feature = feature;
    }

    function showTrailInfo(feature, layer) {
        const props = feature.properties;
        // Convert meters to miles (Shape__Length is in meters)
        const lengthMiles = ((props.Shape__Length || 0) / 1609.34).toFixed(2);

        const popupContent = `
            <div class="nps-popup-content">
                <h4>${props.TRLNAME || 'Unnamed Trail'}</h4>
                <div class="nps-info-row">
                    <span class="nps-label">Park/Unit</span>
                    <span class="nps-value">${props.UNITNAME || 'N/A'}</span>
                </div>
                <div class="nps-info-row">
                    <span class="nps-label">Trail Type</span>
                    <span class="nps-value">${props.TRLTYPE || 'N/A'}</span>
                </div>
                <div class="nps-info-row">
                    <span class="nps-label">Trail Class</span>
                    <span class="nps-value">${props.TRLCLASS || 'N/A'}</span>
                </div>
                <div class="nps-info-row">
                    <span class="nps-label">Surface</span>
                    <span class="nps-value">${props.TRLSURFACE || 'N/A'}</span>
                </div>
                <div class="nps-info-row">
                    <span class="nps-label">Status</span>
                    <span class="nps-value">${props.TRLSTATUS || 'N/A'}</span>
                </div>
                <div class="nps-info-row">
                    <span class="nps-label">Length</span>
                    <span class="nps-value">${lengthMiles} miles</span>
                </div>
            </div>
        `;

        layer.bindPopup(popupContent).openPopup();
    }

    function selectTrailsInShape(shape) {
        selectedTrails = [];
        const shapeBounds = shape.getBounds ? shape.getBounds() : shape.getLatLngs()[0];

        trailsLayer.eachLayer(function(layer) {
            if (isTrailInShape(layer, shape)) {
                selectedTrails.push(layer.feature);
                layer.setStyle({
                    color: '#ff6b00',
                    weight: 4,
                    opacity: 1.0
                });
            } else {
                layer.setStyle({
                    color: '#2d7a3e',
                    weight: 3,
                    opacity: 0.7
                });
            }
        });

        updateSelectionUI();
    }

    function isTrailInShape(layer, shape) {
        if (!layer.feature || !layer.feature.geometry) return false;

        const coords = layer.feature.geometry.coordinates;
        if (!coords || coords.length === 0) return false;

        // Check if any point of the trail is within the shape
        const flatCoords = flattenCoordinates(coords);
        for (let coord of flatCoords) {
            const point = L.latLng(coord[1], coord[0]);
            if (shape.getBounds) {
                if (shape.getBounds().contains(point)) return true;
            } else if (shape.contains) {
                if (shape.contains(point)) return true;
            }
        }
        return false;
    }

    function flattenCoordinates(coords) {
        if (typeof coords[0] === 'number') {
            return [coords];
        }
        return coords.flat(Infinity).reduce((acc, val) => {
            if (typeof val[0] === 'number') {
                acc.push(val);
            }
            return acc;
        }, []);
    }

    function updateSelectionUI() {
        const count = selectedTrails.length;
        document.getElementById('nps-trail-count').textContent = count;

        if (count > 0) {
            document.getElementById('nps-selection-info').style.display = 'block';
        } else {
            document.getElementById('nps-selection-info').style.display = 'none';
        }
    }

    function clearSelection() {
        selectedTrails = [];
        drawnItems.clearLayers();

        // Reset trail styles
        trailsLayer.eachLayer(function(layer) {
            layer.setStyle({
                color: '#2d7a3e',
                weight: 3,
                opacity: 0.7
            });
        });

        updateSelectionUI();
    }

    function downloadSelection(format) {
        if (selectedTrails.length === 0) {
            alert('No trails selected. Please select trails first.');
            return;
        }

        const geojson = {
            type: 'FeatureCollection',
            features: selectedTrails
        };

        let content, filename, mimeType;

        switch(format) {
            case 'geojson':
                content = JSON.stringify(geojson, null, 2);
                filename = 'nps-trails.geojson';
                mimeType = 'application/json';
                break;
            case 'kml':
                content = convertToKML(geojson);
                filename = 'nps-trails.kml';
                mimeType = 'application/vnd.google-earth.kml+xml';
                break;
            case 'gpx':
                content = convertToGPX(geojson);
                filename = 'nps-trails.gpx';
                mimeType = 'application/gpx+xml';
                break;
        }

        downloadFile(content, filename, mimeType);
    }

    function convertToKML(geojson) {
        let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
        kml += '  <Document>\n';
        kml += '    <name>NPS Trails</name>\n';
        kml += '    <Style id="trailStyle">\n';
        kml += '      <LineStyle><color>ff3e7a2d</color><width>3</width></LineStyle>\n';
        kml += '    </Style>\n';

        geojson.features.forEach(feature => {
            const props = feature.properties;
            const coords = feature.geometry.coordinates;

            kml += '    <Placemark>\n';
            kml += `      <name>${escapeXml(props.TRLNAME || 'Unnamed Trail')}</name>\n`;
            kml += '      <styleUrl>#trailStyle</styleUrl>\n';
            kml += '      <description><![CDATA[\n';
            kml += `        Park: ${props.UNITNAME || 'N/A'}<br/>\n`;
            kml += `        Type: ${props.TRLTYPE || 'N/A'}<br/>\n`;
            kml += `        Status: ${props.TRLSTATUS || 'N/A'}\n`;
            kml += '      ]]></description>\n';
            kml += '      <LineString>\n';
            kml += '        <coordinates>\n';

            flattenCoordinates(coords).forEach(coord => {
                kml += `          ${coord[0]},${coord[1]},0\n`;
            });

            kml += '        </coordinates>\n';
            kml += '      </LineString>\n';
            kml += '    </Placemark>\n';
        });

        kml += '  </Document>\n';
        kml += '</kml>';

        return kml;
    }

    function convertToGPX(geojson) {
        let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
        gpx += '<gpx version="1.1" creator="NPS Trails Explorer"\n';
        gpx += '  xmlns="http://www.topografix.com/GPX/1/1"\n';
        gpx += '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
        gpx += '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';

        geojson.features.forEach(feature => {
            const props = feature.properties;
            const coords = feature.geometry.coordinates;

            gpx += '  <trk>\n';
            gpx += `    <name>${escapeXml(props.TRLNAME || 'Unnamed Trail')}</name>\n`;
            gpx += `    <desc>Park: ${escapeXml(props.UNITNAME || 'N/A')}</desc>\n`;
            gpx += '    <trkseg>\n';

            flattenCoordinates(coords).forEach(coord => {
                gpx += `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>\n`;
            });

            gpx += '    </trkseg>\n';
            gpx += '  </trk>\n';
        });

        gpx += '</gpx>';

        return gpx;
    }

    function escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function showLoading(show) {
        const loadingEl = document.getElementById('nps-loading');
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        }
    }

    // Initialize when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
