// node sim/t_expansion.js . — 内容可达性、联动、牌组变更、32 回合边界
const assert = require('node:assert/strict');
const K = require('./load')(process.argv[2] || '.');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('ok  ' + name); }
const evaluate = (keys, recipes, extra = {}) => K.evaluate(keys.map(k => K.mk(k)), Object.assign({ recipes, lv: {}, equipped: [], slotCap: 20, spices: [], helpers: [] }, extra));
const totalN = (ev, key) => ev.lines.filter(l => l.key === key).reduce((s, l) => s + l.n, 0);
function run(keys, recipes, helpers = [], opts = {}) {
  const g = K.newRun(77);
  Object.assign(g, { deck: keys.slice(), stamps: keys.map(() => null), hand: keys.map(k => K.mk(k)), recipes, helpers, pile: [], discard: [], handSize: 0, slotCap: 30, target: 1e9, boss: null }, opts);
  const before = JSON.stringify(g);
  const ids = g.hand.map(c => c.uid), p = K.previewSel(g, ids);
  assert.equal(JSON.stringify(g), before, '预览不得修改牌组、金币或熟练度');
  const fa = K.fatesOf(g, p);
  assert.equal(JSON.stringify(g), before, '去向预览不得修改状态');
  assert.ok(K.playSel(g, ids));
  return { g, p, fa };
}
test('卡池数量、唯一键名与可读说明', () => {
  assert.ok(K.RECIPES.length > 50); assert.ok(K.HELPERS.length > 30);
  for (const list of [K.RECIPES, K.HELPERS]) {
    assert.equal(new Set(list.map(x => x.key)).size, list.length);
    assert.equal(new Set(list.map(x => x.name)).size, list.length);
  }
  for (const r of K.RECIPES) {
    assert.ok(r.ing.length && r.ing.every(k => K.CARD_DEFS[k].type === 'ing'));
    assert.equal(K.CARD_DEFS[r.tech].type, 'tech');
    for (const lv of [1, 2, 6]) assert.ok(K.fxText(K.fxOf(r, lv)), r.key + ' 说明不能为空');
    assert.ok(!K.fxText(r.fx).includes('本锅'));
  }
  K.HELPERS.forEach(h => assert.ok(h.desc && !h.desc.includes('本锅')));
});
for (const r of K.RECIPES) test(r.name + '：真实配料能触发，缺料不能触发', () => {
  const equipped = r.tech === 'deep' ? ['fryer'] : r.tech === 'roast' ? ['grill'] : [];
  const keys = r.ing.concat(r.tech);
  const ev = evaluate(keys, [r.key], { equipped });
  assert.equal(totalN(ev, r.key), 1, r.key);
  assert.ok(Number.isFinite(ev.total));
  for (let i = 0; i < r.ing.length; i++) assert.equal(totalN(evaluate(keys.filter((_, j) => i !== j), [r.key], { equipped }), r.key), 0);
  assert.equal(evaluate(r.ing, [r.key], { equipped }).lines.length, 0);
});
test('土豆联动只统计触发的菜谱，持有但没触发的不算', () => {
  const keys = ['potato', 'cut', 'steam'];
  const ev = evaluate(keys, ['tudousi', 'zhengtudou', 'zhatudou']);
  assert.equal(ev.mult, 3); assert.equal(ev.trig, 2);
  assert.equal(evaluate(keys, ['tudousi', 'zhengtudou']).mult, ev.mult);
});
test('不封顶：12 次土豆菜谱相互放大', () => {
  const ev = evaluate(Array.from({ length: 12 }, () => ['potato', 'cut']).flat(), ['tudousi']);
  assert.equal(ev.trig, 12); assert.equal(ev.mult, 73); assert.equal(ev.after.draw, 12);   // 「切」生效一张多摸 1 张
});
test('食材替代只改配料判断，不改实体牌与基础分', () => {
  const ev = evaluate(['tofu', 'fry'], ['jiandan'], { helpers: ['doufushou'] });
  assert.equal(ev.trig, 1); assert.equal(ev.base, evaluate(['tofu', 'fry'], []).base);
  assert.equal(evaluate(['mushroom', 'fry'], ['niupai'], { helpers: ['sushi'] }).trig, 1);
  assert.equal(evaluate(['shrimp', 'steam'], ['zhengdoufu'], { helpers: ['xiaqiao'] }).trig, 1);
});
test('替代配料必须用不同实体牌，并且能正确回溯匹配', () => {
  assert.equal(evaluate(['tofu', 'steam'], ['xiadan'], { helpers: ['doufushou'] }).trig, 0);
  assert.equal(evaluate(['shrimp', 'steam'], ['sanxian'], { helpers: ['xiaqiao'] }).trig, 0);
  assert.equal(evaluate(['scallion', 'potato', 'stir'], ['tudoufanqie'], { helpers: ['peicai'] }).trig, 1);
  assert.equal(evaluate(['scallion', 'stir'], ['tudoufanqie'], { helpers: ['peicai'] }).trig, 0);
});
test('再触发只选已触发的其他菜谱；互相再触发会结束', () => {
  let ev = evaluate(['tofu', 'fry', 'steam'], ['zhengdoufu', 'doufujiaochao']);
  assert.equal(totalN(ev, 'zhengdoufu'), 2); assert.equal(ev.add, 12);
  assert.equal(evaluate(['tofu', 'fry'], ['zhengdoufu', 'doufujiaochao']).trig, 1);
  ev = evaluate(['scallion', 'beef', 'stir', 'tofu', 'fry', 'steam'], ['congniurou', 'doufujiaochao', 'zhengdoufu', 'congbao'], { helpers: ['diaowei'], spices: ['salt', 'soy'] });
  assert.ok(ev.trig > 4 && ev.trig < 15); assert.ok(Number.isFinite(ev.total));
});
test('首道由菜谱栏顺序决定，而不是数据文件或结算阶段', () => {
  const ev = evaluate(['tofu', 'fry', 'steam'], ['doufujiaochao', 'zhengdoufu'], { helpers: ['diaowei'], spices: ['salt'] });
  assert.equal(totalN(ev, 'doufujiaochao'), 2);
  assert.equal(totalN(ev, 'zhengdoufu'), 2);
});
test('重复触发完整收益：金币、抽牌、槽位和倍率', () => {
  const ex = { helpers: ['diaowei'], spices: ['salt', 'salt', 'salt'] };
  assert.equal(evaluate(['mushroom', 'roast'], ['kaomogu'], ex).gold, 8);
  assert.equal(evaluate(['mushroom', 'egg', 'steam'], ['moguzhengdan'], ex).after.draw, 8);
  assert.equal(evaluate(['egg', 'steam'], ['zhengdan'], ex).after.slot, 4);
  assert.equal(evaluate(['tofu', 'beef', 'stir'], ['mapo'], ex).mult, 5.06);
  const hundred = evaluate(['egg', 'fry'], ['jiandan'], { helpers: ['diaowei'], spices: Array(100).fill('salt') });
  assert.equal(hundred.trig, 101); assert.equal(hundred.lines.reduce((s, l) => s + l.a, 0), 505); assert.equal(hundred.add, 705); // 盐额外 +200
});
test('老饕的明示限制同时阻止重复触发', () => {
  const ev = evaluate(['egg', 'fry', 'egg', 'fry'], ['jiandan'], { helpers: ['diaowei'], spices: ['salt'], oneEach: true });
  assert.equal(ev.trig, 1);
  assert.equal(evaluate(['egg', 'fry'], ['jiandan'], { disabled: ['jiandan'], helpers: ['diaowei'], spices: ['salt'] }).trig, 0);
});
test('复制来源准确，复制到永久牌组且不带印记，重复也生效', () => {
  const { g, fa } = run(['shrimp', 'fry', 'salt', 'salt'], ['xiangjianxia'], ['diaowei']);
  assert.equal(fa.extra.filter(x => x.key === 'shrimp').length, 3);
  assert.equal(g.deck.filter(k => k === 'shrimp').length, 4);   // 原来 1 张 + 复制 3 张
  assert.ok(g.stamps.every(x => x === null));
  const out = run(['tofu', 'tomato', 'mix', 'potato'], ['doufufanqie']);
  assert.deepEqual(out.fa.extra.map(x => x.key), ['tomato']);
});
test('每份菜谱分别复制自己参与的原料', () => {
  const { fa } = run(['shrimp', 'fry', 'shrimp', 'fry'], ['xiangjianxia']);
  assert.equal(fa.extra.length, 2);
});
test('盖印仅作用于触发该菜谱的实体配料', () => {
  let out = run(['mushroom', 'mix', 'mushroom'], ['paofa']);
  assert.deepEqual(out.fa.cards.map(x => x.stamp), ['fresh', null, null]);
  out = run(['beef', 'mushroom', 'roast', 'grill', 'egg'], ['niuroumogu']);
  assert.equal(out.g.deck.filter(k => k === 'beef' || k === 'mushroom').length, 2);
  assert.equal(out.g.stamps.filter(s => s === 'aroma').length, 2);
});
test('伙计：护蛋、回收、蒸手和灶边学徒符合描述', () => {
  assert.deepEqual(run(['egg', 'egg', 'fry'], [], ['hudan']).fa.cards.map(x => x.stamp), ['fresh', null, null]);
  assert.equal(run(['tofu', 'mix', 'egg'], ['paofadoufu'], ['chuyu']).p.ev.gold, 1);
  assert.equal(run(['tofu', 'mix'], ['paofadoufu'], ['chuyu']).p.ev.gold, 0);
  assert.equal(run(['egg', 'steam'], [], ['zhengshou']).p.ev.mult, 1);
  assert.equal(run(['egg', 'steam'], ['zhengdan'], ['zhengshou']).p.ev.mult, 1.5);
  assert.equal(run(['mushroom', 'egg', 'steam'], ['zhengdan', 'moguzhengdan'], ['zaobian']).p.ev.mult, 1.5);
  assert.equal(run(['egg', 'steam'], ['zhengdan'], ['zaobian']).p.ev.mult, 1);
  assert.ok(run(['egg', 'steam'], ['zhengdan'], ['zhengshou']).fa.cards.every(x => x.to === undefined));
});
test('伙计：余锅只复制触发炸菜谱的荤菜，菜园只加分', () => {
  assert.equal(run(['shrimp', 'deep'], [], ['yuguo']).fa.extra.length, 0);
  assert.equal(run(['shrimp', 'deep'], ['zhaxia'], ['yuguo']).fa.extra.length, 1);
  assert.equal(run(['tomato', 'cut'], ['qiefanqie'], ['caiyuan']).fa.extra.length, 0);
});
test('伙计：复锅、掌柜、土灶、火候与备料', () => {
  assert.equal(evaluate(['beef', 'stir'], ['huiguo'], { helpers: ['fuguo'] }).trig, 2);
  assert.equal(evaluate(['egg', 'fry'], ['jiandan'], { helpers: ['diancai'] }).gold, 1);
  assert.equal(evaluate(['potato', 'deep'], ['zhatudou'], { helpers: ['tuzao'] }).mult, 2.75);   // 1 + 炸 .5 + 菜谱 1 + 土灶 .25
  const keys = Array.from({ length: 6 }, () => ['egg', 'fry']).flat();
  assert.equal(evaluate(keys, ['jiandan'], { helpers: ['huoyan'] }).mult, 3);
  const g = K.newRun(12); g.helpers = ['beiliao']; K.clearRound(g); K.leaveShop(g); assert.equal(g.handSize, 10);
});
test('新增装备扩大加工范围、重复搅拌菜谱和增加抽牌', () => {
  assert.equal(evaluate(['potato', 'shrimp', 'deep'], ['tudouxia']).trig, 0);
  assert.equal(evaluate(['potato', 'shrimp', 'deep'], ['tudouxia'], { equipped: ['fryer'] }).trig, 1);
  assert.equal(evaluate(['scallion', 'potato', 'roast'], ['congshaotudou'], { equipped: ['grill'] }).trig, 1);
  assert.equal(evaluate(['tofu', 'mix'], ['paofadoufu'], { equipped: ['mortar'] }).trig, 2);
  assert.equal(evaluate(['mushroom', 'egg', 'steam'], ['zhengdan', 'moguzhengdan'], { equipped: ['brothpot'] }).after.draw, 4);
});
test('新增装备和伙计都能在商店出现', () => {
  const seen = new Set();
  for (let i = 1; i <= 600; i++) K.rollShop(K.newRun(i)).forEach(x => seen.add(x.key));
  K.EQUIP_KEYS.forEach(k => assert.ok(seen.has(k), k));
  K.HELPERS.forEach(h => assert.ok(seen.has(h.key), h.key));
});
test('32 回合目标严格递增，第 32 回合通关且不开第 9 关', () => {
  let prev = 0; const g = K.newRun(31);
  for (let i = 0; i < 32; i++) {
    assert.ok(g.target > prev, `${i + 1}: ${g.target} <= ${prev}`); prev = g.target;
    g.score = g.target; K.clearRound(g);
    assert.equal(!!g.won, i === 31);
    K.leaveShop(g);
  }
  assert.equal(g.history.length, 32); assert.equal(g.bossesBeat, 8);
  assert.equal(g.level, 8); assert.equal(g.phase, 'won');
});
// ---- 2026-11-07：牌不消耗、回合内不重洗、手法特性、改良包、菜谱栏上限 ----
test('打出的牌进弃牌堆，牌组不变；下回合整副重洗', () => {
  const g = K.newRun(5); const n0 = g.deck.length;
  const egg = g.hand.find(c => c.key === 'egg') || K.mk('egg'), fry = g.hand.find(c => c.def.type === 'tech');
  if (!g.hand.includes(egg)) g.hand.push(egg);
  g.target = 1e9; assert.ok(K.playSel(g, [egg.uid, fry.uid]));
  assert.equal(g.deck.length, n0); assert.ok(g.discard.includes(egg));
  g.score = g.target; K.clearRound(g); K.leaveShop(g);
  assert.equal(g.pile.length + g.hand.length, g.deck.length);
});
test('回合内不重洗：牌堆摸空后只剩手牌，弃牌堆不回来', () => {
  const g = K.newRun(6); g.pile = []; g.discard = [K.mk('egg'), K.mk('fry')]; g.hand = [K.mk('salt')]; g.discardsLeft = 2; g.phase = 'play';
  assert.ok(K.discardSel(g, [g.hand[0].uid])); assert.equal(g.hand.length, 0); assert.equal(g.discard.length, 3);
  assert.equal(g.phase, 'over');   // 手里没有原料、牌堆空了：收摊
});
test('出牌 3 次；一次最多弃槽位数张；改不了任何菜谱的改法不出', () => {
  assert.equal(K.CFG.plays, 3);
  const g = K.newRun(9); g.boss = null; g.phase = 'play'; g.slotCap = 4; g.discardsLeft = 2;
  g.hand = ['egg', 'egg', 'egg', 'egg', 'tomato'].map(k => K.mk(k)); g.pile = ['egg', 'egg', 'egg', 'egg', 'egg'].map(k => K.mk(k));
  assert.ok(!K.discardSel(g, g.hand.map(c => c.uid)));
  assert.ok(K.discardSel(g, g.hand.slice(0, 4).map(c => c.uid)));
  for (let s = 1; s <= 200; s++) { const h = K.newRun(s); h.recipes = ['jiandan']; K.modFxOptions(h, 3).forEach(o => assert.ok(K.modUseful(h, o), K.modText(o))); }
  const h = K.newRun(3); h.phase = 'shop'; h.coins = 99; h.recipes = ['jiandan', 'zhaxia'];
  h.packs = [{ kind: 'pack', key: 'mod', price: 5, sold: false }]; assert.ok(K.openPack(h, 0));
  h.pack.items[0] = { kind: 'modfx', op: 'swapTech', from: 'fry', to: 'stir' };
  assert.ok(!K.takeFromPack(h, 0, 'zhaxia'));   // 炸虾里没有煎：不能选
  assert.ok(K.takeFromPack(h, 0, 'jiandan'));
});
test('基础槽位 4；搅拌也占槽位；搅拌加工 2 种原料 倍+.5', () => {
  assert.equal(K.CFG.baseSlots, 4);
  const g = K.newRun(7); g.boss = null; g.hand = ['egg', 'tomato', 'tofu', 'mix'].map(k => K.mk(k)); g.slotCap = 4;
  const p = K.previewSel(g, g.hand.map(c => c.uid)); assert.ok(!p.over && p.playable);
  g.hand.push(K.mk('stir')); assert.ok(K.previewSel(g, g.hand.map(c => c.uid)).over);
  assert.equal(evaluate(['egg', 'tomato', 'mix'], []).mult, 1.5);
  assert.equal(evaluate(['egg', 'egg', 'mix'], []).mult, 1);
});
test('手法特性：煎 料×2、炸 倍+.5、切 多摸 1 张', () => {
  assert.equal(evaluate(['beef', 'fry'], []).base, 6 * 2 + 3);
  assert.equal(evaluate(['beef', 'stir'], []).base, 6 + 3);
  assert.equal(evaluate(['shrimp', 'deep'], []).mult, 1.5);
  assert.equal(evaluate(['deep', 'shrimp'], []).mult, 1);   // 没加工到原料不算
  assert.equal(evaluate(['tomato', 'cut'], []).after.draw, 1);
});
test('手法特性：烤过的原料永久 +1 分，下回合还在', () => {
  const { g } = run(['beef', 'roast'], []);
  assert.equal(g.plus[0], 1);
  g.score = g.target; K.clearRound(g); K.leaveShop(g);
  const beef = g.pile.concat(g.hand).find(c => c.key === 'beef'); assert.equal(beef.plus, 1);
  assert.equal(evaluate(['beef', 'stir'], []).base + 1, K.evaluate([beef, K.mk('stir')], { recipes: [], lv: {}, equipped: [], slotCap: 4, spices: [], helpers: [] }).base);
});
test('不再有补货包；改良包能出现', () => {
  assert.ok(!K.PACKS.box); const seen = new Set();
  for (let i = 1; i < 300; i++) { const g = K.newRun(i); g.phase = 'shop'; K.rollPacks(g).forEach(p => seen.add(p.key)); }
  assert.ok(seen.has('mod') && seen.has('trim'));
});
test('菜谱改良包：3 个不同改法，挑一道菜谱生效，只改本局', () => {
  for (let s = 1; s <= 200; s++) {
    const g = K.newRun(s); g.recipes = ['jiandan', 'fanqiedan', 'zhaxia']; g.phase = 'shop';
    const os = K.modFxOptions(g, 3); assert.equal(os.length, 3);
    assert.equal(new Set(os.map(o => o.op + o.from + o.to)).size, 3);
    for (const o of os) assert.ok(K.modText(o) && !K.modText(o).includes('undefined'));
  }
  const g = K.newRun(2); g.phase = 'shop'; g.coins = 99; g.recipes = ['kaoniurou'];
  g.packs = [{ kind: 'pack', key: 'mod', price: 5, sold: false }]; assert.ok(K.openPack(g, 0));
  g.pack.items[0] = { kind: 'modfx', op: 'delIng', from: 'beef', to: null };
  assert.ok(!K.takeFromPack(g, 0, 'jiandan'));   // 不是自己的菜谱
  assert.ok(K.takeFromPack(g, 0, 'kaoniurou'));
  assert.deepEqual(K.effRecipe(g.mods, 'kaoniurou').ing, []); assert.equal(K.effRecipe(g.mods, 'kaoniurou').tech, 'roast');
  assert.deepEqual(K.RECIPE_BY.kaoniurou.ing, ['beef']);
});
test('菜谱改良包：每个改法单独抽稀有度，普通只换，稀有才能去掉或加料', () => {
  assert.ok(!K.PACKS.modR);
  let n = 0, rare = 0;
  for (let s = 1; s <= 400; s++) {
    const g = K.newRun(s); g.recipes = ['jiandan', 'zhaxia'];
    K.modFxOptions(g, 3, false).forEach(o => assert.ok(['swapIng', 'swapTech'].includes(o.op) && !o.rare));
    K.modFxOptions(g, 3, true).forEach(o => assert.ok(['delIng', 'delTech', 'addIng'].includes(o.op) && o.rare));
    K.modFxOptions(g, 3).forEach(o => { n++; if (o.rare) rare++; });
  }
  assert.ok(rare / n > .12 && rare / n < .28, `稀有占比 ${rare / n}`);
});
test('改法用到菜谱上：换、删、加；没有对应的东西就不变', () => {
  const R = K.RECIPE_BY;
  assert.deepEqual(K.applyModFx(R.kaoniurou, { op: 'delIng', from: 'beef' }).ing, []);
  assert.ok(!K.modChanges(R.kaoniurou, { op: 'delTech', from: 'steam' }));            // 烤牛肉删「蒸」：没变化
  assert.equal(K.applyModFx(R.kaoniurou, { op: 'delTech', from: 'roast' }).tech, 'any');
  assert.deepEqual(K.applyModFx(R.zhaxia, { op: 'swapIng', from: 'shrimp', to: 'beef' }).ing, ['beef']);
  assert.ok(!K.modChanges(R.jiandan, { op: 'swapIng', from: 'shrimp', to: 'beef' }));
  assert.equal(K.applyModFx(R.jiandan, { op: 'swapTech', from: 'fry', to: 'stir' }).tech, 'stir');
  const add = K.applyModFx(R.jiandan, { op: 'addIng', to: 'tofu' }); assert.deepEqual(add.ing, ['egg', 'tofu']); assert.equal(add.x, 2);
});
test('改良后的菜谱：任意原料、任意手法、加料都能触发', () => {
  const ev = (keys, mods, rec = ['kaoniurou']) => K.evaluate(keys.map(k => K.mk(k)), { recipes: rec, lv: {}, mods, equipped: [], slotCap: 9, spices: [], helpers: [] });
  assert.equal(ev(['tomato', 'roast'], { kaoniurou: { ing: [], tech: 'roast', x: 1 } }).trig, 1);   // 烤肉：烤任意原料
  assert.equal(ev(['roast'], { kaoniurou: { ing: [], tech: 'roast', x: 1 } }).trig, 0);            // 没加工到原料不算
  assert.equal(ev(['beef', 'stir'], { kaoniurou: { ing: ['beef'], tech: 'any', x: 1 } }).trig, 1);
  assert.equal(ev(['egg', 'stir'], { jiandan: { ing: ['egg'], tech: 'stir', x: 1 } }, ['jiandan']).trig, 1);
  const more = ev(['egg', 'tofu', 'stir'], { jiandan: { ing: ['egg', 'tofu'], tech: 'stir', x: 2 } }, ['jiandan']);
  assert.equal(more.lines[0].a, 10);
  assert.ok(K.recipeCond(K.effRecipe({ jiandan: { ing: ['egg', 'tofu'], tech: 'fry', x: 2 } }, 'jiandan')).includes('火候包'));
  assert.equal(K.fxOf(Object.assign({}, K.RECIPE_BY.mapo, { x: 2 }), 1).xm, 2);
});
test('菜谱栏上限 6，卖菜谱退一半钱', () => {
  const g = K.newRun(3); g.phase = 'shop'; g.coins = 99;
  g.recipes = ['jiandan', 'xiaren', 'fanqiedan', 'congbao', 'zhaxia', 'zhatudou']; g.lv = { zhaxia: 2 };
  g.shop = [{ kind: 'recipe', key: 'mapo', price: 9, sold: false }];
  assert.ok(K.recipesFull(g)); assert.ok(!K.buy(g, 0));
  const c0 = g.coins; assert.ok(K.sellRecipe(g, 'zhaxia')); assert.equal(g.coins - c0, Math.floor((7 + 2) / 2));
  assert.ok(!g.recipes.includes('zhaxia') && !g.lv.zhaxia); assert.ok(K.buy(g, 0));
});
test('火候包、灶头师傅：手法多加工份数，改过的双料煎蛋能做出来', () => {
  const R = { jiandan: { ing: ['egg', 'tofu'], tech: 'fry', x: 2 } };
  const ev = (ex = {}) => K.evaluate(['egg', 'tofu', 'fry'].map(k => K.mk(k)), Object.assign({ recipes: ['jiandan'], lv: {}, mods: R, equipped: [], slotCap: 9, spices: [], helpers: [] }, ex));
  assert.equal(ev().trig, 0);
  assert.equal(ev({ capUp: { fry: 1 } }).trig, 1);
  assert.equal(ev({ helpers: ['zaotou'] }).trig, 1);
  assert.equal(K.techCap('stir', [], { stir: 2 }, ['zaotou']), 4);   // 灶头师傅不管炒
  assert.equal(K.techCap('deep', [K.CARD_DEFS.fryer], { deep: 1 }, ['zaotou']), 4);
  const g = K.newRun(4); g.phase = 'shop'; g.coins = 99; g.packs = [{ kind: 'pack', key: 'heat', price: 6, sold: false }];
  assert.ok(K.openPack(g, 0)); const k = g.pack.items[0].key; assert.ok(K.takeFromPack(g, 0)); assert.equal(g.capUp[k], 1);
  g.capUp = Object.fromEntries(K.TECH_KEYS.map(x => [x, K.CFG.heatMax])); assert.equal(K.heatable(g).length, 0);
});
console.log(`${checks} 项通过；${K.RECIPES.length} 道菜谱，${K.HELPERS.length} 位伙计，${K.EQUIP_KEYS.length} 件装备`);
