// ===== 商店：货架 + 礼包 + 菜市场 + 伙计 + 灶台升级 + 牌面加工 =====
// 买东西只就地更新货架，不重建整页、不等动画，所以不会卡
ICONS.hat = '<path d="M14 26c-5 0-8-4-8-8s4-8 9-7c1-4 5-6 9-6s8 2 9 6c5-1 9 3 9 7s-3 8-8 8"/><path d="M14 26v12h20V26"/><path d="M14 33h20"/>';
ICONS.gift = '<rect x="8" y="19" width="32" height="21" rx="2"/><path d="M6 13h36v6H6zM24 13v27"/><path d="M24 13c-3-6-11-7-11-2 0 2 4 2 11 2zM24 13c3-6 11-7 11-2 0 2-4 2-11 2z"/>';
ICONS.steamer = '<path d="M8 20h32v6H8zM10 26h28v10a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z"/><path d="M14 31h20"/><path d="M17 14c-2-2 2-4 0-6M24 14c-2-2 2-4 0-6M31 14c-2-2 2-4 0-6"/>';
ICONS.cboard = '<rect x="6" y="14" width="30" height="24" rx="5"/><circle cx="30" cy="20" r="2"/><path d="M36 26h6"/><path d="M13 24l10 8"/>';
ICONS.stamp = '<path d="M19 6h10v10c0 3 6 4 6 9v3H13v-3c0-5 6-6 6-9z"/><path d="M9 32h30v6H9z"/>';

