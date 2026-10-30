/* 小灶：料理卡牌肉鸽（源码见 _cook/*.js，按依赖顺序拼接）*/
// ===== 运行环境适配（最先加载）=====
// 1. Flexbox gap 要 Chrome 84+，用实际布局测量；不支持就给 <html> 加 .no-flex-gap，改用 margin 回退（见 c6.css）
// 2. 小工具容器提供 getWindowInfo（客户端 9.49+）时，读取顶部按钮和安全区位置，给页面顶部留出避让空间
(function () {
  function supportsFlexGap() {
    var flex = document.createElement('div');
    flex.style.position = 'absolute'; flex.style.visibility = 'hidden';
    flex.style.display = 'flex'; flex.style.flexDirection = 'column'; flex.style.rowGap = '1px';
    flex.appendChild(document.createElement('div')); flex.appendChild(document.createElement('div'));
    document.body.appendChild(flex);
    var ok = flex.scrollHeight === 1;
    flex.parentNode.removeChild(flex);
    return ok;
  }
  if (!supportsFlexGap()) document.documentElement.classList.add('no-flex-gap');

  function applyWindowInfo(info) {
    if (!info) return;
    var bottom = 0, mb = info.menuButtons || {};
    ['back', 'me', 'share'].forEach(function (k) { var r = mb[k]; if (r && isFinite(r.bottom)) bottom = Math.max(bottom, r.bottom); });
    if (info.safeArea && isFinite(info.safeArea.top)) bottom = Math.max(bottom, info.safeArea.top);
    if (bottom > 0) document.documentElement.style.setProperty('--top-avoid', Math.round(bottom + 6) + 'px');
  }
  var miniTool = window.xhs && window.xhs.miniTool;
  if (miniTool && typeof miniTool.getWindowInfo === 'function') {
    try { var p = miniTool.getWindowInfo(); if (p && typeof p.then === 'function') p.then(applyWindowInfo, function () {}); }
    catch (e) { /* 低版本或调用失败：保持默认布局 */ }
  }
})();

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

// ===== 规则引擎（纯逻辑，可无头运行）=====
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const BASE_CAP = { stir: 2, mix: 2, steam: 3 };   // 炒、搅拌两份，蒸三份
let UID = 1;
const mk = (key, stamp) => ({ uid: UID++, key, def: CARD_DEFS[key], stamp: stamp || null });

// 配对：手法加工它左边紧邻的原料（不越过别的手法）
function pairUp(slots, caps) {
  const dishes = [];
  slots.forEach((c, i) => {
    if (c.def.type !== 'tech') return;
    const cap = caps[c.key] || BASE_CAP[c.key] || 1, ings = [];
    for (let j = i - 1; j >= 0 && ings.length < cap; j--) { if (slots[j].def.type === 'tech') break; ings.unshift(slots[j]); }
    dishes.push({ tech: c, ings });
  });
  return dishes;
}

// 评估一锅。ctx: { recipes, lv, equipped, slotCap, spices, disabled }
// 返回逐项明细 steps（供动画逐步播放）与总分
function evaluate(slots, ctx) {
  const lv = ctx.lv || {}, own = new Set(ctx.recipes.filter(k => !(ctx.disabled || []).includes(k)));
  const eq = ctx.equipped.map(k => CARD_DEFS[k]), spices = (ctx.spices || []).map(k => CARD_DEFS[k]);
  const caps = {}; eq.forEach(d => { if (d.techDouble) caps[d.techDouble] = 2; });
  let dishes = pairUp(slots, caps);
  if (own.has('kaoniurou')) {           // 烤牛肉：烤加工到牛肉时可多配一份原料
    const d2 = pairUp(slots, Object.assign({}, caps, { roast: (caps.roast || 1) + 1 }));
    if (d2.some(d => d.tech.key === 'roast' && d.ings.some(c => c.key === 'beef'))) dishes = d2;
  }
  const ingCards = slots.filter(c => c.def.type === 'ing');
  let tofuIsEgg = false;
  const matches = (r, d) => r.tech === d.tech.key && r.ing.every(k => d.ings.some(c => c.key === k || (k === 'egg' && tofuIsEgg && c.key === 'tofu')));
  const triggers = [];
  const ordered = RECIPES.filter(r => own.has(r.key)).sort((a, b) => a.phase - b.phase);
  ordered.forEach(r => {
    let n = dishes.filter(d => matches(r, d)).length;
    if (r.once) n = Math.min(n, 1);
    if (n) { const ds = dishes.filter(d => matches(r, d)).slice(0, n); triggers.push({ r, n, f: fxOf(r, lv[r.key] || 1), dish: ds[0], ds }); if (r.fx.convert) tofuIsEgg = true; }
  });
  const sp = k => spices.reduce((s, d) => s + (d.fx[k] || 0), 0);
  const techX = spices.reduce((m, d) => m * (d.fx.techX || 1), 1), vegX = spices.reduce((m, d) => m * (d.fx.vegX || 1), 1);
  // 基础分：每张牌一步
  const steps = [], cardScore = {}; let base = 0, stampMult = 0, gold = 0;
  slots.forEach(c => {
    let v = c.def.base;
    if (c.def.type === 'tech') {
      const d = dishes.find(x => x.tech.uid === c.uid);
      eq.forEach(e => { if (e.techBonus && e.techBonus[0] === c.key) v += e.techBonus[1]; });
      v *= d.ings.length * techX;
    } else if (c.def.veg) v *= vegX;
    if (c.stamp === 'fresh') v += 3;
    const sm = c.stamp === 'aroma' ? 0.5 : 0;
    cardScore[c.uid] = v; base += v; stampMult += sm; if (c.stamp === 'gold') gold++;
    steps.push({ kind: 'card', uid: c.uid, add: v, mult: sm });
  });
  let add = 0, mult = 1 + stampMult; const after = { slot: 0, draw: 0, swap: 0 }, lines = [];
  const kinds = new Set(ingCards.map(c => c.key)).size;
  const techCards = slots.filter(c => c.def.type === 'tech' && cardScore[c.uid] > 0);
  const techKinds = new Set(techCards.map(c => c.key)).size;
  const empty = Math.max(0, ctx.slotCap - slots.length);
  triggers.forEach(({ r, n, f, dish, ds }) => {
    let a = 0, m = 0;
    if (f.add) a += f.add;
    if (f.perIng) a += f.perIng * ingCards.length;
    if (f.perKind) a += f.perKind * kinds;
    if (f.perTech) a += f.perTech * techCards.length;
    if (f.copyVeg) a += f.copyVeg * ingCards.filter(c => c.def.veg).reduce((s, c) => s + cardScore[c.uid], 0);
    if (f.mult) m += f.mult;
    if (f.multEmpty) m += f.multEmpty * empty;
    if (f.multTechKind) m += f.multTechKind * techKinds;
    a *= n; m = +(m * n).toFixed(2); add += a; mult += m;
    ['slot', 'draw', 'swap'].forEach(k => { if (f[k]) after[k] += f[k] * n; });
    const txt = a && m ? `+${a} 倍+${m}` : a ? `+${a}` : m ? `倍+${m}` : fxShort(f);
    lines.push({ key: r.key, name: r.name, n, txt, phase: r.phase, a, m, uids: [].concat.apply([], (ds || []).map(d => [d.tech.uid].concat(d.ings.map(c => c.uid)))) });
    steps.push({ kind: 'recipe', key: r.key, add: a, mult: m, txt });
  });
  // 帮厨伙计：菜谱之后、调料之前
  (ctx.helpers || []).forEach(key => {
    const f = HELPER_BY[key].fx; let a = 0, m = 0;
    if (f.perKey) a = f.perKey[1] * ingCards.filter(c => c.key === f.perKey[0] || (f.perKey[0] === 'egg' && tofuIsEgg && c.key === 'tofu')).length;
    if (f.perVeg) a = f.perVeg * ingCards.filter(c => c.def.veg).length;
    if (f.perTechKey) a = f.perTechKey[1] * techCards.filter(c => c.key === f.perTechKey[0]).length;
    if (f.perRecipe) a = f.perRecipe * lines.length;
    if (f.meatMult && ingCards.some(c => c.def.meat)) m = f.meatMult;
    if (f.techMult && techCards.some(c => c.key === f.techMult[0])) m = f.techMult[1];
    if (f.bigMult && slots.length >= f.bigMult[0]) m = f.bigMult[1];
    if (a || m) { add += a; mult += m; steps.push({ kind: 'helper', key, add: a, mult: m }); }
  });
  // 调料：最后结算
  (ctx.spices || []).forEach(key => { const d = CARD_DEFS[key];
    let a = 0, m = 0;
    if (d.fx.perIng) a = d.fx.perIng * ingCards.length;
    if (d.fx.mult) m = d.fx.mult;
    if (d.fx.multPerRecipe) m = d.fx.multPerRecipe * lines.length;
    add += a; mult += m;
    if (a || m || d.fx.techX || d.fx.vegX) steps.push({ kind: 'spice', key, add: a, mult: m, txt: a ? `+${a}` : m ? `倍+${+m.toFixed(2)}` : d.short });
  });
  mult = +mult.toFixed(2);
  const total = ingCards.length ? Math.round((base + add) * mult) : 0;
  return { dishes, cardScore, base, add, mult, total, lines, steps, after, gold, valid: ingCards.length > 0 };
}

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

