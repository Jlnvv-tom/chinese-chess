/* 完整游戏流程测试 v2（等待动画完成而非固定时长） */
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0,4).join(' <<< ')));
  await page.goto('file:///Users/wujihuan/code/ai_project/chinese-chess/dist/chinese-chess-3d.html', { waitUntil: 'load' });
  await page.waitForTimeout(2600);

  await page.selectOption('#sel-mode', 'pvp');
  await page.waitForTimeout(600);

  async function clickCell(row, col) {
    const pt = await page.evaluate(([r, c]) => {
      const canvas = document.getElementById('gl');
      const rect = canvas.getBoundingClientRect();
      const v = new THREE.Vector3((c - 4), 0.61, (r - 4.5));
      v.project(window.__xqWorld.camera);
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (-v.y + 1) / 2 * rect.height };
    }, [row, col]);
    await page.mouse.click(pt.x, pt.y);
    // 等待动画/选择状态稳定
    await page.waitForFunction(() => !window.__xqInter.isBusy(), null, { timeout: 8000 });
    await page.waitForTimeout(120);
  }
  const state = () => page.evaluate(() => window.__xqState());

  // 1. 兵五进一  2. 炮8平5  3. 炮二平五  4.(黑) 马2进3  5. 炮五进四（吃中卒 + 隔炮照将）
  await clickCell(6, 4); await clickCell(5, 4);
  await clickCell(2, 7); await clickCell(2, 4);
  await clickCell(7, 7); await clickCell(7, 4);
  await clickCell(0, 1); await clickCell(2, 2);
  await clickCell(7, 4); await clickCell(3, 4);
  await page.waitForTimeout(400);

  let st = await state();
  console.log('history:', st.history, 'result:', JSON.stringify(st.result));
  const turnAlert = await page.evaluate(() => ({
    text: document.getElementById('turn-text').textContent,
    alert: document.getElementById('turn-chip').classList.contains('alert')
  }));
  console.log('turn chip:', JSON.stringify(turnAlert), '(期望: 黑方行棋 + 被将军)');
  await page.screenshot({ path: '/tmp/xq-20-check.png' });

  // 黑方应将：士6进五（(0,5)仕→(1,4) 挡住炮火）
  await clickCell(0, 5); await clickCell(1, 4);
  st = await state();
  console.log('应将后 history:', st.history, '(期望 6)');

  // 悔棋 ×2
  await page.click('#btn-undo');
  await page.waitForFunction(() => !window.__xqInter.isBusy(), null, { timeout: 8000 });
  await page.click('#btn-undo');
  await page.waitForTimeout(400);
  st = await state();
  console.log('悔棋×2 后 history:', st.history, '(期望 4)');

  // 视角
  const theta = () => page.evaluate(() => window.__xqControls.theta);
  const th0 = await theta();
  await page.click('#btn-flip');
  await page.waitForTimeout(1600);
  const th1 = await theta();
  await page.screenshot({ path: '/tmp/xq-21-flipped.png' });
  await page.click('#btn-reset-view');
  await page.waitForTimeout(1600);
  const th2 = await theta();
  console.log(`视角: theta ${th0.toFixed(2)} → flip ${th1.toFixed(2)} → reset ${th2.toFixed(2)}`);

  // 规则弹窗
  await page.click('#btn-rules');
  await page.waitForTimeout(600);
  const rulesOpen = await page.evaluate(() => !document.getElementById('modal-rules').classList.contains('hidden'));
  await page.screenshot({ path: '/tmp/xq-22-rules.png' });
  await page.click('#btn-close-rules');
  console.log('规则弹窗:', rulesOpen ? '打开 ✓' : '未打开 ✗');

  // 结算弹窗
  await page.evaluate(() => window.XQ.ui.showResult({ winner: 0, reason: 'checkmate' }, 0, 'ai'));
  await page.waitForTimeout(600);
  const resultOpen = await page.evaluate(() => !document.getElementById('modal-result').classList.contains('hidden'));
  await page.screenshot({ path: '/tmp/xq-23-result.png' });
  await page.click('#btn-again');
  await page.waitForTimeout(800);
  console.log('结算弹窗:', resultOpen ? '打开 ✓' : '未打开 ✗');

  // AI（国手）
  await page.selectOption('#sel-mode', 'ai');
  await page.selectOption('#sel-level', 'hard');
  await page.waitForTimeout(700);
  const t0 = Date.now();
  await clickCell(7, 7); await clickCell(7, 4);
  await page.waitForFunction(() => window.__xqState().history >= 2, null, { timeout: 30000 });
  console.log('AI(国手) 含动画总耗时:', Date.now() - t0, 'ms');
  st = await state();
  console.log('AI 应招:', await page.evaluate(() => document.querySelector('#moves .mv.black').textContent));
  await page.screenshot({ path: '/tmp/xq-24-ai-hard.png' });

  console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
