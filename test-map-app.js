// Wait for Leaflet to be loaded
(function() {
    'use strict';

    function initMap() {
        // Check if Leaflet is loaded
        if (typeof L === 'undefined') {
            console.error('Leaflet not loaded');
            return;
        }

        // Check if map container exists
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Map container not found');
            return;
        }

        // Initialize the map
        const map = L.map('map').setView([51.505, -0.09], 13);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        // Add a sample marker
        L.marker([51.505, -0.09])
            .addTo(map)
            .bindPopup('Sample Location')
            .openPopup();

        console.log('Map initialized successfully');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMap);
    } else {
        initMap();
    }
})();
