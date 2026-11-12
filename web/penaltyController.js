(function () {
  "use strict";

  function createController(firstKicker) {
    const match = window.FootballMatchEngine.createMatch(firstKicker);

    function resolveCurrentPenalty({
      playerMove,
      aiMove,
      randomValue
    }) {
      const state = match.getState();
      const kickingTeam = state.currentTeam;

      let shotDirection;
      let goalkeeperDirection;
      let power = "NORMAL";
      let shotType = "NORMAL";

      if (kickingTeam === "PLAYER") {
        shotDirection = playerMove.direction;
        goalkeeperDirection = aiMove.direction;
        power = playerMove.power || "NORMAL";
        shotType = playerMove.shotType || "NORMAL";
      } else {
        shotDirection = aiMove.direction;
        goalkeeperDirection = playerMove.direction;
        power = aiMove.power || "NORMAL";
        shotType =
          aiMove.shot_type ||
          aiMove.shotType ||
          "NORMAL";
      }

      const result = window.FootballGameEngine.calculateOutcome({
        shotDirection,
        goalkeeperDirection,
        power,
        shotType,
        ...(randomValue === undefined ? {} : { randomValue })
      });

      const matchState = match.recordKick(
        kickingTeam,
        result.outcome
      );

      return {
        team: kickingTeam,
        shotDirection,
        goalkeeperDirection,
        power,
        shotType,
        outcome: result.outcome,
        probabilities: result.probabilities,
        roll: result.roll,
        matchState
      };
    }

    return {
      resolveCurrentPenalty,
      getState: match.getState
    };
  }

  window.FootballPenaltyController = {
    createController
  };
})();