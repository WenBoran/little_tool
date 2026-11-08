// ===== 规则引擎（纯逻辑，可无头运行）=====
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const BASE_CAP = { stir: 2, mix: 2, steam: 3 };   // 炒、搅拌两份，蒸三份
let UID = 1;
const mk = (key, stamp) => ({ uid: UID++, key, def: CARD_DEFS[key], stamp: stamp || null });

// 配对：手法能碰到它左边 N 个槽位（N = 加工份数），碰到的原料都算加工到；中间的手法也占一个槽位，但不挡。
// [虾 炸 蒸]：蒸能碰 3 格，碰到虾 → 炸虾、蒸虾都触发。[牛肉 炒 土豆 炒]：第二个炒只碰到 土豆、炒，碰不到牛肉
function pairUp(slots, caps) {
  const dishes = [];
  slots.forEach((c, i) => {
    if (c.def.type !== 'tech') return;
    const cap = caps[c.key] || BASE_CAP[c.key] || 1, ings = [];
    for (let j = i - 1; j >= 0 && j >= i - cap; j--) { if (slots[j].def.type !== 'tech') ings.unshift(slots[j]); }
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
  const helperFx = (ctx.helpers || []).map(k => HELPER_BY[k].fx);
  let tofuIsEgg = helperFx.some(f => f.asEgg);
  const canCount = (c, k) => c.key === k || (k === 'egg' && tofuIsEgg && c.key === 'tofu')
    || helperFx.some(f => (f.asVeg === c.key && CARD_DEFS[k].veg) || (f.alias && f.alias[0] === c.key && f.alias[1] === k));
  // 同一道菜的每份配料必须有独立的实体牌；回溯避免替代牌抢占另一份配料。
  const matchIng = (req, got, used = []) => {
    if (!req.length) return used;
    for (const c of got) {
      if (used.includes(c) || !canCount(c, req[0])) continue;
      const found = matchIng(req.slice(1), got, used.concat(c));
      if (found) return found;
    }
    return null;
  };
  const triggers = [];
  const ordered = ctx.recipes.filter(k => own.has(k)).map(k => RECIPE_BY[k]).sort((a, b) => a.phase - b.phase || ctx.recipes.indexOf(a.key) - ctx.recipes.indexOf(b.key));
  ordered.forEach(r => {
    let ds = dishes.filter(d => r.tech === d.tech.key).map(d => ({ tech: d.tech, ings: matchIng(r.ing, d.ings) })).filter(d => d.ings);
    if (r.once || ctx.oneEach) ds = ds.slice(0, 1);
    if (ds.length) { triggers.push({ r, n: ds.length, f: fxOf(r, lv[r.key] || 1), dish: ds[0], ds }); if (r.fx.convert) tofuIsEgg = true; }
  });
  // 重复触发只重算已经找到的菜谱，不重新寻找触发条件，避免无限循环。
  const initialTriggers = triggers.slice();
  const firstTriggered = predicate => initialTriggers.filter(predicate || (() => true)).sort((a, b) => ctx.recipes.indexOf(a.r.key) - ctx.recipes.indexOf(b.r.key))[0];
  if (!ctx.oneEach) {
    const addReplay = (target, ds) => { if (target) triggers.push(Object.assign({}, target, { n: ds ? ds.length : 1, ds: ds || [target.ds[0]], replay: true })); };
    initialTriggers.forEach(src => {
      if (src.f.retriggerIng) {
        const target = firstTriggered(t => t.r.key !== src.r.key && t.r.ing.includes(src.f.retriggerIng));
        for (let i = 0; i < src.n; i++) addReplay(target);
      }
    });
    helperFx.forEach(f => {
      if (f.repeatIng) initialTriggers.filter(t => t.r.ing.includes(f.repeatIng)).forEach(t => addReplay(t, t.ds));
      if (f.retriggerAny) spices.forEach(() => addReplay(firstTriggered()));
    });
    eq.forEach(e => { if (e.repeatTech) addReplay(firstTriggered(t => t.r.tech === e.repeatTech)); });
  }
  const sp = k => spices.reduce((s, d) => s + (d.fx[k] || 0), 0);
  const techX = spices.reduce((m, d) => m * (d.fx.techX || 1), 1), vegX = spices.reduce((m, d) => m * (d.fx.vegX || 1), 1), meatX = spices.reduce((m, d) => m * (d.fx.meatX || 1), 1);
  // 基础分：每张牌一步
  const steps = [], cardScore = {}; let base = 0, stampMult = 0, gold = 0;
  slots.forEach(c => {
    // 固定顺序：牌面分（手法 × 加工份数）→ 印记「鲜」+3 → 调料翻倍。「鲜」的 +3 也会被翻倍
    let v = c.def.base;
    if (c.def.type === 'tech') {
      const d = dishes.find(x => x.tech.uid === c.uid);
      eq.forEach(e => { if (e.techBonus && e.techBonus[0] === c.key) v += e.techBonus[1]; });
      v *= d.ings.length;
    }
    if (c.stamp === 'fresh') v += 3;
    if (c.def.type === 'tech') v *= techX; else if (c.def.veg) v *= vegX; else if (c.def.meat) v *= meatX;
    const sm = c.stamp === 'aroma' ? 0.5 : 0;
    cardScore[c.uid] = v; base += v; stampMult += sm; if (c.stamp === 'gold') gold++;
    steps.push({ kind: 'card', uid: c.uid, add: v, mult: sm });
  });
  let add = 0, mult = 1 + stampMult; const after = { slot: 0, draw: 0, swap: 0 }, lines = [];
  const kinds = new Set(ingCards.map(c => c.key)).size;
  const techCards = slots.filter(c => c.def.type === 'tech' && dishes.some(d => d.tech.uid === c.uid && d.ings.length));
  const techKinds = new Set(techCards.map(c => c.key)).size;
  const empty = Math.max(0, ctx.slotCap - slots.length);
  const xms = [], keep = [];   // 倍率连乘（最后结算）、不会用掉的手法
  const recipeHasIng = (r, k) => k === 'veg' ? r.ing.some(x => CARD_DEFS[x] && CARD_DEFS[x].veg) : k === 'meat' ? r.ing.some(x => CARD_DEFS[x] && CARD_DEFS[x].meat) : r.ing.includes(k);
  const recipeCount = k => triggers.reduce((s, t) => s + (recipeHasIng(t.r, k) ? t.n : 0), 0);
  triggers.forEach(({ r, n, f, dish, ds, replay }) => {
    let a = 0, m = 0;
    if (f.add) a += f.add;
    if (f.perIng) a += f.perIng * ingCards.length;
    if (f.perVeg) a += f.perVeg * ingCards.filter(c => c.def.veg).length;
    if (f.perTech) a += f.perTech * techCards.length;
    if (f.copyVeg) a += f.copyVeg * ingCards.filter(c => c.def.veg).reduce((s, c) => s + cardScore[c.uid], 0);
    if (f.perRecipeIngAdd) a += f.perRecipeIngAdd[1] * recipeCount(f.perRecipeIngAdd[0]);
    if (f.mult) m += f.mult;
    if (f.multEmpty) m += f.multEmpty * empty;
    if (f.multPerTech) m += f.multPerTech * techCards.length;
    if (f.perRecipeIngMult) m += f.perRecipeIngMult[1] * recipeCount(f.perRecipeIngMult[0]);
    a *= n; m = +(m * n).toFixed(2); add += a; mult += m;
    if (f.coin) gold += f.coin * n;
    if (f.perRecipeIngCoin) gold += f.perRecipeIngCoin[1] * recipeCount(f.perRecipeIngCoin[0]) * n;
    if (f.keep) ds.forEach(d => keep.push(d.tech.uid));
    const x = f.xm || (f.lastX && ctx.lastPlay ? f.lastX : 0);
    if (x) xms.push({ key: r.key, x: Math.pow(x, n) });
    ['slot', 'draw', 'swap'].forEach(k => { if (f[k]) after[k] += f[k] * n; });
    const txt = x ? `倍×${x}` : a && m ? `+${a} 倍+${m}` : a ? `+${a}` : m ? `倍+${m}` : f.coin ? `钱+${f.coin * n}` : fxShort(f);
    const events = ds.map(d => [d.tech.uid].concat(d.ings.map(c => c.uid)));
    lines.push({ key: r.key, name: r.name, n, txt, phase: r.phase, a, m, replay: !!replay, events, uids: [].concat.apply([], events) });
    if (!x) steps.push({ kind: 'recipe', key: r.key, add: a, mult: m, txt });
  });
  const trig = lines.reduce((t, l) => t + l.n, 0);   // 这次出牌一共触发了几次菜谱（同一道做成 2 份算 2 次）
  eq.forEach(e => { if (e.drawPerTech) after.draw += triggers.filter(t => t.r.tech === e.drawPerTech).reduce((s, t) => s + t.n, 0); });
  // 帮厨伙计：菜谱之后、调料之前
  (ctx.helpers || []).forEach(key => {
    const f = HELPER_BY[key].fx; let a = 0, m = 0;
    if (f.perKey) a = f.perKey[1] * ingCards.filter(c => c.key === f.perKey[0]).length;
    if (f.perVeg) a = f.perVeg * ingCards.filter(c => c.def.veg).length;
    if (f.perTechKey) a = f.perTechKey[1] * techCards.filter(c => c.key === f.perTechKey[0]).length;
    if (f.perRecipe) a = f.perRecipe * trig;
    if (f.perRecipeIngAdd) a = f.perRecipeIngAdd[1] * recipeCount(f.perRecipeIngAdd[0]);
    if (f.meatMult && ingCards.some(c => c.def.meat)) m = f.meatMult;
    if (f.techMult && techCards.some(c => c.key === f.techMult[0])) m = f.techMult[1];
    if (f.bigMult && slots.length >= f.bigMult[0]) m = f.bigMult[1];
    if (f.perRecipeIngMult) m = f.perRecipeIngMult[1] * recipeCount(f.perRecipeIngMult[0]);
    if (f.techRecipeMult) m = [...new Set(triggers.map(t => t.r.tech))].reduce((s, k) => s + Math.floor(triggers.filter(t => t.r.tech === k).reduce((v, t) => v + t.n, 0) / 3) * f.techRecipeMult, 0);
    if (f.coinPerRecipe) gold += f.coinPerRecipe * trig;
    if (a || m || f.coinPerRecipe) { add += a; mult += m; steps.push({ kind: 'helper', key, add: a, mult: m, gold: f.coinPerRecipe ? f.coinPerRecipe * trig : 0 }); }
  });
  // 调料：最后结算
  (ctx.spices || []).forEach(key => { const d = CARD_DEFS[key];
    let a = 0, m = 0;
    if (d.fx.perIng) a = d.fx.perIng * ingCards.length;
    if (d.fx.mult) m = d.fx.mult;
    if (d.fx.multPerRecipe) m = d.fx.multPerRecipe * trig;
    add += a; mult += m;
    if (a || m || d.fx.techX || d.fx.vegX || d.fx.meatX) steps.push({ kind: 'spice', key, add: a, mult: m, txt: a ? `+${a}` : m ? `倍+${+m.toFixed(2)}` : d.short });
  });
  // 倍率连乘：所有加法都算完以后再乘（麻婆豆腐、炸蘑菇最后一锅）
  xms.forEach(({ key, x }) => { mult *= x; steps.push({ kind: 'recipe', key, add: 0, mult: 0, xm: x, txt: `倍×${x}` }); });
  mult = +mult.toFixed(2);
  const total = ingCards.length ? Math.round((base + add) * mult) : 0;
  return { dishes, cardScore, base, add, mult, total, lines, trig, steps, after, gold, keep, valid: ingCards.length > 0 };
}
