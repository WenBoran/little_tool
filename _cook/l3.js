// ===== 对局状态机（选牌 → 出牌 / 弃牌）=====
function targetFor(level, round) { const t = CFG.rounds[round] * Math.pow(CFG.growth, level - 1); return t < 60 ? Math.round(t) : Math.round(t / 5) * 5; }
const isBossRound = G => G.round === CFG.rounds.length - 1;

function newRun(seed) {
  UID = 1;
  const G = { seed, r: rng(seed), level: 1, round: 0, coins: CFG.startCoins, deck: START_DECK.slice(),
    stamps: START_DECK.map(() => null), helpers: [], up: { slot: 0, hand: 0, play: 0, disc: 0 },
    recipes: START_RECIPES.slice(), lv: {}, phase: 'play', history: [], earned: 0, bossesBeat: 0 };
  pickBoss(G); startRound(G);
  return G;
}
function pickBoss(G) {
  const pool = BOSSES.filter(b => b.key !== G.bossKey);
  G.bossKey = pool[Math.floor(G.r() * pool.length)].key;
}

function startRound(G) {
  G.target = targetFor(G.level, G.round);
  G.boss = isBossRound(G) ? BOSS_BY[G.bossKey] : null;
  G.score = 0; G.cooks = 0; G.tips = 0; G.used = [];
  G.pile = shuffle(G.deck.map((k, i) => mk(k, G.stamps[i])), G.r);
  G.hand = []; G.discard = []; G.equipped = []; G.reshuffles = 0;
  G.slotCap = CFG.baseSlots + G.up.slot;
  G.playsLeft = G.boss && G.boss.plays ? G.boss.plays : CFG.plays + G.up.play;
  G.discardsLeft = CFG.discards + G.up.disc + G.helpers.filter(k => HELPER_BY[k].fx.disc).length; G.last = null;
  G.handSize = CFG.hand + G.up.hand + (G.boss && G.boss.hand || 0);
  draw(G, G.handSize);
  G.phase = 'play';
  checkStuck(G);
}

// 摸牌：牌堆空了就把弃牌堆洗回去（食材不会用光）
function draw(G, n) {
  const got = [];
  while (n-- > 0) {
    if (!G.pile.length) { if (!G.discard.length) break; G.pile = shuffle(G.discard, G.r); G.discard = []; G.reshuffles++; }
    const c = G.pile.pop(); G.hand.push(c); got.push(c);
  }
  return got;
}
// 按点选顺序取牌（槽位顺序 = 点击顺序）
const pick = (G, uids) => uids.map(u => G.hand.find(c => c.uid === u)).filter(Boolean);

// 挑剔食客的限制：哪些牌不能出
function banned(G, c) {
  const b = G.boss; if (!b) return false;
  if (b.ban && b.ban.includes(c.key)) return true;
  if (b.banTag && c.def[b.banTag]) return true;
  if (b.banType && c.def.type === b.banType) return true;
  return false;
}
const ctxBase = G => ({ recipes: G.recipes, lv: G.lv, helpers: G.helpers, disabled: G.boss && G.boss.noRepeat ? G.used : [] });

// 求最优摆法：只给自动对局脚本用，玩家出牌不会自动排序
function arrange(cards, ctx) {
  const ings = cards.filter(c => c.def.type === 'ing'), techs = cards.filter(c => c.def.type === 'tech');
  const eq = ctx.equipped.map(k => CARD_DEFS[k]);
  const capOf = t => {
    let c = BASE_CAP[t.key] || 1;
    if (eq.some(d => d.techDouble === t.key)) c = Math.max(c, 2);
    if (t.key === 'roast' && ctx.recipes.includes('kaoniurou')) c += 1;
    return c;
  };
  const caps = techs.map(capOf), groups = techs.map(() => []), rest = [];
  const layout = () => { const out = []; techs.forEach((t, i) => out.push(...groups[i], t)); return out.concat(rest); };
  let best = null, budget = 3000;
  const tryIt = () => { const sl = layout(), ev = evaluate(sl, ctx); budget--; if (!best || ev.total > best.ev.total) best = { slots: sl, ev }; };
  (function dfs(i) {
    if (budget <= 0) return;
    if (i === ings.length) { tryIt(); return; }
    for (let t = 0; t < techs.length; t++) if (groups[t].length < caps[t]) { groups[t].push(ings[i]); dfs(i + 1); groups[t].pop(); }
    rest.push(ings[i]); dfs(i + 1); rest.pop();
  })(0);
  if (!best) { let k = 0; techs.forEach((t, i) => { while (groups[i].length < caps[i] && k < ings.length) groups[i].push(ings[k++]); }); rest.push(...ings.slice(k)); tryIt(); }
  return best;
}

