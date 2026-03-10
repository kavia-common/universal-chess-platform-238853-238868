import React, { useMemo } from "react";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_UNICODE = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

function toSquare(fileIndex, rankNumber) {
  return `${FILES[fileIndex]}${rankNumber}`;
}

function buildSquares(orientation) {
  // chess.js board() is 8 rows (rank 8 -> 1), 8 cols (file a -> h).
  // We'll map display rows/cols to "actual" file/rank depending on orientation.
  const rows = [];
  const rankOrder = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const fileOrder = orientation === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const rank = rankOrder[r];
      const fileIndex = fileOrder[c];
      rows.push({ displayRow: r, displayCol: c, fileIndex, rank, square: toSquare(fileIndex, rank) });
    }
  }
  return rows;
}

function isLightSquare(fileIndex, rank) {
  // a1 is dark. If (file + rank) is even -> dark, odd -> light.
  return (fileIndex + rank) % 2 === 1;
}

function pieceLabel(piece) {
  if (!piece) return "empty";
  const nameByType = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const colorName = piece.color === "w" ? "white" : "black";
  return `${colorName} ${nameByType[piece.type] || "piece"}`;
}

/**
 * PUBLIC_INTERFACE
 * Chessboard UI component.
 * Renders an interactive 8x8 board with optional highlights and coordinate labels.
 */
export default function Chessboard({
  board,
  orientation = "w",
  selectedSquare,
  legalTargets,
  lastMove,
  inCheckSquare,
  showCoords,
  moveHighlights,
  disabled,
  onSquareClick,
}) {
  const squares = useMemo(() => buildSquares(orientation), [orientation]);
  const legalSet = useMemo(() => new Set(legalTargets || []), [legalTargets]);

  // board is from chess.js board(): 8 rows (rank 8->1), 8 cols (file a->h)
  function getPieceAtSquare(square) {
    const fileChar = square[0];
    const rankChar = square[1];
    const fileIndex = FILES.indexOf(fileChar);
    const rank = Number(rankChar);
    if (fileIndex < 0 || rank < 1 || rank > 8) return null;
    const rowIndex = 8 - rank; // rank 8 -> row 0
    const colIndex = fileIndex;
    const row = board?.[rowIndex];
    if (!row) return null;
    return row[colIndex] || null;
  }

  return (
    <div className="boardShell">
      <div className="boardGrid" role="grid" aria-label="Chessboard">
        {squares.map(({ displayRow, displayCol, fileIndex, rank, square }) => {
          const piece = getPieceAtSquare(square);
          const pieceKey = piece ? `${piece.color}${piece.type}` : null;
          const pieceChar = pieceKey ? PIECE_UNICODE[pieceKey] : "";

          const light = isLightSquare(fileIndex, rank);
          const isSelected = selectedSquare === square;
          const isLegal = moveHighlights && legalSet.has(square);
          const isLastMove =
            moveHighlights && lastMove && (lastMove.from === square || lastMove.to === square);
          const isInCheck = moveHighlights && inCheckSquare === square;

          const classes = [
            "square",
            light ? "squareLight" : "squareDark",
            isSelected ? "squareSelected" : "",
            isLegal ? "squareLegal" : "",
            isLastMove ? "squareLastMove" : "",
            isInCheck ? "squareInCheck" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const showFileLabel = showCoords && displayRow === 7;
          const showRankLabel = showCoords && displayCol === 0;

          return (
            <button
              key={square}
              type="button"
              className={classes}
              onClick={() => (!disabled ? onSquareClick(square) : null)}
              aria-label={`${square} ${pieceLabel(piece)}`}
            >
              <span className="piece" aria-hidden="true">
                {pieceChar}
              </span>
              {showFileLabel ? <span className="coord coordFile">{square[0]}</span> : null}
              {showRankLabel ? <span className="coord coordRank">{square[1]}</span> : null}
              {isLegal ? <span className="targetDot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
