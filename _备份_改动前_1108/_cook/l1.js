// ===== 数据：卡牌、菜谱、食客 =====
const byKey = list => list.reduce((o, x) => { o[x.key] = x; return o; }, {});   // 代替 Object.fromEntries（Chrome 73+）
const CARD_DEFS = {
  egg:      { type: 'ing',  name: '鸡蛋', base: 4 },
  tomato:   { type: 'ing',  name: '番茄', base: 5, veg: 1 },
  potato:   { type: 'ing',  name: '土豆', base: 3, veg: 1 },
  mushroom: { type: 'ing',  name: '蘑菇', base: 3, veg: 1 },
  beef:     { type: 'ing',  name: '牛肉', base: 6, meat: 1 },
  tofu:     { type: 'ing',  name: '豆腐', base: 3 },
  shrimp:   { type: 'ing',  name: '鲜虾', base: 5, meat: 1 },
  scallion: { type: 'ing',  name: '青葱', base: 2, veg: 1 },
  // 手法专属特性（见 l2.js evaluate / l3.js fatesOf）：煎 料分×2、炸 倍+0.5、切 多摸 1 张、烤 料永久 +1 分、搅拌 不占槽位
  fry:      { type: 'tech', name: '煎',   base: 3, desc: '加工的原料牌面分 ×2', tag: [['c', '料×2']] },
  cut:      { type: 'tech', name: '切',   base: 3, desc: '生效时，出牌后多摸 1 张', tag: [['r', '摸+1']] },
  deep:     { type: 'tech', name: '炸',   base: 2, desc: '生效时 倍率 +0.5', tag: [['m', '倍+.5']] },
  steam:    { type: 'tech', name: '蒸',   base: 2 },
  roast:    { type: 'tech', name: '烤',   base: 3, desc: '加工的原料永久牌面分 +1', tag: [['c', '料永久+1']] },
  stir:     { type: 'tech', name: '炒',   base: 3 },
  mix:      { type: 'tech', name: '搅拌', base: 1, desc: '不占槽位', tag: [['r', '不占槽']] },
  pan:   { type: 'equip', name: '平底锅', slots: 3, price: 5, desc: '槽位 +3' },
  pot:   { type: 'equip', name: '汤锅',   slots: 2, price: 5, desc: '槽位 +2\n每张「蒸」牌面分 +3', techBonus: ['steam', 3], short: '蒸+3' },
  oven:  { type: 'equip', name: '烤箱',   slots: 2, price: 5, desc: '槽位 +2\n每张「烤」牌面分 +4', techBonus: ['roast', 4], short: '烤+4' },
  knife: { type: 'equip', name: '菜刀',   slots: 1, price: 5, desc: '槽位 +1\n「切」加工 2 份', techDouble: 'cut', short: '切2份' },
  wok:   { type: 'equip', name: '大铁锅', slots: 4, price: 6, desc: '槽位 +4' },
  steamer: { type: 'equip', name: '蒸笼', slots: 2, price: 6, desc: '槽位 +2\n被「蒸」加工的原料放回牌堆' },
  cboard:  { type: 'equip', name: '砧板', slots: 1, price: 5, desc: '槽位 +1\n被「切」加工的原料盖上「鲜」' },
  // 调料：不占槽位，只作用于这一锅
  salt:    { type: 'spice', name: '盐',   price: 3, desc: '每份原料 +2 分', short: '+2/料', fx: { perIng: 2 } },
  soy:     { type: 'spice', name: '酱油', price: 3, desc: '手法分 ×2',     short: '法×2', fx: { techX: 2 } },
  chili:   { type: 'spice', name: '辣椒', price: 4, desc: '倍率 +1',       short: '倍+1',   fx: { mult: 1 } },
  sugar:   { type: 'spice', name: '白糖', price: 3, desc: '蔬菜分 ×2',     short: '蔬×2', fx: { vegX: 2 } },
  vinegar: { type: 'spice', name: '香醋', price: 4, desc: '每触发 1 次菜谱 倍率 +0.5', short: '倍+.5/谱', fx: { multPerRecipe: 0.5 } },
  wine:    { type: 'spice', name: '料酒', price: 3, desc: '荤菜分 ×2',     short: '荤×2', fx: { meatX: 2 } },
};

