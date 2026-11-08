// ===== 订货：商店里的订货区块 + 灶台旁的货箱 =====
// 每店一单；原料、手法都能订；1 种原料、1 种手法特价，1 样缺货；货在下一回合第 2 锅出锅后到
const orderWhen = o => o.late ? '下一回合开局到' : o.live ? (G.cooks >= CFG.order.after ? '马上到' : `再出 ${CFG.order.after - G.cooks} 锅到货`) : `下一回合第 ${CFG.order.after} 锅后到`;
function orderTile(it) {
  const d = CARD_DEFS[it.key], n = orderSize(G, it.key), taken = G.order || G.offer.done;
  const off = it.out || taken || G.coins < it.price;
  const fx = `${d.name} ×${n}　${it.out ? '今天缺货' : it.sale ? `特价，原价 ${it.full}` : ''}\n${cardTip({ key: it.key, def: d })}\n${it.out ? '换个店再来' : `下单后${orderWhen({})}，订来的牌没有印记`}`;
  return `<button class="otile ${d.type}${it.out ? ' out' : ''}${it.sale ? ' sale' : ''}${off ? ' off' : ''}" data-ok="${it.key}" data-fx="${attr(fx)}">
    <span class="oic">${icon(it.key)}</span><span class="onm">${d.name}</span>
    <span class="opr">${it.out ? '缺货' : `${it.sale ? `<s>${it.full}</s>` : ''}${it.price}`}</span>${it.out ? '<i class="ostamp">缺</i>' : ''}</button>`;
}
function paintOrder() {
  const box = document.getElementById('orderIn'); if (!box || !G.offer) return;
  const row = t => `<div class="orow">${G.offer.items.filter(x => CARD_DEFS[x.key].type === t).map(orderTile).join('')}</div>`;
  box.innerHTML = row('ing') + row('tech');
  const o = G.order, hint = document.getElementById('orderHint');
  hint.innerHTML = o ? `<b class="ogot">${icon(o.key)}${nameOf(o.key)} ×${o.n}</b>${orderWhen(o)}` : `每店一单　本关第 ${G.orderN + 1} 单`;
  box.closest('.blk').classList.toggle('done', !!o);
}
$('#sheet').addEventListener('click', e => {
  const t = G && G.phase === 'shop' && e.target.closest('.otile'); if (!t) return;
  if (fxEl !== t || fxTip.hidden) return;                 // 第一下：浮框看说明（u8 处理）
  e.stopPropagation(); hideFx();
  const k = t.dataset.ok, it = G.offer.items.find(x => x.key === k);
  if (G.order || G.offer.done) return toast('这一店已经订过了');
  if (it.out) return toast('今天缺货');
  if (G.coins < it.price) return toast('铜钱不够');
  if (!placeOrder(G, k)) return;
  buySfx(); flyClone(t, rectOf($('#wallet')), { ms: 420, scale: .5, fade: true, arc: 50 });
  paintShop();
});

// 货箱：有货在路上时出现在弃牌堆下面，数字是张数；点一下看是什么货、什么时候到
function renderCrate() {
  const el = $('#crate'); if (!el) return;
  const o = G.order; el.hidden = !o;
  if (!o) { el.removeAttribute('data-fx'); return; }
  el.className = 'crate' + (o.live && G.cooks >= CFG.order.after - 1 ? ' soon' : '');
  el.innerHTML = `${icon('crate')}<span class="cr-k ${CARD_DEFS[o.key].type}">${icon(o.key)}</span><b>${o.n}</b>`;
  el.dataset.fx = `订货：${nameOf(o.key)} ×${o.n}\n${orderWhen(o)}`;
}
// 到货动画：货箱跳一下，新牌在手里亮一下
function showArrival(a) {
  if (!a) return;
  const cr = $('#crate') && !$('#crate').hidden ? $('#crate') : $('#pile');
  popOn(cr, `到货 ${nameOf(a.key)} ×${a.n}`, 'g', -14); bump(cr);
  tone(660, .08, 'triangle', .05); tone(990, .1, 'triangle', .05, .08);
  a.uids.forEach(u => { const el = $(`#hand .card[data-uid="${u}"]`); if (el) { el.classList.add('arrived'); setTimeout(() => el.classList.remove('arrived'), 1600); } });
}