// ===== 单线描图案（48×48，统一 2px 线宽，颜色跟随卡牌类型）=====
const ICONS = {
  egg: '<path d="M24 7C17 7 11 18 11 27a13 13 0 0 0 26 0C37 18 31 7 24 7z"/><path d="M17 26c0-4 1.5-8 4-11"/>',
  tomato: '<path d="M24 15c-10 0-16 6-16 14 0 7 7 12 16 12s16-5 16-12c0-8-6-14-16-14z"/><path d="M24 15c-2-3-6-4-9-3 2 3 5 4 9 3zM24 15c2-3 6-4 9-3-2 3-5 4-9 3zM24 15V8"/>',
  potato: '<path d="M11 21c2-8 13-11 21-8 8 3 9 13 4 20s-17 8-22 3c-4-4-5-10-3-15z"/><path d="M19 21l1 1M28 19l1 1M26 30l1 1M17 31l1 1"/>',
  mushroom: '<path d="M7 25C7 15 15 9 24 9s17 6 17 16z"/><path d="M19 25v10c0 3 2 5 5 5s5-2 5-5V25"/><path d="M17 17l.5.5M28 14l.5.5M32 20l.5.5"/>',
  beef: '<path d="M9 23c0-8 8-13 17-13s14 6 14 13c0 8-6 14-14 14-5 0-7-3-11-4S9 29 9 23z"/><circle cx="30" cy="25" r="3.5"/><path d="M16 18c3 1 5 4 8 4M15 27c2 0 4 1 6 3"/>',
  tofu: '<path d="M9 18l15-7 15 7v13l-15 7-15-7z"/><path d="M9 18l15 7 15-7M24 25v13"/>',
  shrimp: '<path d="M34 12c-13-3-23 6-21 17 1 8 9 12 17 9"/><path d="M34 12c1 5-2 9-7 10-4 1-6 4-5 8"/><path d="M30 38l5 3M30 38l1 5"/><path d="M20 16l3 5M15 23l5 2M15 31l5-1"/><path d="M34 12c3-3 6-4 9-3"/>',
  scallion: '<path d="M15 40c3-12 10-24 22-33"/><path d="M21 40c2-9 8-19 18-26"/><path d="M12 40c3 1 8 1 11 0"/><path d="M14 41l-2 3M18 41v3M22 41l2 3"/>',
  fry: '<path d="M9 39l16-14"/><path d="M21 21l9-9 8 8-9 9z"/><path d="M24 20l5-5M27 23l5-5M30 26l5-5"/>',
  cut: '<rect x="7" y="21" width="34" height="12" rx="6"/><path d="M18 14l-3 25M26 14l-3 25M34 14l-3 25"/>',
  deep: '<path d="M6 31c4-3 8 3 12 0s8 3 12 0 8 3 12 0"/><path d="M6 39c4-3 8 3 12 0s8 3 12 0 8 3 12 0"/><circle cx="16" cy="20" r="3"/><circle cx="27" cy="13" r="4"/><circle cx="33" cy="23" r="2"/>',
  steam: '<path d="M15 41c-4-5 4-8 0-13s4-8 0-13"/><path d="M24 39c-4-5 4-8 0-13s4-8 0-13"/><path d="M33 41c-4-5 4-8 0-13s4-8 0-13"/>',
  roast: '<path d="M24 42c-8 0-13-5-13-12 0-8 7-11 8-19 4 3 6 7 6 11 2-2 3-4 3-7 5 4 8 9 8 15 0 7-5 12-12 12z"/><path d="M24 42c-3 0-5-2-5-5 0-3 3-5 4-8 3 2 6 5 6 8s-2 5-5 5z"/>',
  stir: '<path d="M11 23a13 13 0 0 1 23-8"/><path d="M35 8v7h-7"/><path d="M37 25a13 13 0 0 1-23 8"/><path d="M13 40v-7h7"/>',
  mix: '<path d="M24 43V31"/><path d="M24 31c-8-2-10-12-6-20 2-4 10-4 12 0 4 8 2 18-6 20z"/><path d="M24 31c-3-5-3-14 0-21M24 31c3-5 3-14 0-21"/>',
  pan: '<circle cx="19" cy="27" r="12"/><circle cx="19" cy="27" r="7.5"/><path d="M29 20l12-8"/>',
  pot: '<path d="M10 20h28v14a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z"/><path d="M5 24h5M38 24h5"/><path d="M12 16h24"/><path d="M21 16v-4h6v4"/>',
  oven: '<rect x="8" y="9" width="32" height="30" rx="3"/><rect x="13" y="19" width="22" height="14" rx="2"/><path d="M14 14h.01M20 14h.01M26 14h8"/>',
  knife: '<path d="M6 13h24v15H9a3 3 0 0 1-3-3z"/><path d="M30 17h11a2 2 0 0 1 0 6H30"/><circle cx="25" cy="17.5" r="1.4"/>',
  wok: '<path d="M6 22h32c0 9-7 15-16 15S6 31 6 22z"/><path d="M38 23h7"/><path d="M6 22c-3 0-4 3-1 5"/><path d="M14 15c2-2 0-4 2-6M22 15c2-2 0-4 2-6M30 15c2-2 0-4 2-6"/>',
  salt: '<path d="M16 19h16l3 21H13z"/><path d="M17 19c0-7 3-11 7-11s7 4 7 11"/><path d="M21 13h.01M27 13h.01M24 11h.01"/>',
  soy: '<path d="M20 6h8v7l4 6v19a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V19l4-6z"/><path d="M16 27h16M20 9h8"/>',
  chili: '<path d="M31 15c-5 0-7 4-9 10-3 8-8 12-14 14 11 2 21-2 25-10 3-6 2-12-2-14z"/><path d="M31 15c0-4 2-7 6-8"/>',
  sugar: '<path d="M7 27l9-4 9 4v10l-9 4-9-4z"/><path d="M7 27l9 4 9-4M16 31v10"/><path d="M23 15l9-4 9 4v10l-9 4"/><path d="M23 15l9 4 9-4M32 19v6"/>',
  vinegar: '<path d="M21 7h6v9c6 3 9 8 9 14a12 12 0 0 1-24 0c0-6 3-11 9-14z"/><path d="M13 30h22"/>',
  hourglass: '<path d="M13 7h22M13 41h22"/><path d="M16 7c0 9 8 11 8 17s-8 8-8 17M32 7c0 9-8 11-8 17s8 8 8 17"/>',
  bowl: '<path d="M7 22h34c0 10-8 17-17 17S7 32 7 22z"/><path d="M17 39h14"/><path d="M18 16c0-3 3-3 3-6M27 16c0-3 3-3 3-6"/>',
  board: '<rect x="9" y="13" width="30" height="27" rx="2"/><path d="M15 21h18M15 27h18M15 33h10"/><path d="M19 13l5-5 5 5"/>',
  hand: '<rect x="8" y="13" width="15" height="23" rx="2.5" transform="rotate(-12 15 25)"/><rect x="25" y="11" width="15" height="23" rx="2.5" transform="rotate(10 32 23)"/>',
  ban: '<circle cx="24" cy="24" r="17"/><path d="M12 12l24 24"/>',
  basket: '<path d="M7 20h34l-4 19H11z"/><path d="M15 20l6-11M33 20l-6-11"/><path d="M18 27v6M24 27v6M30 27v6"/>',
  deck: '<rect x="11" y="12" width="22" height="29" rx="3"/><path d="M16 8h18a3 3 0 0 1 3 3v25"/>',
  spark: '<path d="M24 5c2 10 9 17 19 19-10 2-17 9-19 19-2-10-9-17-19-19 10-2 17-9 19-19z"/>',
  bell: '<path d="M9 34h30M6 40h36"/><path d="M11 34a13 13 0 0 1 26 0"/><path d="M24 21v-5M20 16h8"/>',
  up: '<path d="M24 40V11M13 21l11-11 11 11"/>',
  trim: '<circle cx="14" cy="35" r="5"/><circle cx="34" cy="35" r="5"/><path d="M17 31L34 7M31 31L14 7"/>',
  meat: '<path d="M30 9c6 0 10 5 9 11-1 7-8 11-14 11l-6 6a4 4 0 1 1-5-2 4 4 0 1 1 2-5l6-6c0-8 3-15 8-15z"/>',
  coin: '<circle cx="24" cy="24" r="16"/><rect x="19.5" y="19.5" width="9" height="9"/>',
  swap: '<path d="M10 17h26l-6-6"/><path d="M38 31H12l6 6"/>',
  check: '<path d="M11 25l9 9 17-19"/>',
  flame: '<path d="M24 42c-8 0-13-5-13-12 0-8 7-11 8-19 4 3 6 7 6 11 2-2 3-4 3-7 5 4 8 9 8 15 0 7-5 12-12 12z"/>',
  leaf: '<path d="M8 40C8 22 20 10 40 8c-2 20-14 32-32 32z"/><path d="M8 40L27 21"/>',
  next: '<path d="M10 24h26M26 14l10 10-10 10"/>',
  toss: '<path d="M11 16h26l-2.5 24h-21z"/><path d="M8 16h32M19 16v-5h10v5M20 23v10M28 23v10"/>',
  again: '<path d="M38 24a14 14 0 1 1-4-10"/><path d="M35 6v9h-9"/>',
};
const icon = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 48 48" aria-hidden="true">${ICONS[k] || ''}</svg>`;


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
  let n = BASE_CAP[c.key] || 1;
  if (eq.some(d => d.techDouble === c.key)) n = Math.max(n, 2);
  return n;
}
function cardTip(c) {
  const d = c.def;
  if (d.type === 'equip' || d.type === 'spice') return `${d.name}　${tagLine(d.tag)}\n${d.desc.replace('\n', '，')}`;
  if (d.type === 'tech') return `${d.name}：${d.base} 分 × 加工份数，可加工左边 ${capOf(c)} 份原料`;
  return `${d.name}：${d.base} 分${d.veg ? '，蔬菜' : ''}${d.meat ? '，荤' : ''}`;
}
// 卡面：所有地方（手牌、灶台、牌组、商店、包）同一个样子。
// 左边一列：分数、加工份数/荤素标记、竖排牌名（牌压叠时也露得出来）；右边：图案；左下：印记
function cardInner(c) {
  const d = c.def; let pt, mk = '';
  if (d.type === 'ing' || d.type === 'tech') pt = `<span class="pt">${d.base}</span>`;
  else if (d.type === 'equip') pt = `<span class="pt">+${d.slots}</span>`;
  else pt = `<span class="pt">${icon('spark')}</span>`;
  if (d.type === 'tech') mk = '<i></i>'.repeat(capOf(c));
  if (d.type === 'ing' && (d.veg || d.meat)) mk = `<span class="lf">${icon(d.veg ? 'leaf' : 'meat')}</span>`;
  return `<div class="cf"><div class="idx">${pt}${mk ? `<span class="mk">${mk}</span>` : ''}<span class="vn${d.name.length > 2 ? ' l' : ''}">${d.name}</span></div>
    <div class="plate"><div class="art">${icon(c.key)}</div></div>${c.stamp ? `<span class="stp ${STAMPS[c.stamp].cls}">${STAMPS[c.stamp].name}</span>` : ''}</div>`;
}
function cardEl(c, extra = '') {
  const el = document.createElement('div');
  el.className = `card ${c.def.type} ${extra}`; el.dataset.uid = c.uid;
  const d = c.def, st = c.stamp && STAMPS[c.stamp];
  const fx = [d.tag && `${d.name}　${tagLine(d.tag)}\n${d.desc.replace('\n', '，')}`, st && `印记「${st.name}」${tagLine(st.tag)}　${st.desc}`].filter(Boolean).join('\n');
  if (fx) el.dataset.fx = fx;   // 装备和调料的特殊效果，悬停时在浮框里显示
  el.innerHTML = cardInner(c);
  return el;
}
// 菜谱水牌：灶台上方挂的、商店卖的、包里开出来的，都是这一个样子
function ruleTag(r, lvl = 1) {
  const f = fxOf(r, lvl);
  const el = document.createElement('div'); el.className = 'rule'; el.dataset.key = r.key;
  el.innerHTML = `<div class="rc">${r.ing.map(k => `<span class="ic i">${icon(k)}</span>`).join('')}<span class="ic t">${icon(r.tech)}</span></div>
    <div class="rn${r.name.length > 3 ? ' l' : ''}">${r.name}</div><div class="eq">${fxPills(f)}</div>${lvl > 1 ? `<span class="lv">${lvl}</span>` : ''}<span class="x"></span>`;
  return el;
}
function ruleEl(r) {
  const lv = G.lv[r.key] || 1, el = ruleTag(r, lv);
  el.dataset.fx = `${r.name}${lv > 1 ? ' Lv' + lv : ''}　${tagLine(fxTags(fxOf(r, lv)))}\n${recipeCond(r)}\n${fxText(fxOf(r, lv))}`;
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
    return `<i class="${cls}">${i < G.round ? icon('check') : last ? icon(boss.icon) : ''}</i>`;
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
  $('#helpers').innerHTML = Array.from({ length: CFG.maxHelpers }, (_, i) => G.helpers[i]).map(k => !k ? '<span class="hchip empty"></span>' : `<span class="hchip" data-k="${k}" data-fx="${HELPER_BY[k].name}　${tagLine(HELPER_BY[k].tag)}\n${HELPER_BY[k].desc}">${icon(HELPER_BY[k].icon)}</span>`).join('');
}
function renderRules(ev) {
  const box = $('#rules'), have = new Map([...box.children].map(e => [e.dataset.key, e]));
  const keys = G.recipes;
  keys.forEach((k, i) => {
    let el = have.get(k);
    const sig = k + (G.lv[k] || 1);
    if (!el || el.dataset.sig !== sig) { const n = ruleEl(RECIPE_BY[k]); n.dataset.sig = sig; if (el) el.replaceWith(n); else box.appendChild(n); el = n; }
    have.delete(k);
    const hit = ev && ev.lines.find(l => l.key === k);
    el.classList.toggle('on', !!hit);
    el.querySelector('.x').textContent = hit ? (hit.n > 1 ? '×' + hit.n : '✔') : '';
    el.classList.toggle('off', !!(G.boss && G.boss.noRepeat && G.used.includes(k)));
    if (box.children[i] !== el) box.insertBefore(el, box.children[i]);
  });
  have.forEach(e => e.remove());
}