// 菜谱 = 被动规则：锅里某手法加工到了 ing 中所有原料就触发。
// phase：0 转化 → 1 加分 → 2 倍率 → 3 出锅后改规则（固定顺序，不会循环）。up：每升一级增加的数值
const RECIPES = [
  { key: 'jiandan',   name: '煎蛋',     ing: ['egg'],           tech: 'fry',   phase: 1, price: 5, fx: { add: 5 },  up: { add: 5 } },
  { key: 'xiaren',    name: '炒虾仁',   ing: ['shrimp'],        tech: 'stir',  phase: 1, price: 5, fx: { add: 8 },  up: { add: 6 } },
  { key: 'fanqiedan', name: '番茄炒蛋', ing: ['tomato', 'egg'], tech: 'stir',  phase: 1, price: 6, fx: { add: 15 }, up: { add: 10 } },
  { key: 'congbao',   name: '葱爆',     ing: ['scallion'],      tech: 'stir',  phase: 1, price: 6, fx: { perIng: 2 }, up: { perIng: 1 } },
  { key: 'zhengmogu', name: '蒸蘑菇',   ing: ['mushroom'],      tech: 'steam', phase: 1, price: 6, fx: { perVeg: 3 }, up: { perVeg: 2 } },
  { key: 'zhengdoufu',name: '蒸豆腐',   ing: ['tofu'],          tech: 'steam', phase: 1, price: 6, fx: { perTech: 3 }, up: { perTech: 2 } },
  { key: 'qiefanqie', name: '切番茄',   ing: ['tomato'],        tech: 'cut',   phase: 1, price: 6, fx: { copyVeg: 1 }, up: { copyVeg: 1 } },
  { key: 'zhatudou',  name: '炸土豆',   ing: ['potato'],        tech: 'deep',  phase: 2, price: 7, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'zhaxia',    name: '炸虾',     ing: ['shrimp'],        tech: 'deep',  phase: 2, price: 7, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'niupai',    name: '香煎牛排', ing: ['beef'],          tech: 'fry',   phase: 2, price: 7, fx: { multEmpty: 0.5 }, up: { multEmpty: 0.25 } },
  { key: 'banhua',    name: '葱花拌',   ing: ['scallion'],      tech: 'mix',   phase: 2, price: 7, fx: { multPerTech: 0.5 }, up: { multPerTech: 0.25 } },
  { key: 'doufugeng', name: '蛋香豆腐', ing: ['tofu'],          tech: 'mix',   phase: 0, price: 6, fx: { convert: 1 }, up: { add: 4 } },
  { key: 'kaoniurou', name: '烤牛肉',   ing: ['beef'],          tech: 'roast', phase: 0, price: 7, fx: { double: 1 }, up: { add: 6 } },
  { key: 'zhengdan',  name: '蒸蛋',     ing: ['egg'],           tech: 'steam', phase: 3, price: 7, fx: { slot: 1 }, up: { add: 5 } },
  { key: 'tudousi',   name: '土豆丝',   ing: ['potato'],        tech: 'cut',   phase: 2, price: 7, fx: { perRecipeIngMult: ['potato', .5] }, up: { mult: .25 } },
  { key: 'tudouni',   name: '土豆泥',   ing: ['potato'],        tech: 'mix',   phase: 3, price: 6, fx: { swap: 1 }, up: { add: 5 } },
  // ---- 第二批：每道菜一个不同的用处（大菜要两三样原料，靠订货凑；回锅省牌；烤蘑菇赚钱；炸蘑菇压轴；麻婆豆腐乘倍率）----
  { key: 'bandoufu',  name: '小葱拌豆腐', ing: ['scallion', 'tofu'], tech: 'mix', phase: 1, price: 6, fx: { add: 14 }, up: { add: 8 } },
  { key: 'xiadan',    name: '鲜虾蒸蛋', ing: ['shrimp', 'egg'], tech: 'steam', phase: 1, price: 8, fx: { add: 8, mult: 0.5 }, up: { add: 4, mult: 0.25 } },
  { key: 'sanxian',   name: '三鲜豆腐', ing: ['shrimp', 'mushroom', 'tofu'], tech: 'steam', phase: 1, price: 10, fx: { add: 16, mult: 1 }, up: { add: 8, mult: 0.5 } },
  { key: 'shaoniurou',name: '土豆烧牛肉', ing: ['potato', 'beef'], tech: 'stir', phase: 2, price: 8, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'mapo',      name: '麻婆豆腐', ing: ['tofu', 'beef'],  tech: 'stir',  phase: 2, price: 9, fx: { xm: 1.5 }, up: { xm: 0.25 } },
  { key: 'huiguo',    name: '回锅肉',   ing: ['beef'],          tech: 'stir',  phase: 1, price: 6, fx: { keep: 1, add: 6 }, up: { add: 4 } },
  { key: 'kaomogu',   name: '烤蘑菇',   ing: ['mushroom'],      tech: 'roast', phase: 1, price: 5, fx: { coin: 2, add: 4 }, up: { coin: 1, add: 2 } },
  { key: 'zhamogu',   name: '炸蘑菇',   ing: ['mushroom'],      tech: 'deep',  phase: 2, price: 7, fx: { lastX: 2 }, up: { lastX: 0.5 } },
  // ---- 第三批：出锅后改牌组（见 l3.js fatesOf）----
  { key: 'paofa',     name: '泡发香菇', ing: ['mushroom'],      tech: 'mix',   phase: 3, price: 6, fx: { keepIng: 'mushroom' }, up: { add: 4 } },
  { key: 'congyou',   name: '葱油',     ing: ['scallion'],      tech: 'deep',  phase: 3, price: 6, fx: { spiceOut: 1 }, up: { add: 4 } },
];
// ---- 联动扩展：效果短、触发真实食材；叠加不设上限 ----
RECIPES.push(
  { key: 'fanqiedoufu', name: '番茄豆腐', ing: ['tomato', 'tofu'], tech: 'steam', phase: 1, price: 7, fx: { perRecipeIngAdd: ['tomato', 3] }, up: { add: 4 } },
  { key: 'moguchaoji', name: '蘑菇炒蛋', ing: ['mushroom', 'egg'], tech: 'stir', phase: 2, price: 8, fx: { perRecipeIngMult: ['mushroom', .5] }, up: { mult: .25 } },
  { key: 'congbaoxia', name: '葱爆虾仁', ing: ['scallion', 'shrimp'], tech: 'stir', phase: 1, price: 7, fx: { perRecipeIngAdd: ['scallion', 3] }, up: { add: 3 } },
  { key: 'tudoumenrou', name: '土豆焖牛肉', ing: ['potato', 'beef'], tech: 'roast', phase: 2, price: 9, fx: { retriggerIng: 'beef' }, up: { add: 3 } },
  { key: 'ganbiandoufu', name: '干煸豆腐', ing: ['tofu'], tech: 'deep', phase: 1, price: 7, fx: { perRecipeIngAdd: ['tofu', 4] }, up: { add: 3 } },
  { key: 'mogudoufubao', name: '蘑菇豆腐煲', ing: ['mushroom', 'tofu'], tech: 'steam', phase: 2, price: 8, fx: { perRecipeIngMult: ['mushroom', .5] }, up: { mult: .25 } },
  { key: 'xiachaoji', name: '虾仁炒蛋', ing: ['shrimp', 'egg'], tech: 'stir', phase: 1, price: 7, fx: { perRecipeIngAdd: ['egg', 4] }, up: { add: 3 } },
  { key: 'congshaotudou', name: '葱烧土豆', ing: ['scallion', 'potato'], tech: 'roast', phase: 1, price: 7, fx: { perRecipeIngCoin: ['potato', 1] }, up: { add: 3 } },
  { key: 'mogutudou', name: '蘑菇土豆', ing: ['mushroom', 'potato'], tech: 'steam', phase: 2, price: 8, fx: { perRecipeIngMult: ['potato', .5] }, up: { mult: .25 } },
  { key: 'niuroumogu', name: '牛肉蘑菇', ing: ['beef', 'mushroom'], tech: 'roast', phase: 3, price: 8, fx: { stampPlayed: 'aroma' }, up: { add: 3 } },
  { key: 'tudouxia', name: '土豆虾仁', ing: ['potato', 'shrimp'], tech: 'deep', phase: 2, price: 8, fx: { perRecipeIngMult: ['potato', .5] }, up: { mult: .25 } },
  { key: 'doufujiaochao', name: '焦香豆腐', ing: ['tofu'], tech: 'fry', phase: 2, price: 8, fx: { retriggerIng: 'tofu' }, up: { add: 4 } },
  { key: 'congniurou', name: '葱爆牛肉', ing: ['scallion', 'beef'], tech: 'stir', phase: 2, price: 8, fx: { retriggerIng: 'scallion' }, up: { add: 4 } },
  { key: 'fanqiexia', name: '番茄蒸虾', ing: ['tomato', 'shrimp'], tech: 'steam', phase: 1, price: 7, fx: { coin: 1 }, up: { coin: 1 } },
  { key: 'moguzhengdan', name: '蘑菇蒸蛋', ing: ['mushroom', 'egg'], tech: 'steam', phase: 3, price: 7, fx: { draw: 2 }, up: { draw: 1 } },
  { key: 'tudoumogu', name: '土豆蘑菇', ing: ['potato', 'mushroom'], tech: 'roast', phase: 1, price: 7, fx: { coin: 1 }, up: { coin: 1 } },
  { key: 'xiangjianxia', name: '香煎虾', ing: ['shrimp'], tech: 'fry', phase: 3, price: 8, fx: { copyPlayed: 'shrimp' }, up: { add: 4 } },
  { key: 'kaofanqie', name: '烤番茄', ing: ['tomato'], tech: 'roast', phase: 1, price: 6, fx: { perVeg: 2 }, up: { perVeg: 1 } },
  { key: 'zhengtudou', name: '蒸土豆', ing: ['potato'], tech: 'steam', phase: 2, price: 7, fx: { perRecipeIngMult: ['potato', .5] }, up: { mult: .25 } },
  { key: 'tudoufanqie', name: '土豆番茄', ing: ['potato', 'tomato'], tech: 'stir', phase: 3, price: 7, fx: { keepPlayed: 'potato' }, up: { add: 3 } },
  { key: 'paofadoufu', name: '凉拌豆腐', ing: ['tofu'], tech: 'mix', phase: 3, price: 7, fx: { keepPlayed: 'tofu' }, up: { add: 4 } },
  { key: 'congzhengdan', name: '葱蒸蛋', ing: ['scallion', 'egg'], tech: 'steam', phase: 1, price: 7, fx: { perRecipeIngAdd: ['scallion', 4] }, up: { add: 3 } },
  { key: 'niurouxia', name: '牛肉虾仁', ing: ['beef', 'shrimp'], tech: 'stir', phase: 2, price: 8, fx: { perRecipeIngMult: ['beef', .5] }, up: { mult: .25 } },
  { key: 'doufufanqie', name: '番茄拌豆腐', ing: ['tofu', 'tomato'], tech: 'mix', phase: 3, price: 8, fx: { copyPlayed: 'tomato' }, up: { add: 3 } },
  { key: 'sanweidoufu', name: '三味豆腐', ing: ['tofu', 'scallion', 'shrimp'], tech: 'steam', phase: 2, price: 9, fx: { perRecipeIngMult: ['tofu', .5] }, up: { mult: .25 } },
  { key: 'jiachangmogu', name: '家常蘑菇', ing: ['mushroom', 'scallion'], tech: 'stir', phase: 3, price: 7, fx: { keep: 1 }, up: { add: 3 } },
  { key: 'fanqietudou', name: '番茄蒸土豆', ing: ['tomato', 'potato'], tech: 'steam', phase: 3, price: 7, fx: { slot: 1 }, up: { add: 3 } },
);
Object.assign(CARD_DEFS, {
  fryer: { type: 'equip', name: '宽口油锅', icon: 'deep', slots: 2, price: 7, techDouble: 'deep', desc: '槽位 +2\n「炸」加工 2 份', tag: [['r', '槽+2'], ['r', '炸2份']] },
  grill: { type: 'equip', name: '双面烤盘', icon: 'roast', slots: 1, price: 7, techDouble: 'roast', desc: '槽位 +1\n「烤」加工 2 份', tag: [['r', '槽+1'], ['r', '烤2份']] },
  brothpot: { type: 'equip', name: '双层蒸锅', icon: 'pot', slots: 1, price: 8, drawPerTech: 'steam', desc: '槽位 +1\n每道触发的蒸菜谱，出牌后多摸 1 张', tag: [['r', '槽+1'], ['r', '摸+1/蒸谱']] },
  mortar: { type: 'equip', name: '石臼', icon: 'bowl', slots: 1, price: 10, repeatTech: 'mix', desc: '槽位 +1\n首道触发的搅拌菜谱，再触发一次', tag: [['r', '槽+1'], ['r', '搅拌 再触']] },
});
// 装备、调料的符号标签（和菜谱、伙计同一套写法，见玩法说明里的「符号说明」）
const CARD_TAGS = { pan: [['r', '槽+3']], pot: [['r', '槽+2'], ['c', '蒸+3']], oven: [['r', '槽+2'], ['c', '烤+4']], knife: [['r', '槽+1'], ['r', '切2份']], wok: [['r', '槽+4']],
  steamer: [['r', '槽+2'], ['r', '蒸料 回堆']], cboard: [['r', '槽+1'], ['r', '切料+鲜']],
  salt: [['c', '+2/料']], soy: [['c', '法×2']], chili: [['m', '倍+1']], sugar: [['c', '蔬×2']], vinegar: [['m', '倍+.5/谱']], wine: [['c', '荤×2']] };