// 预览选中的牌：原料和手法按点选顺序进槽位，按这个顺序识别组合；
// 装备和调料不占槽位，都只对这一锅生效
function previewSel(G, uids) {
  const sel = pick(G, uids);
  const eqs = sel.filter(c => c.def.type === 'equip'), sps = sel.filter(c => c.def.type === 'spice');
  const food = sel.filter(c => c.def.type === 'ing' || c.def.type === 'tech');
  const equipped = eqs.map(c => c.key);
  const cap = G.slotCap + eqs.reduce((s, c) => s + c.def.slots, 0);
  const ctx = Object.assign(ctxBase(G), { equipped, slotCap: cap, spices: sps.map(c => c.key) });
  const res = { slots: food, ev: evaluate(food, ctx) };
  const over = food.length > cap;
  const ban = sel.filter(c => banned(G, c));
  const nIng = food.filter(c => c.def.type === 'ing').length;
  const short = G.boss && G.boss.minIng && nIng > 0 && nIng < G.boss.minIng;
  // 挑剔食客不吃的牌：可以选、可以弃、也可以打出，但打出的这一锅整锅不得分（也没有小费和菜谱效果）
  if (ban.length) res.ev = Object.assign({}, res.ev, { total: 0, lines: [], gold: 0, steps: [], after: { slot: 0, draw: 0, swap: 0 }, spoiled: true });
  let why = '';
  if (over) why = 'over'; else if (short) why = 'short';
  else if (!res.ev.valid && sel.length) why = 'noing'; else if (ban.length) why = 'ban';
  const playable = G.phase === 'play' && sel.length > 0 && (!why || why === 'ban') && res.ev.valid && G.playsLeft > 0;
  return Object.assign({}, res, { eqs, sps, food, cap, over, why, ban, playable, equipOnly: false });
}

// 自动对局用：把一组牌按最优顺序排好（玩家界面不调用）
function bestOrder(G, uids) {
  const sel = pick(G, uids), eqs = sel.filter(c => c.def.type === 'equip'), sps = sel.filter(c => c.def.type === 'spice');
  const food = sel.filter(c => c.def.type === 'ing' || c.def.type === 'tech');
  const ctx = Object.assign(ctxBase(G), { equipped: eqs.map(c => c.key), slotCap: G.slotCap + eqs.reduce((s, c) => s + c.def.slots, 0), spices: sps.map(c => c.key) });
  const r = food.length ? arrange(food, ctx) : { slots: [] };
  return r.slots.map(c => c.uid).concat(eqs.map(c => c.uid), sps.map(c => c.uid));
}

// 用掉的牌从牌组里永久去掉（装备除外），想再用就得重新买
function consume(G, cards) {
  cards.forEach(c => {
    let i = G.deck.findIndex((k, j) => k === c.key && G.stamps[j] === c.stamp);
    if (i < 0) i = G.deck.indexOf(c.key);
    if (i >= 0) { G.deck.splice(i, 1); G.stamps.splice(i, 1); G.usedUp = (G.usedUp || 0) + 1; }
  });
}
// 出牌：料理一锅，耗 1 次出牌；原料、手法、调料用掉就没了，装备进弃牌堆；每触发一个菜谱，客人给 1 小费
function playSel(G, uids) {
  const p = previewSel(G, uids); if (!p.playable) return null;
  G.hand = G.hand.filter(c => !uids.includes(c.uid));
  G.discard.push(...p.eqs);
  const ev = p.ev;
  const tip = ev.lines.length + ev.gold;
  G.score += ev.total; G.cooks++; G.bestCook = Math.max(G.bestCook || 0, ev.total); G.playsLeft--; G.coins += tip; G.tips += tip; G.earned += tip;
  ev.lines.forEach(l => { if (!G.used.includes(l.key)) G.used.push(l.key); });
  consume(G, [...p.food, ...p.sps]);
  G.slotCap += ev.after.slot; G.discardsLeft += ev.after.swap;
  const r0 = G.reshuffles;
  const drawn = draw(G, Math.max(0, G.handSize - G.hand.length) + ev.after.draw);
  G.last = { ev, drawn, tip, reshuffled: G.reshuffles > r0 };
  if (G.score >= G.target) clearRound(G); else checkStuck(G);
  return p;
}