// ===== 灶台、手牌、按钮 =====
function renderStove(p) {
  const st = $('#stove');
  $('#equips').innerHTML = p.eqs.map(c => `<span class="chipx e new">${icon(c.key)}+${c.def.slots}</span>`).join('');
  $('#spices').innerHTML = p.sps.map(c => `<span class="chipx s" data-k="${c.key}">${icon(c.key)}${c.def.short}</span>`).join('');
  const nFood = p.food.length, cap = p.cap;
  const box = $('#slots'), W = widthOf(box), cw = CW(), flow = PHONE();
  box.classList.toggle('flow', flow);
  const list = p.over || p.why === 'ban' ? p.food : p.slots;
  const n = Math.max(cap, list.length), { xs } = spread(n, cw, W, 14);
  const old = new Map([...box.querySelectorAll('.card')].map(e => [e.dataset.uid, e]));
  box.querySelectorAll('.hole').forEach(h => h.remove());
  for (let i = list.length; i < n; i++) { const h = document.createElement('div'); h.className = 'hole'; h.style.left = flow ? '' : xs[i] + 'px'; box.appendChild(h); }
  list.forEach((c, i) => {
    let el = old.get(String(c.uid));
    if (!el) { el = cardEl(c, 'ghost'); el.style.left = flow ? '' : xs[i] + 'px'; box.appendChild(el); ani(el.querySelector('.cf'), [{ transform: 'translateY(60px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' }); }
    old.delete(String(c.uid));
    el.classList.remove('lit', 'spare', 'ban'); el.style.left = flow ? '' : xs[i] + 'px'; el.style.zIndex = i + 1;
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    if (banned(G, c)) el.classList.add('ban');
  });
  old.forEach(e => e.remove());
  st.classList.toggle('hot', !!(p.playable && p.ev.valid && !p.ev.spoiled));
  st.classList.toggle('roar', !!(p.playable && p.ev.valid && p.ev.total >= (G.target - G.score)));
  const W2 = { over: '槽位不够', ban: `${G.boss ? G.boss.rule : ''}，这锅不得分`, short: `${G.boss ? G.boss.rule : ''}`, noing: '缺原料' };
  $('#warn').innerHTML = p.why ? `${p.why === 'ban' ? icon('ban') : ''}${W2[p.why]}` : '';
}
function renderLinks(p) {
  const svg = $('#links'); svg.innerHTML = '';
  if (!p || p.why || !p.ev.valid) return;
  const pot = rectOf($('#pot')), ev = p.ev;
  const elOf = uid => $(`#slots .card[data-uid="${uid}"]`);
  const pos = uid => { const el = elOf(uid); if (!el) return null; const r = rectOf(el); return { x: r.left - pot.left + r.width / 2, y: r.bottom - pot.top }; };
  const hitUids = new Set([].concat.apply([], ev.lines.map(l => l.uids)));
  const used = new Set(); let out = '';
  ev.dishes.forEach(d => {
    const t = pos(d.tech.uid); if (!t) return;
    if (!d.ings.length) { out += `<path class="bad" d="M${t.x - 26} ${t.y + 12} H${t.x + 26}"/>`; return; }
    const hit = hitUids.has(d.tech.uid);
    d.ings.forEach(c => { used.add(c.uid); const q = pos(c.uid); if (q) out += `<path class="${hit ? 'hit' : ''}" d="M${q.x} ${q.y + 5} C${q.x} ${q.y + 26} ${t.x} ${t.y + 26} ${t.x} ${t.y + 5}"/>`; });
  });
  hitUids.forEach(u => { const el = elOf(u); if (el) el.classList.add('lit'); });
  p.slots.forEach(c => { if (c.def.type === 'ing' && !used.has(c.uid)) { const el = elOf(c.uid); if (el) el.classList.add('spare'); } });
  svg.innerHTML = out;
}

// 手牌：排序后排成扇形，中间高、两边低、越往外转得越多。
// 选中或正在看（鼠标悬停 / 手指按住）的牌：右边的牌往外让出位置，这张牌沿自己的倾斜方向弹出；叠放顺序不变
let prevHand = new Set(), peek = null, press = null, handLay = null;
function sortedHand() {
  const h = G.hand.slice();
  if (sortMode === 'type') h.sort((a, b) => TYPE_ORDER[a.def.type] - TYPE_ORDER[b.def.type] || a.key.localeCompare(b.key) || a.uid - b.uid);
  else h.sort((a, b) => (b.def.base || 0) - (a.def.base || 0) || TYPE_ORDER[a.def.type] - TYPE_ORDER[b.def.type] || a.uid - b.uid);
  return h;
}
// 算每张牌的位置：focus 里的牌右侧留出大半张牌宽，其余的牌平分剩下的宽度
function fanLayout(n, focus, W, cw, pad = 24) {
  const avail = W - pad * 2;
  if (n <= 0) return { xs: [], step: 0 };
  const base = n === 1 ? 0 : Math.min(cw + 8, (avail - cw) / (n - 1));
  const steps = Array.from({ length: Math.max(0, n - 1) }, () => base);
  const F = focus.filter(i => i < n - 1), want = Math.min(cw + 8, cw * .8);
  if (F.length && want > base) {
    // 其余的牌至少留出左边一条（约 1/3 张），露出竖排的点数和牌名
    const rest = n - 1 - F.length, room = avail - cw, minS = Math.min(base, Math.max(cw * .4, base * .7));
    let big = want, small = rest ? (room - big * F.length) / rest : base;
    if (rest && small < minS) { small = minS; big = Math.max(base, (room - small * rest) / F.length); }
    steps.forEach((s, i) => { steps[i] = F.includes(i) ? big : Math.min(base, small); });
  }
  // 总宽不能超过可用宽度：选的牌多了（比如除最后一张都选中），让位的间距按比例收回，两头的牌不会被挤出屏幕
  const sum = steps.reduce((s, v) => s + v, 0), room = Math.max(0, avail - cw);
  if (n > 1 && sum > room) {
    const extra = sum - room, give = steps.map(v => Math.max(0, v - Math.min(v, base))), gs = give.reduce((s, v) => s + v, 0);
    if (gs >= extra) steps.forEach((v, i) => { steps[i] = v - give[i] * extra / gs; });
    else steps.forEach((v, i) => { steps[i] = v * room / sum; });
  }
  const total = cw + steps.reduce((s, v) => s + v, 0), xs = [pad + (avail - total) / 2];
  steps.forEach(s => xs.push(xs[xs.length - 1] + s));
  return { xs, step: base };
}
function applyHand() {
  const box = $('#hand'), els = [...box.children], n = els.length, cw = CW(), W = widthOf(box);
  const uids = els.map(e => +e.dataset.uid);
  const focus = uids.map((u, i) => (sel.includes(u) || u === peek) ? i : -1).filter(i => i >= 0);
  const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch')) || 146;
  const A = n > 1 ? Math.min(12, n * 1.4) : 0, k = n > 2 ? Math.min(ch * .13, n * 1.6) : 0;   // 最外侧转 A 度；中间比两边高 k
  const pad = Math.max(4, Math.ceil(1.2 * ch * Math.sin(A * Math.PI / 180)) - 4);   // 两边的牌转出去的角不能出界（可以压进页边留白一点）
  const { xs, step } = fanLayout(n, focus, W, cw, pad);
  els.forEach((el, i) => {
    const o = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
    el.style.left = xs[i] + 'px'; el.style.zIndex = i + 1;
    el.style.transform = `translateY(${((o * o - 1) * k).toFixed(1)}px) rotate(${(o * A).toFixed(2)}deg)`;
    el.classList.toggle('peek', uids[i] === peek);
  });
  handLay = { uids, xs, cw };
  box.classList.toggle('tight', step < cw * 0.6);
}
// 按目标布局找手指 / 鼠标下面的牌（不按动画中途的位置找，避免来回跳）
function handHit(e) {
  if (!handLay) return null;
  const r = rectOf($('#hand')), x = e.clientX - r.left;
  if (e.clientY < r.top - 70 || e.clientY > r.bottom) return null;
  for (let i = handLay.uids.length - 1; i >= 0; i--) if (x >= handLay.xs[i] && x <= handLay.xs[i] + handLay.cw) return handLay.uids[i];
  return null;
}
function setPeek(u) {
  if (u === peek) return;
  const fx = fxEl && fxEl.isConnected && fxEl.closest('#hand') ? fxEl : null, x0 = fx && fx.style.left;
  peek = u; applyHand();
  if (fx && fx.style.left !== x0) showFx(fx);   // 浮框跟着那张牌一起挪
}
function renderHand() {
  const box = $('#hand');
  box.classList.remove('flow');
  const cards = sortedHand(), old = new Map([...box.children].map(e => [e.dataset.uid, e]));
  const pileX = center($('#pile')).x - rectOf(box).left, guess = fanLayout(cards.length, [], widthOf(box), CW()).xs;
  if (peek != null && !cards.some(c => c.uid === peek)) peek = null;
  let k = 0;
  cards.forEach((c, i) => {
    let el = old.get(String(c.uid));
    if (!el) {
      el = cardEl(c, 'enter'); el.tabIndex = 0; el.setAttribute('role', 'button');
      el.style.setProperty('--fromX', (guess[i] - pileX + 40) + 'px'); el.style.animationDelay = (k++ * 70) + 'ms';
      el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      box.appendChild(el);
    }
    old.delete(String(c.uid));
    const on = sel.includes(c.uid);
    el.classList.toggle('sel', on); el.setAttribute('aria-pressed', on);
    el.classList.toggle('ban', banned(G, c));
    if (banned(G, c) && !el.querySelector('.ban-ic')) el.insertAdjacentHTML('beforeend', `<span class="ban-ic">${icon('ban')}</span>`);
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
  });
  old.forEach(e => e.remove());
  applyHand();
  if (k && !REDUCED) setTimeout(() => sfxDeal(k), 0);
  prevHand = new Set(G.hand.map(c => c.uid));
  $('#pile b').textContent = G.pile.length; $('#pile').classList.toggle('empty', G.pile.length < 3);
  $('#dis b').textContent = G.discard.length;
}
function renderActs(p) {
  const pb = $('#playBtn'), db = $('#discBtn');
  pb.querySelector('.ico').innerHTML = icon('flame'); db.querySelector('.ico').innerHTML = icon('toss');
  pb.disabled = busy || !p.playable;
  pb.classList.toggle('ready', !pb.disabled);
  db.disabled = busy || !sel.length || G.discardsLeft <= 0;
}
function render() {
  sel = sel.filter(u => G.hand.some(c => c.uid === u));
  const p = previewSel(G, sel);
  renderTicket(p); renderStove(p); renderHand(); renderActs(p); renderRules(p.why ? null : p.ev);
  requestAnimationFrame(() => renderLinks(p));
  return p;
}

// ===== 交互 =====
function toggle(uid) {
  if (busy || G.phase !== 'play') return;
  const c = G.hand.find(c => c.uid === uid);
  if (c && banned(G, c) && !sel.includes(uid)) toast(`${G.boss.name}：${G.boss.rule}，打出去这锅不得分`);   // 只提醒，不拦着（可以选来弃掉）
  const i = sel.indexOf(uid); if (i >= 0) sel.splice(i, 1); else sel.push(uid);
  sfxTick(i < 0);
  render();
}
$('#hand').addEventListener('click', e => {
  if (press && press.held) { press = null; return; }   // 按住看牌后松手，不算点选
  press = null;
  const el = e.target.closest('.card'); if (el) toggle(+el.dataset.uid);
});
// 鼠标悬停：这张牌往外弹一点，右边的牌让开
$('#hand').addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { if (!busy) setPeek(handHit(e)); return; }
  if (press && press.held) { e.preventDefault(); const u = handHit(e); if (u != null) setPeek(u); }   // 按住后左右滑动换着看
});
$('#hand').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') setPeek(null); });
// 手指按住 0.25 秒：同样弹出来看；松手收回
$('#hand').addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || busy) return;
  const u = handHit(e); if (u == null) return;
  press = { held: false, t: setTimeout(() => { if (press) { press.held = true; setPeek(u); } }, 250) };
});
const endPress = () => { if (!press) return; clearTimeout(press.t); if (press.held) setPeek(null); else press = null; };
['pointerup', 'pointercancel'].forEach(t => $('#hand').addEventListener(t, endPress));
$('#slots').addEventListener('click', e => { const el = e.target.closest('.card'); if (el && !busy) toggle(+el.dataset.uid); });
document.addEventListener('keydown', e => {
  if (!$('#veil').hidden || busy) return;
  const el = e.target.closest && e.target.closest('#hand .card');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(+el.dataset.uid); }
  else if (e.key === 'p' || e.key === 'P') $('#playBtn').click();
  else if (e.key === 'd' || e.key === 'D') $('#discBtn').click();
  else if (e.key === 'Escape') { sel = []; render(); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (G && !busy) render(); }, 80); });

