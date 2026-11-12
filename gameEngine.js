(function () {
  "use strict";

  const BASE_PROBABILITIES = {
    correct: { GOAL: 25, SAVED: 65, MISS: 7, POST: 3 },
    wrong: { GOAL: 75, SAVED: 0, MISS: 20, POST: 5 }
  };

  const SHOT_TYPE_MODIFIERS = {
    NORMAL:    { GOAL: 1,    SAVED: 1,    MISS: 1,    POST: 1 },
    PLACEMENT: { GOAL: 1.15, SAVED: 0.80, MISS: 1,    POST: 1 },
    POWER:     { GOAL: 1.10, SAVED: 0.75, MISS: 1.15, POST: 1.20 }
  };

  const POWER_MODIFIERS = {
    LOW:    { GOAL: 0.92, SAVED: 1.08, MISS: 1,    POST: 1 },
    NORMAL: { GOAL: 1,    SAVED: 1,    MISS: 1,    POST: 1 },
    HIGH:   { GOAL: 1.05, SAVED: 0.85, MISS: 1.20, POST: 1.20 }
  };

  const DIRECTIONS = ["LEFT", "CENTER", "RIGHT"];
  const OUTCOMES = ["GOAL", "SAVED", "MISS", "POST"];

  function getProbabilities({
    shotDirection,
    goalkeeperDirection,
    power = "NORMAL",
    shotType = "NORMAL"
  }) {
    if (!DIRECTIONS.includes(shotDirection)) {
      throw new Error("Invalid shot direction");
    }

    if (!DIRECTIONS.includes(goalkeeperDirection)) {
      throw new Error("Invalid goalkeeper direction");
    }

    if (!POWER_MODIFIERS[power]) {
      throw new Error("Invalid shot power");
    }

    if (!SHOT_TYPE_MODIFIERS[shotType]) {
      throw new Error("Invalid shot type");
    }

    const matchup =
      shotDirection === goalkeeperDirection ? "correct" : "wrong";

    const base = BASE_PROBABILITIES[matchup];
    const typeModifier = SHOT_TYPE_MODIFIERS[shotType];
    const powerModifier = POWER_MODIFIERS[power];

    const adjusted = {};
    let total = 0;

    OUTCOMES.forEach(outcome => {
      adjusted[outcome] =
        base[outcome] *
        typeModifier[outcome] *
        powerModifier[outcome];

      total += adjusted[outcome];
    });

    const probabilities = {};

    OUTCOMES.forEach(outcome => {
      probabilities[outcome] = (adjusted[outcome] / total) * 100;
    });

    if (shotDirection === "CENTER") {
      if (goalkeeperDirection === "CENTER") {
        probabilities.SAVED += probabilities.MISS + probabilities.POST;
        probabilities.MISS = 0;
        probabilities.POST = 0;
      } else {
        probabilities.POST += probabilities.MISS;
        probabilities.MISS = 0;
      }
    }

    return probabilities;
  }

  function calculateOutcome({
    shotDirection,
    goalkeeperDirection,
    power = "NORMAL",
    shotType = "NORMAL",
    randomValue = Math.random()
  }) {
    if (
      typeof randomValue !== "number" ||
      randomValue < 0 ||
      randomValue >= 1
    ) {
      throw new Error("randomValue must be between 0 and 1");
    }

    const probabilities = getProbabilities({
      shotDirection,
      goalkeeperDirection,
      power,
      shotType
    });

    const roll = randomValue * 100;
    let cumulative = 0;

    for (const outcome of OUTCOMES) {
      cumulative += probabilities[outcome];

      if (roll < cumulative) {
        return {
          outcome,
          probabilities,
          roll: Number(roll.toFixed(2))
        };
      }
    }

    return {
      outcome: "POST",
      probabilities,
      roll: Number(roll.toFixed(2))
    };
  }

  function simulate(options, attempts = 10000) {
    if (!Number.isInteger(attempts) || attempts < 1) {
      throw new Error("Attempts must be a positive integer");
    }

    const results = {
      GOAL: 0,
      SAVED: 0,
      MISS: 0,
      POST: 0
    };

    for (let i = 0; i < attempts; i++) {
      results[calculateOutcome(options).outcome]++;
    }

    return results;
  }

  window.FootballGameEngine = {
    getProbabilities,
    calculateOutcome,
    simulate
  };
})();