import React from "react";
import { Chess } from "chess.js";

function buildChess(startFen, moves, ply) {
  const c = startFen ? new Chess(startFen) : new Chess();
  for (let i = 0; i < ply; i += 1) {
    c.move(moves[i]);
  }
  return c;
}

function getSquareTargets(chess, square) {
  try {
    const verboseMoves = chess.moves({ square, verbose: true });
    return verboseMoves.map((m) => m.to);
  } catch (e) {
    return [];
  }
}

function computeGameResult(chess) {
  // Returns a stable object describing the position state.
  const isCheck = typeof chess.isCheck === "function" ? chess.isCheck() : false;

  if (typeof chess.isGameOver === "function" && chess.isGameOver()) {
    if (chess.isCheckmate && chess.isCheckmate()) {
      const loser = chess.turn(); // side to move is checkmated
      const winner = loser === "w" ? "b" : "w";
      return {
        state: "ended",
        isCheck,
        winner,
        reason: "checkmate",
        reasonLabel: "Checkmate",
      };
    }

    // chess.js draw covers stalemate, repetition, insufficient material, 50-move, etc.
    if (chess.isDraw && chess.isDraw()) {
      // Provide more specific label when possible
      let reasonLabel = "Draw";
      if (chess.isStalemate && chess.isStalemate()) reasonLabel = "Stalemate";
      else if (chess.isThreefoldRepetition && chess.isThreefoldRepetition()) reasonLabel = "Threefold repetition";
      else if (chess.isInsufficientMaterial && chess.isInsufficientMaterial()) reasonLabel = "Insufficient material";
      return {
        state: "ended",
        isCheck,
        winner: null,
        reason: "draw",
        reasonLabel,
      };
    }

    // Fallback if chess.js says game over without details.
    return {
      state: "ended",
      isCheck,
      winner: null,
      reason: "ended",
      reasonLabel: "Game over",
    };
  }

  return {
    state: "ongoing",
    isCheck,
    winner: null,
    reason: null,
    reasonLabel: null,
  };
}

function getInCheckSquare(chess) {
  if (!(chess.isCheck && chess.isCheck())) return null;
  // Find king square for side to move.
  const board = chess.board();
  const turn = chess.turn();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const p = board[row][col];
      if (p && p.type === "k" && p.color === turn) {
        const rank = 8 - row;
        return `${files[col]}${rank}`;
      }
    }
  }
  return null;
}

function needsPromotion(from, to, chess) {
  // If there are verbose moves from square that go to 'to' with different promotion values, we need a choice.
  const verboseMoves = chess.moves({ square: from, verbose: true });
  const promotionMoves = verboseMoves.filter((m) => m.to === to && m.promotion);
  return promotionMoves.length > 0;
}

function getPromotionChoices(from, to, chess) {
  const verboseMoves = chess.moves({ square: from, verbose: true });
  const promotionMoves = verboseMoves.filter((m) => m.to === to && m.promotion);
  const unique = Array.from(new Set(promotionMoves.map((m) => m.promotion)));
  return unique.length ? unique : ["q", "r", "b", "n"];
}

function clampMs(ms) {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms));
}

function makeInitialClocks(initialSeconds, incrementSeconds) {
  const enabled = initialSeconds > 0;
  const initialMs = clampMs(initialSeconds * 1000);
  const incrementMs = clampMs(incrementSeconds * 1000);
  return {
    enabled,
    initialMs,
    incrementMs,
    wMs: initialMs,
    bMs: initialMs,
    activeColor: "w",
    running: false,
  };
}

/**
 * PUBLIC_INTERFACE
 * Hook implementing a local chess game with:
 * - legal moves + check/draw/mate detection
 * - move history + undo/redo + jump
 * - clocks with increment (optional)
 * - promotion picker
 */
