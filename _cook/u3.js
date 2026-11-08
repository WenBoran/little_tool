// ===== 界面：通用工具、卡面、小票、菜谱 =====
const $ = s => document.querySelector(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, REDUCED ? 0 : ms));
ICONS.sort = '<path d="M9 13h30M9 24h20M9 35h10"/><path d="M36 26v13M31 34l5 5 5-5"/>';
const TYPE_ORDER = { ing: 0, tech: 1, spice: 2, equip: 3 };
const TYPE_NAME = { ing: '原料', tech: '手法', equip: '装备', spice: '调料' };
let G, sel = [], busy = false, seenHelp = false, sortMode = 'type', anim = null;
let shown = { score: 0, coins: 0 };

function capOf(c, equipped) {
  const eq = (equipped || (G ? G.equipped : [])).map(k => CARD_DEFS[k]);
  return techCap(c.key, eq, G && G.capUp, G && G.helpers);
}
// ===== 卡片说明（点一下弹出的浮框）统一格式 =====
// { t 名字, k 类型, lv 等级, b [正常描述], fx [[颜色, 标签, 这个标签是什么意思]], n [备注] }
// 显示成：标题行（名字 + 右侧灰色类型）→ 正常描述 → 虚线下每行「标签 + 小号灰字解释」→ 最小号备注
const tipAttr = o => JSON.stringify(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const pairTags = (tags, desc) => { const ls = String(desc || '').split('\n'); return (tags || []).map(([k, t], i) => [k, t, ls[Math.min(i, ls.length - 1)]]); };
const stampRow = s => { const st = STAMPS[s]; return ['s' + st.cls, st.name, `「${st.name}」印记：${st.desc}`]; };   // k 以 s 开头 = 印记方块
function cardTip(c) {
  const d = c.def, o = { t: d.name, k: TYPE_NAME[d.type], b: [], fx: [] };
  if (d.tag) o.fx = pairTags(d.tag, d.desc);
  if (d.type === 'tech') o.b.push(`加工左边 ${capOf(c)} 份原料`);
  if (c.plus) o.fx.push(['c', '+' + c.plus, `烤过 ${c.plus} 次，牌面分永久 +${c.plus}`]);
  if (c.stamp) o.fx.push(stampRow(c.stamp));
  return o;
}
// 伙计只显示效果正文，不显示配对标签。
const helperTip = (k, note) => { const h = HELPER_BY[k]; return { t: h.name, k: '伙计', b: [h.desc], fx: [], n: note ? [note] : [] }; };
const recipeTip = (r, lv, note) => ({ t: r.name, k: '菜谱', lv: lv > 1 ? lv : 0, b: [recipeCond(r)], fx: fxParts(fxOf(r, lv)).map(x => [x.k, x.t, x.l]), n: note ? [note] : [] });
// 卡面：所有地方（手牌、灶台、牌组、商店、包）同一个样子。
// 左边一列：分数、加工份数/荤素标记、竖排牌名（牌压叠时也露得出来）；右边：图案；左下：印记
function cardInner(c) {
  const d = c.def; let pt, mk = '';
  if (d.type === 'ing' || d.type === 'tech') pt = `<span class="pt">${d.base + (c.plus || 0)}</span>`;   // 烤过的原料显示加过的分
  else if (d.type === 'equip') pt = `<span class="pt">+${d.slots}</span>`;
  else pt = `<span class="pt">${icon('spark')}</span>`;
  if (d.type === 'tech') mk = '<i></i>'.repeat(capOf(c));
  if (d.type === 'ing' && (d.veg || d.meat)) mk = `<span class="lf">${icon(d.veg ? 'leaf' : 'meat')}</span>`;
  const tg = d.tag ? `<div class="tgs">${d.tag.map(([k, t]) => `<span class="fxp ${k}">${t}</span>`).join('')}</div>` : '';
  return `<div class="cf${tg ? ' has-tg' : ''}">${tg}<div class="idx">${pt}${mk ? `<span class="mk">${mk}</span>` : ''}<span class="vn${d.name.length > 2 ? ' l' : ''}">${d.name}</span></div>
    <div class="plate"><div class="art">${icon(d.icon || c.key)}</div></div>${c.stamp ? `<span class="stp ${STAMPS[c.stamp].cls}">${STAMPS[c.stamp].name}</span>` : ''}</div>`;
}
function cardEl(c, extra = '') {
  const el = document.createElement('div');
  el.className = `card ${c.def.type} ${extra}`; el.dataset.uid = c.uid;
  if (c.def.tag || c.stamp || c.plus || c.def.type === 'tech') el.dataset.fx = JSON.stringify(cardTip(c));   // 装备、调料、手法、带印记或烤过的牌：点一下看说明
  el.innerHTML = cardInner(c);
  return el;
}
// 菜谱水牌：灶台上方挂的、商店卖的、包里开出来的，都是这一个样子
// 本局改良过的菜谱：带上改动，名字后面标「改」
const myRecipe = k => { const r = effRecipe(G && G.mods, k); return G && G.mods && G.mods[k] ? Object.assign({}, r, { modded: 1 }) : r; };
function ruleTag(r, lvl = 1) {
  const f = fxOf(r, lvl);
  const el = document.createElement('div'); el.className = 'rule'; el.dataset.key = r.key;
  const n = r.ing.length + 1;   // 图标多于 3 个（三样原料 + 手法）就排成两行
  const brk = t => t.replace(/\//g, '<wbr>/').replace(/ /g, '<wbr> ');   // 长标签在「/」和空格处可以折行
  el.innerHTML = `<div class="rc${n > 3 ? ' n4' : n === 3 ? ' n3' : ''}">${r.ing.map(k => `<span class="ic i">${icon(ingIcon(k))}</span>`).join('')}<span class="ic t">${icon(techIcon(r.tech))}</span></div>
    <div class="rn${r.name.length > 3 ? ' l' : ''}">${r.name}</div><div class="eq">${fxParts(f).map(x => `<span class="fxp ${x.k}">${brk(x.t)}</span>`).join('')}</div>${lvl > 1 ? `<span class="lv">${lvl}</span>` : ''}<span class="x"></span>`;
  return el;
}
function ruleEl(r) {
  r = myRecipe(r.key);
  const lv = G.lv[r.key] || 1, el = ruleTag(r, lv);
  const m = G.mast[r.key] || 0, nx = mastNext(G, r.key);
  el.dataset.fx = JSON.stringify(recipeTip(r, lv, nx ? `${m}/${nx} 免费升级` : '已练满'));
  el.insertAdjacentHTML('beforeend', '<i class="mp"></i>');
  el.tabIndex = 0; el.setAttribute('role', 'button');
  return el;
}
function spread(n, cw, W, gap) {   // 放得下就等距排开，放不下就压叠，永不换行
  if (n <= 0) return { xs: [], step: 0 };
  const step = n === 1 ? 0 : Math.max(8, Math.min(cw + gap, (W - cw) / (n - 1)));
  const total = cw + step * (n - 1), x0 = (W - total) / 2;
  return { xs: Array.from({ length: n }, (_, i) => x0 + i * step), step };
}
// 手牌、槽位、牌组窗口一律按宽度压叠，不换行
const PHONE = () => false;
const CW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 104;
const widthOf = el => el.clientWidth || 700;
const rectOf = el => el.getBoundingClientRect();
const center = el => { const r = rectOf(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
// Web Animations：Chrome 61 有 animate() 但没有 .finished，用 onfinish 收尾；不支持时直接跳过动画
const ani = (el, kf, o) => new Promise(res => {
  if (!el || typeof el.animate !== 'function') return res();
  try { const a = el.animate(kf, o); a.onfinish = () => res(); a.oncancel = () => res(); } catch (e) { res(); }
});
function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function tween(from, to, ms, fn) {
  return new Promise(res => {
    if (REDUCED || from === to) { fn(to); return res(); }
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); fn(Math.round(from + (to - from) * e)); k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
}
function toast(t) {
  let el = $('#toast'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'toast'; el.innerHTML = t; document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ===== 左侧小票 =====
function renderTicket(p) {
  $('#lvname').textContent = `第 ${G.level} 关`;
  const boss = BOSS_BY[G.bossKey];
  $('#pips').innerHTML = CFG.rounds.map((_, i) => {
    const last = i === CFG.rounds.length - 1, cls = (i < G.round ? 'done ' : i === G.round ? 'now ' : '') + (last ? 'boss' : '');
    return `<i class="${cls}"${last ? ` data-fx="${tipAttr({ t: boss.name, k: '挑剔食客', b: [boss.rule], n: ['这关最后一回合出现'] })}"` : ''}>${i < G.round ? icon('check') : last ? icon(boss.icon) : ''}</i>`;
  }).join('');
  $('#bossTag').innerHTML = G.boss ? `<div class="bosschip"><span class="av">${icon(G.boss.icon)}</span><div><b>${G.boss.name}</b><span>${G.boss.rule}</span></div></div>` : '';
  $('#tgt').textContent = G.target;
  const sc = anim ? shown.score : G.score;
  $('#got').textContent = sc;
  const g = Math.min(1, sc / G.target);
  const pv = !anim && p && p.playable && p.ev.valid ? Math.min(1 - g, p.ev.total / G.target) : 0;
  $('#bar .got').style.width = g * 100 + '%';
  Object.assign($('#bar .pre').style, { left: g * 100 + '%', width: pv * 100 + '%' });
  $('#bar').classList.toggle('full', g >= 1);
  if (!anim) {
    const ok = p && p.ev.valid && !p.why && p.food.length;
    $('#cChip').textContent = ok ? p.ev.base + p.ev.add : 0;
    $('#cMult').textContent = ok ? p.ev.mult : 1;
    $('#cChip').classList.toggle('dim', !ok); $('#cMult').classList.toggle('dim', !ok);
    $('#calcTot').innerHTML = ok ? `= <b>${p.ev.total}</b>` : '';
  }
  $('#nPlay').textContent = G.playsLeft; $('#nDisc').textContent = G.discardsLeft;
  $('#coinIco').innerHTML = icon('coin');
  $('#coins').textContent = anim ? shown.coins : G.coins;
  $('#helpers').innerHTML = Array.from({ length: CFG.maxHelpers }, (_, i) => G.helpers[i]).map(k => !k ? '<span class="hchip empty"></span>' : `<span class="hchip" data-k="${k}" data-fx="${tipAttr(helperTip(k))}">${icon(HELPER_BY[k].icon)}</span>`).join('');
}
// 熟练度：水牌底部一条金色进度条，上面写「用了几次 / 升级要几次」；练满写「精通」。涨的时候条会跳一下
let mastSeen = {};
function paintMastery(el, k) {
  const m = G.mast[k] || 0, nx = mastNext(G, k);
  const bar = el.querySelector('.mp'); if (!bar) return;
  el.classList.toggle('maxed', !nx);
  bar.innerHTML = `<b style="width:${nx ? m / nx * 100 : 100}%"></b><span>${nx ? `${m}/${nx}` : '精通'}</span>`;
  if (mastSeen[k] != null && m > mastSeen[k]) { bar.classList.remove('up'); void bar.offsetWidth; bar.classList.add('up'); }
  mastSeen[k] = m;
}
function renderRules(ev) {
  const box = $('#rules'), have = new Map([...box.children].map(e => [e.dataset.key, e]));
  const keys = G.recipes;
  keys.forEach((k, i) => {
    let el = have.get(k);
    const sig = k + (G.lv[k] || 1) + '/' + (G.mast[k] || 0) + JSON.stringify(G.mods[k] || '');
    if (!el || el.dataset.sig !== sig) { const n = ruleEl(RECIPE_BY[k]); n.dataset.sig = sig; if (el) el.replaceWith(n); else box.appendChild(n); el = n; }
    have.delete(k);
    paintMastery(el, k);
    const hit = ev && ev.lines.find(l => l.key === k);
    el.classList.toggle('on', !!hit);
    el.querySelector('.x').textContent = hit ? (hit.n > 1 ? '×' + hit.n : '✔') : '';
    el.classList.toggle('off', !!(G.boss && G.boss.noRepeat && G.used.includes(k)));
    if (box.children[i] !== el) box.insertBefore(el, box.children[i]);
  });
  have.forEach(e => e.remove());
}
