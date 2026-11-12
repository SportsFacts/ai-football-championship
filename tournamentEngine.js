(function () {
  "use strict";

  const ROUNDS = [
    { id: "ROUND_OF_16", label: "Round of 16", matches: 8 },
    { id: "QUARTER_FINALS", label: "Quarter-finals", matches: 4 },
    { id: "SEMI_FINALS", label: "Semi-finals", matches: 2 },
    { id: "FINAL", label: "Final", matches: 1 }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function createTournament({ clubs, selectedClub, difficulty, random = Math.random }) {
    assert(Array.isArray(clubs) && clubs.length === 16, "A tournament requires exactly 16 clubs.");
    assert(new Set(clubs).size === 16 && clubs.every(club => typeof club === "string" && club), "Tournament clubs must be unique non-empty names.");
    assert(clubs.includes(selectedClub), "The selected club must be in the tournament.");
    assert(Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 4, "Difficulty must be from 1 to 4.");
    assert(typeof random === "function", "A random number generator is required.");

    const draw = clubs.slice();
    for (let index = draw.length - 1; index > 0; index--) {
      const sample = random();
      assert(typeof sample === "number" && sample >= 0 && sample < 1, "Random values must be between 0 and 1.");
      const swap = Math.floor(sample * (index + 1));
      [draw[index], draw[swap]] = [draw[swap], draw[index]];
    }

    const fixtures = [];
    for (let index = 0; index < draw.length; index += 2) {
      const matchNumber = index / 2 + 1;
      const homeClub = draw[index];
      const awayClub = draw[index + 1];
      fixtures.push({
        id: `R16-M${matchNumber}`,
        round: ROUNDS[0].id,
        matchNumber,
        homeClub,
        awayClub,
        type: homeClub === selectedClub || awayClub === selectedClub ? "PLAYER" : "SIMULATED",
        status: "READY",
        homeScore: null,
        awayScore: null,
        winner: null,
        loser: null,
        source: null,
        penaltyHistory: [],
        statistics: null,
        completedAt: null
      });
    }

    const tournament = {
      id: createId(),
      status: "IN_PROGRESS",
      selectedClub,
      difficulty,
      currentRound: ROUNDS[0].id,
      champion: null,
      runnerUp: null,
      clubs: clubs.slice(),
      draw: draw.slice(),
      rounds: { ROUND_OF_16: fixtures, QUARTER_FINALS: [], SEMI_FINALS: [], FINAL: [] },
      matches: fixtures.slice(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    validateTournament(tournament);
    return tournament;
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `tournament-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getCurrentPlayerMatch(tournament) {
    if (!tournament || tournament.status !== "IN_PROGRESS") return null;
    return tournament.rounds[tournament.currentRound].find(match =>
      match.type === "PLAYER" && match.status !== "COMPLETED"
    ) || null;
  }

  function markInProgress(tournament, matchId) {
    const match = getMatch(tournament, matchId);
    assert(match.status === "READY", "Only a ready match can be started.");
    match.status = "IN_PROGRESS";
    touch(tournament);
    return match;
  }

  function completeMatch(tournament, matchId, result) {
    const match = getMatch(tournament, matchId);
    assert(match.status === "READY" || match.status === "IN_PROGRESS", "This match cannot be completed.");
    assert(result && Number.isInteger(result.homeScore) && result.homeScore >= 0, "Home score must be a non-negative integer.");
    assert(Number.isInteger(result.awayScore) && result.awayScore >= 0, "Away score must be a non-negative integer.");
    assert(result.homeScore !== result.awayScore, "A completed knockout match must have a winner.");
    assert(result.winner === match.homeClub || result.winner === match.awayClub, "Winner must be one of the clubs in this fixture.");
    assert(result.winner === (result.homeScore > result.awayScore ? match.homeClub : match.awayClub), "The winner must match the final score.");
    assert(result.source === (match.type === "PLAYER" ? "ACTUAL" : "SIMULATED"), "Match source must match its fixture type.");
    assert(Array.isArray(result.penaltyHistory) && result.penaltyHistory.length > 0, "A completed match must contain its penalty history.");
    const validTeams = match.type === "PLAYER" ? ["PLAYER", "AI"] : ["HOME", "AWAY"];
    assert(result.penaltyHistory.every(kick =>
      kick && validTeams.includes(kick.team) &&
      ["GOAL", "SAVED", "MISS", "POST"].includes(kick.outcome)
    ), "Penalty history is invalid for this match type.");
    const playerIsHome = match.type === "PLAYER" && match.homeClub === tournament.selectedClub;
    const homeTeam = match.type === "PLAYER" ? (playerIsHome ? "PLAYER" : "AI") : "HOME";
    const awayTeam = match.type === "PLAYER" ? (playerIsHome ? "AI" : "PLAYER") : "AWAY";
    const homeKicks = result.penaltyHistory.filter(kick => kick.team === homeTeam);
    const awayKicks = result.penaltyHistory.filter(kick => kick.team === awayTeam);
    assert(homeKicks.length > 0 && awayKicks.length > 0, "Both clubs must take at least one penalty.");
    assert(homeKicks.filter(kick => kick.outcome === "GOAL").length === result.homeScore &&
      awayKicks.filter(kick => kick.outcome === "GOAL").length === result.awayScore,
    "Final score must match the penalty history.");

    match.homeScore = result.homeScore;
    match.awayScore = result.awayScore;
    match.winner = result.winner;
    match.loser = result.winner === match.homeClub ? match.awayClub : match.homeClub;
    match.source = result.source;
    match.penaltyHistory = Array.isArray(result.penaltyHistory) ? clone(result.penaltyHistory) : [];
    match.statistics = result.statistics ? clone(result.statistics) : null;
    match.completedAt = new Date().toISOString();
    match.status = "COMPLETED";
    advanceIfRoundComplete(tournament, match.round);
    touch(tournament);
    validateTournament(tournament);
    return match;
  }

  function advanceIfRoundComplete(tournament, roundId) {
    const roundMatches = tournament.rounds[roundId];
    if (!roundMatches.length || roundMatches.some(match => match.status !== "COMPLETED")) return false;
    const roundIndex = ROUNDS.findIndex(round => round.id === roundId);
    if (roundIndex === ROUNDS.length - 1) {
      const final = roundMatches[0];
      tournament.status = "COMPLETED";
      tournament.champion = final.winner;
      tournament.runnerUp = final.loser;
      return true;
    }

    const nextRound = ROUNDS[roundIndex + 1];
    assert(tournament.rounds[nextRound.id].length === 0, "The next round has already been generated.");
    const winners = roundMatches.map(match => match.winner);
    for (let index = 0; index < winners.length; index += 2) {
      const matchNumber = index / 2 + 1;
      const homeClub = winners[index];
      const awayClub = winners[index + 1];
      const match = {
        id: `${roundPrefix(nextRound.id)}-M${matchNumber}`,
        round: nextRound.id,
        matchNumber,
        homeClub,
        awayClub,
        type: homeClub === tournament.selectedClub || awayClub === tournament.selectedClub ? "PLAYER" : "SIMULATED",
        status: "READY",
        homeScore: null,
        awayScore: null,
        winner: null,
        loser: null,
        source: null,
        penaltyHistory: [],
        statistics: null,
        completedAt: null
      };
      tournament.rounds[nextRound.id].push(match);
      tournament.matches.push(match);
    }
    tournament.currentRound = nextRound.id;
    return true;
  }

  function roundPrefix(roundId) {
    return { ROUND_OF_16: "R16", QUARTER_FINALS: "QF", SEMI_FINALS: "SF", FINAL: "F" }[roundId];
  }

  function getMatch(tournament, matchId) {
    const match = tournament?.matches?.find(item => item.id === matchId);
    assert(match, "Tournament match was not found.");
    return match;
  }

  function getProgress(tournament) {
    const completed = tournament.matches.filter(match => match.status === "COMPLETED").length;
    return { completed, remaining: 15 - completed, total: 15 };
  }

  function getStatistics(tournament) {
    const completed = tournament.matches.filter(match => match.status === "COMPLETED");
    const stats = {
      played: completed.length,
      remaining: 15 - completed.length,
      goals: 0,
      attempts: 0,
      saves: 0,
      misses: 0,
      posts: 0,
      highestScoringMatch: null,
      champion: tournament.champion,
      runnerUp: tournament.runnerUp,
      player: { played: 0, wins: 0, losses: 0, goalsScored: 0, goalsConceded: 0, attempts: 0, goals: 0, saves: 0, conversion: 0 }
    };

    completed.forEach(match => {
      stats.goals += match.homeScore + match.awayScore;
      if (!stats.highestScoringMatch || match.homeScore + match.awayScore >
          stats.highestScoringMatch.homeScore + stats.highestScoringMatch.awayScore) {
        stats.highestScoringMatch = match;
      }
      match.penaltyHistory.forEach(kick => {
        stats.attempts++;
        if (kick.outcome === "SAVED") stats.saves++;
        if (kick.outcome === "MISS") stats.misses++;
        if (kick.outcome === "POST") stats.posts++;
      });
      if (match.type === "PLAYER") {
        const playerHome = match.homeClub === tournament.selectedClub;
        const playerScore = playerHome ? match.homeScore : match.awayScore;
        const opponentScore = playerHome ? match.awayScore : match.homeScore;
        stats.player.played++;
        stats.player.wins += match.winner === tournament.selectedClub ? 1 : 0;
        stats.player.losses += match.loser === tournament.selectedClub ? 1 : 0;
        stats.player.goalsScored += playerScore;
        stats.player.goalsConceded += opponentScore;
        stats.player.attempts += match.penaltyHistory.filter(kick =>
          kick.team === "PLAYER" && kick.outcome
        ).length;
        stats.player.goals += match.penaltyHistory.filter(kick =>
          kick.team === "PLAYER" && kick.outcome === "GOAL"
        ).length;
        stats.player.saves += match.penaltyHistory.filter(kick =>
          kick.team === "AI" && kick.outcome === "SAVED"
        ).length;
      }
    });
    stats.player.conversion = stats.player.attempts
      ? Math.round(stats.player.goals / stats.player.attempts * 100)
      : 0;
    return stats;
  }

  function validateTournament(tournament) {
    assert(tournament && typeof tournament === "object", "Tournament state is invalid.");
    assert(Array.isArray(tournament.clubs) && tournament.clubs.length === 16, "Tournament must contain exactly 16 clubs.");
    assert(new Set(tournament.clubs).size === 16, "Tournament clubs contain duplicates.");
    assert(tournament.clubs.includes(tournament.selectedClub), "Selected club is missing from tournament.");
    assert(Number.isInteger(tournament.difficulty) && tournament.difficulty >= 1 && tournament.difficulty <= 4, "Tournament difficulty is invalid.");
    assert(["IN_PROGRESS", "COMPLETED"].includes(tournament.status), "Tournament status is invalid.");
    assert(ROUNDS.some(round => round.id === tournament.currentRound), "Tournament current round is invalid.");
    assert(Array.isArray(tournament.draw) && tournament.draw.length === 16, "Initial draw is invalid.");
    assert(new Set(tournament.draw).size === 16 && tournament.clubs.every(club => tournament.draw.includes(club)), "Initial draw must contain every club exactly once.");
    assert(tournament.rounds && tournament.matches && Array.isArray(tournament.matches), "Tournament fixtures are missing.");
    const seenIds = new Set();
    const eliminated = new Set();
    ROUNDS.forEach((round, roundIndex) => {
      const matches = tournament.rounds[round.id];
      assert(Array.isArray(matches), `Fixtures for ${round.label} are invalid.`);
      if (roundIndex === 0) assert(matches.length === 8, "Round of 16 must have eight fixtures.");
      if (roundIndex > 0) assert(matches.length === 0 || matches.length === round.matches, `${round.label} must be generated as a complete round.`);
      const clubsThisRound = [];
      matches.forEach((match, matchIndex) => {
        assert(!seenIds.has(match.id), "A match ID is duplicated.");
        seenIds.add(match.id);
        assert(match.round === round.id, "Fixture is assigned to the wrong round.");
        assert(match.matchNumber === matchIndex + 1, "Fixture match number is invalid.");
        assert(match.id === `${roundPrefix(round.id)}-M${match.matchNumber}`, "Fixture ID does not match its round and number.");
        assert(!clubsThisRound.includes(match.homeClub) && !clubsThisRound.includes(match.awayClub), "A club appears twice in one round.");
        clubsThisRound.push(match.homeClub, match.awayClub);
        assert(["READY", "IN_PROGRESS", "COMPLETED"].includes(match.status), "Fixture has an invalid status.");
        assert(tournament.clubs.includes(match.homeClub) && tournament.clubs.includes(match.awayClub), "A fixture includes an unknown club.");
        assert(match.type === (match.homeClub === tournament.selectedClub || match.awayClub === tournament.selectedClub ? "PLAYER" : "SIMULATED"), "Fixture type does not match participants.");
        if (roundIndex === 0) {
          assert(match.homeClub === tournament.draw[matchIndex * 2] &&
            match.awayClub === tournament.draw[matchIndex * 2 + 1],
          "Round of 16 fixtures do not match the saved draw.");
        }
        if (match.status === "COMPLETED") {
          assert(match.winner === match.homeClub || match.winner === match.awayClub, "Completed match has no valid winner.");
          assert(match.loser === (match.winner === match.homeClub ? match.awayClub : match.homeClub), "Completed match has an invalid loser.");
          assert(Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) && match.homeScore !== match.awayScore, "Completed match score is invalid.");
          assert(match.winner === (match.homeScore > match.awayScore ? match.homeClub : match.awayClub), "Completed match winner does not match score.");
          assert(match.source === (match.type === "PLAYER" ? "ACTUAL" : "SIMULATED"), "Completed match source does not match fixture type.");
          assert(Array.isArray(match.penaltyHistory) && match.penaltyHistory.length > 0, "Completed match penalty history is missing.");
          const playerIsHome = match.type === "PLAYER" && match.homeClub === tournament.selectedClub;
          const homeTeam = match.type === "PLAYER" ? (playerIsHome ? "PLAYER" : "AI") : "HOME";
          const awayTeam = match.type === "PLAYER" ? (playerIsHome ? "AI" : "PLAYER") : "AWAY";
          assert(match.penaltyHistory.every(kick =>
            kick && (match.type === "PLAYER" ? ["PLAYER", "AI"] : ["HOME", "AWAY"]).includes(kick.team) &&
            ["GOAL", "SAVED", "MISS", "POST"].includes(kick.outcome)
          ), "Completed match penalty history is invalid.");
          assert(match.penaltyHistory.some(kick => kick.team === homeTeam) &&
            match.penaltyHistory.some(kick => kick.team === awayTeam),
          "Both clubs must have penalty attempts recorded.");
          assert(match.penaltyHistory.filter(kick => kick.team === homeTeam && kick.outcome === "GOAL").length === match.homeScore &&
            match.penaltyHistory.filter(kick => kick.team === awayTeam && kick.outcome === "GOAL").length === match.awayScore,
          "Completed match score does not match its penalty history.");
          assert(!eliminated.has(match.winner), "An eliminated club returned to the tournament.");
          eliminated.add(match.loser);
        }
      });
      if (roundIndex > 0 && matches.length) {
        const previousMatches = tournament.rounds[ROUNDS[roundIndex - 1].id];
        assert(previousMatches.every(match => match.status === "COMPLETED"), "A round advanced before every prior fixture completed.");
        matches.forEach((match, index) => {
          const homeWinner = previousMatches[index * 2]?.winner;
          const awayWinner = previousMatches[index * 2 + 1]?.winner;
          assert(match.homeClub === homeWinner && match.awayClub === awayWinner, "A fixture does not contain its correct advancing winners.");
        });
      }
    });
    assert(seenIds.size === tournament.matches.length, "Tournament match list is inconsistent with round fixtures.");
    assert(tournament.matches.every(match => tournament.rounds[match.round].some(item => item === match)), "Tournament fixtures must share a single canonical match state.");
    assert(tournament.status !== "COMPLETED" || (tournament.champion && tournament.runnerUp && tournament.matches.length === 15), "Completed tournament must have a champion and runner-up after 15 matches.");
    assert(tournament.status !== "IN_PROGRESS" || !tournament.champion && !tournament.runnerUp, "An active tournament cannot already have a champion.");
    if (tournament.status === "IN_PROGRESS") {
      const expectedRound = ROUNDS.find(round =>
        tournament.rounds[round.id].length === 0 ||
        tournament.rounds[round.id].some(match => match.status !== "COMPLETED")
      );
      assert(expectedRound && expectedRound.id === tournament.currentRound, "Tournament current round does not match its fixtures.");
    }
    if (tournament.status === "COMPLETED") {
      const final = tournament.rounds.FINAL[0];
      assert(final && final.status === "COMPLETED" &&
        tournament.champion === final.winner && tournament.runnerUp === final.loser,
      "Champion declaration must match the completed Final.");
    }
    return true;
  }

  function touch(tournament) {
    tournament.updatedAt = new Date().toISOString();
  }

  window.FootballTournamentEngine = {
    ROUNDS,
    createTournament,
    getCurrentPlayerMatch,
    markInProgress,
    completeMatch,
    getProgress,
    getStatistics,
    validateTournament
  };
})();
