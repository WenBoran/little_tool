// ===== 特殊效果浮框：点一下牌出现，框里只有效果描述 =====
// 先等牌抬起的动画结束，再一次性算好位置后显示，避免先出现在别处再跳过去
const fxTip = document.createElement('div'); fxTip.id = 'fxtip'; fxTip.hidden = true; document.body.appendChild(fxTip);
let fxEl = null, fxTimer = 0, fxFollow = 0;
function placeFx() {
  if (!fxEl || !fxEl.isConnected) return hideFx();
  const r = rectOf(fxEl.querySelector('.cf') || fxEl), t = rectOf(fxTip);
  let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 10;
  if (y < 6) y = r.bottom + 8;
  fxTip.style.left = Math.max(6, Math.min(innerWidth - t.width - 6, x)) + 'px'; fxTip.style.top = y + 'px';
}
// 点一下立刻出现；牌还在弹起时，浮框每帧跟着牌走，动画停了就停（不会先出现在别处再跳过去）
function showFx(el) {
  clearTimeout(fxTimer); cancelAnimationFrame(fxFollow); fxEl = el;
  if (!el.isConnected) return hideFx();
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let o; try { o = JSON.parse(el.dataset.fx); } catch (e) { o = { b: [el.dataset.fx] }; }
  fxTip.innerHTML = (o.t ? `<div class="tt"><b>${esc(o.t)}${o.lv ? ` <i>Lv${o.lv}</i>` : ''}</b>${o.k ? `<small>${esc(o.k)}</small>` : ''}</div>` : '')
    + (o.b || []).map(t => `<div class="tb">${esc(t)}</div>`).join('')
    + (o.fx && o.fx.length ? `<div class="tf">${o.fx.map(([k, t, d]) => `${k[0] === 's' ? `<span class="stp ${k[1]}">${esc(t)}</span>` : `<span class="fxp ${k}">${esc(t)}</span>`}<span class="td">${esc(d)}</span>`).join('')}</div>` : '')
    + (o.n || []).filter(Boolean).map(t => `<div class="tn">${esc(t)}</div>`).join('');
  fxTip.style.visibility = 'hidden'; fxTip.hidden = false;   // 先隐形量尺寸
  placeFx();
  fxTip.style.visibility = ''; fxTip.classList.add('on');
  const t0 = performance.now();
  const follow = t => { if (fxEl !== el || fxTip.hidden) return; placeFx(); if (t - t0 < 420) fxFollow = requestAnimationFrame(follow); };
  fxFollow = requestAnimationFrame(follow);
}
function hideFx() { clearTimeout(fxTimer); cancelAnimationFrame(fxFollow); fxTip.hidden = true; fxTip.classList.remove('on'); fxEl = null; }
// 点击之后再判断：手牌重绘会替换元素，所以按 uid 找回当前那张牌
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-fx]');
  if (!el) { hideFx(); return; }
  if (e.target.closest('button.buy')) return;                 // 点的是购买按钮，不弹效果
  if (el.classList.contains('hslot')) return;             // 商店伙计由 u9 处理
  const uid = el.dataset.uid;
  requestAnimationFrame(() => {
    const inPlay = el.closest('#hand, #slots');   // 手牌重绘会替换元素，按 uid 找回；商店、牌组窗口里的牌直接用
    const cur = inPlay ? document.querySelector(`#hand .card[data-uid="${uid}"], #slots .card[data-uid="${uid}"]`) : el;
    if (!cur || !cur.dataset.fx) { hideFx(); return; }
    if (cur.closest('#hand') && !cur.classList.contains('sel')) { hideFx(); return; }   // 取消选中就收起
    if (!inPlay && fxEl === cur && !fxTip.hidden) { hideFx(); return; }   // 商店、包里的牌：再点一下收起
    showFx(cur);
  });
});
addEventListener('scroll', hideFx, true);
addEventListener('resize', hideFx);

