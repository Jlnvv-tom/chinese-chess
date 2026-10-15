/*
 * interaction.js — 输入拾取、指示效果、补间动画系统
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;

  /* ---------------- 补间管理器 ---------------- */
  function createTweener() {
    var list = [];
    return {
      add: function (dur, onUpdate, onDone) {
        var t = { t: 0, dur: dur, onUpdate: onUpdate, onDone: onDone };
        list.push(t);
        return t;
      },
      update: function (dt) {
        for (var i = list.length - 1; i >= 0; i--) {
          var tw = list[i];
          tw.t += dt;
          var k = Math.min(tw.t / tw.dur, 1);
          tw.onUpdate(k);
          if (k >= 1) {
            list.splice(i, 1);
            if (tw.onDone) tw.onDone();
          }
        }
      },
      get busy() { return list.length > 0; },
      clear: function () { list.length = 0; }
    };
  }
  var easeOut = function (k) { return 1 - Math.pow(1 - k, 3); };
  var easeInOut = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };

  /* ---------------- 交互控制器 ---------------- */
  function createInteraction(world, canvas, opts) {
    opts = opts || {};
    var tweener = createTweener();
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.SURFACE_Y);
    var fx = world.fx;
    var selected = null;       // {row, col}
    var pendingCell = null;    // 输入阻塞期间缓存的最后一次点击
    var hoverCell = null;
    var legalTargets = [];     // 当前选中棋子的合法目标 [{row,col,capture}]
    var busy = false;

    function cellFromEvent(e) {
      var rect = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, world.camera);
      var pt = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, pt)) return null;
      var cell = world.posToCell(pt);
      if (cell.row < 0 || cell.row > 9 || cell.col < 0 || cell.col > 8) return null;
      return cell;
    }

    /* ---- 指示效果 ---- */
    function showHover(cell) {
      if (!cell) { fx.hover.visible = false; return; }
      var p = world.cellToPos(cell.row, cell.col);
      fx.hover.position.set(p.x, p.y + 0.012, p.z);
      fx.hover.visible = true;
    }
    function showSelection(cell) {
      var p = world.cellToPos(cell.row, cell.col);
      fx.select.position.set(p.x, p.y + 0.012, p.z);
      fx.select.visible = true;
    }
    function showLegalMoves(targets, selCell) {
      fx.dots.clear(); fx.caps.clear(); fx.trajectory.clear();
      fx.trajectory.userData.arcs = [];
      targets.forEach(function (t) {
        var p = world.cellToPos(t.row, t.col);
        if (t.capture) {
          var ring = new THREE.Mesh(
            new THREE.RingGeometry(0.36, 0.46, 36),
            new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(p.x, p.y + 0.012, p.z);
          fx.caps.add(ring);
          var glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: XQ.textures.glowTexture('rgba(255,150,90,0.9)', 'rgba(255,80,40,0.4)'),
            transparent: true, opacity: 0.55, depthWrite: false
          }));
          glow.scale.set(1.1, 1.1, 1);
          glow.position.set(p.x, p.y + 0.05, p.z);
          fx.caps.add(glow);
          // 炮的隔山打牛：标出炮架 + 绘制抛物线弹道，让“隔子吃子”规则可见
          if (t.screen && selCell) {
            var sp = world.cellToPos(t.screen.row, t.screen.col);
            var sRing = new THREE.Mesh(
              new THREE.RingGeometry(0.30, 0.38, 28),
              new THREE.MeshBasicMaterial({ color: 0xff5d9a8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
            );
            sRing.rotation.x = -Math.PI / 2;
            sRing.position.set(sp.x, sp.y + 0.014, sp.z);
            fx.trajectory.add(sRing);
            var sGlow = new THREE.Sprite(new THREE.SpriteMaterial({
              map: XQ.textures.glowTexture('rgba(255,220,140,0.95)', 'rgba(255,170,60,0.45)'),
              transparent: true, opacity: 0.6, depthWrite: false
            }));
            sGlow.scale.set(0.95, 0.95, 1);
            sGlow.position.set(sp.x, sp.y + 0.12, sp.z);
            fx.trajectory.add(sGlow);
            addArc(world.cellToPos(selCell.row, selCell.col), sp, p);
          }
        } else {
          var dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.085, 14, 10),
            new THREE.MeshBasicMaterial({ color: 0x9ff5d8, transparent: true, opacity: 0.95 })
          );
          dot.position.set(p.x, p.y + 0.02, p.z);
          fx.dots.add(dot);
          var dglow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: XQ.textures.glowTexture('rgba(150,255,220,0.9)', 'rgba(60,220,180,0.4)'),
            transparent: true, opacity: 0.5, depthWrite: false
          }));
          dglow.scale.set(0.55, 0.55, 1);
          dglow.position.set(p.x, p.y + 0.03, p.z);
          fx.dots.add(dglow);
        }
      });
    }
    // 炮弹抛物线（炮 → 炮架 → 目标）
    function addArc(from, over, to) {
      var a = from.clone(); a.y += 0.1;
      var b = to.clone(); b.y += 0.1;
      var mid = over.clone().lerp(to, 0.5); mid.y += 0.5 + from.distanceTo(to) * 0.06;
      var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.016, 8, false),
        new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      fx.trajectory.add(tube);
      var ball = new THREE.Sprite(new THREE.SpriteMaterial({
        map: XQ.textures.glowTexture('rgba(255,240,200,1)', 'rgba(255,160,60,0.6)'),
        transparent: true, opacity: 0.95, depthWrite: false
      }));
      ball.scale.set(0.22, 0.22, 1);
      fx.trajectory.add(ball);
      if (!fx.trajectory.userData.arcs) fx.trajectory.userData.arcs = [];
      fx.trajectory.userData.arcs.push({ curve: curve, ball: ball, t: Math.random() });
    }
    function markLastMove(from, to) {
      [fx.lastFrom, from], [fx.lastTo, to];
      var pf = world.cellToPos(from.row, from.col), pt = world.cellToPos(to.row, to.col);
      fx.lastFrom.position.set(pf.x, pf.y + 0.008, pf.z);
      fx.lastTo.position.set(pt.x, pt.y + 0.008, pt.z);
      fx.lastFrom.visible = true; fx.lastTo.visible = true;
    }
    function setCheckGlow(cell, on) {
      if (!on || !cell) { fx.checkGlow.material.opacity = 0; return; }
      var p = world.cellToPos(cell.row, cell.col);
      fx.checkGlow.position.set(p.x, p.y + 0.35, p.z);
    }
    function setFollowLight(cell, intensity) {
      if (!cell) { world.lights.follow.intensity = 0; return; }
      var p = world.cellToPos(cell.row, cell.col);
      world.lights.follow.position.set(p.x, p.y + 0.55, p.z + 0.2);
      world.lights.follow.intensity = intensity;
    }
    function setAlarmLight(cell, on) {
      if (!on || !cell) { world.lights.alarm.intensity = 0; return; }
      var p = world.cellToPos(cell.row, cell.col);
      world.lights.alarm.position.set(p.x, p.y + 0.6, p.z);
      world.lights.alarm.intensity = 1.4;
    }

    /* ---- 动画 ---- */
    // 棋子移动（含马跳跃、炮后座、吃子倾倒）
    function animateMove(pieceRec, fromCell, toCell, kind, capturedRec, onDone) {
      busy = true;
      var g = pieceRec.group;
      var a = world.cellToPos(fromCell.row, fromCell.col);
      var b = world.cellToPos(toCell.row, toCell.col);
      var dur = kind === 4 ? 0.52 : 0.4; // 马跳得稍慢
      var jump = kind === 4;
      tweener.add(dur, function (k) {
        var e = easeInOut(k);
        g.position.x = a.x + (b.x - a.x) * e;
        g.position.z = a.z + (b.z - a.z) * e;
        g.position.y = a.y + (jump ? Math.sin(Math.PI * k) * 0.62 : 0);
        if (jump) g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) * (1 - e) + (pieceRec.group.userData.baseRotY || 0) * e;
      }, function () {
        g.position.copy(b);
        g.rotation.y = pieceRec.group.userData.baseRotY || 0;
        busy = false;
        if (onDone) onDone();
      });
      // 炮后座
      if (kind === 6 && g.userData.barrelPivot) {
        var bp = g.userData.barrelPivot;
        tweener.add(0.34, function (k) {
          bp.rotation.x = -0.62 + Math.sin(Math.PI * k) * 0.34;
        });
      }
      // 吃子：倾倒滑落
      if (capturedRec) {
        var cg = capturedRec.group;
        var cp = cg.position.clone();
        tweener.add(0.62, function (k) {
          var e = easeOut(k);
          cg.rotation.x = e * 1.45;
          cg.position.y = cp.y - e * 1.5;
          cg.position.x = cp.x + (b.x - cp.x) * 0.18 * e;
          cg.position.z = cp.z + (b.z - cp.z) * 0.18 * e;
          cg.scale.setScalar((capturedRec.scale || 1) * (1 - e * 0.35));
        }, function () {
          cg.visible = false;
        });
        // 吃子火花
        sparkBurst(b);
      }
    }
    function sparkBurst(pos) {
      var n = 10;
      for (var i = 0; i < n; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: XQ.textures.glowTexture('rgba(255,230,170,1)', 'rgba(255,140,50,0.6)'),
          transparent: true, opacity: 0.95, depthWrite: false
        }));
        s.scale.set(0.22, 0.22, 1);
        s.position.set(pos.x, pos.y + 0.2, pos.z);
        world.scene.add(s);
        var ang = (i / n) * Math.PI * 2;
        var vx = Math.cos(ang) * 1.5, vz = Math.sin(ang) * 1.5;
        tweener.add(0.5, function (k, sp, vxx, vzz) {
          return function (kk) {
            sp.position.y += 0.028 * (1 - kk);
            sp.position.x += vxx * 0.016 * (1 - kk);
            sp.position.z += vzz * 0.016 * (1 - kk);
            sp.material.opacity = 0.95 * (1 - kk);
            sp.scale.setScalar(0.22 * (1 - kk * 0.7));
          };
        }(0, s, vx, vz), function (sp) {
          return function () { world.scene.remove(sp); sp.material.dispose(); };
        }(s));
      }
    }
    function resetPiece(pieceRec, cell) {
      var p = world.cellToPos(cell.row, cell.col);
      pieceRec.group.position.copy(p);
      pieceRec.group.rotation.set(0, pieceRec.group.userData.baseRotY || 0, 0);
      pieceRec.group.scale.setScalar(pieceRec.scale || 1);
      pieceRec.group.visible = true;
    }

    /* ---- 事件 ---- */
    canvas.addEventListener('pointermove', function (e) {
      if (busy) return;
      var cell = cellFromEvent(e);
      hoverCell = cell;
      if (opts.onHover) opts.onHover(cell);
    });
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      XQ.audio.unlock();
      var cell = cellFromEvent(e);
      if (!cell) return;
      // 动画/AI 期间不丢点击：缓存最后一次，输入就绪后自动执行
      if (busy || (opts.isBlocked && opts.isBlocked())) { pendingCell = cell; return; }
      if (opts.onCellClick) opts.onCellClick(cell);
    });
    canvas.addEventListener('pointerleave', function () {
      hoverCell = null;
      fx.hover.visible = false;
    });

    return {
      tweener: tweener,
      fx: fx,
      showHover: showHover, showSelection: showSelection, showLegalMoves: showLegalMoves,
      markLastMove: markLastMove, setCheckGlow: setCheckGlow, setFollowLight: setFollowLight,
      setAlarmLight: setAlarmLight, animateMove: animateMove, resetPiece: resetPiece,
      clearIndicators: function () {
        fx.select.visible = false;
        fx.dots.clear(); fx.caps.clear(); fx.trajectory.clear();
        fx.trajectory.userData.arcs = [];
        fx.hover.visible = false;
      },
      flushPending: function () { // 执行缓存的点击（若有）
        if (!pendingCell) return;
        var cell = pendingCell;
        pendingCell = null;
        if (opts.onCellClick) opts.onCellClick(cell);
      },
      clearPending: function () { pendingCell = null; },
      isBusy: function () { return busy; },
      setBusy: function (v) { busy = v; }
    };
  }

  global.XQ.interaction = { createInteraction: createInteraction, createTweener: createTweener };
})(typeof window !== 'undefined' ? window : globalThis);
