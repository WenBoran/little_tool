// node sim/t_browser.js <playwright 模块路径> [Edge/Chrome 可执行文件]
const assert = require('node:assert/strict'), path = require('path');
const { pathToFileURL } = require('url');
const K_HELPERS = 39;
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const errors = [];
  try {
    for (const version of ['cooking-roguelike.html', 'minitool/dist/index.html']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(root, version)).href);
      await page.waitForFunction(() => window.__cook && window.__cook.G);
      await page.locator('#sheet #go').click();
      const result = await page.evaluate(() => {
        const recipes = RECIPES.map(r => {
          const el = ruleTag(r, 2), tip = recipeTip(r, 2);
          return { key: r.key, name: el.querySelector('.rn').textContent, condition: tip.b[0], effects: tip.fx.map(x => x[2]) };
        });
        const helpers = HELPERS.map(h => ({ card: helperCard(h.key), tip: helperTip(h.key) }));
        const equipment = Object.keys(CARD_DEFS).filter(k => CARD_DEFS[k].type === 'equip').map(k => cardEl(mk(k)).outerHTML);
        return { recipes, helpers, equipment };
      });
      assert.equal(result.recipes.length, 53); assert.equal(result.helpers.length, K_HELPERS);
      for (const r of result.recipes) assert.ok(r.name && r.condition && r.effects.length && !r.effects.join('').includes('undefined'), r.key);
      for (const h of result.helpers) { assert.ok(!h.card.includes('hds')); assert.equal(h.tip.fx.length, 0); assert.ok(h.tip.b[0]); }
      for (const el of result.equipment) assert.ok(el.includes('<path') || el.includes('<circle') || el.includes('<rect'), '装备图案为空');
      const ids = await page.evaluate(() => {
        G.recipes = ['tudousi', 'zhengtudou']; G.lv = {}; G.mast = {}; G.helpers = ['tuzao']; G.phase = 'play'; G.target = 9999;
        G.hand = ['potato', 'cut', 'steam', 'pan'].map(k => mk(k)); G.deck = G.hand.map(c => c.key); G.stamps = G.hand.map(() => null);
        G.pile = []; G.discard = []; G.handSize = 0; G.boss = null; sel = []; busy = false; render();
        return G.hand.map(c => c.uid);
      });
      for (const uid of ids) await page.locator(`#hand .card[data-uid="${uid}"]`).click();
      assert.equal(await page.locator('#playBtn').isDisabled(), false);
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => !window.__cook.busy && window.__cook.G.cooks === 1);
      const score = await page.evaluate(() => G.score);
      assert.ok(score > 0);
      // 商店中检查新增装备和伙计的可点击说明。
      await page.evaluate(() => {
        G.phase = 'shop'; G.coins = 100; G.shop = [
          { kind: 'helper', key: 'diaowei', price: 10 }, { kind: 'card', key: 'grill', price: 7 },
          { kind: 'recipe', key: 'niuroumogu', price: 8 }, { kind: 'recipe', key: 'doufufanqie', price: 8 }
        ]; G.packs = rollPacks(G); showShop();
      });
      await page.locator('#shelf .ware-art').first().click();
      await page.locator('#fxtip').waitFor({ state: 'visible' });
      assert.ok((await page.locator('#fxtip').innerText()).includes('首道触发的菜谱'));
      await page.locator('#shelf .ware-art').nth(3).click();
      await page.waitForFunction(() => document.querySelector('#fxtip').textContent.includes('首张番茄'));
      // 卖菜谱：菜谱栏第一下看说明，第二下卖掉
      const before = await page.evaluate(() => { G.recipes = ['jiandan', 'zhaxia']; G.lv = {}; showShop(); return G.coins; });
      await page.locator('#sdRec .rslot[data-k="zhaxia"]').click();
      await page.locator('#fxtip').waitFor({ state: 'visible' });
      await page.locator('#sdRec .rslot[data-k="zhaxia"]').click();
      await page.waitForFunction(() => !G.recipes.includes('zhaxia'));
      assert.equal(await page.evaluate(() => G.coins) - before, 3);
      // 商店里点牌组，再点窗口外面：回到商店（不是关掉窗口留个空页面）
      await page.evaluate(() => { hideFx(); showDeck('view'); });
      await page.mouse.click(4, 4);
      await page.waitForFunction(() => !!document.querySelector('#sheet #shelf') && !document.querySelector('#veil').hidden);
      // 菜谱改良包：先挑改法，再挑菜谱；菜谱不显示「改」标记
      await page.evaluate(() => { hideFx(); G.packs = [{ kind: 'pack', key: 'mod', price: 5, sold: false }]; paintShop(); });
      await page.locator('#packs .buy').first().click();
      await page.evaluate(() => { G.pack.items[0] = { kind: 'modfx', op: 'swapTech', from: 'fry', to: 'stir', taken: false }; showPack(); });
      await page.locator('#pkRow .take').first().click();
      assert.equal(await page.locator('#pkRow .mpick.same .take').count(), 0);   // 改不了的菜谱没有按钮
      await page.locator('#pkRow .mpick .take[data-k="jiandan"]').click();
      await page.waitForFunction(() => Object.keys(G.mods).length === 1);
      await page.waitForFunction(() => !document.querySelector('#rules .rule .md') && effRecipe(G.mods, 'jiandan').tech === 'stir');
      // 实际结账按钮进入通关页，并可重新开始。
      await page.evaluate(() => {
        hideFx(); closeSheet(); G.level = 8; G.round = 3; G.boss = BOSS_BY[G.bossKey]; G.phase = 'play'; G.score = G.target;
        clearRound(G); showBill();
      });
      await page.locator('#sheet #go').filter({ hasText: '查看通关' }).click();
      assert.equal(await page.locator('#sheet h1').innerText(), '通关！');
      await page.locator('#sheet #go').click();
      assert.equal(await page.evaluate(() => G.level), 1);
      console.log('ok ', version, '53 菜谱/39 伙计/11 装备、实际出牌、商店说明、通关重开');
      await page.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
