import React from "react";
import { Chess } from "chess.js";
import { PUZZLES } from "../chess/puzzles";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function buildChessFromMoves(fen, moves) {
  const c = new Chess(fen);
  for (let i = 0; i < moves.length; i += 1) {
    c.move(moves[i]);
  }
  return c;
}

function getInCheckSquare(chess) {
  if (!(chess.isCheck && chess.isCheck())) return null;
  const board = chess.board();
  const turn = chess.turn();
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const p = board[row][col];
      if (p && p.type === "k" && p.color === turn) {
        const rank = 8 - row;
        return `${FILES[col]}${rank}`;
      }
    }
  }
  return null;
}

function needsPromotion(from, to, chess) {
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

function uciOfMove(from, to, promotion) {
  return `${from}${to}${promotion || ""}`.toLowerCase();
}

/**
 * PUBLIC_INTERFACE
 * Hook managing a local puzzle session:
 * - loads puzzles (FEN + expected UCI move)
 * - validates the first user move
 * - provides feedback + solved state
 */
export function usePuzzleSession() {
  const [puzzleIndex, setPuzzleIndex] = React.useState(0);
  const puzzle = PUZZLES[puzzleIndex] || PUZZLES[0];

  const [moves, setMoves] = React.useState([]);
  const [selectedSquare, setSelectedSquare] = React.useState(null);
  const [legalTargets, setLegalTargets] = React.useState([]);
  const [lastMove, setLastMove] = React.useState(null);

  const [feedback, setFeedback] = React.useState("");
  const [solved, setSolved] = React.useState(false);
  const [hintShown, setHintShown] = React.useState(false);

  const [promotionState, setPromotionState] = React.useState({
    open: false,
    from: null,
    to: null,
    choices: ["q", "r", "b", "n"],
  });

  const chess = React.useMemo(() => buildChessFromMoves(puzzle.fen, moves), [puzzle.fen, moves]);
  const board = React.useMemo(() => chess.board(), [chess]);
  const inCheckSquare = React.useMemo(() => getInCheckSquare(chess), [chess]);

  const statusLine = React.useMemo(() => {
    if (solved) return "Solved!";
    return puzzle.prompt || "Find the best move.";
  }, [solved, puzzle.prompt]);

  function syncLegalTargets(nextSelected) {
    if (!nextSelected) {
      setLegalTargets([]);
      return;
    }
    try {
      const verboseMoves = chess.moves({ square: nextSelected, verbose: true });
      setLegalTargets(verboseMoves.map((m) => m.to));
    } catch (e) {
      setLegalTargets([]);
    }
  }

  function resetPosition() {
    setMoves([]);
    setSelectedSquare(null);
    setLegalTargets([]);
    setLastMove(null);
    setFeedback("");
    setSolved(false);
    setHintShown(false);
    setPromotionState({ open: false, from: null, to: null, choices: ["q", "r", "b", "n"] });
  }

  function loadPuzzleById(id) {
    const idx = PUZZLES.findIndex((p) => p.id === id);
    if (idx >= 0) setPuzzleIndex(idx);
    resetPosition();
  }

  function nextPuzzle() {
    setPuzzleIndex((prev) => (prev + 1) % PUZZLES.length);
    resetPosition();
  }

  function revealHint() {
    setHintShown(true);
    setFeedback(puzzle.hint || "Look for checks, captures, and threats.");
  }

  function undo() {
    if (moves.length === 0) return;
    setMoves((prev) => prev.slice(0, prev.length - 1));
    setSelectedSquare(null);
    setLegalTargets([]);
    setFeedback("");
    setSolved(false);
    setHintShown(false);
  }

  function cancelPromotion() {
    setPromotionState({ open: false, from: null, to: null, choices: ["q", "r", "b", "n"] });
  }

  function confirmPromotion(choice) {
    if (!promotionState.open) return;
    const { from, to } = promotionState;
    if (!from || !to) return;
    setPromotionState({ open: false, from: null, to: null, choices: ["q", "r", "b", "n"] });
    tryMove(from, to, choice);
  }

  function tryMove(from, to, promotion) {
    if (solved) return false;
    if (!from || !to) return false;

    // If requires promotion and no choice provided, open picker.
    if (needsPromotion(from, to, chess) && !promotion) {
      setPromotionState({ open: true, from, to, choices: getPromotionChoices(from, to, chess) });
      return false;
    }

    const moveObj = { from, to };
    if (promotion) moveObj.promotion = promotion;

    const result = chess.move(moveObj);
    if (!result) return false;

    const userUci = uciOfMove(from, to, promotion);
    const expected = (puzzle.solutionUci || "").toLowerCase();

    setMoves((prev) => prev.concat([moveObj]));
    setLastMove({ from, to });
    setSelectedSquare(null);
    setLegalTargets([]);

    if (moves.length === 0) {
      // Validate FIRST move against puzzle expectation.
      if (userUci === expected) {
        setSolved(true);
        setFeedback("Correct move.");
      } else {
        setFeedback("Not quite. Try again (or use Undo/Reset).");
      }
    } else {
      setFeedback("Puzzle expects the first move only in this version.");
    }

    return true;
  }

  function handleSquareClick(square, autoQueen) {
    if (promotionState.open) return;
    if (solved) return;

    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece) return;
      if (piece.color !== chess.turn()) return;

      setSelectedSquare(square);
      syncLegalTargets(square);
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    if (legalTargets.includes(square)) {
      const promoNeeded = needsPromotion(selectedSquare, square, chess);
      if (promoNeeded && autoQueen) {
        tryMove(selectedSquare, square, "q");
        return;
      }
      tryMove(selectedSquare, square, null);
      return;
    }

    const clickedPiece = chess.get(square);
    if (clickedPiece && clickedPiece.color === chess.turn()) {
      setSelectedSquare(square);
      syncLegalTargets(square);
      return;
    }

    setSelectedSquare(null);
    setLegalTargets([]);
  }

  React.useEffect(() => {
    if (selectedSquare) syncLegalTargets(selectedSquare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSquare, puzzleIndex, moves.length]);

  const puzzleState = React.useMemo(() => {
    return {
      puzzle,
      board,
      chess,
      selectedSquare,
      legalTargets,
      lastMove,
      inCheckSquare,
      feedback,
      solved,
      locked: false,
      hintShown,
      canUndo: moves.length > 0,
      statusLine,
    };
  }, [
    puzzle,
    board,
    chess,
    selectedSquare,
    legalTargets,
    lastMove,
    inCheckSquare,
    feedback,
    solved,
    hintShown,
    moves.length,
    statusLine,
  ]);

  const puzzleActions = React.useMemo(() => {
    return {
      // PUBLIC_INTERFACE
      resetPosition,
      // PUBLIC_INTERFACE
      loadPuzzleById,
      // PUBLIC_INTERFACE
      nextPuzzle,
      // PUBLIC_INTERFACE
      revealHint,
      // PUBLIC_INTERFACE
      undo,
      // PUBLIC_INTERFACE
      cancelPromotion,
      // PUBLIC_INTERFACE
      confirmPromotion,
      // PUBLIC_INTERFACE
      handleSquareClick,
    };
  }, []);

  return {
    puzzleState,
    puzzleActions,
    puzzlePromotionState: promotionState,
    puzzleSetSelectedSquare: setSelectedSquare,
  };
}