// ===== 动效与音效 =====
let AC = null, muted = false;
function tone(f, d = .08, type = 'triangle', vol = .06, when = 0) {
  if (muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.4, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d + .05);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .06);
  } catch (e) {}
}
const sfxTick = on => tone(on ? 660 : 440, .05, 'sine', .05);
const sfxDeal = n => { for (let i = 0; i < Math.min(n, 8); i++) tone(300 + i * 20, .03, 'square', .015, i * .07); };
const sfxStep = i => tone(392 * Math.pow(2, Math.min(i, 14) / 12), .07, 'triangle', .06);
const sfxMult = () => { tone(523, .1, 'sawtooth', .04); tone(784, .12, 'sawtooth', .03, .06); };
const sfxCoin = i => tone(1320 + (i % 3) * 120, .05, 'square', .025);
const sfxWin = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .14, 'triangle', .07, i * .1));
const sfxLose = () => [392, 330, 262].forEach((f, i) => tone(f, .2, 'sine', .07, i * .16));

function pop(x, y, text, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px'; $('#fx').appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
function popOn(el, text, cls, dy = -10) { if (!el) return; const r = rectOf(el); pop(r.left + r.width / 2, r.top + dy, text, cls); }
function sparks(x, y, n = 14) {
  if (REDUCED) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'spark'; s.style.left = x + 'px'; s.style.top = y + 'px'; $('#fx').appendChild(s);
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
    ani(s, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 30}px) scale(.2)`, opacity: 0 }],
      { duration: 500 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.4,1)' }).then(() => s.remove());
  }
}
// 一枚金币从 a 飞到 b（抛物线）
function flyCoin(a, b, delay = 0, cls = '') {
  return new Promise(res => setTimeout(() => {
    const c = document.createElement('i'); c.className = 'fly ' + cls; $('#fx').appendChild(c);
    const mx = (a.x + b.x) / 2 + (Math.random() - .5) * 80, my = Math.min(a.y, b.y) - 60 - Math.random() * 40;
    ani(c, [{ left: a.x + 'px', top: a.y + 'px', transform: 'scale(.6)' }, { left: mx + 'px', top: my + 'px', transform: 'scale(1.15)', offset: .45 }, { left: b.x + 'px', top: b.y + 'px', transform: 'scale(.7)' }],
      { duration: REDUCED ? 1 : 560, easing: 'cubic-bezier(.4,0,.6,1)' }).then(() => { c.remove(); res(); });
  }, REDUCED ? 0 : delay));
}
async function coinsTo(fromEl, n, target = $('#coins')) {
  if (n <= 0 || !fromEl || !target || !fromEl.isConnected || !target.isConnected) return;
  const a = center(fromEl), b = center(target), k = Math.min(n, 8), per = n / k;
  const tasks = [];
  for (let i = 0; i < k; i++) tasks.push(flyCoin({ x: a.x + (Math.random() - .5) * 30, y: a.y }, b, i * 70).then(() => {
    shown.coins += Math.round(per * (i + 1)) - Math.round(per * i); target.textContent = shown.coins; bump(target); sfxCoin(i);
  }));
  await Promise.all(tasks);
}
// 把元素克隆出来从 a 飞到 b（出牌进锅、弃牌、出锅进弃牌堆）
function flyClone(el, toRect, o = {}) {
  const r = rectOf(el), cl = el.cloneNode(true);
  cl.classList.remove('enter', 'sel', 'ghost'); cl.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:72;transform:none;transition:none;pointer-events:none`;
  $('#fx').appendChild(cl);
  const dx = toRect.left - r.left + (toRect.width - r.width) / 2, dy = toRect.top - r.top + (toRect.height - r.height) / 2, s = o.scale || 1;
  return ani(cl, [{ transform: `rotate(${o.r0 || 0}deg)`, opacity: 1 }, { transform: `translate(${dx * .5}px, ${dy * .5 - (o.arc || 50)}px) rotate(${(o.rot || 0) / 2}deg) scale(${(1 + s) / 2 + .05})`, offset: .5 },
    { transform: `translate(${dx}px, ${dy}px) rotate(${o.rot || 0}deg) scale(${s})`, opacity: o.fade ? 0 : 1 }],
    { duration: REDUCED ? 1 : (o.ms || 420), delay: REDUCED ? 0 : (o.delay || 0), easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).then(() => cl.remove());
}
function banner(big, small = '', bad = false) {
  const el = document.createElement('div'); el.className = 'banner' + (bad ? ' bad' : ''); el.innerHTML = `<b>${big}</b><span>${small}</span>`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
}

// ===== 出牌：逐步计分动画 =====
function setCalc(chip, mult) { $('#cChip').textContent = chip; $('#cMult').textContent = +(+mult).toFixed(2); $('#cChip').classList.remove('dim'); $('#cMult').classList.remove('dim'); }
$('#playBtn').onclick = async () => {
  if (busy) return; const p = previewSel(G, sel); if (!p.playable) return;
  busy = true; anim = true; shown.score = G.score; shown.coins = G.coins; renderActs(p);
  const uids = sel.slice(), handEls = uids.map(u => $(`#hand .card[data-uid="${u}"]`)).filter(Boolean);
  // 1. 牌从手里飞进锅（装备飞到左上角）
  const flights = handEls.map((el, i) => {
    const c = G.hand.find(c => c.uid === +el.dataset.uid), tgt = $(`#slots .card[data-uid="${c.uid}"]`);
    const to = tgt ? rectOf(tgt) : c.def.type === 'spice' ? rectOf($('#spices')) : rectOf($('#equips'));
    el.style.visibility = 'hidden';
    return flyClone(el, to, { delay: i * 60, ms: 380, arc: 70, scale: tgt ? 1 : .4, fade: !tgt });
  });
  tone(220, .12, 'sine', .05);
  await Promise.all(flights);
  document.querySelectorAll('#slots .card.ghost').forEach(e => e.classList.remove('ghost'));
  // 2. 逐张、逐条菜谱、逐个调料计分
  let chip = 0, mult = 1, i = 0;
  setCalc(0, 1); renderLinks(p);
  for (const s of p.ev.steps) {
    if (s.kind === 'card') {
      const el = $(`#slots .card[data-uid="${s.uid}"]`); if (!el) continue;
      el.classList.remove('score'); void el.offsetWidth; el.classList.add('score');
      if (s.add) popOn(el, '+' + s.add, 'c', 4); chip += s.add;
      if (s.mult) { mult += s.mult; popOn(el, '倍 +' + s.mult, 'm', 34); bump($('#cMult')); }
      setCalc(chip, mult); bump($('#cChip')); sfxStep(i++);
      await wait(s.add ? 230 : 120);
    } else {
      const el = s.kind === 'recipe' ? $(`.rule[data-key="${s.key}"]`) : s.kind === 'helper' ? $(`#helpers .hchip[data-k="${s.key}"]`) : $(`#spices .chipx[data-k="${s.key}"]`);
      if (el) { el.classList.remove('flash', 'hit'); void el.offsetWidth; el.classList.add(s.kind === 'recipe' ? 'flash' : 'hit'); }
      if (s.add) { chip += s.add; popOn(el, '+' + s.add, 'c', 30); bump($('#cChip')); sfxStep(i++); }
      if (s.mult) { mult += s.mult; popOn(el, '倍 +' + s.mult, 'm', 60); bump($('#cMult')); sfxMult(); }
      if (!s.add && !s.mult) popOn(el, s.txt, 'm', 40);
      setCalc(chip, mult);
      await wait(380);
    }
  }
  // 3. 出锅：大字、火星、震屏，分数滚到小票上
  const total = p.ev.total, sc = center($('#pot'));
  $('#calcTot').innerHTML = `= <b>${total}</b>`; bump($('#calcTot'));
  if (p.ev.spoiled) { pop(sc.x, sc.y - 20, `${G.boss.name}不吃，0 分`, 'big'); sfxLose(); }
  else { pop(sc.x, sc.y - 20, '+' + total, 'big g'); sparks(sc.x, sc.y, Math.min(40, 10 + total / 4)); }
  const huge = total >= G.target * .5 || total >= 60;
  if (huge) { $('#stove').classList.remove('shake'); void $('#stove').offsetWidth; $('#stove').classList.add('shake'); }
  tone(huge ? 196 : 262, .25, 'sawtooth', .05);
  const to = Math.min(G.target * 9, G.score + total);
  await Promise.all([
    tween(shown.score, to, 600, v => { shown.score = v; $('#got').textContent = v; $('#bar .got').style.width = Math.min(1, v / G.target) * 100 + '%'; }).then(() => bump($('#got'))),
    wait(250).then(() => coinsTo($('#rules').querySelector('.rule.on') || $('#stove'), p.ev.lines.length + p.ev.gold)),
  ]);
  if (p.ev.lines.length + p.ev.gold) popOn($('#coins'), `小费 +${p.ev.lines.length + p.ev.gold}`, 'g', -16);
  // 4. 锅里的牌用掉了：化成热气消失；装备回弃牌堆
  await Promise.all([...document.querySelectorAll('#slots .card')].map((el, k) => ani(el.querySelector('.cf'),
    [{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: 'translateY(-50px) scale(.7)', opacity: 0, filter: 'blur(4px)' }],
    { duration: REDUCED ? 1 : 420, delay: REDUCED ? 0 : k * 50, easing: 'ease-in', fill: 'forwards' })));
  if (p.eqs.length) bump($('#dis'));
  playSel(G, uids); sel = []; anim = null; busy = false;
  const last = G.last; render();
  if (last && last.reshuffled) showShuffle();
  await afterTurn();
};

// ===== 弃牌 =====
$('#discBtn').onclick = async () => {
  if (busy || !sel.length || G.discardsLeft <= 0) return;
  busy = true; renderActs(previewSel(G, sel));
  const dis = rectOf($('#dis'));
  await Promise.all(sel.map((u, k) => { const el = $(`#hand .card[data-uid="${u}"]`); if (!el) return; el.style.visibility = 'hidden'; return flyClone(el, dis, { delay: k * 50, ms: 360, rot: -30 + k * 10, scale: .45, arc: 40 }); }));
  tone(180, .1, 'square', .03); bump($('#dis'));
  discardSel(G, sel.slice()); sel = []; busy = false;
  const last = G.last; render();
  if (last && last.reshuffled) showShuffle();
  await afterTurn();
};
function showShuffle() {
  const pl = $('#pile'); pl.classList.remove('shuffle'); void pl.offsetWidth; pl.classList.add('shuffle');
  popOn(pl, '洗牌', 'c', -10); tone(330, .2, 'sine', .04); tone(440, .2, 'sine', .03, .1);
}

// ===== 回合结束 =====
async function afterTurn() {
  if (G.phase === 'shop') {
    busy = true; sfxWin();
    banner(G.boss ? '搞定！' : '达标！', G.boss ? `${G.boss.name} 很满意` : `${G.score} / ${G.target}`);
    sparks(innerWidth / 2, innerHeight * .42, 40);
    await wait(1300); busy = false; showBill();
  } else if (G.phase === 'over') {
    busy = true; sfxLose(); banner('收摊', `${G.score} / ${G.target}`, true);
    await wait(1400); busy = false; showOver();
  }
}
function sheet(html, cls = '') { if (typeof hideFx === 'function') hideFx(); const sh = $('#sheet'); sh.onclick = null; sh.className = cls; sh.innerHTML = html; sh.classList.toggle('wide', !!$('#sheet .shop')); $('#sheet').classList.toggle('deckwin', !!$('#sheet #dkList')); $('#veil').hidden = false; $('#sheet').scrollTop = 0; const b = $('#sheet .pill'); if (b) b.focus({ preventScroll: true }); }
function closeSheet() { $('#veil').hidden = true; }
const BILL_NAME = { tips: ['bowl', '小费'], base: ['bell', '基础奖励'], plays: ['flame', '剩余出牌'], interest: ['coin', '利息'], boss: ['spark', '挑剔食客赏钱'], helper: ['hat', '账房先生'] };
async function showBill() {
  const b = G.bill; shown.coins = G.coins - b.sum;
  const items = b.items;
  sheet(`<h1>结账</h1><div class="sub">第 ${G.level} 关　第 ${G.round + 1} 回合　${G.cooks} 锅</div>
    <div class="bill">${items.map((it, i) => `<div class="ln" style="animation-delay:${i * .22}s">${icon(BILL_NAME[it.k][0])}<span>${BILL_NAME[it.k][1]}</span><b>+${it.n}</b></div>`).join('')}
    <div class="ln tot" style="animation-delay:${items.length * .22}s"><span>进账</span><b id="billTot">+${b.sum}</b></div></div>
    <div class="btns"><span class="wallet">${icon('coin')}<b id="wallet">${shown.coins}</b></span><button class="pill" id="go">${icon('check')}确认</button></div>`);
  $('#go').onclick = () => { closeSheet(); showShop(); };
  await wait(items.length * 220 + 300);
  if ($('#billTot')) await coinsTo($('#billTot'), b.sum, $('#wallet'));
  shown.coins = G.coins; if ($('#wallet')) $('#wallet').textContent = G.coins;
  if (G.phase === 'shop') renderTicket(previewSel(G, []));
}

function maybeBossIntro() {
  if (!G.boss) return;
  const b = G.boss;
  sheet(`<div class="sub">第 ${G.level} 关最后一位客人</div><h1>${b.name}</h1><div class="boss-av">${icon(b.icon)}</div>
    <div class="boss-rule">${icon('ban')}${b.rule}</div>
    <div class="sub" style="margin-top:12px">目标 ${G.target}　喂饱他额外赏 ${CFG.bossTip + G.level * 2} 铜钱</div>
    <div class="btns"><button class="pill" id="go">${icon('flame')}接单</button></div>`);
  $('#go').onclick = () => { closeSheet(); render(); };
}
function showOver() {
  const best = G.bestCook || 0;
  sheet(`<h1>收摊了</h1><div class="sub">第 ${G.level} 关　第 ${G.round + 1} 回合　差 ${Math.max(0, G.target - G.score)} 分</div>
    <div class="bill" style="max-width:300px">
      <div class="ln" style="animation-delay:0s">${icon('check')}<span>通过回合</span><b style="color:var(--ink)">${G.history.length}</b></div>
      <div class="ln" style="animation-delay:.2s">${icon('flame')}<span>最香的一锅</span><b style="color:var(--ink)">${best}</b></div>
      <div class="ln" style="animation-delay:.4s">${icon('coin')}<span>一共赚了</span><b>${G.earned}</b></div>
      <div class="ln" style="animation-delay:.6s">${icon('spark')}<span>喂饱挑剔食客</span><b style="color:var(--ink)">${G.bossesBeat}</b></div>
    </div>
    <h2>${icon('board')}攒下的菜谱</h2>
    <div class="shelf">${G.recipes.map(k => ruleTag(RECIPE_BY[k], G.lv[k] || 1).outerHTML).join('')}</div>
    <div class="btns"><button class="pill" id="go">${icon('again')}再开一局</button></div>`);
  $('#go').onclick = () => { closeSheet(); start(); };
}
function showHelp() {
  sheet(`<h1>小灶</h1><div class="sub">每回合凑够目标分，每关最后喂饱一位挑剔的客人</div>
    <div class="help">
      <div class="box"><h3>怎么玩</h3>
        <p>点手牌选几张，按「出牌」做一锅菜，分数累加到目标就过关。每回合能出牌 ${CFG.plays} 次、弃牌 ${CFG.discards} 次，出牌次数用完还没达标就输了。</p>
        <p>点选的顺序就是槽位的顺序，从左往右排。<span class="ty tech">手法</span>加工它左边紧挨着的<span class="ty ing">原料</span>，手法卡底部有几个圆点就能加工几份。比如先点鸡蛋再点煎，就是「煎蛋」；先点煎再点鸡蛋，煎左边没有原料，不得分。再点一次能把牌取回。</p><p><span class="ty spice">调料</span>和<span class="ty equip">装备</span>不占槽位，跟这一锅一起出，只对这一锅有效。</p><p>出过的牌会用掉，从牌组里永久去掉，想再用要去商店买补货包；只有<span class="ty equip">装备</span>出完回到弃牌堆，可以反复用。弃牌不算用掉。</p>
      </div>
      <div class="box"><h3>怎么算分</h3>
        <p class="eqn">得分 = <span class="c">分</span> × <span class="m">倍率</span></p>
        <p>「分」是锅里牌面分的总和：原料拿自己的分，手法拿「牌面分 × 加工份数」。「倍率」从 1 开始。两者都可以被菜谱和调料加上去，左边小票上的蓝格和红格会实时显示。</p>
      </div>
      <div class="box"><h3>菜谱怎么看</h3>
        <p>菜谱挂在上方，不用打出。水牌上方的图标是条件：某个手法加工到了这些原料，就自动触发，每次触发客人还给 1 铜钱小费。水牌底部的彩色标签是效果，标签的写法见下面的「符号说明」。</p>
        <p style="margin-top:6px">结算顺序固定：先改规则类，再加分，再加倍率，调料最后。菜谱左上角的数字是等级，在商店里能升级。</p>
      </div>
      <div class="box sym"><h3>符号说明</h3>
        <p>菜谱、伙计、调料、装备、印记的效果都用同一套彩色标签。点一下牌或伙计，浮框里会同时显示标签和完整说明。</p>
        <h4>颜色</h4>
        <div class="tags"><span class="fxp c">蓝</span><span>加「分」，也就是小票上的蓝格</span><span class="fxp m">红</span><span>加「倍率」，也就是小票上的红格</span><span class="fxp r">紫</span><span>改规则：槽位、摸牌、弃牌次数、加工份数等</span><span class="fxp g">金</span><span>给铜钱</span></div>
        <h4>写法</h4>
        <div class="tags"><span class="fxp c">+5</span><span>这一锅「分」+5</span><span class="fxp m">倍+1</span><span>这一锅「倍率」+1；<b>.5</b> 就是 0.5</span><span class="fxp c">+2/料</span><span>「/」读作「每」：锅里每份原料，「分」+2</span><span class="fxp m">倍+.5/空</span><span>出牌时每空着 1 个槽位，「倍率」+0.5</span><span class="fxp c">蔬×2</span><span>「×」是翻倍：锅里蔬菜的分数算两遍</span><span class="fxp c">法×2</span><span>锅里手法的分数算两遍</span><span class="fxp c">蒸+3</span><span>每张「蒸」的牌面分 +3，再乘加工份数（烤同理）</span><span class="fxp m">有荤 倍+1</span><span>锅里有荤菜（牛肉、鲜虾）时，「倍率」+1</span><span class="fxp m">≥5张 倍+1.5</span><span>锅里有 5 张以上的牌时，「倍率」+1.5</span></div>
        <h4>「/」后面的字</h4>
        <div class="tags"><b class="sy">/料</b><span>每份原料</span><b class="sy">/种</b><span>每种不同的原料</span><b class="sy">/法</b><span>每张起作用的手法</span><b class="sy">/种法</b><span>每种不同的手法</span><b class="sy">/空</b><span>每个空着的槽位</span><b class="sy">/谱</b><span>每个这一锅触发的菜谱</span><b class="sy">/蛋</b><span>每份鸡蛋</span><b class="sy">/蔬</b><span>每份蔬菜</span><b class="sy">/切</b><span>每张「切」</span></div>
        <h4>改规则和铜钱</h4>
        <div class="tags"><span class="fxp r">槽+2</span><span>槽位 +2（装备只管这一锅；菜谱「出锅后」生效，管本回合剩下的锅）</span><span class="fxp r">摸+2</span><span>出锅后多摸 2 张牌</span><span class="fxp r">弃+1</span><span>本回合弃牌次数 +1</span><span class="fxp r">切2份</span><span>「切」可以加工 2 份原料</span><span class="fxp r">烤+1份</span><span>加工牛肉的「烤」多加工 1 份原料</span><span class="fxp r">腐=蛋</span><span>这一锅的豆腐也算鸡蛋</span><span class="fxp g">钱+3</span><span>给 3 铜钱（伙计在结账时给，「金」印记在打出时给）</span></div>
        <h4>牌面</h4>
        <div class="tags"><span class="pt-demo ing">4</span><span>左上圆圈：原料、手法是牌面分；装备是「+槽位」；调料是 ✦</span><span class="dot-demo"><i></i><i></i></span><span>分数下面的圆点：这张手法能加工几份原料</span><span class="ic-demo">${icon("leaf")}</span><span>叶子：蔬菜</span><span class="ic-demo">${icon("meat")}</span><span>肉：荤菜</span><span class="stp c">鲜</span><span>印记：「鲜」<span class="fxp c">+3</span>，「香」<span class="fxp m">倍+.5</span>，「金」<span class="fxp g">钱+1</span>，盖在牌的左下角</span><span class="ban-demo">${icon("ban")}</span><span>挑剔食客不吃的牌：能选、能弃，打出去这一锅不得分</span></div>
      </div>
      <div class="box"><h3>赚钱和补牌</h3>
        <p>回合结束结账：基础奖励 ${CFG.earnBase}，剩一次出牌多给 1，手上每存 ${CFG.interestPer} 铜钱给 1 利息（最多 ${CFG.interestMax}），喂饱挑剔食客另有赏钱。牌堆摸空后弃牌堆会洗回来，点牌堆能看还剩哪些牌。</p>
        <p>商店每回合有 4 件精选（菜谱、伙计、单卖的牌），再加随机两种包：补货包（8 张原料和手法全收，用来补牌）、原料包、手法包、调料包、菜谱包、升级包（灶台永久 +1）、加工包（给牌盖印记：「鲜」+3 分、「香」倍率 +0.5、「金」打出 +1 铜钱）、精简包（去掉牌）。帮厨伙计最多 3 位。</p>
      </div>
    </div>
    <div class="btns"><button class="pill" id="go">${icon('flame')}开火</button></div>`);
  $('#go').onclick = () => { closeSheet(); seenHelp = true; render(); };
}
$('#helpBtn').onclick = showHelp;
function start(seed) {
  G = newRun(seed || (Date.now() % 1e9)); sel = []; prevHand = new Set(); anim = null; busy = false;
  $('#hand').innerHTML = ''; $('#slots').innerHTML = ''; render();
  if (!seenHelp) showHelp();
}
window.__cook = { get G() { return G; }, start, render, get busy() { return busy; } };
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => start());

