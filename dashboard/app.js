(()=>{'use strict';
  const D=window.RADAR;
  if(!D)throw Error('Radar dataset is missing');
  const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=D.rows, live=D.live_rows||D.live||[], C=D.model_constants;
  const usd=n=>{if(n==null||!Number.isFinite(+n))return '—';
    let x=+n,a=Math.abs(x);
    if(a>=1e12)return '$'+(x/1e12).toFixed(2)+'T';
    if(a>=1e9)return '$'+(x/1e9).toFixed(2)+'B';
    if(a>=1e6)return '$'+(x/1e6).toFixed(2)+'M';
    if(a>=1e3)return '$'+(x/1e3).toFixed(1)+'K';
    return '$'+Math.round(x).toLocaleString()};
  const pct=n=>n==null?'—':`${n>0?'+':''}${Number(n).toFixed(1)}%`;
  const state={q:'',category:'',chain:'',wl:false,tab:'board',p:'',sort:'rank',dir:1};
  function getHash(){const x=new URLSearchParams(location.hash.slice(1));
    state.q=x.get('q')||'';
    state.category=x.get('category')||'';
    state.chain=x.get('chain')||'';
    state.wl=x.get('wl')==='1';
    state.tab=x.get('tab')==='live'?'live':'board';
    state.p=x.get('p')||''}
  function putHash(){const x=new URLSearchParams;
    if(state.q)x.set('q',state.q);
    if(state.category)x.set('category',state.category);
    if(state.chain)x.set('chain',state.chain);
    if(state.wl)x.set('wl','1');
    if(state.tab==='live')x.set('tab','live');
    if(state.p)x.set('p',state.p);
    const h=x.toString();
    history.replaceState(null,'',h?'#'+h:location.pathname+location.search)}
  function fillOptions(){const cats=[...new Set(rows.map(r=>r.category||'Uncategorised'))].sort(),chains=[...new Set(rows.flatMap(r=>r.chains||[]))].sort();
    $('#category').innerHTML='<option value="">All categories</option>'+cats.map(x=>`<option>${esc(x)}</option>`).join('');
    $('#chain').innerHTML='<option value="">All chains</option>'+chains.map(x=>`<option>${esc(x)}</option>`).join('')}
  function init(){const boardT=rows.reduce((a,r)=>a+r.tvl_usd,0);
    $('#model-version').textContent=D.model_version;
    $('#model-tag').textContent=D.model_version;
    $('#as-of').textContent='SNAPSHOT · '+D.as_of;
    $('#stat-watch').textContent=`${D.watchlist_size} / ${D.watchlist_size}`;
    $('#stat-board').textContent=D.board_size.toLocaleString();
    $('#stat-early').textContent=D.early_size.toLocaleString();
    $('#stat-live').textContent=D.live_size.toLocaleString();
    $('#stat-tvl').textContent=usd(boardT);
    $('#tab-board-count').textContent=D.board_size;
    $('#tab-live-count').textContent=D.live_size;
    $('#formula').textContent=`TVL × category multiple · global median ${Number(C.global_multiple).toFixed(4)} (shrinkage weight ${C.shrinkage_weight}) × [1 + ${C.momentum_weight} × tanh(change ÷ ${C.momentum_divisor})] × [${C.maturity_floor} + ${C.maturity_range} × min(age, ${C.maturity_days}) ÷ ${C.maturity_days}] × [1 + ${C.breadth_step} × min(extra chains, 20)]`;
    $('#multiples').innerHTML=D.category_multiples.slice(0,10).map(x=>`<div class="multiple"><span>${esc(x.category||'Uncategorised')} <small>· ${x.live_count}</small></span><b>${Number(x.multiple).toFixed(4)}×</b></div>`).join('');
    fillOptions();
    $('#live-count').textContent=`${live.length} token-bearing protocols`;
    renderLive();
    getHash();
    syncControls();
    render()}
  function syncControls(){$('#search').value=state.q;
    $('#category').value=state.category;
    $('#chain').value=state.chain;
    $('#watchlist').checked=state.wl;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
    $('#board-view').classList.toggle('hidden',state.tab!=='board');
    $('#live-view').classList.toggle('hidden',state.tab!=='live')}
  function filtered(){const q=state.q.toLocaleLowerCase();
    return rows.filter(r=>(!q||[r.name,r.slug,r.category,...(r.chains||[])].join(' ').toLocaleLowerCase().includes(q))&&(!state.category||(r.category||'Uncategorised')===state.category)&&(!state.chain||(r.chains||[]).includes(state.chain))&&(!state.wl||r.watchlist))}
  function render(){const items=filtered();
    items.sort((a,b)=>{let x=a[state.sort],y=b[state.sort];if(state.sort==='chains'){x=a.chains.length;y=b.chains.length}else if(state.sort==='name'){x=a.name.toLowerCase();y=b.name.toLowerCase()}else{x=x==null?-Infinity:x;y=y==null?-Infinity:y}return (x<y?-1:x>y?1:a.rank-b.rank)*state.dir});
    const max=rows[0]?.implied_value_usd||1;
    $('#result-count').textContent=`Showing ${items.length} of ${rows.length} protocols`;
    $('#board-rows').innerHTML=items.map(r=>`<tr data-slug="${esc(r.slug)}" class="${state.p===r.slug?'selected':''}" tabindex="0"><td class="rank">${r.rank}</td><td class="protocol-cell"><strong>${esc(r.name)}</strong>${r.watchlist?'<span class="watch-badge">WATCHLIST</span>':''}<span class="subline">${esc(r.category||'Uncategorised')} · ${esc((r.chains||[]).slice(0,3).join(', '))}${r.chains.length>3?'…':''}</span></td><td class="num numeric">${usd(r.tvl_usd)}</td><td class="num numeric ${r.change_7d==null?'neutral':r.change_7d>0?'positive':r.change_7d<0?'negative':'neutral'}">${pct(r.change_7d)}</td><td class="num numeric">${r.age_days==null?'—':r.age_days.toLocaleString()+'d'}</td><td class="num numeric">${r.chains.length}</td><td class="score-cell"><div class="barline"><span class="num">${r.score}</span><span class="bar"><i style="width:${Math.max(0,Math.min(100,r.score))}%"></i></span></div></td><td class="value-cell"><div class="barline"><span class="num">${usd(r.implied_value_usd)}</span><span class="bar"><i style="width:${Math.max(2,100*r.implied_value_usd/max)}%"></i></span></div></td></tr>`).join('');
    document.querySelectorAll('th button[data-sort]').forEach(b=>b.querySelector('i').textContent=b.dataset.sort===state.sort?(state.dir===1?'↑':'↓'):'');
    $('#detail').classList.toggle('hidden',!state.p);
    if(state.p)renderDetail(rows.find(r=>r.slug===state.p))}
  function renderDetail(r){if(!r){state.p='';
      putHash();
      $('#detail').classList.add('hidden');
      return}const counts=rows.map(x=>Math.log10(Math.max(1,x.tvl_usd))),lo=Math.min(...counts),hi=Math.max(...counts),size=hi===lo?1:(Math.log10(Math.max(1,r.tvl_usd))-lo)/(hi-lo),age=Math.min(r.age_days==null?365:r.age_days,C.maturity_days),parts={size,momentum:(Math.tanh((r.change_7d||0)/C.momentum_divisor)+1)/2,maturity:age/C.maturity_days,breadth:Math.min(Math.max(r.chains.length-1,0),20)/20,category:Math.max(0,Math.min(1,r.category_multiple/1.5))},weights={size:.34,momentum:.24,maturity:.18,breadth:.12,category:.12},recalc=Math.round(Object.keys(parts).reduce((a,k)=>a+parts[k]*weights[k],0)*100),m=r,prod=m.tvl_usd*m.category_multiple*m.momentum_multiplier*m.maturity_multiplier*m.breadth_multiplier,listed=m.age_days==null?'Unknown':new Date(Date.parse(D.as_of+'T00:00:00Z')-m.age_days*86400000).toISOString().slice(0,10),sign=r.change_7d==null?'neutral':r.change_7d>0?'positive':r.change_7d<0?'negative':'neutral';
    $('#detail').innerHTML=`<div class="detail-head"><div><h2>${esc(r.name)} ${r.watchlist?'<span class="watch-badge">WATCHLIST</span>':''}</h2><div class="detail-meta">Rank #${r.rank} · ${esc(r.category||'Uncategorised')} · ${esc(r.chains.join(', '))}</div></div><button class="close-detail" aria-label="Close detail">Close ×</button></div><div class="detail-grid"><div><h3>Protocol snapshot</h3><div class="detail-kpis"><div><span>Total value locked</span><b>${usd(r.tvl_usd)}</b></div><div><span>7-day change</span><b class="${sign}">${pct(r.change_7d)}</b></div><div><span>Age · listed date*</span><b>${r.age_days==null?'Unknown':r.age_days+' days · '+listed}</b></div><div><span>Supported chains</span><b>${r.chains.length}</b></div></div><p class="detail-meta">*Listed date inferred from snapshot age.</p><h3>Implied value calculation</h3><div class="equation">${usd(r.tvl_usd)} × ${r.category_multiple.toFixed(4)} × ${r.momentum_multiplier.toFixed(4)} × ${r.maturity_multiplier.toFixed(4)} × ${r.breadth_multiplier.toFixed(4)} = <strong>${usd(Math.round(prod))}</strong><br>Board value: ${usd(r.implied_value_usd)} (rounded to whole dollars)</div></div><div><h3>Launch score · ${recalc}/100</h3><div class="components">${Object.keys(parts).map(k=>`<div class="component"><span>${k[0].toUpperCase()+k.slice(1)} · ${Math.round(weights[k]*100)}%</span><span class="bar"><i style="width:${Math.max(0,Math.min(100,parts[k]*100))}%"></i></span><b>${(parts[k]*100).toFixed(0)}</b></div>`).join('')}</div></div></div><div class="farm"><h3>Farm plan</h3><ol>${r.farm_steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></div>`;
    $('#detail').querySelector('.close-detail').onclick=()=>{state.p='';
      putHash();
      render()}}
  function renderLive(){const items=live;
    $('#live-rows').innerHTML=items.map(r=>`<tr><td><strong>${esc(r.name)}</strong><span class="subline">${esc(r.symbol||'')} · ${esc(r.slug)}</span></td><td>${esc(r.category||'Uncategorised')}</td><td>${esc((r.chains||[]).join(', '))}</td><td class="num numeric">${usd(r.tvl_usd)}</td><td class="num numeric" style="color:var(--amber)">${usd(r.mcap_usd)}</td></tr>`).join('')}
  $('#search').addEventListener('input',e=>{state.q=e.target.value;putHash();render()});
  $('#category').addEventListener('change',e=>{state.category=e.target.value;putHash();render()});
  $('#chain').addEventListener('change',e=>{state.chain=e.target.value;putHash();render()});
  $('#watchlist').addEventListener('change',e=>{state.wl=e.target.checked;putHash();render()});
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;putHash();syncControls()}));
  document.querySelectorAll('th button[data-sort]').forEach(b=>b.addEventListener('click',()=>{if(state.sort===b.dataset.sort)state.dir*=-1;else{state.sort=b.dataset.sort;state.dir=b.dataset.sort==='rank'?1:-1}render()}));
  $('#board-rows').addEventListener('click',e=>{const tr=e.target.closest('tr[data-slug]');if(tr){state.p=tr.dataset.slug;putHash();render()}});
  $('#board-rows').addEventListener('keydown',e=>{const tr=e.target.closest('tr[data-slug]');if(tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault();state.p=tr.dataset.slug;putHash();render()}});
  addEventListener('hashchange',()=>{getHash();syncControls();render()});
  init();
})();
