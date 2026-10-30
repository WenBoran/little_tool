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
