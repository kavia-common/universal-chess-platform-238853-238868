import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles/app.css";
import Chessboard from "./components/Chessboard";
import MoveList from "./components/MoveList";
import Modal from "./components/Modal";
import Clock from "./components/Clock";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useChessGame } from "./hooks/useChessGame";
import { usePuzzleSession } from "./hooks/usePuzzleSession";
import { chooseAiMove } from "./chess/ai";
import { PUZZLES } from "./chess/puzzles";
import { formatMsAsClock } from "./lib/format";

const DEFAULT_SETTINGS = {
  flipBoard: false,
  showCoords: true,
  autoQueen: true,
  moveHighlights: true,
};

const DEFAULT_PROFILE = {
  displayName: "Guest",
};

const DEFAULT_STATS = {
  gamesPlayed: 0,
  whiteWins: 0,
  blackWins: 0,
  draws: 0,
  timeouts: 0,
  vsAiGames: 0,
  puzzlesSolved: 0,
};

const TIME_PRESETS = [
  { key: "noClock", label: "No clock", initialSeconds: 0, incrementSeconds: 0 },
  { key: "3|2", label: "3 + 2", initialSeconds: 3 * 60, incrementSeconds: 2 },
  { key: "5|0", label: "5 + 0", initialSeconds: 5 * 60, incrementSeconds: 0 },
  { key: "10|5", label: "10 + 5", initialSeconds: 10 * 60, incrementSeconds: 5 },
];

function getHashSection() {
  const raw = (window.location.hash || "").replace("#", "").trim();
  if (!raw) return "play";
  if (["play", "puzzles", "profile", "settings"].includes(raw)) return raw;
  return "play";
}

function getWinnerLabel(winnerColor) {
  if (winnerColor === "w") return "White";
  if (winnerColor === "b") return "Black";
  return "—";
}

function getGameEndStatsDelta(gameResult, mode) {
  if (!gameResult || gameResult.state !== "ended") return null;

  const delta = {
    gamesPlayed: 1,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    timeouts: 0,
    vsAiGames: mode === "ai" ? 1 : 0,
  };

  if (gameResult.reason === "timeout") {
    delta.timeouts += 1;
  }

  if (gameResult.winner === "w") delta.whiteWins += 1;
  else if (gameResult.winner === "b") delta.blackWins += 1;
  else delta.draws += 1;

  return delta;
}

/**
 * PUBLIC_INTERFACE
 * Root application component (frontend-only chess app).
 * Implements:
 * - playable chessboard with legal move validation (chess.js)
 * - local multiplayer and simple AI mode
 * - move history + undo/redo + jump
 * - clocks (time controls + increment)
 * - settings persisted to localStorage
 * - profile/stats persisted to localStorage
 * - puzzle mode (local puzzles + local progress)
 */
