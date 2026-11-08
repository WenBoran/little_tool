// ===== 出牌：逐步计分动画 =====
// 出锅后一张牌的变化，短写法：灶台小牌子和出锅冒字共用（牌压叠时只露左边一条，字要短）；没变化返回空
const changedOf = f => f.key !== f.c.key || (f.stamp || null) !== (f.c.stamp || null) || (f.plus || 0) !== (f.c.plus || 0);
function fateShort(f) {
  if (f.key !== f.c.key) return '→' + CARD_DEFS[f.key].name.slice(-1);
  if ((f.stamp || null) !== (f.c.stamp || null)) return f.stamp ? '+' + STAMPS[f.stamp].name : '×2';
  if ((f.plus || 0) !== (f.c.plus || 0)) return '+' + ((f.plus || 0) - (f.c.plus || 0));
  return '';
}
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
  sfx.whoosh();
  await Promise.all(flights); sfx.sizzle(.6);
  document.querySelectorAll('#slots .card.ghost').forEach(e => e.classList.remove('ghost'));
  // 2. 逐张、逐条菜谱、逐个调料计分
  let chip = 0, mult = 1, i = 0;
  setCalc(0, 1); renderLinks(p);
  for (const s of p.ev.steps) {
    if (s.kind === 'card') {
      const el = $(`#slots .card[data-uid="${s.uid}"]`); if (!el) continue;
      el.classList.remove('score'); void el.offsetWidth; el.classList.add('score');
      if (s.add) popOn(el, '+' + s.add, 'c', 4); chip += s.add;
      if (s.mult) { mult += s.mult; popOn(el, '+' + s.mult, 'm', 34); bump($('#cMult')); }
      setCalc(chip, mult); bump($('#cChip')); sfxStep(i++);
      await wait(s.add ? 230 : 120);
    } else {
      const el = s.kind === 'recipe' ? $(`.rule[data-key="${s.key}"]`) : s.kind === 'helper' ? $(`#helpers .hchip[data-k="${s.key}"]`) : $(`#spices .chipx[data-k="${s.key}"]`);
      if (el) { el.classList.remove('flash', 'hit'); void el.offsetWidth; el.classList.add(s.kind === 'recipe' ? 'flash' : 'hit'); }
      if (s.kind === 'recipe' && !s.xm) sfx.ding(i);
      if (s.add) { chip += s.add; popOn(el, '+' + s.add, 'c', 30); bump($('#cChip')); if (s.kind !== 'recipe') sfxStep(i); i++; }
      if (s.mult) { mult += s.mult; popOn(el, '+' + s.mult, 'm', 60); bump($('#cMult')); sfxMult(); }
      if (s.xm) { mult *= s.xm; popOn(el, '×' + s.xm, 'm', 60); bump($('#cMult')); sfx.xm(); }
      else if (!s.add && !s.mult) popOn(el, s.txt, 'm', 40);
      setCalc(chip, mult);
      await wait(380);
    }
  }
  // 3. 出锅：大字、火星、震屏，分数滚到小票上
  const total = p.ev.total, sc = center($('#pot'));
  $('#calcTot').innerHTML = `= <b>${total}</b>`; bump($('#calcTot'));
  if (p.ev.spoiled) { pop(sc.x, sc.y - 20, `${G.boss.name}不吃，0 分`, 'big'); sfx.spoil(); }
  else { pop(sc.x, sc.y - 20, '+' + total, 'big g'); sparks(sc.x, sc.y, Math.min(40, 10 + total / 4)); }
  const huge = total >= G.target * .5 || total >= 60;
  if (huge) { $('#stove').classList.remove('shake'); void $('#stove').offsetWidth; $('#stove').classList.add('shake'); }
  if (!p.ev.spoiled) sfx.total(huge);
  const to = Math.min(G.target * 9, G.score + total);
  await Promise.all([
    tween(shown.score, to, 600, v => { shown.score = v; $('#got').textContent = v; $('#bar .got').style.width = Math.min(1, v / G.target) * 100 + '%'; }).then(() => bump($('#got'))),
    wait(250).then(() => coinsTo($('#rules').querySelector('.rule.on') || $('#stove'), (p.ev.trig || 0) + p.ev.gold)),
  ]);
  if ((p.ev.trig || 0) + p.ev.gold) popOn($('#coins'), `小费 +${(p.ev.trig || 0) + p.ev.gold}`, 'g', -16);
  // 4. 锅里的牌飞进弃牌堆；有变化的先冒字、换卡面
  const fa = fatesOf(G, p), fate = new Map(fa.cards.map(f => [f.c.uid, f]));
  p.sps.forEach(c => { const f = fate.get(c.uid), t = f && fateShort(f); if (t) popOn($(`#spices .chipx[data-k="${c.key}"]`), t, 'r', -6); });
  let nPop = 0;
  await Promise.all([...document.querySelectorAll('#slots .card')].map((el, k) => {
    const f = fate.get(+el.dataset.uid);
    if (!f) return wait(0).then(() => { el.style.visibility = 'hidden'; return flyClone(el, rectOf($('#dis')), { delay: k * 40, ms: 360, scale: .45, arc: 40, rot: -20 }); });
    const changed = changedOf(f), t = fateShort(f);
    if (changed) { el.innerHTML = cardInner({ key: f.key, def: CARD_DEFS[f.key], stamp: f.stamp, plus: f.plus }); el.className = `card ${CARD_DEFS[f.key].type}`; }
    if (t) { const r0 = rectOf(el); pop(r0.left + Math.min(r0.width / 2, 22), r0.top - 8 - (nPop++ % 2) * 22, t, 'r'); if (nPop === 1) sfx.fate(); }   // 牌叠着时冒字上下错开
    return wait(t ? (changed ? 520 : 260) : 0).then(() => { el.style.visibility = 'hidden'; return flyClone(el, rectOf($('#dis')), { delay: k * 40, ms: 380, scale: .45, arc: 40, rot: -20 }); });
  }));
  bump($('#dis'));
  const more = fa.extra.map(x => CARD_DEFS[x.key].name).concat(fa.temp.map(x => CARD_DEFS[x.key].name));
  if (fa.extra.length) popOn($('#pile'), `牌组 +${fa.extra.map(x => CARD_DEFS[x.key].name).join(' ')}`, 'r', -14);
  if (fa.temp.length) popOn($('#dis'), `复制 ${fa.temp.length} 张`, 'r', -14);
  if (more.length) await wait(300);
  playSel(G, uids); sel = []; anim = null; busy = false;
  const last = G.last; render();
  if (last && last.mastered && last.mastered.length) {   // 熟练度到门槛：水牌响一下，冒出“熟练 升级”
    last.mastered.forEach((k, i) => setTimeout(() => { const el = $(`.rule[data-key="${k}"]`); if (!el) return;
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); popOn(el, `免费升级 Lv${G.lv[k]}`, 'g', 0); sfx.level(); }, i * 300));
    await wait(700);
  }
  await afterTurn();
};

