'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  let pass = true;
  const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) pass = false; };

  /* ========== 场景 A：1440×900 折叠交互 ========== */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///Users/wujihuan/code/ai_project/chinese-chess/dist/chinese-chess-3d.html', { waitUntil: 'load' });
  await page.waitForTimeout(2800);

  // 默认三卡均展开
  const vis = (sel) => page.evaluate(s => {
    const el = document.querySelector(s);
    return el && !el.classList.contains('collapsed') && getComputedStyle(el.querySelector('.card-body')).display !== 'none';
  }, sel);
  ok(await vis('#panel .card:nth-child(1)'), '默认：对局卡展开');
  ok(await vis('#panel .card:nth-child(2)'), '默认：着法记录卡展开');
  ok(await vis('#panel .card:nth-child(3)'), '默认：战果卡展开');

  // 点击头部收起
  await page.click('#panel .card:nth-child(1) .card-head');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => document.querySelector('#panel .card:nth-child(1)').classList.contains('collapsed')), '点击后：对局卡收起');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#panel .card:nth-child(1) .card-body')).display === 'none'), '收起后内容隐藏');
  // 再点展开
  await page.click('#panel .card:nth-child(1) .card-head');
  await page.waitForTimeout(350);
  ok(!(await page.evaluate(() => document.querySelector('#panel .card:nth-child(1)').classList.contains('collapsed'))), '再次点击：对局卡展开');

  // 全部收起后面板只剩标题栏
  await page.evaluate(() => document.querySelectorAll('#panel .card-head').forEach(h => h.click()));
  await page.waitForTimeout(350);
  const collapsedH = await page.evaluate(() => {
    let sum = 0;
    document.querySelectorAll('#panel .card').forEach(c => { sum += c.getBoundingClientRect().height; });
    return Math.round(sum);
  });
  console.log('  全部收起三卡总高:', collapsedH + 'px');
  ok(collapsedH < 280, '全部收起三卡总高 < 280px（仅剩标题栏）');
  await page.evaluate(() => document.querySelectorAll('#panel .card-head').forEach(h => h.click()));
  await page.waitForTimeout(300);

  /* ========== 场景 B：棋盘完整可见性（多尺寸量化断言） ========== */
  async function checkBoardFits(label, w, h) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__xqControls.reset());
    await page.waitForTimeout(1400);
    const r = await page.evaluate(() => {
      const cam = window.__xqWorld.camera;
      cam.updateMatrixWorld();
      const HW = 5.4, HD = 5.9, HY = 0.85;
      const vw = window.innerWidth, vh = window.innerHeight;
      const panelW = vw <= 900 ? 268 : 310;
      const sa = { l: 10, r: vw - panelW - 10, t: 118, b: vh - 58 };
      let worstX = 0, worstY = 0;
      const corners = [];
      for (let sx = -1; sx <= 1; sx += 2) for (let sy = 0; sy <= 1; sy++) for (let sz = -1; sz <= 1; sz += 2)
        corners.push([sx * HW, sy * HY, sz * HD]);
      for (const c of corners) {
        const m = cam.matrixWorldInverse.elements;
        const vx = m[0]*c[0] + m[4]*c[1] + m[8]*c[2] + m[12];
        const vy = m[1]*c[0] + m[5]*c[1] + m[9]*c[2] + m[13];
        const vz = m[2]*c[0] + m[6]*c[1] + m[10]*c[2] + m[14];
        const p = cam.projectionMatrix.elements;
        const cw = -vz;
        const ndcX = (p[0]*vx + p[8]*vz) / cw, ndcY = (p[5]*vy + p[9]*vz) / cw;
        const px = (ndcX + 1) / 2 * vw, py = (1 - ndcY) / 2 * vh;
        worstX = Math.max(worstX, Math.abs(px - (sa.l + sa.r) / 2) / ((sa.r - sa.l) / 2));
        worstY = Math.max(worstY, Math.abs(py - (sa.t + sa.b) / 2) / ((sa.b - sa.t) / 2));
      }
      return { worstX, worstY, radius: cam.position.length() };
    });
    const fits = r.worstX <= 1.0 && r.worstY <= 1.0;
    ok(fits, `${label} (${w}×${h}) 棋盘完整在安全区内 [X ${r.worstX.toFixed(2)}, Y ${r.worstY.toFixed(2)}] r=${r.radius.toFixed(1)}`);
  }
  await checkBoardFits('复位视角', 1440, 900);
  await checkBoardFits('复位视角', 1920, 1080);
  await checkBoardFits('复位视角', 1280, 800);
  await checkBoardFits('复位视角', 1024, 768);
  await page.screenshot({ path: '/tmp/ui-fit-1280.png' });

  /* ========== 场景 C：折叠状态 + 复位仍可见 ========== */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelectorAll('#panel .card-head').forEach(h => h.click()));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__xqControls.reset());
  await page.waitForTimeout(1400);
  const r2 = await page.evaluate(() => {
    const cam = window.__xqWorld.camera;
    cam.updateMatrixWorld();
    const vw = window.innerWidth, vh = window.innerHeight;
    let worst = 0;
    for (let sx = -1; sx <= 1; sx += 2) for (let sy = 0; sy <= 1; sy++) for (let sz = -1; sz <= 1; sz += 2) {
      const c = [sx * 5.4, sy * 0.85, sz * 5.9];
      const m = cam.matrixWorldInverse.elements;
      const vx = m[0]*c[0]+m[4]*c[1]+m[8]*c[2]+m[12], vy = m[1]*c[0]+m[5]*c[1]+m[9]*c[2]+m[13], vz = m[2]*c[0]+m[6]*c[1]+m[10]*c[2]+m[14];
      const p = cam.projectionMatrix.elements;
      const px = (((p[0]*vx + p[8]*vz) / -vz) + 1) / 2 * vw;
      const py = (1 - ((p[5]*vy + p[9]*vz) / -vz)) / 2 * vh;
      // 与实现一致的 UI 安全区（面板宽度不随折叠变化）
      const sa = { l: 10, r: vw - 310 - 10, t: 118, b: vh - 58 };
      const rx = Math.abs(px - (sa.l + sa.r) / 2) / ((sa.r - sa.l) / 2);
      const ry = Math.abs(py - (sa.t + sa.b) / 2) / ((sa.b - sa.t) / 2);
      worst = Math.max(worst, rx, ry);
    }
    return worst;
  });
  console.log(`  折叠状态棋盘安全区占比: ${(r2 * 100).toFixed(0)}%`);
  ok(r2 <= 1.0, '折叠侧栏后棋盘仍在屏幕内');

  console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
  process.exit(pass && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
