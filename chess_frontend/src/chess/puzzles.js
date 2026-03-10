/**
 * PUBLIC_INTERFACE
 * Local puzzle set used for frontend-only mode.
 * Each puzzle expects the FIRST move (UCI) as the solution.
 */
export const PUZZLES = [
  {
    id: "p1_mate_in_1_qh7",
    title: "Mate in 1",
    theme: "Checkmate",
    prompt: "White to move: deliver checkmate in one move.",
    hint: "Look for a direct mate near the enemy king.",
    fen: "6k1/8/8/7Q/8/8/2B5/5RK1 w - - 0 1",
    solutionUci: "h5h7",
  },
  {
    id: "p2_mate_in_1_qh2",
    title: "Mate in 1",
    theme: "Back rank / king net",
    prompt: "Black to move: checkmate in one move.",
    hint: "A queen move to the edge can be decisive.",
    fen: "8/8/8/8/8/6k1/6q1/7K b - - 0 1",
    solutionUci: "g2h2",
  },
  {
    id: "p3_win_queen",
    title: "Win material",
    theme: "Fork",
    prompt: "White to move: win the queen with a fork.",
    hint: "Knights can attack two valuable targets at once.",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 2 3",
    solutionUci: "f3e5",
  },
  {
    id: "p4_mate_in_1_rook",
    title: "Mate in 1",
    theme: "Rook mate",
    prompt: "White to move: mate in one.",
    hint: "A rook on the 7th often seals the king.",
    fen: "6k1/6R1/8/8/8/8/8/6K1 w - - 0 1",
    solutionUci: "g7g8",
  },
  {
    id: "p5_find_check",
    title: "Find the check",
    theme: "Tactics",
    prompt: "White to move: find a strong checking move.",
    hint: "Checks narrow the opponent's replies.",
    fen: "rnb1kbnr/pppp1ppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 3",
    solutionUci: "c4f7",
  },
];
