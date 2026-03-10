function scoreMove(m) {
  // chess.js verbose moves have flags/captured; reward captures and checks.
  let score = 0;
  if (m.captured) score += 10;
  if (typeof m.san === "string" && m.san.includes("+")) score += 2;
  if (typeof m.san === "string" && m.san.includes("#")) score += 1000;
  // Prefer central moves a tiny bit
  if (m.to && ["d4", "e4", "d5", "e5"].includes(m.to)) score += 1;
  return score;
}

/**
 * PUBLIC_INTERFACE
 * Choose an AI move from the current chess.js position.
 * - easy: random legal move
 * - medium: prefer captures and checks
 */
export function chooseAiMove(chess, level) {
  const moves = chess.moves({ verbose: true });
  if (!moves || moves.length === 0) return null;

  if (level === "medium") {
    let best = moves[0];
    let bestScore = scoreMove(best);
    for (let i = 1; i < moves.length; i += 1) {
      const s = scoreMove(moves[i]);
      if (s > bestScore) {
        best = moves[i];
        bestScore = s;
      }
    }
    return { from: best.from, to: best.to, promotion: best.promotion || null };
  }

  const pick = moves[Math.floor(Math.random() * moves.length)];
  return { from: pick.from, to: pick.to, promotion: pick.promotion || null };
}
