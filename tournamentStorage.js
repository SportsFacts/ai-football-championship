(function () {
  "use strict";

  const STORAGE_KEY = "ai-football-championship:tournament:v1";

  function save(tournament) {
    window.FootballTournamentEngine.validateTournament(tournament);
    try {
      const savedState = { ...tournament };
      delete savedState.matches;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    } catch (error) {
      throw new Error(`Could not save tournament in this browser: ${error.message}`);
    }
  }

  function load() {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    let tournament;
    try {
      tournament = JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Saved tournament data could not be read: ${error.message}`);
    }
    if (!tournament || !tournament.rounds) throw new Error("Saved tournament rounds are missing.");
    tournament.matches = window.FootballTournamentEngine.ROUNDS
      .flatMap(round => tournament.rounds[round.id] || []);
    window.FootballTournamentEngine.validateTournament(tournament);
    let recoveredMatch = false;
    tournament.matches.forEach(match => {
      if (match.type === "PLAYER" && match.status === "IN_PROGRESS") {
        match.status = "READY";
        recoveredMatch = true;
      }
    });
    if (recoveredMatch) save(tournament);
    return tournament;
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.FootballTournamentStorage = { save, load, clear };
})();
