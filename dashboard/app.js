(() => {
  'use strict';

  const data = window.RADAR;
  if (!data) throw Error('Radar dataset is missing');
  const board = data.rows, live = data.live_rows || [];
  const get = id => document.getElementById(id);
  const state = { query: '', category: '', chain: '', watch: false, tab: 'board', slug: '', sort: 'rank', direction: 1 };

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  function dollars(value) {
    if (value == null) return '—';
    const amount = Number(value), absolute = Math.abs(amount);
    if (absolute >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
    if (absolute >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
    if (absolute >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
    if (absolute >= 1e3) return `$${(amount / 1e3).toFixed(1)}K`;
    return `$${Math.round(amount).toLocaleString()}`;
  }
  const percent = value => value == null ? '—' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;

  function readRoute() {
    const params = new URLSearchParams(location.hash.slice(1));
    state.query = params.get('q') || ''; state.category = params.get('category') || '';
    state.chain = params.get('chain') || ''; state.watch = params.get('wl') === '1';
    state.tab = params.get('tab') === 'live' ? 'live' : 'board'; state.slug = params.get('p') || '';
  }
  function writeRoute() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category) params.set('category', state.category);
    if (state.chain) params.set('chain', state.chain);
    if (state.watch) params.set('wl', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.slug) params.set('p', state.slug);
    history.replaceState(null, '', params.toString() ? `#${params}` : location.pathname + location.search);
  }
  function initialise() {
    const categories = [...new Set(board.map(row => row.category || 'Uncategorised'))].sort();
    const chains = [...new Set(board.flatMap(row => row.chains || []))].sort();
    get('category').innerHTML = '<option value="">All categories</option>' + categories.map(item => `<option>${escape(item)}</option>`).join('');
    get('chain').innerHTML = '<option value="">All chains</option>' + chains.map(item => `<option>${escape(item)}</option>`).join('');
    const tvl = board.reduce((sum, row) => sum + row.tvl_usd, 0);
    get('model-version').textContent = data.model_version; get('model-tag').textContent = data.model_version;
    get('as-of').textContent = `SNAPSHOT · ${data.as_of}`;
    get('stat-watch').textContent = `${data.watchlist_size} / ${data.watchlist_size}`;
    get('stat-board').textContent = data.board_size.toLocaleString();
    get('stat-early').textContent = data.early_size.toLocaleString();
    get('stat-live').textContent = data.live_size.toLocaleString(); get('stat-tvl').textContent = dollars(tvl);
    get('tab-board-count').textContent = data.board_size; get('tab-live-count').textContent = data.live_size;
    get('multiples').innerHTML = data.category_multiples.map(item => `<div class="radar-multiple"><span>${escape(item.category || 'Uncategorised')} <small>· ${item.live_count} comparables</small></span><b>${Number(item.multiple).toFixed(4)}×</b><em class="heat-${escape(item.heat_band.toLowerCase())}">${escape(item.heat_band)} ${percent(item.median_change_7d)}</em></div>`).join('');
    get('formula').textContent = 'TVL × category multiple × winsorized momentum × maturity × chain quality × category heat; risk value applies stability discount';
    get('live-count').textContent = `${live.length} token-bearing protocols`;
    renderLive(); readRoute(); syncControls(); bindEvents(); renderBoard();
  }
  function syncControls() {
    get('search').value = state.query; get('category').value = state.category;
    get('chain').value = state.chain; get('watchlist').checked = state.watch;
    document.querySelectorAll('.radar-tab').forEach(button => button.classList.toggle('is-active', button.dataset.tab === state.tab));
    get('board-view').classList.toggle('is-hidden', state.tab !== 'board');
    get('live-view').classList.toggle('is-hidden', state.tab !== 'live');
  }
  function filteredRows() {
    const query = state.query.toLowerCase();
    return board.filter(row => (!query || [row.name, row.slug, row.category, ...row.chains].join(' ').toLowerCase().includes(query))
      && (!state.category || (row.category || 'Uncategorised') === state.category)
      && (!state.chain || row.chains.includes(state.chain)) && (!state.watch || row.watchlist))
      .sort((left, right) => {
        let a = left[state.sort], b = right[state.sort];
        if (state.sort === 'name') { a = left.name.toLowerCase(); b = right.name.toLowerCase(); }
        if (state.sort === 'chains') { a = left.chains.length; b = right.chains.length; }
        if (a == null) a = -Infinity; if (b == null) b = -Infinity;
        return (a < b ? -1 : a > b ? 1 : left.rank - right.rank) * state.direction;
      });
  }
  function rowMarkup(row, highest) {
    const changeTone = row.change_7d == null || row.change_7d === 0 ? 'is-neutral' : row.change_7d > 0 ? 'is-positive' : 'is-negative';
    const watchBadge = row.watchlist ? '<span class="radar-watch-badge">WATCHLIST</span>' : '';
    const momentumClass = row.momentum_tier.toLowerCase();
    const riskWidth = Math.max(2, 100 * row.risk_adjusted_value_usd / highest);
    return `<tr data-slug="${escape(row.slug)}" class="${state.slug === row.slug ? 'is-selected' : ''}" tabindex="0">
      <td class="radar-rank">${row.rank}</td>
      <td class="radar-protocol-cell"><strong>${escape(row.name)}</strong>${watchBadge}<span class="radar-subline">${escape(row.category || 'Uncategorised')} · ${escape(row.chains.slice(0, 3).join(', '))}${row.chains.length > 3 ? '…' : ''}</span></td>
      <td class="radar-num radar-numeric">${dollars(row.tvl_usd)}</td>
      <td class="radar-num radar-numeric ${changeTone}">${percent(row.change_7d)}</td>
      <td class="radar-momentum"><b class="tier-${escape(momentumClass)}">${escape(row.momentum_tier)}</b></td>
      <td class="radar-stability"><span class="stability-${escape(row.stability_band.toLowerCase())}">${escape(row.stability_band)}</span></td>
      <td class="radar-num radar-numeric">${row.age_days == null ? '—' : `${row.age_days.toLocaleString()}d`}</td>
      <td class="radar-num radar-numeric">${row.chains.length}</td>
      <td class="radar-conviction"><span class="conviction-badge">${row.conviction}</span></td>
      <td class="radar-score-cell"><div class="radar-barline"><span class="radar-num">${row.score}</span><span class="radar-bar"><i style="width:${row.score}%"></i></span></div></td>
      <td class="radar-value-cell"><div class="radar-barline"><span class="radar-num">${dollars(row.implied_value_usd)}</span><span class="radar-bar"><i style="width:${Math.max(2, 100 * row.implied_value_usd / highest)}%"></i></span></div></td>
      <td class="radar-risk-cell"><div class="radar-barline"><span class="radar-num">${dollars(row.risk_adjusted_value_usd)}</span><span class="radar-bar"><i style="width:${riskWidth}%"></i></span></div></td>
      <td class="radar-density"><span class="density-badge">${dollars(row.value_per_farmed_usd)}</span></td>
      <td class="radar-hourly"><span class="hourly-badge">${dollars(row.value_per_farm_hour_usd)}/h</span></td>
    </tr>`;
  }
  function openDetail(slug) { state.slug = slug; writeRoute(); renderBoard(); }
  function renderBoard() {
    const rows = filteredRows(), ceiling = board[0]?.implied_value_usd || 1;
    const convictionPicks = [...board].sort((a, b) => b.implied_value_usd * b.conviction - a.implied_value_usd * a.conviction || a.rank - b.rank).slice(0, 5);
    const hourlyPick = [...board].sort((a, b) => b.value_per_farm_hour_usd - a.value_per_farm_hour_usd || a.rank - b.rank)[0];
    get('result-count').textContent = `Showing ${rows.length} of ${board.length} protocols`;
    get('board-rows').innerHTML = rows.map(row => rowMarkup(row, ceiling)).join('');
    get('top-picks').innerHTML = convictionPicks.map((row, index) => `<button class="radar-pick" data-pick="${escape(row.slug)}"><span class="pick-rank">0${index + 1}</span><strong>${escape(row.name)}</strong><span>${dollars(row.implied_value_usd)} · conviction ${row.conviction}</span></button>`).join('')
      + (hourlyPick ? `<button class="radar-pick radar-hour-pick" data-pick="${escape(hourlyPick.slug)}"><span class="pick-rank">★</span><strong>${escape(hourlyPick.name)}</strong><span>Best hourly return · ${dollars(hourlyPick.value_per_farm_hour_usd)}/h</span></button>` : '');
    document.querySelectorAll('th button[data-sort]').forEach(button => { button.querySelector('i').textContent = button.dataset.sort === state.sort ? (state.direction === 1 ? '↑' : '↓') : ''; });
    get('detail').classList.toggle('is-hidden', !state.slug);
    if (state.slug) renderDetail(board.find(row => row.slug === state.slug));
  }
  function renderDetail(row) {
    if (!row) { state.slug = ''; writeRoute(); get('detail').classList.add('is-hidden'); return; }
    const reportedChange = row.change_7d == null ? '<em>Not reported</em>' : percent(row.change_7d);
    const stabilityBonus = row.stability_band === 'Calm' ? 0 : row.stability_band === 'Choppy' ? 2 : row.stability_band === 'Volatile' ? 5 : row.stability_band === 'Turbulent' ? 8 : 3;
    const concentrationLoss = row.concentration_label === 'Single-chain' ? 4 : row.concentration_label === 'Concentrated' ? 3 : 0;
    const components = [
      ['7-day change reported', row.change_7d == null ? 0 : 25, 25], ['Listing date recorded', row.listed_at == null ? 0 : 20, 20],
      ['Chains recorded', Math.min(row.chains.length, 5) * 5, 25], ['Category comparables', 30 * (1 - Math.exp(-row.comparable_count / 4)), 30],
      ['Winsorization adjustment', row.winsorized ? -5 : 0, 5], ['Stability band deduction', -stabilityBonus, 8], ['Chain concentration deduction', -concentrationLoss, 4]
    ];
    const bars = components.map(([label, amount, cap]) => `<div class="radar-component"><span>${label}</span><span class="radar-bar"><i style="width:${Math.max(0, 100 * amount / cap)}%"></i></span><b>${Math.round(amount)}</b></div>`).join('');
    const product = row.tvl_usd * row.category_multiple * row.momentum_multiplier * row.maturity_multiplier * row.breadth_multiplier * row.category_heat_multiplier;
    get('detail').innerHTML = `<div class="radar-detail-head"><div><h2>${escape(row.name)} ${row.watchlist ? '<span class="radar-watch-badge">WATCHLIST</span>' : ''}</h2><div class="radar-detail-meta">Rank #${row.rank} · ${escape(row.category || 'Uncategorised')} · ${escape(row.chains.join(', '))}</div></div><button class="radar-close-detail">Close ×</button></div>
      <div class="radar-detail-grid"><div><h3>Protocol snapshot</h3><div class="radar-detail-kpis">
        <div><span>Total value locked</span><b>${dollars(row.tvl_usd)}</b></div><div><span>7-day change</span><b>${reportedChange}</b></div>
        <div><span>Momentum tier</span><b>${escape(row.momentum_tier)}</b></div><div><span>Category heat</span><b>${escape(row.category_heat_band)}</b></div>
        <div><span>Stability band</span><b class="stability-${escape(row.stability_band.toLowerCase())}">${escape(row.stability_band)} · ${row.stability_factor.toFixed(2)}×</b></div>
        <div><span>Chain concentration</span><b>${escape(row.concentration_label)}</b></div><div><span>Effective chain count</span><b>${row.effective_chain_count.toFixed(2)}</b></div>
        <div><span>Listing date</span><b>${escape(row.listed_at || 'Unrecorded')}</b></div><div><span>Category comparables</span><b>${row.comparable_count}</b></div>
        <div><span>Winsorized change</span><b>${row.winsorized ? 'Yes · clipped' : 'No · unchanged'}</b></div><div><span>Token record</span><b>None recorded in this snapshot</b></div>
      </div><h3>Implied value calculation</h3><div class="radar-equation">${dollars(row.tvl_usd)} × ${row.category_multiple.toFixed(4)} × ${row.momentum_multiplier.toFixed(4)} × ${row.maturity_multiplier.toFixed(4)} × ${row.breadth_multiplier.toFixed(4)} × ${row.category_heat_multiplier.toFixed(4)} = <strong>${dollars(Math.round(product))}</strong><br>Risk adjusted: ${dollars(row.implied_value_usd)} × ${row.stability_factor.toFixed(2)} = <strong>${dollars(row.risk_adjusted_value_usd)}</strong></div>
      <p class="radar-detail-meta">Farm estimate ${dollars(row.farm_cost_usd)} · ${row.farm_hours.toFixed(2)} hours · ${dollars(row.value_per_farmed_usd)} per $ farmed · ${dollars(row.value_per_farm_hour_usd)} per farm-hour.</p></div>
      <div><h3>Conviction · ${row.conviction}/100</h3><div class="radar-components">${bars}</div><p class="radar-detail-meta">Evidence coverage includes category comparables. Instability and chain concentration reduce conviction alongside any winsorization deduction.</p></div></div>
      <div class="radar-farm"><h3>Farm plan</h3><ol>${row.farm_steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol></div>`;
    get('detail').querySelector('.radar-close-detail').onclick = () => { state.slug = ''; writeRoute(); renderBoard(); };
  }
  function renderLive() {
    get('live-rows').innerHTML = live.map(row => `<tr><td><strong>${escape(row.name)}</strong><span class="radar-subline">${escape(row.symbol || '')} · ${escape(row.slug)}</span></td><td>${escape(row.category || 'Uncategorised')}</td><td>${escape((row.chains || []).join(', '))}</td><td class="radar-num radar-numeric">${dollars(row.tvl_usd)}</td><td class="radar-num radar-numeric">${dollars(row.mcap_usd)}</td></tr>`).join('');
  }
  function bindEvents() {
    get('search').oninput = event => { state.query = event.target.value; writeRoute(); renderBoard(); };
    get('category').onchange = event => { state.category = event.target.value; writeRoute(); renderBoard(); };
    get('chain').onchange = event => { state.chain = event.target.value; writeRoute(); renderBoard(); };
    get('watchlist').onchange = event => { state.watch = event.target.checked; writeRoute(); renderBoard(); };
    document.querySelectorAll('.radar-tab').forEach(button => button.onclick = () => { state.tab = button.dataset.tab; writeRoute(); syncControls(); });
    document.querySelectorAll('th button[data-sort]').forEach(button => button.onclick = () => {
      if (state.sort === button.dataset.sort) state.direction *= -1;
      else { state.sort = button.dataset.sort; state.direction = button.dataset.sort === 'rank' ? 1 : -1; }
      renderBoard();
    });
    get('board-rows').onclick = event => { const row = event.target.closest('tr[data-slug]'); if (row) openDetail(row.dataset.slug); };
    get('board-rows').onkeydown = event => { const row = event.target.closest('tr[data-slug]'); if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetail(row.dataset.slug); } };
    get('top-picks').onclick = event => { const button = event.target.closest('[data-pick]'); if (button) openDetail(button.dataset.pick); };
    addEventListener('hashchange', () => { readRoute(); syncControls(); renderBoard(); });
  }
  initialise();
})();
