/*
 * game.js — 游戏主控制器：回合流程、棋子对象管理、AI 调度、终局处理
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;
  var RED = XQ.RED, BLACK = XQ.BLACK;
  var rowOf = XQ.rowOf, colOf = XQ.colOf, idxOf = XQ.idxOf;

  var world, controls, inter, game;
  var piecesAt = [];      // [row][col] → rec | null
  var piecesById = {};    // id → rec
  var selected = null;    // {row, col}
  var legalTargets = [];
  var mode = 'ai', level = 'normal', humanSide = RED;
  var aiThinking = false;
  var checkKingCell = null;
  var inputBlocked = false; // 动画/AI 期间阻塞输入（点击入队不丢弃）

  /* ---------------- 初始化 ---------------- */
  function boot(canvas) {
    world = XQ.scene3d.createWorld(canvas);
    controls = XQ.controls3d.createControls(world.camera, canvas);
    inter = XQ.interaction.createInteraction(world, canvas, {
      onCellClick: onCellClick,
      onHover: onHover,
      isBlocked: function () { return inputBlocked; }
    });
    world.onTick = function (t, dt) {
      controls.update(dt);
      inter.tweener.update(dt);
      animateIndicators(t);
    };
    global.__xqWorld = world; // 调试/测试挂钩
    global.__xqControls = controls;
    global.__xqInter = inter;
    global.__xqGame = function () { return game; }; // 测试用：当前规则实例
    global.__xqState = function () { // 测试用状态快照
      return {
        turn: game.side, history: game.history.length, result: game.result,
        selected: selected, mode: mode, humanSide: humanSide,
        piecesAt: piecesAt.map(function (row) {
          return row.map(function (rec) { return rec ? (rec.side === RED ? 'r' : 'b') + rec.kind : '..'; }).join('');
        })
      };
    };
    bindUI();
    newGame();
  }

  function bindUI() {
    var $ = function (id) { return document.getElementById(id); };
    $('btn-new').onclick = function () { XQ.audio.unlock(); newGame(); };
    $('btn-again').onclick = function () { XQ.ui.hideResult(); newGame(); };
    $('btn-undo').onclick = function () { XQ.audio.unlock(); undo(); };
    $('btn-flip').onclick = function () { controls.flip(); };
    $('btn-reset-view').onclick = function () { controls.reset(); };
    // 浮动缩放控件（放大/缩小）
    $('btn-zoom-in').onclick = function () { XQ.audio.unlock(); controls.zoomBy(1 / 0.82); XQ.audio.select(); };
    $('btn-zoom-out').onclick = function () { XQ.audio.unlock(); controls.zoomBy(0.82); XQ.audio.select(); };
    // 键盘 +/- 缩放（焦点不在输入框时）
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '+' || e.key === '=') { controls.zoomBy(1 / 0.82); }
      else if (e.key === '-' || e.key === '_') { controls.zoomBy(0.82); }
    });
    $('btn-rules').onclick = function () { XQ.ui.showRules(); };
    $('btn-close-rules').onclick = function () { XQ.ui.hideRules(); };
    $('btn-sound').onclick = function () {
      var on = !XQ.audio.isEnabled();
      XQ.audio.setEnabled(on);
      XQ.ui.setSoundBtn(on);
      if (on) { XQ.audio.unlock(); XQ.audio.select(); }
    };
    $('sel-mode').onchange = function () { mode = this.value; XQ.ui.setModeVisible(mode); newGame(); };
    $('sel-level').onchange = function () { level = this.value; };
    $('sel-side').onchange = function () { humanSide = this.value === 'red' ? RED : BLACK; newGame(); };
    XQ.ui.setModeVisible(mode);
    // 侧卡片展开/收起：点击标题栏切换
    Array.prototype.forEach.call(document.querySelectorAll('#panel .card-head'), function (head) {
      head.addEventListener('click', function () {
        head.parentElement.classList.toggle('collapsed');
      });
    });
  }

  /* ---------------- 新局 ---------------- */
  function newGame() {
    game = new XQ.Xiangqi();
    selected = null; legalTargets = []; aiThinking = false; checkKingCell = null;
    inputBlocked = false;
    if (inter) inter.clearPending();
    // 清除旧棋子
    for (var id in piecesById) {
      world.scene.remove(piecesById[id].group);
    }
    piecesById = {};
    piecesAt = [];
    for (var r = 0; r < 10; r++) { piecesAt.push(new Array(9).fill(null)); }
    // 布子
    var n = 0;
    for (var i = 0; i < 90; i++) {
      var p = game.board[i];
      if (!p) continue;
      var kind = p & 7, side = p < 8 ? RED : BLACK;
      var rec = {
        id: 'p' + (n++), kind: kind, side: side,
        row: rowOf(i), col: colOf(i),
        group: XQ.pieces3d.createPiece(kind, side),
        scale: XQ.pieces3d.SCALE[kind] || 1,
        captured: false
      };
      rec.group.userData.baseRotY = side === RED ? 0 : Math.PI;
      rec.group.position.copy(world.cellToPos(rec.row, rec.col));
      world.scene.add(rec.group);
      piecesById[rec.id] = rec;
      piecesAt[rec.row][rec.col] = rec;
    }
    inter.clearIndicators();
    inter.setFollowLight(null);
    inter.setAlarmLight(null, false);
    inter.setCheckGlow(null, false);
    refreshUI();
    XQ.ui.setHint('点击棋子查看可走位置 · 拖动旋转视角 · 滚轮缩放 · 右键拖动平移');
    if (mode === 'ai' && game.side !== humanSide) scheduleAI();
  }

  /* ---------------- 交互 ---------------- */
  function pieceAt(cell) { return piecesAt[cell.row] && piecesAt[cell.row][cell.col]; }

  function onHover(cell) {
    if (!cell) { inter.showHover(null); return; }
    var rec = pieceAt(cell);
    var interesting = false;
    if (rec && rec.side === game.side && !game.result && !aiThinking && humanCanMove()) interesting = true;
    if (selected) {
      for (var i = 0; i < legalTargets.length; i++) {
        if (legalTargets[i].row === cell.row && legalTargets[i].col === cell.col) { interesting = true; break; }
      }
    }
    if (interesting) { inter.showHover(cell); world.renderer.domElement.style.cursor = 'pointer'; }
    else { inter.showHover(null); world.renderer.domElement.style.cursor = ''; }
  }

  function humanCanMove() {
    return mode === 'pvp' || game.side === humanSide;
  }

  function onCellClick(cell) {
    if (game.result || aiThinking || inter.isBusy()) return;
    if (!humanCanMove()) return;
    var rec = pieceAt(cell);
    if (selected) {
      for (var i = 0; i < legalTargets.length; i++) {
        if (legalTargets[i].row === cell.row && legalTargets[i].col === cell.col) {
          var mv = game.legalMovesFrom(idxOf(selected.row, selected.col))
            .find(function (m) { return rowOf(m.to) === cell.row && colOf(m.to) === cell.col; });
          if (mv) doMove(mv);
          return;
        }
      }
      if (rec && rec.side === game.side) { select(cell); return; }
      // 点了非合法目标：给出明确反馈，避免误以为规则有误
      var clickedEnemy = rec && rec.side !== game.side;
      deselect();
      if (clickedEnemy) {
        XQ.ui.setHint('该敌子不在可吃范围内（炮须隔一子才能吃）· 点击取消选择');
        XQ.audio.select();
      }
      return;
    }
    if (rec && rec.side === game.side) select(cell);
    else if (rec) XQ.ui.setHint('请先选择自己的棋子 · 轮到' + (game.side === RED ? '红' : '黑') + '方行棋');
  }

  function select(cell) {
    deselect();
    var rec = pieceAt(cell);
    if (!rec) { selected = null; return; } // 防御：空格子
    selected = cell;
    var moves = game.legalMovesFrom(idxOf(cell.row, cell.col));
    legalTargets = moves.map(function (m) {
      var t = { row: rowOf(m.to), col: colOf(m.to), capture: game.board[m.to] !== 0 };
      if (t.capture) t.screen = findScreen(cell, t); // 炮架（仅炮吃子时存在）
      return t;
    });
    inter.showSelection(cell);
    inter.showLegalMoves(legalTargets, cell);
    inter.setFollowLight(cell, 1.0);
    XQ.audio.select();
    // 棋子轻抬
    var baseY = world.SURFACE_Y;
    inter.tweener.add(0.16, function (k) {
      rec.group.position.y = baseY + 0.13 * k;
    });
    XQ.ui.setHint('绿点 = 可走 · 橙环 = 可吃 · 金色弧线 = 隔山打牛 · 再次点击取消');
  }

  // 寻找吃子路径上唯一的“炮架”（同行/同列中间有且仅有一子）
  function findScreen(from, to) {
    var cells = [];
    if (from.row === to.row) {
      var lo = Math.min(from.col, to.col) + 1, hi = Math.max(from.col, to.col) - 1;
      for (var c = lo; c <= hi; c++) cells.push({ row: from.row, col: c });
    } else if (from.col === to.col) {
      var lo2 = Math.min(from.row, to.row) + 1, hi2 = Math.max(from.row, to.row) - 1;
      for (var r = lo2; r <= hi2; r++) cells.push({ row: r, col: from.col });
    } else return null;
    var occ = cells.filter(function (cc) { return game.board[idxOf(cc.row, cc.col)] !== 0; });
    return occ.length === 1 ? occ[0] : null;
  }

  function deselect() {
    if (selected) {
      var rec = pieceAt(selected);
      if (rec) {
        var baseY = world.SURFACE_Y, y0 = rec.group.position.y;
        inter.tweener.add(0.16, function (k) { rec.group.position.y = y0 + (baseY - y0) * k; });
      }
    }
    selected = null; legalTargets = [];
    inter.clearIndicators();
    inter.setFollowLight(null);
    XQ.ui.setHint('点击棋子查看可走位置 · 拖动旋转视角 · 滚轮缩放 · 右键拖动平移');
  }

  /* ---------------- 走子 ---------------- */
  function doMove(move) {
    var from = { row: rowOf(move.from), col: colOf(move.from) };
    var to = { row: rowOf(move.to), col: colOf(move.to) };
    var mover = piecesAt[from.row][from.col];
    if (!mover) { console.warn('doMove: 起点无棋子', from); return; } // 防御：状态不同步时中止
    inputBlocked = true;
    var capturedRec = piecesAt[to.row][to.col];
    var rec = game.makeMove(move);
    rec.capturedRec = capturedRec;

    // 更新网格
    piecesAt[from.row][from.col] = null;
    piecesAt[to.row][to.col] = mover;
    if (mover) { mover.row = to.row; mover.col = to.col; }
    if (capturedRec) capturedRec.captured = true;

    deselect();
    inter.markLastMove(from, to);
    if (capturedRec) XQ.audio.capture(); else XQ.audio.move();

    var checkNow = game.inCheck(game.side);
    if (checkNow) {
      var k = game.kingIdx[game.side];
      checkKingCell = { row: rowOf(k), col: colOf(k) };
      inter.setCheckGlow(checkKingCell, true);
      inter.setAlarmLight(checkKingCell, true);
      controls.nudgeShake(0.1);
      XQ.audio.check();
    } else {
      checkKingCell = null;
      inter.setCheckGlow(null, false);
      inter.setAlarmLight(null, false);
    }
    refreshUI(checkNow);

    inter.animateMove(mover, from, to, mover ? mover.kind : 0, capturedRec, function () {
      inputBlocked = false;
      if (game.result) finishGame();
      else if (mode === 'ai' && game.side !== humanSide) scheduleAI();
      else inter.flushPending(); // 执行动画期间缓存的点击
    });
  }

  function scheduleAI() {
    aiThinking = true;
    inputBlocked = true;
    var gameSnapshot = game; // 防止切换模式/新局后旧回调污染新局
    XQ.ui.setThinking(true);
    XQ.ui.setHint('对方正在思索…');
    setTimeout(function () {
      if (game !== gameSnapshot || game.result) { aiThinking = false; inputBlocked = false; XQ.ui.setThinking(false); return; }
      var mv = null;
      try { mv = XQ.ai.chooseMove(game, level); } catch (e) { console.error(e); }
      aiThinking = false;
      XQ.ui.setThinking(false);
      if (game !== gameSnapshot) { inputBlocked = false; return; }
      if (mv) doMove(mv);          // doMove 内部会重新置位 inputBlocked 并在动画结束后 flush
      else {
        inputBlocked = false;
        if (game.result) finishGame();
        else { XQ.ui.setHint('对方无着可走'); inter.flushPending(); }
      }
    }, 420);
  }

  function finishGame() {
    var res = game.result;
    XQ.ui.showResult(res, humanSide, mode);
    if (res.winner === 'draw') XQ.audio.draw();
    else if (mode === 'pvp') XQ.audio.win();
    else XQ.audio[res.winner === humanSide ? 'win' : 'lose']();
    inter.setAlarmLight(null, false);
  }

  /* ---------------- 悔棋 ---------------- */
  function undo() {
    if (aiThinking || inter.isBusy() || inputBlocked || !game.history.length) return;
    inter.clearPending();
    XQ.ui.hideResult();
    while (game.history.length) {
      var rec = undoOne();
      if (mode === 'pvp') break;
      if (game.side === humanSide) break;
    }
    selected = null; legalTargets = [];
    inter.clearIndicators();
    inter.setFollowLight(null);
    inter.setAlarmLight(null, false);
    checkKingCell = null;
    // 恢复上一步标记
    var last = game.history[game.history.length - 1];
    if (last) inter.markLastMove({ row: rowOf(last.move.from), col: colOf(last.move.from) }, { row: rowOf(last.move.to), col: colOf(last.move.to) });
    else { inter.fx.lastFrom.visible = false; inter.fx.lastTo.visible = false; }
    if (game.inCheck(game.side)) {
      var k = game.kingIdx[game.side];
      checkKingCell = { row: rowOf(k), col: colOf(k) };
      inter.setCheckGlow(checkKingCell, true);
      inter.setAlarmLight(checkKingCell, true);
    } else inter.setCheckGlow(null, false);
    refreshUI();
    XQ.ui.setHint('已悔棋 · 点击棋子查看可走位置');
  }

  function undoOne() {
    var rec = game.undoMove();
    if (!rec) return null;
    var to = { row: rowOf(rec.move.to), col: colOf(rec.move.to) };
    var from = { row: rowOf(rec.move.from), col: colOf(rec.move.from) };
    var mover = piecesAt[to.row][to.col];
    if (mover) {
      inter.resetPiece(mover, from);
      piecesAt[to.row][to.col] = null;
      piecesAt[from.row][from.col] = mover;
      mover.row = from.row; mover.col = from.col;
    }
    if (rec.captured && rec.capturedRec) {
      inter.resetPiece(rec.capturedRec, to);
      piecesAt[to.row][to.col] = rec.capturedRec;
      rec.capturedRec.captured = false;
      rec.capturedRec.row = to.row; rec.capturedRec.col = to.col;
    }
    return rec;
  }

  /* ---------------- UI 刷新 ---------------- */
  function refreshUI(alert) {
    XQ.ui.setTurn(game.side, !!alert);
    XQ.ui.setStats(Math.ceil(game.history.length / 2), game.halfmove);
    XQ.ui.renderMoves(game.history);
    XQ.ui.renderCaptured(game.history);
  }

  /* ---------------- 每帧指示动效 ---------------- */
  function animateIndicators(t) {
    var fx = world.fx;
    // 将军红光脉冲
    if (checkKingCell) {
      fx.checkGlow.material.opacity = 0.45 + Math.sin(t * 6) * 0.25;
      world.lights.alarm.intensity = 1.1 + Math.sin(t * 7) * 0.55;
    }
    // 选中环旋转脉冲
    if (fx.select.visible) {
      fx.select.children[0].rotation.z = t * 1.4;
      var s = 1 + Math.sin(t * 4) * 0.06;
      fx.select.children[1].scale.set(s * 1.5, s * 1.5, 1);
    }
    // 合法点浮动
    for (var i = 0; i < fx.dots.children.length; i += 2) {
      var d = fx.dots.children[i];
      d.position.y = world.SURFACE_Y + 0.02 + Math.sin(t * 3 + i) * 0.012;
    }
    for (var j = 0; j < fx.caps.children.length; j += 2) {
      var ring = fx.caps.children[j];
      ring.rotation.z = t * 0.9;
    }
    // 炮弹沿抛物线运动
    var arcs = fx.trajectory.userData.arcs;
    if (arcs) {
      for (var k = 0; k < arcs.length; k++) {
        var arc = arcs[k];
        arc.t = (arc.t + 0.012) % 1;
        var pt = arc.curve.getPoint(arc.t);
        arc.ball.position.copy(pt);
        arc.ball.material.opacity = 0.95 * Math.sin(Math.PI * arc.t);
      }
    }
  }

  XQ.game = { boot: boot, newGame: newGame };
})(typeof window !== 'undefined' ? window : globalThis);