Object.keys(CARD_TAGS).forEach(k => { CARD_DEFS[k].tag = CARD_TAGS[k]; });
const RECIPE_BY = byKey(RECIPES);
// 能被改良倍数放大的效果（其余是开关类，例如留牌、转化、再触发）
const FX_SCALE = new Set(['add', 'perIng', 'perVeg', 'perTech', 'copyVeg', 'perRecipeIngAdd', 'perRecipeIngMult', 'perRecipeIngCoin', 'mult', 'multEmpty', 'multPerTech', 'xm', 'lastX', 'coin', 'slot', 'draw', 'swap']);
const FX_INT = new Set(['add', 'perIng', 'perVeg', 'perTech', 'copyVeg', 'perRecipeIngAdd', 'perRecipeIngCoin', 'coin', 'slot', 'draw', 'swap']);
// 改良过的菜谱：基础菜谱 + 本局的改动（手法 tech，any = 任意手法 / 配料 ing，可以为空 = 任意原料 / 效果倍数 x），见 l3.js 菜谱改良包
const effRecipe = (mods, k) => mods && mods[k] ? Object.assign({}, RECIPE_BY[k], mods[k]) : RECIPE_BY[k];
function fxOf(r, lv = 1) {
  const f = Object.assign({}, r.fx);
  Object.entries(r.up || {}).forEach(([k, v]) => { f[k] = +((f[k] || 0) + v * (lv - 1)).toFixed(2); });
  // 改良的效果倍数 x：「加料」×2、「放宽」×0.75。连乘类按超出 1 的部分算（×1.5 → ×2）；加分、铜钱、张数取整且至少 1
  if (r.x && r.x !== 1) Object.keys(f).forEach(k => {
    if (!FX_SCALE.has(k)) return;
    const v = f[k], arr = Array.isArray(v), n = arr ? v[1] : v;
    if (!n) return;
    const s = k === 'xm' || k === 'lastX' ? +(1 + (n - 1) * r.x).toFixed(2) : FX_INT.has(k) ? Math.max(1, Math.round(n * r.x)) : +(n * r.x).toFixed(2);
    f[k] = arr ? [v[0], s] : s;
  });
  return f;
}
// 菜谱效果拆成几条：k = c 加分（蓝） / m 倍率（红） / r 改规则（紫）；s 短标签，l 完整说明
function fxParts(f) {
  const p = [], c = (t, s, l) => p.push({ k: 'c', t, s, l }), m = (t, s, l) => p.push({ k: 'm', t, s, l }), r = (t, s, l) => p.push({ k: 'r', t, s, l }), g = (t, s, l) => p.push({ k: 'g', t, s, l });
  const n = v => String(v).replace(/^0\./, '.');
  // 说明统一短句：分写「+N 分」、倍率写「倍率 +N」、留下写「留下」；「生效」= 手法加工到了原料
  if (f.keep) r('回堆', '触发此菜谱的手法放回牌堆', '触发此菜谱的手法放回牌堆，本回合还能再摸到');
  if (f.convert) r('转化', '这次出牌的豆腐也算鸡蛋', '这次出牌的豆腐也算鸡蛋');
  if (f.double) r('加工+1', '烤多加工1份', '加工牛肉的「烤」多加工 1 份');
  if (f.add) c(`+${f.add}分`, `+${f.add} 分`, `+${f.add} 分`);
  if (f.perIng) c(`+${f.perIng}分`, `每份原料 +${f.perIng}`, `每份原料 +${f.perIng} 分`);
  if (f.perVeg) c(`+${f.perVeg}分`, `每份蔬菜 +${f.perVeg}`, `每份蔬菜 +${f.perVeg} 分`);
  if (f.perTech) c(`+${f.perTech}分`, `每张手法 +${f.perTech}`, `每张生效手法 +${f.perTech} 分`);
  if (f.copyVeg) p.push({ k: 'c', t: '+分', s: `蔬菜分重算 ${f.copyVeg} 次`, l: `蔬菜分再算 ${f.copyVeg} 次` });
  const recipeIngName = k => k === 'veg' ? '蔬菜' : k === 'meat' ? '荤菜' : (CARD_DEFS[k] ? CARD_DEFS[k].name : k);
  if (f.perRecipeIngAdd) c(`+${f.perRecipeIngAdd[1]}分`, `每道触发的${recipeIngName(f.perRecipeIngAdd[0])}菜谱，+${f.perRecipeIngAdd[1]} 分`, `每道触发的${recipeIngName(f.perRecipeIngAdd[0])}菜谱，+${f.perRecipeIngAdd[1]} 分`);
  if (f.perRecipeIngMult) m(`倍+${n(f.perRecipeIngMult[1])}`, `每道触发的${recipeIngName(f.perRecipeIngMult[0])}菜谱，倍率 +${f.perRecipeIngMult[1]}`, `每道触发的${recipeIngName(f.perRecipeIngMult[0])}菜谱，倍率 +${f.perRecipeIngMult[1]}`);
  if (f.perRecipeIngCoin) g(`钱+${f.perRecipeIngCoin[1]}`, `每道触发的${recipeIngName(f.perRecipeIngCoin[0])}菜谱，+${f.perRecipeIngCoin[1]} 钱`, `每道触发的${recipeIngName(f.perRecipeIngCoin[0])}菜谱，+${f.perRecipeIngCoin[1]} 钱`);
  if (f.retriggerIng) p.push({ k: 'r repeat', t: '↻', s: '再触发', l: `首道触发的其他${recipeIngName(f.retriggerIng)}菜谱，再触发一次` });
  if (f.copyPlayed) r('牌', `复制触发此菜谱的首张${recipeIngName(f.copyPlayed)}到牌组（不带印记）`, `复制触发此菜谱的首张${recipeIngName(f.copyPlayed)}到牌组（不带印记）`);
  if (f.keepPlayed) r('回堆', `触发此菜谱的${recipeIngName(f.keepPlayed)}放回牌堆`, `触发此菜谱的${recipeIngName(f.keepPlayed)}放回牌堆，本回合还能再摸到`);
  if (f.stampPlayed) r('盖印', '触发此菜谱的无印记原料盖「香」', '触发此菜谱的无印记原料盖「香」'); 
  if (f.mult) m(`倍+${n(f.mult)}`, `倍率 +${f.mult}`, `倍率 +${f.mult}`);
  if (f.multEmpty) m(`倍+${n(f.multEmpty)}`, `每空槽 倍+${f.multEmpty}`, `每个空槽位 倍率 +${f.multEmpty}`);
  if (f.multPerTech) m(`倍+${n(f.multPerTech)}`, `每张手法 倍+${f.multPerTech}`, `每张生效手法 倍率 +${f.multPerTech}`);
  if (f.xm) m(`倍×${f.xm}`, `倍率 ×${f.xm}`, `倍率 ×${f.xm}（最后乘）`);
  if (f.lastX) m(`末次 倍×${f.lastX}`, `末次 倍率 ×${f.lastX}`, `本回合最后一次出牌 倍率 ×${f.lastX}`);
  if (f.coin) g(`钱+${f.coin}`, `小费 +${f.coin}`, `+${f.coin} 铜钱`);
  if (f.slot) r(`槽+${f.slot}`, `本回合槽位 +${f.slot}`, `本回合槽位 +${f.slot}`);
  if (f.draw) r(`摸+${f.draw}`, `出牌后多摸 ${f.draw} 张`, `出牌后多摸 ${f.draw} 张`);
  if (f.swap) r(`弃+${f.swap}`, `弃牌 +${f.swap}`, `本回合弃牌 +${f.swap}`);
  if (f.keepIng) r('回堆', '触发此菜谱的蘑菇盖「留」并放回牌堆', '触发此菜谱的蘑菇盖「留」并放回牌堆');
  if (f.spiceOut) r('+牌', '多 1 张辣椒', '牌组加 1 张「辣椒」');
  return p;
}
const fxText = f => fxParts(f).map(x => x.l).join('；');
const fxShort = f => fxParts(f).map(x => x.t).join(' ');
// 浮框里的符号：文字里写 [c|+3] 这样的记号，显示时变成彩色标签
const tagLine = list => (list || []).map(([k, t]) => `[${k}|${t}]`).join(' ');
const fxTags = f => fxParts(f).map(x => [x.k, x.t]);
const tagPills = list => (list || []).map(([k, t]) => `<span class="fxp ${k}">${t}</span>`).join('');
const fxPills = (f, w = 't') => fxParts(f).map(x => `<span class="fxp ${x.k}">${x[w]}</span>`).join('');
// 配料里的 veg / meat = 任意蔬菜 / 任意荤菜；手法 any = 任意手法（改良后可能出现）
const nameOf = k => k === 'veg' ? '任意蔬菜' : k === 'meat' ? '任意荤菜' : k === 'any' ? '任意手法' : CARD_DEFS[k].name;
const ingIcon = k => k === 'veg' ? 'leaf' : k;
const techIcon = k => k === 'any' ? 'flame' : k;
const DOUBLE_EQ = { deep: '宽口油锅', roast: '双面烤盘', cut: '菜刀' };
const SINGLE_TECH = ['fry', 'deep', 'roast', 'cut'];
function recipeCond(r) {
  const t = r.tech === 'any' ? '任意手法' : `「${nameOf(r.tech)}」`, ing = r.ing.map(nameOf);
  const s = !ing.length ? `用${t}加工任意原料` : ing.length === 1 ? `用${t}加工「${ing[0]}」` : `用${t}同时加工「${ing.join('」和「')}」`;
  // 手法默认加工的份数不够：提示能加份数的东西（火候包、灶头师傅、装备）
  const cap = r.tech === 'any' ? 3 : BASE_CAP[r.tech] || 1, eqn = DOUBLE_EQ[r.tech];
  if (ing.length <= cap) return s;
  const ways = ['火候包'].concat(SINGLE_TECH.includes(r.tech) ? ['灶头师傅'] : [], eqn && ing.length <= 2 ? [eqn] : []);
  return s + `（${t}默认只加工 ${cap} 份，要靠${ways.join('、')}多加工）`;
}
const PHASE_NAME = ['最先结算', '加分', '加倍率', '打出后生效'];

