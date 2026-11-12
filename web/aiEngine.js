/* Offline adaptive opponent. No network, API key, or hardware required. */
(function () {
  "use strict";
  const DIRECTIONS = ["LEFT", "CENTER", "RIGHT"];
  const POWER = ["LOW", "NORMAL", "HIGH"];
  const SHOTS = ["NORMAL", "PLACEMENT", "POWER"];
  const predictionRate = { 1: 0.05, 2: 0.35, 3: 0.60, 4: 0.85 };
  let difficulty = 2;
  let playerShots = [];
  let playerDives = [];
  let committed = null;
  let role = null;

  function mostUsed(history) {
    if (!history.length) return null;
    const counts = Object.fromEntries(DIRECTIONS.map(d => [d, history.filter(x => x === d).length]));
    return DIRECTIONS.slice().sort((a,b) => counts[b] - counts[a])[0];
  }
  function choose(history, counter = false) {
    const prediction = mostUsed(history);
    if (prediction && Math.random() < predictionRate[difficulty]) {
      if (!counter) return prediction;
      return DIRECTIONS.filter(d => d !== prediction)[Math.floor(Math.random() * 2)];
    }
    return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  }
  function configure(level) { difficulty = Math.max(1, Math.min(4, Number(level) || 2)); }
  function reset() { playerShots = []; playerDives = []; committed = null; role = null; }
  function prepare(nextRole) {
    role = nextRole;
    if (role === "GOALKEEPER") committed = { direction: choose(playerShots), power: "NORMAL", shot_type: "NORMAL" };
    else committed = { direction: choose(playerDives, true), power: POWER[Math.floor(Math.random()*POWER.length)], shot_type: SHOTS[Math.floor(Math.random()*SHOTS.length)] };
    return { ...committed };
  }
  function recordPlayerMove(direction, playerIsKicking) {
    (playerIsKicking ? playerShots : playerDives).push(direction);
    if (playerIsKicking) playerShots = playerShots.slice(-10); else playerDives = playerDives.slice(-10);
  }
  function reveal() { return committed ? { ...committed } : prepare("STRIKER"); }
  window.FootballAI = { configure, reset, prepare, recordPlayerMove, reveal };
})();