function wareBody(it) {
  if (it.kind === 'recipe') return ruleTag(RECIPE_BY[it.key]).outerHTML;
  if (it.kind === 'up') { const l = G.lv[it.key] || 1; return ruleTag(RECIPE_BY[it.key], l + 1).outerHTML; }
  if (it.kind === 'helper') return helperCard(it.key);
  if (it.kind === 'pack') return packCard(it.key);
  return cardEl({ uid: 0, key: it.key, def: CARD_DEFS[it.key], stamp: it.stamp }).outerHTML;
}
function helperCard(k) {
  const h = HELPER_BY[k];
  return `<div class="card helper"><div class="cf"><div class="hav">${icon(h.icon)}</div><div class="hnm">${h.name}</div><div class="hds">${tagPills(h.tag)}</div></div></div>`;
}
function packCard(k) {
  const p = PACKS[k];
  return `<div class="card pack ${k}"><div class="cf"><div class="pkic">${icon('gift')}</div><div class="hnm">${p.name}</div><div class="hds">${p.show} 选 ${p.pick}</div></div></div>`;
}
// 统一的区块：每个区块 = 标题条（图标 + 名字 + 一句话）+ 内容区
const block = (id, ic, name, hint, cls = '') => `<section class="blk ${cls}"><header>${icon(ic)}<b>${name}</b><span>${hint}</span></header><div class="blk-in" id="${id}"></div></section>`;
const costTag = (p, off) => `<span class="cost${off ? ' no' : ''}">${icon('coin')}${p}</span>`;
// 商品：上面是牌（点一下看效果），下面是购买按钮（点按钮才买）；买完整格留空
const noFx = h => h.replace(/ data-fx="[^"]*"/g, '');
const attr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function itemFx(it) {
  if (it.kind === 'recipe' || it.kind === 'up') {
    const r = RECIPE_BY[it.key], lv = it.kind === 'up' ? (G.lv[it.key] || 1) + 1 : 1;
    return recipeTip(r, lv, it.kind === 'up' ? `升级后的效果（现在 Lv${lv - 1}）` : '');
  }
  if (it.kind === 'helper') return helperTip(it.key);
  if (it.kind === 'upg') { const u = UPGRADES.find(u => u.key === it.key); return { t: `${u.name} +1`, k: '灶台升级', b: ['永久生效'], n: [`现在 ${G.up[it.key]}/${u.prices.length} 级`] }; }
  return cardTip({ uid: 0, key: it.key, def: CARD_DEFS[it.key], stamp: it.stamp });
}
const hasTip = o => (o.b && o.b.length) || (o.fx && o.fx.length) || (o.n && o.n.filter(Boolean).length);
const fxAttr = it => { const o = itemFx(it); return hasTip(o) ? ` data-fx="${tipAttr(o)}"` : ''; };
const buyBtn = (p, off, attrs) => `<button class="buy${off ? ' no' : ''}" ${attrs} ${off ? 'disabled' : ''}>${icon('coin')}${p}</button>`;
function wareHTML(it, i) {
  if (it.sold) return `<span class="ware gone"></span>`;
  const full = it.kind === 'helper' && G.helpers.length >= CFG.maxHelpers;
  const off = G.coins < it.price || full;
  const st = it.stamp && STAMPS[it.stamp];
  return `<div class="ware${off ? ' off' : ''}"><span class="ware-art"${fxAttr(it)}>${noFx(wareBody(it))}</span>
    ${it.n > 1 ? `<span class="qty">×${it.n}</span>` : ''}${full ? '<button class="buy no" disabled>伙计已满</button>' : buyBtn(it.price, off, `data-act="buy" data-i="${i}"`)}</div>`;
}
// 包：补货包、原料、手法、调料、菜谱、升级、加工、精简，同一种样式
const packDesc = k => PACKS[k].all ? `随机 ${PACKS[k].show} 张` : PACKS[k].show ? `${PACKS[k].show} 选 ${PACKS[k].pick}` : `去掉 ${PACKS[k].pick} 张`;
function packFx(k) {
  const p = PACKS[k];
  return { t: p.name, k: '包', b: [packDesc(k)] };
}
function packHTML(it, i) {
  const pk = PACKS[it.key], off = G.coins < it.price;
  if (it.sold) return `<span class="pkb gone"></span>`;
  return `<div class="pkb ${it.key}${off ? ' off' : ''}" data-fx="${tipAttr(packFx(it.key))}">
    <span class="pk-ic">${icon(pk.icon)}<i>${icon('gift')}</i></span><span class="pk-tx"><b>${pk.name}</b>${packDesc(it.key) ? `<small>${packDesc(it.key)}</small>` : ''}</span>${buyBtn(it.price, off, `data-act="pack" data-i="${i}"`)}</div>`;
}
function helpersHTML() {
  return Array.from({ length: CFG.maxHelpers }, (_, i) => {
    const k = G.helpers[i]; if (!k) return `<span class="hslot empty"></span>`;
    const h = HELPER_BY[k];
    return `<button class="hslot" data-act="fire" data-k="${k}" data-fx="${tipAttr(helperTip(k, `再点一下辞退，退 ${Math.floor(h.price / 2)} 铜钱`))}">${icon(h.icon)}</button>`;
  }).join('');
}
function paintShop() {
  const q = id => document.getElementById(id); if (!q('shelf')) return;
  q('shelf').innerHTML = G.shop.map((it, i) => wareHTML(it, i)).join('');
  q('packs').innerHTML = G.packs.map(packHTML).join('');
  q('sdHelp').innerHTML = helpersHTML();
  const rc = rerollCost(G), rb = q('reroll'); rb.disabled = G.coins < rc; rb.innerHTML = `${icon('again')}换一批${costTag(rc, G.coins < rc)}`;
  q('wallet').textContent = G.coins; q('deckN').textContent = G.deck.length;
  renderTicket(previewSel(G, []));
}
function showShop() {
  const nl = G.levelDone ? G.level + 1 : G.level, nr = G.levelDone ? 0 : G.round + 1;
  const nextBoss = nr === CFG.rounds.length - 1 ? BOSS_BY[G.bossKey] : null;
  sheet(`<div class="shop-top"><h1>商店</h1><span class="wallet">${icon('coin')}<b id="wallet">${G.coins}</b></span>
      <button class="pill o sm" data-act="deck">${icon('deck')}牌组 <b id="deckN">${G.deck.length}</b></button></div>
    <div class="shop">
      <section class="blk wood"><header>${icon('board')}<b>精选</b><span>菜谱、伙计和单卖的牌</span><button class="rr" id="reroll" data-act="reroll"></button></header><div class="blk-in" id="shelf"></div></section>
      ${block('packs', 'gift', '包', '每回合随机两种，打开后挑', 'purple')}
      <section class="blk dark hl"><header>${icon('hat')}<b>伙计</b><span>${G.helpers.length}/${CFG.maxHelpers}</span></header><div class="blk-in" id="sdHelp"></div></section>
    </div>
    <div class="btns">
      ${nextBoss ? `<span class="bosschip"><span class="av">${icon(nextBoss.icon)}</span><div><b>下一位：${nextBoss.name}</b><span>${nextBoss.rule}</span></div></span>` : ''}
      <button class="pill" id="go">${G.levelDone ? `第 ${nl} 关` : '下一回合'}　目标 ${targetFor(nl, nr)}${icon('next')}</button>
    </div>`, 'shopwin');
  paintShop();
  $('#go').onclick = () => { closeSheet(); leaveShop(G, true); sel = []; render(); maybeBossIntro(); };
}
const buySfx = () => sfx.buy();
$('#sheet').addEventListener('click', e => {
  // 点牌或包：第一下看说明，第二下点同一个就买（等同于点它下面的按钮）
  const art = G.phase === 'shop' && !e.target.closest('button') && e.target.closest('.ware-art, .pkb');
  if (art) {
    if (fxEl !== art || fxTip.hidden) return;                 // 第一下：交给浮框显示说明
    const btn = art.closest('.ware, .pkb').querySelector('button.buy'); if (!btn) return;
    if (btn.disabled) { sfx.nope(); toast(/已满/.test(btn.textContent) ? '伙计已满' : '铜钱不够'); return; }
    e.stopPropagation(); hideFx(); btn.click(); return;
  }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || G.phase !== 'shop') return;
  const act = b.dataset.act;
  if (act === 'buy') {
    const i = +b.dataset.i, it = G.shop[i];
    if (!buy(G, i)) return;
    buySfx();
    const card = b.closest('.ware').querySelector('.card, .rule');
    const to = it.kind === 'recipe' || it.kind === 'up' ? $(`.rule[data-key="${it.key}"]`) : it.kind === 'helper' ? $('#sdHelp') : $('#deckN');
    if (it.kind === 'recipe' || it.kind === 'up') renderRules();
    if (card) flyClone(card, rectOf(to || $('#wallet')), { ms: 460, scale: .4, fade: true, arc: 70 });
    if (it.kind === 'helper') { showShop(); return; }
    paintShop();
  } else if (act === 'pack') {
    if (!openPack(G, +b.dataset.i)) return; sfx.pack();
    if (G.pack.key === 'trim') showDeck('trim'); else showPack();
  } else if (act === 'fire') {   // 第一下看效果，第二下辞退
    if (fxEl !== b || fxTip.hidden) { showFx(b, 0); return; }
    if (fire(G, b.dataset.k)) { sfx.fire(); hideFx(); showShop(); }
  }
  else if (act === 'reroll') { if (reroll(G)) { sfx.reroll(); paintShop(); ani($('#shelf'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220 }); } }
  else if (act === 'deck') showDeck('view');
});

