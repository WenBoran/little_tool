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
  pot:   { type: 'equip', name: '汤锅',   slots: 2, price: 5, desc: '槽位 +2\n每张「蒸」牌面分 +3', techBonus: ['steam', 3], short: '蒸+3' },
  oven:  { type: 'equip', name: '烤箱',   slots: 2, price: 5, desc: '槽位 +2\n每张「烤」牌面分 +4', techBonus: ['roast', 4], short: '烤+4' },
  knife: { type: 'equip', name: '菜刀',   slots: 1, price: 5, desc: '槽位 +1\n「切」加工 2 份', techDouble: 'cut', short: '切2份' },
  wok:   { type: 'equip', name: '大铁锅', slots: 4, price: 6, desc: '槽位 +4' },
  steamer: { type: 'equip', name: '蒸笼', slots: 2, price: 6, desc: '槽位 +2\n被「蒸」加工的原料留下' },
  cboard:  { type: 'equip', name: '砧板', slots: 1, price: 5, desc: '槽位 +1\n被「切」加工的原料盖上「鲜」留下' },
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
  { key: 'qiefanqie', name: '切番茄',   ing: ['tomato'],        tech: 'cut',   phase: 1, price: 6, once: 1, fx: { copyVeg: 1 }, up: { copyVeg: 1 } },
  { key: 'zhatudou',  name: '炸土豆',   ing: ['potato'],        tech: 'deep',  phase: 2, price: 7, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'zhaxia',    name: '炸虾',     ing: ['shrimp'],        tech: 'deep',  phase: 2, price: 7, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'niupai',    name: '香煎牛排', ing: ['beef'],          tech: 'fry',   phase: 2, price: 7, once: 1, fx: { multEmpty: 0.5 }, up: { multEmpty: 0.25 } },
  { key: 'banhua',    name: '葱花拌',   ing: ['scallion'],      tech: 'mix',   phase: 2, price: 7, once: 1, fx: { multPerTech: 0.5 }, up: { multPerTech: 0.25 } },
  { key: 'doufugeng', name: '蛋香豆腐', ing: ['tofu'],          tech: 'mix',   phase: 0, price: 6, once: 1, fx: { convert: 1 }, up: { add: 4 } },
  { key: 'kaoniurou', name: '烤牛肉',   ing: ['beef'],          tech: 'roast', phase: 0, price: 7, once: 1, fx: { double: 1 }, up: { add: 6 } },
  { key: 'zhengdan',  name: '蒸蛋',     ing: ['egg'],           tech: 'steam', phase: 3, price: 7, fx: { slot: 1 }, up: { add: 5 } },
  { key: 'tudousi',   name: '土豆丝',   ing: ['potato'],        tech: 'cut',   phase: 3, price: 6, once: 1, fx: { draw: 2 }, up: { draw: 1 } },
  { key: 'tudouni',   name: '土豆泥',   ing: ['potato'],        tech: 'mix',   phase: 3, price: 6, fx: { swap: 1 }, up: { add: 5 } },
  // ---- 第二批：每道菜一个不同的用处（大菜要两三样原料，靠订货凑；回锅省牌；烤蘑菇赚钱；炸蘑菇压轴；麻婆豆腐乘倍率）----
  { key: 'bandoufu',  name: '小葱拌豆腐', ing: ['scallion', 'tofu'], tech: 'mix', phase: 1, price: 6, fx: { add: 14 }, up: { add: 8 } },
  { key: 'xiadan',    name: '鲜虾蒸蛋', ing: ['shrimp', 'egg'], tech: 'steam', phase: 1, price: 8, fx: { add: 8, mult: 0.5 }, up: { add: 4, mult: 0.25 } },
  { key: 'sanxian',   name: '三鲜豆腐', ing: ['shrimp', 'mushroom', 'tofu'], tech: 'steam', phase: 1, price: 10, fx: { add: 16, mult: 1 }, up: { add: 8, mult: 0.5 } },
  { key: 'shaoniurou',name: '土豆烧牛肉', ing: ['potato', 'beef'], tech: 'stir', phase: 2, price: 8, fx: { mult: 1 }, up: { mult: 0.5 } },
  { key: 'mapo',      name: '麻婆豆腐', ing: ['tofu', 'beef'],  tech: 'stir',  phase: 2, price: 9, once: 1, fx: { xm: 1.5 }, up: { xm: 0.25 } },
  { key: 'huiguo',    name: '回锅肉',   ing: ['beef'],          tech: 'stir',  phase: 1, price: 6, fx: { keep: 1, add: 6 }, up: { add: 4 } },
  { key: 'kaomogu',   name: '烤蘑菇',   ing: ['mushroom'],      tech: 'roast', phase: 1, price: 5, once: 1, fx: { coin: 2, add: 4 }, up: { coin: 1, add: 2 } },
  { key: 'zhamogu',   name: '炸蘑菇',   ing: ['mushroom'],      tech: 'deep',  phase: 2, price: 7, once: 1, fx: { lastX: 2 }, up: { lastX: 0.5 } },
  // ---- 第三批：出锅后改牌组（见 l3.js fatesOf）----
  { key: 'paofa',     name: '泡发香菇', ing: ['mushroom'],      tech: 'mix',   phase: 3, price: 6, once: 1, fx: { keepIng: 'mushroom' }, up: { add: 4 } },
  { key: 'congyou',   name: '葱油',     ing: ['scallion'],      tech: 'deep',  phase: 3, price: 6, once: 1, fx: { spiceOut: 1 }, up: { add: 4 } },
];
// 装备、调料的符号标签（和菜谱、伙计同一套写法，见玩法说明里的「符号说明」）
const CARD_TAGS = { pan: [['r', '槽+3']], pot: [['r', '槽+2'], ['c', '蒸+3']], oven: [['r', '槽+2'], ['c', '烤+4']], knife: [['r', '槽+1'], ['r', '切2份']], wok: [['r', '槽+4']],
  steamer: [['r', '槽+2'], ['r', '蒸料 留']], cboard: [['r', '槽+1'], ['r', '切料+鲜 留']],
  salt: [['c', '+2/料']], soy: [['c', '法×2']], chili: [['m', '倍+1']], sugar: [['c', '蔬×2']], vinegar: [['m', '倍+.5/谱']], wine: [['c', '荤×2']] };