// ===== 特殊效果浮框：点一下牌出现，框里只有效果描述 =====
// 先等牌抬起的动画结束，再一次性算好位置后显示，避免先出现在别处再跳过去
const fxTip = document.createElement('div'); fxTip.id = 'fxtip'; fxTip.hidden = true; document.body.appendChild(fxTip);
let fxEl = null, fxTimer = 0, fxFollow = 0;
function placeFx() {
  if (!fxEl || !fxEl.isConnected) return hideFx();
  const r = rectOf(fxEl.querySelector('.cf') || fxEl), t = rectOf(fxTip);
  let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 10;
  if (y < 6) y = r.bottom + 8;
  fxTip.style.left = Math.max(6, Math.min(innerWidth - t.width - 6, x)) + 'px'; fxTip.style.top = y + 'px';
}
// 点一下立刻出现；牌还在弹起时，浮框每帧跟着牌走，动画停了就停（不会先出现在别处再跳过去）
function showFx(el) {
  clearTimeout(fxTimer); cancelAnimationFrame(fxFollow); fxEl = el;
  if (!el.isConnected) return hideFx();
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  fxTip.innerHTML = esc(el.dataset.fx).replace(/\[([cmrg])\|([^\]]+)\]/g, '<span class="fxp $1">$2</span>');
  fxTip.style.visibility = 'hidden'; fxTip.hidden = false;   // 先隐形量尺寸
  placeFx();
  fxTip.style.visibility = ''; fxTip.classList.add('on');
  const t0 = performance.now();
  const follow = t => { if (fxEl !== el || fxTip.hidden) return; placeFx(); if (t - t0 < 420) fxFollow = requestAnimationFrame(follow); };
  fxFollow = requestAnimationFrame(follow);
}
function hideFx() { clearTimeout(fxTimer); cancelAnimationFrame(fxFollow); fxTip.hidden = true; fxTip.classList.remove('on'); fxEl = null; }
// 点击之后再判断：手牌重绘会替换元素，所以按 uid 找回当前那张牌
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-fx]');
  if (!el) { hideFx(); return; }
  if (e.target.closest('button.buy')) return;                 // 点的是购买按钮，不弹效果
  if (el.classList.contains('hslot')) return;             // 商店伙计由 u9 处理
  const uid = el.dataset.uid;
  requestAnimationFrame(() => {
    const inPlay = el.closest('#hand, #slots');   // 手牌重绘会替换元素，按 uid 找回；商店、牌组窗口里的牌直接用
    const cur = inPlay ? document.querySelector(`#hand .card[data-uid="${uid}"], #slots .card[data-uid="${uid}"]`) : el;
    if (!cur || !cur.dataset.fx) { hideFx(); return; }
    if (cur.closest('#hand') && !cur.classList.contains('sel')) { hideFx(); return; }   // 取消选中就收起
    if (!inPlay && fxEl === cur && !fxTip.hidden) { hideFx(); return; }   // 商店、包里的牌：再点一下收起
    showFx(cur);
  });
});
addEventListener('scroll', hideFx, true);
addEventListener('resize', hideFx);

