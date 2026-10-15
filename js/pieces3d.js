/*
 * pieces3d.js — 创意棋子 3D 模型工厂
 * 每种棋子独特造型：将帅(王冠统帅)、仕(乌纱谋士)、相(大象)、马(马首浮雕)、
 * 车(塔楼战车)、炮(红衣大炮)、兵(兜鍪小卒)。全部非扁平圆饼，强调角色特征。
 * 约定：棋子 Group 原点在棋盘面 (y=0)，面牌朝 +z（红方）；黑方整体旋转 180°。
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;
  var K = XQ.K, A = XQ.A, E = XQ.E, H = XQ.H, R = XQ.R, C = XQ.C, P = XQ.P;
  var RED = XQ.RED;
  var RED_CHAR = { 1: '帥', 2: '仕', 3: '相', 4: '傌', 5: '俥', 6: '炮', 7: '兵' };
  var BLACK_CHAR = { 1: '將', 2: '士', 3: '象', 4: '馬', 5: '車', 6: '砲', 7: '卒' };

  /* ---------- 材质 ---------- */
  var _mats = {};
  function woodMat(side) {
    var key = 'wood' + side;
    if (!_mats[key]) {
      _mats[key] = new THREE.MeshPhysicalMaterial({
        color: side === RED ? 0x8e2417 : 0x2f353d,
        roughness: 0.38, metalness: 0.05,
        clearcoat: 0.6, clearcoatRoughness: 0.3
      });
    }
    return _mats[key];
  }
  function goldMat() {
    if (!_mats.gold) {
      _mats.gold = new THREE.MeshPhysicalMaterial({
        color: 0xd9a94f, roughness: 0.26, metalness: 0.9,
        clearcoat: 0.4, clearcoatRoughness: 0.2
      });
    }
    return _mats.gold;
  }
  function darkMat() {
    if (!_mats.dark) {
      _mats.dark = new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.55, metalness: 0.3 });
    }
    return _mats.dark;
  }
  function clothMat(side) {
    var key = 'cloth' + side;
    if (!_mats[key]) {
      _mats[key] = new THREE.MeshStandardMaterial({
        color: side === RED ? 0xb03a26 : 0x3d434c, roughness: 0.85, metalness: 0.0,
        side: THREE.DoubleSide
      });
    }
    return _mats[key];
  }

  /* ---------- 基础构件 ---------- */
  // 车削底座（阶梯木座）
  function baseLathe(rFoot, hFoot, y0) {
    var pts = [
      new THREE.Vector2(0.001, y0),
      new THREE.Vector2(rFoot, y0),
      new THREE.Vector2(rFoot, y0 + 0.018),
      new THREE.Vector2(rFoot * 0.86, y0 + 0.045),
      new THREE.Vector2(rFoot * 0.70, y0 + hFoot * 0.55),
      new THREE.Vector2(rFoot * 0.60, y0 + hFoot)
    ];
    return new THREE.LatheGeometry(pts, 40);
  }
  // 车削躯干
  function bodyLathe(profile, seg) {
    return new THREE.LatheGeometry(profile.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg || 40);
  }
  // 面牌（前倾圆盘 + 金框）
  function facePlate(char, side, r, y, z, tilt) {
    var g = new THREE.Group();
    var tex = XQ.textures.faceTexture(char, side);
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.08 });
    var disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat);
    disc.rotation.x = -(tilt == null ? 0.42 : tilt);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, r * 0.09, 10, 40), goldMat());
    rim.rotation.x = -(tilt == null ? 0.42 : tilt);
    g.add(disc); g.add(rim);
    g.position.set(0, y, z);
    return g;
  }

  /* ---------- 各棋子造型 ---------- */

  // 将/帅：王冠统帅 —— 车削甲胄躯干 + 环座六棘王冠 + 胸前宝牌
  function buildGeneral(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.30, 0.14, 0), wood));
    var body = bodyLathe([
      [0.185, 0.12], [0.205, 0.24], [0.245, 0.33], [0.225, 0.41],
      [0.165, 0.47], [0.135, 0.51]
    ]);
    g.add(new THREE.Mesh(body, wood));
    // 护心镜
    var boss = new THREE.Mesh(new THREE.SphereGeometry(0.062, 20, 16), goldMat());
    boss.position.set(0, 0.33, 0.20);
    g.add(boss);
    // 王冠：环 + 六棘 + 顶珠
    var crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.024, 12, 40), goldMat());
    crownRing.rotation.x = Math.PI / 2;
    crownRing.position.y = 0.545;
    g.add(crownRing);
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.15, 10), goldMat());
      spike.position.set(Math.cos(a) * 0.125, 0.60, Math.sin(a) * 0.125);
      spike.rotation.z = -Math.cos(a) * 0.22;
      spike.rotation.x = Math.sin(a) * 0.22;
      g.add(spike);
    }
    var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), goldMat());
    gem.position.y = 0.66;
    g.add(gem);
    g.add(facePlate(side === RED ? RED_CHAR[1] : BLACK_CHAR[1], side, 0.19, 0.27, 0.21, 0.5));
    return g;
  }

  // 仕/士：乌纱谋士 —— 修长身躯 + 前倾纱帽 + 帽正宝石
  function buildAdvisor(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.27, 0.13, 0), wood));
    g.add(new THREE.Mesh(bodyLathe([
      [0.155, 0.11], [0.175, 0.24], [0.20, 0.34], [0.165, 0.42], [0.115, 0.47], [0.09, 0.50]
    ]), wood));
    // 纱帽（前倾）
    var hat = new THREE.Group();
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.15, 32), wood);
    cone.position.y = 0.075;
    hat.add(cone);
    var hatRim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.022, 10, 32), goldMat());
    hatRim.rotation.x = Math.PI / 2;
    hatRim.position.y = 0.012;
    hat.add(hatRim);
    var hatGem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), goldMat());
    hatGem.position.set(0, 0.155, 0.02);
    hat.add(hatGem);
    hat.position.y = 0.50;
    hat.rotation.x = 0.30; // 前倾
    g.add(hat);
    g.add(facePlate(side === RED ? RED_CHAR[2] : BLACK_CHAR[2], side, 0.165, 0.25, 0.185, 0.45));
    return g;
  }

  // 相/象：大象 —— 圆穹身躯 + 招风大耳 + 弯长鼻 + 小獠牙
  function buildElephant(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.29, 0.13, 0), wood));
    var dome = new THREE.Mesh(new THREE.SphereGeometry(0.30, 32, 24), wood);
    dome.scale.set(1, 0.95, 0.98);
    dome.position.y = 0.385;
    g.add(dome);
    // 双耳（大而立）
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), wood);
      ear.scale.set(0.30, 1.05, 0.66);
      ear.position.set(s * 0.255, 0.46, -0.04);
      ear.rotation.z = s * 0.30;
      ear.rotation.y = s * -0.35;
      g.add(ear);
    });
    // 弯鼻（两段构成弧线）
    var trunkUp = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.062, 0.20, 14), wood);
    trunkUp.position.set(0, 0.31, 0.27);
    trunkUp.rotation.x = 0.55;
    g.add(trunkUp);
    var trunkDn = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.040, 0.20, 14), wood);
    trunkDn.position.set(0, 0.175, 0.345);
    trunkDn.rotation.x = 1.25;
    g.add(trunkDn);
    var trunkTip = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), wood);
    trunkTip.position.set(0, 0.085, 0.40);
    g.add(trunkTip);
    // 獠牙
    [-1, 1].forEach(function (s) {
      var tusk = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.10, 8), goldMat());
      tusk.position.set(s * 0.08, 0.21, 0.315);
      tusk.rotation.x = 2.4;
      tusk.rotation.z = s * 0.3;
      g.add(tusk);
    });
    g.add(facePlate(side === RED ? RED_CHAR[3] : BLACK_CHAR[3], side, 0.18, 0.43, 0.235, 0.42));
    return g;
  }

  // 马/馬：马首浮雕 —— 长头型侧影 + 锐耳 + 鬃毛棘 + 金鬃线
  function buildHorse(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.27, 0.13, 0), wood));
    // 脖颈
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.155, 0.22, 16), wood);
    neck.position.set(-0.07, 0.22, 0);
    neck.rotation.z = -0.14;
    g.add(neck);
    // 马首侧影（XY 平面绘制，头朝 +x，拉伸后转向 +z）
    var s = new THREE.Shape();
    s.moveTo(-0.30, 0.00);
    s.quadraticCurveTo(-0.35, 0.22, -0.24, 0.36);   // 颈背
    s.lineTo(-0.21, 0.45);                          // 鬃根
    s.lineTo(-0.235, 0.57);                         // 鬃棘 1
    s.lineTo(-0.155, 0.49);
    s.lineTo(-0.135, 0.63);                         // 鬃棘 2
    s.lineTo(-0.06, 0.51);
    s.lineTo(-0.03, 0.66);                          // 耳 1（锐）
    s.lineTo(0.04, 0.52);
    s.lineTo(0.085, 0.70);                          // 耳 2（锐）
    s.lineTo(0.14, 0.53);
    s.quadraticCurveTo(0.25, 0.49, 0.33, 0.41);     // 额
    s.quadraticCurveTo(0.43, 0.35, 0.41, 0.25);     // 鼻梁
    s.quadraticCurveTo(0.38, 0.17, 0.27, 0.145);    // 唇
    s.quadraticCurveTo(0.12, 0.125, 0.00, 0.06);    // 颌
    s.quadraticCurveTo(-0.16, 0.02, -0.30, 0.00);   // 喉
    var headGeo = new THREE.ExtrudeGeometry(s, {
      depth: 0.26, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.032, bevelSegments: 4
    });
    headGeo.translate(0, 0, -0.13);
    var head = new THREE.Mesh(headGeo, wood);
    head.position.y = 0.13;
    head.rotation.y = -Math.PI / 2;  // 马头转向 +z
    g.add(head);
    // 金鬃线（沿颈背）
    var crest = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 8, 12, Math.PI * 0.9), goldMat());
    crest.position.set(-0.16, 0.40, 0.135);
    crest.rotation.set(Math.PI / 2, 0, 2.4);
    g.add(crest);
    // 鼻唇金饰
    var nostril = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 8, 16), goldMat());
    nostril.position.set(0, 0.245, 0.375);
    g.add(nostril);
    g.add(facePlate(side === RED ? RED_CHAR[4] : BLACK_CHAR[4], side, 0.16, 0.20, 0.205, 0.42));
    return g;
  }

    // 塔楼战车 —— 方塔 + 雉堞 + 金顶 + 背帜 + 双轮
  function buildChariot(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.30, 0.14, 0), wood));
    // 塔身
    var tower = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.30, 0.40), wood);
    tower.position.y = 0.30;
    g.add(tower);
    // 角柱
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.34, 8), goldMat());
      post.position.set(p[0] * 0.185, 0.30, p[1] * 0.185);
      g.add(post);
    });
    // 雉堞
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      var merlon = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.10), wood);
      merlon.position.set(Math.cos(a) * 0.16, 0.485, Math.sin(a) * 0.16);
      merlon.rotation.y = -a;
      g.add(merlon);
    }
    // 金顶
    var roof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.13, 4), goldMat());
    roof.position.y = 0.55;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // 背帜（塔后小旗）
    var pennant = new THREE.Shape();
    pennant.moveTo(0, 0);
    pennant.lineTo(0.16, -0.035);
    pennant.lineTo(0.17, -0.085);
    pennant.lineTo(0, -0.06);
    pennant.lineTo(0, 0);
    var flag = new THREE.Mesh(
      new THREE.ExtrudeGeometry(pennant, { depth: 0.008, bevelEnabled: false }),
      clothMat(side)
    );
    flag.position.set(0.02, 0.50, -0.21);
    g.add(flag);
    // 双轮
    [-1, 1].forEach(function (sgn) {
      var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.032, 10, 24), wood);
      wheel.position.set(sgn * 0.215, 0.16, 0);
      wheel.rotation.y = Math.PI / 2;
      g.add(wheel);
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 10), goldMat());
      hub.position.set(sgn * 0.225, 0.16, 0);
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
    });
    g.add(facePlate(side === RED ? RED_CHAR[5] : BLACK_CHAR[5], side, 0.175, 0.29, 0.20, 0.42));
    return g;
  }

  // 炮/砲：红衣大炮 —— 炮车 + 仰角炮管 + 加强环 + 炮口（吃子时有后座动画）
  function buildCannon(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.29, 0.13, 0), wood));
    // 炮车
    var carriage = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.15, 0.34), wood);
    carriage.position.y = 0.20;
    g.add(carriage);
    // 炮管组（以后轴承为 pivot）
    var barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0.24, -0.06);
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.095, 0.40, 20), wood);
    barrel.position.y = 0.20;
    barrelPivot.add(barrel);
    // 加强环
    [0.30, 0.13].forEach(function (by) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.024, 10, 24), goldMat());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = by;
      barrelPivot.add(ring);
    });
    // 炮口
    var muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 20), darkMat());
    muzzle.position.y = 0.405;
    barrelPivot.add(muzzle);
    // 药室球
    var breech = new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 14), wood);
    breech.position.y = 0.03;
    barrelPivot.add(breech);
    barrelPivot.rotation.x = -0.62; // 仰角
    g.add(barrelPivot);
    g.userData.barrelPivot = barrelPivot;
    // 轮
    [-1, 1].forEach(function (sgn) {
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 20), wood);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sgn * 0.21, 0.13, 0);
      g.add(wheel);
    });
    g.add(facePlate(side === RED ? RED_CHAR[6] : BLACK_CHAR[6], side, 0.165, 0.22, 0.175, 0.45));
    return g;
  }

  // 兵/卒：兜鍪小卒 —— 圆躯 + 碗盔 + 盔缨
  function buildSoldier(side) {
    var g = new THREE.Group();
    var wood = woodMat(side);
    g.add(new THREE.Mesh(baseLathe(0.25, 0.12, 0), wood));
    g.add(new THREE.Mesh(bodyLathe([
      [0.145, 0.10], [0.165, 0.22], [0.18, 0.30], [0.15, 0.35], [0.105, 0.385]
    ]), wood));
    // 盔
    var helm = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 18), wood);
    helm.scale.set(1, 0.82, 1);
    helm.position.y = 0.44;
    g.add(helm);
    var helmRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 10, 28), goldMat());
    helmRim.rotation.x = Math.PI / 2;
    helmRim.position.y = 0.385;
    g.add(helmRim);
    // 盔缨
    var plume = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.10, 8), clothMat(side));
    plume.position.y = 0.575;
    g.add(plume);
    var plumeBall = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), goldMat());
    plumeBall.position.y = 0.535;
    g.add(plumeBall);
    g.add(facePlate(side === RED ? RED_CHAR[7] : BLACK_CHAR[7], side, 0.15, 0.245, 0.16, 0.42));
    return g;
  }

  var BUILDERS = {};
  BUILDERS[K] = buildGeneral;
  BUILDERS[A] = buildAdvisor;
  BUILDERS[E] = buildElephant;
  BUILDERS[H] = buildHorse;
  BUILDERS[R] = buildChariot;
  BUILDERS[C] = buildCannon;
  BUILDERS[P] = buildSoldier;

  var SCALE = {};
  SCALE[K] = 1.16; SCALE[A] = 0.94; SCALE[E] = 1.02; SCALE[H] = 1.0; SCALE[R] = 1.04; SCALE[C] = 0.98; SCALE[P] = 0.86;

  /* 创建棋子（返回 Group；userData 记录 kind/side/scale） */
  function createPiece(kind, side) {
    var g = BUILDERS[kind](side);
    g.scale.setScalar(SCALE[kind] || 1);
    if (side !== RED) g.rotation.y = Math.PI; // 黑方棋子转向
    g.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
    g.userData.kind = kind;
    g.userData.side = side;
    return g;
  }

  XQ.pieces3d = { createPiece: createPiece, SCALE: SCALE, RED_CHAR: RED_CHAR, BLACK_CHAR: BLACK_CHAR };
})(typeof window !== 'undefined' ? window : globalThis);
