/* MapScaping Deed Plotter - client-side metes and bounds plotter */
(function (root) {
  'use strict';

  var DEG = '°';

  /* ------------------------------------------------------------------ */
  /* Units (all converted to international feet)                         */
  /* ------------------------------------------------------------------ */
  var UNITS = {
    ft:   { f: 1,          label: 'feet', short: 'ft' },
    ch:   { f: 66,         label: 'chains (66 ft)', short: 'ch' },
    lk:   { f: 0.66,       label: 'links (0.66 ft)', short: 'lk' },
    rod:  { f: 16.5,       label: 'rods / poles / perches (16.5 ft)', short: 'poles' },
    vara: { f: 100 / 36,   label: 'varas, Texas (33 1/3 in)', short: 'vrs' },
    m:    { f: 1 / 0.3048, label: 'meters', short: 'm' },
    yd:   { f: 3,          label: 'yards', short: 'yd' }
  };

  function unitKey(s) {
    if (!s) return null;
    s = String(s).toLowerCase().replace(/\.$/, '');
    if (/^(feet|foot|ft|')$/.test(s)) return 'ft';
    if (/^(chains?|chs?|c)$/.test(s)) return 'ch';
    if (/^(links?|lks?|l)$/.test(s)) return 'lk';
    if (/^(rods?|rds?|poles?|po|perch|perches|p)$/.test(s)) return 'rod';
    if (/^(varas?|vrs?|vs)$/.test(s)) return 'vara';
    if (/^(meters?|metres?|m)$/.test(s)) return 'm';
    if (/^(yards?|yds?)$/.test(s)) return 'yd';
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Text normalisation                                                  */
  /* ------------------------------------------------------------------ */
  var NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
    fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var NW = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)';
  var RE_NUMWORDS = new RegExp('\\b' + NW + '(?:(?:\\s+and\\s+(?!(?:one|a)\\s+(?:half|quarter|third)\\b|three\\s+quarters?\\b)|[\\s-]+(?!(?:one|a)\\s+(?:half|quarter|third)\\b))' + NW + '\\b)*(?:\\s+and\\s+(?:one|a)\\s+(?:half|quarter|third)|\\s+and\\s+three\\s+quarters)?\\b', 'g');
  function wordsToNum(s) {
    var frac = 0;
    if (/half$/.test(s)) frac = 0.5; else if (/three\s+quarters$/.test(s)) frac = 0.75;
    else if (/quarter$/.test(s)) frac = 0.25; else if (/third$/.test(s)) frac = 1 / 3;
    s = s.replace(/\s+and\s+(?:(?:one|a)\s+(?:half|quarter|third)|three\s+quarters)$/, '');
    var total = 0, cur = 0;
    s.split(/[\s-]+/).forEach(function (w) {
      if (w === 'hundred') cur = (cur || 1) * 100;
      else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
      else if (NUMW[w] !== undefined) cur += NUMW[w];
    });
    return round(total + cur + frac, 4);
  }

  function normalize(text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    t = t.replace(/[‘’‚′´`]/g, "'")
         .replace(/[“”„″]/g, '"')
         .replace(/''/g, '"')
         .replace(/[º˚°⁰]/g, DEG)
         .replace(/[‒–—―]/g, '-')
         .replace(/[Δ∆δ]/g, ' delta ')
         .replace(/⁄/g, '/')
         .replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4')
         .replace(/[ \t\r]/g, ' ');
    t = t.replace(/\(\?\)|\?/g, ' ');
    t = t.replace(/\bsqu?th\b|\bsonth\b|\bsouih\b/g, 'south').replace(/\bnortb\b|\bnonh\b/g, 'north');
    t = t.replace(RE_NUMWORDS, function (m) { return ' ' + wordsToNum(m) + ' '; });
    t = t.replace(/\b(?:degrees?|degs?)\b\.?/g, DEG)
         .replace(/\b(?:minutes?|mins?)\b\.?/g, "'")
         .replace(/\b(?:seconds?|secs?)\b\.?/g, '"');
    t = t.replace(/(\d)\s*d(?=\s*\d)/g, '$1' + DEG)
         .replace(/(\d)\s*m(?=\s*\d)/g, "$1'")
         .replace(/(\d)\s*s(?=\s*[ew]\b)/g, '$1"');
    t = t.replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's')
         .replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w');
    t = t.replace(/\b([nsew])\./g, '$1 ');
    t = t.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
    t = t.replace(/(\d),(\d{2})(?!\d)/g, '$1.$2');
    t = t.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d\/])/g, function (m, a, b, c) { return +c ? ' ' + round(+a + (+b) / (+c), 6) : m; });
    t = t.replace(/(^|[^\d.\/])(\d+)\s*\/\s*(\d+)(?![\d\/])/g, function (m, p, b, c) { return +c ? p + round(+b / +c, 6) : m; });
    t = t.replace(/(\d)\s*%\s*(?=(?:vrs|varas?|poles?|perch|perches|feet|ft|chains?|rods?)\b)/g, '$1.5 ');
    return t;
  }

  var NUM = '(\\d{1,3}(?:\\.\\d+)?)';
  var SUB = '(\\d{1,2}(?:\\.\\d+)?)';
  var U_ALT = "feet|foot|ft\\.?|'|chains?|chs?\\.?|links?|lks?\\.?|rods?|rds?\\.?|poles?|po\\.|perches|perch|varas?|vrs?\\.?|vs\\.|meters?|metres?|yards?|yds?\\.?|m(?![a-z])|c\\.|l\\.|p\\.";
  var RE_Q = new RegExp('\\b([ns])\\s*' + NUM + '\\s*(?:' + DEG + '|-|:)?\\s*(?:' + SUB +
    "\\s*(?:'|-|:)?\\s*(?:" + SUB + '\\s*"?)?)?\\s*([ew])\\b', 'g');
  var RE_A = new RegExp('\\baz(?:imuth)?\\s*(?:of\\s*)?' + NUM + '\\s*' + DEG + "?\\s*(?:" + SUB +
    "\\s*'\\s*(?:" + SUB + '\\s*")?)?', 'g');
  var RE_BARE = new RegExp('(^|[\\n;:]|\\bbeing)\\s*' + NUM + '\\s*' + DEG + '\\s*(?:' + SUB + "\\s*'\\s*)?(?:" + SUB + '\\s*"\\s*)?-+\\s*(?=\\d)', 'gm');
  var RE_D = new RegExp('(?:\\bthen(?:ce)?\\s*,?\\s*(?:running\\s+|due\\s+)?|\\bdue\\s+)([nsew])\\b(?=[^\\d;]{0,50}?\\d[\\d.]*\\s*(?:' + U_ALT + '))', 'g');
  var RE_DIST = new RegExp('(\\d+(?:\\.\\d+)?)(?:\\s+(\\d+)\\s*/\\s*(\\d+))?\\s*(' + U_ALT + ')?', 'g');
  var RE_DIST_BEFORE = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(' + U_ALT + ')\\s*[.,]?\\s*$');
  var RE_LINKS = /^\s*,?\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(?:links?|lks?\.?|l\.)/;
  var RE_POB = /(?:true\s+)?(?:point|place)\s+of\s+beginning|\bt\.?p\.?o\.?b\b|\bp\.?o\.?b\b/g;

  function dms(d, m, s) {
    return (parseFloat(d) || 0) + (parseFloat(m) || 0) / 60 + (parseFloat(s) || 0) / 3600;
  }
  function quadToAz(ns, ang, ew) {
    if (ns === 'n' && ew === 'e') return ang;
    if (ns === 's' && ew === 'e') return 180 - ang;
    if (ns === 's' && ew === 'w') return 180 + ang;
    return (360 - ang) % 360;
  }
  var CARD = { n: 0, e: 90, s: 180, w: 270 };

  function bearingMatches(t, southAz) {
    var out = [], m;
    RE_Q.lastIndex = 0;
    while ((m = RE_Q.exec(t))) {
      var ang = dms(m[2], m[3], m[4]);
      if (ang <= 90) out.push({ start: m.index, end: m.index + m[0].length, az: quadToAz(m[1], ang, m[5]) });
    }
    RE_A.lastIndex = 0;
    while ((m = RE_A.exec(t))) {
      var a = dms(m[1], m[2], m[3]);
      if (a < 360) out.push({ start: m.index, end: m.index + m[0].length, az: southAz ? (a + 180) % 360 : a });
    }
    RE_BARE.lastIndex = 0;
    while ((m = RE_BARE.exec(t))) {
      var ab = dms(m[2], m[3], m[4]);
      if (ab < 360) out.push({ start: m.index + m[1].length + m[0].slice(m[1].length).search(/\d/), end: m.index + m[0].length, az: southAz ? (ab + 180) % 360 : ab, bare: true });
      if (m[0].length === 0) RE_BARE.lastIndex++;
    }
    RE_D.lastIndex = 0;
    while ((m = RE_D.exec(t))) {
      var dStart = m.index, dEnd = m.index + m[0].length;
      var clash = out.some(function (o) { return o.start < dEnd + 2 && o.end > dStart; });
      if (!clash) out.push({ start: dStart, end: dEnd, az: CARD[m[1]] });
    }
    out.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var res = [], lastEnd = -1;
    out.forEach(function (b) { if (b.start >= lastEnd) { res.push(b); lastEnd = b.end; } });
    return res;
  }

  function findDistance(seg, defUnit) {
    var m, first = null, withUnit = null;
    RE_DIST.lastIndex = 0;
    while ((m = RE_DIST.exec(seg))) {
      if (m[0] === '') { RE_DIST.lastIndex++; continue; }
      var val = parseFloat(m[1]);
      if (m[2] && m[3] && parseFloat(m[3]) !== 0) val += parseFloat(m[2]) / parseFloat(m[3]);
      var u = unitKey(m[4]);
      var rec = { val: val, unit: u, end: m.index + m[0].length };
      if (!first) first = rec;
      if (u) { withUnit = rec; break; }
    }
    var pick = withUnit || first;
    if (!pick) return null;
    var unit = pick.unit || defUnit || 'ft';
    var v = pick.val, end = pick.end;
    if (unit === 'ch') {
      var lm = RE_LINKS.exec(seg.slice(pick.end));
      if (lm) { v += parseFloat(lm[1]) / 100; end += lm[0].length; }
    }
    return { dist: v, unit: unit, inferred: !pick.unit, end: end };
  }

  /* angle like 24 18 00, 24-18-00, 24d18'00", 24.3 */
  function parseAngle(s) {
    var t = normalize(s).trim();
    var m = new RegExp('^' + NUM + '\\s*(?:' + DEG + '|-|:)?\\s*(?:' + SUB + "\\s*(?:'|-|:)?\\s*(?:" + SUB + '\\s*"?)?)?$').exec(t);
    if (!m) return NaN;
    var a = dms(m[1], m[2], m[3]);
    return a < 360 ? a : NaN;
  }
  function formatAngle(a) {
    var tot = Math.round(a * 3600);
    return Math.floor(tot / 3600) + DEG + pad2(Math.floor((tot % 3600) / 60)) + "'" + pad2(tot % 60) + '"';
  }

  /* ------------------------------------------------------------------ */
  /* Clause-aware deed parser                                            */
  /* ------------------------------------------------------------------ */
  var COMPASS = { n: 0, north: 0, ne: 45, northeast: 45, e: 90, east: 90, se: 135, southeast: 135,
    s: 180, south: 180, sw: 225, southwest: 225, w: 270, west: 270, nw: 315, northwest: 315 };
  var RE_TAIL = /\b(?:the\s+)?beginning\s+of\s+(?:a|an|the|said)\s+(?:[a-z-]+\s+){0,3}curve\b|\bpoint\s+of\s+(?:compound\s+|reverse\s+)?curv(?:e|ature)\b|\bto\s+a\s+point\s+on\s+a\s+(?:non-?\s*tangent\s+)?curve\b/;
  var RE_CURVECL = /\b(?:along|on|around|following|with|by)\b[^;]{0,80}?\bcurve\b|\bcurving\b|\bcurve\s+to\s+the\s+(?:left|right)\b|\barc\s+of\s+(?:a|said|the)\b/;
  var RE_DELTA = new RegExp('\\b(?:central\\s+angle|delta(?:\\s+angle)?|interior\\s+angle|angle)\\s*(?:of|=|:|is)?\\s*' + NUM + '\\s*(?:' + DEG + '|-)?\\s*(?:' + SUB + "\\s*(?:'|-)?\\s*(?:" + SUB + '\\s*"?)?)?');
  var RE_ARC = [
    /\barc\s*(?:length|distance)?\s*(?:of|=|:|is)?\s*(\d+(?:\.\d+)?)/,
    /\balong\s+(?:the\s+arc\s+of\s+)?(?:said|the|a)\s+curve\b(?:(?!radius|chord|angle)[^\d;]){0,40}?(\d+(?:\.\d+)?)\s*(?:feet|ft|')/,
    /(\d+(?:\.\d+)?)\s*(?:feet|ft)\.?,?\s*(?:through|with)\s+(?:a|an)\s+(?:central\s+)?angle/,
    /\)\s*,?\s*a\s+distance\s+of\s+(\d+(?:\.\d+)?)/
  ];
  var RE_CONCAVE = /\bconcave\s+(?:to(?:ward)?s?\s+)?(?:the\s+)?(northeast|northwest|southeast|southwest|north|south|east|west|ne|nw|se|sw|n|s|e|w)(?:erly|ern|ward)?\b/;

  function curveInfo(t, s, e, bs) {
    var part = t.slice(s, e), m;
    var o = { r: null, delta: null, arc: null, dir: null, concave: null, chordAz: null, chordDist: null, tangentAz: null, tangentPrev: false, unit: null };
    if ((m = /\b(?:to|toward)\s+the\s+(left|right)\b|\b(left|right)(?:-hand)?\s+curve\b/.exec(part))) o.dir = (m[1] || m[2]) === 'left' ? 'L' : 'R';
    if ((m = /\bradius\s*(?:of|=|:|is|being)?\s*(\d+(?:\.\d+)?)/.exec(part))) o.r = +m[1];
    if ((m = RE_DELTA.exec(part))) { var dv = dms(m[1], m[2], m[3]); if (dv > 0) o.delta = dv; }
    for (var k = 0; k < RE_ARC.length; k++) { if ((m = RE_ARC[k].exec(part))) { o.arc = +m[1]; break; } }
    if ((m = RE_CONCAVE.exec(part))) o.concave = COMPASS[m[1]];
    var nonTan = /\bnon-?\s*tangent/.test(part);
    o.tangentPrev = !nonTan && /\btangent\s+(?:which\s+)?(?:bears|bearing|to)\s+(?:the\s+)?(?:last|previous|preceding|said)|\btangent\s+curve\b|\bcurve\s+tangent\s+to\b/.test(part);
    bs.forEach(function (b, i) {
      var pre = t.slice(Math.max(s, b.start - 40), b.start);
      if (/\btangent\b[^;]{0,30}$/.test(pre) && !/\bchord\b/.test(pre)) { o.tangentAz = b.az; return; }
      if (o.chordAz !== null) return;
      o.chordAz = b.az;
      var d = findDistance(t.slice(b.end, i + 1 < bs.length ? bs[i + 1].start : e), null);
      if (d) { o.chordDist = d.dist; o.unit = d.inferred ? null : d.unit; }
    });
    if ((m = /\bchord\s+(?:distance|length)\s*(?:of|=|:|is)?\s*(\d+(?:\.\d+)?)/.exec(part))) o.chordDist = +m[1];
    return o;
  }

  function buildCurve(info, prevOut) {
    var R = info.r, D = info.delta, rad = Math.PI / 180;
    if (!(D > 0) && R && info.arc) D = info.arc / R / rad;
    if (!(D > 0) && R && info.chordDist && info.chordDist < 2 * R) D = 2 * Math.asin(info.chordDist / (2 * R)) / rad;
    var tIn = info.tangentAz !== null ? info.tangentAz : (info.tangentPrev && prevOut !== null ? prevOut : null);
    var ref = info.chordAz !== null ? info.chordAz : tIn;
    var dir = info.dir || (info.concave !== null && ref !== null ? (((info.concave - ref + 360) % 360) < 180 ? 'R' : 'L') : null);
    var chordAz = info.chordAz, chord = info.chordDist;
    if (R && D > 0) {
      var cc = 2 * R * Math.sin(D * rad / 2), arcLen = R * D * rad;
      if (chord && info.arc === null && Math.abs(chord - cc) / cc > 0.005 && Math.abs(chord - arcLen) / arcLen < 0.002) chord = cc;
      if (!chord) chord = cc;
    }
    if (chordAz === null && tIn !== null && D > 0 && dir) chordAz = (tIn + (dir === 'R' ? D / 2 : -D / 2) + 360) % 360;
    var tOut = chordAz !== null && D > 0 && dir ? (chordAz + (dir === 'R' ? D / 2 : -D / 2) + 360) % 360 : chordAz;
    return { az: chordAz, dist: chord, r: R, delta: D, dir: dir, tOut: tOut };
  }

  /* Parse a whole legal description into calls */
  function parseDeed(text, defUnit) {
    defUnit = defUnit || 'ft';
    var t = normalize(text);
    /* drop record values in parentheses, e.g. "(S 54 54 34 E, 708.72 per R2)" */
    t = t.replace(/\(([^()]*)\)/g, function (m, inner) {
      return bearingMatches(' ' + inner + ' ', false).length && !/curve|radius|chord|\barc\b|delta|angle/.test(inner) ? ' ' : m;
    });
    var southAz = /azimuths?\b[^.;]{0,80}?\bfrom\s+(?:the\s+)?(?:true\s+)?s\b/.test(t);
    var brs = bearingMatches(t, southAz);
    var nThen = (t.match(/\bthen(?:ce)?\b/g) || []).length;
    var re = nThen >= 2 ? /\bthen(?:ce)?\b/g : /[;\n:]/g, bounds = [0], m;
    while ((m = re.exec(t))) bounds.push(nThen >= 2 ? m.index : m.index + 1);
    bounds.push(t.length);

    var calls = [], warnings = [], skipped = 0, noBearing = 0, sameCourse = 0, badCurve = 0;
    var pending = null, prevOut = null;
    for (var ci = 0; ci + 1 < bounds.length; ci++) {
      var cs = bounds[ci], ce = bounds[ci + 1];
      if (ce <= cs) continue;
      var ct = t.slice(cs, ce), ti = ct.search(RE_TAIL);
      var head = ti >= 0 ? ct.slice(0, ti) : ct;
      var hEnd = cs + head.length;
      var bHead = brs.filter(function (b) { return b.start >= cs && b.start < hEnd; });
      var bTail = brs.filter(function (b) { return b.start >= hEnd && b.start < ce; });

      if (RE_CURVECL.test(head)) {
        var info = curveInfo(t, cs, hEnd, bHead);
        if (pending) Object.keys(info).forEach(function (k) {
          if ((info[k] === null || info[k] === false) && pending[k] !== null && pending[k] !== undefined) info[k] = pending[k];
        });
        var cv = buildCurve(info, prevOut);
        if (cv.az === null || !cv.dist) badCurve++;
        calls.push({ az: cv.az, brg: cv.az !== null ? formatBearing(cv.az) : '', dist: cv.dist ? round(cv.dist, 4) : null,
          unit: info.unit || defUnit, tie: false, curve: true, cr: cv.r || '', cd: cv.delta > 0 ? formatAngle(cv.delta) : '',
          cdir: cv.dir || 'R', cdirMissing: !cv.dir, inferredUnit: false, pos: cs });
        prevOut = cv.tOut;
      } else {
        bHead.forEach(function (b, k) {
          var segEnd = k + 1 < bHead.length ? bHead[k + 1].start : hEnd;
          var seg = t.slice(b.end, segEnd);
          var d = findDistance(seg, defUnit), after = seg;
          if (d) after = seg.slice(d.end);
          else {
            var mb = RE_DIST_BEFORE.exec(t.slice(Math.max(cs, b.start - 40), b.start));
            if (mb) d = { dist: +mb[1], unit: unitKey(mb[2]) || defUnit, inferred: false };
          }
          var allTies = calls.every(function (c) { return c.tie; });
          var fromRef = allTies && /^[^;]{0,30}?\bfrom\s+(?!which\b)(?:the|a|an|said)\b/.test(after);
          var preT = t.slice(Math.max(cs, b.start - 30), b.start).replace(/[\s,]+$/, '');
          if (/(?:bears?|bearing|being)$/.test(preT) && !fromRef) { skipped++; return; }
          calls.push({ az: b.az, brg: formatBearing(b.az), dist: d ? round(d.dist, 4) : null, unit: d ? d.unit : defUnit,
            tie: fromRef, curve: false, cr: '', cd: '', cdir: 'R', inferredUnit: d ? d.inferred : false, pos: b.start });
          prevOut = b.az;
        });
        if (!bHead.length) {
          var d2 = findDistance(head, defUnit);
          if (/\bsame\s+course\b/.test(head) && prevOut !== null && d2) {
            sameCourse++;
            calls.push({ az: prevOut, brg: formatBearing(prevOut), dist: round(d2.dist, 4), unit: d2.unit, tie: false, curve: false,
              cr: '', cd: '', cdir: 'R', inferredUnit: d2.inferred, pos: cs });
          } else if (ci > 0 && nThen >= 2 && d2 && !d2.inferred) noBearing++;
        }
      }
      pending = ti >= 0 ? curveInfo(t, hEnd, ce, bTail) : null;
    }

    /* Commencing / true point of beginning: everything before the POB is a tie line */
    if (/\bcommenc/.test(t) || /\btrue\s+point\s+of\s+beginning/.test(t)) {
      var pm, pobIdx = -1;
      RE_POB.lastIndex = 0;
      while ((pm = RE_POB.exec(t))) {
        var pmi = pm.index;
        var nb = calls.filter(function (c) { return c.pos < pmi; }).length;
        if (nb > 0 && nb < calls.length) { pobIdx = pmi; break; }
      }
      if (pobIdx > 0) calls.forEach(function (c) { if (c.pos < pobIdx) c.tie = true; });
    }
    if (calls.length && calls.every(function (c) { return c.tie; })) calls.forEach(function (c) { c.tie = false; });

    var nTie = calls.filter(function (c) { return c.tie; }).length;
    if (nTie) warnings.push(nTie + ' call' + (nTie > 1 ? 's were' : ' was') + ' read as a tie line (from a reference corner to the point of beginning). Tie lines are drawn dashed and are not part of the area. Untick "Tie" if that is wrong.');
    if (skipped) warnings.push(skipped + ' reference bearing' + (skipped > 1 ? 's were' : ' was') + ' ignored (bearing trees, basis-of-bearing or "from which ... bears" references).');
    if (southAz) warnings.push('This description measures azimuths from south; they were converted to bearings from north.');
    if (sameCourse) warnings.push(sameCourse + ' call' + (sameCourse > 1 ? 's' : '') + ' "continue the same course" and reuse the previous bearing.');
    var curves = calls.filter(function (c) { return c.curve; });
    if (curves.length) {
      var incomplete = curves.filter(function (c) { return !(parseFloat(c.cr) > 0) || !isFinite(parseAngle(c.cd)); }).length;
      var noDir = curves.filter(function (c) { return c.cdirMissing; }).length;
      warnings.push(curves.length + ' curve' + (curves.length > 1 ? 's' : '') + ' found (marked C). The table shows the chord bearing and chord distance' +
        (incomplete ? '; ' + incomplete + ' still need a radius and delta to draw the arc' : '') + (noDir ? '; check left/right on ' + noDir : '') + '.');
    }
    if (badCurve) warnings.push(badCurve + ' curve' + (badCurve > 1 ? 's have' : ' has') + ' no chord or tangent bearing we could read. Enter the chord bearing and distance by hand.');
    var nMissing = calls.filter(function (c) { return c.dist === null && !c.curve; }).length;
    if (nMissing) warnings.push(nMissing + ' call' + (nMissing > 1 ? 's have' : ' has') + ' a bearing but no distance we could read. Fill it in below.');
    var nInf = calls.filter(function (c) { return c.inferredUnit && c.dist !== null; }).length;
    if (nInf) warnings.push(nInf + ' distance' + (nInf > 1 ? 's had' : ' had') + ' no unit, so the default unit (' + UNITS[defUnit].label + ') was used.');
    if (noBearing) warnings.push(noBearing + ' "thence" clause' + (noBearing > 1 ? 's have' : ' has') + ' a distance but no bearing we could read (for example "with said line 100 feet", or a scanning error). Compare the table with the deed.');
    if (!calls.length) warnings.push('No bearings found. Bearings look like N 45' + DEG + "30'15\" E, S 12 W or Az 123" + DEG + '. You can also add calls by hand below.');
    return { calls: calls, warnings: warnings };
  }

  function parseBearing(s) {
    var t = normalize(s).trim();
    if (!t) return NaN;
    if (/^(?:due\s+)?[nsew]$/.test(t)) return CARD[t.slice(-1)];
    var b = bearingMatches(' ' + t + ' ');
    if (b.length) return b[0].az;
    return parseAngle(s);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function formatBearing(az) {
    az = ((az % 360) + 360) % 360;
    var ns, ew, ang;
    if (az <= 90) { ns = 'N'; ew = 'E'; ang = az; }
    else if (az <= 180) { ns = 'S'; ew = 'E'; ang = 180 - az; }
    else if (az <= 270) { ns = 'S'; ew = 'W'; ang = az - 180; }
    else { ns = 'N'; ew = 'W'; ang = 360 - az; }
    var tot = Math.round(ang * 3600);
    return ns + ' ' + Math.floor(tot / 3600) + DEG + pad2(Math.floor((tot % 3600) / 60)) + "'" + pad2(tot % 60) + '" ' + ew;
  }
  function round(n, dp) { var p = Math.pow(10, dp); return Math.round(n * p) / p; }
  function angDiff(a, b) { var d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); }

  /* ------------------------------------------------------------------ */
  /* Traverse maths (plane, feet)                                        */
  /* ------------------------------------------------------------------ */
  function curveGeom(c, x0, y0, chordAz, chordFt, f) {
    var R = parseFloat(c.cr) * f, D = parseAngle(c.cd);
    if (!(R > 0) || !(D > 0) || !(D < 360)) return null;
    var Dr = D * Math.PI / 180, right = c.cdir !== 'L';
    var tIn = chordAz + (right ? -D / 2 : D / 2);
    var n = Math.max(8, Math.ceil(D / 3)), pts = [];
    for (var k = 1; k < n; k++) {
      var th = Dr * k / n, len = 2 * R * Math.sin(th / 2);
      var az = (tIn + (right ? 1 : -1) * (th * 180 / Math.PI) / 2) * Math.PI / 180;
      pts.push({ x: x0 + len * Math.sin(az), y: y0 + len * Math.cos(az) });
    }
    var cAz = (tIn + (right ? 90 : -90)) * Math.PI / 180;
    return {
      R: R, D: D, right: right, arcFt: R * Dr, pts: pts,
      segArea: (R * R / 2) * (Dr - Math.sin(Dr)) * (right ? -1 : 1),
      cx: x0 + R * Math.sin(cAz), cy: y0 + R * Math.cos(cAz),
      chordCheck: 2 * R * Math.sin(Dr / 2) - chordFt
    };
  }

  function traverse(calls, rotDeg) {
    var rot = parseFloat(rotDeg) || 0;
    var x = 0, y = 0, tiePts = [{ x: 0, y: 0 }], parcelPts = [], ring = [], legs = [];
    var inTies = true, perim = 0, segSum = 0;
    calls.forEach(function (c, i) {
      var az = parseBearing(c.brg);
      var f = UNITS[c.unit] ? UNITS[c.unit].f : 1;
      var dft = parseFloat(c.dist) * f;
      var ok = isFinite(az) && isFinite(dft) && dft > 0;
      var isTie = inTies && c.tie;
      if (!isTie && inTies) { inTies = false; parcelPts.push({ x: x, y: y }); ring.push({ x: x, y: y }); }
      if (!ok) { legs.push({ i: i, ok: false, tie: isTie }); return; }
      var a = (az + rot) * Math.PI / 180;
      var x0 = x, y0 = y;
      x += dft * Math.sin(a); y += dft * Math.cos(a);
      var lg = { i: i, ok: true, tie: isTie, x0: x0, y0: y0, x1: x, y1: y, lenFt: dft, az: az + rot, arc: null };
      if (c.curve && !isTie) lg.arc = curveGeom(c, x0, y0, az + rot, dft, f);
      legs.push(lg);
      if (isTie) tiePts.push({ x: x, y: y });
      else {
        if (lg.arc) { ring.push.apply(ring, lg.arc.pts); segSum += lg.arc.segArea; perim += lg.arc.arcFt; }
        else perim += dft;
        parcelPts.push({ x: x, y: y }); ring.push({ x: x, y: y });
      }
    });
    if (inTies) { parcelPts.push({ x: x, y: y }); ring.push({ x: x, y: y }); }
    var res = { tiePts: tiePts, parcelPts: parcelPts, ring: ring, legs: legs, perimFt: perim, closeFt: 0, closeAz: 0, areaSqFt: 0, precision: Infinity, rot: rot };
    if (parcelPts.length >= 2) {
      var p0 = parcelPts[0], pn = parcelPts[parcelPts.length - 1];
      var dx = p0.x - pn.x, dy = p0.y - pn.y;
      res.closeFt = Math.sqrt(dx * dx + dy * dy);
      res.closeAz = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      if (res.closeFt < 0.005) res.closeFt = 0;
      res.precision = res.closeFt > 0 ? perim / res.closeFt : Infinity;
      var A = 0;
      for (var k = 0; k < parcelPts.length; k++) {
        var p = parcelPts[k], q = parcelPts[(k + 1) % parcelPts.length];
        A += p.x * q.y - q.x * p.y;
      }
      /* shoelace with x=east, y=north is counter-clockwise-positive; segSum uses the same sign convention */
      res.areaSqFt = Math.abs(A / 2 + segSum);
    }
    return res;
  }

  /* Which single call, if wrong, best explains the misclosure? */
  function suggestFixes(calls, res) {
    if (!(res.closeFt > 0.01) || res.parcelPts.length < 3) return [];
    var vx = res.parcelPts[0].x - res.parcelPts[res.parcelPts.length - 1].x;
    var vy = res.parcelPts[0].y - res.parcelPts[res.parcelPts.length - 1].y;
    var out = [];
    res.legs.forEach(function (lg) {
      if (!lg.ok || lg.tie) return;
      var c = calls[lg.i], lx = lg.x1 - lg.x0, ly = lg.y1 - lg.y0;
      var f = UNITS[c.unit] ? UNITS[c.unit].f : 1;
      /* quadrant flips: N<->S and E<->W */
      var az0 = parseBearing(c.brg);
      [[180 - az0, 'N/S swapped'], [360 - az0, 'E/W swapped'], [az0 + 180, 'direction reversed']].forEach(function (fl) {
        var na = (fl[0] + res.rot) * Math.PI / 180;
        var nx = lg.lenFt * Math.sin(na), ny = lg.lenFt * Math.cos(na);
        var ex = vx + lx - nx, ey = vy + ly - ny, err = Math.sqrt(ex * ex + ey * ey);
        if (err < res.closeFt * 0.1) out.push({ i: lg.i, score: err / res.closeFt * 0.01, text: 'Call ' + (lg.i + 1) + ': ' + fl[1] + ' (' + formatBearing(((fl[0] % 360) + 360) % 360) + ') would close to ' + err.toFixed(2) + ' ft' });
      });
      var nx2 = lx + vx, ny2 = ly + vy;
      var newLen = Math.sqrt(nx2 * nx2 + ny2 * ny2), newAz = (Math.atan2(nx2, ny2) * 180 / Math.PI + 360) % 360;
      var dAng = angDiff(newAz, lg.az), dPct = Math.abs(newLen - lg.lenFt) / lg.lenFt * 100;
      var score = Math.min(dAng, dPct) + 0.001 * (dAng + dPct);
      var what = dAng < 0.02 ? 'distance' : dPct < 0.05 ? 'bearing' : 'bearing and distance';
      out.push({ i: lg.i, score: score, text: 'Call ' + (lg.i + 1) + ' (' + what + '): ' + formatBearing(newAz - res.rot) + ', ' + round(newLen / f, 2) + ' ' + UNITS[c.unit].short + ' instead of ' + formatBearing(az0) + ', ' + c.dist + ' ' + UNITS[c.unit].short });
    });
    out.sort(function (a, b) { return a.score - b.score; });
    var seen = {};
    return out.filter(function (s) { if (seen[s.i]) return false; seen[s.i] = true; return true; }).slice(0, 3);
  }

  function toLatLng(origin, xFt, yFt) {
    var a = 6378137, e2 = 0.00669437999014;
    var phi = origin[0] * Math.PI / 180;
    var s = Math.sin(phi), w = 1 - e2 * s * s;
    var M = a * (1 - e2) / Math.pow(w, 1.5), N = a / Math.sqrt(w);
    return [origin[0] + (yFt * 0.3048 / M) * 180 / Math.PI, origin[1] + (xFt * 0.3048 / (N * Math.cos(phi))) * 180 / Math.PI];
  }

  /* ------------------------------------------------------------------ */
  /* DXF (R12 ASCII, feet, start point at N 5000 / E 5000)               */
  /* ------------------------------------------------------------------ */
  function buildDxf(calls, res) {
    var OX = 5000, OY = 5000, out = [];
    var size = Math.max(res.perimFt, 1), th = round(Math.max(size / 160, 0.5), 2);
    function g(code, val) { out.push(String(code)); out.push(String(val)); }
    function fx(v) { return (Math.round(v * 10000) / 10000).toFixed(4); }
    function text(layer, x, y, h, rotDeg, s) {
      g(0, 'TEXT'); g(8, layer); g(10, fx(x)); g(20, fx(y)); g(30, '0.0'); g(40, h); g(1, s); g(50, fx(rotDeg));
      g(72, 1); g(73, 2); g(11, fx(x)); g(21, fx(y)); g(31, '0.0');
    }
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 2); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    var dash = round(th * 3, 2), gap = round(th * 1.5, 2);
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
    g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, 'Dashed __ __ __'); g(72, 65); g(73, 2); g(40, fx(dash + gap)); g(49, fx(dash)); g(49, fx(-gap));
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, 5);
    [['BOUNDARY', 1], ['TIE', 2], ['CORNERS', 3], ['LABELS', 7], ['NOTES', 8]].forEach(function (l) {
      g(0, 'LAYER'); g(2, l[0]); g(70, 0); g(62, l[1]); g(6, l[0] === 'TIE' ? 'DASHED' : 'CONTINUOUS');
    });
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    res.legs.forEach(function (lg) {
      if (!lg.ok) return;
      var c = calls[lg.i], layer = lg.tie ? 'TIE' : 'BOUNDARY';
      var x0 = lg.x0 + OX, y0 = lg.y0 + OY, x1 = lg.x1 + OX, y1 = lg.y1 + OY;
      var label = formatBearing(parseBearing(c.brg)).replace(/°/g, '%%d') + '  ' + c.dist + ' ' + UNITS[c.unit].short;
      if (lg.arc) {
        var A = lg.arc, cx = A.cx + OX, cy = A.cy + OY;
        var a0 = Math.atan2(y0 - cy, x0 - cx) * 180 / Math.PI, a1 = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI;
        g(0, 'ARC'); g(8, layer); g(10, fx(cx)); g(20, fx(cy)); g(30, '0.0'); g(40, fx(A.R));
        if (A.right) { g(50, fx((a1 + 360) % 360)); g(51, fx((a0 + 360) % 360)); }
        else { g(50, fx((a0 + 360) % 360)); g(51, fx((a1 + 360) % 360)); }
        label = 'C' + (lg.i + 1) + ' R=' + c.cr + ' %%c=' + formatAngle(A.D).replace(/°/g, '%%d') + ' L=' + round(A.arcFt / UNITS[c.unit].f, 2) + ' CH ' + label;
      } else {
        g(0, 'LINE'); g(8, layer); g(10, fx(x0)); g(20, fx(y0)); g(30, '0.0'); g(11, fx(x1)); g(21, fx(y1)); g(31, '0.0');
      }
      var ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
      var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nr = (ang + 90) * Math.PI / 180;
      text('LABELS', mx + Math.cos(nr) * th * 0.9, my + Math.sin(nr) * th * 0.9, th, ang, label);
      g(0, 'POINT'); g(8, 'CORNERS'); g(10, fx(x1)); g(20, fx(y1)); g(30, '0.0');
    });
    var p0 = res.parcelPts[0];
    g(0, 'POINT'); g(8, 'CORNERS'); g(10, fx(OX)); g(20, fx(OY)); g(30, '0.0');
    text('NOTES', p0.x + OX, p0.y + OY - th * 2, th, 0, 'POB');
    text('NOTES', OX, OY - th * 5, th * 0.8, 0, 'Deed plot (not a survey). Units: feet. Start point = N 5000 E 5000. Area ' + round(res.areaSqFt / 43560, 3) + ' ac. Misclosure ' + round(res.closeFt, 2) + ' ft. MapScaping Deed Plotter');
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  var CORE = { normalize: normalize, parseDeed: parseDeed, parseBearing: parseBearing, parseAngle: parseAngle,
    formatBearing: formatBearing, formatAngle: formatAngle, traverse: traverse, suggestFixes: suggestFixes,
    toLatLng: toLatLng, buildDxf: buildDxf, UNITS: UNITS, unitKey: unitKey };
  root.MapScapingDeedPlotterCore = CORE;
  if (typeof document === 'undefined' || typeof L === 'undefined') return;

  /* ------------------------------------------------------------------ */
  /* Examples                                                            */
  /* ------------------------------------------------------------------ */
  var EXAMPLES = {
    modern: {
      origin: [41.95021, -93.62874], unit: 'ft',
      text: 'A parcel of land in the Northwest Quarter of Section 14, described as follows: Commencing at the Northwest corner of said Section 14; thence S 00°14\'22" E along the West line of said Section 14 a distance of 1,320.00 feet; thence N 89°45\'38" E 33.00 feet to the TRUE POINT OF BEGINNING; thence continuing N 89°45\'38" E 208.71 feet; thence S 00°14\'22" E 208.71 feet; thence S 89°45\'38" W 208.71 feet; thence N 00°14\'22" W 208.71 feet to the true point of beginning, containing 1.00 acre, more or less.'
    },
    curve: {
      origin: [30.26715, -97.74306], unit: 'ft',
      text: 'BEGINNING at an iron rod found at the northwest corner of Lot 7; THENCE N 89°52\'10" E, 120.00 feet to an iron rod set at the beginning of a curve to the right; THENCE along said curve to the right, having a radius of 50.00 feet, a central angle of 90°00\'00", an arc length of 78.54 feet, and a chord which bears S 45°07\'50" E, 70.71 feet to an iron rod; THENCE S 00°07\'50" E, 100.00 feet to an iron rod; THENCE S 89°52\'10" W, 170.00 feet to an iron rod; THENCE N 00°07\'50" W, 150.00 feet to the POINT OF BEGINNING.'
    },
    colonial: {
      origin: [37.55210, -78.85340], unit: 'rod',
      text: 'Beginning at a white oak on the east side of Rocky Branch, thence N 45 E 120 poles to a red oak; thence S 50 E 80 poles to a stake in the old field; thence S 40 W 100 poles to a pine; thence N 62 W 92 poles to the beginning, containing fifty eight acres more or less.'
    }
  };

  /* ------------------------------------------------------------------ */
  /* UI                                                                  */
  /* ------------------------------------------------------------------ */
  var container = document.getElementById('deed-plotter-container');
  if (!container) return;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, dp) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function unitOptions(sel) {
    return Object.keys(UNITS).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(UNITS[k].label) + '</option>'; }).join('');
  }

  container.innerHTML =
    '<div class="dp-layout">' +
      '<div class="dp-panel">' +
        '<div class="dp-step"><div class="dp-h">1. Paste the legal description</div>' +
          '<textarea class="dp-deed" rows="7" placeholder="e.g. Beginning at an iron pin... thence N 45&deg;30\'15&quot; E 125.50 feet; thence S 12&deg;00\' E 210.00 feet; ..."></textarea>' +
          '<div class="dp-row"><label>Default unit <select class="dp-defunit">' + unitOptions('ft') + '</select></label>' +
          '<button type="button" class="dp-btn dp-primary dp-read">Read deed</button></div>' +
          '<div class="dp-small">Examples: <a href="#" class="dp-ex" data-ex="modern">farm parcel with tie line</a> &middot; <a href="#" class="dp-ex" data-ex="curve">lot with a curve</a> &middot; <a href="#" class="dp-ex" data-ex="colonial">old deed in poles</a></div>' +
          '<div class="dp-warn" hidden></div>' +
        '</div>' +
        '<div class="dp-step"><div class="dp-h">2. Set the starting point</div>' +
          '<div class="dp-small">The point of beginning, or the reference corner if the deed starts with &quot;Commencing at...&quot;.</div>' +
          '<div class="dp-row"><input type="text" class="dp-search" placeholder="Address, place or lat, lng"><button type="button" class="dp-btn dp-find">Find</button></div>' +
          '<div class="dp-row"><button type="button" class="dp-btn dp-pick">Click map to place start</button><span class="dp-origin dp-small">Not set</span></div>' +
        '</div>' +
        '<div class="dp-step"><div class="dp-h">3. Check the calls</div>' +
          '<div class="dp-tablewrap"><table class="dp-table"><thead><tr><th>#</th><th title="Tie line to the point of beginning">Tie</th><th>Bearing</th><th>Distance</th><th>Unit</th><th></th></tr></thead><tbody></tbody></table></div>' +
          '<div class="dp-row"><button type="button" class="dp-btn dp-add">+ Add line</button><button type="button" class="dp-btn dp-addc">+ Add curve</button></div>' +
          '<div class="dp-small">For curves, enter the chord bearing and chord distance, then the radius, delta (central angle) and turn direction.</div>' +
        '</div>' +
        '<div class="dp-step"><div class="dp-h">4. Adjust (optional)</div>' +
          '<div class="dp-row"><label>Rotate all bearings <input type="number" class="dp-rot" step="0.01" value="0" style="width:90px"> ' + DEG + '</label></div>' +
          '<input type="range" class="dp-rotslider" min="-15" max="15" step="0.01" value="0">' +
          '<div class="dp-small">Old deeds often used magnetic bearings. Enter the magnetic declination for the year of the survey (east = positive, west = negative) to turn them to true north. Look it up with our <a href="https://mapscaping.com/interactive-magnetic-declination-calculator/" target="_blank" rel="noopener">magnetic declination calculator</a> or NOAA\'s <a href="https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml" target="_blank" rel="noopener">declination calculator</a>. Drag the S marker to move the whole parcel.</div>' +
        '</div>' +
        '<div class="dp-step"><div class="dp-h">Results</div><div class="dp-results dp-small">Read a deed to see area and closure.</div><div class="dp-fixes" hidden></div></div>' +
        '<div class="dp-step"><div class="dp-h">Export</div><div class="dp-row dp-wrap">' +
          '<button type="button" class="dp-btn dp-dxf">DXF (CAD)</button><button type="button" class="dp-btn dp-kml">KML</button><button type="button" class="dp-btn dp-geojson">GeoJSON</button>' +
          '<button type="button" class="dp-btn dp-csv">CSV</button><button type="button" class="dp-btn dp-print">Print plat / PDF</button>' +
          '<button type="button" class="dp-btn dp-share">Copy share link</button></div>' +
          '<div class="dp-small dp-disclaimer">A deed plot is not a survey. Use it to understand and check a description, not to locate a boundary on the ground. Consult a licensed land surveyor for that.</div>' +
        '</div>' +
      '</div>' +
      '<div class="dp-mapcol"><div id="deed-plotter-map"></div><div class="dp-maphint">Click the map to place the starting point</div></div>' +
    '</div>';

  function q(sel) { return container.querySelector(sel); }

  var state = { origin: null, rot: 0, defUnit: 'ft', calls: [], picking: true };

  /* ---- map ---- */
  var map = L.map('deed-plotter-map', { center: [39.5, -98.35], zoom: 4, maxZoom: 21 });
  var imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
  });
  var labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21, maxNativeZoom: 19, attribution: 'Labels &copy; Esri'
  });
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  });
  var satGroup = L.layerGroup([imagery, labels]).addTo(map);
  L.control.layers({ 'Satellite': satGroup, 'Street map': osm }, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: true, metric: true }).addTo(map);
  var drawLayer = L.layerGroup().addTo(map);
  var startMarker = null;

  function setOrigin(ll, fit) {
    state.origin = [ll[0], ll[1]];
    state.picking = false;
    container.classList.remove('dp-picking');
    q('.dp-origin').textContent = fmt(ll[0], 6) + ', ' + fmt(ll[1], 6);
    var icon = L.divIcon({ className: 'dp-start-icon', html: '<span>S</span>', iconSize: [26, 26], iconAnchor: [13, 13] });
    if (!startMarker) {
      startMarker = L.marker(state.origin, { draggable: true, icon: icon, zIndexOffset: 1000, title: 'Starting point (drag to move)' }).addTo(map);
      startMarker.on('drag', function (e) { var p = e.target.getLatLng(); state.origin = [p.lat, p.lng]; redraw(false); });
      startMarker.on('dragend', function (e) { var p = e.target.getLatLng(); setOrigin([p.lat, p.lng], false); });
    } else startMarker.setLatLng(state.origin);
    redraw(fit);
  }
  map.on('click', function (e) { if (state.picking) setOrigin([e.latlng.lat, e.latlng.lng], true); });

  /* ---- table ---- */
  function renderTable() {
    var tb = q('.dp-table tbody');
    tb.innerHTML = state.calls.map(function (c, i) {
      var bad = !isFinite(parseBearing(c.brg));
      var badD = !(parseFloat(c.dist) > 0);
      var row = '<tr data-i="' + i + '" class="' + (c.tie ? 'dp-tie' : '') + '">' +
        '<td>' + (i + 1) + (c.curve ? '<span class="dp-tag" title="Curve: bearing and distance are the chord">C</span>' : '') + '</td>' +
        '<td><input type="checkbox" class="dp-c-tie"' + (c.tie ? ' checked' : '') + '></td>' +
        '<td><input type="text" class="dp-c-brg' + (bad ? ' dp-bad' : '') + '" value="' + esc(c.brg) + '"' + (c.curve ? ' title="Chord bearing"' : '') + '></td>' +
        '<td><input type="text" inputmode="decimal" class="dp-c-dist' + (badD ? ' dp-bad' : '') + '" value="' + (c.dist === null ? '' : esc(c.dist)) + '"' + (c.curve ? ' title="Chord distance"' : '') + '></td>' +
        '<td><select class="dp-c-unit">' + unitOptions(c.unit) + '</select></td>' +
        '<td><button type="button" class="dp-del" title="Delete call">&times;</button></td></tr>';
      if (c.curve) {
        row += '<tr data-i="' + i + '" class="dp-curverow"><td></td><td colspan="5">' +
          '<label>Radius <input type="text" inputmode="decimal" class="dp-c-cr' + (parseFloat(c.cr) > 0 ? '' : ' dp-bad') + '" value="' + esc(c.cr) + '"></label> ' +
          '<label>Delta <input type="text" class="dp-c-cd' + (parseAngle(c.cd) > 0 ? '' : ' dp-bad') + '" value="' + esc(c.cd) + '" placeholder="24 18 00"></label> ' +
          '<select class="dp-c-cdir"><option value="R"' + (c.cdir !== 'L' ? ' selected' : '') + '>right</option><option value="L"' + (c.cdir === 'L' ? ' selected' : '') + '>left</option></select>' +
          '</td></tr>';
      }
      return row;
    }).join('');
  }
  var tbody = q('.dp-table tbody');
  tbody.addEventListener('input', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var c = state.calls[+tr.getAttribute('data-i')], cl = e.target.classList, v = e.target.value;
    if (cl.contains('dp-c-brg')) { c.brg = v; cl.toggle('dp-bad', !isFinite(parseBearing(v))); }
    if (cl.contains('dp-c-dist')) { c.dist = v; cl.toggle('dp-bad', !(parseFloat(v) > 0)); }
    if (cl.contains('dp-c-cr')) { c.cr = v; cl.toggle('dp-bad', !(parseFloat(v) > 0)); }
    if (cl.contains('dp-c-cd')) { c.cd = v; cl.toggle('dp-bad', !(parseAngle(v) > 0)); }
    redraw(false);
  });
  tbody.addEventListener('change', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var c = state.calls[+tr.getAttribute('data-i')], cl = e.target.classList;
    if (cl.contains('dp-c-unit')) c.unit = e.target.value;
    if (cl.contains('dp-c-cdir')) c.cdir = e.target.value;
    if (cl.contains('dp-c-tie')) { c.tie = e.target.checked; tr.classList.toggle('dp-tie', c.tie); }
    redraw(false);
  });
  tbody.addEventListener('click', function (e) {
    if (!e.target.classList.contains('dp-del')) return;
    state.calls.splice(+e.target.closest('tr').getAttribute('data-i'), 1);
    renderTable(); redraw(false);
  });
  function addCall(curve) {
    state.calls.push({ brg: '', dist: '', unit: state.defUnit, tie: false, curve: curve, cr: '', cd: '', cdir: 'R' });
    renderTable();
    var inputs = container.querySelectorAll('.dp-c-brg');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }
  q('.dp-add').addEventListener('click', function () { addCall(false); });
  q('.dp-addc').addEventListener('click', function () { addCall(true); });

  /* ---- read deed ---- */
  function readDeed() {
    state.defUnit = q('.dp-defunit').value;
    var r = parseDeed(q('.dp-deed').value, state.defUnit);
    state.calls = r.calls.map(function (c) { return { brg: c.brg, dist: c.dist, unit: c.unit, tie: c.tie, curve: c.curve, cr: c.cr, cd: c.cd, cdir: c.cdir }; });
    var w = q('.dp-warn');
    if (r.warnings.length) { w.innerHTML = r.warnings.map(function (s) { return '<div>' + esc(s) + '</div>'; }).join(''); w.hidden = false; }
    else w.hidden = true;
    renderTable();
    if (!state.origin) {
      q('.dp-maphint').textContent = 'Now click the map (or search) to place the starting point';
      container.classList.add('dp-picking');
    }
    redraw(true);
  }
  q('.dp-read').addEventListener('click', readDeed);
  Array.prototype.forEach.call(container.querySelectorAll('.dp-ex'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var ex = EXAMPLES[a.getAttribute('data-ex')];
      q('.dp-deed').value = ex.text;
      q('.dp-defunit').value = ex.unit;
      setRot(0);
      state.calls = [];
      setOrigin(ex.origin, false);
      readDeed();
    });
  });

  /* ---- start point ---- */
  q('.dp-pick').addEventListener('click', function () {
    state.picking = true;
    container.classList.add('dp-picking');
    q('.dp-maphint').textContent = 'Click the map to place the starting point';
  });
  function doFind() {
    var v = q('.dp-search').value.trim();
    if (!v) return;
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(v);
    if (m) { setOrigin([parseFloat(m[1]), parseFloat(m[2])], true); return; }
    var btn = q('.dp-find'); btn.disabled = true; btn.textContent = '...';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(v))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.length) {
          var p = [parseFloat(j[0].lat), parseFloat(j[0].lon)];
          setOrigin(p, !!state.calls.length);
          if (!state.calls.length) map.setView(p, 18);
        } else alert('Place not found. Try a different search or click the map.');
      })
      .catch(function () { alert('Search failed. Click the map to place the start point instead.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Find'; });
  }
  q('.dp-find').addEventListener('click', doFind);
  q('.dp-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doFind(); } });

  /* ---- rotation ---- */
  function setRot(v) {
    v = parseFloat(v); if (!isFinite(v)) v = 0;
    state.rot = v;
    q('.dp-rot').value = v;
    q('.dp-rotslider').value = Math.max(-15, Math.min(15, v));
  }
  q('.dp-rot').addEventListener('input', function () { state.rot = parseFloat(this.value) || 0; q('.dp-rotslider').value = state.rot; redraw(false); });
  q('.dp-rotslider').addEventListener('input', function () { state.rot = parseFloat(this.value) || 0; q('.dp-rot').value = state.rot; redraw(false); });

  /* ---- drawing ---- */
  var lastRes = null;
  function ll(p) { return toLatLng(state.origin, p.x, p.y); }

  function redraw(fit) {
    drawLayer.clearLayers();
    lastRes = traverse(state.calls, state.rot);
    renderResults(lastRes);
    scheduleHash();
    if (!state.origin) return;
    var res = lastRes, bounds = L.latLngBounds([state.origin, state.origin]);
    res.legs.forEach(function (lg) {
      if (!lg.ok) return;
      var c = state.calls[lg.i];
      var path = [{ x: lg.x0, y: lg.y0 }].concat(lg.arc ? lg.arc.pts : []).concat([{ x: lg.x1, y: lg.y1 }]).map(ll);
      path.forEach(function (p) { bounds.extend(p); });
      var style = lg.tie ? { color: '#ffd400', weight: 3, dashArray: '8 6' } : { color: '#ff3b30', weight: 3 };
      var tip = 'Call ' + (lg.i + 1) + (c.curve ? ' (curve, chord)' : '') + ': ' + esc(formatBearing(parseBearing(c.brg))) + ', ' + esc(c.dist) + ' ' + esc(UNITS[c.unit].short) + (lg.tie ? ' (tie)' : '');
      if (lg.arc) tip += '<br>R ' + esc(c.cr) + ', delta ' + esc(formatAngle(lg.arc.D)) + ', arc ' + fmt(lg.arc.arcFt / UNITS[c.unit].f, 2) + ' ' + esc(UNITS[c.unit].short);
      if (c.curve && !lg.arc && !lg.tie) drawLayer.addLayer(L.polyline([path[0], path[path.length - 1]], { color: '#ff3b30', weight: 3, dashArray: '2 6' }).bindTooltip(tip + '<br>Add radius and delta to draw the arc', { sticky: true }));
      else drawLayer.addLayer(L.polyline(path, style).bindTooltip(tip, { sticky: true }));
      var midIdx = Math.floor(path.length / 2);
      var mid = path.length % 2 ? path[midIdx] : [(path[midIdx - 1][0] + path[midIdx][0]) / 2, (path[midIdx - 1][1] + path[midIdx][1]) / 2];
      drawLayer.addLayer(L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'dp-leg-label' + (lg.tie ? ' dp-leg-tie' : ''), html: String(lg.i + 1), iconSize: [22, 18], iconAnchor: [11, 9] }) }));
    });
    if (res.parcelPts.length >= 3) {
      drawLayer.addLayer(L.polygon(res.ring.map(ll), { stroke: false, fillColor: '#ff3b30', fillOpacity: 0.18, interactive: false }));
      res.parcelPts.forEach(function (p, k) {
        if (k === res.parcelPts.length - 1 && res.closeFt < 0.5) return;
        drawLayer.addLayer(L.circleMarker(ll(p), { radius: 4, color: '#fff', weight: 2, fillColor: k === 0 ? '#34c759' : '#ff3b30', fillOpacity: 1 })
          .bindTooltip(k === 0 ? 'Point of beginning' : 'Corner ' + k));
      });
      if (res.closeFt >= 0.01) {
        var p0 = res.parcelPts[0], pn = res.parcelPts[res.parcelPts.length - 1];
        drawLayer.addLayer(L.polyline([ll(pn), ll(p0)], { color: '#00e5ff', weight: 2, dashArray: '3 5' }).bindTooltip('Misclosure: ' + fmt(res.closeFt, 2) + ' ft'));
      }
    }
    if (fit && bounds.isValid() && state.calls.length) map.fitBounds(bounds.pad(0.3), { maxZoom: 19 });
    else if (fit && !state.calls.length) map.setView(state.origin, 18);
  }

  function precisionClass(p) { return p >= 10000 ? 'dp-good' : p >= 1000 ? 'dp-ok' : 'dp-badp'; }
  function renderResults(res) {
    var box = q('.dp-results'), fx = q('.dp-fixes');
    var valid = res.legs.filter(function (l) { return l.ok && !l.tie; }).length;
    if (valid < 2) { box.innerHTML = 'Read a deed or add at least three calls to see area and closure.'; fx.hidden = true; return; }
    var acres = res.areaSqFt / 43560, ha = res.areaSqFt * 0.09290304 / 10000;
    var prec = isFinite(res.precision) ? '1 : ' + fmt(Math.round(res.precision), 0) : 'closes exactly';
    box.innerHTML =
      '<div class="dp-kv"><span>Area</span><b>' + fmt(acres, 3) + ' acres</b></div>' +
      '<div class="dp-kv"><span></span><span>' + fmt(res.areaSqFt, 0) + ' sq ft &middot; ' + fmt(ha, 4) + ' ha</span></div>' +
      '<div class="dp-kv"><span>Perimeter</span><b>' + fmt(res.perimFt, 2) + ' ft</b></div>' +
      '<div class="dp-kv"><span>Misclosure</span><b>' + fmt(res.closeFt, 2) + ' ft</b></div>' +
      (res.closeFt >= 0.01 ? '<div class="dp-kv"><span></span><span>closing course ' + esc(formatBearing(res.closeAz)) + '</span></div>' : '') +
      '<div class="dp-kv"><span>Precision</span><b class="' + (isFinite(res.precision) ? precisionClass(res.precision) : 'dp-good') + '">' + prec + '</b></div>' +
      '<div class="dp-small">' + (isFinite(res.precision) && res.precision < 200 ? 'Poor closure: check for a missing or mistyped call, a wrong N/S or E/W, or a curve.' : isFinite(res.precision) && res.precision < 5000 ? 'Typical of older deeds (compass and chain). Modern surveys usually close better than 1 : 10,000.' : 'Modern surveys usually close better than 1 : 10,000. Old deeds often close far worse.') + '</div>';
    var fixes = isFinite(res.precision) && res.precision < 5000 ? suggestFixes(state.calls, res) : [];
    if (fixes.length) {
      fx.innerHTML = '<div class="dp-h2">Find the bad call</div><div class="dp-small">If one call was mistyped, these changes would close the figure (most likely first):</div><ol>' +
        fixes.map(function (f) { return '<li>' + esc(f.text) + '</li>'; }).join('') + '</ol>';
      fx.hidden = false;
    } else fx.hidden = true;
  }

  /* ---- share state in URL hash ---- */
  var hashTimer = null;
  function scheduleHash() { clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 500); }
  function stateString() {
    var s = { c: state.calls.map(function (c) { var a = [c.brg, c.dist === null ? '' : c.dist, c.unit, c.tie ? 1 : 0]; if (c.curve) a.push(1, c.cr, c.cd, c.cdir); return a; }), r: state.rot, u: state.defUnit };
    if (state.origin) s.o = [round(state.origin[0], 7), round(state.origin[1], 7)];
    return encodeURIComponent(JSON.stringify(s));
  }
  function writeHash() {
    if (!state.calls.length && !state.origin) return;
    try { history.replaceState(null, '', '#dp=' + stateString()); } catch (e) { /* ignore */ }
  }
  function readHash() {
    var m = /[#&]dp=([^&]+)/.exec(window.location.hash);
    if (!m) return false;
    try {
      var s = JSON.parse(decodeURIComponent(m[1]));
      state.calls = (s.c || []).map(function (a) {
        return { brg: String(a[0]), dist: a[1], unit: UNITS[a[2]] ? a[2] : 'ft', tie: !!a[3], curve: !!a[4], cr: a[5] || '', cd: a[6] || '', cdir: a[7] === 'L' ? 'L' : 'R' };
      });
      state.defUnit = UNITS[s.u] ? s.u : 'ft';
      q('.dp-defunit').value = state.defUnit;
      setRot(s.r || 0);
      renderTable();
      if (s.o) setOrigin(s.o, true); else redraw(false);
      return true;
    } catch (e) { return false; }
  }
  q('.dp-share').addEventListener('click', function () {
    writeHash();
    var url = window.location.href.split('#')[0] + '#dp=' + stateString(), btn = this;
    function done() { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy share link'; }, 2000); }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
    else prompt('Copy this link:', url);
  });

  /* ---- exports ---- */
  function download(content, name, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function needCalls() {
    if (!lastRes || lastRes.parcelPts.length < 3) { alert('Read a deed (or add calls) first.'); return true; }
    return false;
  }
  function needPlot() {
    if (needCalls()) return true;
    if (!state.origin) { alert('Set the starting point on the map first.'); return true; }
    return false;
  }
  function lonlat(p) { var a = ll(p); return [round(a[1], 8), round(a[0], 8)]; }
  function cornerRows() {
    var rows = [];
    lastRes.legs.forEach(function (lg) {
      if (!lg.ok) return;
      var c = state.calls[lg.i], a = ll({ x: lg.x1, y: lg.y1 });
      rows.push({ call: lg.i + 1, type: lg.tie ? 'tie' : (c.curve ? 'curve' : 'line'), bearing: formatBearing(parseBearing(c.brg)), distance: c.dist, unit: c.unit,
        lat: round(a[0], 8), lon: round(a[1], 8), northingFt: round(lg.y1, 3), eastingFt: round(lg.x1, 3) });
    });
    return rows;
  }
  q('.dp-dxf').addEventListener('click', function () {
    if (needCalls()) return;
    download(buildDxf(state.calls, lastRes), 'deed-plot.dxf', 'application/dxf');
  });
  q('.dp-geojson').addEventListener('click', function () {
    if (needPlot()) return;
    var ring = lastRes.ring.map(lonlat); ring.push(ring[0]);
    var feats = [{ type: 'Feature', properties: { name: 'Deed plot', areaAcres: round(lastRes.areaSqFt / 43560, 4), perimeterFt: round(lastRes.perimFt, 2), misclosureFt: round(lastRes.closeFt, 3), rotationDeg: state.rot }, geometry: { type: 'Polygon', coordinates: [ring] } }];
    if (lastRes.tiePts.length > 1) feats.push({ type: 'Feature', properties: { name: 'Tie line' }, geometry: { type: 'LineString', coordinates: lastRes.tiePts.map(lonlat) } });
    cornerRows().forEach(function (r) { feats.push({ type: 'Feature', properties: r, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } }); });
    download(JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 1), 'deed-plot.geojson', 'application/geo+json');
  });
  q('.dp-kml').addEventListener('click', function () {
    if (needPlot()) return;
    var ring = lastRes.ring.map(lonlat); ring.push(ring[0]);
    function coords(a) { return a.map(function (c) { return c[0] + ',' + c[1] + ',0'; }).join(' '); }
    var k = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Deed plot</name>' +
      '<Style id="b"><LineStyle><color>ff303bff</color><width>3</width></LineStyle><PolyStyle><color>40303bff</color></PolyStyle></Style>' +
      '<Style id="t"><LineStyle><color>ff00d4ff</color><width>2</width></LineStyle></Style>' +
      '<Placemark><name>Deed plot</name><description>Area ' + fmt(lastRes.areaSqFt / 43560, 3) + ' acres, misclosure ' + fmt(lastRes.closeFt, 2) + ' ft</description><styleUrl>#b</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>' +
      coords(ring) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>';
    if (lastRes.tiePts.length > 1) k += '<Placemark><name>Tie line</name><styleUrl>#t</styleUrl><LineString><coordinates>' + coords(lastRes.tiePts.map(lonlat)) + '</coordinates></LineString></Placemark>';
    cornerRows().forEach(function (r) { k += '<Placemark><name>' + r.call + '</name><description>' + esc(r.bearing + ' ' + r.distance + ' ' + r.unit) + '</description><Point><coordinates>' + r.lon + ',' + r.lat + ',0</coordinates></Point></Placemark>'; });
    k += '</Document></kml>';
    download(k, 'deed-plot.kml', 'application/vnd.google-earth.kml+xml');
  });
  q('.dp-csv').addEventListener('click', function () {
    if (needPlot()) return;
    var cols = ['call', 'type', 'bearing', 'distance', 'unit', 'lat', 'lon', 'northingFt', 'eastingFt'];
    var csv = 'call,type,bearing,distance,unit,end_lat,end_lon,northing_ft_from_start,easting_ft_from_start\n' +
      cornerRows().map(function (r) { return cols.map(function (c) { var v = String(r[c]); return /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    download(csv, 'deed-plot-corners.csv', 'text/csv');
  });
  q('.dp-print').addEventListener('click', function () {
    if (needCalls()) return;
    var res = lastRes, pts = [];
    res.legs.forEach(function (lg) { if (lg.ok) { pts.push([lg.x0, lg.y0], [lg.x1, lg.y1]); if (lg.arc) lg.arc.pts.forEach(function (p) { pts.push([p.x, p.y]); }); } });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var W = 640, H = 520, pad = 50, sc = Math.min((W - 2 * pad) / Math.max(maxx - minx, 1), (H - 2 * pad) / Math.max(maxy - miny, 1));
    var ox = ((W - 2 * pad) - (maxx - minx) * sc) / 2, oy = ((H - 2 * pad) - (maxy - miny) * sc) / 2;
    function sx(x) { return round(pad + (x - minx) * sc + ox, 2); }
    function sy(y) { return round(H - pad - (y - miny) * sc - oy, 2); }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="border:1px solid #ccc;background:#fff">';
    svg += '<polygon points="' + res.ring.map(function (p) { return sx(p.x) + ',' + sy(p.y); }).join(' ') + '" fill="#ff3b30" fill-opacity="0.08" stroke="none"/>';
    res.legs.forEach(function (lg) {
      if (!lg.ok) return;
      var path = [{ x: lg.x0, y: lg.y0 }].concat(lg.arc ? lg.arc.pts : []).concat([{ x: lg.x1, y: lg.y1 }]);
      svg += '<polyline points="' + path.map(function (p) { return sx(p.x) + ',' + sy(p.y); }).join(' ') + '" fill="none" stroke="' + (lg.tie ? '#999' : '#c00') + '" stroke-width="2"' + (lg.tie ? ' stroke-dasharray="6 4"' : '') + '/>';
      var mp = path[Math.floor(path.length / 2)], mq = path.length % 2 ? mp : { x: (path[path.length / 2 - 1].x + mp.x) / 2, y: (path[path.length / 2 - 1].y + mp.y) / 2 };
      svg += '<circle cx="' + sx(mq.x) + '" cy="' + sy(mq.y) + '" r="10" fill="#fff" stroke="#333"/><text x="' + sx(mq.x) + '" y="' + (sy(mq.y) + 4) + '" font-size="11" text-anchor="middle" font-family="Arial">' + (lg.i + 1) + '</text>';
    });
    var p0 = res.parcelPts[0];
    svg += '<circle cx="' + sx(p0.x) + '" cy="' + sy(p0.y) + '" r="5" fill="#2a2"/><text x="' + (sx(p0.x) + 8) + '" y="' + (sy(p0.y) - 8) + '" font-size="12" font-family="Arial">POB</text>';
    svg += '<g transform="translate(' + (W - 40) + ',50)"><polygon points="0,-28 8,0 0,-6 -8,0" fill="#333"/><text x="0" y="16" font-size="13" text-anchor="middle" font-family="Arial">N</text></g></svg>';
    var rows = state.calls.map(function (c, i) {
      var az = parseBearing(c.brg);
      var extra = c.curve ? ' (chord; R ' + esc(c.cr) + ', delta ' + esc(c.cd) + ', ' + (c.cdir === 'L' ? 'left' : 'right') + ')' : '';
      return '<tr><td>' + (i + 1) + '</td><td>' + (c.tie ? 'Tie' : c.curve ? 'Curve' : 'Line') + '</td><td>' + esc(isFinite(az) ? formatBearing(az) : c.brg) + extra + '</td><td>' + esc(c.dist) + ' ' + esc(UNITS[c.unit].short) + '</td></tr>';
    }).join('');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deed plot</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;margin-top:12px;font-size:13px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}h1{font-size:20px}.s{font-size:13px;margin:4px 0}.d{font-size:11px;color:#666;margin-top:16px}</style></head><body>' +
      '<h1>Deed plot</h1>' +
      '<div class="s">Area: <b>' + fmt(res.areaSqFt / 43560, 3) + ' acres</b> (' + fmt(res.areaSqFt, 0) + ' sq ft)</div>' +
      '<div class="s">Perimeter: ' + fmt(res.perimFt, 2) + ' ft &middot; Misclosure: ' + fmt(res.closeFt, 2) + ' ft &middot; Precision: ' + (isFinite(res.precision) ? '1 : ' + fmt(Math.round(res.precision), 0) : 'closes exactly') + '</div>' +
      (state.origin ? '<div class="s">Start point: ' + fmt(state.origin[0], 6) + ', ' + fmt(state.origin[1], 6) + (state.rot ? ' &middot; Bearings rotated ' + state.rot + DEG : '') + '</div>' : '') +
      svg + '<table><tr><th>#</th><th>Type</th><th>Bearing</th><th>Distance</th></tr>' + rows + '</table>' +
      '<div class="d">Plotted with the MapScaping Deed Plotter (mapscaping.com/deed-plotter/). A deed plot is not a survey.</div>' +
      '<script>window.onload=function(){window.print();}<\/script></body></html>';
    var w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print the plat.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  });

  /* ---- init ---- */
  if (!readHash()) { container.classList.add('dp-picking'); renderTable(); renderResults(traverse([], 0)); }
})(typeof window !== 'undefined' ? window : globalThis);
