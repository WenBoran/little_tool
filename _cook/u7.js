function maybeBossIntro() {
  if (!G.boss) return deal();
  const b = G.boss; Music.scene(null); Music.stinger('boss');
  sheet(`<div class="sub">第 ${G.level} 关最后一位客人</div><h1>${b.name}</h1><div class="boss-av">${icon(b.icon)}</div>
    <div class="boss-rule">${icon('ban')}${b.rule}</div>
    <div class="sub" style="margin-top:12px">目标 ${G.target}　喂饱他额外赏 ${CFG.bossTip + G.level * 2} 铜钱</div>
    <div class="btns"><button class="pill" id="go">${icon('flame')}接单</button></div>`);
  $('#go').onclick = () => { closeSheet(); deal(); };
}
function showOver() {
  const best = G.bestCook || 0;
  sheet(`<h1>收摊了</h1><div class="sub">第 ${G.level} 关　第 ${G.round + 1} 回合　差 ${Math.max(0, G.target - G.score)} 分</div>
    <div class="bill" style="max-width:300px">
      <div class="ln" style="animation-delay:0s">${icon('check')}<span>通过回合</span><b style="color:var(--ink)">${G.history.length}</b></div>
      <div class="ln" style="animation-delay:.2s">${icon('flame')}<span>最高的一次出牌</span><b style="color:var(--ink)">${best}</b></div>
      <div class="ln" style="animation-delay:.4s">${icon('coin')}<span>一共赚了</span><b>${G.earned}</b></div>
      <div class="ln" style="animation-delay:.6s">${icon('spark')}<span>喂饱挑剔食客</span><b style="color:var(--ink)">${G.bossesBeat}</b></div>
    </div>
    <h2>${icon('board')}攒下的菜谱</h2>
    <div class="shelf">${G.recipes.map(k => ruleTag(myRecipe(k), G.lv[k] || 1).outerHTML).join('')}</div>
    <div class="btns"><button class="pill" id="go">${icon('again')}再开一局</button></div>`);
  $('#go').onclick = () => { closeSheet(); start(); };
}
function showWin() {
  const best = G.bestCook || 0;
  Music.scene('menu', 1.2);
  sheet(`<h1>通关！</h1><div class="sub">8 关全部通过</div>
    <div class="bill" style="max-width:300px">
      <div class="ln" style="animation-delay:0s">${icon('check')}<span>通过回合</span><b style="color:var(--ink)">${G.history.length}</b></div>
      <div class="ln" style="animation-delay:.2s">${icon('flame')}<span>最高的一次出牌</span><b style="color:var(--ink)">${best}</b></div>
      <div class="ln" style="animation-delay:.4s">${icon('coin')}<span>一共赚了</span><b>${G.earned}</b></div>
      <div class="ln" style="animation-delay:.6s">${icon('spark')}<span>喂饱挑剔食客</span><b style="color:var(--ink)">${G.bossesBeat}</b></div>
    </div>
    <h2>${icon('board')}最终菜谱</h2>
    <div class="shelf">${G.recipes.map(k => ruleTag(myRecipe(k), G.lv[k] || 1).outerHTML).join('')}</div>
    <div class="btns"><button class="pill" id="go">${icon('again')}再开一局</button></div>`);
  $('#go').onclick = () => { closeSheet(); start(); };
}
function showHelp() {
  sheet(`<h1>一手好菜</h1>
    <div class="help intro">
      <p><b>1</b>选牌打出，<span class="ty tech">手法</span>加工左边的<span class="ty ing">原料</span>。</p>
      <p><b>2</b>打出菜谱上的组合，自动加分。</p>
      <p><b>3</b>凑够目标分过关，打出的牌会用掉。</p>
    </div>
    <div class="btns"><button class="tg" id="musicBtn"></button><button class="pill" id="go">${icon('flame')}开火</button><button class="tg" id="sfxBtn"></button></div>`, 'helpwin');
  paintToggles();
  $('#go').onclick = () => { closeSheet(); seenHelp = true; if (G.phase === 'deal') deal(); else render(); };
}
$('#helpBtn').onclick = showHelp;
// 音乐、音效开关：图标上划一道斜线就是关着
ICONS.music = '<path d="M18 34V10l20-4v24"/><circle cx="13" cy="34" r="5"/><circle cx="33" cy="30" r="5"/>';
ICONS.sfx = '<path d="M8 19h8l10-8v26l-10-8H8z"/><path d="M32 18c3 3 3 9 0 12M37 13c6 6 6 16 0 22"/>';
function paintToggles() {
  [['#musicBtn', 'music', '背景音乐'], ['#sfxBtn', 'sfx', '音效']].forEach(([id, k, nm]) => {
    const b = $(id); if (!b) return; b.innerHTML = `${icon(k)}<span>${nm === '背景音乐' ? '音乐' : nm}</span>`; b.classList.toggle('off', !SET[k]); b.setAttribute('aria-pressed', SET[k] ? 'true' : 'false'); b.title = `${nm}：${SET[k] ? '开' : '关'}`;
  });
}
// 开关在「?」窗口里（开火按钮两边），点了只换图标，不关窗口
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#musicBtn, #sfxBtn'); if (!b) return;
  if (b.id === 'musicBtn') setMusic(!SET.music); else { setSfx(!SET.sfx); if (SET.sfx) sfxTick(true); }
  paintToggles();
});
function start(seed) {
  G = newRun(seed || (Date.now() % 1e9), true); mastSeen = {}; sel = []; prevHand = new Set(); anim = null; busy = false;
  $('#hand').innerHTML = ''; $('#slots').innerHTML = ''; render();
  if (!seenHelp) { Music.scene('menu'); showHelp(); } else deal();
}
// 发牌：只在玩家点了开火 / 接单 / 下一回合之后
function deal() { if (dealRound(G)) { Music.scene(G.boss ? 'boss' : 'play'); render(); afterTurn(); } }
window.__cook = { get G() { return G; }, start, render, get busy() { return busy; } };
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => start());
