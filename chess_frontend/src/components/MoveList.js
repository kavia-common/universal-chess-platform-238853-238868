import React, { useMemo } from "react";

function toPairs(moves) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i] || null,
      black: moves[i + 1] || null,
      whitePly: i + 1,
      blackPly: i + 2,
    });
  }
  return pairs;
}

/**
 * PUBLIC_INTERFACE
 * Move list component with jump controls.
 * `currentPly` is 0-based ply count (0=start, 1=after first half-move, ...).
 */
export default function MoveList({ moves, currentPly, onJumpToPly }) {
  const pairs = useMemo(() => toPairs(moves || []), [moves]);

  if (!moves || moves.length === 0) {
    return <p className="panelText">No moves yet.</p>;
  }

  return (
    <div className="moveList" role="table" aria-label="Move list">
      {pairs.map((row) => (
        <div className="moveRow" key={row.moveNumber} role="row">
          <div className="moveNumber" role="cell">
            {row.moveNumber}.
          </div>

          <div className="moveCell" role="cell">
            {row.white ? (
              <button
                type="button"
                className={`moveBtn ${currentPly === row.whitePly ? "moveBtnActive" : ""}`}
                onClick={() => onJumpToPly(row.whitePly)}
                title={`Go to ply ${row.whitePly}`}
              >
                {row.white.san}
              </button>
            ) : (
              <span className="movePlaceholder">—</span>
            )}
          </div>

          <div className="moveCell" role="cell">
            {row.black ? (
              <button
                type="button"
                className={`moveBtn ${currentPly === row.blackPly ? "moveBtnActive" : ""}`}
                onClick={() => onJumpToPly(row.blackPly)}
                title={`Go to ply ${row.blackPly}`}
              >
                {row.black.san}
              </button>
            ) : (
              <span className="movePlaceholder">—</span>
            )}
          </div>
        </div>
      ))}

      <div className="moveNavRow" aria-label="Move navigation">
        <button type="button" className="btnSmall" onClick={() => onJumpToPly(0)} disabled={currentPly === 0}>
          ⏮ Start
        </button>
        <button
          type="button"
          className="btnSmall"
          onClick={() => onJumpToPly(Math.max(0, currentPly - 1))}
          disabled={currentPly === 0}
        >
          ◀ Prev
        </button>
        <button
          type="button"
          className="btnSmall"
          onClick={() => onJumpToPly(Math.min(moves.length, currentPly + 1))}
          disabled={currentPly === moves.length}
        >
          Next ▶
        </button>
        <button
          type="button"
          className="btnSmall"
          onClick={() => onJumpToPly(moves.length)}
          disabled={currentPly === moves.length}
        >
          End ⏭
        </button>
      </div>
    </div>
  );
}
