// 新菜谱效果逐条验算
const K = require('./load')(process.argv[2]); let fail = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fail++; };
const ev = (keys, recipes, extra = {}) => K.evaluate(keys.map(k => K.mk(k)), Object.assign({ recipes, lv: {}, equipped: [], slotCap: 5, spices: [], helpers: [] }, extra));
const b = (keys, ex) => ev(keys, [], ex);
let e = ev(['tofu', 'beef', 'stir'], ['mapo']), e0 = b(['tofu', 'beef', 'stir']);
ok(e.mult === 1.5 && e.total === Math.round(e0.base * 1.5), `麻婆豆腐 倍×1.5：${e0.total} → ${e.total}`);
e = ev(['tofu', 'beef', 'stir'], ['mapo', 'shaoniurou']); ok(e.lines.length === 1, '麻婆豆腐只触发自己（土豆烧牛肉要土豆）');
e = ev(['potato', 'beef', 'stir'], ['shaoniurou']); ok(e.mult === 2, `土豆烧牛肉 倍+1 → ${e.mult}`);
e = ev(['mushroom', 'deep'], ['zhamogu']); ok(e.mult === 1, '炸蘑菇 平时不乘');
e = ev(['mushroom', 'deep'], ['zhamogu'], { lastPlay: true }); ok(e.mult === 2, '炸蘑菇 最后一锅 倍×2');
e = ev(['mushroom', 'roast'], ['kaomogu']); ok(e.gold === 2 && e.add === 4, '烤蘑菇 小费 +2、+4 分');
e = ev(['beef', 'stir'], ['huiguo']); ok(e.keep.length === 1 && e.add === 6, '回锅肉 手法留下 +6');
e = ev(['shrimp', 'mushroom', 'tofu', 'steam'], ['sanxian']); ok(e.add === 16 && e.mult === 2, '三鲜豆腐 +16 倍+1');
e = ev(['shrimp', 'egg', 'steam'], ['xiadan']); ok(e.add === 8 && e.mult === 1.5, '鲜虾蒸蛋 +8 倍+.5');
e = ev(['scallion', 'tofu', 'mix'], ['bandoufu']); ok(e.add === 14, '小葱拌豆腐 +14');
e = ev(['beef', 'fry'], [], { spices: ['wine'] }); e0 = b(['beef', 'fry']); ok(e.base === e0.base + 6, '料酒 荤×2（牛肉 6→12）');
// 回锅肉：手法回弃牌堆、不从牌组删
let G = K.newRun(5); G.recipes.push('huiguo'); G.hand = [K.mk('beef'), K.mk('stir'), K.mk('egg')]; G.deck.push('beef', 'stir'); G.stamps.push(null, null);
const d0 = G.deck.filter(k => k === 'stir').length; G.target = 9999;
K.playSel(G, [G.hand[0].uid, G.hand[1].uid]);
ok(G.deck.filter(k => k === 'stir').length === d0 && !G.discard.some(c => c.key === 'stir'), '回锅肉：炒没用掉，放回牌组');
// 挑嘴的小孩
G = K.newRun(8); G.boss = K.BOSSES.find(x => x.key === 'kid'); ok(K.banned(G, K.mk('mushroom')) && !K.banned(G, K.mk('egg')), '挑嘴的小孩 不吃蘑菇');
console.log(fail ? `${fail} 项失败` : '全部通过');