// ===== 牌组窗口：游戏中和商店共用同一套样式 =====
// 每张牌显示卡面（分数、图案、印记）+ 功能 + 印记效果；同样的牌合并计数
function funcText(k) {
  const d = CARD_DEFS[k];
  if (d.type === 'tech') return `加工 ${capOf({ key: k, def: d })} 份`;
  if (d.type === 'ing') return d.veg ? '蔬菜' : d.meat ? '荤菜' : '';
  return d.desc.replace('\n', '，');
}
function deckGrid(list, pickable) {
  const html = ['ing', 'tech', 'spice', 'equip'].map(t => {
    const cs = list.filter(e => CARD_DEFS[e.key].type === t)
      .sort((a, b) => a.key.localeCompare(b.key) || (a.stamp || '').localeCompare(b.stamp || ''));
    if (!cs.length) return '';
    return `<div class="pv-g"><div class="pv-t ${t}">${TYPE_NAME[t]} ${cs.length}</div><div class="fan">${cs.map(e => {
      const ok = pickable && pickable(e), c = { uid: 0, key: e.key, def: CARD_DEFS[e.key], stamp: e.stamp };
      const el = cardEl(c); el.dataset.i = e.i == null ? '' : e.i; if (pickable) { el.classList.add('pick'); if (!ok) el.classList.add('off'); }
      return el.outerHTML;
    }).join('')}</div></div>`;
  }).join('');
  return html || '<div class="sub" style="padding:30px 0">这里是空的</div>';
}
// 把每一排牌按宽度排开，放不下就压叠（和手牌一样）
function layoutFans() {
  const flow = PHONE();
  document.querySelectorAll('#dkList .fan').forEach(f => {
    f.classList.toggle('flow', flow);
    if (flow) { [...f.children].forEach(c => { c.style.left = ''; }); return; }
    const cards = [...f.children], W = f.clientWidth || 600, cw = cards[0] ? cards[0].offsetWidth : 72;
    const { xs } = spread(cards.length, cw, W, 8);
    const sh = xs.length ? -xs[0] : 0;   // 靠左排
    cards.forEach((c, i) => { c.style.left = (xs[i] + sh) + 'px'; c.style.zIndex = i + 1; });
  });
}
const STAMP_LEGEND = () => `<div class="legend">${Object.values(STAMPS).map(s => `<span><span class="stp ${s.cls}">${s.name}</span>${s.desc}</span>`).join('')}</div>`;
function deckSheet(o) {
  sheet(`<h1>牌组</h1>
    <div class="tabs">${o.tabs.map(t => `<button class="tab ${t.k === o.tab ? 'on' : ''}" data-t="${t.k}" ${t.off ? 'disabled' : ''}>${t.name}${t.n != null ? ` <b>${t.n}</b>` : ''}</button>`).join('')}</div>
    <div class="sub" style="font-size:15px">${o.sub}</div>${STAMP_LEGEND()}
    <div class="pv" id="dkList"></div>
    <div class="btns"><button class="pill" id="go">${o.back}</button></div>`);
  document.querySelectorAll('#sheet .tabs .tab').forEach(b => b.onclick = () => o.onTab(b.dataset.t));
}
const deckEntries = () => G.deck.map((k, i) => ({ key: k, stamp: G.stamps[i], i }));
function showPiles(tab = 'pile') {
  if (busy || G.phase !== 'play') return;
  const lists = { pile: G.pile.map(c => ({ key: c.key, stamp: c.stamp })), dis: G.discard.map(c => ({ key: c.key, stamp: c.stamp })), deck: deckEntries() };
  const SUB = { pile: '还没摸到的牌', dis: '这回合弃掉的牌和用过的装备', deck: '出过的牌会用掉，装备除外' };
  deckSheet({ tab, sub: SUB[tab], back: `${icon('flame')}回到灶台`, onTab: showPiles,
    tabs: [{ k: 'pile', name: '牌堆', n: lists.pile.length }, { k: 'dis', name: '弃牌堆', n: lists.dis.length }, { k: 'deck', name: '整副牌组', n: lists.deck.length }] });
  $('#dkList').innerHTML = deckGrid(lists[tab]); layoutFans();
  $('#go').onclick = closeSheet;
}
$('#pile').addEventListener('click', () => showPiles('pile'));
$('#dis').addEventListener('click', () => showPiles('dis'));
['pile', 'dis'].forEach(id => { const el = $('#' + id); el.tabIndex = 0; el.setAttribute('role', 'button');
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPiles(id); } }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#veil').hidden && $('#sheet .tabs')) closeSheet(); });
$('#veil').addEventListener('click', e => { if (e.target.id === 'veil' && $('#sheet .tabs')) closeSheet(); });
addEventListener('resize', () => { if (document.querySelector('#dkList .fan')) layoutFans(); });

