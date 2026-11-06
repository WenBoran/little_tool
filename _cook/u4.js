// ===== 灶台、手牌、按钮 =====
function renderStove(p) {
  const st = $('#stove');
  $('#equips').innerHTML = p.eqs.map(c => `<span class="chipx e new">${icon(c.key)}+${c.def.slots}</span>`).join('');
  $('#spices').innerHTML = p.sps.map(c => `<span class="chipx s" data-k="${c.key}">${icon(c.key)}${c.def.short}</span>`).join('');
  const nFood = p.food.length, cap = p.cap;
  const box = $('#slots'), W = widthOf(box), cw = CW(), flow = PHONE();
  box.classList.toggle('flow', flow);
  const list = p.over || p.why === 'ban' ? p.food : p.slots;
  const n = Math.max(cap, list.length), { xs } = spread(n, cw, W, 14);
  const old = new Map([...box.querySelectorAll('.card')].map(e => [e.dataset.uid, e]));
  box.querySelectorAll('.hole').forEach(h => h.remove());
  for (let i = list.length; i < n; i++) { const h = document.createElement('div'); h.className = 'hole'; h.style.left = flow ? '' : xs[i] + 'px'; box.appendChild(h); }
  list.forEach((c, i) => {
    let el = old.get(String(c.uid));
    if (!el) { el = cardEl(c, 'ghost'); el.style.left = flow ? '' : xs[i] + 'px'; box.appendChild(el); ani(el.querySelector('.cf'), [{ transform: 'translateY(60px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' }); }
    old.delete(String(c.uid));
    el.classList.remove('lit', 'spare', 'ban'); el.style.left = flow ? '' : xs[i] + 'px'; el.style.zIndex = i + 1;
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    if (banned(G, c)) el.classList.add('ban');
  });
  old.forEach(e => e.remove());
  // 出锅后不会用掉的牌：右上角紫色小牌子（回 = 回弃牌堆或牌组，→ = 变成别的牌，鲜/香/金 = 盖印记）
  const fa = p.playable && !anim ? fatesOf(G, p) : null, fm = new Map(fa ? fa.cards.map(f => [f.c.uid, f]) : []);
  box.querySelectorAll('.card').forEach(el => {
    const f = fm.get(+el.dataset.uid); let b = el.querySelector('.fate');
    if (!f || f.to === 'gone') { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('b'); b.className = 'fate'; el.appendChild(b); }
    b.textContent = fateShort(f);
  });
  st.classList.toggle('hot', !!(p.playable && p.ev.valid && !p.ev.spoiled));
  st.classList.toggle('roar', !!(p.playable && p.ev.valid && p.ev.total >= (G.target - G.score)));
  const W2 = { over: '槽位不够', ban: `${G.boss ? G.boss.rule : ''}`, short: `${G.boss ? G.boss.rule : ''}`, noing: '缺原料' };
  $('#warn').innerHTML = p.why ? `${p.why === 'ban' ? icon('ban') : ''}${W2[p.why]}` : '';
}
// 加工连线：原料底部 → 手法底部的弧线。位置按牌的目标位置（style.left）算，不读动画中途的位置，
// 所以牌还在滑动时画出来的线也在最终位置上。跨得越远弧越深，同一份原料连好几个手法时不会叠在一起。
// 触发了菜谱的线是亮橙色带光，没触发的是淡色虚线；只有新出现的线播放“画出来”的动画
let linkKeys = new Set();
function renderLinks(p) {
  const svg = $('#links');
  if (!p || p.why || !p.ev.valid) { svg.innerHTML = ''; linkKeys = new Set(); return; }
  const ev = p.ev, box = $('#slots');
  const elOf = uid => box.querySelector(`.card[data-uid="${uid}"]`);
  const pos = uid => { const el = elOf(uid); if (!el) return null; const L = el.style.left ? parseFloat(el.style.left) : el.offsetLeft; return { x: L + el.offsetWidth / 2, y: el.offsetHeight }; };
  const room = Math.max(14, $('#pot').offsetHeight - box.offsetHeight - 4);   // 牌下面能画弧的高度
  const hitUids = new Set([].concat.apply([], ev.lines.map(l => l.uids)));
  const order = new Map(p.slots.map((c, i) => [c.uid, i]));
  const used = new Set(), keys = new Set(); let back = '', front = '', dots = '';
  ev.dishes.forEach(d => {
    const t = pos(d.tech.uid); if (!t) return;
    if (!d.ings.length) { back += `<path class="bad" d="M${t.x - 22} ${t.y + 10} H${t.x + 22}"/>`; return; }
    const hit = ev.lines.some(l => l.uids.includes(d.tech.uid)), ti = order.get(d.tech.uid);
    d.ings.forEach(c => {
      used.add(c.uid); const q = pos(c.uid); if (!q) return;
      const span = Math.abs(ti - order.get(c.uid)), dep = Math.min(room, 8 + span * 7);
      const k = `${c.uid}-${d.tech.uid}`, isNew = !linkKeys.has(k); keys.add(k);
      const dd = `M${q.x} ${q.y + 2} C${q.x} ${q.y + dep * 1.3} ${t.x} ${t.y + dep * 1.3} ${t.x} ${t.y + 2}`;
      back += `<path class="sh" d="${dd}"/>`;
      front += `<path class="${hit ? 'hit' : 'raw'}${isNew ? ' new' : ''}" pathLength="1" d="${dd}"/>`;
      dots += `<circle class="${hit ? 'hit' : 'raw'}" cx="${q.x}" cy="${q.y + 2}" r="3"/>`;
    });
    dots += `<circle class="end ${hit ? 'hit' : 'raw'}" cx="${t.x}" cy="${t.y + 2}" r="5"/>`;
  });
  linkKeys = keys;
  hitUids.forEach(u => { const el = elOf(u); if (el) el.classList.add('lit'); });
  p.slots.forEach(c => { if (c.def.type === 'ing' && !used.has(c.uid)) { const el = elOf(c.uid); if (el) el.classList.add('spare'); } });
  svg.innerHTML = back + front + dots;
}

// 手牌：排序后排成扇形，中间高、两边低、越往外转得越多。
// 选中或正在看（鼠标悬停 / 手指按住）的牌：右边的牌往外让出位置，这张牌沿自己的倾斜方向弹出；叠放顺序不变
let prevHand = new Set(), peek = null, press = null, handLay = null;
function sortedHand() {
  const h = G.hand.slice();
  if (sortMode === 'type') h.sort((a, b) => TYPE_ORDER[a.def.type] - TYPE_ORDER[b.def.type] || a.key.localeCompare(b.key) || a.uid - b.uid);
  else h.sort((a, b) => (b.def.base || 0) - (a.def.base || 0) || TYPE_ORDER[a.def.type] - TYPE_ORDER[b.def.type] || a.uid - b.uid);
  return h;
}
// 算每张牌的位置：focus 里的牌右侧留出大半张牌宽，其余的牌平分剩下的宽度
function fanLayout(n, focus, W, cw, pad = 24) {
  const avail = W - pad * 2;
  if (n <= 0) return { xs: [], step: 0 };
  const base = n === 1 ? 0 : Math.min(cw + 8, (avail - cw) / (n - 1));
  const steps = Array.from({ length: Math.max(0, n - 1) }, () => base);
  const F = focus.filter(i => i < n - 1), want = Math.min(cw + 8, cw * .8);
  if (F.length && want > base) {
    // 其余的牌至少留出左边一条（约 1/3 张），露出竖排的点数和牌名
    const rest = n - 1 - F.length, room = avail - cw, minS = Math.min(base, Math.max(cw * .4, base * .7));
    let big = want, small = rest ? (room - big * F.length) / rest : base;
    if (rest && small < minS) { small = minS; big = Math.max(base, (room - small * rest) / F.length); }
    steps.forEach((s, i) => { steps[i] = F.includes(i) ? big : Math.min(base, small); });
  }
  // 总宽不能超过可用宽度：选的牌多了（比如除最后一张都选中），让位的间距按比例收回，两头的牌不会被挤出屏幕
  const sum = steps.reduce((s, v) => s + v, 0), room = Math.max(0, avail - cw);
  if (n > 1 && sum > room) {
    const extra = sum - room, give = steps.map(v => Math.max(0, v - Math.min(v, base))), gs = give.reduce((s, v) => s + v, 0);
    if (gs >= extra) steps.forEach((v, i) => { steps[i] = v - give[i] * extra / gs; });
    else steps.forEach((v, i) => { steps[i] = v * room / sum; });
  }
  const total = cw + steps.reduce((s, v) => s + v, 0), xs = [pad + (avail - total) / 2];
  steps.forEach(s => xs.push(xs[xs.length - 1] + s));
  return { xs, step: base };
}
function applyHand() {
  const box = $('#hand'), els = [...box.children], n = els.length, cw = CW(), W = widthOf(box);
  const uids = els.map(e => +e.dataset.uid);
  const focus = uids.map((u, i) => (sel.includes(u) || u === peek) ? i : -1).filter(i => i >= 0);
  const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch')) || 146;
  const A = n > 1 ? Math.min(12, n * 1.4) : 0, k = n > 2 ? Math.min(ch * .13, n * 1.6) : 0;   // 最外侧转 A 度；中间比两边高 k
  const pad = Math.max(4, Math.ceil(1.2 * ch * Math.sin(A * Math.PI / 180)) - 4);   // 两边的牌转出去的角不能出界（可以压进页边留白一点）
  const { xs, step } = fanLayout(n, focus, W, cw, pad);
  els.forEach((el, i) => {
    const o = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
    el.style.left = xs[i] + 'px'; el.style.zIndex = i + 1;
    el.style.transform = `translateY(${((o * o - 1) * k).toFixed(1)}px) rotate(${(o * A).toFixed(2)}deg)`;
    el.classList.toggle('peek', uids[i] === peek);
  });
  handLay = { uids, xs, cw };
  box.classList.toggle('tight', step < cw * 0.6);
}
// 按目标布局找手指 / 鼠标下面的牌（不按动画中途的位置找，避免来回跳）
function handHit(e) {
  if (!handLay) return null;
  const r = rectOf($('#hand')), x = e.clientX - r.left;
  if (e.clientY < r.top - 70 || e.clientY > r.bottom) return null;
  for (let i = handLay.uids.length - 1; i >= 0; i--) if (x >= handLay.xs[i] && x <= handLay.xs[i] + handLay.cw) return handLay.uids[i];
  return null;
}
function setPeek(u) {
  if (u === peek) return;
  const fx = fxEl && fxEl.isConnected && fxEl.closest('#hand') ? fxEl : null, x0 = fx && fx.style.left;
  peek = u; applyHand();
  if (fx && fx.style.left !== x0) showFx(fx);   // 浮框跟着那张牌一起挪
}
function renderHand() {
  const box = $('#hand');
  box.classList.remove('flow');
  const cards = sortedHand(), old = new Map([...box.children].map(e => [e.dataset.uid, e]));
  const pileX = center($('#pile')).x - rectOf(box).left, guess = fanLayout(cards.length, [], widthOf(box), CW()).xs;
  if (peek != null && !cards.some(c => c.uid === peek)) peek = null;
  let k = 0;
  cards.forEach((c, i) => {
    let el = old.get(String(c.uid));
    if (!el) {
      el = cardEl(c, 'enter'); el.tabIndex = 0; el.setAttribute('role', 'button');
      el.style.setProperty('--fromX', (guess[i] - pileX + 40) + 'px'); el.style.animationDelay = (k++ * 70) + 'ms';
      el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      box.appendChild(el);
    }
    old.delete(String(c.uid));
    const on = sel.includes(c.uid);
    el.classList.toggle('sel', on); el.setAttribute('aria-pressed', on);
    el.classList.toggle('ban', banned(G, c));
    if (banned(G, c) && !el.querySelector('.ban-ic')) el.insertAdjacentHTML('beforeend', `<span class="ban-ic">${icon('ban')}</span>`);
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
  });
  old.forEach(e => e.remove());
  applyHand();
  if (k && !REDUCED) setTimeout(() => sfxDeal(k), 0);
  prevHand = new Set(G.hand.map(c => c.uid));
  $('#pile b').textContent = G.pile.length; $('#pile').classList.toggle('empty', G.pile.length < 3);
  $('#dis b').textContent = G.discard.length;
}
function renderActs(p) {
  const pb = $('#playBtn'), db = $('#discBtn');
  pb.querySelector('.ico').innerHTML = icon('flame'); db.querySelector('.ico').innerHTML = icon('toss');
  pb.disabled = busy || !p.playable;
  pb.classList.toggle('ready', !pb.disabled);
  db.disabled = busy || !sel.length || G.discardsLeft <= 0;
}
function render() {
  sel = sel.filter(u => G.hand.some(c => c.uid === u));
  const p = previewSel(G, sel);
  renderTicket(p); renderStove(p); renderHand(); renderActs(p); renderRules(p.why ? null : p.ev);
  Music.heat(G.phase === 'play' && (G.playsLeft === 1 || G.score >= G.target * .7));
  requestAnimationFrame(() => renderLinks(p));
  return p;
}

// ===== 交互 =====
function toggle(uid) {
  if (busy || G.phase !== 'play') return;
  const c = G.hand.find(c => c.uid === uid);
  if (c && banned(G, c) && !sel.includes(uid)) toast(`${G.boss.name}：${G.boss.rule}`);   // 可以选来弃掉，但不能打出
  const i = sel.indexOf(uid); if (i >= 0) sel.splice(i, 1); else sel.push(uid);
  sfxTick(i < 0);
  render();
}
$('#hand').addEventListener('click', e => {
  if (press && press.held) { press = null; return; }   // 按住看牌后松手，不算点选
  press = null;
  const el = e.target.closest('.card'); if (el) toggle(+el.dataset.uid);
});
// 鼠标悬停：这张牌往外弹一点，右边的牌让开
$('#hand').addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { if (!busy) setPeek(handHit(e)); return; }
  if (press && press.held) { e.preventDefault(); const u = handHit(e); if (u != null) setPeek(u); }   // 按住后左右滑动换着看
});
$('#hand').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') setPeek(null); });
// 手指按住 0.25 秒：同样弹出来看；松手收回
$('#hand').addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || busy) return;
  const u = handHit(e); if (u == null) return;
  press = { held: false, t: setTimeout(() => { if (press) { press.held = true; setPeek(u); } }, 250) };
});
const endPress = () => { if (!press) return; clearTimeout(press.t); if (press.held) setPeek(null); else press = null; };
['pointerup', 'pointercancel'].forEach(t => $('#hand').addEventListener(t, endPress));
$('#slots').addEventListener('click', e => { const el = e.target.closest('.card'); if (el && !busy) toggle(+el.dataset.uid); });
document.addEventListener('keydown', e => {
  if (!$('#veil').hidden || busy) return;
  const el = e.target.closest && e.target.closest('#hand .card');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(+el.dataset.uid); }
  else if (e.key === 'p' || e.key === 'P') $('#playBtn').click();
  else if (e.key === 'd' || e.key === 'D') $('#discBtn').click();
  else if (e.key === 'Escape') { sel = []; render(); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (G && !busy) render(); }, 80); });