function discardSel(G, uids) {     // 弃牌：选中的牌进弃牌堆，补同样张数
  if (G.phase !== 'play' || G.discardsLeft <= 0 || !uids.length) return false;
  const out = pick(G, uids); if (!out.length) return false;
  G.hand = G.hand.filter(c => !uids.includes(c.uid)); G.discard.push(...out);
  const r0 = G.reshuffles; const drawn = draw(G, out.length); G.discardsLeft--;
  G.last = { drawn, reshuffled: G.reshuffles > r0 };
  checkStuck(G); return true;
}

// 失败：出牌次数用完；或手里没有能用的原料、也没法弃牌换
function checkStuck(G) {
  if (G.phase !== 'play') return;
  if (G.playsLeft <= 0) return lose(G);
  const hasIng = G.hand.some(c => c.def.type === 'ing' && !banned(G, c));
  if (!hasIng && !(G.discardsLeft > 0 && (G.pile.length || G.discard.length))) lose(G);
}
function giveUp(G) { if (G.phase === 'play') lose(G); }
function lose(G) { G.phase = 'over'; }

// 回合结束：结账。账单 = 基础 + 剩余出牌 + 利息（每 5 铜钱 1，最多 5）+ 挑剔食客赏钱；小费已在出锅时到手
function clearRound(G) {
  const bill = [{ k: 'base', n: CFG.earnBase }];
  G.billCoins = G.coins;   // 结账前手上的钱，用来算利息
  if (G.playsLeft) bill.push({ k: 'plays', n: G.playsLeft * CFG.perPlayLeft, c: G.playsLeft });
  const it = Math.min(CFG.interestMax, Math.floor(G.coins / CFG.interestPer)); if (it) bill.push({ k: 'interest', n: it });
  if (G.boss) { bill.push({ k: 'boss', n: CFG.bossTip + G.level * 2 }); G.bossesBeat++; }
  const hi = G.helpers.reduce((s, k) => s + (HELPER_BY[k].fx.income || 0), 0); if (hi) bill.push({ k: 'helper', n: hi });
  const sum = bill.reduce((s, b) => s + b.n, 0);
  G.bill = { items: bill, tips: G.tips, sum };
  G.coins += sum; G.earned += sum;
  G.history.push({ level: G.level, round: G.round, score: G.score, target: G.target, cooks: G.cooks, boss: G.boss && G.boss.key });
  G.levelDone = isBossRound(G);
  G.phase = 'shop'; G.rerolls = 0; G.shop = rollShop(G); G.market = []; G.packs = rollPacks(G); G.pack = null;
}

