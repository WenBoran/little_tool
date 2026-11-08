// 出锅后改牌组：伙计、印记、装备、菜谱逐条验算。node sim/t_fate.js .
const K = require('./load')(process.argv[2]); let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fail++; };
// 造一局：手牌 = cards（[key, stamp]），牌组里也有这些牌；play 是按顺序打出的下标
function run(cards, play, o = {}) {
  const G = K.newRun(11); G.target = o.target || 9999; G.helpers = o.helpers || []; G.recipes = o.recipes || ['jiandan'];
  G.deck = []; G.stamps = []; G.hand = []; G.pile = []; G.discard = []; G.slotCap = 8; G.handSize = 0; G.cooks = 0;   // 不补牌，弃牌堆才不会被洗回手里
  (o.deck || []).forEach(k => { G.deck.push(k); G.stamps.push(null); });
  cards.forEach(([k, s]) => { const c = K.mk(k, s); G.hand.push(c); G.deck.push(k); G.stamps.push(s || null); });
  if (o.before) o.before(G);
  const uids = play.map(i => G.hand[i].uid);
  const p = K.playSel(G, uids);
  const cnt = k => G.deck.filter(x => x === k).length, st = k => G.deck.map((x, i) => x === k ? G.stamps[i] : undefined).filter(x => x !== undefined);
  // back：放回牌堆（或因「切」多摸又回到手里）的牌，本回合还能再用
  const back = k => G.pile.concat(G.hand).filter(c => c.key === k).length;
  return { G, p, cnt, st, back, dis: G.discard.map(c => c.key) };
}
let r;
r = run([['egg'], ['fry']], [0, 1]); ok(r.cnt('egg') === 1 && r.cnt('fry') === 1 && r.dis.length === 2 && !r.back('egg'), '没有伙计：打出的牌进弃牌堆，牌组不变');
r = run([['egg'], ['mix']], [0, 1], { helpers: ['chen'] }); ok(r.cnt('tofu') === 1 && r.cnt('egg') === 0 && r.cnt('mix') === 1, '豆腐老陈：搅过的蛋 → 豆腐');
r = run([['egg'], ['fry']], [0, 1], { helpers: ['chen'] }); ok(r.cnt('tofu') === 0, '豆腐坊老陈：煎的蛋不变');
r = run([['scallion'], ['scallion'], ['stir']], [0, 1, 2], { helpers: ['ershen'] }); ok(r.cnt('scallion') === 3, `种葱的二婶：2 葱留下 +1 → ${r.cnt('scallion')}`);
r = run([['scallion'], ['stir']], [0, 1], { helpers: ['ershen'], deck: Array(40).fill('egg') }); ok(r.cnt('scallion') === 2, '二婶：牌组不设上限，40 张也照样多一张');
r = run([['egg'], ['mix']], [0, 1], { helpers: ['liu'] }); ok(r.cnt('stir') === 1 && r.cnt('mix') === 0, '学徒小刘：搅拌 → 炒');
r = run([['mix'], ['egg']], [0, 1], { helpers: ['liu'] }); ok(r.p === null || r.cnt('stir') === 0, '学徒小刘：没起作用的搅拌不变');
r = run([['tomato'], ['egg'], ['tomato'], ['stir']], [0, 1, 2, 3], { helpers: ['zhou'] }); ok(r.p.ev.steps.some(s => s.kind === 'helper' && s.add === 6) && !r.back('tomato'), '收菜老周：2 种原料 +6，不回牌堆');
r = run([['egg'], ['fry'], ['chili'], ['soy']], [0, 1, 2, 3], { helpers: ['mei'] }); ok(r.cnt('salt') === 1 && r.cnt('chili') === 0 && r.cnt('soy') === 1, '洗碗小妹：第一张调料 → 盐');
r = run([['tomato'], ['cut'], ['potato'], ['cut']], [0, 1, 2, 3], { helpers: ['sun'] }); ok(r.p.ev.after.draw === 4 && !r.back('cut'), '磨刀老孙：每张切多摸 2 张');
r = run([['egg'], ['fry'], ['tomato'], ['potato'], ['beef']], [0, 1, 2, 3, 4], { helpers: ['dashen'] }); ok(r.p.ev.steps.some(s => s.kind === 'helper' && s.add === 9) && !r.back('tomato'), '帮厨大婶：3 份生料 +9');
r = run([['egg'], ['fry']], [0, 1], { helpers: ['jiang'] }); ok(r.cnt('egg') === 1 && r.st('egg')[0] === 'aroma', '酱园掌柜：触发菜谱的蛋盖「香」');
r = run([['tomato'], ['fry']], [0, 1], { helpers: ['jiang'] }); ok(!r.st('tomato')[0], '酱园掌柜：没触发菜谱不盖');
r = run([['egg', 'fresh'], ['fry', 'aroma']], [0, 1], { helpers: ['fan'] }); ok(r.st('egg')[0] === 'aroma' && r.st('fry')[0] === 'gold', '鲜货贩子：鲜→香、香→金');
r = run([['egg', 'gold'], ['fry']], [0, 1], { helpers: ['jin'] }); ok(r.st('egg')[0] === 'gold' && r.p.ev.mult === 1.5 && !r.back('egg'), '金掌柜：金 倍+.5，不回牌堆');
r = run([['egg'], ['fry']], [0, 1], { helpers: ['huotou'], before: G => { G.playsLeft = 1; } }); ok(r.st('fry')[0] === 'fresh' && !r.st('egg')[0], '火头军：最后一锅的手法盖鲜');
r = run([['egg'], ['fry']], [0, 1], { helpers: ['huotou'], target: 5 }); ok(r.st('fry')[0] === 'fresh', '火头军：达标那锅也算收尾');
r = run([['egg'], ['fry']], [0, 1], { helpers: ['huotou'] }); ok(!r.st('fry')[0], '火头军：中间的锅不算');
r = run([['egg'], ['beef'], ['fry'], ['salt']], [0, 1, 2, 3], { helpers: ['wang'] }); ok(r.st('beef')[0] === 'fresh' && !r.st('egg')[0], '酱缸王伯：调料锅最高分原料（牛肉）盖鲜');
r = run([['egg'], ['tomato'], ['stir']], [0, 1, 2], { helpers: ['qiang'] }); ok(r.p.ev.mult === 2 && !r.back('egg'), '双灶阿强：首次出牌 倍+1');
{ const G = K.newRun(11); G.target = 9999; G.helpers = ['qiang']; G.recipes = ['jiandan']; G.deck = []; G.stamps = []; G.pile = []; G.discard = []; G.handSize = 0; G.cooks = 0; G.slotCap = 8;
  const a = ['egg', 'fry', 'egg', 'fry', 'tomato'].map(k => K.mk(k)); G.hand = a.slice(); a.forEach(c => { G.deck.push(c.key); G.stamps.push(null); });
  K.playSel(G, [a[0].uid, a[1].uid]); K.playSel(G, [a[2].uid, a[3].uid]); ok(G.last.ev.mult === 1, '双灶阿强：第二次出牌不生效'); }
