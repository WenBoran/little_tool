// ===== 运行环境适配（最先加载）=====
// 1. Flexbox gap 要 Chrome 84+，用实际布局测量；不支持就给 <html> 加 .no-flex-gap，改用 margin 回退（见 c6.css）
// 2. 小工具容器提供 getWindowInfo（客户端 9.49+）时，读取顶部按钮和安全区位置，给页面顶部留出避让空间
(function () {
  function supportsFlexGap() {
    var flex = document.createElement('div');
    flex.style.position = 'absolute'; flex.style.visibility = 'hidden';
    flex.style.display = 'flex'; flex.style.flexDirection = 'column'; flex.style.rowGap = '1px';
    flex.appendChild(document.createElement('div')); flex.appendChild(document.createElement('div'));
    document.body.appendChild(flex);
    var ok = flex.scrollHeight === 1;
    flex.parentNode.removeChild(flex);
    return ok;
  }
  if (!supportsFlexGap()) document.documentElement.classList.add('no-flex-gap');

  function applyWindowInfo(info) {
    if (!info) return;
    var bottom = 0, mb = info.menuButtons || {};
    ['back', 'me', 'share'].forEach(function (k) { var r = mb[k]; if (r && isFinite(r.bottom)) bottom = Math.max(bottom, r.bottom); });
    if (info.safeArea && isFinite(info.safeArea.top)) bottom = Math.max(bottom, info.safeArea.top);
    if (bottom > 0) document.documentElement.style.setProperty('--top-avoid', Math.round(bottom + 6) + 'px');
  }
  var miniTool = window.xhs && window.xhs.miniTool;
  if (miniTool && typeof miniTool.getWindowInfo === 'function') {
    try { var p = miniTool.getWindowInfo(); if (p && typeof p.then === 'function') p.then(applyWindowInfo, function () {}); }
    catch (e) { /* 低版本或调用失败：保持默认布局 */ }
  }
})();
