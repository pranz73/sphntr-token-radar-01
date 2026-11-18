(() => {
  'use strict';

  const dataset = window.RADAR;
  if (!dataset) throw Error('Radar dataset is missing');

  const board = dataset.rows;
  const live = dataset.live_rows || dataset.live || [];
  const constants = dataset.model_constants;
  const view = {
    query: '', category: '', chain: '', watchOnly: false,
    tab: 'board', protocol: '', sort: 'rank', direction: 1
  };

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function formatUsd(value) {
    if (value == null || !Number.isFinite(+value)) return '—';
    const amount = +value;
    const magnitude = Math.abs(amount);
    if (magnitude >= 1e12) return '$' + (amount / 1e12).toFixed(2) + 'T';
    if (magnitude >= 1e9) return '$' + (amount / 1e9).toFixed(2) + 'B';
    if (magnitude >= 1e6) return '$' + (amount / 1e6).toFixed(2) + 'M';
    if (magnitude >= 1e3) return '$' + (amount / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(amount).toLocaleString();
  }

  const formatPercent = (value) => value == null ? '—' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;

  // The hash is the shareable state for filters, selected tab, and open protocol.
  function readRoute() {
    const params = new URLSearchParams(location.hash.slice(1));
    view.query = params.get('q') || '';
    view.category = params.get('category') || '';
    view.chain = params.get('chain') || '';
    view.watchOnly = params.get('wl') === '1';
    view.tab = params.get('tab') === 'live' ? 'live' : 'board';
    view.protocol = params.get('p') || '';
  }

  function writeRoute() {
    const params = new URLSearchParams();
    if (view.query) params.set('q', view.query);
    if (view.category) params.set('category', view.category);
    if (view.chain) params.set('chain', view.chain);
    if (view.watchOnly) params.set('wl', '1');
    if (view.tab === 'live') params.set('tab', 'live');
    if (view.protocol) params.set('p', view.protocol);
    const hash = params.toString();
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  }

  function populateFilters() {
    const categories = [...new Set(board.map((row) => row.category || 'Uncategorised'))].sort();
    const chains = [...new Set(board.flatMap((row) => row.chains || []))].sort();
    byId('category').innerHTML = '<option value="">All categories</option>' + categories.map((item) => `<option>${escapeHtml(item)}</option>`).join('');
    byId('chain').innerHTML = '<option value="">All chains</option>' + chains.map((item) => `<option>${escapeHtml(item)}</option>`).join('');
  }

  function paintSummary() {
    const totalTvl = board.reduce((sum, row) => sum + row.tvl_usd, 0);
    byId('model-version').textContent = dataset.model_version;
    byId('model-tag').textContent = dataset.model_version;
    byId('as-of').textContent = 'SNAPSHOT · ' + dataset.as_of;
    byId('stat-watch').textContent = `${dataset.watchlist_size} / ${dataset.watchlist_size}`;
    byId('stat-board').textContent = dataset.board_size.toLocaleString();
    byId('stat-early').textContent = dataset.early_size.toLocaleString();
    byId('stat-live').textContent = dataset.live_size.toLocaleString();
    byId('stat-tvl').textContent = formatUsd(totalTvl);
    byId('tab-board-count').textContent = dataset.board_size;
    byId('tab-live-count').textContent = dataset.live_size;
    byId('formula').textContent = `TVL × category multiple · global median ${Number(constants.global_multiple).toFixed(4)} (shrinkage weight ${constants.shrinkage_weight}) × [1 + ${constants.momentum_weight} × tanh(change ÷ ${constants.momentum_divisor})] × [${constants.maturity_floor} + ${constants.maturity_range} × min(age, ${constants.maturity_days}) ÷ ${constants.maturity_days}] × [1 + ${constants.breadth_step} × min(extra chains, 20)]`;
    byId('multiples').innerHTML = dataset.category_multiples.slice(0, 10).map((entry) => `<div class="radar-multiple"><span>${escapeHtml(entry.category || 'Uncategorised')} <small>· ${entry.live_count}</small></span><b>${Number(entry.multiple).toFixed(4)}×</b></div>`).join('');
    populateFilters();
    byId('live-count').textContent = `${live.length} token-bearing protocols`;
  }

  function syncControls() {
    byId('search').value = view.query;
    byId('category').value = view.category;
    byId('chain').value = view.chain;
    byId('watchlist').checked = view.watchOnly;
    document.querySelectorAll('.radar-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === view.tab));
    byId('board-view').classList.toggle('is-hidden', view.tab !== 'board');
    byId('live-view').classList.toggle('is-hidden', view.tab !== 'live');
  }

  function filteredBoard() {
    const needle = view.query.toLocaleLowerCase();
    return board.filter((row) =>
      (!needle || [row.name, row.slug, row.category, ...(row.chains || [])].join(' ').toLocaleLowerCase().includes(needle)) &&
      (!view.category || (row.category || 'Uncategorised') === view.category) &&
      (!view.chain || (row.chains || []).includes(view.chain)) &&
      (!view.watchOnly || row.watchlist)
    );
  }

  function compareRows(left, right) {
    let a = left[view.sort];
    let b = right[view.sort];
    if (view.sort === 'chains') {
      a = left.chains.length;
      b = right.chains.length;
    } else if (view.sort === 'name') {
      a = left.name.toLowerCase();
      b = right.name.toLowerCase();
    } else {
      a = a == null ? -Infinity : a;
      b = b == null ? -Infinity : b;
    }
    return (a < b ? -1 : a > b ? 1 : left.rank - right.rank) * view.direction;
  }

  function renderBoardRow(row, maxValue) {
    const selected = view.protocol === row.slug ? 'is-selected' : '';
    const trend = row.change_7d == null ? 'is-neutral' : row.change_7d > 0 ? 'is-positive' : row.change_7d < 0 ? 'is-negative' : 'is-neutral';
    const watchBadge = row.watchlist ? '<span class="radar-watch-badge">WATCHLIST</span>' : '';
    const chainNames = (row.chains || []).slice(0, 3).join(', ');
    const tail = row.chains.length > 3 ? '…' : '';
    const scoreWidth = Math.max(0, Math.min(100, row.score));
    const valueWidth = Math.max(2, 100 * row.implied_value_usd / maxValue);
    return `<tr data-slug="${escapeHtml(row.slug)}" class="${selected}" tabindex="0"><td class="radar-rank">${row.rank}</td><td class="radar-protocol-cell"><strong>${escapeHtml(row.name)}</strong>${watchBadge}<span class="radar-subline">${escapeHtml(row.category || 'Uncategorised')} · ${escapeHtml(chainNames)}${tail}</span></td><td class="radar-num radar-numeric">${formatUsd(row.tvl_usd)}</td><td class="radar-num radar-numeric ${trend}">${formatPercent(row.change_7d)}</td><td class="radar-num radar-numeric">${row.age_days == null ? '—' : row.age_days.toLocaleString() + 'd'}</td><td class="radar-num radar-numeric">${row.chains.length}</td><td class="radar-score-cell"><div class="radar-barline"><span class="radar-num">${row.score}</span><span class="radar-bar"><i style="width:${scoreWidth}%"></i></span></div></td><td class="radar-value-cell"><div class="radar-barline"><span class="radar-num">${formatUsd(row.implied_value_usd)}</span><span class="radar-bar"><i style="width:${valueWidth}%"></i></span></div></td></tr>`;
  }

  function renderBoard() {
    const visible = filteredBoard().sort(compareRows);
    const topValue = board[0]?.implied_value_usd || 1;
    byId('result-count').textContent = `Showing ${visible.length} of ${board.length} protocols`;
    byId('board-rows').innerHTML = visible.map((row) => renderBoardRow(row, topValue)).join('');
    document.querySelectorAll('th button[data-sort]').forEach((button) => {
      button.querySelector('i').textContent = button.dataset.sort === view.sort ? (view.direction === 1 ? '↑' : '↓') : '';
    });
    byId('detail').classList.toggle('is-hidden', !view.protocol);
    if (view.protocol) renderDetail(board.find((row) => row.slug === view.protocol));
  }

  function renderDetail(row) {
    if (!row) {
      view.protocol = '';
      writeRoute();
      byId('detail').classList.add('is-hidden');
      return;
    }

    const logSizes = board.map((item) => Math.log10(Math.max(1, item.tvl_usd)));
    const low = Math.min(...logSizes);
    const high = Math.max(...logSizes);
    const parts = {
      size: high === low ? 1 : (Math.log10(Math.max(1, row.tvl_usd)) - low) / (high - low),
      momentum: (Math.tanh((row.change_7d || 0) / constants.momentum_divisor) + 1) / 2,
      maturity: Math.min(row.age_days == null ? 365 : row.age_days, constants.maturity_days) / constants.maturity_days,
      breadth: Math.min(Math.max(row.chains.length - 1, 0), 20) / 20,
      category: Math.max(0, Math.min(1, row.category_multiple / 1.5))
    };
    const weights = { size: .34, momentum: .24, maturity: .18, breadth: .12, category: .12 };
    const score = Math.round(Object.keys(parts).reduce((sum, key) => sum + parts[key] * weights[key], 0) * 100);
    const product = row.tvl_usd * row.category_multiple * row.momentum_multiplier * row.maturity_multiplier * row.breadth_multiplier;
    const listed = row.age_days == null ? 'Unknown' : new Date(Date.parse(dataset.as_of + 'T00:00:00Z') - row.age_days * 86400000).toISOString().slice(0, 10);
    const trend = row.change_7d == null ? 'is-neutral' : row.change_7d > 0 ? 'is-positive' : row.change_7d < 0 ? 'is-negative' : 'is-neutral';
    const badge = row.watchlist ? '<span class="radar-watch-badge">WATCHLIST</span>' : '';
    const components = Object.keys(parts).map((key) => `<div class="radar-component"><span>${key[0].toUpperCase() + key.slice(1)} · ${Math.round(weights[key] * 100)}%</span><span class="radar-bar"><i style="width:${Math.max(0, Math.min(100, parts[key] * 100))}%"></i></span><b>${(parts[key] * 100).toFixed(0)}</b></div>`).join('');
    byId('detail').innerHTML = `<div class="radar-detail-head"><div><h2>${escapeHtml(row.name)} ${badge}</h2><div class="radar-detail-meta">Rank #${row.rank} · ${escapeHtml(row.category || 'Uncategorised')} · ${escapeHtml(row.chains.join(', '))}</div></div><button class="radar-close-detail" aria-label="Close detail">Close ×</button></div><div class="radar-detail-grid"><div><h3>Protocol snapshot</h3><div class="radar-detail-kpis"><div><span>Total value locked</span><b>${formatUsd(row.tvl_usd)}</b></div><div><span>7-day change</span><b class="${trend}">${formatPercent(row.change_7d)}</b></div><div><span>Age · listed date*</span><b>${row.age_days == null ? 'Unknown' : row.age_days + ' days · ' + listed}</b></div><div><span>Supported chains</span><b>${row.chains.length}</b></div></div><p class="radar-detail-meta">*Listed date inferred from snapshot age.</p><h3>Implied value calculation</h3><div class="radar-equation">${formatUsd(row.tvl_usd)} × ${row.category_multiple.toFixed(4)} × ${row.momentum_multiplier.toFixed(4)} × ${row.maturity_multiplier.toFixed(4)} × ${row.breadth_multiplier.toFixed(4)} = <strong>${formatUsd(Math.round(product))}</strong><br>Board value: ${formatUsd(row.implied_value_usd)} (rounded to whole dollars)</div></div><div><h3>Launch score · ${score}/100</h3><div class="radar-components">${components}</div></div></div><div class="radar-farm"><h3>Farm plan</h3><ol>${row.farm_steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></div>`;
    byId('detail').querySelector('.radar-close-detail').onclick = () => {
      view.protocol = '';
      writeRoute();
      renderBoard();
    };
  }

  function renderLive() {
    byId('live-rows').innerHTML = live.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><span class="radar-subline">${escapeHtml(row.symbol || '')} · ${escapeHtml(row.slug)}</span></td><td>${escapeHtml(row.category || 'Uncategorised')}</td><td>${escapeHtml((row.chains || []).join(', '))}</td><td class="radar-num radar-numeric">${formatUsd(row.tvl_usd)}</td><td class="radar-num radar-numeric" style="color:var(--radar-amber)">${formatUsd(row.mcap_usd)}</td></tr>`).join('');
  }

  function render() {
    renderBoard();
  }

  function connectEvents() {
    byId('search').addEventListener('input', (event) => { view.query = event.target.value; writeRoute(); render(); });
    byId('category').addEventListener('change', (event) => { view.category = event.target.value; writeRoute(); render(); });
    byId('chain').addEventListener('change', (event) => { view.chain = event.target.value; writeRoute(); render(); });
    byId('watchlist').addEventListener('change', (event) => { view.watchOnly = event.target.checked; writeRoute(); render(); });
    document.querySelectorAll('.radar-tab').forEach((button) => button.addEventListener('click', () => {
      view.tab = button.dataset.tab;
      writeRoute();
      syncControls();
    }));
    document.querySelectorAll('th button[data-sort]').forEach((button) => button.addEventListener('click', () => {
      if (view.sort === button.dataset.sort) view.direction *= -1;
      else { view.sort = button.dataset.sort; view.direction = button.dataset.sort === 'rank' ? 1 : -1; }
      render();
    }));
    byId('board-rows').addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-slug]');
      if (row) { view.protocol = row.dataset.slug; writeRoute(); render(); }
    });
    byId('board-rows').addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-slug]');
      if (row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        view.protocol = row.dataset.slug;
        writeRoute();
        render();
      }
    });
    addEventListener('hashchange', () => { readRoute(); syncControls(); render(); });
  }

  paintSummary();
  renderLive();
  readRoute();
  syncControls();
  connectEvents();
  render();
})();
