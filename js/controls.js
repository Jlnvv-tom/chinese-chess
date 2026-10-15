/*
 * controls.js — 自定义轨道相机控制（阻尼旋转/缩放/平移 + 补间翻转复位）
 */
(function (global) {
  'use strict';

  function createControls(camera, domElement, opts) {
    opts = opts || {};
    var target = new THREE.Vector3(0, 0.3, 0);
    var shake = new THREE.Vector3(0, 0, 0); // 衰减式震屏偏移
    var sph = { theta: 0.32, phi: 0.95, radius: 11.8 };      // 目标值
    var cur = { theta: 0.32, phi: 0.95, radius: 11.8 };      // 当前值（阻尼逼近）
    var MIN_PHI = 0.32, MAX_PHI = 1.38;
    var MIN_R = 6.5, MAX_R = 20;
    var tween = null;
    var enabled = true;

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
        tween = null;
      } else if (mode === 'pan' && pointers.size === 1) {
        var panScale = cur.radius * 0.0016;
        var sinT = Math.sin(cur.theta), cosT = Math.cos(cur.theta);
        target.x -= (e.clientX - lastX) * panScale * cosT - (e.clientY - lastY) * panScale * sinT * 0.4;
        target.z += (e.clientX - lastX) * panScale * sinT + (e.clientY - lastY) * panScale * cosT * 0.4;
        target.x = Math.max(-4, Math.min(4, target.x));
        target.z = Math.max(-4.5, Math.min(4.5, target.z));
        lastX = e.clientX; lastY = e.clientY;
        tween = null;
      } else if (mode === 'pinch' && pointers.size === 2) {
        var p = Array.from(pointers.values());
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        sph.radius *= pinchDist / Math.max(d, 1);
        sph.radius = Math.max(MIN_R, Math.min(MAX_R, sph.radius));
        pinchDist = d;
        tween = null;
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
      tween = null;
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
      reset: function () { // 复位到红方视角
        tweenTo(0.32, 0.95, 11.8, 0, 0.3, 0, 0.9);
      },
      focus: function (v, radius) { // 聚焦某点（如被将军的将）
        tweenTo(sph.theta, sph.phi, radius || 10.5, v.x, v.y, v.z, 0.8);
      },
      nudgeShake: function (amp) { // 相机轻震（将军反馈，自动衰减）
        shake.x += (Math.random() - 0.5) * amp;
        shake.y += (Math.random() - 0.5) * amp * 0.5;
        shake.z += (Math.random() - 0.5) * amp;
      },
      get theta() { return sph.theta; },
      setView: function (theta, phi, radius, tx, ty, tz) { // 调试/测试用：直接设定视角
        tween = null;
        sph.theta = cur.theta = theta;
        sph.phi = cur.phi = phi;
        sph.radius = cur.radius = radius;
        if (tx != null) { target.x = tx; target.y = ty; target.z = tz; }
        apply();
      },
      setEnabled: function (v) { enabled = v; }
    };
    return api;
  }

  global.XQ = global.XQ || {};
  global.XQ.controls3d = { createControls: createControls };
})(typeof window !== 'undefined' ? window : globalThis);
