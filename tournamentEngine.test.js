"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
global.localStorage = {
  data: new Map(),
  setItem(key, value) { this.data.set(key, value); },
  getItem(key) { return this.data.get(key) || null; },
  removeItem(key) { this.data.delete(key); }
};

["gameEngine.js", "tournamentEngine.js", "tournamentSimulation.js", "tournamentStorage.js"]
  .forEach(file => require(path.join(__dirname, file)));

const clubs = [
  "Real Madrid", "FC Barcelona", "Manchester City", "Liverpool",
  "Manchester United", "Arsenal", "Chelsea", "Tottenham Hotspur",
  "Bayern Munich", "Borussia Dortmund", "Paris Saint-Germain", "Juventus",
  "Inter Milan", "AC Milan", "Atletico Madrid", "Napoli"
];
const engine = window.FootballTournamentEngine;

test("a keeper cannot save a shot when diving in a different direction", () => {
  const probabilities = window.FootballGameEngine.getProbabilities({
    shotDirection: "LEFT",
    goalkeeperDirection: "RIGHT"
  });
  assert.equal(probabilities.SAVED, 0);

  for (const randomValue of [0, 0.5, 0.8, 0.95, 0.999]) {
    const result = window.FootballGameEngine.calculateOutcome({
      shotDirection: "LEFT",
      goalkeeperDirection: "RIGHT",
      randomValue
    });
    assert.notEqual(result.outcome, "SAVED");
  }
});

test("a keeper can still save a shot when diving in the shot direction", () => {
  const result = window.FootballGameEngine.calculateOutcome({
    shotDirection: "LEFT",
    goalkeeperDirection: "LEFT",
    randomValue: 0.3
  });
  assert.equal(result.outcome, "SAVED");
});

test("center shots stay centered and resolve non-goals from the keeper direction", () => {
  const engine = window.FootballGameEngine;
  const keeperAtCenter = engine.getProbabilities({
    shotDirection: "CENTER",
    goalkeeperDirection: "CENTER"
  });
  assert.equal(keeperAtCenter.MISS, 0);
  assert.equal(keeperAtCenter.POST, 0);

  const keeperAway = engine.getProbabilities({
    shotDirection: "CENTER",
    goalkeeperDirection: "LEFT"
  });
  assert.equal(keeperAway.SAVED, 0);
  assert.equal(keeperAway.MISS, 0);

  assert.equal(engine.calculateOutcome({
    shotDirection: "CENTER",
    goalkeeperDirection: "CENTER",
    randomValue: 0.99
  }).outcome, "SAVED");
  assert.equal(engine.calculateOutcome({
    shotDirection: "CENTER",
    goalkeeperDirection: "LEFT",
    randomValue: 0.99
  }).outcome, "POST");
});

function createTournament(selectedClub = clubs[0]) {
  return engine.createTournament({ clubs, selectedClub, difficulty: 2 });
}

function validPlayerResult(match, wins) {
  const playerIsHome = match.homeClub === clubs[0];
  const playerScore = wins ? 5 : 3;
  const opponentScore = wins ? 4 : 4;
  const penaltyHistory = [
    ...Array.from({ length: playerScore }, () => ({ team: "PLAYER", outcome: "GOAL" })),
    ...Array.from({ length: 5 - playerScore }, () => ({ team: "PLAYER", outcome: "MISS" })),
    ...Array.from({ length: opponentScore }, () => ({ team: "AI", outcome: "GOAL" })),
    ...Array.from({ length: 5 - opponentScore }, () => ({ team: "AI", outcome: "SAVED" }))
  ];
  return {
    homeScore: playerIsHome ? playerScore : opponentScore,
    awayScore: playerIsHome ? opponentScore : playerScore,
    winner: wins ? clubs[0] : playerIsHome ? match.awayClub : match.homeClub,
    source: "ACTUAL",
    penaltyHistory
  };
}

