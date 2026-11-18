// Token Radar dashboard (radar-5). Renders window.RADAR with no network:
// the board, one detail view per protocol, filters, the live-token tab
// and the method panel — including the per-category bands that radar-5
// judges its verdicts by. Every number shown comes from the dataset;
// the sandbox at the bottom of the method panel re-scores the board in
// the page only and never touches board.json.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.innerHTML = '<p style="padding:24px">No radar data loaded.</p>'; return; }

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function signed(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function share(f) { return (f * 100).toFixed(3) + '%'; }
  function mult(x) { return '×' + x.toFixed(2); }
  function ageStr(a) { return a == null ? '—' : a + 'd'; }
  function cls(n) { return n == null ? '' : (n > 0 ? 'pos' : (n < 0 ? 'neg' : '')); }

  var state = {
    tab: 'board', q: '', cat: '', chain: '', verdict: '',
    watchOnly: false, growingOnly: false,
    sort: 'rank', dir: 1, page: 1, slug: null,
    sandbox: { exp: 0.6, scale: 1.0, peak: 730 },
  };
  var PAGE_SIZE = 25;

  // ---- hash: #view=board|detail|filtered|method&slug=..&verdict=..&page=..&sort=.. ----
  function readHash() {
    var h = {};
    location.hash.slice(1).split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) h[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return h;
  }
  function writeHash() {
    var parts = ['view=' + (state.tab === 'board' && state.slug ? 'detail' : state.tab)];
    if (state.slug) parts.push('slug=' + state.slug);
    if (state.verdict) parts.push('verdict=' + state.verdict);
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.page > 1) parts.push('page=' + state.page);
    if (state.sort !== 'rank') parts.push('sort=' + state.sort);
    history.replaceState(null, '', '#' + parts.join('&'));
  }
  (function initFromHash() {
    var h = readHash();
    var view = h.view || 'board';
    if (view === 'method' || view === 'live') state.tab = view;
    if (view === 'detail' || view === 'filtered') state.tab = 'board';
    if (h.slug) state.slug = h.slug;
    if (h.verdict) state.verdict = h.verdict;
    if (h.cat) state.cat = h.cat;
    if (h.q) state.q = h.q;
    if (h.page) state.page = Math.max(1, parseInt(h.page, 10) || 1);
    if (h.sort) state.sort = h.sort;
    if (view === 'filtered' && !state.verdict) state.verdict = 'farm';
  })();

  // ---- hero, totals, model strip ----
  function renderMeta() {
    $('#meta-version').textContent = R.model_version;
    $('#meta-asof').textContent = 'snapshot ' + R.as_of;
  }
  function renderHero() {
    var top = R.rows.slice(0, 3);
    $('#hero').innerHTML = top.map(function (r) {
      return '<article class="hero-card"><div class="h-rank">Rank ' + r.rank + (r.on_watchlist ? ' · watchlist' : '') + '</div>' +
        '<h2>' + esc(r.name) + '</h2><div class="h-cat">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) + '</div>' +
        '<div class="h-val">' + money(r.implied_value_usd) + '</div>' +
        '<div class="h-net">Net at band low <b class="' + cls(r.model.net_low_usd) + '">' +
        (r.model.net_low_usd > 0 ? '+' : '') + '$' + r.model.net_low_usd.toLocaleString('en-US') + '</b> · band ' + mult(r.model.band_factor) + '</div></article>';
    }).join('');
  }
  function renderTotals() {
    var t = [
      [R.board_size, 'protocols ranked'],
      [R.watchlist_size, 'on the watchlist'],
      [R.early_size, 'below the $50M floor'],
      [R.verdict_counts.farm, 'verdict: Farm'],
      [R.set_aside.total, 'pre-token set aside'],
    ];
    $('#totals').innerHTML = t.map(function (x) {
      return '<div class="total"><div class="t-num">' + x[0] + '</div><div class="t-lab">' + x[1] + '</div></div>';
    }).join('');
  }
  function renderStrip() {
    var c = R.curve;
    $('#strip').innerHTML = 'Model <b>radar-5</b>: implied = curve(TVL) × growth × maturity × breadth, ' +
      'curve fitted on <b>' + c.n + ' comps</b> (log10(mcap) = ' + c.a.toFixed(3) + ' + ' + c.b.toFixed(3) +
      ' × log10(TVL), R² ' + c.r2.toFixed(3) + '), leave-one-out error <b>×' + c.loo_true_x.toFixed(2) +
      '</b> on true caps, time-split ×' + c.timesplit_early_late_x.toFixed(2) + ' / ×' + c.timesplit_late_early_x.toFixed(2) +
      '. New in radar-5: each category carries <b>its own band</b> (RWA ×' + (c.category_band['RWA'] || c.loo_true_x).toFixed(2) +
      ', Dexs ×' + (c.category_band['Dexs'] || c.loo_true_x).toFixed(2) + '), so verdicts are judged at the band low of their own category. ' +
      'Verdicts: <b>' + R.verdict_counts.farm + ' Farm / ' + R.verdict_counts.thin + ' Thin / ' + R.verdict_counts.later + ' Later</b>.';
  }

  // ---- board: filter, sort, paginate ----
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.cat && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.growingOnly && !(r.change_7d != null && r.change_7d > 0)) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var d = state.dir;
    rows.sort(function (a, b) {
      var v = 0;
      if (key === 'name') v = a.name < b.name ? -1 : 1;
      else if (key === 'value') v = b.implied_value_usd - a.implied_value_usd;
      else if (key === 'band') v = b.model.band_factor - a.model.band_factor;
      else if (key === 'tvl') v = b.tvl_usd - a.tvl_usd;
      else if (key === 'growth') v = (b.change_7d || 0) - (a.change_7d || 0);
      else if (key === 'age') v = (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days);
      else if (key === 'net') v = b.model.net_low_usd - a.model.net_low_usd;
      else if (key === 'verdict') v = a.model.break_even_pct - b.model.break_even_pct;
      else v = a.rank - b.rank;
      return key === 'name' || key === 'verdict' ? v * d : v;
    });
    return rows;
  }
  function renderBoard() {
    var rows = filteredRows();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var slice = rows.slice(start, start + PAGE_SIZE);
    $('#count').textContent = rows.length + ' of ' + R.rows.length + ' protocols · page ' + state.page + ' of ' + pages;
    $('#board-body').innerHTML = slice.map(function (r) {
      return '<tr class="row' + (state.slug === r.slug ? ' sel' : '') + '" data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.slice(0, 2).join(', ')) +
        (r.on_watchlist ? ' · <span class="tag watch">watchlist</span>' : '') + '</span></td>' +
        '<td class="num"><span class="val">' + money(r.implied_value_usd) + '</span><span class="sub">low ' + money(r.model.band_low) + '</span></td>' +
        '<td class="num">' + mult(r.model.band_factor) + '<span class="sub">' + esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls(r.change_7d) + '">' + signed(r.change_7d) + '</td>' +
        '<td class="num">' + ageStr(r.age_days) + '</td>' +
        '<td class="num ' + cls(r.model.net_low_usd) + '">' + (r.model.net_low_usd > 0 ? '+' : '') + '$' + r.model.net_low_usd.toLocaleString('en-US') + '</td>' +
        '<td><span class="tag ' + r.verdict + '">' + (r.verdict === 'farm' ? 'Farm' : r.verdict === 'thin' ? 'Thin' : 'Later') + '</span></td></tr>';
    }).join('');
    var p = '';
    p += '<button type="button" id="pg-prev"' + (state.page <= 1 ? ' disabled' : '') + '>← Prev</button>';
    for (var i = 1; i <= pages; i++) {
      if (pages > 9 && i > 2 && i < pages - 1 && Math.abs(i - state.page) > 2) continue;
      p += '<button type="button" data-page="' + i + '"' + (i === state.page ? ' class="cur"' : '') + '>' + i + '</button>';
    }
    p += '<button type="button" id="pg-next"' + (state.page >= pages ? ' disabled' : '') + '>Next →</button>';
    $('#pager').innerHTML = p;
    document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
  }

  // ---- detail ----
  function whySentence(r) {
    var m = r.model;
    var bandComps = R.curve.category_loo_n[r.category || 'Uncategorised'] || m.offset_comps;
    var g = m.growth_pct == null ? 'no reported 7-day change' : (m.growth_pct > 0 ? '+' + m.growth_pct.toFixed(1) + '% in 7 days' : m.growth_pct.toFixed(1) + '% in 7 days');
    return r.name + ' ranks #' + r.rank + ' at ' + moneyFull(r.implied_value_usd) + ' because its ' + money(r.tvl_usd) +
      ' of TVL prices at ' + moneyFull(m.curve_value) + ' on the size curve, ×' + m.category_offset.toFixed(2) +
      ' for ' + (r.category || 'Uncategorised') + ' (' + m.offset_comps + (m.offset_comps === 1 ? ' comp' : ' comps') + '), with ' + g + ' and ' +
      (r.age_days == null ? 'no listing date' : r.age_days + ' days listed') + '. Its ' + (r.category || 'Uncategorised') +
      ' band is ' + mult(m.band_factor) + ' (held-out error ' + mult(m.band_raw) + ' on ' + bandComps + (bandComps === 1 ? ' comp' : ' comps') +
      ', shrunk toward the global ×' + R.curve.loo_true_x.toFixed(2) + '), so the farm plan is judged at a ' +
      moneyFull(m.band_low) + ' low end — and the verdict follows from that low end, not from the point estimate.';
  }
  function renderDetail() {
    var r = R.rows.find(function (x) { return x.slug === state.slug; }) || R.rows[0];
    if (!r) return;
    state.slug = r.slug;
    var m = r.model, f = r.farm;
    var verdictWord = r.verdict === 'farm' ? 'Farm' : r.verdict === 'thin' ? 'Thin' : 'Later';
    $('#detail').innerHTML =
      '<h2>' + esc(r.name) + ' <span class="tag ' + r.verdict + '">' + verdictWord + '</span>' + (r.on_watchlist ? ' <span class="tag watch">watchlist</span>' : '') + '</h2>' +
      '<p class="d-sub">Rank ' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + signed(r.change_7d) + ' · listed ' + ageStr(r.age_days) + ' ago · signal ' + r.signal + '</p>' +
      '<div class="d-grid">' +
      '<div class="d-box"><div class="d-num amber">' + money(r.implied_value_usd) + '</div><div class="d-lab">Implied value</div></div>' +
      '<div class="d-box"><div class="d-num">' + money(m.band_low) + ' – ' + money(m.band_high) + '</div><div class="d-lab">Value band (×' + m.band_factor.toFixed(2) + ')</div></div>' +
      '<div class="d-box"><div class="d-num ' + cls(m.net_low_usd) + '">' + (m.net_low_usd > 0 ? '+' : '') + '$' + m.net_low_usd.toLocaleString('en-US') + '</div><div class="d-lab">Net at band low (point: ' + (m.net_point_usd > 0 ? '+' : '') + '$' + m.net_point_usd.toLocaleString('en-US') + ')</div></div>' +
      '<div class="d-box"><div class="d-num">' + share(m.break_even_pct) + '</div><div class="d-lab">Break-even airdrop share</div></div>' +
      '</div>' +
      '<p class="d-why">' + esc(whySentence(r)) + '</p>' +
      '<div class="d-cols"><div><h3>Farm budget</h3><table class="budget"><tbody>' +
      '<tr><td>Capital</td><td>$' + f.capital_usd + '</td></tr>' +
      '<tr><td>Gas per transaction (' + esc(r.chains[0] || 'main chain') + ')</td><td>$' + f.gas_per_tx_usd + '</td></tr>' +
      '<tr><td>Estimated gas, whole plan</td><td>$' + f.est_gas_usd + '</td></tr>' +
      '<tr><td>Hold</td><td>' + f.hold_days + ' days</td></tr>' +
      '<tr><td>Actions per week</td><td>' + f.actions_per_week + '</td></tr>' +
      '<tr><td>Setup time / weekly time</td><td>' + f.setup_minutes + ' min / ' + f.weekly_minutes + ' min</td></tr>' +
      '<tr><td>Curve value × offset × growth × maturity × breadth</td><td>' + money(m.curve_value) + ' × ' + m.category_offset.toFixed(2) + ' × ' + m.growth_factor.toFixed(2) + ' × ' + m.maturity.toFixed(2) + ' × ' + m.breadth.toFixed(2) + '</td></tr>' +
      '</tbody></table></div>' +
      '<div><h3>Farm plan — 8 steps</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol></div></div>';
  }

  // ---- live tab ----
  function renderLive() {
    $('#live-body').innerHTML = R.live.map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + p.mcap_per_tvl.toFixed(2) + '×</td><td class="num ' + cls(p.change_7d) + '">' + signed(p.change_7d) + '</td></tr>';
    }).join('');
  }

  // ---- method panel ----
  function blindTable() {
    var c = R.curve;
    var rows = [
      ['Leave-one-out, true market caps', '×' + c.loo_true_x.toFixed(2)],
      ['Leave-one-out, capped comps', '×' + c.loo_x.toFixed(2)],
      ['5-fold, true market caps', '×' + c.fivefold_true_x.toFixed(2)],
      ['5-fold, capped comps', '×' + c.fivefold_x.toFixed(2)],
      ['Time-split, earlier comps fit → later tested', '×' + c.timesplit_early_late_x.toFixed(2)],
      ['Time-split, later comps fit → earlier tested', '×' + c.timesplit_late_early_x.toFixed(2)],
      ['Bootstrap slope, median (5th–95th)', c.bootstrap_slope_median.toFixed(2) + ' (' + c.bootstrap_slope_lo.toFixed(2) + '–' + c.bootstrap_slope_hi.toFixed(2) + ')'],
      ['Residual spread', '×' + Math.pow(10, c.resid_sd_dex).toFixed(2)],
    ];
    return '<table class="mini"><thead><tr><th>Blind test (median error)</th><th>Result</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr><td>' + x[0] + '</td><td class="num">' + x[1] + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function bandTable() {
    var c = R.curve;
    var cats = Object.keys(c.category_band).sort(function (a, b) {
      return (c.category_loo_n[b] || 0) - (c.category_loo_n[a] || 0);
    });
    var body = cats.map(function (cat) {
      var n = c.category_loo_n[cat] || 0;
      return '<tr><td>' + esc(cat) + '</td><td class="num">' + n + '</td>' +
        '<td class="num">×' + c.category_loo[cat].toFixed(2) + '</td>' +
        '<td class="num"><b>×' + c.category_band[cat].toFixed(2) + '</b></td>' +
        '<td class="num">' + (c.category_in_global_band[cat] || 0) + ' / ' + n + '</td>' +
        '<td class="num">' + (c.category_in_own_band[cat] || 0) + ' / ' + n + '</td></tr>';
    }).join('');
    return '<table class="mini"><thead><tr><th>Category</th><th>Comps</th><th>Held-out error (raw)</th><th>Band used</th><th>In global ×' + c.loo_true_x.toFixed(2) + ' band</th><th>In own band</th></tr></thead><tbody>' + body + '</tbody></table>';
  }
  function curveChart() {
    var pts = R.comps, c = R.curve;
    var xs = pts.map(function (p) { return Math.log10(p.tvl_usd); });
    var ys = pts.map(function (p) { return Math.log10(p.mcap_usd); });
    var x0 = Math.min.apply(null, xs) - 0.2, x1 = Math.max.apply(null, xs) + 0.2;
    var y0 = Math.min.apply(null, ys) - 0.3, y1 = Math.max.apply(null, ys) + 0.3;
    var W = 760, H = 320, P = 34;
    function X(v) { return P + ((v - x0) / (x1 - x0)) * (W - 2 * P); }
    function Y(v) { return H - P - ((v - y0) / (y1 - y0)) * (H - 2 * P); }
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(p.mcap_usd)).toFixed(1) + '" r="3" fill="#16233d" opacity="0.55"/>';
    }).join('');
    var line = '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(c.a + c.b * x0).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(c.a + c.b * x1).toFixed(1) + '" stroke="#b45309" stroke-width="2"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Size curve chart">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffdf8"/>' + line + dots +
      '<text x="' + P + '" y="16" font-size="12" fill="#667085">Each dot is one listed comp (log TVL → log market cap); amber line is the fitted curve.</text>' +
      '<text x="' + P + '" y="' + (H - 8) + '" font-size="12" fill="#667085">log10(TVL) →</text></svg>';
  }
  function sandboxTop() {
    var s = state.sandbox;
    function maturity(age) {
      var a = age == null ? 180 : age, x = Math.max(0, a) / s.peak;
      return 0.55 + 0.45 * x * Math.exp(1 - x);
    }
    var rescored = R.rows.map(function (r) {
      var m = r.model;
      var v = Math.max(1, Math.round(m.curve_value * Math.pow(1 + m.growth_pct / 100, s.exp) * maturity(r.age_days) * m.breadth * s.scale));
      return { slug: r.slug, name: r.name, oldRank: r.rank, value: v };
    }).sort(function (a, b) { return b.value - a.value; });
    var moved = 0;
    rescored.forEach(function (r, i) { if (r.oldRank !== i + 1) moved++; });
    var top = rescored.slice(0, 10).map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td class="num">' + money(r.value) + '</td><td class="num">was #' + r.oldRank + '</td></tr>';
    }).join('');
    return '<p class="mini">Sandbox re-scores the board in this page only — it never changes board.json. ' +
      '<b>' + moved + ' of ' + R.rows.length + ' rows change rank</b> at these settings.</p>' +
      '<table class="mini"><thead><tr><th>#</th><th>Protocol</th><th>Re-scored value</th><th>Board rank</th></tr></thead><tbody>' + top + '</tbody></table>';
  }
  function renderMethod() {
    var c = R.curve;
    var auditRows = R.audit.map(function (a) {
      return '<tr><td>' + (a.rank == null ? '—' : a.rank) + '</td><td>' + esc(a.name) + '</td><td>' + esc(a.category || '—') + '</td>' +
        '<td class="num">' + money(a.tvl_usd) + '</td><td>' + (a.rank != null ? 'ranked' : esc(a.reason || 'set aside')) + '</td></tr>';
    }).join('');
    $('#method').innerHTML =
      '<h2>How the value is built</h2>' +
      '<p>Implied value = <code>curve(TVL) × growth × maturity × breadth</code>. The curve is one log-log line fitted on the ' +
      'market&rsquo;s own prices: <code>log10(mcap) = ' + c.a.toFixed(3) + ' + ' + c.b.toFixed(3) + ' × log10(TVL)</code> on ' + c.n +
      ' listed comps, each ratio capped at 0.75× TVL before fitting, R² ' + c.r2.toFixed(3) + '. The slope is below one, so the implied ' +
      'multiple falls with size: ' + c.multiple_at.tvl_50m.toFixed(3) + '× at $50M TVL, ' + c.multiple_at.tvl_500m.toFixed(3) +
      '× at $500M, ' + c.multiple_at.tvl_2b.toFixed(3) + '× at $2B. Category offsets are each category&rsquo;s mean residual off the ' +
      'line, shrunk toward zero with weight 6 (0.52×–1.71×). Growth is the 7-day TVL change clamped to −60%…+120% and raised to 0.6. ' +
      'Maturity is a hump peaking at 730 days. Breadth adds 3% per extra chain, up to 15%.</p>' +
      '<h2>What radar-5 changes: the band is per category</h2>' +
      '<p>radar-4 judged every verdict at one global band, implied / ×' + c.loo_true_x.toFixed(2) + '. But the curve is not equally ' +
      'good everywhere: held out one by one, RWA comps land within ×' + (c.category_loo['RWA'] || 0).toFixed(2) + ' of the curve while ' +
      'Dexs comps land within ×' + (c.category_loo['Dexs'] || 0).toFixed(2) + ' — and the global band covers 8 of 9 RWA comps but only ' +
      '3 of 11 Dexs comps. So each category now carries its own band: its leave-one-out median error on true caps, shrunk toward the ' +
      'global ×' + c.loo_true_x.toFixed(2) + ' in log space with weight 6, the same shrinkage the offsets use. A category with one comp ' +
      'is pulled most of the way home; a category with 9–15 comps keeps most of its own evidence. Verdicts are judged at the category ' +
      'band&rsquo;s low end. Ranks do not move — the band changes verdicts, not values — but 25 of the 198 verdicts do: 23 Farm fall to ' +
      'Thin, 2 Thin rise to Farm, leaving ' + R.verdict_counts.farm + ' Farm / ' + R.verdict_counts.thin + ' Thin / ' + R.verdict_counts.later +
      ' Later. Overall coverage of true caps stays near half, as a median band should.</p>' +
      '<h3>Bands by category</h3>' + bandTable() +
      '<h3>Blind tests</h3>' + blindTable() +
      '<p>Fitting age, growth or chain count into the curve was tried and made the blind test worse (leave-one-out ×2.92–×3.08, ' +
      'against ×' + c.loo_true_x.toFixed(2) + '), so those stay fixed adjustments, not fitted coefficients. The curve&rsquo;s R² is only ' +
      c.r2.toFixed(3) + ': most of what makes one token worth more than another is not in this snapshot, which has no fee, revenue or ' +
      'user fields — only slug, name, category, chains, TVL, 7-day change, market cap, listing date, Gecko id and symbol.</p>' +
      '<h3>The size curve</h3>' + curveChart() +
      '<h3>Model sandbox (this page only)</h3>' +
      '<div class="sandbox">' +
      '<label>Growth exponent <span class="s-val" id="sb-exp-v">0.60</span><input type="range" id="sb-exp" min="0.3" max="0.9" step="0.05" value="0.6"></label>' +
      '<label>Curve scale <span class="s-val" id="sb-scale-v">1.00×</span><input type="range" id="sb-scale" min="0.7" max="1.3" step="0.05" value="1"></label>' +
      '<label>Maturity peak <span class="s-val" id="sb-peak-v">730 days</span><input type="range" id="sb-peak" min="365" max="1095" step="5" value="730"></label>' +
      '</div><div id="sandbox-out"></div>' +
      '<h2>Audit: all ' + R.audit.length + ' pre-token protocols</h2>' +
      '<p>Every protocol that records no token, ranked or set aside with its reason, so the exclusions can be checked one by one. ' +
      'Watchlist coverage is automatic: all ' + R.watchlist_size + ' watchlist slugs pass the same exclusion rule.</p>' +
      '<table class="mini"><thead><tr><th>Rank</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Disposition</th></tr></thead><tbody>' + auditRows + '</tbody></table>';
    renderSandbox();
  }
  function renderSandbox() {
    var out = $('#sandbox-out');
    if (out) out.innerHTML = sandboxTop();
  }

  // ---- tabs, controls, wiring ----
  function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    $('#view-board').hidden = tab !== 'board';
    $('#view-live').hidden = tab !== 'live';
    $('#view-method').hidden = tab !== 'method';
    if (tab === 'method') renderMethod();
    if (tab === 'live') renderLive();
  }
  function fillSelects() {
    var cats = [...new Set(R.rows.map(function (r) { return r.category || 'Uncategorised'; }))].sort();
    $('#f-cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chains = [...new Set(R.rows.flatMap(function (r) { return r.chains; }))].sort();
    $('#f-chain').innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    $('#f-verdict').value = state.verdict;
    $('#f-watch').checked = state.watchOnly;
    $('#f-grow').checked = state.growingOnly;
    $('#q').value = state.q;
  }
  function renderAll() {
    renderMeta();
    renderHero();
    renderTotals();
    renderStrip();
    showTab(state.tab);
    renderBoard();
    renderDetail();
    writeHash();
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { state.slug = null; showTab(b.getAttribute('data-tab')); writeHash(); });
  });
  document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) { if (k === 'name' || k === 'verdict') state.dir = -state.dir; }
      else { state.sort = k; state.dir = 1; }
      state.page = 1;
      renderBoard();
      writeHash();
    });
  });
  $('#q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 1; renderBoard(); writeHash(); });
  $('#f-cat').addEventListener('change', function (e) { state.cat = e.target.value; state.page = 1; renderBoard(); writeHash(); });
  $('#f-chain').addEventListener('change', function (e) { state.chain = e.target.value; state.page = 1; renderBoard(); writeHash(); });
  $('#f-verdict').addEventListener('change', function (e) { state.verdict = e.target.value; state.page = 1; renderBoard(); writeHash(); });
  $('#f-watch').addEventListener('change', function (e) { state.watchOnly = e.target.checked; state.page = 1; renderBoard(); writeHash(); });
  $('#f-grow').addEventListener('change', function (e) { state.growingOnly = e.target.checked; state.page = 1; renderBoard(); writeHash(); });
  $('#pager').addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'pg-prev' && state.page > 1) { state.page--; renderBoard(); writeHash(); }
    else if (t.id === 'pg-next') { state.page++; renderBoard(); writeHash(); }
    else if (t.getAttribute('data-page')) { state.page = parseInt(t.getAttribute('data-page'), 10); renderBoard(); writeHash(); }
  });
  $('#board-body').addEventListener('click', function (e) {
    var tr = e.target.closest('tr.row');
    if (!tr) return;
    state.slug = tr.getAttribute('data-slug');
    renderBoard();
    renderDetail();
    writeHash();
    $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'sb-exp' || e.target.id === 'sb-scale' || e.target.id === 'sb-peak') {
      state.sandbox.exp = parseFloat($('#sb-exp').value);
      state.sandbox.scale = parseFloat($('#sb-scale').value);
      state.sandbox.peak = parseInt($('#sb-peak').value, 10);
      $('#sb-exp-v').textContent = state.sandbox.exp.toFixed(2);
      $('#sb-scale-v').textContent = state.sandbox.scale.toFixed(2) + '×';
      $('#sb-peak-v').textContent = state.sandbox.peak + ' days';
      renderSandbox();
    }
  });

  fillSelects();
  var initialView = readHash().view || 'board';
  renderAll();
  if (initialView === 'detail' && state.slug) {
    setTimeout(function () { var d = $('#detail'); if (d) d.scrollIntoView({ block: 'start' }); }, 50);
  }
})();
