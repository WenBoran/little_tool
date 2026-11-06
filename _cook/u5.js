// ===== 音频：音效总线 + 音乐总线，各自开关；切到后台整体暂停 =====
let AC = null, muted = false, SFX = null, MUS = null, NOISE = null;
// 设置：音乐、音效两个开关，记在本机（存不了就只在这一局有效）
const SET = (() => { try { return Object.assign({ music: true, sfx: true }, JSON.parse(localStorage.getItem('yshc-set') || '{}')); } catch (e) { return { music: true, sfx: true }; } })();
muted = !SET.sfx;
const saveSet = () => { try { localStorage.setItem('yshc-set', JSON.stringify(SET)); } catch (e) {} };
function getAC() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(AC.destination);
    SFX = AC.createGain(); SFX.gain.value = .9; SFX.connect(comp);
    NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const ch = NOISE.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    MUS = { comp };
  }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
  return AC;
}
const N = n => 440 * Math.pow(2, (n - 69) / 12);
const envG = (g, t, v, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(v, .0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
// 一个振荡器音：type 波形，f 频率，d 时长，v 音量，slide 结尾频率倍数
function osc(dest, type, f, t, d, v, slide, a = .006) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + a + d);
  envG(g, t, v, a, d); o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + .05);
}
// 噪声：锅铲、切菜、洗牌、热油声
function noise(dest, t, d, v, freq, q = 1, type = 'bandpass', sweep) {
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NOISE; s.loop = d > .9; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + d);
  envG(g, t, v, .005, d); s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * .5); s.stop(t + d + .05);
}
// 兼容旧调用
function tone(f, d = .08, type = 'triangle', vol = .06, when = 0) {
  if (muted) return; try { getAC(); osc(SFX, type, f, AC.currentTime + when, d, vol, 1.4); } catch (e) {}
}
// ===== 音效 =====
const play = fn => { if (muted) return; try { getAC(); fn(AC.currentTime + .005); } catch (e) {} };
const sfx = {
  tick: on => play(t => { osc(SFX, 'triangle', on ? 880 : 620, t, .05, .07, on ? 1.25 : .8); noise(SFX, t, .02, .03, 5000, 2); }),
  deal: n => play(t => { for (let i = 0; i < Math.min(n, 8); i++) { noise(SFX, t + i * .06, .04, .07, 3200 + i * 150, 2.5, 'bandpass', .5); osc(SFX, 'sine', 500 + i * 30, t + i * .06, .03, .015); } }),
  whoosh: () => play(t => noise(SFX, t, .28, .09, 600, 1.2, 'bandpass', 5)),
  sizzle: (d = .7) => play(t => { noise(SFX, t, d, .05, 5500, .8, 'highpass'); for (let i = 0; i < 9; i++) noise(SFX, t + Math.random() * d, .015, .05, 6000 + Math.random() * 3000, 4); }),
  step: i => play(t => { const f = N(67 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.min(i, 10)]); osc(SFX, 'triangle', f, t, .08, .07); osc(SFX, 'sine', f * 2, t, .05, .02); }),
  ding: i => play(t => { const f = N(84 + [0, 4, 7, 12][i % 4]); osc(SFX, 'sine', f, t, .5, .07, 1, .002); osc(SFX, 'sine', f * 2.76, t, .25, .02, 1, .002); osc(SFX, 'triangle', f / 2, t, .12, .03); }),
  mult: () => play(t => { osc(SFX, 'sawtooth', 330, t, .14, .035, 2.2); osc(SFX, 'square', 660, t + .05, .12, .025, 1.6); noise(SFX, t, .1, .03, 2500, 3, 'bandpass', 2); }),
  xm: () => play(t => { [0, 4, 7, 12].forEach((k, j) => osc(SFX, 'sawtooth', N(60 + k), t + j * .045, .16, .03, 1.02)); osc(SFX, 'sine', 80, t, .3, .2, .5); noise(SFX, t, .35, .06, 4000, .7, 'highpass'); }),
  total: huge => play(t => {
    osc(SFX, 'sine', huge ? 110 : 150, t, .32, huge ? .45 : .3, .4); noise(SFX, t, .12, .12, 900, 1, 'lowpass');
    if (huge) { noise(SFX, t + .02, 1.1, .08, 7000, .6, 'highpass'); [72, 76, 79, 84].forEach((k, j) => osc(SFX, 'square', N(k), t + .08 + j * .07, .14, .03)); }
    else [72, 79].forEach((k, j) => osc(SFX, 'square', N(k), t + .06 + j * .07, .1, .025));
  }),
  coin: i => play(t => { const f = 1568 + (i % 3) * 196; osc(SFX, 'square', f, t, .04, .02); osc(SFX, 'sine', f * 1.5, t + .04, .12, .03, 1, .002); }),
  discard: () => play(t => { noise(SFX, t, .18, .07, 1800, 1, 'bandpass', .4); osc(SFX, 'triangle', 300, t, .08, .03, .6); }),
  shuffle: () => play(t => { for (let i = 0; i < 14; i++) noise(SFX, t + i * .028 + Math.random() * .01, .02, .06, 2500 + Math.random() * 2000, 3); }),
  buy: () => play(t => { noise(SFX, t, .03, .08, 3000, 2); osc(SFX, 'square', 1760, t + .03, .06, .03); osc(SFX, 'square', 2349, t + .09, .2, .03, 1, .002); osc(SFX, 'sine', 4698, t + .09, .3, .015, 1, .002); }),
  reroll: () => play(t => { noise(SFX, t, .22, .06, 900, 1.5, 'bandpass', 4); [67, 71, 74].forEach((k, j) => osc(SFX, 'triangle', N(k), t + j * .05, .06, .03)); }),
  pack: () => play(t => { noise(SFX, t, .06, .1, 1200, 1.5); osc(SFX, 'sine', 180, t, .1, .12, .5); [79, 83, 86, 91].forEach((k, j) => osc(SFX, 'sine', N(k), t + .08 + j * .06, .22, .035, 1, .002)); }),
  fire: () => play(t => { osc(SFX, 'triangle', 220, t, .18, .06, .5); noise(SFX, t, .1, .04, 600, 1, 'lowpass'); }),
  trim: () => play(t => { noise(SFX, t, .04, .1, 5000, 6); noise(SFX, t + .09, .05, .1, 4200, 6); }),
  nope: () => play(t => { osc(SFX, 'square', 180, t, .09, .04); osc(SFX, 'square', 150, t + .11, .14, .04); }),
  level: () => play(t => { [72, 76, 79, 84, 88].forEach((k, j) => { osc(SFX, 'sine', N(k), t + j * .055, .25, .05, 1, .002); osc(SFX, 'triangle', N(k + 12), t + j * .055, .08, .015); }); }),
  fate: () => play(t => { osc(SFX, 'sine', 500, t, .1, .05, 2); osc(SFX, 'sine', 750, t + .07, .12, .04, 1.5); }),
  click: () => play(t => { osc(SFX, 'triangle', 520, t, .035, .05, 1.3); noise(SFX, t, .015, .03, 4000, 2); }),
  gong: () => play(t => { [98, 147.5, 196.7, 262].forEach((f, j) => osc(SFX, 'sine', f, t, 1.8 - j * .3, .09 / (j + 1), .985, .01)); noise(SFX, t, .5, .05, 1200, 2); }),
  spoil: () => play(t => { osc(SFX, 'sawtooth', 300, t, .4, .05, .45); noise(SFX, t, .3, .04, 500, 1, 'lowpass'); }),
};
const sfxTick = sfx.tick, sfxDeal = sfx.deal, sfxStep = sfx.step, sfxMult = sfx.mult, sfxCoin = sfx.coin;
const sfxWin = () => play(t => [72, 76, 79, 84].forEach((k, i) => osc(SFX, 'square', N(k), t + i * .09, .14, .04)));
const sfxLose = () => play(t => [67, 64, 60].forEach((k, i) => osc(SFX, 'triangle', N(k), t + i * .16, .2, .07)));

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


