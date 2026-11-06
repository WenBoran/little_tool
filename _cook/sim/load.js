// 把 l1-l3 拼进同一个作用域（和网页一样），返回全部导出
const fs = require('fs'), path = require('path');
module.exports = dir => {
  const src = ['l1.js', 'l2.js', 'l3.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const m = { exports: {} };
  new Function('module', src + '\n;module.exports.__all = { RECIPE_BY, HELPER_BY, BASE_CAP, PACKS, UPGRADES, mk, clearRound, isBossRound, upLeft, recipePrice, CARD_DEFS };')(m);
  return Object.assign({}, m.exports, m.exports.__all);
};