// 挑剔食客：每关最后一回合
const BOSSES = [
  { key: 'nofry',  name: '怕油的阿姨', rule: '无法打出炸',     icon: 'deep',  ban: ['deep'] },
  { key: 'veg',    name: '吃素的师傅', rule: '无法打出荤菜',       icon: 'beef',  banTag: 'meat' },
  { key: 'rush',   name: '赶车的大哥', rule: '只能出牌 3 次',    icon: 'hourglass', plays: 3 },
  { key: 'big',    name: '大胃王',     rule: '每次至少打出 2 份原料', icon: 'bowl', minIng: 2 },
  { key: 'fresh',  name: '老饕',       rule: '每道菜谱本回合只生效 1 次', icon: 'board', noRepeat: 1 },
  { key: 'bland',  name: '怕咸的老伯', rule: '无法打出调料',     icon: 'salt',  banType: 'spice' },
  { key: 'small',  name: '小桌客人',   rule: '手牌 -2',  icon: 'hand',  hand: -2 },
  { key: 'kid',    name: '挑嘴的小孩', rule: '无法打出青葱和蘑菇', icon: 'mushroom', ban: ['scallion', 'mushroom'] },
];
const BOSS_BY = byKey(BOSSES);

const START_DECK = ['egg', 'egg', 'egg', 'egg', 'tomato', 'tomato', 'tomato', 'tomato', 'potato', 'potato', 'potato', 'mushroom', 'mushroom', 'beef', 'beef', 'scallion',
                    'fry', 'fry', 'fry', 'cut', 'cut', 'cut', 'deep', 'deep', 'steam', 'stir', 'stir', 'pan', 'salt', 'salt'];