export function useChessGame({ initialSeconds, incrementSeconds, autoStartClocks }) {
  const [startFen] = React.useState(null); // standard chess for now
  const [moves, setMoves] = React.useState([]);
  const [currentPly, setCurrentPly] = React.useState(0);

  const [selectedSquare, setSelectedSquare] = React.useState(null);
  const [legalTargets, setLegalTargets] = React.useState([]);

  const [promotionState, setPromotionState] = React.useState({
    open: false,
    from: null,
    to: null,
    choices: ["q", "r", "b", "n"],
  });

  const [clocks, setClocks] = React.useState(() => makeInitialClocks(initialSeconds, incrementSeconds));
  const [clockTimeline, setClockTimeline] = React.useState(() => [makeInitialClocks(initialSeconds, incrementSeconds)]);
  const lastTickRef = React.useRef(null);

  // Rebuild chess position for current ply.
  const chess = React.useMemo(() => buildChess(startFen, moves, currentPly), [startFen, moves, currentPly]);
  const board = React.useMemo(() => chess.board(), [chess]);
  const turn = React.useMemo(() => chess.turn(), [chess]);
  const inCheckSquare = React.useMemo(() => getInCheckSquare(chess), [chess]);

  const resultBase = React.useMemo(() => computeGameResult(chess), [chess]);
  const gameIdRef = React.useRef(`${Date.now()}_${Math.random().toString(16).slice(2)}`);

  // If clock flags, treat as game end (timeout) and stop clocks.
  React.useEffect(() => {
    if (!clocks.enabled) return;
    if (resultBase.state === "ended") return;

    if (clocks.wMs <= 0 || clocks.bMs <= 0) {
      const flagged = clocks.wMs <= 0 ? "w" : "b";
      const winner = flagged === "w" ? "b" : "w";
      setClocks((prev) => ({ ...prev, running: false, wMs: Math.max(0, prev.wMs), bMs: Math.max(0, prev.bMs) }));
      // We don't mutate moves; result is derived. We'll expose timeout result via viewState below.
      // (This keeps the hook deterministic and avoids chess.js special casing.)
      // The "timeout" result is handled in viewState.result below.
    }
  }, [clocks.enabled, clocks.wMs, clocks.bMs, resultBase.state]);

  // Timer ticking effect.
  React.useEffect(() => {
    if (!clocks.enabled || !clocks.running) return undefined;

    // Pause ticking if game ended by board state.
    if (resultBase.state === "ended") return undefined;

    lastTickRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const prevTs = lastTickRef.current || now;
      const elapsed = Math.max(0, now - prevTs);
      lastTickRef.current = now;

      setClocks((prev) => {
        if (!prev.running || !prev.enabled) return prev;

        if (prev.activeColor === "w") {
          const nextW = clampMs(prev.wMs - elapsed);
          return { ...prev, wMs: nextW };
        }
        const nextB = clampMs(prev.bMs - elapsed);
        return { ...prev, bMs: nextB };
      });
    }, 250);

    return () => window.clearInterval(id);
  }, [clocks.enabled, clocks.running, clocks.activeColor, resultBase.state]);

  function pauseClockAndClearTick() {
    setClocks((prev) => ({ ...prev, running: false }));
    lastTickRef.current = null;
  }

  function syncLegalTargets(nextSelected, chessForTargets) {
    if (!nextSelected) {
      setLegalTargets([]);
      return;
    }
    const targets = getSquareTargets(chessForTargets, nextSelected);
    setLegalTargets(targets);
  }

  function rebuildTimelineAfterReset(nextClocks) {
    setClockTimeline([nextClocks]);
  }

  function settleClockBeforeMove() {
    // Apply any small residual elapsed time since last tick to avoid "free" time on move.
    if (!clocks.enabled || !clocks.running) return;
    const now = Date.now();
    const prevTs = lastTickRef.current || now;
    const elapsed = Math.max(0, now - prevTs);
    if (elapsed <= 0) return;
    lastTickRef.current = now;

    setClocks((prev) => {
      if (!prev.running || !prev.enabled) return prev;
      if (prev.activeColor === "w") return { ...prev, wMs: clampMs(prev.wMs - elapsed) };
      return { ...prev, bMs: clampMs(prev.bMs - elapsed) };
    });
  }

  function truncateToCurrentPly() {
    if (currentPly === moves.length) return { nextMoves: moves, nextTimeline: clockTimeline };
    const nextMoves = moves.slice(0, currentPly);
    const nextTimeline = clockTimeline.slice(0, currentPly + 1);
    return { nextMoves, nextTimeline };
  }

  function commitMoveAndClocks(moveObj, moveResult) {
    const { nextMoves, nextTimeline } = truncateToCurrentPly();
    const appended = nextMoves.concat([
      {
        from: moveObj.from,
        to: moveObj.to,
        promotion: moveObj.promotion || null,
        san: moveResult.san,
        color: moveResult.color,
      },
    ]);

    const mover = moveResult.color; // side who just moved
    const nextTurn = mover === "w" ? "b" : "w";

    setMoves(appended);
    setCurrentPly((prev) => prev + 1);

    setClockTimeline(() => {
      // snapshot AFTER move + increment + side-to-move switched
      const baseSnapshot = nextTimeline[currentPly] || clocks;
      const wBase = baseSnapshot.wMs;
      const bBase = baseSnapshot.bMs;

      const wInc = clocks.incrementMs;
      const bInc = clocks.incrementMs;

      const withInc = {
        ...baseSnapshot,
        wMs: mover === "w" ? clampMs(wBase + wInc) : wBase,
        bMs: mover === "b" ? clampMs(bBase + bInc) : bBase,
        activeColor: nextTurn,
        running: baseSnapshot.enabled && (baseSnapshot.running || autoStartClocks),
      };

      return nextTimeline.concat([withInc]);
    });

    setClocks((prev) => {
      const wAfter = mover === "w" ? clampMs(prev.wMs + prev.incrementMs) : prev.wMs;
      const bAfter = mover === "b" ? clampMs(prev.bMs + prev.incrementMs) : prev.bMs;

      return {
        ...prev,
        wMs: wAfter,
        bMs: bAfter,
        activeColor: nextTurn,
        running: prev.enabled && (prev.running || autoStartClocks),
      };
    });

    lastTickRef.current = Date.now();
  }

  const actions = React.useMemo(() => {
    return {
      // PUBLIC_INTERFACE
      resetGame() {
        pauseClockAndClearTick();
        gameIdRef.current = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const nextClocks = makeInitialClocks(initialSeconds, incrementSeconds);
        setMoves([]);
        setCurrentPly(0);
        setSelectedSquare(null);
        setLegalTargets([]);
        setPromotionState({ open: false, from: null, to: null, choices: ["q", "r", "b", "n"] });

        setClocks(nextClocks);
        rebuildTimelineAfterReset(nextClocks);
      },

      // PUBLIC_INTERFACE
      resetClocks() {
        pauseClockAndClearTick();
        const snap = makeInitialClocks(initialSeconds, incrementSeconds);

        // Keep current ply and board; only reset the time for current ply snapshot.
        setClocks((prev) => ({ ...prev, ...snap, activeColor: clocks.activeColor, running: false }));
        setClockTimeline((prev) => {
          const next = prev.slice();
          next[currentPly] = { ...next[currentPly], ...snap, activeColor: clocks.activeColor, running: false };
          return next;
        });
      },

      // PUBLIC_INTERFACE
      setClocksRunning(nextRunning) {
        if (!clocks.enabled) return;
        if (resultBase.state === "ended") return;

        setClocks((prev) => ({ ...prev, running: Boolean(nextRunning) }));
        lastTickRef.current = Date.now();
      },

      // PUBLIC_INTERFACE
      undo() {
        if (currentPly <= 0) return;
        pauseClockAndClearTick();

        const nextPly = currentPly - 1;
        setCurrentPly(nextPly);
        setSelectedSquare(null);
        setLegalTargets([]);

        const snap = clockTimeline[nextPly];
        if (snap) setClocks({ ...snap, running: false });
      },

      // PUBLIC_INTERFACE
      redo() {
        if (currentPly >= moves.length) return;
        pauseClockAndClearTick();

        const nextPly = currentPly + 1;
        setCurrentPly(nextPly);
        setSelectedSquare(null);
        setLegalTargets([]);

        const snap = clockTimeline[nextPly];
        if (snap) setClocks({ ...snap, running: false });
      },

      // PUBLIC_INTERFACE
      cancelPromotion() {
        setPromotionState({ open: false, from: null, to: null, choices: ["q", "r", "b", "n"] });
      },

      // PUBLIC_INTERFACE
      confirmPromotion(choice) {
        if (!promotionState.open) return;
        const from = promotionState.from;
        const to = promotionState.to;
        if (!from || !to) return;

        setPromotionState({ open: false, from: null, to: null, choices: ["q", "r", "b", "n"] });
        this.tryMove(from, to, choice, { source: "promotion" });
      },

      // PUBLIC_INTERFACE
      tryMove(from, to, promotion, meta) {
        if (!from || !to) return false;

        // Prevent moves while exploring old history unless you're at the end;
        // if you do move from history, we branch by truncating to current ply.
        const chessForMove = buildChess(startFen, moves, currentPly);

        if (resultBase.state === "ended") return false;
        if (clocks.enabled && (clocks.wMs <= 0 || clocks.bMs <= 0)) return false;

        // If this move requires promotion and user didn't supply it, open promotion modal
        const requires = needsPromotion(from, to, chessForMove);
        if (requires && !promotion) {
          setPromotionState({
            open: true,
            from,
            to,
            choices: getPromotionChoices(from, to, chessForMove),
          });
          return false;
        }

        settleClockBeforeMove();

        const moveObj = { from, to };
        if (promotion) moveObj.promotion = promotion;

        const result = chessForMove.move(moveObj);
        if (!result) return false;

        commitMoveAndClocks(moveObj, result);

        // Reset selection after a successful move.
        setSelectedSquare(null);
        setLegalTargets([]);

        // If game ended by board state, stop the clock.
        const nextChess = buildChess(startFen, moves.slice(0, currentPly).concat([moveObj]), currentPly + 1);
        const nextResult = computeGameResult(nextChess);
        if (nextResult.state === "ended") {
          setClocks((prev) => ({ ...prev, running: false }));
        }

        return true;
      },

      // PUBLIC_INTERFACE
      handleSquareClick(square, autoQueen) {
        if (!square) return;
        if (promotionState.open) return;

        // Prevent interaction if game ended or timeout
        if (resultBase.state === "ended") return;
        if (clocks.enabled && (clocks.wMs <= 0 || clocks.bMs <= 0)) return;

        const chessForTargets = buildChess(startFen, moves, currentPly);

        // If nothing selected, select if there is a piece to move of side-to-move.
        if (!selectedSquare) {
          const piece = chessForTargets.get(square);
          if (!piece) return;
          if (piece.color !== chessForTargets.turn()) return;

          setSelectedSquare(square);
          syncLegalTargets(square, chessForTargets);
          return;
        }

        // Clicking selected square toggles it off.
        if (selectedSquare === square) {
          setSelectedSquare(null);
          setLegalTargets([]);
          return;
        }

        // Attempt move if target is legal.
        if (legalTargets.includes(square)) {
          // If promotion and autoQueen enabled, attempt with 'q' directly.
          const needs = needsPromotion(selectedSquare, square, chessForTargets);
          if (needs && autoQueen) {
            this.tryMove(selectedSquare, square, "q", { source: "autoQueen" });
            return;
          }

          this.tryMove(selectedSquare, square, null, { source: "click" });
          return;
        }

        // Otherwise: switch selection if user clicked another own piece.
        const clickedPiece = chessForTargets.get(square);
        if (clickedPiece && clickedPiece.color === chessForTargets.turn()) {
          setSelectedSquare(square);
          syncLegalTargets(square, chessForTargets);
          return;
        }

        // Otherwise clear selection.
        setSelectedSquare(null);
        setLegalTargets([]);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoStartClocks,
    clocks,
    clockTimeline,
    currentPly,
    incrementSeconds,
    initialSeconds,
    legalTargets,
    moves,
    promotionState,
    resultBase.state,
    selectedSquare,
    startFen,
  ]);

  // PUBLIC_INTERFACE
  function jumpToPly(ply) {
    const clamped = Math.max(0, Math.min(moves.length, ply));
    pauseClockAndClearTick();

    setCurrentPly(clamped);
    setSelectedSquare(null);
    setLegalTargets([]);

    const snap = clockTimeline[clamped];
    if (snap) setClocks({ ...snap, running: false });
  }

  // Compute last move + legal targets for current selection.
  const lastMove = React.useMemo(() => {
    if (currentPly <= 0) return null;
    const m = moves[currentPly - 1];
    if (!m) return null;
    return { from: m.from, to: m.to };
  }, [moves, currentPly]);

  React.useEffect(() => {
    if (!selectedSquare) return;
    const chessForTargets = buildChess(startFen, moves, currentPly);
    syncLegalTargets(selectedSquare, chessForTargets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSquare, startFen, moves, currentPly]);

  // Compose a final "result" which also considers timeouts.
  const timeoutResult = React.useMemo(() => {
    if (!clocks.enabled) return null;
    if (resultBase.state === "ended") return null;
    if (clocks.wMs > 0 && clocks.bMs > 0) return null;

    const flagged = clocks.wMs <= 0 ? "w" : "b";
    const winner = flagged === "w" ? "b" : "w";
    return {
      state: "ended",
      isCheck: false,
      winner,
      reason: "timeout",
      reasonLabel: "Timeout",
    };
  }, [clocks.enabled, clocks.wMs, clocks.bMs, resultBase.state]);

  const finalResult = timeoutResult || resultBase;

  const viewState = React.useMemo(() => {
    return {
      chess,
      board,
      turn,
      selectedSquare,
      legalTargets,
      lastMove,
      inCheckSquare,
      isCheck: finalResult.isCheck,
      moves,
      currentPly,
      result: {
        ...finalResult,
        gameId: finalResult.state === "ended" ? gameIdRef.current : null,
        reasonLabel: finalResult.state === "ended" ? finalResult.reasonLabel : null,
      },
    };
  }, [
    board,
    chess,
    currentPly,
    finalResult,
    inCheckSquare,
    lastMove,
    legalTargets,
    moves,
    selectedSquare,
    turn,
  ]);

  // PUBLIC_INTERFACE
  function setClocksRunning(nextRunning) {
    actions.setClocksRunning(nextRunning);
  }

  return {
    viewState,
    actions,
    promotionState,
    clocks,
    setClocksRunning,
    jumpToPly,
    setSelectedSquare,
  };
}
