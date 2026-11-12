(function () {
  "use strict";

  const DIRECTIONS = ["LEFT", "CENTER", "RIGHT"];

  function randomItem(items, random) {
    const sample = random();
    if (typeof sample !== "number" || sample < 0 || sample >= 1) {
      throw new Error("Random values must be between 0 and 1.");
    }
    return items[Math.floor(sample * items.length)];
  }

  function simulateMatch(homeClub, awayClub, random = Math.random) {
    if (!homeClub || !awayClub || homeClub === awayClub) {
      throw new Error("A simulated match requires two different clubs.");
    }
    if (typeof random !== "function") throw new Error("A random number generator is required.");

    const scores = { HOME: 0, AWAY: 0 };
    const history = [];
    let kicks = { HOME: 0, AWAY: 0 };

    function takeKick(team, stage, round) {
      const direction = randomItem(DIRECTIONS, random);
      const goalkeeperDirection = randomItem(DIRECTIONS, random);
      const result = window.FootballGameEngine.calculateOutcome({
        shotDirection: direction,
        goalkeeperDirection,
        randomValue: random()
      });
      if (result.outcome === "GOAL") scores[team]++;
      kicks[team]++;
      history.push({
        team,
        stage,
        round,
        shotDirection: direction,
        goalkeeperDirection,
        outcome: result.outcome
      });
    }

    for (let round = 1; round <= 5; round++) {
      takeKick("HOME", "REGULAR", round);
      takeKick("AWAY", "REGULAR", round);
    }

    let suddenDeathRound = 0;
    while (scores.HOME === scores.AWAY) {
      suddenDeathRound++;
      takeKick("HOME", "SUDDEN_DEATH", suddenDeathRound);
      takeKick("AWAY", "SUDDEN_DEATH", suddenDeathRound);
      if (suddenDeathRound >= 1000 && scores.HOME === scores.AWAY) {
        throw new Error("Simulated match remained tied after 1000 sudden-death rounds.");
      }
    }

    const winner = scores.HOME > scores.AWAY ? homeClub : awayClub;
    return {
      homeScore: scores.HOME,
      awayScore: scores.AWAY,
      winner,
      source: "SIMULATED",
      penaltyHistory: history,
      statistics: {
        attempts: kicks.HOME + kicks.AWAY,
        goals: scores.HOME + scores.AWAY,
        saves: history.filter(kick => kick.outcome === "SAVED").length,
        misses: history.filter(kick => kick.outcome === "MISS").length,
        posts: history.filter(kick => kick.outcome === "POST").length
      }
    };
  }

  window.FootballTournamentSimulation = { simulateMatch };
})();
