// 每条菜谱：凑齐它要的牌时，比不装它多拿多少分（4 原料 + 3 手法随机手牌，强制含配方的牌）
const K = require('./load')(process.argv[2]);
const { RECIPES, CARD_DEFS, ING_KEYS, TECH_KEYS } = K;
let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const out = [];
RECIPES.forEach(r => {
  let gain = 0, n = 0;
  for (let t = 0; t < 300; t++) {
    const keys = [...r.ing, r.tech]; while (keys.filter(k => CARD_DEFS[k].type === 'ing').length < 4) keys.push(ING_KEYS[Math.floor(R() * 8)]);
    while (keys.filter(k => CARD_DEFS[k].type === 'tech').length < 3) keys.push(TECH_KEYS[Math.floor(R() * 7)]);
    const cards = keys.map(k => K.mk(k));
    for (const lastPlay of [false, true]) {
      const base = { recipes: ['jiandan'], lv: {}, equipped: [], slotCap: +(process.env.SL||5), spices: [], helpers: [], lastPlay };
      const a = K.arrange(cards, base).ev.total, b = K.arrange(cards, Object.assign({}, base, { recipes: ['jiandan', r.key] })).ev.total;
      gain += b - a; n++;
    }
  }
  out.push([r.name, r.price, (gain / n).toFixed(1), (gain / n / r.price).toFixed(2)]);
});
out.sort((a, b) => b[3] - a[3]).forEach(x => console.log(x.join('\t')));