// ===== 牌组窗口：游戏中和商店共用同一套样式 =====
// 每张牌显示卡面（分数、图案、印记）+ 功能 + 印记效果；同样的牌合并计数
function funcText(k) {
  const d = CARD_DEFS[k];
  if (d.type === 'tech') return `加工 ${capOf({ key: k, def: d })} 份`;
  if (d.type === 'ing') return d.veg ? '蔬菜' : d.meat ? '荤菜' : '';
  return d.desc.replace('\n', '，');
}
function deckGrid(list, pickable) {
  const html = ['ing', 'tech', 'spice', 'equip'].map(t => {
    const cs = list.filter(e => CARD_DEFS[e.key].type === t)
      .sort((a, b) => a.key.localeCompare(b.key) || (a.stamp || '').localeCompare(b.stamp || ''));
    if (!cs.length) return '';
    return `<div class="pv-g"><div class="pv-t ${t}">${TYPE_NAME[t]} ${cs.length}</div><div class="fan">${cs.map(e => {
      const ok = pickable && pickable(e), c = { uid: 0, key: e.key, def: CARD_DEFS[e.key], stamp: e.stamp };
      const el = cardEl(c); el.dataset.i = e.i == null ? '' : e.i; if (pickable) { el.classList.add('pick'); if (!ok) el.classList.add('off'); }
      return el.outerHTML;
    }).join('')}</div></div>`;
  }).join('');
  return html || '<div class="sub" style="padding:30px 0">这里是空的</div>';
}
// 把每一排牌按宽度排开，放不下就压叠（和手牌一样）
function layoutFans() {
  const flow = PHONE();
  document.querySelectorAll('#dkList .fan').forEach(f => {
    f.classList.toggle('flow', flow);
    if (flow) { [...f.children].forEach(c => { c.style.left = ''; }); return; }
    const cards = [...f.children], W = f.clientWidth || 600, cw = cards[0] ? cards[0].offsetWidth : 72;
    const { xs } = spread(cards.length, cw, W, 8);
    const sh = xs.length ? -xs[0] : 0;   // 靠左排
    cards.forEach((c, i) => { c.style.left = (xs[i] + sh) + 'px'; c.style.zIndex = i + 1; });
  });
}
function deckSheet(o) {
  sheet(`<h1>牌组</h1>
    <div class="tabs">${o.tabs.map(t => `<button class="tab ${t.k === o.tab ? 'on' : ''}" data-t="${t.k}" ${t.off ? 'disabled' : ''}>${t.name}${t.n != null ? ` <b>${t.n}</b>` : ''}</button>`).join('')}</div>
    ${o.sub ? `<div class="sub" style="font-size:15px">${o.sub}</div>` : ''}
    <div class="pv" id="dkList"></div>
    <div class="btns"><button class="pill" id="go">${o.back}</button></div>`);
  document.querySelectorAll('#sheet .tabs .tab').forEach(b => b.onclick = () => o.onTab(b.dataset.t));
}
const deckEntries = () => G.deck.map((k, i) => ({ key: k, stamp: G.stamps[i], i }));
function showPiles(tab = 'pile') {
  if (busy || G.phase !== 'play') return;
  const lists = { pile: G.pile.map(c => ({ key: c.key, stamp: c.stamp })), dis: G.discard.map(c => ({ key: c.key, stamp: c.stamp })), deck: deckEntries() };
  const SUB = { pile: '还没摸到的牌', dis: '这回合弃掉的牌', deck: '' };
  deckSheet({ tab, sub: SUB[tab], back: `${icon('flame')}回到灶台`, onTab: showPiles,
    tabs: [{ k: 'pile', name: '牌堆', n: lists.pile.length }, { k: 'dis', name: '弃牌堆', n: lists.dis.length }, { k: 'deck', name: '整副牌组', n: lists.deck.length }] });
  $('#dkList').innerHTML = deckGrid(lists[tab]); layoutFans();
  $('#go').onclick = closeSheet;
}
$('#pile').addEventListener('click', () => showPiles('pile'));
$('#dis').addEventListener('click', () => showPiles('dis'));
['pile', 'dis'].forEach(id => { const el = $('#' + id); el.tabIndex = 0; el.setAttribute('role', 'button');
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPiles(id); } }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#veil').hidden && $('#sheet .tabs')) closeSheet(); });
$('#veil').addEventListener('click', e => { if (e.target.id === 'veil' && $('#sheet .tabs')) closeSheet(); });
addEventListener('resize', () => { if (document.querySelector('#dkList .fan')) layoutFans(); });

// ===== 禁止整页拖动：只有窗口里本来就能滚的列表（牌组、说明、菜谱水牌）可以滑 =====
function canScroll(el, dx, dy) {
  for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (Math.abs(dy) >= Math.abs(dx) && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
    }
    if (Math.abs(dx) > Math.abs(dy) && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      if ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)) return true;
    }
  }
  return false;
}
let touch0 = null;
document.addEventListener('touchstart', e => { const t = e.touches[0]; touch0 = t ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) { e.preventDefault(); return; }   // 双指缩放
  const t = e.touches[0]; if (!t || !touch0) return;
  const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
  if (!canScroll(e.target, dx, dy)) e.preventDefault();          // 列表滚到头、或不在列表里：不让整页跟着动
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
