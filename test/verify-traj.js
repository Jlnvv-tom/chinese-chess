'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('file:///Users/wujihuan/code/ai_project/chinese-chess/dist/chinese-chess-3d.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const s = document.getElementById('sel-mode'); s.value = 'pvp'; s.dispatchEvent(new Event('change')); });
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
    await page.waitForFunction(() => !window.__xqInter.isBusy(), null, { timeout: 10000 });
    await page.waitForTimeout(400);
  }
  // 选中红八路炮 → 应有 1 条弹道 + 炮架标记
  await clickCell(7, 1);
  const traj = await page.evaluate(() => {
    const world = window.__xqWorld;
    const fx = world.fx;
    const arcs = fx.trajectory.userData.arcs || [];
    const markers = [];
    fx.trajectory.children.forEach(ch => {
      if (ch.geometry && ch.geometry.type === 'RingGeometry') {
        const cell = world.posToCell(ch.position);
        markers.push(cell.row + ',' + cell.col);
      }
    });
    return { arcCount: arcs.length, screenMarkers: markers, trajChildren: fx.trajectory.children.length };
  });
  console.log('弹道可视化:', JSON.stringify(traj), '(期望: 1 条弧线, 炮架在 2,1)');
  await page.screenshot({ path: '/tmp/traj-cannon.png' });
  // 选中非炮棋子 → 不应有弹道
  await clickCell(9, 1); // 马
  const traj2 = await page.evaluate(() => {
    const fx = window.__xqWorld.fx;
    return { arcs: (fx.trajectory.userData.arcs || []).length, children: fx.trajectory.children.length };
  });
  console.log('选中马时弹道:', JSON.stringify(traj2), '(期望: 0)');
  await browser.close();
  if (traj.arcCount !== 1 || traj.screenMarkers.length !== 1 || traj2.arcs !== 0) process.exit(1);
  console.log('弹道可视化验证通过 ✓');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