const ING_KEYS = ['egg', 'tomato', 'potato', 'mushroom', 'beef', 'tofu', 'shrimp', 'scallion'];
const TECH_KEYS = ['fry', 'cut', 'deep', 'steam', 'roast', 'stir', 'mix'];
const EQUIP_KEYS = ['pan', 'pot', 'oven', 'knife', 'wok'];
const SPICE_KEYS = ['salt', 'soy', 'chili', 'sugar', 'vinegar'];
const recipePrice = (G, k) => RECIPE_BY[k].price + ((G.lv[k] || 1) - 1) * 2 + (G.recipes.includes(k) ? 1 : 0);
// 商店：4 个精选（至少一条菜谱或升级）
function rollShop(G) {
  const pool = [];
  ING_KEYS.forEach(k => pool.push({ kind: 'card', key: k, price: 2, w: 1 }));
  TECH_KEYS.forEach(k => pool.push({ kind: 'card', key: k, price: 3, w: 1 }));
  EQUIP_KEYS.forEach(k => pool.push({ kind: 'card', key: k, price: CARD_DEFS[k].price, w: .7 }));
  SPICE_KEYS.forEach(k => pool.push({ kind: 'card', key: k, price: CARD_DEFS[k].price, w: 1 }));
  HELPERS.filter(h => !G.helpers.includes(h.key)).forEach(h => pool.push({ kind: 'helper', key: h.key, price: h.price }));
  const recs = RECIPES.map(r => G.recipes.includes(r.key) ? { kind: 'up', key: r.key, price: recipePrice(G, r.key) } : { kind: 'recipe', key: r.key, price: recipePrice(G, r.key) });
  const first = shuffle(recs.slice(), G.r)[0];
  const rest = shuffle(pool.concat(recs.filter(x => x !== first)), G.r).slice(0, CFG.shopSize - 1);
  return shuffle([first, ...rest], G.r).map(p => Object.assign({}, p, { sold: false }));
}
// 随机抽一个印记
function rollStamp(G) {
  const ks = Object.keys(STAMPS), tot = ks.reduce((s, k) => s + STAMPS[k].w, 0);
  let x = G.r() * tot; for (const k of ks) { x -= STAMPS[k].w; if (x < 0) return k; } return ks[0];
}
// 菜市场：一捆 3 张同样的牌；偶尔整捆自带随机印记（贵 1）
function rollMarket(G) {
  const ing = shuffle(ING_KEYS.slice(), G.r).slice(0, CFG.mkIng), tech = shuffle(TECH_KEYS.slice(), G.r).slice(0, CFG.mkTech);
  return [...ing, ...tech].map(k => {
    const st = G.r() < CFG.mkStampChance ? rollStamp(G) : null;
    return { kind: 'card', key: k, n: CFG.mkBundle, stamp: st, price: (CARD_DEFS[k].type === 'ing' ? CFG.mkIngPrice : CFG.mkTechPrice) + (st ? 1 : 0), sold: false };
  });
}
function buyFrom(G, list, i) {
  const it = list && list[i]; if (!it || it.sold || G.coins < it.price) return false;
  if (it.kind === 'helper' && G.helpers.length >= CFG.maxHelpers) return false;
  G.coins -= it.price; it.sold = true;
  if (it.kind === 'recipe') { G.recipes.push(it.key); G.lv[it.key] = 1; }
  else if (it.kind === 'up') G.lv[it.key] = (G.lv[it.key] || 1) + 1;
  else if (it.kind === 'helper') G.helpers.push(it.key);
  else for (let k = 0; k < (it.n || 1); k++) addCard(G, it.key, it.stamp);
  // 菜谱买下后，同一条在本店里剩下的标签变成“升级”
  list.forEach(x => { if (!x.sold && (x.kind === 'recipe' || x.kind === 'up') && x.key === it.key) { x.kind = 'up'; x.price = recipePrice(G, x.key); } });
  return true;
}
const buy = (G, i) => buyFrom(G, G.shop, i);
const buyMarket = (G, i) => buyFrom(G, G.market, i);
const rerollCost = G => CFG.rerollBase + (G.rerolls || 0);
function reroll(G) { const c = rerollCost(G); if (G.phase !== 'shop' || G.coins < c) return false; G.coins -= c; G.rerolls++; G.shop = rollShop(G); return true; }
// 去掉牌组里一张牌（精简包里用）
function trim(G, i) { if (G.phase !== 'shop' || !(i in G.deck) || G.deck.length <= 8) return false; G.deck.splice(i, 1); G.stamps.splice(i, 1); return true; }
function addCard(G, key, st) { G.deck.push(key); G.stamps.push(st || null); }