// ===== 背景音乐：程序生成，不加载外部文件 =====
// 场景：menu 首页/收摊（八音盒）· play 普通回合（魔性小调）· boss 挑剔食客回合（更快更紧）· shop 结账和商店（慢悠悠）
// 切场景：旧曲 0.3 秒淡出，新曲从第一小节淡入；结算时停音乐、放过关/失败短曲；弹窗盖住灶台时音乐变闷
const Music = (() => {
  const _ = null;
  const SONGS = {
    play: { bpm: 138, lead: 'square', lv: .045,
      mel: [76,_,79,76,74,72,74,_, 76,76,79,81,79,_,_,_, 76,_,79,76,74,72,69,_, 72,74,76,74,72,_,_,_,
            81,_,81,79,76,_,79,_, 81,84,81,79,76,_,74,_, 72,74,76,79,81,79,76,74, 72,_,67,_,72,_,72,72],
      root: [48,43,48,48,53,48,53,43], drums: 'pop' },
    boss: { bpm: 156, lead: 'sawtooth', lv: .03,
      mel: [69,_,69,72,74,_,76,_, 79,76,74,72,74,_,_,_, 69,_,69,72,74,_,76,79, 81,_,79,76,74,76,_,_,
            76,76,79,76,74,72,69,_, 72,74,76,_,79,_,76,_, 81,79,76,74,72,74,76,_, 69,_,_,_,69,_,69,_],
      root: [45,45,41,43,45,45,41,40], drums: 'drive' },
    shop: { bpm: 100, lead: 'triangle', lv: .06, swing: .12,
      mel: [69,_,72,_,74,72,69,_, 67,_,_,_,65,_,_,_, 69,_,72,_,74,77,74,_, 72,_,_,_,_,_,_,_,
            74,_,72,_,69,_,72,_, 67,_,69,_,65,_,_,_, 69,72,74,_,77,_,74,72, 65,_,_,_,_,_,_,_],
      root: [41,38,36,41,38,36,41,41], drums: 'soft' },
    menu: { bpm: 92, lead: 'sine', lv: .06, bell: 1,
      mel: [76,_,79,_,84,_,79,_, 81,_,79,_,76,_,_,_, 74,_,76,_,79,_,76,_, 74,_,_,_,_,_,_,_,
            84,_,81,_,79,_,76,_, 79,_,76,_,74,_,_,_, 72,_,74,_,76,_,79,_, 72,_,_,_,_,_,_,_],
      root: [48,45,41,43,48,45,41,43], drums: 'none' },
  };
  let bus = null, lp = null, timer = 0, song = null, want = null, step = 0, next = 0, heat = 0, muffled = false;
  function ensure() {
    getAC();
    if (!bus) { bus = AC.createGain(); bus.gain.value = 0.0001; lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; bus.connect(lp).connect(MUS.comp); }
  }
  const kick = (t, v = .3) => osc(bus, 'sine', 130, t, .16, v, .35, .002);
  const snare = (t, v = .07) => { noise(bus, t, .1, v, 2200, .8); osc(bus, 'triangle', 220, t, .05, v * .6, .7); };
  const hat = (t, v = .025) => noise(bus, t, .025, v, 8000, 1, 'highpass');
  const wood = (t, f, v = .1) => osc(bus, 'sine', f, t, .05, v, .9, .001);
  function voice(S, i, t, st) {
    const bar = Math.floor(i / 8) % 8, b = i % 8, mel = S.mel, n = mel[i % mel.length], r = S.root[bar];
    if (n) {
      const long = mel[(i + 1) % mel.length] === null, d = st * (long ? 1.7 : .8);
      if (S.bell) { osc(bus, 'sine', N(n), t, d * 1.6, S.lv, 1, .002); osc(bus, 'sine', N(n) * 3, t, .2, S.lv * .18, 1, .002); }
      else { osc(bus, S.lead, N(n), t, d, S.lv); osc(bus, 'triangle', N(n - 12), t, d, .028); }
      if (heat && !S.bell) osc(bus, 'square', N(n + 12), t, d * .7, .012);
    }
    const D = S.drums;
    if (D === 'none') { if (b === 0) { osc(bus, 'triangle', N(r), t, st * 7, .07, 1, .05); osc(bus, 'triangle', N(r + 7), t, st * 7, .04, 1, .05); } return; }
    if (D === 'soft') {
      if (b === 0) osc(bus, 'triangle', N(r), t, st * 1.8, .14); if (b === 4) osc(bus, 'triangle', N(r + 7), t, st * 1.4, .1); if (b === 6) osc(bus, 'triangle', N(r + 4), t, st * .8, .07);
      if (b === 0) kick(t, .16); if (b === 4) wood(t, 420, .06);
      return;
    }
    if (D === 'pop') {
      if (b === 0 || b === 4) osc(bus, 'triangle', N(r), t, st * 1.6, .16); if (b === 2 || b === 6) osc(bus, 'triangle', N(r + 7), t, st * .7, .1);
      if (b === 0 || b === 4) kick(t); if (b === 2 || b === 6) wood(t, 820, .12);
      hat(t, b % 2 ? .05 : .025);
      if (bar >= 4 && bar < 6 && b % 2) noise(bus, t, .04, .08, 2600, 6);          // 切菜
      if (bar === 0 && b === 0) { osc(bus, 'square', 1180, t, .5, .018); osc(bus, 'square', 1253, t, .45, .016); }   // 敲锅
      if (b === 7 && bar % 2) osc(bus, 'sine', 1500, t, .05, .05, 1.6);
    }
    if (D === 'drive') {
      osc(bus, 'sawtooth', N(r + (b % 2 ? 12 : 0)), t, st * .6, .05); osc(bus, 'triangle', N(r), t, st * .8, .1);
      if (b === 0 || b === 3 || b === 4) kick(t, .32); if (b === 2 || b === 6) snare(t, .09);
      hat(t, b % 2 ? .04 : .02);
      if (bar === 7 && b >= 4) osc(bus, 'sine', [200, 170, 140, 110][b - 4], t, .15, .2, .6);   // 鼓花
    }
    if (heat) hat(t + st / 2, .03);   // 快达标或最后一次出牌：加一层十六分音符
  }
  function tick() {
    if (!song) return;
    const S = SONGS[song], st = 60 / S.bpm / 2;
    while (next < AC.currentTime + .15) { const sw = S.swing && step % 2 ? st * S.swing : 0; voice(S, step, next + sw, st); step++; next += st; }
  }
  function fade(v, sec) { bus.gain.cancelScheduledValues(AC.currentTime); bus.gain.setValueAtTime(Math.max(bus.gain.value, .0001), AC.currentTime); bus.gain.exponentialRampToValueAtTime(Math.max(v, .0001), AC.currentTime + sec); }
  function begin(name) {
    clearInterval(timer); swap = 0; song = name; if (!name || !SET.music) { song = null; return; }
    step = 0; next = AC.currentTime + .06; fade(.5, .4); timer = setInterval(tick, 25); tick();
  }
  let swap = 0;
  // 切到某个场景（null = 安静）；delay 秒后才开始（等过关短曲放完）
  function scene(name, delay = 0) {
    want = name; clearTimeout(swap);
    if (!AC || !SET.music) return;
    ensure();
    if (name === song && !delay) return;
    if (song) fade(.0001, .3);
    swap = setTimeout(() => begin(want), (song ? 320 : 0) + delay * 1000);
    if (!song && !delay) { clearTimeout(swap); begin(want); }
  }
  // 过关 / 喂饱食客 / 失败 / 食客登场的短曲：先停掉背景音乐
  function stinger(kind) {
    if (!SET.music) { if (kind === 'lose') sfxLose(); else if (kind !== 'boss') sfxWin(); return; }
    ensure(); clearInterval(timer); clearTimeout(swap); song = null; fade(.5, .02);
    const t = AC.currentTime + .05, sq = (k, at, d, v = .05, ty = 'square') => osc(bus, ty, N(k), t + at, d, v);
    if (kind === 'win') { [72, 76, 79].forEach((k, i) => sq(k, i * .1, .1)); sq(84, .3, .5, .055); sq(60, .3, .5, .08, 'triangle'); sq(67, .3, .5, .05, 'triangle'); kick(t + .3); [0, .04, .08, .12].forEach(x => snare(t + .18 + x, .04)); }
    if (kind === 'clear') { [72, 74, 76, 79, 81, 84].forEach((k, i) => sq(k, i * .08, .09)); [84, 88, 91].forEach(k => sq(k, .5, .9, .035)); sq(48, .5, .9, .1, 'triangle'); kick(t + .5); noise(bus, t + .5, 1, .06, 7000, .6, 'highpass'); }
    if (kind === 'lose') { [[67, 0], [66, .35], [65, .7]].forEach(([k, at]) => { osc(bus, 'sawtooth', N(k - 12), t + at, .3, .06, .99); }); const o = AC.createOscillator(), g = AC.createGain(), v = AC.createOscillator(), vg = AC.createGain();
      o.type = 'sawtooth'; o.frequency.value = N(52); v.frequency.value = 6; vg.gain.value = 6; v.connect(vg).connect(o.frequency); envG(g, t + 1.05, .07, .02, 1.1); o.connect(g).connect(bus); o.start(t + 1.05); v.start(t + 1.05); o.stop(t + 2.3); v.stop(t + 2.3); }
    if (kind === 'boss') { [98, 147.5, 196.7].forEach((f, j) => osc(bus, 'sine', f, t, 1.8 - j * .4, .12 / (j + 1), .985, .01)); osc(bus, 'sine', 70, t, .5, .3, .5); }
  }
  return {
    scene, stinger,
    heat(v) { heat = v ? 1 : 0; },
    muffle(v) { if (!lp || muffled === !!v) return; muffled = !!v; lp.frequency.setTargetAtTime(v ? 700 : 18000, AC.currentTime, .12); },
    kick() { if (want && !song && !swap) scene(want); else if (song && AC && next < AC.currentTime) next = AC.currentTime + .05; },   // 恢复后接着放；跳过挂起期间积压的拍子
    reset() { clearInterval(timer); clearTimeout(swap); swap = 0; song = null; bus = null; lp = null; },
    on(v) { if (v) { scene(want); } else { clearInterval(timer); clearTimeout(swap); song = null; if (bus) fade(.0001, .2); } },
    get song() { return song; }, get want() { return want; },
  };
})();
// 浏览器要等玩家第一次点击后才能出声：第一下点击时打开音频、放当前场景的音乐
// 手机熄屏、切后台、来电后，系统会把音频挂起（iOS 是 interrupted），而且只认点击时的恢复请求：
// 所以每次点屏幕都检查一遍，挂起就恢复，被系统关掉就重建，音乐该放没放就接着放
function wakeAudio() {
  try {
    if (AC && AC.state === 'closed') { AC = null; Music.reset(); }
    getAC();
    if (AC.state !== 'running') AC.resume().then(() => { if (SET.music) Music.kick(); }, () => {});
    else if (SET.music) Music.kick();
  } catch (e) {}
}
['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, wakeAudio, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (AC && AC.state === 'running') AC.suspend(); }
  else { if (AC) AC.resume().then(() => { if (SET.music) Music.kick(); }, () => {}); keepAwake(); }
});
// 屏幕常亮：浏览器支持 Wake Lock 时，游戏打开期间不让屏幕熄灭（切走会自动释放，回来再申请）
let wakeLock = null;
function keepAwake() {
  if (!('wakeLock' in navigator) || document.hidden || wakeLock) return;
  navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }, () => {});
}
document.addEventListener('pointerdown', keepAwake, { capture: true, passive: true });
// 主要按钮统一一声轻响
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.pill, .tab, #helpBtn'); if (b && !b.disabled) sfx.click(); }, true);
function setMusic(v) { SET.music = v; saveSet(); getAC(); Music.on(v); }
function setSfx(v) { SET.sfx = v; muted = !v; saveSet(); }