Object.keys(CARD_TAGS).forEach(k => { CARD_DEFS[k].tag = CARD_TAGS[k]; });
// 装备出完不会用掉：和其他效果一样用标签「回」表示，不另写说明
Object.values(CARD_DEFS).forEach(d => { if (d.type === 'equip') { d.tag = d.tag.concat([['r', '留']]); d.desc += '\n打出后留下，下回合再用'; } });
const RECIPE_BY = byKey(RECIPES);
function fxOf(r, lv = 1) {
  const f = Object.assign({}, r.fx);
  Object.entries(r.up || {}).forEach(([k, v]) => { f[k] = +((f[k] || 0) + v * (lv - 1)).toFixed(2); });
  return f;
}
// 菜谱效果拆成几条：k = c 加分（蓝） / m 倍率（红） / r 改规则（紫）；s 短标签，l 完整说明
function fxParts(f) {
  const p = [], c = (t, s, l) => p.push({ k: 'c', t, s, l }), m = (t, s, l) => p.push({ k: 'm', t, s, l }), r = (t, s, l) => p.push({ k: 'r', t, s, l }), g = (t, s, l) => p.push({ k: 'g', t, s, l });
  const n = v => String(v).replace(/^0\./, '.');
  // 说明统一短句：分写「+N 分」、倍率写「倍率 +N」、留下写「留下」；「生效」= 手法加工到了原料
  if (f.keep) r('法 留', '手法留下', '做这道菜的手法留下');
  if (f.convert) r('腐=蛋', '豆腐当鸡蛋', '豆腐也算鸡蛋');
  if (f.double) r('烤+1份', '烤多加工1份', '加工牛肉的「烤」多加工 1 份');
  if (f.add) c(`+${f.add}`, `+${f.add} 分`, `+${f.add} 分`);
  if (f.perIng) c(`+${f.perIng}/料`, `每份原料 +${f.perIng}`, `每份原料 +${f.perIng} 分`);
  if (f.perVeg) c(`+${f.perVeg}/蔬`, `每份蔬菜 +${f.perVeg}`, `每份蔬菜 +${f.perVeg} 分`);
  if (f.perTech) c(`+${f.perTech}/法`, `每张手法 +${f.perTech}`, `每张生效手法 +${f.perTech} 分`);
  if (f.copyVeg) p.push({ k: 'c re', t: `重算蔬${f.copyVeg > 1 ? '×' + f.copyVeg : ''}`, s: `蔬菜分重算 ${f.copyVeg} 次`, l: `蔬菜分再算 ${f.copyVeg} 次` });
  if (f.mult) m(`倍+${n(f.mult)}`, `倍率 +${f.mult}`, `倍率 +${f.mult}`);
  if (f.multEmpty) m(`倍+${n(f.multEmpty)}/空`, `每空槽 倍+${f.multEmpty}`, `每个空槽位 倍率 +${f.multEmpty}`);
  if (f.multPerTech) m(`倍+${n(f.multPerTech)}/法`, `每张手法 倍+${f.multPerTech}`, `每张生效手法 倍率 +${f.multPerTech}`);
  if (f.xm) m(`倍×${f.xm}`, `倍率 ×${f.xm}`, `倍率 ×${f.xm}（最后乘）`);
  if (f.lastX) m(`末次 倍×${f.lastX}`, `末次 倍率 ×${f.lastX}`, `本回合最后一次出牌 倍率 ×${f.lastX}`);
  if (f.coin) g(`钱+${f.coin}`, `小费 +${f.coin}`, `+${f.coin} 铜钱`);
  if (f.slot) r(`槽+${f.slot}`, `槽位 +${f.slot}`, `本回合槽位 +${f.slot}`);
  if (f.draw) r(`摸+${f.draw}`, `多摸 ${f.draw} 张`, `多摸 ${f.draw} 张`);
  if (f.swap) r(`弃+${f.swap}`, `弃牌 +${f.swap}`, `本回合弃牌 +${f.swap}`);
  if (f.keepIng) r('菇+留', '蘑菇盖「留」', '加工的蘑菇盖上「留」');
  if (f.spiceOut) r('+1辣椒', '多 1 张辣椒', '牌组加 1 张「辣椒」');
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
const CFG = { hand: 8, plays: 5, discards: 3, baseSlots: 2, rounds: [16, 26, 36, 44], growth: 1.35, startCoins: 4,
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
  { key: 'chen',   name: '豆腐老陈', icon: 'tofu',     price: 5, desc: '被「搅拌」加工的鸡蛋变成豆腐留下', tag: [['r', '搅蛋→腐']] },
  { key: 'ershen', name: '种葱二婶', icon: 'scallion', price: 6, desc: '青葱留下，牌组再加 1 张青葱', tag: [['r', '葱留 +1葱']] },
  { key: 'liu',    name: '学徒小刘',   icon: 'mix',      price: 5, desc: '生效的「搅拌」变成「炒」留下', tag: [['r', '搅→炒']] },
  { key: 'zhou',   name: '收菜老周', icon: 'basket',   price: 5, desc: '打出的原料中，牌组里最少的那种 1 张变成最多的那种留下', tag: [['r', '少料→多料']] },
  { key: 'mei',    name: '洗碗小妹', icon: 'salt',     price: 5, desc: '第 1 张调料变成「盐」留下', tag: [['r', '调料→盐']] },
  { key: 'sun',    name: '磨刀老孙', icon: 'cut',      price: 6, desc: '第 1 张生效的「切」留下', tag: [['r', '切 留']] },
  { key: 'dashen', name: '帮厨大婶',   icon: 'hand',     price: 7, desc: '没被加工的原料留下（最多 2 张）', tag: [['r', '生料 留']] },
  { key: 'jiang',  name: '酱园掌柜',   icon: 'soy',      price: 7, desc: '触发菜谱的原料中分最高的 1 张盖上「香」留下（已有香、金、留、双的跳过）', tag: [['r', '菜料→香']] },
  { key: 'fan',    name: '鲜货贩子',   icon: 'stamp',    price: 6, desc: '「鲜」变「香」、「香」变「金」，留下', tag: [['r', '鲜→香→金']] },
  { key: 'jin',    name: '金掌柜',     icon: 'bell',     price: 6, desc: '带「金」的牌留下', tag: [['r', '金 留']] },
  { key: 'huotou', name: '火头军',     icon: 'flame',    price: 6, desc: '每回合收尾那次出牌，生效的手法盖上「鲜」留下（已有印记的不换）', tag: [['r', '收尾 法→鲜']] },
  { key: 'wang',   name: '酱缸王伯',   icon: 'bowl',     price: 5, desc: '带调料出牌时，分最高的原料盖上「鲜」留下（已有印记的不换）', tag: [['r', '带调料 料→鲜']] },
  { key: 'qiang',  name: '双灶阿强',   icon: 'pot',      price: 7, desc: '每回合第 1 次出牌，原料全部留下', tag: [['r', '首次 料留']] },
  { key: 'apo',    name: '打包阿婆',   icon: 'gift',     price: 7, desc: '单次得分达到本回合目标一半时，原料和手法全部留下', tag: [['r', '高分 全留']] },
];
HELPERS.forEach(h => { h.fx = h.fx || {}; });
const HELPER_BY = byKey(HELPERS);
// 牌面加工：给牌组里的一张原料或手法盖印
// 印记（附魔）：随机出现，玩家不能自选
const STAMPS = {
  fresh: { name: '鲜', desc: '牌面分 +3',       cls: 'c', w: 5, tag: [['c', '+3']] },
  aroma: { name: '香', desc: '倍率 +0.5',   cls: 'm', w: 3, tag: [['m', '倍+.5']] },
  gold:  { name: '金', desc: '打出时 +1 铜钱', cls: 'g', w: 2, tag: [['g', '钱+1']] },
  keep:  { name: '留', desc: '打出后留下', cls: 'r', w: 1.5, tag: [['r', '留']] },
  dup:   { name: '双', desc: '打出后变成 2 张留下（不带印记）', cls: 'r', w: 1.5, tag: [['r', '变2张']] },
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
// 熟练度：一道菜谱累计做出这么多锅，就免费升一级（和商店买的升级叠加）
CFG.mastery = [3, 7, 12, 18, 25];
CFG.lowDeck = 22;   // 牌组少于这个数时，两种包里必有补货包（出过的牌会用掉，防止补不上牌）
