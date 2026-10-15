'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  let pass = true;
  const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) pass = false; };

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///Users/wujihuan/code/ai_project/chinese-chess/dist/chinese-chess-3d.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const radius = () => page.evaluate(() => {
    const cam = window.__xqWorld.camera;
    return Math.hypot(cam.position.x, cam.position.y - 0.3, cam.position.z);
  });
  const settle = async (ms) => { await page.waitForTimeout(ms || 1100); };

  // 初始（fit 后）半径
  const r0 = await radius();
  console.log('  初始半径:', r0.toFixed(2));
  ok(r0 > 5.5 && r0 < 31, '初始半径在合理范围');

  // 点「＋」放大 → 半径减小
  await page.click('#btn-zoom-in');
  await settle();
  const r1 = await radius();
  console.log('  点＋后半径:', r1.toFixed(2));
  ok(r1 < r0 - 0.5, `点击＋后相机拉近（${r0.toFixed(1)} → ${r1.toFixed(1)}）`);

  // 再点两次，持续拉近
  await page.click('#btn-zoom-in'); await settle(700);
  await page.click('#btn-zoom-in'); await settle();
  const r2 = await radius();
  console.log('  连点３次＋后半径:', r2.toFixed(2));
  ok(r2 < r1 - 0.5, '连续点击持续拉近');

  // 点「－」缩小 → 半径增大
  await page.click('#btn-zoom-out');
  await settle();
  const r3 = await radius();
  console.log('  点－后半径:', r3.toFixed(2));
  ok(r3 > r2 + 0.5, `点击－后相机拉远（${r2.toFixed(1)} → ${r3.toFixed(1)}）`);

  // 缩小到 clamp 下限之外：狂点－，半径不超过 30
  for (let i = 0; i < 12; i++) { await page.click('#btn-zoom-out'); await page.waitForTimeout(60); }
  await settle();
  const r4 = await radius();
  console.log('  狂点－后半径:', r4.toFixed(2));
  ok(r4 <= 30.01, `半径不超过上限 30（实际 ${r4.toFixed(2)}）`);

  // 放大到 clamp：狂点＋，半径不低于 5.5
  for (let i = 0; i < 14; i++) { await page.click('#btn-zoom-in'); await page.waitForTimeout(60); }
  await settle();
  const r5 = await radius();
  console.log('  狂点＋后半径:', r5.toFixed(2));
  ok(r5 >= 5.49, `半径不低于下限 5.5（实际 ${r5.toFixed(2)}）`);

  // 复位视角 → 回到 fit 半径
  await page.click('#btn-reset-view');
  await settle(1500);
  const r6 = await radius();
  console.log('  复位后半径:', r6.toFixed(2));
  ok(Math.abs(r6 - r0) < 0.3, `复位视角恢复初始半径（${r6.toFixed(2)} ≈ ${r0.toFixed(2)}）`);

  // 按钮位置：不与右侧面板/hint 重叠，且在屏幕内
  const geo = await page.evaluate(() => {
    const z = document.getElementById('zoom-ctl').getBoundingClientRect();
    const p = document.getElementById('panel').getBoundingClientRect();
    const h = document.getElementById('hint').getBoundingClientRect();
    return {
      zoom: { l: Math.round(z.left), r: Math.round(z.right), t: Math.round(z.top), b: Math.round(z.bottom) },
      panelL: Math.round(p.left), hintR: Math.round(h.right),
      vw: window.innerWidth, vh: window.innerHeight
    };
  });
  console.log('  按钮几何:', JSON.stringify(geo));
  ok(geo.zoom.r <= geo.panelL + 2, '缩放控件不与右侧面板重叠');
  ok(geo.zoom.l >= geo.hintR + 8, '缩放控件不与底部提示条重叠');
  ok(geo.zoom.r <= geo.vw && geo.zoom.b <= geo.vh, '缩放控件在屏幕内');

  // 键盘 +/- 缩放
  await page.click('#btn-reset-view'); await settle(1500);
  const r7 = await radius();
  await page.keyboard.press('+');
  await settle();
  const r8 = await radius();
  console.log(`  键盘+缩放: ${r7.toFixed(2)} → ${r8.toFixed(2)}`);
  ok(r8 < r7 - 0.5, '键盘 + 可放大');
  await page.keyboard.press('-');
  await settle();
  const r9 = await radius();
  ok(r9 > r8 + 0.5, '键盘 - 可缩小');

  // 放大是用户主动的局部查看行为：允许棋盘超出屏幕，但棋盘中心必须在屏内
  await page.click('#btn-reset-view'); await settle(1500);
  await page.click('#btn-zoom-in'); await settle();
  const vis = await page.evaluate(() => {
    const cam = window.__xqWorld.camera;
    cam.updateMatrixWorld();
    let minPy = 1e9, maxPy = -1e9;
    for (let sx = -1; sx <= 1; sx += 2) for (let sy = 0; sy <= 1; sy++) for (let sz = -1; sz <= 1; sz += 2) {
      const c = [sx * 5.4, sy * 0.85, sz * 5.9];
      const m = cam.matrixWorldInverse.elements;
      const vx = m[0]*c[0]+m[4]*c[1]+m[8]*c[2]+m[12], vy = m[1]*c[0]+m[5]*c[1]+m[9]*c[2]+m[13], vz = m[2]*c[0]+m[6]*c[1]+m[10]*c[2]+m[14];
      const p = cam.projectionMatrix.elements;
      const py = (1 - ((p[5]*vy + p[9]*vz) / -vz)) / 2 * window.innerHeight;
      minPy = Math.min(minPy, py); maxPy = Math.max(maxPy, py);
    }
    return { minPy, maxPy };
  });
  console.log(`  放大后棋盘纵向范围: ${Math.round(vis.minPy)} ~ ${Math.round(vis.maxPy)}px（屏高 900）`);
  ok(vis.minPy < 450 && vis.maxPy > 450, '放大后棋盘中心仍在屏幕内（局部放大不跑飞）');
  // 复位必须恢复完整可见
  await page.click('#btn-reset-view'); await settle(1500);
  const full = await page.evaluate(() => {
    const cam = window.__xqWorld.camera;
    cam.updateMatrixWorld();
    const vw = window.innerWidth, vh = window.innerHeight;
    const sa = { l: 10, r: vw - 310 - 10, t: 118, b: vh - 58 };
    let worst = 0;
    for (let sx = -1; sx <= 1; sx += 2) for (let sy = 0; sy <= 1; sy++) for (let sz = -1; sz <= 1; sz += 2) {
      const c = [sx * 5.4, sy * 0.85, sz * 5.9];
      const m = cam.matrixWorldInverse.elements;
      const vx = m[0]*c[0]+m[4]*c[1]+m[8]*c[2]+m[12], vy = m[1]*c[0]+m[5]*c[1]+m[9]*c[2]+m[13], vz = m[2]*c[0]+m[6]*c[1]+m[10]*c[2]+m[14];
      const p = cam.projectionMatrix.elements;
      const px = (((p[0]*vx + p[8]*vz) / -vz) + 1) / 2 * vw;
      const py = (1 - ((p[5]*vy + p[9]*vz) / -vz)) / 2 * vh;
      worst = Math.max(worst, Math.abs(px - (sa.l + sa.r) / 2) / ((sa.r - sa.l) / 2), Math.abs(py - (sa.t + sa.b) / 2) / ((sa.b - sa.t) / 2));
    }
    return worst;
  });
  ok(full <= 1.0, `缩放后复位视角，棋盘恢复完整可见（占比 ${(full * 100).toFixed(0)}%）`);

  console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
  process.exit(pass && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
