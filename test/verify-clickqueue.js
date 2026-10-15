'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('file:///Users/wujihuan/code/ai_project/chinese-chess/dist/chinese-chess-3d.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const s = document.getElementById('sel-mode'); s.value = 'pvp'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(500);

  async function rawClick(row, col) {
    const pt = await page.evaluate(([r, c]) => {
      const canvas = document.getElementById('gl');
      const rect = canvas.getBoundingClientRect();
      const v = new THREE.Vector3((c - 4), 0.61, (r - 4.5));
      v.project(window.__xqWorld.camera);
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (-v.y + 1) / 2 * rect.height };
    }, [row, col]);
    await page.mouse.click(pt.x, pt.y);
  }
  const state = () => page.evaluate(() => window.__xqState().history);

  // 快速三连击（不等动画）：选炮 → 吃马 → （黑）选另一门炮
  await rawClick(7, 1);
  await page.waitForTimeout(60);           // 远远短于动画时长
  await rawClick(0, 1);                    // 动画播放中点击吃子点 → 应入队
  await page.waitForTimeout(60);
  await rawClick(2, 7);                    // 再抢点一次（黑方选炮）→ 覆盖入队
  await page.waitForTimeout(2500);         // 等所有动画/AI 逻辑跑完
  const h1 = await state();
  console.log('抢点序列后 history =', h1, '(期望 ≥2：炮八进七 + 黑炮选中或走子)');
  // 继续：黑炮(2,7)吃红马(9,7)（隔红炮(7,7)）
  await rawClick(9, 7);
  await page.waitForTimeout(2000);
  const h2 = await state();
  console.log('黑炮吃子后 history =', h2, '(期望 2：炮八进七+炮8进7，红=15)');
  const st = await page.evaluate(() => {
    const g = window.__xqGame();
    let red = 0;
    for (let i = 0; i < 90; i++) { const p = g.board[i]; if (p && XQ.sideOf(p) === 0) red++; }
    return { red, moves: Array.from(document.querySelectorAll('#moves .mv')).map(e => e.textContent).filter(Boolean) };
  });
  console.log('棋子数:', st.red, '着法:', st.moves.join(' / '));
  await browser.close();
  if (h2 !== 2) { console.log('✗ 点击队列未生效'); process.exit(1); }
  console.log('点击队列验证通过 ✓');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
