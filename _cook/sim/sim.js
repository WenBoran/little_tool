// 自动对局：node sim.js <src目录> <策略 none|smart|rand> <局数>
const K = require('./load')(process.argv[2]);
const POL = process.argv[3] || 'smart', N = +process.argv[4] || 300;
const { CARD_DEFS, RECIPE_BY, CFG } = K;
function combos(arr, k, out = [], cur = [], s = 0) { if (cur.length) out.push(cur.slice()); if (cur.length === k) return out; for (let i = s; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, out, cur, i + 1); cur.pop(); } return out; }
function bestPlay(G) {
  const ok = G.hand.filter(c => !K.banned(G, c));
  const food = ok.filter(c => c.def.type === 'ing' || c.def.type === 'tech');
  const eqs = ok.filter(c => c.def.type === 'equip'), sps = ok.filter(c => c.def.type === 'spice');
  const cap = G.slotCap + eqs.reduce((s, c) => s + c.def.slots, 0);
  let best = null;
  for (const set of combos(food, Math.min(cap, 6))) {
    if (!set.some(c => c.def.type === 'ing')) continue;
    for (const sp of [[], sps]) {
      const uids = K.bestOrder(G, set.map(c => c.uid).concat(eqs.map(c => c.uid), sp.map(c => c.uid)));
      const p = K.previewSel(G, uids); if (!p.playable) continue;
      // 用的牌越少越好（牌会用掉）：分数相近时偏向少用牌
      const v = p.ev.total - set.length * 0.5 - sp.length * 2;
      if (!best || v > best.v) best = { v, uids, p, n: set.length };
    }
  }
  return best;
}
function playRound(G) {
  let guard = 60;
  while (G.phase === 'play' && guard--) {
    const b = bestPlay(G), need = G.target - G.score;
    const enough = b && b.p.ev.total * G.playsLeft >= need * 1.0;
    if ((!b || (!enough && b.p.ev.total < need)) && G.discardsLeft > 0 && (G.pile.length || G.discard.length)) {
      const keep = new Set(b ? b.uids : []);
      let out = G.hand.filter(c => !keep.has(c.uid) && c.def.type !== 'equip');
      if (!out.length) out = G.hand.filter(c => c.def.type !== 'equip').slice(0, 2);
      out = out.sort((a, c) => (a.def.base || 0) - (c.def.base || 0)).slice(0, Math.min(4, G.slotCap));
      if (out.length && K.discardSel(G, out.map(c => c.uid))) continue;
    }
    if (!b) { K.giveUp(G); break; }
    if (G.order && G.order.live && G.cooks < CFG.order.after) S.waitTurns++;
    S.used += b.n + b.uids.filter(u => { const c = G.hand.find(x => x.uid === u); return c && c.def.type === 'spice'; }).length; S.pots++;
    const r = K.playSel(G, b.uids); if (!r) { K.giveUp(G); break; }
    if (G.last && G.last.arrived) S.arrivedMid++;
  }
}
// 想做的菜：拥有的菜谱里，牌组里缺得最多但分值最高的那张牌
function wantKey(G) {
  const cnt = {}; G.deck.forEach(k => cnt[k] = (cnt[k] || 0) + 1);
  let best = null;
  G.recipes.forEach(rk => { const r = RECIPE_BY[rk];
    [...r.ing, r.tech].forEach(k => { const lack = (CARD_DEFS[k].type === 'ing' ? 4 : 3) - (cnt[k] || 0); const v = lack * 10 + r.price; if (lack > 0 && (!best || v > best.v)) best = { k, v }; }); });
  return best && best.k;
}
function shop(G) {
  const ingN = () => G.deck.filter(k => CARD_DEFS[k].type === 'ing').length;
  const low = () => G.deck.length < 26 || ingN() < 14;
  // 2. 订货：缺什么订什么
  if (POL !== 'none' && K.canOrder && K.canOrder(G)) {
    let k = null;
    if (POL === 'smart') k = low() && ingN() < 14 ? null : wantKey(G);
    if (POL === 'smart' && !k) { const ok = G.offer.items.filter(x => !x.out && CARD_DEFS[x.key].type === 'ing').sort((a, b) => (b.sale - a.sale) || (CARD_DEFS[b.key].base / b.price - CARD_DEFS[a.key].base / a.price)); k = ok[0] && ok[0].key; }
    else if (POL === 'rand') { const ok = G.offer.items.filter(x => !x.out); k = ok[Math.floor(Math.random() * ok.length)].key; }
    const it = k && G.offer.items.find(x => x.key === k);
    if (it && !it.out && G.coins >= it.price) { K.placeOrder(G, k); S.orders++; S.orderCost += it.price; }
  }
  const order = G.shop.map((it, i) => ({ it, i })).sort((a, b) => ({ recipe: 0, up: 1, helper: 2, card: 3 }[a.it.kind] - { recipe: 0, up: 1, helper: 2, card: 3 }[b.it.kind]));
  for (const { it, i } of order) {
    if (it.sold || G.coins < it.price) continue;
    if (it.kind === 'card' && CARD_DEFS[it.key].type !== 'equip' && !(low() && CARD_DEFS[it.key].type === 'ing')) continue;
    if ((it.kind === 'recipe' || it.kind === 'helper') && low() && G.coins < it.price + 6) continue;
    if (it.kind === 'helper' && G.helpers.length >= CFG.maxHelpers) continue;
    // 菜谱栏满了：卖掉等级最低、最便宜的一道，换更贵的
    if (it.kind === 'recipe' && K.recipesFull(G)) {
      const worst = G.recipes.slice().sort((a, b) => ((G.lv[a] || 1) * RECIPE_BY[a].price) - ((G.lv[b] || 1) * RECIPE_BY[b].price))[0];
      if (!worst || RECIPE_BY[worst].price >= RECIPE_BY[it.key].price) continue;
      K.sellRecipe(G, worst);
    }
    K.buy(G, i);
  }
  for (let i = 0; i < G.packs.length; i++) { const it = G.packs[i];
    if (it.sold || G.coins < it.price + 2 || it.key === 'trim' || it.key === 'stamp') continue;
    K.openPack(G, i); const p = G.pack; if (!p) continue;
    for (let j = 0; j < p.items.length && p.left > 0; j++) K.takeFromPack(G, j);
    K.closePack(G);
  }
}
const DI = []; if (process.env.OV) eval(process.env.OV);
const BD = {}; const S = { used: 0, pots: 0, deckAt: {}, orders: 0, orderCost: 0, waitTurns: 0, arrivedMid: 0 };
const deaths = {}, coinsPer = []; let rounds = 0, earned = 0, lvSum = 0;
for (let n = 0; n < N; n++) {
  const G = K.newRun(1000 + (n + (+process.env.OFF || 0) * 100000) * 7919);
  let guard = 200;
  while (G.phase !== 'over' && G.phase !== 'won' && guard--) {
    playRound(G);
    if (G.phase === 'shop') { rounds++; const d0 = G.deck.length; if (!G.won) shop(G); S.bought = (S.bought||0) + G.deck.length - d0; K.leaveShop(G); const k = G.level + '-' + G.round; (S.deckAt[k] = S.deckAt[k] || []).push(G.deck.length); }
  }
  const L = G.won ? 'won' : G.level; if (G.phase==='over' && G.boss) BD[G.boss.key] = (BD[G.boss.key]||0)+1; if (G.phase==='over') { DI.push({stuck: G.playsLeft > 0 ? 1 : 0, lv:G.level, rd:G.round, deck:G.deck.length, plays:G.playsLeft, pct:G.score/G.target, recipes:G.recipes.length, ing:G.deck.filter(k=>CARD_DEFS[k].type==='ing').length}); } deaths[L] = (deaths[L] || 0) + 1; earned += G.earned; lvSum += G.level;
}
const pct = k => ((deaths[k] || 0) / N * 100).toFixed(0) + '%';
console.log(`8 关通关 ${pct('won')}（${N} 局自动策略，仅作冒烟检查）`);
console.log(`${POL.padEnd(5)} 死在第1关 ${pct(1)} 第2关 ${pct(2)} 第3关 ${pct(3)} 第4关 ${pct(4)} 第5+关 ${(Object.keys(deaths).filter(k => k >= 5).reduce((s, k) => s + deaths[k], 0) / N * 100).toFixed(0)}%  平均到第 ${(lvSum / N).toFixed(2)} 关  每回合 ${(earned / rounds).toFixed(1)} 钱  订单/局 ${(S.orders / N).toFixed(1)} 均价 ${(S.orderCost / Math.max(1, S.orders)).toFixed(1)}`);

if (process.env.DIAG) { const g = {}; DI.forEach(d => { const k = d.lv + '-' + d.rd; g[k] = g[k] || []; g[k].push(d); }); Object.keys(g).sort().forEach(k => { const a = g[k], av = f => (a.reduce((s, d) => s + d[f], 0) / a.length).toFixed(2); console.log(k, a.length, 'deck', av('deck'), 'ing', av('ing'), 'plays', av('plays'), 'pct', av('pct'), 'rec', av('recipes'), 'stuck', av('stuck')); }); }

if (process.env.ECO) { console.log('每回合用掉牌', (S.used / rounds).toFixed(1), '每锅', (S.used / S.pots).toFixed(1), '每回合买进', (S.bought / rounds).toFixed(1)); console.log(Object.keys(S.deckAt).sort().map(k => k + ':' + (S.deckAt[k].reduce((a, b) => a + b, 0) / S.deckAt[k].length).toFixed(0) + '(' + S.deckAt[k].length + ')').join(' ')); }

if (process.env.BOSS) console.log('死在食客', JSON.stringify(BD));
