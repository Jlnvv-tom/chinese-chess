/*
 * scene3d.js — 沉浸式 3D 场景：棋盘、动态光影、氛围粒子、指示效果
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;
  var CELL = 1;
  var SURFACE_Y = 0.61;   // 棋盘面高度
  var RED = XQ.RED;

  function cellToPos(row, col) {
    return new THREE.Vector3((col - 4) * CELL, SURFACE_Y, (row - 4.5) * CELL);
  }
  function posToCell(v) {
    return { row: Math.round(v.z / CELL + 4.5), col: Math.round(v.x / CELL + 4) };
  }

  /* ---------------- 世界构建 ---------------- */
  function buildBoard() {
    var g = new THREE.Group();

    // 外框（深色硬木），顶面 0.58，盘面探出 0.03
    var frameTex = XQ.textures.woodTexture('#4a3421', 'rgba(20,10,4,0.5)', 512, 512);
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(9.9, 0.58, 10.9),
      new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.5, metalness: 0.08 })
    );
    frame.position.y = 0.29;
    frame.castShadow = true; frame.receiveShadow = true;
    g.add(frame);
    // 边框金线
    var trim = new THREE.Mesh(
      new THREE.BoxGeometry(10.02, 0.03, 11.02),
      new THREE.MeshPhysicalMaterial({ color: 0xb98c3f, roughness: 0.3, metalness: 0.85 })
    );
    trim.position.y = 0.585;
    g.add(trim);

    // 盘面（贴图：木纹 + 楚河汉界 + 定位标记）；盒高 0.12，顶面与 SURFACE_Y 齐平
    var topTex = XQ.textures.boardTexture();
    var surfMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.42, metalness: 0.05 });
    var sideMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.55 });
    var surf = new THREE.Mesh(
      new THREE.BoxGeometry(9.3, 0.12, 10.3),
      [sideMat, sideMat, surfMat, sideMat, sideMat, sideMat]
    );
    surf.position.y = SURFACE_Y - 0.06;
    surf.receiveShadow = true;
    g.add(surf);

    // 3D 立体刻线（深古铜），略高于盘面
    var lineMat = new THREE.MeshStandardMaterial({ color: 0x2e2013, roughness: 0.45, metalness: 0.35 });
    function line(w, l, x, z, rotY) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.016, l), lineMat);
      m.position.set(x, SURFACE_Y + 0.003, z);
      if (rotY) m.rotation.y = rotY;
      m.receiveShadow = true;
      g.add(m);
      return m;
    }
    var r, c;
    for (r = 0; r < 10; r++) line(8.0, 0.028, 0, (r - 4.5) * CELL);           // 横线（col 0→8）
    for (c = 0; c < 9; c++) {                                                // 纵线（河界断开）
      var x = (c - 4) * CELL;
      if (c === 0 || c === 8) line(0.028, 9.0, x, 0);                        // 边线通天
      else { line(0.028, 4.0, x, -2.5); line(0.028, 4.0, x, 2.5); }          // 内线河界断开
    }
    // 九宫斜线（对角长 2√2 ≈ 2.83，中心在九宫中点）
    [[0, 7]].forEach(function () {});
    [[-3.5], [3.5]].forEach(function (zc) {                                   // 黑/红九宫
      line(0.022, 2.83, 0, zc[0], Math.PI / 4);
      line(0.022, 2.83, 0, zc[0], -Math.PI / 4);
    });
    return g;
  }

  function buildEnvironment(scene) {
    // 背景穹顶
    var bg = new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 24),
      new THREE.MeshBasicMaterial({ map: XQ.textures.backdropTexture(), side: THREE.BackSide, fog: false })
    );
    scene.add(bg);
    // 地面
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ map: XQ.textures.groundTexture(), roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    scene.add(ground);
    // 远处山影（剪影环）
    var mountainMat = new THREE.MeshBasicMaterial({ color: 0x0c0a09, fog: false, transparent: true, opacity: 0.9 });
    for (var m = 0; m < 7; m++) {
      var a = (m / 7) * Math.PI * 2 + 0.4;
      var h = 5 + ((m * 37) % 5);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(6 + (m % 3) * 2, h, 4), mountainMat);
      cone.position.set(Math.cos(a) * 26, h / 2 - 1.2, Math.sin(a) * 26);
      cone.rotation.y = a;
      scene.add(cone);
    }
  }

  function buildLights(scene) {
    var lights = {};
    lights.hemi = new THREE.HemisphereLight(0x7a6a54, 0x0c0a08, 0.5);
    scene.add(lights.hemi);

    // 主聚光灯（缓慢环绕 → 动态投影）
    lights.key = new THREE.SpotLight(0xff5d9a8, 1.5, 48, 0.72, 0.55, 1.4);
    lights.key.position.set(6.5, 12.5, 7);
    lights.key.target.position.set(0, 0, 0);
    lights.key.castShadow = true;
    lights.key.shadow.mapSize.set(2048, 2048);
    lights.key.shadow.camera.near = 3;
    lights.key.shadow.camera.far = 34;
    lights.key.shadow.bias = -0.0004;
    lights.key.shadow.radius = 4;
    scene.add(lights.key); scene.add(lights.key.target);

    // 冷色轮廓光
    lights.rim = new THREE.SpotLight(0x5f83c4, 1.0, 46, 0.8, 0.7, 1.2);
    lights.rim.position.set(-9, 8.5, -10);
    lights.rim.target.position.set(0, 0, 0);
    scene.add(lights.rim); scene.add(lights.rim.target);

    // 正面暖补光
    lights.fill = new THREE.PointLight(0xffb878, 0.5, 26, 1.6);
    lights.fill.position.set(0, 4.5, 8.5);
    scene.add(lights.fill);

    // 选中棋子跟随光 / 将军红光（动态创建）
    lights.follow = new THREE.PointLight(0xff5d9a8, 0.0, 4.5, 1.8);
    scene.add(lights.follow);
    lights.alarm = new THREE.PointLight(0xff2e1f, 0.0, 6.0, 1.8);
    scene.add(lights.alarm);
    return lights;
  }

  function buildParticles(scene) {
    // 萤火
    var N = 90;
    var pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = 0.4 + Math.random() * 5.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      seed[i] = Math.random() * 100;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: XQ.textures.glowTexture('rgba(255,214,140,1)', 'rgba(255,150,50,0.5)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc878
    }));
    scene.add(fireflies);
    // 上升光尘
    var M = 140;
    var pos2 = new Float32Array(M * 3), seed2 = new Float32Array(M);
    for (var j = 0; j < M; j++) {
      pos2[j * 3] = (Math.random() - 0.5) * 18;
      pos2[j * 3 + 1] = Math.random() * 8;
      pos2[j * 3 + 2] = (Math.random() - 0.5) * 16;
      seed2[j] = Math.random() * 100;
    }
    var geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    var dust = new THREE.Points(geo2, new THREE.PointsMaterial({
      size: 0.045, map: XQ.textures.glowTexture('rgba(200,220,255,0.9)', 'rgba(120,150,220,0.35)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x9db8e8, opacity: 0.7
    }));
    scene.add(dust);
    return { fireflies: fireflies, dust: dust, seed: seed, seed2: seed2 };
  }

  function buildGodRays(scene) {
    var group = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.055,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    for (var i = 0; i < 3; i++) {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 13, 24, 1, true), mat);
      cone.position.set((i - 1) * 3.2, 6.4, (i - 1) * -1.6);
      cone.rotation.z = (i - 1) * 0.12;
      group.add(cone);
    }
    scene.add(group);
    return group;
  }

  /* ---------------- 指示效果 ---------------- */
  function buildEffects(scene) {
    var fx = { root: new THREE.Group() };
    scene.add(fx.root);

    var glowGold = XQ.textures.glowTexture('rgba(255,220,140,0.95)', 'rgba(255,170,60,0.45)');
    var glowCyan = XQ.textures.glowTexture('rgba(150,255,220,0.95)', 'rgba(60,220,180,0.4)');
    var glowRed = XQ.textures.glowTexture('rgba(255,120,90,0.95)', 'rgba(255,50,30,0.45)');

    // 悬停环
    fx.hover = new THREE.Mesh(
      new THREE.RingGeometry(0.40, 0.47, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    fx.hover.rotation.x = -Math.PI / 2;
    fx.hover.visible = false;
    fx.root.add(fx.hover);

    // 选中环（双层）
    fx.select = new THREE.Group();
    var selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.50, 48),
      new THREE.MeshBasicMaterial({ color: 0xff5d9a8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
    );
    selRing.rotation.x = -Math.PI / 2;
    var selGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowGold, transparent: true, opacity: 0.5, depthWrite: false }));
    selGlow.scale.set(1.5, 1.5, 1);
    fx.select.add(selRing); fx.select.add(selGlow);
    fx.select.visible = false;
    fx.root.add(fx.select);

    // 合法着法光点 / 吃子圈 / 炮的隔山轨迹
    fx.dots = new THREE.Group(); fx.root.add(fx.dots);
    fx.caps = new THREE.Group(); fx.root.add(fx.caps);
    fx.trajectory = new THREE.Group(); fx.root.add(fx.trajectory);

    // 上一步标记
    fx.lastFrom = marker(0x8fb8ff, 0.55); fx.root.add(fx.lastFrom);
    fx.lastTo = marker(0x8fb8ff, 0.75); fx.root.add(fx.lastTo);

    // 将军红光
    fx.checkGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowRed, transparent: true, opacity: 0, depthWrite: false }));
    fx.checkGlow.scale.set(2.2, 2.2, 1);
    fx.root.add(fx.checkGlow);

    function marker(color, op) {
      var m = new THREE.Mesh(
        new THREE.RingGeometry(0.36, 0.44, 4, 1, Math.PI / 4),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      return m;
    }

    fx.clearAll = function () {
      fx.hover.visible = false;
      fx.select.visible = false;
      fx.dots.clear(); fx.caps.clear();
      fx.lastFrom.visible = false; fx.lastTo.visible = false;
      fx.checkGlow.material.opacity = 0;
    };
    return fx;
  }

  /* ---------------- 主控制器 ---------------- */
  function createWorld(canvas) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0806, 0.022);

    var camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(3.0, 7.2, 9.1);
    camera.lookAt(0, 0.3, 0);

    buildEnvironment(scene);
    var board = buildBoard();
    scene.add(board);
    var lights = buildLights(scene);
    var particles = buildParticles(scene);
    var rays = buildGodRays(scene);
    var fx = buildEffects(scene);

    var world = {
      renderer: renderer, scene: scene, camera: camera,
      board: board, lights: lights, particles: particles, rays: rays, fx: fx,
      cellToPos: cellToPos, posToCell: posToCell, SURFACE_Y: SURFACE_Y,
      time: 0, onTick: null
    };

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    var last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      // 低帧率环境下钳制在 0.25s：保证动画按真实时间推进（而非慢动作）
      var dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      world.time += dt;
      var t = world.time;

      // 主光环绕（动态阴影）
      var ka = t * 0.055;
      lights.key.position.set(Math.cos(ka) * 7.2, 12.5 + Math.sin(t * 0.3) * 0.6, Math.sin(ka) * 7.2 + 1.2);
      // 轮廓光呼吸
      lights.rim.intensity = 0.85 + Math.sin(t * 0.8) * 0.18;
      // 萤火漂浮
      var fp = particles.fireflies.geometry.attributes.position;
      for (var i = 0; i < fp.count; i++) {
        var s = particles.seed[i];
        fp.setY(i, 0.5 + ((fp.getY(i) + Math.sin(t * 0.4 + s) * 0.12 + 5.7) % 5.2));
        fp.setX(i, fp.getX(i) + Math.sin(t * 0.25 + s * 2.1) * 0.004);
      }
      fp.needsUpdate = true;
      // 光尘上升
      var dp = particles.dust.geometry.attributes.position;
      for (var j = 0; j < dp.count; j++) {
        var s2 = particles.seed2[j];
        dp.setY(j, dp.getY(j) + (0.12 + (s2 % 10) * 0.012) * dt * 2);
        if (dp.getY(j) > 8.5) dp.setY(j, -0.2);
        dp.setX(j, dp.getX(j) + Math.sin(t * 0.2 + s2) * 0.0025);
      }
      dp.needsUpdate = true;
      // 光束缓慢漂移
      rays.rotation.y = t * 0.02;
      rays.position.x = Math.sin(t * 0.1) * 0.6;

      if (world.onTick) world.onTick(t, dt);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
    return world;
  }

  XQ.scene3d = { createWorld: createWorld, cellToPos: cellToPos, posToCell: posToCell, SURFACE_Y: SURFACE_Y };
})(typeof window !== 'undefined' ? window : globalThis);