function playToCompletion(tournament, playerWins) {
  let actualMatches = 0;
  while (tournament.status === "IN_PROGRESS") {
    const match = tournament.matches.find(item =>
      item.round === tournament.currentRound && item.status === "READY"
    );
    assert.ok(match, "Each active round must have a ready fixture.");
    if (match.type === "PLAYER") {
      actualMatches++;
      engine.completeMatch(tournament, match.id, validPlayerResult(match, playerWins));
    } else {
      engine.completeMatch(tournament, match.id,
        window.FootballTournamentSimulation.simulateMatch(match.homeClub, match.awayClub));
    }
  }
  return actualMatches;
}

test("draw includes each club exactly once in eight fixtures", () => {
  const tournament = createTournament();
  assert.equal(tournament.rounds.ROUND_OF_16.length, 8);
  assert.equal(tournament.draw.length, 16);
  assert.equal(new Set(tournament.draw).size, 16);
  assert.equal(tournament.draw.filter(club => club === tournament.selectedClub).length, 1);
});

test("a winning player journey completes all 15 fixtures and crowns a champion", () => {
  const tournament = createTournament();
  assert.equal(playToCompletion(tournament, true), 4);
  const stats = engine.getStatistics(tournament);
  assert.equal(tournament.matches.length, 15);
  assert.equal(stats.played, 15);
  assert.equal(tournament.champion, tournament.selectedClub);
  assert.ok(tournament.runnerUp);
  assert.equal(stats.player.wins, 4);
  assert.equal(tournament.rounds.QUARTER_FINALS.length, 4);
  assert.equal(tournament.rounds.SEMI_FINALS.length, 2);
  assert.equal(tournament.rounds.FINAL.length, 1);
});

test("an eliminated player cannot return and the other clubs finish the tournament", () => {
  const tournament = createTournament();
  assert.equal(playToCompletion(tournament, false), 1);
  assert.equal(tournament.matches.length, 15);
  assert.equal(tournament.status, "COMPLETED");
  assert.notEqual(tournament.champion, tournament.selectedClub);
  assert.equal(engine.getStatistics(tournament).player.losses, 1);
});

test("completion rejects duplicate matches and a winner inconsistent with the score", () => {
  const tournament = createTournament();
  const match = tournament.rounds.ROUND_OF_16.find(item => item.type === "SIMULATED");
  const simulated = window.FootballTournamentSimulation.simulateMatch(match.homeClub, match.awayClub);
  engine.completeMatch(tournament, match.id, simulated);
  assert.throws(() => engine.completeMatch(tournament, match.id, simulated), /cannot be completed/);

  const next = createTournament();
  const fixture = next.rounds.ROUND_OF_16.find(item => item.type === "SIMULATED");
  assert.throws(() => engine.completeMatch(next, fixture.id, {
    homeScore: 1,
    awayScore: 0,
    winner: fixture.awayClub,
    source: "SIMULATED",
    penaltyHistory: [{ team: "HOME", outcome: "GOAL" }]
  }), /winner must match the final score/);
});

test("simulated matches resolve a tied shootout through sudden death", () => {
  let index = 0;
  const sequence = [];
  for (let kick = 0; kick < 10; kick++) sequence.push(0, 0, 0.5);
  sequence.push(0, 0, 0.1, 0, 0, 0.95);
  const result = window.FootballTournamentSimulation.simulateMatch(
    "Home", "Away", () => sequence[index++]
  );
  assert.equal(result.penaltyHistory.length, 12);
  assert.equal(result.penaltyHistory[10].stage, "SUDDEN_DEATH");
  assert.notEqual(result.homeScore, result.awayScore);
});

test("saved fixtures recover without restoring an unfinished penalty", () => {
  const tournament = createTournament();
  const playerMatch = engine.getCurrentPlayerMatch(tournament);
  engine.markInProgress(tournament, playerMatch.id);
  window.FootballTournamentStorage.save(tournament);
  const restored = window.FootballTournamentStorage.load();
  const recoveredMatch = restored.matches.find(match => match.id === playerMatch.id);
  assert.equal(recoveredMatch.status, "READY");
  assert.equal(recoveredMatch, restored.rounds[restored.currentRound]
    .find(match => match.id === playerMatch.id));
});
