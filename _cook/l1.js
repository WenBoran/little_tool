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
  fry:      { type: 'tech', name: '煎',   base: 3 },
  cut:      { type: 'tech', name: '切',   base: 3 },
  deep:     { type: 'tech', name: '炸',   base: 2 },
  steam:    { type: 'tech', name: '蒸',   base: 2 },
  roast:    { type: 'tech', name: '烤',   base: 3 },
  stir:     { type: 'tech', name: '炒',   base: 3 },
  mix:      { type: 'tech', name: '搅拌', base: 1 },
  pan:   { type: 'equip', name: '平底锅', slots: 3, price: 5, desc: '槽位 +3' },
  pot:   { type: 'equip', name: '汤锅',   slots: 2, price: 5, desc: '槽位 +2\n蒸 +3 分', techBonus: ['steam', 3], short: '蒸+3' },
  oven:  { type: 'equip', name: '烤箱',   slots: 2, price: 5, desc: '槽位 +2\n烤 +4 分', techBonus: ['roast', 4], short: '烤+4' },
  knife: { type: 'equip', name: '菜刀',   slots: 1, price: 5, desc: '槽位 +1\n切 加工 2 份', techDouble: 'cut', short: '切2份' },
  wok:   { type: 'equip', name: '大铁锅', slots: 4, price: 6, desc: '槽位 +4' },
  // 调料：不占槽位，只作用于这一锅
  salt:    { type: 'spice', name: '盐',   price: 3, desc: '每份原料 +2 分', short: '+2/料', fx: { perIng: 2 } },
  soy:     { type: 'spice', name: '酱油', price: 3, desc: '手法分 ×2',     short: '法×2', fx: { techX: 2 } },
  chili:   { type: 'spice', name: '辣椒', price: 4, desc: '倍率 +1',       short: '倍+1',   fx: { mult: 1 } },
  sugar:   { type: 'spice', name: '白糖', price: 3, desc: '蔬菜分 ×2',     short: '蔬×2', fx: { vegX: 2 } },
  vinegar: { type: 'spice', name: '香醋', price: 4, desc: '每个菜谱 倍率 +0.5', short: '倍+.5/谱', fx: { multPerRecipe: 0.5 } },
};