const START_RECIPES = ['jiandan'];
const CFG = { hand: 8, plays: 5, discards: 3, baseSlots: 4, levels: 8, rounds: [24, 38, 52, 66], growth: 1.13, startCoins: 4,
  earnBase: 9, perPlayLeft: 1, mkIng: 3, mkTech: 2, mkBundle: 3, mkIngPrice: 4, mkTechPrice: 4, mkStampChance: .25,
  boxN: 3, boxSize: 8, boxBase: 11, enchantPrice: 3, enchantN: 3, enchantMax: 2, interestPer: 5, interestMax: 5, bossTip: 5, shopSize: 4, rerollBase: 2, extraBase: 2 };

// ===== 商店扩展 =====
// 帮厨伙计：常驻被动效果，最多 3 位，可半价辞退
const HELPERS = [
  { key: 'dan',   name: '阿蛋',     icon: 'egg',   price: 6, desc: '每份鸡蛋 +3 分',   fx: { perKey: ['egg', 3] }, tag: [['c', '+3/蛋']] },
  { key: 'nong',  name: '菜农老李', icon: 'leaf',  price: 6, desc: '每份蔬菜 +2 分',   fx: { perVeg: 2 }, tag: [['c', '+2/蔬']] },
  { key: 'dao',   name: '刀工师傅', icon: 'cut',   price: 6, desc: '每张生效的「切」 +4 分',     fx: { perTechKey: ['cut', 4] }, tag: [['c', '+4/切']] },
  { key: 'chu',   name: '大厨',     icon: 'hat',   price: 8, desc: '每触发 1 次菜谱 +4 分',   fx: { perRecipe: 4 }, tag: [['c', '+4/谱']] },
  { key: 'tu',    name: '屠户老张', icon: 'meat',  price: 7, desc: '有荤菜时 倍率 +1',   fx: { meatMult: 1 }, tag: [['m', '有荤 倍+1']] },
  { key: 'you',   name: '油锅老王', icon: 'deep',  price: 7, desc: '有生效的「炸」时 倍率 +1',     fx: { techMult: ['deep', 1] }, tag: [['m', '有炸 倍+1']] },
  { key: 'shao',  name: '掌勺',     icon: 'pan',   price: 8, desc: '原料和手法共 5 张以上 倍率 +1.5', fx: { bigMult: [5, 1.5] }, tag: [['m', '≥5张 倍+1.5']] },
  { key: 'zhang', name: '账房先生', icon: 'coin',  price: 6, desc: '结账 +3 铜钱',     fx: { income: 3 }, tag: [['g', '钱+3']] },
  { key: 'pao',   name: '跑堂小二', icon: 'toss',  price: 5, desc: '每回合弃牌 +1',          fx: { disc: 1 }, tag: [['r', '弃+1']] },
  // ---- 改牌组的伙计：出锅后把打出的牌变成别的牌、盖印记、留下来（结算见 l3.js fatesOf）----
  { key: 'chen',   name: '豆腐老陈', icon: 'tofu',     price: 5, desc: '被「搅拌」加工的鸡蛋变成豆腐', tag: [['r', '搅蛋→腐']] },
  { key: 'ershen', name: '种葱二婶', icon: 'scallion', price: 6, desc: '打出的青葱放回牌堆，牌组再加 1 张青葱', tag: [['r', '葱回堆 +1葱']] },
  { key: 'liu',    name: '学徒小刘',   icon: 'mix',      price: 5, desc: '生效的「搅拌」变成「炒」', tag: [['r', '搅→炒']] },
  { key: 'zhou',   name: '收菜老周', icon: 'basket',   price: 5, desc: '打出的原料中，牌组里最少的那种 1 张放回牌堆', tag: [['r', '少料 回堆']] },
  { key: 'mei',    name: '洗碗小妹', icon: 'salt',     price: 5, desc: '第 1 张调料变成「盐」', tag: [['r', '调料→盐']] },
  { key: 'sun',    name: '磨刀老孙', icon: 'cut',      price: 6, desc: '第 1 张生效的「切」放回牌堆', tag: [['r', '切 回堆']] },
  { key: 'dashen', name: '帮厨大婶',   icon: 'hand',     price: 7, desc: '没被加工的原料放回牌堆（最多 2 张）', tag: [['r', '生料 回堆']] },
  { key: 'jiang',  name: '酱园掌柜',   icon: 'soy',      price: 7, desc: '触发菜谱的原料中分最高的 1 张盖上「香」（已有香、金、留、双的跳过）', tag: [['r', '菜料→香']] },
  { key: 'fan',    name: '鲜货贩子',   icon: 'stamp',    price: 6, desc: '打出的「鲜」变「香」、「香」变「金」', tag: [['r', '鲜→香→金']] },
  { key: 'jin',    name: '金掌柜',     icon: 'bell',     price: 6, desc: '带「金」的牌放回牌堆', tag: [['r', '金 回堆']] },
  { key: 'huotou', name: '火头军',     icon: 'flame',    price: 6, desc: '每回合收尾那次出牌，生效的手法盖上「鲜」（已有印记的不换）', tag: [['r', '收尾 法→鲜']] },
  { key: 'wang',   name: '酱缸王伯',   icon: 'bowl',     price: 5, desc: '带调料出牌时，分最高的原料盖上「鲜」（已有印记的不换）', tag: [['r', '带调料 料→鲜']] },
  { key: 'qiang',  name: '双灶阿强',   icon: 'pot',      price: 7, desc: '每回合第 1 次出牌，原料全部放回牌堆', tag: [['r', '首次 料回堆']] },
];
HELPERS.push(
  { key: 'fuguo', name: '复锅师傅', icon: 'wok', price: 10, desc: '每道触发的牛肉菜谱，再触发一次', fx: { repeatIng: 'beef' } },
  { key: 'doufushou', name: '豆腐替身', icon: 'tofu', price: 7, desc: '豆腐可当鸡蛋', fx: { asEgg: 1 }, tag: [['r', '腐=蛋']] },
  { key: 'diancai', name: '点菜掌柜', icon: 'board', price: 7, desc: '每道触发的菜谱，+1 钱', fx: { coinPerRecipe: 1 }, tag: [['g', '+1/谱']] },
  { key: 'zaobian', name: '灶边学徒', icon: 'flame', price: 7, desc: '触发两道不同菜谱的手法放回牌堆', fx: { keepTechSame: 1 } },
  { key: 'chuyu', name: '厨余回收员', icon: 'basket', price: 6, desc: '打出的首张未触发菜谱的原料放回牌堆', fx: { keepUnmatched: 1 } },
  { key: 'zhengshou', name: '蒸手', icon: 'steamer', price: 7, desc: '触发菜谱的「蒸」放回牌堆', fx: { keepTech: 'steam' } },
  { key: 'peicai', name: '配菜小妹', icon: 'scallion', price: 8, desc: '菜谱配料中的蔬菜可用青葱代替', fx: { asVeg: 'scallion' } },
  { key: 'yuguo', name: '余锅小弟', icon: 'deep', price: 8, desc: '每道触发的炸菜谱，复制参与的首张荤菜到牌组（不带印记）', fx: { copyPlayed: 'meat' } },
  { key: 'diaowei', name: '调味师', icon: 'salt', price: 10, desc: '每张打出的调料，让首道触发的菜谱再触发一次', fx: { retriggerAny: 1 } },
  { key: 'tuzao', name: '土灶师傅', icon: 'pan', price: 7, desc: '每道触发的土豆菜谱，倍率 +0.25', fx: { perRecipeIngMult: ['potato', .25] }, tag: [['m', '+.25/土豆谱']] },
  { key: 'caiyuan', name: '菜园小哥', icon: 'leaf', price: 7, desc: '每道触发的蔬菜菜谱，+2 分', fx: { perRecipeIngAdd: ['veg', 2] }, tag: [['c', '+2/蔬谱']] },
  { key: 'huoyan', name: '火候师傅', icon: 'flame', price: 8, desc: '每三次触发的同类手法菜谱，倍率 +1', fx: { techRecipeMult: 1 } },
  { key: 'hudan', name: '护蛋阿姨', icon: 'egg', price: 6, desc: '每次打出的首张鸡蛋放回牌堆', fx: { keepFirst: 'egg' } },
  { key: 'sushi', name: '素食师傅', icon: 'mushroom', price: 8, desc: '菜谱配料中的牛肉可用蘑菇代替', fx: { alias: ['mushroom', 'beef'] } },
  { key: 'xiaqiao', name: '虾巧娘', icon: 'shrimp', price: 8, desc: '菜谱配料中的豆腐可用鲜虾代替', fx: { alias: ['shrimp', 'tofu'] } },
  { key: 'beiliao', name: '备料师傅', icon: 'hand', price: 7, desc: '每回合手牌 +2', fx: { hand: 2 } },
  { key: 'zaotou', name: '灶头师傅', icon: 'flame', price: 8, desc: '「煎」「炸」「烤」「切」多加工 1 份', fx: { capPlus: ['fry', 'deep', 'roast', 'cut'] }, tag: [['r', '单份法 +1份']] },
);
HELPERS.forEach(h => { h.fx = h.fx || {}; });
const HELPER_BY = byKey(HELPERS);
// 牌面加工：给牌组里的一张原料或手法盖印
// 印记（附魔）：随机出现，玩家不能自选
const STAMPS = {
  fresh: { name: '鲜', desc: '牌面分 +3',       cls: 'c', w: 5, tag: [['c', '+3']] },
  aroma: { name: '香', desc: '倍率 +0.5',   cls: 'm', w: 3, tag: [['m', '倍+.5']] },
  gold:  { name: '金', desc: '打出时 +1 铜钱', cls: 'g', w: 2, tag: [['g', '钱+1']] },
  keep:  { name: '留', desc: '打出后放回牌堆，本回合还能再摸到', cls: 'r', w: 1.5, tag: [['r', '回堆']] },
  dup:   { name: '双', desc: '打出后变成 2 张（都不带印记）', cls: 'r', w: 1.5, tag: [['r', '变2张']] },
};
// 灶台升级：永久生效，每项最多 2 级，价格逐级上涨
const UPGRADES = [
  { key: 'slot', name: '槽位', icon: 'pan',   prices: [8, 13] },
  { key: 'hand', name: '手牌', icon: 'hand',  prices: [6, 10] },
  { key: 'play', name: '出牌', icon: 'flame', prices: [8, 13] },
  { key: 'disc', name: '弃牌', icon: 'toss',  prices: [4, 7] },
];
// 包：商店里除了精选，所有东西都是包。每回合随机出两种，打开后从几样里挑。
// all：内容全收；w：出现权重
const PACKS = {
  ing:    { name: '原料包', icon: 'egg',    price: 3, show: 4, pick: 2, w: 1 },
  tech:   { name: '手法包', icon: 'flame',  price: 4, show: 4, pick: 2, w: 1 },
  spice:  { name: '调料包', icon: 'salt',   price: 3, show: 3, pick: 1, w: 1 },
  recipe: { name: '菜谱包', icon: 'board',  price: 6, show: 3, pick: 1, w: 1.2 },
  up:     { name: '升级包', icon: 'up',     price: 7, show: 3, pick: 1, w: 1, desc: '灶台永久 +1' },
  stamp:  { name: '加工包', icon: 'stamp',  price: 4, show: 4, pick: 2, w: 1, desc: '挑 2 张盖印记' },
  trim:   { name: '精简包', icon: 'trim',   price: 3, show: 0, pick: 2, w: .8, desc: '去掉 2 张' },
  // 菜谱改良包：3 个改法每个都有 CFG.modRare 的概率是稀有改法
  heat:   { name: '火候包', icon: 'flame', price: 6, show: 3, pick: 1, w: .9, desc: '挑一种手法，永久多加工 1 份' },
  mod:    { name: '菜谱改良包', icon: 'board',  price: 5, show: 3, pick: 1, w: 1.2, desc: '普通：换原料或换手法；稀有（每个 20%）：去掉原料、去掉手法或加料' },
};
CFG.maxHelpers = 3;
CFG.maxRecipes = 6;   // 菜谱栏上限；满了要先在商店卖掉一道（退一半钱）
CFG.modRare = 0.2;
CFG.heatMax = 2;      // 火候包：每种手法最多永久 +2 份    // 菜谱改良包里每个改法是稀有改法的概率
// 熟练度：一道菜谱累计做出这么多锅，就免费升一级（和商店买的升级叠加）
// 每次免费升级后重新计数：Lv1 需要 3 次，之后依次需要 4、5、6、7 次。
CFG.mastery = [3, 4, 5, 6, 7];
// 打出、弃掉的牌进弃牌堆，本回合不会洗回牌堆；下回合整副牌组重新洗。牌堆摸空就只剩手里的牌