// 打开包：内容一张张翻开，挑完回商店（补货包直接全收）
function upgTile(k) {
  const u = UPGRADES.find(u => u.key === k), lv = G.up[k];
  return `<div class="card upg"><div class="cf"><div class="pkic">${icon(u.icon)}</div><div class="hnm">${u.name} +1</div><div class="hds">${'●'.repeat(lv)}${'○'.repeat(u.prices.length - lv)}</div></div></div>`;
}
function showPack() {
  const pk = G.pack, def = PACKS[pk.key];
  const body = it => it.kind === 'card' || it.kind === 'stamp' ? cardEl({ uid: 0, key: it.key, def: CARD_DEFS[it.key], stamp: it.stamp }).outerHTML
    : it.kind === 'upg' ? upgTile(it.key)
    : it.kind === 'up' ? ruleTag(RECIPE_BY[it.key], (G.lv[it.key] || 1) + 1).outerHTML : ruleTag(RECIPE_BY[it.key]).outerHTML;
  const paint = () => {
    $('#pkRow').innerHTML = pk.items.map((it, j) => it.taken && !def.all ? `<span class="ware pkw gone"></span>`
      : `<div class="ware pkw${def.all ? ' got' : ''}" style="animation-delay:${j * 70}ms"><span class="ware-art"${fxAttr(it)}>${noFx(body(it))}</span>${def.all ? '' : `<button class="buy take" data-j="${j}" ${pk.left ? '' : 'disabled'}>要这个</button>`}</div>`).join('');
    $('#pkLeft').textContent = def.all ? '' : `选 ${pk.left}`;
  };
  const back = () => { if (G.pack !== pk) return; closePack(G); showShop(); };
  sheet(`<h1>${def.name}</h1><div class="sub" id="pkLeft"></div><div class="shelf pkopen${pk.items.length > 4 ? ' many' : ''}" id="pkRow"></div>
    ${def.all ? '' : '<div class="btns"><button class="pill o sm" id="pkGo">不要了</button></div>'}`, 'pkwin');
  paint();
  // 挑满就自动回商店；补货包全收，亮一下牌就回去（点一下窗口可以提前回）
  $('#pkRow').onclick = e => { const b = e.target.closest('.take'); if (!b || b.disabled) return; hideFx(); if (takeFromPack(G, +b.dataset.j)) { buySfx(); paint(); if (!pk.left) setTimeout(back, 380); } };
  if (def.all) { setTimeout(back, 1600); $('#sheet').onclick = back; }
  else $('#pkGo').onclick = back;
}

// 商店里的牌组窗口：看牌组；打开精简包时在这里挑牌去掉
function showDeck(mode = 'view') {
  const pk = G.pack && G.pack.key === 'trim' ? G.pack : null;
  if (mode === 'trim' && !pk) mode = 'view';
  const sub = mode === 'trim' ? (pk.left ? `选 ${pk.left}` : '') : '';
  deckSheet({ tab: mode, sub, back: mode === 'trim' ? '不要了' : `${icon('again')}回商店`, onTab: showDeck,
    tabs: mode === 'trim' ? [{ k: 'trim', name: '精简包', n: G.deck.length }] : [{ k: 'view', name: '牌组', n: G.deck.length }] });
  $('#dkList').innerHTML = deckGrid(deckEntries(), mode === 'trim' ? () => pk.left > 0 && G.deck.length > 8 : null); layoutFans();
  $('#dkList').onclick = async e => {
    const b = e.target.closest('.card.pick'); if (!b || b.classList.contains('off') || mode !== 'trim') return;
    if (!trimFromPack(G, +b.dataset.i)) return; sfx.trim();
    await ani(b, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30px) rotate(20deg) scale(.6)', opacity: 0 }], { duration: 260, fill: 'forwards' });
    if (pk.left > 0 && G.deck.length > 8) showDeck('trim'); else { closePack(G); showShop(); }   // 去够了就自动回商店
  };
  $('#go').onclick = () => { if (pk) closePack(G); showShop(); };
}