// 菜谱 = 被动规则：锅里某手法加工到了 ing 中所有原料就触发。
// phase：0 转化 → 1 加分 → 2 倍率 → 3 出锅后改规则（固定顺序，不会循环）。up：每升一级增加的数值
const RECIPES = [
  { key: 'jiandan',   name: '煎蛋',     ing: ['egg'],           tech: 'fry',   phase: 1, price: 5, fx: { add: 5 },  up: { add: 5 } },
  { key: 'xiaren',    name: '炒虾仁',   ing: ['shrimp'],        tech: 'stir',  phase: 1, price: 5, fx: { add: 8 },  up: { add: 6 } },
  { key: 'fanqiedan', name: '番茄炒蛋', ing: ['tomato', 'egg'], tech: 'stir',  phase: 1, price: 6, fx: { add: 15 }, up: { add: 10 } },
  { key: 'congbao',   name: '葱爆',     ing: ['scallion'],      tech: 'stir',  phase: 1, price: 6, fx: { perIng: 2 }, up: { perIng: 1 } },
  { key: 'zhengmogu', name: '蒸蘑菇',   ing: ['mushroom'],      tech: 'steam', phase: 1, price: 6, fx: { perKind: 2 }, up: { perKind: 2 } },
  { key: 'zhengdoufu',name: '蒸豆腐',   ing: ['tofu'],          tech: 'steam', phase: 1, price: 6, fx: { perTech: 3 }, up: { perTech: 2 } },
  { key: 'qiefanqie', name: '切番茄',   ing: ['tomato'],        tech: 'cut',   phase: 1, price: 6, once: 1, fx: { copyVeg: 1 }, up: { copyVeg: 1 } },
  { key: 'zhatudou',  name: '炸土豆',   ing: ['potato'],        tech: 'deep',  phase: 2, price: 7, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'zhaxia',    name: '炸虾',     ing: ['shrimp'],        tech: 'deep',  phase: 2, price: 7, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'niupai',    name: '香煎牛排', ing: ['beef'],          tech: 'fry',   phase: 2, price: 7, once: 1, fx: { multEmpty: 0.5 }, up: { multEmpty: 0.25 } },
  { key: 'banhua',    name: '葱花拌',   ing: ['scallion'],      tech: 'mix',   phase: 2, price: 7, once: 1, fx: { multTechKind: 0.5 }, up: { multTechKind: 0.25 } },
  { key: 'doufugeng', name: '蛋香豆腐', ing: ['tofu'],          tech: 'mix',   phase: 0, price: 6, once: 1, fx: { convert: 1 }, up: { add: 4 } },
  { key: 'kaoniurou', name: '烤牛肉',   ing: ['beef'],          tech: 'roast', phase: 0, price: 7, once: 1, fx: { double: 1 }, up: { add: 6 } },
  { key: 'zhengdan',  name: '蒸蛋',     ing: ['egg'],           tech: 'steam', phase: 3, price: 7, fx: { slot: 1 }, up: { add: 5 } },
  { key: 'tudousi',   name: '土豆丝',   ing: ['potato'],        tech: 'cut',   phase: 3, price: 6, once: 1, fx: { draw: 2 }, up: { draw: 1 } },
  { key: 'tudouni',   name: '土豆泥',   ing: ['potato'],        tech: 'mix',   phase: 3, price: 6, fx: { swap: 1 }, up: { add: 5 } },
];
// 装备、调料的符号标签（和菜谱、伙计同一套写法，见玩法说明里的「符号说明」）
const CARD_TAGS = { pan: [['r', '槽+3']], pot: [['r', '槽+2'], ['c', '蒸+3']], oven: [['r', '槽+2'], ['c', '烤+4']], knife: [['r', '槽+1'], ['r', '切2份']], wok: [['r', '槽+4']],
  salt: [['c', '+2/料']], soy: [['c', '法×2']], chili: [['m', '倍+1']], sugar: [['c', '蔬×2']], vinegar: [['m', '倍+.5/谱']] };
