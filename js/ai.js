/*
 * ai.js — 象棋 AI：Alpha-Beta 搜索 + 静态搜索 + 迭代加深 + 时间控制
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;
  var RED = XQ.RED, BLACK = XQ.BLACK;

  var VAL = { 1: 10000, 2: 180, 3: 180, 4: 420, 5: 900, 6: 470, 7: 100 };

  /* 位置价值表（红方视角，row 0=黑底线…row 9=红底线；黑方镜像） */
  function pst(kind, r, c) {
    var central = 3 - Math.abs(c - 4);            // 中线加成
    switch (kind) {
      case 4: // 马：越前越活，宜在中路
        return (r <= 4 ? 26 : 8) + central * 5 + (r >= 7 ? -8 : 0);
      case 5: // 车：中路与前沿
        return central * 6 + (r <= 4 ? 14 : 0);
      case 6: // 炮：中路、前沿
        return central * 7 + (r <= 4 ? 12 : 0) + (r >= 6 ? -6 : 0);
      case 7: // 兵：过河大增，逼近将营
        if (r <= 4) return 90 + (4 - r) * 16 + central * 4;
        if (r <= 6) return 10 + (6 - r) * 6;
        return 0;
      case 2: case 3: return 4;                   // 士象：轻微位置差
      default: return 0;
    }
  }

  function evaluate(game) {
    var score = 0, b = game.board;
    for (var i = 0; i < 90; i++) {
      var p = b[i];
      if (p === 0) continue;
      var kind = p & 7, side = p < 8 ? RED : BLACK;
      var v = VAL[kind] + pst(kind, (i / 9) | 0, i % 9);
      score += side === RED ? v : -v;
    }
    return score; // 红正黑负
  }

  function orderedMoves(game) {
    var moves = game.pseudoMoves(game.side);
    var side = game.side;
    var scored = moves.map(function (m) {
      var cap = game.board[m.to];
      var s = 0;
      if (cap) s = 1000 + VAL[cap & 7] * 10 - VAL[m.piece & 7];
      return { m: m, s: s };
    });
    scored.sort(function (a, b2) { return b2.s - a.s; });
    return scored.map(function (x) { return x.m; });
  }

  function quiesce(game, alpha, beta, deadline, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw ABORT;
    var side = game.side;
    var stand = evaluate(game) * (side === RED ? 1 : -1);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 6) return alpha;
    var moves = game.pseudoMoves(side);
    moves.sort(function (a, b2) {
      var ca = game.board[a.to], cb = game.board[b2.to];
      return (cb ? VAL[cb & 7] : 0) - (ca ? VAL[ca & 7] : 0);
    });
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!game.board[m.to]) continue; // 只搜吃子
      var u = game._apply(m);
      if (game.inCheck(side)) { game._revert(u); continue; }
      var sc = -quiesce(game, -beta, -alpha, deadline, ply + 1);
      game._revert(u);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  var ABORT = { abort: true };
  var nodes = 0;

  function search(game, depth, alpha, beta, deadline, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw ABORT;
    var side = game.side;
    var moves = orderedMoves(game);
    var legal = 0, best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var u = game._apply(moves[i]);
      if (game.inCheck(side)) { game._revert(u); continue; }
      legal++;
      var sc;
      if (depth <= 1) sc = -quiesce(game, -beta, -alpha, deadline, 0);
      else sc = -search(game, depth - 1, -beta, -alpha, deadline, ply + 1);
      game._revert(u);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break; // 剪枝
    }
    if (legal === 0) return game.inCheck(side) ? -30000 + ply : 0; // 被将死/困毙
    return best;
  }

  var LEVELS = {
    easy: { depth: 2, time: 350, noise: 130 },
    normal: { depth: 4, time: 900, noise: 0 },
    hard: { depth: 6, time: 2200, noise: 0 }
  };

  /* 选择一步棋：返回 move 对象（调用方需用 game.makeMove 执行） */
  function chooseMove(game, level) {
    var cfg = LEVELS[level] || LEVELS.normal;
    var moves = game.legalMoves();
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];
    var deadline = Date.now() + cfg.time;
    nodes = 0;
    var bestMove = moves[0], bestScore = -Infinity;
    var scored = [];
    for (var d = 1; d <= cfg.depth; d++) {
      try {
        scored = [];
        var alpha = -Infinity;
        for (var i = 0; i < moves.length; i++) {
          var u = game._apply(moves[i]);
          var sc;
          if (game.inCheck(game.side ^ 1)) { game._revert(u); scored.push({ m: moves[i], s: -Infinity }); continue; }
          if (d <= 1) sc = -quiesce(game, -Infinity, Infinity, deadline, 0);
          else sc = -search(game, d - 1, -Infinity, -alpha, deadline, 1);
          game._revert(u);
          if (game.inCheck(game.side)) sc = -30000; // 送将非法（双保险）
          scored.push({ m: moves[i], s: sc });
          if (sc > alpha) alpha = sc;
        }
        scored.sort(function (a, b2) { return b2.s - a.s; });
        bestMove = scored[0].m;
        bestScore = scored[0].s;
        // 简单难度：在接近最优的着法中随机
        if (cfg.noise) {
          var pool = scored.filter(function (x) { return x.s > bestScore - cfg.noise; });
          bestMove = pool[Math.floor(Math.random() * pool.length)].m;
        }
        if (Math.abs(bestScore) > 29000) break; // 已算到将死
        if (Date.now() > deadline) break;
      } catch (e) {
        if (e !== ABORT) throw e;
        break; // 超时：使用上一轮完整结果
      }
    }
    return bestMove;
  }

  global.XQ.ai = { chooseMove: chooseMove, evaluate: evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