// ===== 弃牌 =====
$('#discBtn').onclick = async () => {
  if (busy || !sel.length || G.discardsLeft <= 0 || sel.length > G.slotCap) return;
  busy = true; renderActs(previewSel(G, sel));
  const dis = rectOf($('#dis'));
  await Promise.all(sel.map((u, k) => { const el = $(`#hand .card[data-uid="${u}"]`); if (!el) return; el.style.visibility = 'hidden'; return flyClone(el, dis, { delay: k * 50, ms: 360, rot: -30 + k * 10, scale: .45, arc: 40 }); }));
  sfx.discard(); bump($('#dis'));
  discardSel(G, sel.slice()); sel = []; busy = false;
  render();
  await afterTurn();
};
function showShuffle() {
  const pl = $('#pile'); pl.classList.remove('shuffle'); void pl.offsetWidth; pl.classList.add('shuffle');
  popOn(pl, '洗牌', 'c', -10); sfx.shuffle();
}

// ===== 回合结束 =====
async function afterTurn() {
  if (G.phase === 'shop') {
    busy = true; Music.stinger(G.levelDone ? 'clear' : 'win');
    banner(G.boss ? '搞定！' : '达标！', G.boss ? `${G.boss.name} 很满意` : `${G.score} / ${G.target}`);
    sparks(innerWidth / 2, innerHeight * .42, 40);
    await wait(1300); busy = false; Music.scene('shop', .6); showBill();
  } else if (G.phase === 'over') {
    busy = true; Music.stinger('lose'); banner('收摊', `${G.score} / ${G.target}`, true);
    await wait(1400); busy = false; Music.scene('menu', 1.2); showOver();
  }
}
function sheet(html, cls = '') { if (typeof hideFx === 'function') hideFx(); const sh = $('#sheet'); sh.onclick = null; sh.className = cls; sh.innerHTML = html; sh.classList.toggle('wide', !!$('#sheet .shop')); $('#sheet').classList.toggle('deckwin', !!$('#sheet #dkList')); $('#veil').hidden = false; Music.muffle(G && G.phase === 'play'); $('#sheet').scrollTop = 0; const b = $('#sheet .pill'); if (b) b.focus({ preventScroll: true }); }
function closeSheet() { $('#veil').hidden = true; Music.muffle(false); }
const BILL_NAME = { tips: ['bowl', '小费'], base: ['bell', '基础奖励'], plays: ['flame', '剩余出牌'], interest: ['coin', '利息'], boss: ['spark', '挑剔食客赏钱'], helper: ['hat', '账房先生'] };
async function showBill() {
  const b = G.bill; shown.coins = G.coins - b.sum;
  const items = b.items;
  sheet(`<h1>结账</h1><div class="sub">第 ${G.level} 关　第 ${G.round + 1} 回合　出牌 ${G.cooks} 次</div>
    <div class="bill">${items.map((it, i) => `<div class="ln" style="animation-delay:${i * .22}s">${icon(BILL_NAME[it.k][0])}<span>${BILL_NAME[it.k][1]}</span><b>+${it.n}</b></div>`).join('')}
    <div class="ln tot" style="animation-delay:${items.length * .22}s"><span>进账</span><b id="billTot">+${b.sum}</b></div></div>
    <div class="btns"><span class="wallet">${icon('coin')}<b id="wallet">${shown.coins}</b></span><button class="pill" id="go">${G.won ? `${icon('spark')}查看通关` : `${icon('check')}确认`}</button></div>`);
  $('#go').onclick = () => { closeSheet(); if (G.won) showWin(); else showShop(); };
  await wait(items.length * 220 + 300);
  if ($('#billTot')) await coinsTo($('#billTot'), b.sum, $('#wallet'));
  shown.coins = G.coins; if ($('#wallet')) $('#wallet').textContent = G.coins;
  if (G.phase === 'shop') renderTicket(previewSel(G, []));
}
