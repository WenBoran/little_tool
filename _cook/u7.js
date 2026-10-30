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
