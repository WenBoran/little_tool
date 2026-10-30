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
