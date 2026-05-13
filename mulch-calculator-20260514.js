/* Mulch Calculator
 * Leaflet.Draw polygon multi-bed support
 * Outputs: cu yd, cu ft, 2 cu ft bags, 3 cu ft bags, scoops, truck loads, pine straw bales
 * Cost: bagged vs bulk with delivery and labor
 */
(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /*  Constants                                                           */
    /* ------------------------------------------------------------------ */

    var MULCH_TYPES = {
        bark:      { label: 'Bark / Wood Chip',      costBag: 4.50, costYd: 32 },
        hardwood:  { label: 'Shredded Hardwood',     costBag: 5.00, costYd: 35 },
        pine:      { label: 'Pine Straw',            costBag: 5.50, costYd: 38, bales: true },
        cedar:     { label: 'Cedar',                 costBag: 6.00, costYd: 42 },
        cypress:   { label: 'Cypress',               costBag: 6.50, costYd: 45 },
        rubber:    { label: 'Rubber Mulch',          costBag: 9.00, costYd: 70 },
        cocoa:     { label: 'Cocoa Hull',            costBag: 8.00, costYd: 60 },
        dyed:      { label: 'Black / Red Dyed',      costBag: 5.50, costYd: 38 }
    };

    /* Pine straw: one bale covers ~30 sq ft at 3 in depth */
    var PINE_BALE_SQFT = 30;

    /* 1 scoop at nursery ~ 1 cu yd; truck load ~ 10 cu yd */
    var SCOOP_CUYD   = 1;
    var TRUCK_CUYD   = 10;

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */
    var beds = [];          // [{id, layer, areaSqFt}]
    var bedCounter = 0;
    var units = 'imperial'; // 'imperial' | 'metric'
    var currentType = 'hardwood';
    var map, drawnItems, drawControl;

    /* ------------------------------------------------------------------
     * DOM helpers
     * ------------------------------------------------------------------ */
    function el(id) { return document.getElementById(id); }
    function val(id) { return parseFloat(el(id).value) || 0; }
    function fmt(n, dec) { return n.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
    function fmtMoney(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

    /* ------------------------------------------------------------------
     * Tile layers
     * ------------------------------------------------------------------ */
    function buildTileLayers() {
        var satellite = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: 'Tiles &copy; Esri', maxZoom: 20 }
        );
        var street = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
        );
        return { satellite: satellite, street: street };
    }

    /* ------------------------------------------------------------------
     * Map init
     * ------------------------------------------------------------------ */
    function initMap() {
        var layers = buildTileLayers();

        map = L.map('mulch-calculator-map', {
            center: [39.5, -98.35],
            zoom: 4,
            layers: [layers.satellite]
        });

        L.control.layers(
            { 'Satellite': layers.satellite, 'Street': layers.street },
            {},
            { position: 'topright' }
        ).addTo(map);

        drawnItems = new L.FeatureGroup().addTo(map);

        drawControl = new L.Control.Draw({
            edit: { featureGroup: drawnItems, remove: true },
            draw: {
                polygon:   { shapeOptions: { color: '#5d4037', weight: 2, fillOpacity: 0.25 } },
                rectangle: { shapeOptions: { color: '#5d4037', weight: 2, fillOpacity: 0.25 } },
                polyline:  false,
                circle:    false,
                circlemarker: false,
                marker:    false
            }
        });
        drawControl.addTo(map);

        map.on('draw:created', function (e) {
            onShapeCreated(e.layer);
        });

        map.on('draw:deleted', function (e) {
            e.layers.eachLayer(function (layer) {
                removeBedByLayer(layer);
            });
            renderBedList();
            updateResults();
        });

        map.on('draw:edited', function (e) {
            e.layers.eachLayer(function (layer) {
                updateBedArea(layer);
            });
            renderBedList();
            updateResults();
        });
    }

    /* ------------------------------------------------------------------
     * Area calculation
     * ------------------------------------------------------------------ */
    function layerAreaSqFt(layer) {
        var latlngs = layer.getLatLngs ? layer.getLatLngs() : null;
        if (!latlngs) return 0;
        // Flatten for rectangles / simple polygons
        var ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        if (Array.isArray(ring[0])) ring = ring[0];
        return L.GeometryUtil.geodesicArea(ring) * 10.7639; // m2 -> sqft
    }

    /* ------------------------------------------------------------------
     * Bed management
     * ------------------------------------------------------------------ */
    function onShapeCreated(layer) {
        drawnItems.addLayer(layer);
        bedCounter++;
        var areaSqFt = layerAreaSqFt(layer);
        var bed = { id: bedCounter, layer: layer, areaSqFt: areaSqFt };
        beds.push(bed);
        addMeasureLabel(layer, areaSqFt);
        renderBedList();
        updateResults();
    }

    function removeBedByLayer(layer) {
        beds = beds.filter(function (b) { return b.layer !== layer; });
    }

    function updateBedArea(layer) {
        beds.forEach(function (b) {
            if (b.layer === layer) {
                b.areaSqFt = layerAreaSqFt(layer);
            }
        });
    }

    function removeBedById(id) {
        var bed = beds.find(function (b) { return b.id === id; });
        if (!bed) return;
        drawnItems.removeLayer(bed.layer);
        beds = beds.filter(function (b) { return b.id !== id; });
        renderBedList();
        updateResults();
    }

    function totalAreaSqFt() {
        return beds.reduce(function (s, b) { return s + b.areaSqFt; }, 0);
    }

    /* ------------------------------------------------------------------
     * On-map labels
     * ------------------------------------------------------------------ */
    function addMeasureLabel(layer, areaSqFt) {
        var center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
        var areaM2 = areaSqFt / 10.7639;
        var html = '<div style="background:rgba(93,64,55,0.82);color:#fff;padding:3px 7px;border-radius:4px;font-size:12px;font-weight:700;white-space:nowrap;">'
            + fmt(areaSqFt, 0) + ' sq ft<br>'
            + '<span style="font-size:10px;opacity:.85;">' + fmt(areaM2, 1) + ' m²</span></div>';
        var icon = L.divIcon({ className: 'mulch-measure-label', html: html, iconAnchor: [0, 0] });
        L.marker(center, { icon: icon, interactive: false, zIndexOffset: 500 }).addTo(drawnItems);
    }

    /* ------------------------------------------------------------------
     * Bed list render
     * ------------------------------------------------------------------ */
    function renderBedList() {
        var listEl = el('mulch-bed-list-inner');
        if (!listEl) return;
        if (beds.length === 0) {
            listEl.innerHTML = '<p class="mulch-no-beds">No beds drawn yet. Use the draw tools on the map.</p>';
            var totEl = el('mulch-beds-total');
            if (totEl) totEl.textContent = '';
            return;
        }
        var html = '';
        var isMetric = units === 'metric';
        beds.forEach(function (b) {
            var displayArea = isMetric
                ? fmt(b.areaSqFt / 10.7639, 1) + ' m²'
                : fmt(b.areaSqFt, 0) + ' sq ft';
            html += '<div class="mulch-bed-row">'
                + '<span>Bed ' + b.id + ': ' + displayArea + '</span>'
                + '<button class="mulch-bed-del" onclick="mulchDeleteBed(' + b.id + ')" title="Remove bed">&times;</button>'
                + '</div>';
        });
        listEl.innerHTML = html;
        var tot = totalAreaSqFt();
        var totDisplay = isMetric
            ? fmt(tot / 10.7639, 1) + ' m² total'
            : fmt(tot, 0) + ' sq ft total';
        var totEl = el('mulch-beds-total');
        if (totEl) totEl.textContent = totDisplay;
    }

    /* Expose delete for inline onclick */
    window.mulchDeleteBed = removeBedById;

    /* ------------------------------------------------------------------
     * Core calculation
     * ------------------------------------------------------------------ */
    function calcMulch(areaSqFt, depthIn, mulchTypeKey) {
        if (!areaSqFt || !depthIn) return null;

        var cuFt   = areaSqFt * (depthIn / 12);
        var cuYd   = cuFt / 27;
        var bags2  = Math.ceil(cuFt / 2);
        var bags3  = Math.ceil(cuFt / 3);
        var scoops = cuYd / SCOOP_CUYD;
        var trucks = cuYd / TRUCK_CUYD;

        // Pine straw bales (30 sq ft coverage per bale at 3 in; scale to actual depth)
        var scaledCoverage = PINE_BALE_SQFT * (3 / depthIn);
        var pineBales = Math.ceil(areaSqFt / scaledCoverage);

        return {
            areaSqFt:  areaSqFt,
            areaM2:    areaSqFt / 10.7639,
            cuFt:      cuFt,
            cuYd:      cuYd,
            bags2:     bags2,
            bags3:     bags3,
            scoops:    scoops,
            trucks:    trucks,
            pineBales: pineBales,
            isPine:    mulchTypeKey === 'pine'
        };
    }

    function calcCost(res, mulchTypeKey) {
        if (!res) return null;
        var type       = MULCH_TYPES[mulchTypeKey] || MULCH_TYPES.hardwood;
        var priceBag   = val('mulch-price-bag')  || type.costBag;
        var priceYd    = val('mulch-price-yd')   || type.costYd;
        var delivery   = val('mulch-delivery')   || 0;
        var laborSqFt  = val('mulch-labor')      || 0;

        var costBagged = res.bags2 * priceBag;    // using 2 cu ft bags as default
        var costBulk   = res.cuYd * priceYd;
        var costLabor  = res.areaSqFt * laborSqFt;

        return {
            costBagged:  costBagged,
            costBulk:    costBulk,
            costLabor:   costLabor,
            totalBagged: costBagged + delivery + costLabor,
            totalBulk:   costBulk   + delivery + costLabor,
            delivery:    delivery
        };
    }

    /* ------------------------------------------------------------------
     * Update UI results
     * ------------------------------------------------------------------ */
    function updateResults() {
        var areaSqFt  = totalAreaSqFt();
        var depthIn   = val('mulch-depth') || 3;
        var typeKey   = (el('mulch-type') || {}).value || 'hardwood';
        currentType   = typeKey;

        var res  = calcMulch(areaSqFt, depthIn, typeKey);
        var cost = res ? calcCost(res, typeKey) : null;

        // Volume block
        el('mulch-res-cuyd').textContent  = res ? fmt(res.cuYd, 2)  : '--';
        el('mulch-res-cuft').textContent  = res ? fmt(res.cuFt, 1)  : '--';
        el('mulch-res-bags2').textContent = res ? fmt(res.bags2, 0) : '--';
        el('mulch-res-bags3').textContent = res ? fmt(res.bags3, 0) : '--';
        el('mulch-res-scoops').textContent  = res ? fmt(res.scoops, 1) : '--';
        el('mulch-res-trucks').textContent  = res ? (res.trucks >= 0.1 ? fmt(res.trucks, 2) : '< 0.1') : '--';

        // Pine straw block
        var pineNote = el('mulch-pine-note');
        if (pineNote) {
            if (res && res.isPine) {
                el('mulch-res-bales').textContent = fmt(res.pineBales, 0);
                pineNote.classList.add('visible');
            } else {
                pineNote.classList.remove('visible');
            }
        }

        // Area display
        var isMetric = units === 'metric';
        el('mulch-area-display').textContent = res
            ? (isMetric ? fmt(res.areaM2, 1) + ' m²' : fmt(res.areaSqFt, 0) + ' sq ft')
            : '--';

        // Cost block
        if (cost) {
            el('mulch-cost-bagged').textContent = fmtMoney(cost.costBagged);
            el('mulch-cost-bulk').textContent   = fmtMoney(cost.costBulk);
            el('mulch-cost-labor').textContent  = fmtMoney(cost.costLabor);
            el('mulch-cost-total-bagged').textContent = fmtMoney(cost.totalBagged);
            el('mulch-cost-total-bulk').textContent   = fmtMoney(cost.totalBulk);
        } else {
            ['mulch-cost-bagged','mulch-cost-bulk','mulch-cost-labor',
             'mulch-cost-total-bagged','mulch-cost-total-bulk'].forEach(function (id) {
                el(id).textContent = '--';
            });
        }

        // Update coverage hint
        updateCoverageHint(depthIn);
    }

    function updateCoverageHint(depthIn) {
        var hintEl = el('mulch-coverage-hint');
        if (!hintEl) return;
        var sqftPerYd = (1 / (depthIn / 12)) * 27; // sqft per cu yd
        hintEl.textContent = '1 cu yd covers approx. ' + Math.round(sqftPerYd) + ' sq ft at ' + depthIn + '"';
    }

    /* ------------------------------------------------------------------
     * Address search
     * ------------------------------------------------------------------ */
    function searchAddress() {
        var query = (el('mulch-address') || {}).value;
        if (!query) return;
        var loadEl = el('mulch-loading');
        if (loadEl) loadEl.classList.remove('hidden');

        var url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1';
        fetch(url, { headers: { 'Accept': 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.length > 0) {
                    var lat = parseFloat(data[0].lat);
                    var lng = parseFloat(data[0].lon);
                    map.setView([lat, lng], 19);
                }
            })
            .catch(function () {})
            .finally(function () {
                if (loadEl) loadEl.classList.add('hidden');
            });
    }

    /* ------------------------------------------------------------------
     * Clear all beds
     * ------------------------------------------------------------------ */
    function clearAll() {
        drawnItems.clearLayers();
        beds = [];
        renderBedList();
        updateResults();
    }

    /* ------------------------------------------------------------------
     * Print
     * ------------------------------------------------------------------ */
    function printResults() {
        window.print();
    }

    /* ------------------------------------------------------------------
     * URL hash share state
     * ------------------------------------------------------------------ */
    function updateHash() {
        var center = map.getCenter();
        var hash = '#lat=' + center.lat.toFixed(5)
            + '&lng=' + center.lng.toFixed(5)
            + '&z=' + map.getZoom()
            + '&depth=' + (val('mulch-depth') || 3)
            + '&type=' + encodeURIComponent((el('mulch-type') || {}).value || 'hardwood');
        history.replaceState(null, '', hash);
    }

    function loadHash() {
        var hash = window.location.hash.slice(1);
        if (!hash) return;
        var params = {};
        hash.split('&').forEach(function (p) {
            var idx = p.indexOf('=');
            if (idx > -1) params[p.slice(0, idx)] = decodeURIComponent(p.slice(idx + 1));
        });
        if (params.lat && params.lng && params.z) {
            map.setView([parseFloat(params.lat), parseFloat(params.lng)], parseInt(params.z, 10));
        }
        if (params.depth && el('mulch-depth')) el('mulch-depth').value = params.depth;
        if (params.type  && el('mulch-type'))  el('mulch-type').value  = params.type;
    }

    /* ------------------------------------------------------------------
     * Boot
     * ------------------------------------------------------------------ */
    function boot() {
        initMap();
        loadHash();
        updateResults();

        // Search
        var searchBtn = el('mulch-search-btn');
        if (searchBtn) searchBtn.addEventListener('click', searchAddress);
        var addrInput = el('mulch-address');
        if (addrInput) addrInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') searchAddress();
        });

        // Inputs → recalc
        ['mulch-depth','mulch-type','mulch-price-bag','mulch-price-yd',
         'mulch-delivery','mulch-labor'].forEach(function (id) {
            var el2 = el(id);
            if (el2) el2.addEventListener('input', function () {
                updateResults();
                updateHash();
            });
        });

        // Unit toggle
        ['mulch-unit-imp','mulch-unit-met'].forEach(function (id) {
            var btn = el(id);
            if (!btn) return;
            btn.addEventListener('click', function () {
                units = id === 'mulch-unit-met' ? 'metric' : 'imperial';
                el('mulch-unit-imp').classList.toggle('active', units === 'imperial');
                el('mulch-unit-met').classList.toggle('active', units === 'metric');
                renderBedList();
                updateResults();
            });
        });

        // Clear / print
        var clearBtn = el('mulch-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', clearAll);
        var printBtn = el('mulch-print-btn');
        if (printBtn) printBtn.addEventListener('click', printResults);

        // Hash on map move
        map.on('moveend', updateHash);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