r = run([['egg', 'quick'], ['fry']], [0, 1]); ok(r.st('egg')[0] === 'quick' && r.p.ev.after.draw === 1 && !r.back('egg'), '「顺」印记：多摸 1 张，印记还在');
r = run([['egg', 'dup'], ['fry']], [0, 1]); ok(r.cnt('egg') === 2 && r.st('egg').every(s => !s), '「双」印记：变 2 张，都不带印记');
r = run([['mushroom'], ['steam'], ['tomato'], ['cut'], ['steamer'], ['cboard']], [0, 1, 2, 3, 4, 5]); ok(r.cnt('mushroom') === 1 && r.st('tomato')[0] === 'fresh' && r.cnt('steamer') === 1 && r.p.ev.cardScore[r.p.slots[0].uid] === 5, '蒸笼 蒸料+2、砧板切料盖鲜');
r = run([['mushroom'], ['mix']], [0, 1], { recipes: ['paofa'] }); ok(r.cnt('mushroom') === 1 && r.st('mushroom')[0] === 'fresh' && !r.back('mushroom'), '泡发香菇：蘑菇盖「鲜」');
r = run([['scallion'], ['deep']], [0, 1], { recipes: ['congyou'] }); ok(r.cnt('chili') === 1 && r.cnt('scallion') === 1, '葱油：多 1 张辣椒');
r = run([['egg'], ['mix']], [0, 1], { helpers: ['chen'], before: G => { G.boss = { ban: ['egg'] }; } }); ok(r.cnt('tofu') === 0, '挑剔食客不吃：0 分，伙计也不生效');
// 去向预览和真实结算一致
{ const G = K.newRun(3); G.helpers = ['chen', 'jiang', 'liu']; G.hand = [K.mk('egg'), K.mk('mix')]; G.deck.push('egg', 'mix'); G.stamps.push(null, null); G.target = 9999;
  const pv = K.fatesOf(G, K.previewSel(G, G.hand.map(c => c.uid))); ok(pv.cards[0].key === 'tofu' && pv.cards[0].stamp === null && pv.cards[1].key === 'stir', '预览：蛋→豆腐（搅拌加工的蛋没触发煎蛋所以不盖香）、搅拌→炒'); }
// ---- 2026-11-06 校准后的规则 ----
{ const ev = (ks, rc, ex = {}) => K.evaluate(ks.map(k => Array.isArray(k) ? K.mk(k[0], k[1]) : K.mk(k)), Object.assign({ recipes: rc, lv: {}, equipped: [], slotCap: 6, spices: [], helpers: [] }, ex));
  let e = ev([['tomato', 'fresh'], 'cut'], [], { spices: ['sugar'] }); ok(e.cardScore[Object.keys(e.cardScore)[0]] === 16, `「鲜」会被翻倍：(5+3)×2 = ${e.cardScore[Object.keys(e.cardScore)[0]]}`);
  e = ev(['egg', 'fry', 'egg', 'fry'], ['jiandan'], { helpers: ['chu'], spices: ['vinegar'] }); ok(e.trig === 2 && e.mult === 2, `大厨、香醋按触发次数算：触发 ${e.trig} 次 倍率 ${e.mult}`);
  e = ev(['mushroom', 'tomato', 'steam'], ['zhengmogu']); ok(e.add === 6, `蒸蘑菇：每份蔬菜 +3（2 份 = ${e.add}）`);
  e = ev(['scallion', 'mix', 'egg', 'fry', 'cut'], ['banhua']); ok(e.mult === 2, `葱花拌：每张生效手法 倍+.5（2 张生效 → ${e.mult}）`);
  const G = K.newRun(9); G.boss = K.BOSSES.find(b => b.key === 'nofry'); G.hand = [K.mk('egg'), K.mk('deep')]; ok(!K.previewSel(G, G.hand.map(c => c.uid)).playable, '怕油的阿姨：无法打出炸'); }
console.log(fail ? `${fail} 条失败` : '全部通过'); process.exit(fail ? 1 : 0);