export default function App() {
  const [section, setSection] = useState(getHashSection);

  const [settings, setSettings] = useLocalStorageState("ucp_settings_v1", DEFAULT_SETTINGS);
  const [profile, setProfile] = useLocalStorageState("ucp_profile_v1", DEFAULT_PROFILE);
  const [stats, setStats] = useLocalStorageState("ucp_stats_v1", DEFAULT_STATS);
  const [solvedPuzzleIds, setSolvedPuzzleIds] = useLocalStorageState("ucp_puzzles_solved_v1", []);

  const [mode, setMode] = useState("local"); // "local" | "ai"
  const [aiColor, setAiColor] = useState("b"); // "w" | "b"
  const [aiLevel, setAiLevel] = useState("easy"); // "easy" | "medium"
  const [timePresetKey, setTimePresetKey] = useState("5|0");

  const timePreset = useMemo(
    () => TIME_PRESETS.find((p) => p.key === timePresetKey) || TIME_PRESETS[2],
    [timePresetKey]
  );

  const {
    viewState,
    actions,
    promotionState,
    clocks,
    setClocksRunning,
    jumpToPly,
    setSelectedSquare,
  } = useChessGame({
    initialSeconds: timePreset.initialSeconds,
    incrementSeconds: timePreset.incrementSeconds,
    autoStartClocks: true,
  });

  const {
    puzzleState,
    puzzleActions,
    puzzlePromotionState,
    puzzleSetSelectedSquare,
  } = usePuzzleSession();

  // Keep URL hash and local section state aligned (no router dependency).
  useEffect(() => {
    function onHashChange() {
      setSection(getHashSection());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Stop game clocks when user is not on Play (avoid confusing background time loss).
  useEffect(() => {
    if (section !== "play") {
      setClocksRunning(false);
    }
  }, [section, setClocksRunning]);

  // Update stats once per finished game.
  const lastRecordedGameEndIdRef = useRef(null);
  useEffect(() => {
    if (viewState.result.state !== "ended") return;
    if (!viewState.result.gameId) return;
    if (lastRecordedGameEndIdRef.current === viewState.result.gameId) return;

    const delta = getGameEndStatsDelta(viewState.result, mode);
    if (!delta) return;

    lastRecordedGameEndIdRef.current = viewState.result.gameId;
    setStats((prev) => ({
      ...prev,
      gamesPlayed: prev.gamesPlayed + delta.gamesPlayed,
      whiteWins: prev.whiteWins + delta.whiteWins,
      blackWins: prev.blackWins + delta.blackWins,
      draws: prev.draws + delta.draws,
      timeouts: prev.timeouts + delta.timeouts,
      vsAiGames: prev.vsAiGames + delta.vsAiGames,
    }));
  }, [viewState.result, mode, setStats]);

  // Simple AI: after human move, if it's AI's turn (and we are at end of the move list), play a move.
  const aiInFlightRef = useRef(false);
  useEffect(() => {
    if (mode !== "ai") return;
    if (section !== "play") return;
    if (viewState.result.state === "ended") return;
    if (promotionState.open) return;
    if (viewState.currentPly !== viewState.moves.length) return; // don't AI-move while exploring history

    const turn = viewState.turn;
    if (turn !== aiColor) return;

    if (aiInFlightRef.current) return;
    aiInFlightRef.current = true;

    const timer = window.setTimeout(() => {
      try {
        const move = chooseAiMove(viewState.chess, aiLevel);
        if (move) actions.tryMove(move.from, move.to, move.promotion, { source: "ai" });
      } finally {
        aiInFlightRef.current = false;
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    mode,
    section,
    aiColor,
    aiLevel,
    viewState.chess,
    viewState.turn,
    viewState.result.state,
    viewState.currentPly,
    viewState.moves.length,
    promotionState.open,
    actions,
  ]);

  function navigate(next) {
    window.location.hash = `#${next}`;
    setSection(next);
  }

  const gameStatusLine = useMemo(() => {
    if (viewState.result.state === "ended") {
      if (viewState.result.reason === "timeout") {
        return `Timeout — ${getWinnerLabel(viewState.result.winner)} wins`;
      }
      if (viewState.result.winner) {
        return `${viewState.result.reasonLabel} — ${getWinnerLabel(viewState.result.winner)} wins`;
      }
      return `${viewState.result.reasonLabel} — Draw`;
    }

    const checkNote = viewState.isCheck ? " (check)" : "";
    return `${viewState.turn === "w" ? "White" : "Black"} to move${checkNote}`;
  }, [viewState]);

  const playControlsDisabled = viewState.result.state === "ended";

  const solvedCount = Array.isArray(solvedPuzzleIds) ? solvedPuzzleIds.length : 0;

  const activeBoardProps =
    section === "puzzles"
      ? {
          board: puzzleState.board,
          orientation: settings.flipBoard ? "b" : "w",
          selectedSquare: puzzleState.selectedSquare,
          legalTargets: puzzleState.legalTargets,
          lastMove: puzzleState.lastMove,
          inCheckSquare: puzzleState.inCheckSquare,
          showCoords: settings.showCoords,
          moveHighlights: settings.moveHighlights,
          disabled: puzzleState.locked,
          onSquareClick: (sq) => puzzleActions.handleSquareClick(sq, settings.autoQueen),
        }
      : {
          board: viewState.board,
          orientation: settings.flipBoard ? "b" : "w",
          selectedSquare: viewState.selectedSquare,
          legalTargets: viewState.legalTargets,
          lastMove: viewState.lastMove,
          inCheckSquare: viewState.inCheckSquare,
          showCoords: settings.showCoords,
          moveHighlights: settings.moveHighlights,
          disabled: false,
          onSquareClick: (sq) => actions.handleSquareClick(sq, settings.autoQueen),
        };

  const effectivePromotionState = section === "puzzles" ? puzzlePromotionState : promotionState;

  return (
    <div className="appRoot">
      <header className="appHeader">
        <div className="brand" role="banner">
          <div className="brandMark" aria-hidden="true" />
          <div className="brandText">
            <div className="brandTitle">Universal Chess Platform</div>
            <div className="brandSubtitle">Frontend-only chess (local state)</div>
          </div>
        </div>

        <nav className="topNav" aria-label="Primary navigation">
          <button
            className={`navLink ${section === "play" ? "navLinkActive" : ""}`}
            type="button"
            onClick={() => navigate("play")}
          >
            Play
          </button>
          <button
            className={`navLink ${section === "puzzles" ? "navLinkActive" : ""}`}
            type="button"
            onClick={() => navigate("puzzles")}
          >
            Puzzles <span className="navPill">{solvedCount}</span>
          </button>
          <button
            className={`navLink ${section === "profile" ? "navLinkActive" : ""}`}
            type="button"
            onClick={() => navigate("profile")}
          >
            Profile
          </button>
          <button
            className={`navLink ${section === "settings" ? "navLinkActive" : ""}`}
            type="button"
            onClick={() => navigate("settings")}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="appMain">
        <section className="boardArea" aria-label="Chessboard area">
          <div className="boardTopBar" aria-label="Game status">
            <div className="statusTitle">{section === "puzzles" ? "Puzzle" : "Game"}</div>
            <div className="statusText">{section === "puzzles" ? puzzleState.statusLine : gameStatusLine}</div>
          </div>

          <Chessboard {...activeBoardProps} />

          {section === "play" && (
            <div className="boardBottomBar" aria-label="Quick actions">
              <button
                className="btn"
                type="button"
                onClick={() => actions.undo()}
                disabled={viewState.currentPly === 0}
              >
                Undo
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => actions.redo()}
                disabled={viewState.currentPly === viewState.moves.length}
              >
                Redo
              </button>
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => actions.resetGame()}
              >
                New game
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, flipBoard: !prev.flipBoard }))}
              >
                Flip
              </button>
            </div>
          )}

          {section === "puzzles" && (
            <div className="boardBottomBar" aria-label="Puzzle actions">
              <button className="btn" type="button" onClick={() => puzzleActions.resetPosition()}>
                Reset
              </button>
              <button className="btn" type="button" onClick={() => puzzleActions.undo()} disabled={!puzzleState.canUndo}>
                Undo
              </button>
              <button className="btn btnPrimary" type="button" onClick={() => puzzleActions.nextPuzzle()}>
                Next puzzle
              </button>
            </div>
          )}
        </section>

        <aside className="sidePanel" aria-label="Sidebar">
          {section === "play" && (
            <>
              <div className="panelCard">
                <h2 className="panelTitle">Game setup</h2>

                <div className="formRow">
                  <label className="label" htmlFor="modeSelect">
                    Mode
                  </label>
                  <select
                    id="modeSelect"
                    className="select"
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value);
                      // New mode implies a clean game to avoid inconsistent state.
                      actions.resetGame();
                    }}
                  >
                    <option value="local">Local (2 players)</option>
                    <option value="ai">Vs AI</option>
                  </select>
                </div>

                {mode === "ai" && (
                  <>
                    <div className="formRow">
                      <label className="label" htmlFor="aiColorSelect">
                        AI plays
                      </label>
                      <select
                        id="aiColorSelect"
                        className="select"
                        value={aiColor}
                        onChange={(e) => {
                          setAiColor(e.target.value);
                          actions.resetGame();
                        }}
                      >
                        <option value="b">Black</option>
                        <option value="w">White</option>
                      </select>
                    </div>

                    <div className="formRow">
                      <label className="label" htmlFor="aiLevelSelect">
                        AI level
                      </label>
                      <select
                        id="aiLevelSelect"
                        className="select"
                        value={aiLevel}
                        onChange={(e) => setAiLevel(e.target.value)}
                      >
                        <option value="easy">Easy (random)</option>
                        <option value="medium">Medium (captures/checks)</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="formRow">
                  <label className="label" htmlFor="timePresetSelect">
                    Clock
                  </label>
                  <select
                    id="timePresetSelect"
                    className="select"
                    value={timePresetKey}
                    onChange={(e) => {
                      setTimePresetKey(e.target.value);
                      actions.resetGame();
                    }}
                  >
                    {TIME_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hintText">
                  Tip: undo/redo pauses the clock so you can explore moves safely.
                </div>
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">Clocks</h2>
                <div className="clockGrid">
                  <Clock
                    label="White"
                    ms={clocks.wMs}
                    active={clocks.enabled && clocks.running && clocks.activeColor === "w"}
                  />
                  <Clock
                    label="Black"
                    ms={clocks.bMs}
                    active={clocks.enabled && clocks.running && clocks.activeColor === "b"}
                  />
                </div>

                <div className="clockControls">
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => setClocksRunning(!clocks.running)}
                    disabled={!clocks.enabled || viewState.result.state === "ended"}
                  >
                    {clocks.running ? "Pause" : "Start"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => actions.resetClocks()}
                    disabled={!clocks.enabled}
                  >
                    Reset clocks
                  </button>
                </div>

                {clocks.enabled ? (
                  <div className="hintText">
                    {formatMsAsClock(clocks.initialMs)} initial, +{Math.floor(clocks.incrementMs / 1000)}s increment
                  </div>
                ) : (
                  <div className="hintText">Clock is off.</div>
                )}
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">Move history</h2>
                <MoveList
                  moves={viewState.moves}
                  currentPly={viewState.currentPly}
                  onJumpToPly={(ply) => jumpToPly(ply)}
                />
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">Result</h2>
                {viewState.result.state === "ended" ? (
                  <div className="resultBox">
                    <div className="resultHeadline">{viewState.result.reasonLabel}</div>
                    <div className="resultSub">
                      Winner: <strong>{getWinnerLabel(viewState.result.winner)}</strong>
                    </div>
                    <button className="btn btnPrimary" type="button" onClick={() => actions.resetGame()}>
                      Play again
                    </button>
                  </div>
                ) : (
                  <p className="panelText">
                    Game in progress. Legal move validation, check/checkmate/draw detection, and move history are all
                    handled locally (no backend yet).
                  </p>
                )}
              </div>
            </>
          )}

          {section === "puzzles" && (
            <>
              <div className="panelCard">
                <h2 className="panelTitle">Puzzles</h2>
                <p className="panelText">
                  Solve short tactics locally. Your progress is saved in this browser (localStorage).
                </p>

                <div className="puzzleMeta">
                  <div className="puzzleMetaRow">
                    <span className="muted">Current:</span> <strong>{puzzleState.puzzle?.title || "—"}</strong>
                  </div>
                  <div className="puzzleMetaRow">
                    <span className="muted">Theme:</span> <strong>{puzzleState.puzzle?.theme || "—"}</strong>
                  </div>
                </div>

                <div className="puzzleStatus">
                  {puzzleState.solved ? (
                    <div className="pill pillSuccess">Solved</div>
                  ) : (
                    <div className="pill">Unsolved</div>
                  )}
                  {puzzleState.feedback ? <div className="hintText">{puzzleState.feedback}</div> : null}
                </div>

                <div className="puzzleActionsRow">
                  <button className="btn btnPrimary" type="button" onClick={() => puzzleActions.revealHint()}>
                    Hint
                  </button>
                  <button className="btn" type="button" onClick={() => puzzleActions.resetPosition()}>
                    Reset
                  </button>
                </div>
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">All puzzles</h2>
                <div className="puzzleList" role="list" aria-label="Puzzle list">
                  {PUZZLES.map((p) => {
                    const solved = solvedPuzzleIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        className={`puzzleListItem ${p.id === puzzleState.puzzle?.id ? "puzzleListItemActive" : ""}`}
                        type="button"
                        onClick={() => {
                          puzzleActions.loadPuzzleById(p.id);
                          puzzleSetSelectedSquare(null);
                        }}
                      >
                        <div className="puzzleListTitle">
                          {p.title} {solved ? <span className="pill pillSuccess">Solved</span> : null}
                        </div>
                        <div className="puzzleListMeta">{p.theme}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">Progress</h2>
                <div className="statGrid">
                  <div className="statCard">
                    <div className="statValue">{solvedCount}</div>
                    <div className="statLabel">Solved puzzles</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{PUZZLES.length}</div>
                    <div className="statLabel">Total puzzles</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {section === "profile" && (
            <>
              <div className="panelCard">
                <h2 className="panelTitle">Profile</h2>
                <div className="formRow">
                  <label className="label" htmlFor="displayNameInput">
                    Display name
                  </label>
                  <input
                    id="displayNameInput"
                    className="input"
                    value={profile.displayName}
                    onChange={(e) => setProfile((prev) => ({ ...prev, displayName: e.target.value }))}
                  />
                </div>
                <div className="hintText">Saved locally for now. Backend accounts can be added later.</div>
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">Stats</h2>
                <div className="statGrid">
                  <div className="statCard">
                    <div className="statValue">{stats.gamesPlayed}</div>
                    <div className="statLabel">Games played</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{stats.whiteWins}</div>
                    <div className="statLabel">White wins</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{stats.blackWins}</div>
                    <div className="statLabel">Black wins</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{stats.draws}</div>
                    <div className="statLabel">Draws</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{stats.timeouts}</div>
                    <div className="statLabel">Timeouts</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{stats.vsAiGames}</div>
                    <div className="statLabel">Vs AI</div>
                  </div>
                  <div className="statCard">
                    <div className="statValue">{stats.puzzlesSolved}</div>
                    <div className="statLabel">Puzzles solved</div>
                  </div>
                </div>

                <div className="profileActions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setStats(DEFAULT_STATS);
                      setSolvedPuzzleIds([]);
                      puzzleActions.loadPuzzleById(PUZZLES[0].id);
                    }}
                  >
                    Reset local stats
                  </button>
                </div>
              </div>
            </>
          )}

          {section === "settings" && (
            <>
              <div className="panelCard">
                <h2 className="panelTitle">Settings</h2>

                <div className="toggleRow">
                  <input
                    id="flipToggle"
                    type="checkbox"
                    checked={settings.flipBoard}
                    onChange={() => setSettings((prev) => ({ ...prev, flipBoard: !prev.flipBoard }))}
                  />
                  <label htmlFor="flipToggle">Flip board</label>
                </div>

                <div className="toggleRow">
                  <input
                    id="coordsToggle"
                    type="checkbox"
                    checked={settings.showCoords}
                    onChange={() => setSettings((prev) => ({ ...prev, showCoords: !prev.showCoords }))}
                  />
                  <label htmlFor="coordsToggle">Show coordinates</label>
                </div>

                <div className="toggleRow">
                  <input
                    id="highlightsToggle"
                    type="checkbox"
                    checked={settings.moveHighlights}
                    onChange={() => setSettings((prev) => ({ ...prev, moveHighlights: !prev.moveHighlights }))}
                  />
                  <label htmlFor="highlightsToggle">Highlight legal moves / last move</label>
                </div>

                <div className="toggleRow">
                  <input
                    id="autoQueenToggle"
                    type="checkbox"
                    checked={settings.autoQueen}
                    onChange={() => setSettings((prev) => ({ ...prev, autoQueen: !prev.autoQueen }))}
                  />
                  <label htmlFor="autoQueenToggle">Auto-promote to queen (when possible)</label>
                </div>

                <div className="hintText">
                  Settings are saved locally. Later, these can be synced per user via the backend.
                </div>
              </div>

              <div className="panelCard">
                <h2 className="panelTitle">About</h2>
                <p className="panelText">
                  This is a frontend-only implementation (no backend calls). All state is local to your browser for now.
                </p>
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="appFooter">
        <span>
          © {new Date().getFullYear()} Universal Chess Platform · Signed in as <strong>{profile.displayName}</strong>
        </span>
      </footer>

      <Modal
        open={effectivePromotionState.open}
        title="Choose promotion"
        onClose={() => {
          if (section === "puzzles") puzzleActions.cancelPromotion();
          else actions.cancelPromotion();
        }}
      >
        <div className="promotionGrid" role="group" aria-label="Promotion piece selection">
          {effectivePromotionState.choices.map((c) => (
            <button
              key={c}
              className="btn btnPrimary"
              type="button"
              onClick={() => {
                if (section === "puzzles") puzzleActions.confirmPromotion(c);
                else actions.confirmPromotion(c);
              }}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="hintText">Promote your pawn to one of these pieces.</div>
      </Modal>

      <Modal
        open={section === "puzzles" && puzzleState.solved && !solvedPuzzleIds.includes(puzzleState.puzzle?.id)}
        title="Puzzle solved"
        onClose={() => {
          const id = puzzleState.puzzle?.id;
          if (!id) return;
          setSolvedPuzzleIds((prev) => (prev.includes(id) ? prev : prev.concat([id])));
          setStats((prev) => ({ ...prev, puzzlesSolved: prev.puzzlesSolved + 1 }));
        }}
      >
        <p className="panelText">
          Nice work. Want to keep going?
        </p>
        <div className="modalActions">
          <button
            className="btn btnPrimary"
            type="button"
            onClick={() => {
              const id = puzzleState.puzzle?.id;
              if (id) {
                setSolvedPuzzleIds((prev) => (prev.includes(id) ? prev : prev.concat([id])));
                setStats((prev) => ({ ...prev, puzzlesSolved: prev.puzzlesSolved + 1 }));
              }
              puzzleActions.nextPuzzle();
            }}
          >
            Next puzzle
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              const id = puzzleState.puzzle?.id;
              if (id) {
                setSolvedPuzzleIds((prev) => (prev.includes(id) ? prev : prev.concat([id])));
                setStats((prev) => ({ ...prev, puzzlesSolved: prev.puzzlesSolved + 1 }));
              }
              navigate("play");
            }}
          >
            Back to play
          </button>
        </div>
      </Modal>

      <Modal
        open={section === "play" && clocks.enabled && viewState.result.state === "ended" && viewState.result.reason === "timeout"}
        title="Time is up"
        onClose={() => {}}
      >
        <p className="panelText">
          {getWinnerLabel(viewState.result.winner)} wins on time.
        </p>
        <div className="modalActions">
          <button className="btn btnPrimary" type="button" onClick={() => actions.resetGame()}>
            New game
          </button>
          <button className="btn" type="button" onClick={() => navigate("profile")}>
            View stats
          </button>
        </div>
      </Modal>

      <Modal
        open={section === "play" && playControlsDisabled && viewState.result.reason !== "timeout" && viewState.result.state === "ended"}
        title="Game over"
        onClose={() => {}}
      >
        <p className="panelText">
          {viewState.result.reasonLabel}. Winner: <strong>{getWinnerLabel(viewState.result.winner)}</strong>
        </p>
        <div className="modalActions">
          <button className="btn btnPrimary" type="button" onClick={() => actions.resetGame()}>
            New game
          </button>
          <button className="btn" type="button" onClick={() => navigate("profile")}>
            View stats
          </button>
        </div>
      </Modal>
    </div>
  );
}
