(function () {
  'use strict';

  var SLUG = 'us-tap-water-quality-map';
  var SERVICE_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Community_Water_Systems_March_28_2024/FeatureServer/343';

  var COMPLIANCE_STYLE = {
    'No deficiencies or recommendations': {
      fill: '#2e7d32', stroke: '#1b5e20', label: 'No Deficiencies',
      desc: 'This system passed its EPA Sanitary Survey with no issues. The water source, treatment process, and distribution infrastructure all met federal safety standards at the time of inspection.'
    },
    'Recommendations made': {
      fill: '#f9a825', stroke: '#e65100', label: 'Recommendations Made',
      desc: 'The system is technically compliant, but inspectors flagged areas for improvement. These are advisory notices &mdash; not violations &mdash; and typically cover aging equipment, documentation gaps, or staff training. No immediate public health risk.'
    },
    'Minor deficiencies': {
      fill: '#ef6c00', stroke: '#bf360c', label: 'Minor Deficiencies',
      desc: 'Inspectors found real problems that require corrective action. These issues could affect water quality over time but do not pose an immediate health risk. The system must fix them before the next survey.'
    },
    'Significant deficiencies': {
      fill: '#c62828', stroke: '#7f0000', label: 'Significant Deficiencies',
      desc: 'Serious problems were found that could directly threaten public health &mdash; such as inadequate disinfection, source contamination, or critical distribution failures. The system is required to take prompt corrective action. This is the most serious sanitary survey outcome short of an enforcement action.'
    },
    'Not Applicable': {
      fill: '#9e9e9e', stroke: '#616161', label: 'Not Applicable',
      desc: 'A sanitary survey is not required for this system type. This typically applies to consecutive or wholesale systems that receive fully treated water from another utility and do not operate their own treatment facilities.'
    },
    'Not evaluated': {
      fill: '#bdbdbd', stroke: '#757575', label: 'Not Evaluated',
      desc: 'This system\'s sanitary survey is overdue or has not yet been completed. An unreviewed system is not the same as a safe system &mdash; it simply means EPA or the state primacy agency has not yet conducted an inspection.'
    },
    'Record Not Available or Not Reported to EPA': {
      fill: '#bdbdbd', stroke: '#757575', label: 'No Record',
      desc: 'EPA has no sanitary survey record for this system. This may reflect a reporting gap between the state primacy agency and the federal ECHO database, or the system may be newly established.'
    }
  };

  var FILTERS = [
    { key: 'all',         label: 'All Systems',             where: "1=1" },
    { key: 'issues',      label: 'Any Deficiency',          where: "COMPLIANCE_EVAL_CODE IN ('Recommendations made','Minor deficiencies','Significant deficiencies')" },
    { key: 'significant', label: 'Significant Deficiencies', where: "COMPLIANCE_EVAL_CODE = 'Significant deficiencies'" },
    { key: 'enforcement', label: 'Enforcement Priority',    where: "ENF_PRIORITY_SYS = 'Y'" },
    { key: 'schools',     label: 'Schools & Daycares',      where: "SCHOOL_OR_DAYCARE = 'Y'" }
  ];

  var OUT_FIELDS = [
    'PWSID', 'PWS_NAME', 'PRIMACY_AGENCY', 'CITY_SERVED',
    'COMPLIANCE_EVAL_CODE', 'OWNER_TYPE', 'SOURCE_WATER_TYPE',
    'POPULATION_SERVED_COUNT', 'VIOLATIONS_NON_RTC_COUNT',
    'NUM_LEAD_SERVICE_LINES', 'ENF_PRIORITY_SYS', 'SCHOOL_OR_DAYCARE'
  ];

  var st = {
    map: null,
    layer: null,
    activeFilter: 'all'
  };

  /* ── Init ────────────────────────────────────────────────────────── */

  function init() {
    var h = loadHash();
    var lat  = h.lat  || 38.5;
    var lng  = h.lng  || -96.0;
    var zoom = h.z    || 4;

    st.map = L.map(SLUG + '-map', {
      center: [lat, lng],
      zoom: zoom,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Source: <a href="https://echo.epa.gov" target="_blank" rel="noopener">EPA ECHO</a>',
      maxZoom: 19
    }).addTo(st.map);

    st.layer = L.esri.featureLayer({
      url: SERVICE_URL,
      where: '1=1',
      outFields: OUT_FIELDS,
      precision: 4,
      style: styleFeature,
      onEachFeature: bindPopup
    }).addTo(st.map);

    st.map.on('moveend', saveHash);

    buildFilterButtons();
    buildLegend();
    wireSearch();
  }

  /* ── Style ───────────────────────────────────────────────────────── */

  function styleFeature(feature) {
    var code = (feature.properties.COMPLIANCE_EVAL_CODE || '').trim();
    var s = COMPLIANCE_STYLE[code] || { fill: '#bdbdbd', stroke: '#757575' };
    return {
      color: s.stroke,
      fillColor: s.fill,
      fillOpacity: 0.55,
      weight: 0.8,
      opacity: 0.9
    };
  }

  /* ── Popup ───────────────────────────────────────────────────────── */

  function bindPopup(feature, lyr) {
    lyr.bindPopup(buildPopup(feature.properties), { maxWidth: 320 });
  }

  function buildPopup(p) {
    var code = (p.COMPLIANCE_EVAL_CODE || '').trim();
    var s = COMPLIANCE_STYLE[code] || { fill: '#9e9e9e', label: 'Unknown' };
    var badge = '<span style="display:inline-block;background:' + s.fill + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:4px 0 4px">' + (s.label || code || 'Unknown') + '</span>';
    var descBox = s.desc
      ? '<p style="margin:0 0 8px;font-size:12px;color:#4b5563;line-height:1.45;border-left:3px solid ' + s.fill + ';padding-left:8px">' + s.desc + '</p>'
      : '';
    var loc = [p.CITY_SERVED, p.PRIMACY_AGENCY].filter(Boolean).join(', ');
    var pop = p.POPULATION_SERVED_COUNT ? (+p.POPULATION_SERVED_COUNT).toLocaleString() : 'N/A';
    var lead = (p.NUM_LEAD_SERVICE_LINES !== null && p.NUM_LEAD_SERVICE_LINES !== undefined)
      ? (+p.NUM_LEAD_SERVICE_LINES).toLocaleString()
      : 'Not reported';
    var viols = p.VIOLATIONS_NON_RTC_COUNT ? p.VIOLATIONS_NON_RTC_COUNT : '0';
    var enf = p.ENF_PRIORITY_SYS === 'Y'
      ? '<span style="color:#c62828;font-weight:600">Yes &mdash; under active EPA enforcement oversight</span>'
      : 'No';
    var ewgUrl = p.PWSID ? 'https://www.ewg.org/tapwater/system.php?pws=' + encodeURIComponent(p.PWSID) : null;
    var epaLink = ewgUrl
      ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb">' +
          '<a href="' + ewgUrl + '" target="_blank" rel="noopener" style="font-size:12px;color:#1d4ed8">Look up on EWG Tap Water Database &rarr;</a>' +
          '<span style="display:block;margin-top:3px;font-size:11px;color:#9ca3af">PWS ID: ' + p.PWSID + '</span>' +
        '</div>'
      : '';

    return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:13px;line-height:1.5;max-width:300px">' +
      '<strong style="font-size:14px">' + (p.PWS_NAME || 'Water System') + '</strong><br>' +
      '<span style="color:#6b7280;font-size:12px">' + loc + '</span><br>' +
      badge + '<br>' +
      descBox +
      '<table style="border-collapse:collapse;width:100%;font-size:12px;margin-top:2px">' +
        row('Population served', pop) +
        row('Owner type', p.OWNER_TYPE || 'N/A') +
        row('Source water', p.SOURCE_WATER_TYPE || 'N/A') +
        row('Unresolved violations', viols) +
        row('Lead service lines', lead) +
        row('Enforcement priority', enf) +
        row('Serves school/daycare', p.SCHOOL_OR_DAYCARE === 'Y' ? 'Yes' : 'No') +
      '</table>' +
      epaLink +
      '</div>';
  }

  function row(label, value) {
    return '<tr>' +
      '<td style="padding:2px 8px 2px 0;color:#6b7280;white-space:nowrap">' + label + '</td>' +
      '<td style="padding:2px 0;font-weight:500">' + value + '</td>' +
      '</tr>';
  }

  /* ── Filter buttons ──────────────────────────────────────────────── */

  function buildFilterButtons() {
    var wrap = document.getElementById(SLUG + '-filters');
    if (!wrap) return;
    var html = '';
    FILTERS.forEach(function (f) {
      var active = f.key === 'all' ? ' active' : '';
      html += '<button class="' + SLUG + '-filter-btn' + active + '" data-key="' + f.key + '">' + f.label + '</button>';
    });
    wrap.innerHTML = html;
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.' + SLUG + '-filter-btn');
      if (!btn) return;
      var key = btn.dataset.key;
      var filter = FILTERS.filter(function (f) { return f.key === key; })[0];
      if (!filter || key === st.activeFilter) return;
      st.activeFilter = key;
      wrap.querySelectorAll('.' + SLUG + '-filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      st.layer.setWhere(filter.where);
    });
  }

  /* ── Legend ──────────────────────────────────────────────────────── */

  function buildLegend() {
    var el = document.getElementById(SLUG + '-legend');
    if (!el) return;
    var order = [
      'No deficiencies or recommendations',
      'Recommendations made',
      'Minor deficiencies',
      'Significant deficiencies',
      'Not Applicable'
    ];
    var html = '';
    order.forEach(function (code) {
      var s = COMPLIANCE_STYLE[code];
      if (!s) return;
      html += '<span class="' + SLUG + '-legend-item">' +
        '<span class="' + SLUG + '-legend-swatch" style="background:' + s.fill + ';border-color:' + s.stroke + '"></span>' +
        s.label +
        '</span>';
    });
    el.innerHTML = html;
  }

  /* ── Address search + geolocation ───────────────────────────────── */

  function wireSearch() {
    var searchBtn = document.getElementById(SLUG + '-search-btn');
    var locBtn    = document.getElementById(SLUG + '-locate-btn');
    var input     = document.getElementById(SLUG + '-address');
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (input)     input.addEventListener('keypress', function (e) { if (e.key === 'Enter') doSearch(); });
    if (locBtn)    locBtn.addEventListener('click', doLocate);
  }

  function doSearch() {
    var input = document.getElementById(SLUG + '-address');
    var q = input ? input.value.trim() : '';
    if (!q) return;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept-Language': 'en' }
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.length) { alert('Address not found.'); return; }
        st.map.setView([+res[0].lat, +res[0].lon], 11);
      })
      .catch(function () { alert('Search failed. Please try again.'); });
  }

  function doLocate() {
    if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      function (pos) { st.map.setView([pos.coords.latitude, pos.coords.longitude], 11); },
      function ()    { alert('Unable to determine your location.'); }
    );
  }

  /* ── URL hash share ──────────────────────────────────────────────── */

  function saveHash() {
    var c = st.map.getCenter();
    history.replaceState(null, '', '#lat=' + c.lat.toFixed(4) + '&lng=' + c.lng.toFixed(4) + '&z=' + st.map.getZoom());
  }

  function loadHash() {
    var h = window.location.hash.slice(1);
    if (!h) return {};
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    if (out.lat) out.lat = parseFloat(out.lat);
    if (out.lng) out.lng = parseFloat(out.lng);
    if (out.z)   out.z  = parseInt(out.z, 10);
    return out;
  }

  /* ── Start ───────────────────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