// ===== 禁止整页拖动：只有窗口里本来就能滚的列表（牌组、说明、菜谱水牌）可以滑 =====
function canScroll(el, dx, dy) {
  for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (Math.abs(dy) >= Math.abs(dx) && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
    }
    if (Math.abs(dx) > Math.abs(dy) && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      if ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)) return true;
    }
  }
  return false;
}
let touch0 = null;
document.addEventListener('touchstart', e => { const t = e.touches[0]; touch0 = t ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) { e.preventDefault(); return; }   // 双指缩放
  const t = e.touches[0]; if (!t || !touch0) return;
  const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
  if (!canScroll(e.target, dx, dy)) e.preventDefault();          // 列表滚到头、或不在列表里：不让整页跟着动
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

// ===== 商店：货架 + 礼包 + 菜市场 + 伙计 + 灶台升级 + 牌面加工 =====
// 买东西只就地更新货架，不重建整页、不等动画，所以不会卡
ICONS.hat = '<path d="M14 26c-5 0-8-4-8-8s4-8 9-7c1-4 5-6 9-6s8 2 9 6c5-1 9 3 9 7s-3 8-8 8"/><path d="M14 26v12h20V26"/><path d="M14 33h20"/>';
ICONS.gift = '<rect x="8" y="19" width="32" height="21" rx="2"/><path d="M6 13h36v6H6zM24 13v27"/><path d="M24 13c-3-6-11-7-11-2 0 2 4 2 11 2zM24 13c3-6 11-7 11-2 0 2-4 2-11 2z"/>';
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
    return `${r.name}${it.kind === 'up' ? ` 升到 Lv${lv}` : ''}　${tagLine(fxTags(fxOf(r, lv)))}\n${recipeCond(r)}\n${fxText(fxOf(r, lv))}`;
  }
  if (it.kind === 'helper') { const h = HELPER_BY[it.key]; return `${h.name}　${tagLine(h.tag)}\n${h.desc}`; }
  if (it.kind === 'upg') { const u = UPGRADES.find(u => u.key === it.key); return `灶台升级：${u.name} +1\n永久生效（现在 ${G.up[it.key]}/${u.prices.length} 级）`; }
  const c = { uid: 0, key: it.key, def: CARD_DEFS[it.key], stamp: it.stamp };
  return cardTip(c) + (it.stamp ? `\n印记「${STAMPS[it.stamp].name}」${tagLine(STAMPS[it.stamp].tag)}　${STAMPS[it.stamp].desc}` : '');
}
const buyBtn = (p, off, attrs) => `<button class="buy${off ? ' no' : ''}" ${attrs} ${off ? 'disabled' : ''}>${icon('coin')}${p}</button>`;
function wareHTML(it, i) {
  if (it.sold) return `<span class="ware gone"></span>`;
  const full = it.kind === 'helper' && G.helpers.length >= CFG.maxHelpers;
  const off = G.coins < it.price || full;
  const st = it.stamp && STAMPS[it.stamp];
  return `<div class="ware${off ? ' off' : ''}"><span class="ware-art" data-fx="${attr(itemFx(it))}">${noFx(wareBody(it))}</span>
    ${it.n > 1 ? `<span class="qty">×${it.n}</span>` : ''}${st ? `<span class="sfx ${st.cls}">${st.name}　${st.desc}</span>` : ''}${full ? '<button class="buy no" disabled>伙计已满</button>' : buyBtn(it.price, off, `data-act="buy" data-i="${i}"`)}</div>`;
}
// 包：补货包、原料、手法、调料、菜谱、升级、加工、精简，同一种样式
const packDesc = k => PACKS[k].desc || `${PACKS[k].show} 选 ${PACKS[k].pick}`;
function packFx(k) {
  const p = PACKS[k], T = { ing: '原料', tech: '手法', spice: '调料' };
  if (p.all) return `${p.name}\n${p.show} 张原料和手法，全部放进牌组`;
  if (k === 'trim') return `${p.name}\n从牌组里挑 ${p.pick} 张去掉`;
  if (k === 'stamp') return `${p.name}\n${p.show} 张牌里挑 ${p.pick} 张，盖上随机印记`;
  if (k === 'up') return `${p.name}\n${p.show} 项灶台升级里挑 ${p.pick} 项，永久生效`;
  if (k === 'recipe') return `${p.name}\n${p.show} 条菜谱里挑 ${p.pick} 条，已有的就是升级`;
  return `${p.name}\n${p.show} 张${T[k]}里挑 ${p.pick} 张`;
}
function packHTML(it, i) {
  const pk = PACKS[it.key], off = G.coins < it.price;
  if (it.sold) return `<span class="pkb gone"></span>`;
  return `<div class="pkb ${it.key}${off ? ' off' : ''}" data-fx="${attr(packFx(it.key))}">
    <span class="pk-ic">${icon(pk.icon)}<i>${icon('gift')}</i></span><span class="pk-tx"><b>${pk.name}</b><small>${packDesc(it.key)}</small></span>${buyBtn(it.price, off, `data-act="pack" data-i="${i}"`)}</div>`;
}
function helpersHTML() {
  return Array.from({ length: CFG.maxHelpers }, (_, i) => {
    const k = G.helpers[i]; if (!k) return `<span class="hslot empty"></span>`;
    const h = HELPER_BY[k];
    return `<button class="hslot" data-act="fire" data-k="${k}" data-fx="${h.name}　${tagLine(h.tag)}\n${h.desc}\n再点一下辞退，退 ${Math.floor(h.price / 2)}">${icon(h.icon)}</button>`;
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
  $('#go').onclick = () => { closeSheet(); leaveShop(G); sel = []; render(); maybeBossIntro(); };
}
const buySfx = () => { tone(880, .06, 'square', .03); tone(1175, .08, 'square', .03, .06); };
$('#sheet').addEventListener('click', e => {
  // 点牌或包：第一下看说明，第二下点同一个就买（等同于点它下面的按钮）
  const art = G.phase === 'shop' && !e.target.closest('button') && e.target.closest('.ware-art, .pkb');
  if (art) {
    if (fxEl !== art || fxTip.hidden) return;                 // 第一下：交给浮框显示说明
    const btn = art.closest('.ware, .pkb').querySelector('button.buy'); if (!btn) return;
    if (btn.disabled) { toast(/已满/.test(btn.textContent) ? '伙计已满' : '铜钱不够'); return; }
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
    if (!openPack(G, +b.dataset.i)) return; buySfx();
    if (G.pack.key === 'trim') showDeck('trim'); else showPack();
  } else if (act === 'fire') {   // 第一下看效果，第二下辞退
    if (fxEl !== b || fxTip.hidden) { showFx(b, 0); return; }
    if (fire(G, b.dataset.k)) { tone(300, .1, 'sine', .04); hideFx(); showShop(); }
  }
  else if (act === 'reroll') { if (reroll(G)) { tone(500, .08, 'sine', .04); paintShop(); ani($('#shelf'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220 }); } }
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
      : `<div class="ware pkw${def.all ? ' got' : ''}" style="animation-delay:${j * 70}ms"><span class="ware-art" data-fx="${attr(itemFx(it))}">${noFx(body(it))}</span>${def.all ? '' : `<button class="buy take" data-j="${j}" ${pk.left ? '' : 'disabled'}>要这个</button>`}</div>`).join('');
    $('#pkLeft').textContent = def.all ? `${pk.items.length} 张已放进牌组` : `挑 ${pk.left} 样`;
  };
  const back = () => { if (G.pack !== pk) return; closePack(G); showShop(); };
  sheet(`<h1>${def.name}</h1><div class="sub" id="pkLeft"></div>${pk.key === 'stamp' ? STAMP_LEGEND() : ''}<div class="shelf pkopen${pk.items.length > 4 ? ' many' : ''}" id="pkRow"></div>
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
  const sub = mode === 'trim' ? (pk.left ? `点一张牌去掉，还能去 ${pk.left} 张` : '去好了') : '出过的牌会用掉，装备除外';
  deckSheet({ tab: mode, sub, back: mode === 'trim' ? '不要了' : `${icon('again')}回商店`, onTab: showDeck,
    tabs: mode === 'trim' ? [{ k: 'trim', name: '精简包', n: G.deck.length }] : [{ k: 'view', name: '牌组', n: G.deck.length }] });
  $('#dkList').innerHTML = deckGrid(deckEntries(), mode === 'trim' ? () => pk.left > 0 && G.deck.length > 8 : null); layoutFans();
  $('#dkList').onclick = async e => {
    const b = e.target.closest('.card.pick'); if (!b || b.classList.contains('off') || mode !== 'trim') return;
    if (!trimFromPack(G, +b.dataset.i)) return; tone(240, .15, 'sawtooth', .04);
    await ani(b, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30px) rotate(20deg) scale(.6)', opacity: 0 }], { duration: 260, fill: 'forwards' });
    if (pk.left > 0 && G.deck.length > 8) showDeck('trim'); else { closePack(G); showShop(); }   // 去够了就自动回商店
  };
  $('#go').onclick = () => { if (pk) closePack(G); showShop(); };
}

