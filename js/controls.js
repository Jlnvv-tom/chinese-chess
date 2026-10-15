/*
 * controls.js — 自定义轨道相机控制（阻尼旋转/缩放/平移 + 补间翻转复位）
 */
(function (global) {
  'use strict';

  function createControls(camera, domElement, opts) {
    opts = opts || {};
    var target = new THREE.Vector3(0, 0.3, 0);
    var shake = new THREE.Vector3(0, 0, 0); // 衰减式震屏偏移
    var userAdjusted = false;               // 用户是否手动调整过视角
    /* ---- 复位视角自适应：保证整个棋盘落在 UI 安全区内 ---- */
    // 安全区：右侧面板 + 顶栏 + 底部提示条不遮挡棋盘
    function safeArea() {
      var w = window.innerWidth, h = window.innerHeight;
      var panelW = w <= 900 ? 268 : 310;
      return { l: 10, r: w - panelW - 10, t: 118, b: h - 58 };
    }
    // 棋盘包围盒半尺寸（含外框与棋子高度余量）
    var HW = 5.4, HD = 5.9, HY = 0.85;
    // 迭代求解：最小半径，使棋盘 8 角全部投影在安全区内
    // 方案：修改投影矩阵的 film-offset 项（p[8]/p[9] 剪切 NDC），把投影中心
    // 从屏幕中心移到安全区中心；随后判定 |NDC - 安全区中心| ≤ 安全区半宽
    function fitBoard(theta, phi, baseR) {
      var vw = window.innerWidth, vh = window.innerHeight;
      var aspect = vw / vh;
      var sa = safeArea();
      var halfX = (sa.r - sa.l) / vw;   // 安全区半宽（NDC 满屏半宽 = 1）
      var halfY = (sa.b - sa.t) / vh;
      var cxNdc = 2 * ((sa.l + sa.r) / 2) / vw - 1;  // 安全区中心 NDC
      var cyNdc = 1 - 2 * ((sa.t + sa.b) / 2) / vh;
      // 重建投影矩阵并写入 film offset（resize 监听可能尚未处理）
      if (Math.abs(camera.aspect - aspect) > 1e-4) {
        camera.aspect = aspect;
      }
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      var pe = camera.projectionMatrix.elements;
      pe[8] = -cxNdc;   // ndc.x 整体偏移 +cxNdc
      pe[9] = -cyNdc;   // ndc.y 整体偏移 +cyNdc
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      var corners = [];
      for (var sx = -1; sx <= 1; sx += 2)
        for (var sy = 0; sy <= 1; sy++)
          for (var sz = -1; sz <= 1; sz += 2)
            corners.push([sx * HW, sy * HY, sz * HD]);
      var r = baseR || 11.8;
      var out = { radius: r, tx: 0, ty: 0.3, tz: 0 };
      for (var iter = 0; iter < 40; iter++) {
        var sp = Math.sin(phi), cp = Math.cos(phi);
        camera.position.set(r * sp * Math.sin(theta), 0.3 + r * cp, r * sp * Math.cos(theta));
        camera.lookAt(0, 0.3, 0);
        camera.updateMatrixWorld();
        var worst = 0;
        for (var i = 0; i < corners.length; i++) {
          var c = corners[i];
          // 手动投影：world → view → clip（避免依赖渲染循环）
          var m = camera.matrixWorldInverse.elements;
          var vx = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12];
          var vy = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13];
          var vz = m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14];
          var p = camera.projectionMatrix.elements;
          var cx = p[0] * vx + p[8] * vz, cy = p[5] * vy + p[9] * vz, cw = -vz;
          if (cw <= 0) { worst = 99; break; }
          var ndcX = Math.abs(cx / cw - cxNdc) / halfX;
          var ndcY = Math.abs(cy / cw - cyNdc) / halfY;
          if (ndcX > worst) worst = ndcX;
          if (ndcY > worst) worst = ndcY;
        }
        out.radius = r;
        if (worst <= 0.98) break;
        r *= 1.04;
        if (r > 30) break;
      }
      return out;
    }
    var sph = { theta: 0.32, phi: 0.95, radius: 11.8 };      // 目标值
    var cur = { theta: 0.32, phi: 0.95, radius: 11.8 };      // 当前值（阻尼逼近）
    var MIN_PHI = 0.32, MAX_PHI = 1.38;
    var MIN_R = 5.5, MAX_R = 30;   // 缩放范围（上限与 fitBoard 一致，避免 fit 半径被钳制）
    var tween = null;
    var enabled = true;
    // 初始即按当前窗口 fit，保证首屏整个棋盘可见
    (function initFit() {
      var fit = fitBoard(0.32, 0.95, 11.8);
      sph.radius = cur.radius = fit.radius;
      target.set(fit.tx, 0.3, 0);
      apply();
    })();

    function apply() {
      var sp = Math.sin(cur.phi), cp = Math.cos(cur.phi);
      camera.position.set(
        target.x + shake.x + cur.radius * sp * Math.sin(cur.theta),
        target.y + shake.y + cur.radius * cp,
        target.z + shake.z + cur.radius * sp * Math.cos(cur.theta)
      );
      camera.lookAt(target.x + shake.x, target.y + shake.y, target.z + shake.z);
    }

    /* ---- 指针交互 ---- */
    var pointers = new Map();
    var mode = null; // 'rot' | 'pan'
    var lastX = 0, lastY = 0, pinchDist = 0;

    domElement.style.touchAction = 'none';
    domElement.addEventListener('pointerdown', function (e) {
      if (!enabled) return;
      domElement.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'rot';
        lastX = e.clientX; lastY = e.clientY;
        tween = null;
      } else if (pointers.size === 2) {
        mode = 'pinch';
        var pts = Array.from(pointers.values());
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });
    domElement.addEventListener('pointermove', function (e) {
      if (!enabled || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'rot' && pointers.size === 1) {
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        sph.theta -= dx * 0.0052;
        sph.phi -= dy * 0.0042;
        sph.phi = Math.max(MIN_PHI, Math.min(MAX_PHI, sph.phi));
        lastX = e.clientX; lastY = e.clientY;
        tween = null; userAdjusted = true;
      } else if (mode === 'pan' && pointers.size === 1) {
        var panScale = cur.radius * 0.0016;
        var sinT = Math.sin(cur.theta), cosT = Math.cos(cur.theta);
        target.x -= (e.clientX - lastX) * panScale * cosT - (e.clientY - lastY) * panScale * sinT * 0.4;
        target.z += (e.clientX - lastX) * panScale * sinT + (e.clientY - lastY) * panScale * cosT * 0.4;
        target.x = Math.max(-4, Math.min(4, target.x));
        target.z = Math.max(-4.5, Math.min(4.5, target.z));
        lastX = e.clientX; lastY = e.clientY;
        tween = null; userAdjusted = true;
      } else if (mode === 'pinch' && pointers.size === 2) {
        var p = Array.from(pointers.values());
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        sph.radius *= pinchDist / Math.max(d, 1);
        sph.radius = Math.max(MIN_R, Math.min(MAX_R, sph.radius));
        pinchDist = d;
        tween = null; userAdjusted = true;
      }
    });
    function release(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) mode = null;
      else if (pointers.size === 1) {
        mode = 'rot';
        var p = Array.from(pointers.values())[0];
        lastX = p.x; lastY = p.y;
      }
    }
    domElement.addEventListener('pointerup', release);
    domElement.addEventListener('pointercancel', release);
    domElement.addEventListener('wheel', function (e) {
      if (!enabled) return;
      e.preventDefault();
      sph.radius *= (1 + Math.sign(e.deltaY) * 0.09);
      sph.radius = Math.max(MIN_R, Math.min(MAX_R, sph.radius));
      tween = null; userAdjusted = true;
    }, { passive: false });
    domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ---- 补间 ---- */
    function tweenTo(theta, phi, radius, tx, ty, tz, dur) {
      tween = {
        t: 0, dur: dur || 0.9,
        from: { theta: cur.theta, phi: cur.phi, radius: cur.radius, target: target.clone() },
        to: { theta: theta, phi: phi, radius: radius, target: new THREE.Vector3(tx, ty, tz) }
      };
      sph.theta = theta; sph.phi = phi; sph.radius = radius;
    }
    function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    var api = {
      update: function (dt) {
        if (tween) {
          tween.t += dt;
          var k = Math.min(tween.t / tween.dur, 1), e = easeInOut(k);
          cur.theta = tween.from.theta + (tween.to.theta - tween.from.theta) * e;
          cur.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * e;
          cur.radius = tween.from.radius + (tween.to.radius - tween.from.radius) * e;
          target.lerpVectors(tween.from.target, tween.to.target, e);
          if (k >= 1) tween = null;
        } else {
          var l = 1 - Math.pow(0.0012, dt); // 帧率无关阻尼
          cur.theta += (sph.theta - cur.theta) * l;
          cur.phi += (sph.phi - cur.phi) * l;
          cur.radius += (sph.radius - cur.radius) * l;
        }
        // 震屏衰减
        var decay = Math.pow(0.001, dt);
        shake.multiplyScalar(decay);
        if (shake.length() < 0.0005) shake.set(0, 0, 0);
        apply();
      },
      flip: function () { // 翻转视角到对方半场
        var nt = sph.theta + Math.PI;
        tweenTo(nt, sph.phi, sph.radius, target.x, target.y, target.z, 1.0);
      },
      reset: function () { // 复位到红方视角（自适应保证棋盘完整可见）
        userAdjusted = false;
        var fit = fitBoard(0.32, 0.95, 11.8);
        tweenTo(0.32, 0.95, fit.radius, 0, 0.3, 0, 0.9);
      },
      focus: function (v, radius) { // 聚焦某点（如被将军的将）
        tweenTo(sph.theta, sph.phi, radius || 10.5, v.x, v.y, v.z, 0.8);
      },
      zoomBy: function (factor) { // 缩放：factor>1 拉近（半径减小），<1 拉远；阻尼平滑
        var nr = sph.radius / factor;
        nr = Math.max(MIN_R, Math.min(MAX_R, nr));
        if (Math.abs(nr - sph.radius) < 0.01) return;
        sph.radius = nr;
        tween = null;
        userAdjusted = true;
      },
      nudgeShake: function (amp) { // 相机轻震（将军反馈，自动衰减）
        shake.x += (Math.random() - 0.5) * amp;
        shake.y += (Math.random() - 0.5) * amp * 0.5;
        shake.z += (Math.random() - 0.5) * amp;
      },
      get theta() { return sph.theta; },
      setView: function (theta, phi, radius, tx, ty, tz) { // 调试/测试用：直接设定视角
        tween = null; userAdjusted = true;
        sph.theta = cur.theta = theta;
        sph.phi = cur.phi = phi;
        sph.radius = cur.radius = radius;
        if (tx != null) { target.x = tx; target.y = ty; target.z = tz; }
        apply();
      },
      setEnabled: function (v) { enabled = v; },
      refit: function () { // 窗口变化后重新适配（无动画）
        if (userAdjusted) return;
        var f2 = fitBoard(sph.theta, sph.phi, 11.8);
        tween = null;
        sph.radius = cur.radius = f2.radius;
        target.set(0, 0.3, 0);
        apply();
      }
    };
    window.addEventListener('resize', function () { api.refit(); });
    return api;
  }

  global.XQ = global.XQ || {};
  global.XQ.controls3d = { createControls: createControls };
})(typeof window !== 'undefined' ? window : globalThis);