Object.keys(CARD_TAGS).forEach(k => { CARD_DEFS[k].tag = CARD_TAGS[k]; });
const RECIPE_BY = byKey(RECIPES);
const FX_KEYS = ['add', 'perIng', 'perKind', 'perTech', 'copyVeg', 'mult', 'multEmpty', 'multTechKind', 'draw'];
function fxOf(r, lv = 1) {
  const f = Object.assign({}, r.fx);
  Object.entries(r.up || {}).forEach(([k, v]) => { f[k] = +((f[k] || 0) + v * (lv - 1)).toFixed(2); });
  return f;
}
// 菜谱效果拆成几条：k = c 加分（蓝） / m 倍率（红） / r 改规则（紫）；s 短标签，l 完整说明
function fxParts(f) {
  const p = [], c = (t, s, l) => p.push({ k: 'c', t, s, l }), m = (t, s, l) => p.push({ k: 'm', t, s, l }), r = (t, s, l) => p.push({ k: 'r', t, s, l });
  const n = v => String(v).replace(/^0\./, '.');
  if (f.convert) r('腐=蛋', '豆腐当鸡蛋', '这一锅的豆腐也算作鸡蛋，能触发需要鸡蛋的菜谱');
  if (f.double) r('烤+1份', '烤多加工1份', '加工牛肉的「烤」可以多加工 1 份原料');
  if (f.add) c(`+${f.add}`, `+${f.add} 分`, `这一锅额外 +${f.add} 分`);
  if (f.perIng) c(`+${f.perIng}/料`, `每份原料 +${f.perIng}`, `锅里每有 1 份原料，+${f.perIng} 分`);
  if (f.perKind) c(`+${f.perKind}/种`, `每种原料 +${f.perKind}`, `锅里每有 1 种不同的原料，+${f.perKind} 分`);
  if (f.perTech) c(`+${f.perTech}/法`, `每张手法 +${f.perTech}`, `锅里每张起作用的手法，+${f.perTech} 分`);
  if (f.copyVeg) c(`蔬×${f.copyVeg + 1}`, `蔬菜分 ×${f.copyVeg + 1}`, `锅里蔬菜的分数再多算 ${f.copyVeg} 遍`);
  if (f.mult) m(`倍+${n(f.mult)}`, `倍率 +${f.mult}`, `这一锅倍率 +${f.mult}`);
  if (f.multEmpty) m(`倍+${n(f.multEmpty)}/空`, `每空槽 倍+${f.multEmpty}`, `出牌时每空着 1 个槽位，倍率 +${f.multEmpty}`);
  if (f.multTechKind) m(`倍+${n(f.multTechKind)}/种法`, `每种手法 倍+${f.multTechKind}`, `锅里每有 1 种不同的手法，倍率 +${f.multTechKind}`);
  if (f.slot) r(`槽+${f.slot}`, `槽位 +${f.slot}`, `出锅后，本回合槽位 +${f.slot}`);
  if (f.draw) r(`摸+${f.draw}`, `多摸 ${f.draw} 张`, `出锅后多摸 ${f.draw} 张牌`);
  if (f.swap) r(`弃+${f.swap}`, `弃牌 +${f.swap}`, `出锅后，本回合弃牌次数 +${f.swap}`);
  return p;
}
const fxText = f => fxParts(f).map(x => x.l).join('；');
const fxShort = f => fxParts(f).map(x => x.t).join(' ');
// 浮框里的符号：文字里写 [c|+3] 这样的记号，显示时变成彩色标签
const tagLine = list => (list || []).map(([k, t]) => `[${k}|${t}]`).join(' ');
const fxTags = f => fxParts(f).map(x => [x.k, x.t]);
const tagPills = list => (list || []).map(([k, t]) => `<span class="fxp ${k}">${t}</span>`).join('');
const fxPills = (f, w = 't') => fxParts(f).map(x => `<span class="fxp ${x.k}">${x[w]}</span>`).join('');
const nameOf = k => CARD_DEFS[k].name;
function recipeCond(r) {
  const t = nameOf(r.tech), ing = r.ing.map(nameOf);
  return ing.length === 1 ? `用「${t}」加工「${ing[0]}」` : `用「${t}」同时加工「${ing.join('」和「')}」`;
}
const PHASE_NAME = ['最先结算', '加分', '加倍率', '出锅后生效'];

// 挑剔食客：每关最后一回合
const BOSSES = [
  { key: 'nofry',  name: '怕油的阿姨', rule: '不吃炸的',     icon: 'deep',  ban: ['deep'] },
  { key: 'veg',    name: '吃素的师傅', rule: '不吃荤',       icon: 'beef',  banTag: 'meat' },
  { key: 'rush',   name: '赶车的大哥', rule: '只等 3 锅',    icon: 'hourglass', plays: 3 },
  { key: 'big',    name: '大胃王',     rule: '每锅至少 2 份原料', icon: 'bowl', minIng: 2 },
  { key: 'fresh',  name: '老饕',       rule: '菜谱不许重样', icon: 'board', noRepeat: 1 },
  { key: 'bland',  name: '怕咸的老伯', rule: '不放调料',     icon: 'salt',  banType: 'spice' },
  { key: 'small',  name: '小桌客人',   rule: '手牌少 2 张',  icon: 'hand',  hand: -2 },
];
const BOSS_BY = byKey(BOSSES);

const START_DECK = ['egg', 'egg', 'egg', 'egg', 'tomato', 'tomato', 'tomato', 'tomato', 'potato', 'potato', 'potato', 'mushroom', 'mushroom', 'beef', 'beef', 'scallion',
                    'fry', 'fry', 'fry', 'cut', 'cut', 'cut', 'deep', 'deep', 'steam', 'stir', 'stir', 'pan', 'salt', 'salt'];
const START_RECIPES = ['jiandan'];
const CFG = { hand: 8, plays: 5, discards: 3, baseSlots: 2, rounds: [18, 28, 40, 48], growth: 1.35, startCoins: 4,
  earnBase: 9, perPlayLeft: 1, mkIng: 3, mkTech: 2, mkBundle: 3, mkIngPrice: 4, mkTechPrice: 4, mkStampChance: .25,
  boxN: 3, boxSize: 8, boxBase: 11, enchantPrice: 3, enchantN: 3, enchantMax: 2, interestPer: 5, interestMax: 5, bossTip: 5, shopSize: 4, rerollBase: 2, extraBase: 2 };

