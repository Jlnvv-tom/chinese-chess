'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file:///Users/wujihuan/code/ai_project/chinese-chess/dist/chinese-chess-3d.html');
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => ({
    hasXQ: !!window.XQ,
    hasGame: !!(window.XQ && window.XQ.game),
    pieces: window.__xqState ? window.__xqState().piecesAt.filter(r => r !== '.........').length : -1,
    turn: document.getElementById('turn-text').textContent
  }));
  console.log('file:// 加载状态:', JSON.stringify(st));
  // 模拟一步：炮二平五
  await page.evaluate(() => { document.getElementById('sel-mode').value = 'pvp'; document.getElementById('sel-mode').dispatchEvent(new Event('change')); });
  await page.waitForTimeout(500);
  async function clickCell(row, col) {
    const pt = await page.evaluate(([r, c]) => {
      const canvas = document.getElementById('gl');
      const rect = canvas.getBoundingClientRect();
      const v = new THREE.Vector3((c - 4), 0.61, (r - 4.5));
      v.project(window.__xqWorld.camera);
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (-v.y + 1) / 2 * rect.height };
    }, [row, col]);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction(() => !window.__xqInter.isBusy(), null, { timeout: 8000 });
  }
  await clickCell(7, 7); await clickCell(7, 4);
  const after = await page.evaluate(() => ({
    h: window.__xqState().history,
    mv: document.querySelector('#moves .mv.red').textContent
  }));
  console.log('单文件版走子测试:', JSON.stringify(after));
  await page.screenshot({ path: '/tmp/xq-30-singlefile.png' });
  console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
  if (!st.hasGame || after.h !== 1) process.exit(1);
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
