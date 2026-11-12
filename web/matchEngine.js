(function () {
  "use strict";

  function createMatch(firstKicker) {
    if (!["PLAYER", "AI"].includes(firstKicker)) {
      throw new Error("First kicker must be PLAYER or AI");
    }

    let state = {
      status: "IN_PROGRESS",
      stage: "REGULAR",
      firstKicker,
      currentTeam: firstKicker,
      regularRound: 1,
      suddenDeathRound: 0,
      scores: {
        PLAYER: 0,
        AI: 0
      },
      regularKicks: {
        PLAYER: 0,
        AI: 0
      },
      suddenKicks: {
        PLAYER: 0,
        AI: 0
      },
      history: [],
      winner: null,
      finishReason: null
    };

    function otherTeam(team) {
      return team === "PLAYER" ? "AI" : "PLAYER";
    }

    function finish(winner, reason) {
      state.status = "FINISHED";
      state.winner = winner;
      state.finishReason = reason;
    }

    function checkEarlyVictory() {
      const playerRemaining = 5 - state.regularKicks.PLAYER;
      const aiRemaining = 5 - state.regularKicks.AI;

      if (
        state.scores.PLAYER >
        state.scores.AI + aiRemaining
      ) {
        finish("PLAYER", "EARLY_VICTORY");
        return true;
      }

      if (
        state.scores.AI >
        state.scores.PLAYER + playerRemaining
      ) {
        finish("AI", "EARLY_VICTORY");
        return true;
      }

      return false;
    }

    function recordKick(team, outcome) {
      if (state.status !== "IN_PROGRESS") {
        throw new Error("Match is already finished");
      }

      if (team !== state.currentTeam) {
        throw new Error("It is not this team's turn");
      }

      if (!["GOAL", "SAVED", "MISS", "POST"].includes(outcome)) {
        throw new Error("Invalid penalty outcome");
      }

      const scored = outcome === "GOAL";

      if (state.stage === "REGULAR") {
        state.regularKicks[team]++;

        if (scored) {
          state.scores[team]++;
        }

        state.history.push({
          team,
          round: state.regularRound,
          stage: "REGULAR",
          outcome,
          scored
        });

        if (checkEarlyVictory()) {
          return getState();
        }

        const bothCompleted =
          state.regularKicks.PLAYER === 5 &&
          state.regularKicks.AI === 5;

        if (bothCompleted) {
          if (state.scores.PLAYER !== state.scores.AI) {
            finish(
              state.scores.PLAYER > state.scores.AI
                ? "PLAYER"
                : "AI",
              "REGULAR_TIME"
            );

            return getState();
          }

          state.stage = "SUDDEN_DEATH";
          state.suddenDeathRound = 1;
          state.currentTeam = state.firstKicker;
          return getState();
        }

        state.regularRound =
          Math.min(
            state.regularKicks.PLAYER,
            state.regularKicks.AI
          ) + 1;
      } else {
        state.suddenKicks[team]++;

        if (scored) {
          state.scores[team]++;
        }

        state.history.push({
          team,
          round: state.suddenDeathRound,
          stage: "SUDDEN_DEATH",
          outcome,
          scored
        });

        if (
          state.suddenKicks.PLAYER ===
          state.suddenKicks.AI
        ) {
          if (state.scores.PLAYER !== state.scores.AI) {
            finish(
              state.scores.PLAYER > state.scores.AI
                ? "PLAYER"
                : "AI",
              "SUDDEN_DEATH"
            );

            return getState();
          }

          state.suddenDeathRound++;
        }
      }

      state.currentTeam = otherTeam(team);
      return getState();
    }

    function getState() {
      return JSON.parse(JSON.stringify(state));
    }

    return {
      recordKick,
      getState
    };
  }

  window.FootballMatchEngine = {
    createMatch
  };
})();