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
  assert.equal(ev.trig, 12); assert.equal(ev.mult, 73);
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
  assert.equal(g.deck.filter(k => k === 'shrimp').length, 3);
  assert.ok(g.stamps.every(x => x === null));
  const out = run(['tofu', 'tomato', 'mix', 'potato'], ['doufufanqie']);
  assert.deepEqual(out.fa.extra.map(x => x.key), ['tomato']);
});
test('每份菜谱分别复制自己参与的原料', () => {
  const { fa } = run(['shrimp', 'fry', 'shrimp', 'fry'], ['xiangjianxia']);
  assert.equal(fa.extra.length, 2);
});
test('留牌和盖印仅作用于触发该菜谱的实体配料', () => {
  let out = run(['tofu', 'mix', 'tofu'], ['paofadoufu']);
  assert.deepEqual(out.fa.cards.map(x => x.to), ['deck', 'gone', 'gone']);
  out = run(['beef', 'mushroom', 'roast', 'grill', 'egg'], ['niuroumogu']);
  assert.equal(out.g.deck.filter(k => k === 'beef' || k === 'mushroom').length, 2);
  assert.equal(out.g.stamps.filter(s => s === 'aroma').length, 2);
});
test('伙计：护蛋、回收、蒸手和同手法留牌符合描述', () => {
  assert.deepEqual(run(['egg', 'egg', 'fry'], [], ['hudan']).fa.cards.map(x => x.to), ['deck', 'gone', 'gone']);
  assert.equal(run(['tofu', 'mix', 'egg'], ['paofadoufu'], ['chuyu']).fa.cards.find(x => x.c.key === 'egg').to, 'deck');
  assert.equal(run(['egg', 'steam'], [], ['zhengshou']).fa.cards.find(x => x.c.key === 'steam').to, 'gone');
  assert.equal(run(['egg', 'steam'], ['zhengdan'], ['zhengshou']).fa.cards.find(x => x.c.key === 'steam').to, 'deck');
  assert.equal(run(['mushroom', 'egg', 'steam'], ['zhengdan', 'moguzhengdan'], ['zaobian']).fa.cards.find(x => x.c.key === 'steam').to, 'deck');
  assert.equal(run(['egg', 'steam', 'salt'], ['zhengdan'], ['zaobian', 'diaowei']).fa.cards.find(x => x.c.key === 'steam').to, 'gone');
});
test('伙计：余锅只复制触发炸菜谱的荤菜，菜园只加分', () => {
  assert.equal(run(['shrimp', 'deep'], [], ['yuguo']).fa.extra.length, 0);
  assert.equal(run(['shrimp', 'deep'], ['zhaxia'], ['yuguo']).fa.extra.length, 1);
  assert.equal(run(['tomato', 'cut'], ['qiefanqie'], ['caiyuan']).fa.extra.length, 0);
});
test('伙计：复锅、掌柜、土灶、火候与备料', () => {
  assert.equal(evaluate(['beef', 'stir'], ['huiguo'], { helpers: ['fuguo'] }).trig, 2);
  assert.equal(evaluate(['egg', 'fry'], ['jiandan'], { helpers: ['diancai'] }).gold, 1);
  assert.equal(evaluate(['potato', 'deep'], ['zhatudou'], { helpers: ['tuzao'] }).mult, 2.25);
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
console.log(`${checks} 项通过；${K.RECIPES.length} 道菜谱，${K.HELPERS.length} 位伙计，${K.EQUIP_KEYS.length} 件装备`);
