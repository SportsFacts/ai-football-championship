(function () {
  "use strict";

  const BADGES = {
    "Real Madrid": "RMA", "FC Barcelona": "FCB", "Manchester City": "MCI",
    Liverpool: "LFC", "Manchester United": "MUN", Arsenal: "ARS",
    Chelsea: "CHE", "Tottenham Hotspur": "TH", "Bayern Munich": "BM",
    "Borussia Dortmund": "BVB", "Paris Saint-Germain": "PSG", Juventus: "JUV",
    "Inter Milan": "INT", "AC Milan": "ACM", "Atletico Madrid": "ATM", Napoli: "NAP"
  };
  const ROUND_LABELS = {
    ROUND_OF_16: "Round of 16",
    QUARTER_FINALS: "Quarter-finals",
    SEMI_FINALS: "Semi-finals",
    FINAL: "Final"
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function clubRow(club, match, side, selectedClub) {
    const row = node("div", "bracket-club");
    const won = match.status === "COMPLETED" && match.winner === club;
    const lost = match.status === "COMPLETED" && match.loser === club;
    if (won) row.classList.add("is-winner");
    if (lost) row.classList.add("is-eliminated");
    if (club === selectedClub) row.classList.add("is-player-club");
    const badge = node("span", "club-badge", BADGES[club] || "?");
    const name = node("strong", "bracket-club-name", club || "Awaiting winner");
    const score = node("span", "bracket-score",
      match.status === "COMPLETED" ? String(side === "home" ? match.homeScore : match.awayScore) : "—");
    row.append(badge, name, score);
    return row;
  }

  function matchCard(match, selectedClub, currentRound) {
    const card = node("article", `bracket-match status-${match.status.toLowerCase()}`);
    card.dataset.matchId = match.id;
    if (match.round === currentRound) card.classList.add("is-current-round");
    const heading = node("div", "bracket-match-heading");
    heading.append(
      node("span", "", `MATCH ${String(match.matchNumber).padStart(2, "0")}`),
      node("span", `match-type match-type-${match.type.toLowerCase()}`, match.type === "PLAYER" ? "YOUR MATCH" : "SIMULATED")
    );
    card.append(
      heading,
      clubRow(match.homeClub, match, "home", selectedClub),
      clubRow(match.awayClub, match, "away", selectedClub)
    );
    if (match.status === "IN_PROGRESS") card.appendChild(node("div", "fixture-state", "MATCH IN PROGRESS"));
    return card;
  }

  function render(tournament) {
    const engine = window.FootballTournamentEngine;
    const progress = engine.getProgress(tournament);
    const statistics = engine.getStatistics(tournament);
    const currentPlayerMatch = engine.getCurrentPlayerMatch(tournament);

    text("tournamentPlayerClub", tournament.selectedClub);
    text("tournamentDifficulty", difficultyName(tournament.difficulty));
    text("tournamentCurrentRound", tournament.status === "COMPLETED"
      ? "Tournament complete" : ROUND_LABELS[tournament.currentRound]);
    text("tournamentStatus", tournament.status === "COMPLETED" ? "COMPLETED" : "IN PROGRESS");
    text("tournamentProgressText", `${progress.completed} / ${progress.total} matches`);
    text("tournamentRemaining", `${progress.remaining} matches remaining`);
    const progressBar = document.getElementById("tournamentProgressBar");
    if (progressBar) progressBar.style.width = `${progress.completed / progress.total * 100}%`;
    text("tournamentPlayerRecord", `${statistics.player.wins} W · ${statistics.player.losses} L`);
    text("tournamentPlayerGoals", `${statistics.player.goalsScored} scored · ${statistics.player.goalsConceded} conceded`);
    text("tournamentPlayerConversion", `${statistics.player.conversion}%`);
    text("tournamentPlayerPlayed", statistics.player.played);
    text("tournamentMatchesPlayed", progress.completed);
    text("tournamentGoalCount", statistics.goals);
    text("tournamentPenaltyAttempts", statistics.attempts);
    text("tournamentSaveCount", statistics.saves);
    text("tournamentMissCount", statistics.misses);
    text("tournamentPostCount", statistics.posts);
    text("tournamentChampionName", tournament.champion || "To be decided");
    text("tournamentRunnerUpName", tournament.runnerUp || "To be decided");
    text("tournamentHighestScoring", statistics.highestScoringMatch
      ? `${statistics.highestScoringMatch.homeClub} ${statistics.highestScoringMatch.homeScore}–${statistics.highestScoringMatch.awayScore} ${statistics.highestScoringMatch.awayClub}`
      : "No completed matches");

    renderDraw(tournament.rounds.ROUND_OF_16, tournament.selectedClub);
    const bracket = document.getElementById("tournamentBracket");
    if (bracket) {
      bracket.replaceChildren();
      engine.ROUNDS.forEach(round => {
        const matches = tournament.rounds[round.id];
        const column = node("section", `bracket-round${round.id === tournament.currentRound ? " is-active-round" : ""}`);
        const heading = node("h3", "", round.label);
        const roundCount = matches.filter(match => match.status === "COMPLETED").length;
        const count = node("span", "bracket-round-count", `${roundCount}/${round.matches}`);
        heading.appendChild(count);
        column.appendChild(heading);
        if (!matches.length) {
          column.appendChild(node("p", "bracket-empty", "Winners advance here"));
        } else {
          matches.forEach(match => column.appendChild(matchCard(match, tournament.selectedClub, tournament.currentRound)));
        }
        bracket.appendChild(column);
      });
      renderConnections(tournament, bracket);
    }

    function renderConnections(tournament, bracket) {
      const svgNamespace = "http://www.w3.org/2000/svg";
      const overlay = document.createElementNS(svgNamespace, "svg");
      overlay.setAttribute("class", "bracket-connectors");
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("width", String(bracket.scrollWidth));
      overlay.setAttribute("height", String(bracket.scrollHeight));
      const bounds = bracket.getBoundingClientRect();
      window.FootballTournamentEngine.ROUNDS.slice(0, -1).forEach((round, roundIndex) => {
        const currentMatches = tournament.rounds[round.id];
        const nextMatches = tournament.rounds[
          window.FootballTournamentEngine.ROUNDS[roundIndex + 1].id
        ];
        currentMatches.forEach((match, index) => {
          const nextMatch = nextMatches[Math.floor(index / 2)];
          if (!nextMatch || match.status !== "COMPLETED") return;
          const from = bracket.querySelector(`[data-match-id="${match.id}"]`).getBoundingClientRect();
          const to = bracket.querySelector(`[data-match-id="${nextMatch.id}"]`).getBoundingClientRect();
          const x1 = from.right - bounds.left + bracket.scrollLeft;
          const y1 = from.top + from.height / 2 - bounds.top + bracket.scrollTop;
          const x2 = to.left - bounds.left + bracket.scrollLeft;
          const y2 = to.top + to.height / 2 - bounds.top + bracket.scrollTop;
          const middle = x1 + (x2 - x1) / 2;
          const path = document.createElementNS(svgNamespace, "path");
          path.setAttribute("d", `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`);
          path.setAttribute("class", "bracket-connection");
          overlay.appendChild(path);
        });
      });
      bracket.prepend(overlay);
    }

    const nextMatch = document.getElementById("tournamentNextMatch");
    const playButton = document.getElementById("playTournamentMatchButton");
    if (currentPlayerMatch) {
      const opponent = currentPlayerMatch.homeClub === tournament.selectedClub
        ? currentPlayerMatch.awayClub : currentPlayerMatch.homeClub;
      text("nextMatchRound", ROUND_LABELS[currentPlayerMatch.round]);
      text("nextMatchOpponent", opponent);
      text("nextMatchStatus", currentPlayerMatch.status === "IN_PROGRESS"
        ? "Reconnect and restart this shootout to continue safely." : "Your next knockout match is ready.");
      text("nextMatchBadge", BADGES[opponent] || "?");
      if (nextMatch) nextMatch.classList.remove("hidden");
      if (playButton) {
        playButton.classList.remove("hidden");
        playButton.disabled = false;
        playButton.textContent = currentPlayerMatch.status === "IN_PROGRESS" ? "RESTART MATCH" : "PLAY MATCH";
        playButton.dataset.matchId = currentPlayerMatch.id;
      }
    } else {
      if (nextMatch) nextMatch.classList.add("hidden");
      if (playButton) playButton.classList.add("hidden");
    }

    const journey = document.getElementById("playerJourney");
    if (journey) {
      journey.replaceChildren();
      engine.ROUNDS.forEach(round => {
        const fixture = tournament.rounds[round.id].find(match =>
          match.homeClub === tournament.selectedClub || match.awayClub === tournament.selectedClub
        );
        if (!fixture) return;
        const opponent = fixture.homeClub === tournament.selectedClub ? fixture.awayClub : fixture.homeClub;
        const outcome = fixture.status === "COMPLETED"
          ? fixture.winner === tournament.selectedClub ? "WON" : "ELIMINATED"
          : fixture.status === "IN_PROGRESS" ? "IN PROGRESS" : "UP NEXT";
        const item = node("li", `journey-item journey-${outcome.toLowerCase().replace(" ", "-")}`);
        item.append(node("strong", "", round.label), node("span", "", `vs ${opponent}`), node("small", "", outcome));
        journey.appendChild(item);
      });
    }

    const completed = tournament.status === "COMPLETED";
    toggle("tournamentChampionPanel", completed);
    toggle("tournamentNextMatch", !completed && !!currentPlayerMatch);
    if (completed) {
      const lastPlayerMatch = tournament.matches
        .filter(match => match.type === "PLAYER" && match.status === "COMPLETED")
        .slice(-1)[0];
      text("championHeadline", tournament.champion === tournament.selectedClub
        ? "YOU ARE THE CHAMPION" : "TOURNAMENT CHAMPION");
      text("championSubheading", `${tournament.champion} defeats ${tournament.runnerUp} in the Final.`);
      text("championBadge", BADGES[tournament.champion] || "★");
      text("championFinalScore", finalScore(tournament.rounds.FINAL[0]));
      text("championPlayerResult", tournament.champion === tournament.selectedClub
        ? `${tournament.selectedClub} won all ${statistics.player.played} matches on the road to the title.`
        : lastPlayerMatch
          ? `${tournament.selectedClub} finished in ${ROUND_LABELS[lastPlayerMatch.round]} (${lastPlayerMatch.winner} advanced).`
          : `${tournament.selectedClub} did not reach the final.`);
      toggle("newTournamentButton", true);
    } else {
      toggle("newTournamentButton", false);
    }
    text("tournamentMessage", completed ? "CHAMPION CROWNED" :
      !currentPlayerMatch ? "Your club has been eliminated. The remaining fixtures are being simulated." :
      currentPlayerMatch.round === "ROUND_OF_16" ? "DRAW COMPLETED" :
      `ADVANCED TO ${ROUND_LABELS[currentPlayerMatch.round].toUpperCase()}`);
  }

  function renderDraw(matches, selectedClub) {
    const grid = document.getElementById("drawRevealGrid");
    if (!grid) return;
    grid.replaceChildren();
    matches.forEach(match => {
      const fixture = node("div", `draw-fixture${match.type === "PLAYER" ? " is-player-fixture" : ""}`);
      fixture.append(
        node("span", "draw-match-number", `MATCH ${String(match.matchNumber).padStart(2, "0")}`),
        node("span", "draw-club", `${BADGES[match.homeClub]} · ${match.homeClub}`),
        node("span", "draw-vs", "VS"),
        node("span", "draw-club", `${BADGES[match.awayClub]} · ${match.awayClub}`)
      );
      if (match.homeClub === selectedClub || match.awayClub === selectedClub) {
        fixture.appendChild(node("span", "draw-player-tag", "YOUR ROUND OF 16 MATCH"));
      }
      grid.appendChild(fixture);
    });
  }

  function finalScore(match) {
    return `${match.homeClub} ${match.homeScore}–${match.awayScore} ${match.awayClub}`;
  }

  function difficultyName(level) {
    return ["", "AMATEUR", "PROFESSIONAL", "WORLD CLASS", "LEGENDARY"][level] || "UNKNOWN";
  }

  function text(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function toggle(id, visible) {
    const element = document.getElementById(id);
    if (element) element.classList.toggle("hidden", !visible);
  }

  window.FootballTournamentUI = { render };
})();