// ===== 商店扩展 =====
// 帮厨伙计：常驻被动效果，最多 3 位，可半价辞退
const HELPERS = [
  { key: 'dan',   name: '阿蛋',     icon: 'egg',   price: 6, desc: '每份鸡蛋 +3 分',   fx: { perKey: ['egg', 3] }, tag: [['c', '+3/蛋']] },
  { key: 'nong',  name: '菜农老李', icon: 'leaf',  price: 6, desc: '每份蔬菜 +2 分',   fx: { perVeg: 2 }, tag: [['c', '+2/蔬']] },
  { key: 'dao',   name: '刀工师傅', icon: 'cut',   price: 6, desc: '每张切 +4 分',     fx: { perTechKey: ['cut', 4] }, tag: [['c', '+4/切']] },
  { key: 'chu',   name: '大厨',     icon: 'hat',   price: 8, desc: '每个菜谱 +4 分',   fx: { perRecipe: 4 }, tag: [['c', '+4/谱']] },
  { key: 'tu',    name: '屠户老张', icon: 'meat',  price: 7, desc: '有荤菜 倍率 +1',   fx: { meatMult: 1 }, tag: [['m', '有荤 倍+1']] },
  { key: 'you',   name: '油锅老王', icon: 'deep',  price: 7, desc: '有炸 倍率 +1',     fx: { techMult: ['deep', 1] }, tag: [['m', '有炸 倍+1']] },
  { key: 'shao',  name: '掌勺',     icon: 'pan',   price: 8, desc: '5 张以上 倍率 +1.5', fx: { bigMult: [5, 1.5] }, tag: [['m', '≥5张 倍+1.5']] },
  { key: 'zhang', name: '账房先生', icon: 'coin',  price: 6, desc: '结账 +3 铜钱',     fx: { income: 3 }, tag: [['g', '钱+3']] },
  { key: 'pao',   name: '跑堂小二', icon: 'toss',  price: 5, desc: '弃牌 +1',          fx: { disc: 1 }, tag: [['r', '弃+1']] },
];
const HELPER_BY = byKey(HELPERS);
// 牌面加工：给牌组里的一张原料或手法盖印
// 印记（附魔）：随机出现，玩家不能自选
const STAMPS = {
  fresh: { name: '鲜', desc: '+3 分',       cls: 'c', w: 5, tag: [['c', '+3']] },
  aroma: { name: '香', desc: '倍率 +0.5',   cls: 'm', w: 3, tag: [['m', '倍+.5']] },
  gold:  { name: '金', desc: '打出 +1 铜钱', cls: 'g', w: 2, tag: [['g', '钱+1']] },
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
  box:    { name: '补货包',   icon: 'basket', price: 8, show: 8, pick: 8, all: 1, w: 3, desc: '8 张全收' },
  ing:    { name: '原料包', icon: 'egg',    price: 3, show: 4, pick: 2, w: 1 },
  tech:   { name: '手法包', icon: 'flame',  price: 4, show: 4, pick: 2, w: 1 },
  spice:  { name: '调料包', icon: 'salt',   price: 3, show: 3, pick: 1, w: 1 },
  recipe: { name: '菜谱包', icon: 'board',  price: 6, show: 3, pick: 1, w: 1.2 },
  up:     { name: '升级包', icon: 'up',     price: 7, show: 3, pick: 1, w: 1, desc: '灶台永久 +1' },
  stamp:  { name: '加工包', icon: 'stamp',  price: 4, show: 4, pick: 2, w: 1, desc: '挑 2 张盖印记' },
  trim:   { name: '精简包', icon: 'trim',   price: 3, show: 0, pick: 2, w: .8, desc: '去掉 2 张' },
};
CFG.maxHelpers = 3;
CFG.lowDeck = 22;   // 牌组少于这个数时，两种包里必有补货包（出过的牌会用掉，防止补不上牌）