// 帮厨伙计：辞退退一半钱
function fire(G, key) { const i = G.helpers.indexOf(key); if (G.phase !== 'shop' || i < 0) return false; G.helpers.splice(i, 1); G.coins += Math.floor(HELPER_BY[key].price / 2); return true; }
// 灶台升级（升级包里挑）
const upLeft = G => UPGRADES.filter(u => G.up[u.key] < u.prices.length);
const stampable = G => G.deck.map((k, i) => i).filter(i => !G.stamps[i] && ['ing', 'tech'].includes(CARD_DEFS[G.deck[i]].type));
// 哪些包这回合能出：升级满了不出升级包，没牌可盖不出加工包，牌太少不出精简包
function packOk(G, k) {
  if (k === 'up') return upLeft(G).length > 0;
  if (k === 'stamp') return stampable(G).length >= 2;
  if (k === 'trim') return G.deck.length > 12;
  return true;
}
// 包：每回合随机两种，牌组偏少时必有补货包
function rollPacks(G) {
  let ks = Object.keys(PACKS).filter(k => packOk(G, k)), out = [];
  if (G.deck.length < CFG.lowDeck) { out.push('box'); ks = ks.filter(k => k !== 'box'); }
  while (out.length < 2 && ks.length) {
    const tot = ks.reduce((s, k) => s + PACKS[k].w, 0); let x = G.r() * tot, pickK = ks[ks.length - 1];
    for (const k of ks) { x -= PACKS[k].w; if (x < 0) { pickK = k; break; } }
    out.push(pickK); ks = ks.filter(k => k !== pickK);
  }
  return out.map(k => ({ kind: 'pack', key: k, price: PACKS[k].price, sold: false }));
}
function boxKeys(G) {
  const nT = 2 + Math.floor(G.r() * 2), keys = [];
  for (let i = 0; i < PACKS.box.show - nT; i++) keys.push(ING_KEYS[Math.floor(G.r() * ING_KEYS.length)]);
  for (let i = 0; i < nT; i++) keys.push(TECH_KEYS[Math.floor(G.r() * TECH_KEYS.length)]);
  return keys;
}
function openPack(G, i) {
  const it = G.packs[i], pk = it && PACKS[it.key];
  if (!it || it.sold || G.coins < it.price || G.pack || G.phase !== 'shop') return false;
  G.coins -= it.price; it.sold = true;
  let items = [];
  if (it.key === 'recipe') {
    const pool = RECIPES.map(r => G.recipes.includes(r.key) ? { kind: 'up', key: r.key } : { kind: 'recipe', key: r.key });
    items = shuffle(pool, G.r).slice(0, pk.show);
  } else if (it.key === 'up') {
    items = shuffle(upLeft(G).slice(), G.r).slice(0, pk.show).map(u => ({ kind: 'upg', key: u.key }));
  } else if (it.key === 'stamp') {
    items = shuffle(stampable(G), G.r).slice(0, pk.show).map(j => ({ kind: 'stamp', i: j, key: G.deck[j], stamp: rollStamp(G) }));
  } else if (it.key === 'box') {
    items = boxKeys(G).map(k => ({ kind: 'card', key: k, stamp: null }));
  } else if (it.key !== 'trim') {
    const keys = { ing: ING_KEYS, tech: TECH_KEYS, spice: SPICE_KEYS }[it.key];
    items = Array.from({ length: pk.show }, () => ({ kind: 'card', key: keys[Math.floor(G.r() * keys.length)], stamp: it.key !== 'spice' && G.r() < .35 ? rollStamp(G) : null }));
  }
  G.pack = { key: it.key, items: items.map(x => Object.assign({}, x, { taken: false })), left: Math.min(pk.pick, it.key === 'trim' ? pk.pick : items.length) };
  if (pk.all) { G.pack.items.forEach((x, j) => takeFromPack(G, j)); }
  return true;
}
function takeFromPack(G, j) {
  const p = G.pack, it = p && p.items[j]; if (!it || it.taken || p.left <= 0) return false;
  it.taken = true; p.left--;
  if (it.kind === 'recipe') { G.recipes.push(it.key); G.lv[it.key] = 1; }
  else if (it.kind === 'up') G.lv[it.key] = (G.lv[it.key] || 1) + 1;
  else if (it.kind === 'upg') G.up[it.key]++;
  else if (it.kind === 'stamp') G.stamps[it.i] = it.stamp;
  else addCard(G, it.key, it.stamp);
  p.items.forEach(x => { if (!x.taken && x.kind === 'recipe' && G.recipes.includes(x.key)) x.kind = 'up'; });
  return true;
}
// 精简包：从牌组里挑牌去掉
function trimFromPack(G, i) { const p = G.pack; if (!p || p.key !== 'trim' || p.left <= 0 || !trim(G, i)) return false; p.left--; return true; }
function closePack(G) { G.pack = null; }
function leaveShop(G) {
  if (G.phase !== 'shop') return;
  if (G.levelDone) { G.level++; G.round = 0; pickBoss(G); } else G.round++;
  G.pack = null; startRound(G);
}

if (typeof module !== 'undefined') module.exports = { CARD_DEFS, RECIPES, BOSSES, HELPERS, UPGRADES, STAMPS, PACKS, CFG, fire, openPack, takeFromPack, trimFromPack, closePack, rollPacks, START_DECK, evaluate, arrange, bestOrder, newRun, previewSel, playSel, discardSel, buy, buyMarket, reroll, rerollCost, trim, leaveShop, targetFor, giveUp, banned, fxOf };
