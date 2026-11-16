// ============================================================
// AI FOOTBALL CHAMPIONSHIP
// UI, match presentation, and local AI opponent controller
// ============================================================

const ANIMATION_DURATION_MS = 1050;
const CLUBS = [
    "Real Madrid", "FC Barcelona", "Manchester City", "Liverpool",
    "Manchester United", "Arsenal", "Chelsea", "Tottenham Hotspur",
    "Bayern Munich", "Borussia Dortmund", "Paris Saint-Germain", "Juventus",
    "Inter Milan", "AC Milan", "Atletico Madrid", "Napoli"
];
const CLUB_BADGES = ["RMA", "FCB", "MCI", "LFC", "MUN", "ARS", "CHE", "TH",
    "BM", "BVB", "PSG", "JUV", "INT", "ACM", "ATM", "NAP"];
const DIFFICULTIES = {
    1: "AMATEUR",
    2: "PROFESSIONAL",
    3: "WORLD CLASS",
    4: "LEGENDARY"
};
const OUTCOME_LABELS = {
    GOAL: "GOAL!",
    SAVED: "SAVED!",
    MISS: "WIDE OF POST!",
    POST: "OFF THE POST!"
};


let isConnected = true;
let isReady = false;
let isBusy = false;
let difficultyApplied = false;
let selectedClub = "";
let selectedDifficulty = 2;
let isMultiplayerClubSelection = false;
let offlineSelectedClubBeforeMultiplayer = "";
let firstKicker = null;
let penaltyController = null;
let currentMatch = null;
let matchStarted = false;
let currentPenaltyPrepared = false;
let currentOpponentMove = null;
let currentPlayerMove = null;
let pendingPenaltyId = 0;
let activeScreen = "mainMenu";
let matchPaused = false;
let recoveryRequired = false;
let matchEvents = [];
let soundEnabled = false;
let audioContext = null;
let tournament = null;
let activeTournamentMatchId = null;

const moveSelection = {
    direction: "",
    power: "",
    shotType: ""
};

function $(id) {
    return document.getElementById(id);
}

function addLog(message) {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(entry);
    const log = $("systemLog");
    if (log) log.textContent += entry + "\n";
}

function updateText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function setHidden(id, hidden) {
    const element = $(id);
    if (element) element.classList.toggle("hidden", hidden);
}

function setButtonDisabled(id, disabled) {
    const button = $(id);
    if (button) button.disabled = disabled;
}

function addMatchEvent(description, team = "", details = "") {
    matchEvents.push({ description, team, details });
    if (activeScreen === "gameplayScreen") renderEvents();
}

function showNotice(message, recovery = false) {
    updateText("connectionNoticeText", message);
    setHidden("connectionNotice", false);
    setHidden("restartInterruptedMatchButton", !recovery);
}

function updateConnectionUI() {
    isReady = true; isConnected = true;
    const indicator = $("connectionIndicator"), status = $("connectionStatus");
    if (indicator) indicator.classList.add("is-connected");
    if (status) status.textContent = "AI ONLINE";
    ["beginTournamentButton", "coinTossButton", "startShootoutButton", "nextPenaltyBtn"].forEach(id => setButtonDisabled(id, false));
    updateLockButton();
}

async function sendCommand(data, responseType, predicate = () => true) {
    if (!isReady) throw new Error("AI opponent is not ready.");
    if (!data || typeof data.type !== "string") throw new Error("Invalid game command.");
    await new Promise(resolve => setTimeout(resolve, 120));
    let response;
    switch (data.type) {
        case "HELLO": response = { type: "READY", version: "OFFLINE-AI" }; break;
        case "SET_DIFFICULTY": window.FootballAI.configure(data.level); response = { type: "ACK", command: data.type, level: data.level }; break;
        case "RESET_MATCH": window.FootballAI.reset(); response = { type: "ACK", command: data.type }; break;
        case "COIN_TOSS": response = { type: "TOSS_RESULT", first_kicker: Math.random() < 0.5 ? "PLAYER" : "AI" }; break;
        case "PREPARE_MOVE": window.FootballAI.prepare(data.role); response = { type: "COMMITTED", id: data.id }; break;
        case "RECORD_PLAYER_MOVE":
            window.FootballAI.recordPlayerMove(data.direction, currentMatch?.currentTeam === "PLAYER");
            response = { type: "ACK", command: data.type }; break;
        case "REVEAL": response = { type: "OPPONENT_MOVE", id: data.id, ...window.FootballAI.reveal() }; break;
        case "LED_STATUS": case "MATCH_EVENT": response = { type: "ACK", command: data.type, state: data.state }; break;
        case "PING": response = { type: "PONG" }; break;
        default: response = { type: "ACK", command: data.type };
    }
    if (response.type !== responseType || !predicate(response)) {
        throw new Error("AI returned an unexpected game response.");
    }

    // Dispatch local AI results directly. There is no serial transport or
    // asynchronous hardware response queue in the standalone edition.
    switch (response.type) {
        case "TOSS_RESULT": handleCoinTossResult(response); break;
        case "COMMITTED": handleDecisionCommitted(response); break;
        case "OPPONENT_MOVE": handleOpponentMove(response); break;
        case "ACK": addLog("AI action completed: " + (response.command || data.type)); break;
        case "READY": addLog("Offline AI opponent ready."); break;
        case "PONG": addLog("Offline AI check successful."); break;
    }
    return response;
}

function pulseMatchIndicator(event) {
    addLog(event === "START" ? "AI shootout started." : "AI shootout finished.");
}

function runAction(action) {
    return async () => {
        try {
            await action();
        } catch (error) {
            addLog("ACTION ERROR: " + error.message);
            if (activeScreen !== "mainMenu") showNotice(error.message);
        }
    };
}

function navigateToScreen(screenId) {
    const target = $(screenId);
    if (!target) {
        addLog("NAVIGATION ERROR: Unknown screen " + screenId);
        return false;
    }
    if (screenId === "settingsScreen" && !selectedClub) return false;
    if (screenId === "presentationScreen" && !difficultyApplied) return false;
    if ((screenId === "shootoutIntroScreen" || screenId === "gameplayScreen") &&
        (!currentMatch || !firstKicker)) return false;
    if (screenId === "matchResultScreen" && !currentMatch?.winner) return false;

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.add("hidden");
        screen.classList.remove("screen-active");
        screen.setAttribute("aria-hidden", "true");
    });
    target.classList.remove("hidden");
    target.classList.add("screen-active");
    target.setAttribute("aria-hidden", "false");
    activeScreen = screenId;
    window.scrollTo({ top: 0, behavior: "smooth" });
    updateConnectionUI(isReady ? "connected" : "disconnected");
    if (screenId === "gameplayScreen") renderGameplay();
    return true;
}

function renderClubGrid() {
    const grid = $("clubGrid");
    grid.replaceChildren();
    CLUBS.forEach((club, index) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "club-card";
        card.setAttribute("role", "radio");
        card.setAttribute("aria-checked", String(club === selectedClub));
        card.dataset.club = club;
        const badge = document.createElement("span");
        badge.className = "club-badge";
        badge.textContent = CLUB_BADGES[index];
        const name = document.createElement("span");
        name.className = "club-card-name";
        name.textContent = club;
        card.append(badge, name);
        card.addEventListener("click", () => selectClub(club, index));
        grid.appendChild(card);
    });
    renderSelectedClub();
}

function selectClub(club, index = CLUBS.indexOf(club)) {
    if (!CLUBS.includes(club)) return;
    const changed = selectedClub !== club;
    selectedClub = club;
    document.querySelectorAll(".club-card").forEach(card => {
        const selected = card.dataset.club === club;
        card.setAttribute("aria-checked", String(selected));
    });
    renderSelectedClub(index);
    setButtonDisabled("clubContinueButton", false);
    if (changed) addMatchEvent("Player selected " + club + ".", "PLAYER", "CLUB");
    playSound("click");
}

function renderSelectedClub(index = CLUBS.indexOf(selectedClub)) {
    const badge = $("selectedClubBadge");
    if (badge) badge.textContent = index >= 0 ? CLUB_BADGES[index] : "?";
    updateText("selectedClubName", selectedClub || "Select a club");
    updateText("presentationPlayerName", selectedClub || "YOUR CLUB");
    updateText("introPlayerName", selectedClub || "YOUR CLUB");
    updateText("gamePlayerName", selectedClub || "YOUR CLUB");
    updateText("playerTrackerName", selectedClub || "YOUR CLUB");
    updateText("resultPlayerName", selectedClub || "YOUR CLUB");

    const playerBadge = CLUB_BADGES[index] || "?";
    ["presentationPlayerBadge", "introPlayerBadge", "gamePlayerBadge", "resultPlayerBadge"]
        .forEach(id => updateText(id, playerBadge));
}

function getActiveTournamentMatch() {
    return tournament?.matches.find(match => match.id === activeTournamentMatchId) || null;
}

function getTournamentOpponent() {
    const match = getActiveTournamentMatch();
    if (!match) return "TOURNAMENT OPPONENT";
    return match.homeClub === selectedClub ? match.awayClub : match.homeClub;
}

function updateTournamentMatchLabels() {
    const opponent = getTournamentOpponent();
    const badge = CLUB_BADGES[CLUBS.indexOf(opponent)] || "?";
    ["presentationOpponentName", "introOpponentName", "gameOpponentName",
        "opponentTrackerName", "resultOpponentName"].forEach(id => updateText(id, opponent));
    ["presentationOpponentBadge", "introOpponentBadge", "gameOpponentBadge",
        "resultOpponentBadge"].forEach(id => updateText(id, badge));
    const match = getActiveTournamentMatch();
    const round = match
        ? window.FootballTournamentEngine.ROUNDS.find(item => item.id === match.round)?.label
        : "Tournament match";
    updateText("presentationDifficulty", `${DIFFICULTIES[selectedDifficulty]} · ${round || "TOURNAMENT"}`);
    updateText("introDifficulty", DIFFICULTIES[selectedDifficulty]);
}

function saveTournament() {
    if (tournament) window.FootballTournamentStorage.save(tournament);
}

function renderTournament() {
    if (!tournament) return;
    window.FootballTournamentUI.render(tournament);
    selectedClub = tournament.selectedClub;
    selectedDifficulty = tournament.difficulty;
    renderSelectedClub();
}

function finishSimulatedFixtures() {
    while (tournament && tournament.status === "IN_PROGRESS") {
        const roundMatches = tournament.rounds[tournament.currentRound];
        const simulated = roundMatches.find(match =>
            match.type === "SIMULATED" && match.status === "READY"
        );
        if (simulated) {
            const result = window.FootballTournamentSimulation.simulateMatch(
                simulated.homeClub,
                simulated.awayClub
            );
            window.FootballTournamentEngine.completeMatch(tournament, simulated.id, result);
            saveTournament();
            continue;
        }
        if (window.FootballTournamentEngine.getCurrentPlayerMatch(tournament)) break;
        if (roundMatches.some(match => match.status !== "COMPLETED")) {
            throw new Error("Tournament has an unfinished fixture that cannot be scheduled.");
        }
        break;
    }
    renderTournament();
}

function startNewTournament() {
    if (tournament && tournament.status === "IN_PROGRESS" &&
        !window.confirm("Starting a new tournament will replace the saved tournament. Continue?")) {
        return;
    }
    if (tournament) window.FootballTournamentStorage.clear();
    tournament = null;
    activeTournamentMatchId = null;
    selectedClub = "";
    selectedDifficulty = 2;
    difficultyApplied = false;
    document.querySelectorAll(".difficulty-card").forEach(card => {
        const selected = Number(card.dataset.difficulty) === selectedDifficulty;
        card.classList.toggle("is-selected", selected);
        card.setAttribute("aria-checked", String(selected));
    });
    updateText("difficultyValue", "02");
    setButtonDisabled("clubContinueButton", true);
    setHidden("savedTournamentPrompt", true);
    renderClubGrid();
    if (navigateToScreen("clubScreen")) playSound("click");
}

function selectDifficulty(level) {
    if (!DIFFICULTIES[level]) return;
    selectedDifficulty = Number(level);
    difficultyApplied = false;
    document.querySelectorAll(".difficulty-card").forEach(card => {
        const selected = Number(card.dataset.difficulty) === selectedDifficulty;
        card.classList.toggle("is-selected", selected);
        card.setAttribute("aria-checked", String(selected));
    });
    updateText("difficultyValue", String(selectedDifficulty).padStart(2, "0"));
    updateText("presentationDifficulty", `${DIFFICULTIES[selectedDifficulty]} · KNOCKOUT MATCH`);
    updateText("introDifficulty", DIFFICULTIES[selectedDifficulty]);
    updateText("gameDifficulty", DIFFICULTIES[selectedDifficulty]);
    if (isReady) {
        setButtonDisabled("beginTournamentButton", false);
        setHidden("connectionNotice", true);
    }
    playSound("click");
}

async function beginTournament() {
    if (!selectedClub) {
        showNotice("Choose a club before continuing.");
        navigateToScreen("clubScreen");
        return;
    }
    if (!Number.isInteger(selectedDifficulty) || !DIFFICULTIES[selectedDifficulty]) {
        showNotice("Choose a valid difficulty level.");
        return;
    }
    if (!isReady) {
        showNotice("The AI opponent is not ready. The selected club and difficulty are saved.");
        return;
    }
    if (tournament && tournament.status === "IN_PROGRESS" &&
        !window.confirm("Starting a new tournament will replace the saved tournament. Continue?")) return;
    isBusy = true;
    updateConnectionUI("connected");
    try {
        await sendCommand(
            { type: "SET_DIFFICULTY", level: selectedDifficulty },
            "ACK",
            response => response.command === "SET_DIFFICULTY" &&
                response.level === selectedDifficulty
        );
        if (tournament) window.FootballTournamentStorage.clear();
        tournament = window.FootballTournamentEngine.createTournament({
            clubs: CLUBS,
            selectedClub,
            difficulty: selectedDifficulty
        });
        activeTournamentMatchId = null;
        saveTournament();
        finishSimulatedFixtures();
        difficultyApplied = true;
        setHidden("savedTournamentPrompt", true);
        addLog("Tournament draw generated and saved. " + selectedClub + " enters the Round of 16.");
        navigateToScreen("tournamentScreen");
    } finally {
        isBusy = false;
        updateConnectionUI(isReady ? "connected" : "disconnected");
    }
}

async function startTournamentMatch() {
        if (!tournament || tournament.status !== "IN_PROGRESS" || isBusy) return;
        const match = window.FootballTournamentEngine.getCurrentPlayerMatch(tournament);
        if (!match) {
            finishSimulatedFixtures();
            navigateToScreen("tournamentScreen");
            return;
        }
        
        isBusy = true;
        updateConnectionUI("connected");
        try {
            if (match.status === "READY") {
                window.FootballTournamentEngine.markInProgress(tournament, match.id);
            }
            activeTournamentMatchId = match.id;
            saveTournament();
            await sendCommand({ type: "RESET_MATCH" }, "ACK",
                response => response.command === "RESET_MATCH");
            await sendCommand(
                { type: "SET_DIFFICULTY", level: tournament.difficulty },
                "ACK",
                response => response.command === "SET_DIFFICULTY" &&
                    response.level === tournament.difficulty
            );
            selectedClub = tournament.selectedClub;
            selectedDifficulty = tournament.difficulty;
            difficultyApplied = true;
            firstKicker = null;
            penaltyController = null;
            currentMatch = null;
            matchStarted = false;
            currentPenaltyPrepared = false;
            currentOpponentMove = null;
            currentPlayerMove = null;
            matchPaused = false;
            recoveryRequired = false;
            pendingPenaltyId = 0;
            matchEvents = [];
            updateTournamentMatchLabels();
            updateText("coinTossResult", "The AI will determine who kicks first.");
            setHidden("coinTossContinue", true);
            setButtonDisabled("coinTossButton", false);
            $("coinTossPanel").classList.remove("is-flipping");
            navigateToScreen("presentationScreen");
        } finally {
            isBusy = false;
            updateConnectionUI(isReady ? "connected" : "disconnected");
        }
}

function continueToTournament() {
        if (!tournament || !currentMatch?.winner || !activeTournamentMatchId) return;
        const fixture = getActiveTournamentMatch();
        if (!fixture || fixture.status === "COMPLETED") {
            throw new Error("This tournament match has already been recorded.");
        }
        const playerWon = currentMatch.winner === "PLAYER";
        const homeIsPlayer = fixture.homeClub === tournament.selectedClub;
        const homeScore = homeIsPlayer
            ? currentMatch.scores.PLAYER : currentMatch.scores.AI;
        const awayScore = homeIsPlayer
            ? currentMatch.scores.AI : currentMatch.scores.PLAYER;
        window.FootballTournamentEngine.completeMatch(tournament, fixture.id, {
            homeScore,
            awayScore,
            winner: playerWon ? tournament.selectedClub :
                fixture.homeClub === tournament.selectedClub ? fixture.awayClub : fixture.homeClub,
            source: "ACTUAL",
            penaltyHistory: currentMatch.history,
            statistics: {
                attempts: currentMatch.history.length,
                goals: currentMatch.history.filter(kick => kick.outcome === "GOAL").length,
                saves: currentMatch.history.filter(kick => kick.outcome === "SAVED").length,
                misses: currentMatch.history.filter(kick => kick.outcome === "MISS").length,
                posts: currentMatch.history.filter(kick => kick.outcome === "POST").length
            }
        });
        activeTournamentMatchId = null;
        saveTournament();
        finishSimulatedFixtures();
        navigateToScreen("tournamentScreen");
}

async function flipCoin() {
    if (!isReady || isBusy || firstKicker) return;
    isBusy = true;
    setHidden("coinTossContinue", true);
    $("coinTossPanel").classList.add("is-flipping");
    updateText("coinTossResult", "The coin is in the air...");
    updateConnectionUI("connected");
    try {
        await sendCommand({ type: "COIN_TOSS" }, "TOSS_RESULT");
    } catch (error) {
        $("coinTossPanel").classList.remove("is-flipping");
        throw error;
    } finally {
        isBusy = false;
        updateConnectionUI(isReady ? "connected" : "disconnected");
    }
}

function handleCoinTossResult(response) {
    firstKicker = response.first_kicker;
    if (firstKicker !== "PLAYER" && firstKicker !== "AI") {
        firstKicker = null;
        addLog("ERROR: AI returned an invalid coin-toss result.");
        showNotice("The AI returned an invalid coin toss. Try again.");
        return;
    }

    try {
        penaltyController = window.FootballPenaltyController.createController(firstKicker);
        currentMatch = penaltyController.getState();
        matchStarted = true;
        pulseMatchIndicator("START");
        pendingPenaltyId = 0;
        matchPaused = false;
        recoveryRequired = false;
        updateText("coinTossResult", "Coin toss complete.");
        updateText(
            "firstKickerMessage",
            firstKicker === "PLAYER" ? `${selectedClub} wins the toss and kicks first.` :
                `${getTournamentOpponent()} wins the toss and kicks first.`
        );
        updateText("introFirstKicker", firstKicker === "PLAYER" ? selectedClub : getTournamentOpponent());
        $("coinTossPanel").classList.remove("is-flipping");
        setHidden("coinTossContinue", false);
        setButtonDisabled("coinTossButton", true);
        addMatchEvent(
            firstKicker === "PLAYER"
                ? `${selectedClub} kicks first after the coin toss.`
                : `${getTournamentOpponent()} kicks first after the coin toss.`,
            firstKicker,
            "COIN TOSS"
        );
        updateConnectionUI("connected");
        playSound("whistle");
        addLog("Penalty match initialized. " + firstKicker + " kicks first.");
    } catch (error) {
        addLog("MATCH INITIALIZATION ERROR: " + error.message);
        showNotice("Could not initialize the shootout: " + error.message);
    }
}

function enterShootout() {
    if (!currentMatch || !firstKicker) return;
    renderSelectedClub();
    updateText("introDifficulty", DIFFICULTIES[selectedDifficulty]);
    navigateToScreen("shootoutIntroScreen");
}

async function startShootout() {
    if (!isReady || !currentMatch || matchPaused) {
        showNotice("The AI opponent is ready. Start the shootout.");
        return;
    }
    if (!navigateToScreen("gameplayScreen")) return;
    await prepareCurrentPenalty();
}

function resetMoveSelection() {
    moveSelection.direction = "";
    moveSelection.power = "";
    moveSelection.shotType = "";
    document.querySelectorAll(".choice-button").forEach(button => {
        button.setAttribute("aria-pressed", "false");
        button.disabled = true;
    });
    updateLockButton();
}

function updateLockButton() {
    const playerKicking = currentMatch?.currentTeam === "PLAYER";
    const selectionComplete = !!moveSelection.direction &&
        (!playerKicking || (!!moveSelection.power && !!moveSelection.shotType));
    setButtonDisabled(
        "lockMoveBtn",
        !isReady || !currentPenaltyPrepared || !selectionComplete ||
        isBusy || matchPaused
    );
}

function setMoveSelection(group, value) {
    if (!currentPenaltyPrepared || !isReady || isBusy || matchPaused) return;
    if (!["direction", "power", "shotType"].includes(group)) return;
    moveSelection[group] = value;
    document.querySelectorAll(`[data-choice-group="${group}"]`).forEach(button => {
        const selected = button.dataset.value === value;
        button.setAttribute("aria-pressed", String(selected));
    });
    updateLockButton();
    playSound("click");
}

function updateMatchInfo() {
    if (!currentMatch) return;
    const state = currentMatch;
    const playerKicking = state.currentTeam === "PLAYER";
    const stage = state.stage === "SUDDEN_DEATH";
    const playerTaken = stage ? state.suddenKicks.PLAYER : state.regularKicks.PLAYER;
    const aiTaken = stage ? state.suddenKicks.AI : state.regularKicks.AI;

    updateText("gamePlayerScore", state.scores.PLAYER);
    updateText("gameOpponentScore", state.scores.AI);
    updateText(
        "gameRoundLabel",
        stage
            ? `SUDDEN DEATH ${state.suddenDeathRound}`
            : `PENALTY ${Math.min(state.regularRound, 5)} OF 5`
    );
    updateText("gameKicker", playerKicking ? `${selectedClub} TO KICK` : `${getTournamentOpponent()} TO KICK`);
    updateText("currentKickerLabel", playerKicking ? selectedClub : getTournamentOpponent());
    updateText(
        "gameKickCounts",
        stage
            ? `SUDDEN DEATH ${state.suddenKicks.PLAYER} · ${state.suddenKicks.AI}`
            : `KICKS ${state.regularKicks.PLAYER}/5 · ${state.regularKicks.AI}/5`
    );
    updateText("matchStageBadge", stage ? "SUDDEN DEATH" : "REGULAR");
    updateText(
        "playerRoleTitle",
        playerKicking ? "Choose your shot" : "Choose your goalkeeper dive"
    );
    updateText(
        "directionLabel",
        playerKicking ? "SHOT DIRECTION" : "DIVE DIRECTION"
    );
    updateText(
        "actionDescription",
        currentPenaltyPrepared
            ? playerKicking
                ? "Set direction, power and shot type. Lock to reveal the keeper."
                : "Choose your dive. Lock to reveal the AI striker."
            : "The AI commits its move before you choose."
    );
    setHidden("strikerOptions", !playerKicking);
}

function renderProgress() {
    if (!currentMatch) return;
    const history = currentMatch.history;
    const renderTeam = (team, containerId) => {
        const container = $(containerId);
        container.replaceChildren();
        const teamKicks = history.filter(item => item.team === team);
        const regularKicks = teamKicks.filter(item => item.stage === "REGULAR");
        const suddenKicks = teamKicks.filter(item => item.stage === "SUDDEN_DEATH");

        for (let index = 0; index < 5; index++) {
            const item = regularKicks[index];
            appendKickIndicator(container, item, index + 1, false);
        }
        suddenKicks.forEach((item, index) => {
            appendKickIndicator(container, item, `S${index + 1}`, true);
        });
    };
    renderTeam("PLAYER", "playerTracker");
    renderTeam("AI", "opponentTracker");
}

function appendKickIndicator(container, item, number, sudden) {
    const indicator = document.createElement("span");
    indicator.className = "kick-indicator";
    if (sudden) indicator.classList.add("sudden");
    if (item) {
        indicator.classList.add(item.outcome.toLowerCase());
        indicator.textContent = item.outcome === "GOAL" ? "✓" :
            item.outcome === "SAVED" ? "S" :
            item.outcome === "POST" ? "P" : "×";
        indicator.setAttribute("aria-label", `${sudden ? "Sudden death " : "Penalty "}${number}: ${item.outcome}`);
    } else {
        indicator.textContent = String(number);
        indicator.setAttribute("aria-label", `${sudden ? "Sudden death " : "Penalty "}${number}: pending`);
    }
    container.appendChild(indicator);
}

function getStatistics(history) {
    const stats = { total: history.length, goals: 0, saves: 0, misses: 0, posts: 0 };
    history.forEach(item => {
        if (item.outcome === "GOAL") stats.goals++;
        if (item.outcome === "SAVED") stats.saves++;
        if (item.outcome === "MISS") stats.misses++;
        if (item.outcome === "POST") stats.posts++;
    });
    stats.conversion = stats.total ? Math.round(stats.goals / stats.total * 100) : 0;
    return stats;
}

function renderStatistics() {
    if (!currentMatch) return;
    const stats = getStatistics(currentMatch.history);
    updateText("statTotal", stats.total);
    updateText("statGoals", stats.goals);
    updateText("statSaves", stats.saves);
    updateText("statMisses", stats.misses);
    updateText("statPosts", stats.posts);
    updateText("statConversion", `${stats.conversion}%`);
}

function renderEvents() {
    const list = $("eventList");
    if (!list) return;
    list.replaceChildren();
    updateText("eventCount", matchEvents.length);
    if (!matchEvents.length) {
        const empty = document.createElement("li");
        empty.className = "empty-event";
        empty.textContent = "The first whistle is moments away.";
        list.appendChild(empty);
        return;
    }
    matchEvents.forEach(event => {
        const item = document.createElement("li");
        item.appendChild(document.createTextNode(event.description));
        const details = document.createElement("small");
        details.textContent = [event.team, event.details].filter(Boolean).join(" · ");
        item.appendChild(details);
        list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
}

function renderGameplay() {
    if (!currentMatch) return;
    renderSelectedClub();
    updateText("gameDifficulty", DIFFICULTIES[selectedDifficulty]);
    updateMatchInfo();
    renderProgress();
    renderStatistics();
    renderEvents();
    updateConnectionUI(isReady ? "connected" : "disconnected");
}

async function prepareCurrentPenalty() {
    if (!currentMatch || !matchStarted || currentMatch.status === "FINISHED") return;
    if (!isReady || matchPaused) {
        showNotice("The shootout is paused. Restart this match to continue.");
        return;
    }
    if (isBusy || currentPenaltyPrepared) return;

    pendingPenaltyId++;
    currentOpponentMove = null;
    currentPlayerMove = null;
    currentPenaltyPrepared = false;
    resetMoveSelection();
    isBusy = true;
    setHidden("penaltyResult", true);
    setHidden("pitchCallout", true);
    updateText("commitStatus", "COMMITTING");
    $("commitStatus").classList.remove("is-ready");
    updateMatchInfo();
    updateConnectionUI("connected");

    const role = currentMatch.currentTeam === "PLAYER" ? "GOALKEEPER" : "STRIKER";
    try {
        await sendCommand(
            { type: "PREPARE_MOVE", id: pendingPenaltyId, role },
            "COMMITTED",
            response => response.id === pendingPenaltyId
        );
    } catch (error) {
        isBusy = false;
        updateText("commitStatus", "NOT READY");
        updateConnectionUI(isReady ? "connected" : "disconnected");
        throw error;
    }
}

function handleDecisionCommitted(response) {
    if (response.id !== pendingPenaltyId || !matchStarted || !currentMatch) {
        addLog("Ignoring an unexpected COMMITTED response.");
        return;
    }
    currentPenaltyPrepared = true;
    isBusy = false;
    updateText("commitStatus", "AI READY");
    $("commitStatus").classList.add("is-ready");
    document.querySelectorAll(".choice-button").forEach(button => {
        button.disabled = false;
    });
    updateMatchInfo();
    updateLockButton();
    addLog("AI decision committed secretly.");
}

async function lockPlayerMove() {
    if (!currentMatch || !currentPenaltyPrepared || !isReady || isBusy || matchPaused) return;
    const playerKicking = currentMatch.currentTeam === "PLAYER";
    if (!moveSelection.direction ||
        (playerKicking && (!moveSelection.power || !moveSelection.shotType))) {
        updateText(
            "actionDescription",
            playerKicking
                ? "Select direction, power and shot type before locking."
                : "Select a dive direction before locking."
        );
        return;
    }

    currentPlayerMove = {
        direction: moveSelection.direction,
        power: playerKicking ? moveSelection.power : "NORMAL",
        shotType: playerKicking ? moveSelection.shotType : "NORMAL"
    };
    isBusy = true;
    document.querySelectorAll(".choice-button").forEach(button => {
        button.disabled = true;
    });
    setButtonDisabled("lockMoveBtn", true);
    updateText("commitStatus", "MOVE LOCKED");
    updateConnectionUI("connected");

    try {
        await sendCommand(
            { type: "RECORD_PLAYER_MOVE", direction: currentPlayerMove.direction },
            "ACK",
            response => response.command === "RECORD_PLAYER_MOVE"
        );
        await sendCommand(
            { type: "REVEAL", id: pendingPenaltyId },
            "OPPONENT_MOVE",
            response => response.id === pendingPenaltyId
        );
    } catch (error) {
        isBusy = false;
        if (isReady) {
            document.querySelectorAll(".choice-button").forEach(button => {
                button.disabled = false;
            });
        }
        updateConnectionUI(isReady ? "connected" : "disconnected");
        throw error;
    }
}

function handleOpponentMove(response) {
    if (response.id !== pendingPenaltyId || !currentPenaltyPrepared || !currentPlayerMove) {
        addLog("Ignoring an unexpected opponent move.");
        return;
    }
    currentOpponentMove = {
        direction: response.direction,
        power: response.power,
        shot_type: response.shot_type
    };
    addLog("AI decision revealed: " + JSON.stringify(currentOpponentMove));
    resolvePenalty();
}

function resetPitchAnimation() {
    const scene = $("pitchScene");
    scene.className = "pitch-scene";
    const keeper = $("keeperSprite");
    keeper.className = "keeper-sprite";
    const ball = $("footballSprite");
    ball.style.animation = "none";
    void ball.offsetWidth;
    ball.style.animation = "";
    setHidden("pitchCallout", true);
}

function showPitchAnimation(result) {
    resetPitchAnimation();
    const scene = $("pitchScene");
    const keeper = $("keeperSprite");
    const directionClass = result.shotDirection.toLowerCase();
    const goalkeeperClass = result.goalkeeperDirection.toLowerCase();
    scene.classList.add(`shot-${directionClass}`);
    keeper.classList.add(`keeper-${goalkeeperClass}`);
    scene.classList.add(`play-${result.outcome.toLowerCase()}`);
    updateText("pitchCallout", OUTCOME_LABELS[result.outcome] || result.outcome);
    setHidden("pitchCallout", false);
}

function buildResultDetails(result) {
    const details = $("resultDetails");
    details.replaceChildren();
    const opponent = getTournamentOpponent();
    const shooter = result.team === "PLAYER" ? selectedClub : opponent;
    const goalkeeper = result.team === "PLAYER" ? opponent : selectedClub;
    const values = [
        `${shooter} shot: ${result.shotDirection}`,
        `Power: ${result.power}`,
        `Type: ${result.shotType}`,
        `${goalkeeper} dive: ${result.goalkeeperDirection}`
    ];
    values.forEach(value => {
        const item = document.createElement("span");
        item.textContent = value;
        details.appendChild(item);
    });
}

async function resolvePenalty() {
    if (!penaltyController || !currentPlayerMove || !currentOpponentMove) return;
    isBusy = true;
    try {
        const result = penaltyController.resolveCurrentPenalty({
            playerMove: currentPlayerMove,
            aiMove: currentOpponentMove
        });
        currentMatch = result.matchState;
        currentPenaltyPrepared = false;
        currentPlayerMove = null;
        currentOpponentMove = null;
        const historyItem = currentMatch.history[currentMatch.history.length - 1];
        const teamName = result.team === "PLAYER" ? selectedClub : getTournamentOpponent();
        const stageLabel = historyItem.stage === "SUDDEN_DEATH"
            ? `SUDDEN DEATH ${historyItem.round}`
            : `PENALTY ${historyItem.round}`;
        addMatchEvent(
            `${teamName} ${stageLabel.toLowerCase()}: ${result.outcome}.`,
            teamName,
            stageLabel
        );

        updateText("outcomeTitle", OUTCOME_LABELS[result.outcome] || result.outcome);
        updateText(
            "outcomeDescription",
            result.team === "PLAYER"
                ? `${selectedClub} took the penalty.`
                : `${getTournamentOpponent()} took the penalty.`
        );
        buildResultDetails(result);
        $("penaltyResult").className =
            `result-overlay outcome-${result.outcome.toLowerCase()} hidden`;
        showPitchAnimation(result);
        playSound(result.outcome.toLowerCase());
        await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION_MS));

        updateMatchInfo();
        renderProgress();
        renderStatistics();
        renderEvents();
        updateText("gamePlayerScore", currentMatch.scores.PLAYER);
        updateText("gameOpponentScore", currentMatch.scores.AI);
        isBusy = false;

        if (currentMatch.status === "FINISHED" || currentMatch.winner) {
            showMatchWinner();
            return;
        }
        setHidden("penaltyResult", false);
        setButtonDisabled("nextPenaltyBtn", !isReady || matchPaused);
        updateConnectionUI(isReady ? "connected" : "disconnected");
    } catch (error) {
        isBusy = false;
        updateConnectionUI(isReady ? "connected" : "disconnected");
        addLog("PENALTY RESOLUTION ERROR: " + error.message);
        showNotice("Could not resolve this penalty: " + error.message);
    }
}

function renderFinalStats() {
    const stats = getStatistics(currentMatch.history);
    const values = [
        ["KICKS", stats.total],
        ["GOALS", stats.goals],
        ["SAVES", stats.saves],
        ["MISSES", stats.misses],
        ["POSTS", stats.posts],
        ["CONVERSION", `${stats.conversion}%`],
        ["KEEPER SAVES", stats.saves]
    ];
    const container = $("finalStats");
    container.replaceChildren();
    values.forEach(([label, value]) => {
        const item = document.createElement("div");
        item.className = "final-stat";
        const number = document.createElement("strong");
        number.textContent = value;
        const caption = document.createElement("span");
        caption.textContent = label;
        item.append(number, caption);
        container.appendChild(item);
    });

    const history = $("finalHistory");
    history.replaceChildren();
    currentMatch.history.forEach((kick, index) => {
        const item = document.createElement("li");
        const team = kick.team === "PLAYER" ? selectedClub : getTournamentOpponent();
        const round = kick.stage === "SUDDEN_DEATH"
            ? `Sudden death ${kick.round}`
            : `Penalty ${kick.round}`;
        item.textContent = `${team} · ${round}: ${kick.outcome}`;
        history.appendChild(item);
    });
}

function showMatchWinner() {
    if (!currentMatch?.winner) return;
    matchStarted = false;
    pulseMatchIndicator("END");
    isBusy = false;
    currentPenaltyPrepared = false;
    matchPaused = false;
    updateText(
        "winnerTitle",
        currentMatch.winner === "PLAYER" ? "YOU ADVANCE" : "ELIMINATED"
    );
    updateText(
        "winnerDescription",
        currentMatch.winner === "PLAYER"
            ? `${selectedClub} defeats ${getTournamentOpponent()} and advances.`
            : `${getTournamentOpponent()} defeats ${selectedClub}. Your tournament journey ends here.`
    );
    updateText("resultPlayerScore", currentMatch.scores.PLAYER);
    updateText("resultOpponentScore", currentMatch.scores.AI);
    updateText("resultPlayerName", selectedClub);
    updateText("resultPlayerBadge", CLUB_BADGES[CLUBS.indexOf(selectedClub)] || "?");
    updateTournamentMatchLabels();
    $("matchResultCard").classList.toggle("is-defeat", currentMatch.winner !== "PLAYER");
    $("matchResultCard").classList.toggle("celebrate", currentMatch.winner === "PLAYER");
    updateText("winnerIcon", currentMatch.winner === "PLAYER" ? "★" : "◆");
    renderFinalStats();
    setHidden("continueToTournamentButton", false);
    setHidden("penaltyResult", true);
    navigateToScreen("matchResultScreen");
    playSound(currentMatch.winner === "PLAYER" ? "victory" : "defeat");
    addLog(`MATCH FINISHED. WINNER: ${currentMatch.winner === "PLAYER" ? selectedClub : getTournamentOpponent()}`);
}

async function restartInterruptedMatch() {
    if (!isReady || isBusy || !firstKicker) return;
    isBusy = true;
    updateConnectionUI("connected");
    try {
        await sendCommand(
            { type: "RESET_MATCH" },
            "ACK",
            response => response.command === "RESET_MATCH"
        );
        await sendCommand(
            { type: "SET_DIFFICULTY", level: selectedDifficulty },
            "ACK",
            response => response.command === "SET_DIFFICULTY" &&
                response.level === selectedDifficulty
        );
        penaltyController = window.FootballPenaltyController.createController(firstKicker);
        currentMatch = penaltyController.getState();
        pendingPenaltyId = 0;
        currentPenaltyPrepared = false;
        currentPlayerMove = null;
        currentOpponentMove = null;
        matchEvents = matchEvents.filter(event =>
            event.details === "CLUB" || event.details === "SETUP" || event.details === "COIN TOSS"
        );
        addMatchEvent("Shootout restarted after a connection interruption.", "", "RESTART");
        recoveryRequired = false;
        matchPaused = false;
        difficultyApplied = true;
        updateConnectionUI("connected");
        navigateToScreen("shootoutIntroScreen");
    } finally {
        isBusy = false;
        updateConnectionUI(isReady ? "connected" : "disconnected");
    }
}

async function returnToMenu() {
    if (isBusy) return;
    isBusy = true;
    try {
        if (isReady) {
            await sendCommand(
                { type: "RESET_MATCH" },
                "ACK",
                response => response.command === "RESET_MATCH"
            );
        }
        firstKicker = null;
        currentMatch = null;
        penaltyController = null;
        matchStarted = false;
        currentPenaltyPrepared = false;
        matchPaused = false;
        recoveryRequired = false;
        currentOpponentMove = null;
        currentPlayerMove = null;
        difficultyApplied = false;
        pendingPenaltyId = 0;
        matchEvents = [];
        if (tournament && activeTournamentMatchId) {
            const activeFixture = getActiveTournamentMatch();
            if (activeFixture && activeFixture.status === "IN_PROGRESS") {
                activeFixture.status = "READY";
                saveTournament();
            }
        }
        activeTournamentMatchId = null;
        resetMoveSelection();
        $("coinTossPanel").classList.remove("is-flipping");
        setHidden("coinTossContinue", true);
        updateText("coinTossResult", "The AI will determine the first kicker.");
        setButtonDisabled("coinTossButton", !isReady);
        navigateToScreen("mainMenu");
        if (tournament) {
            updateText("savedTournamentMessage",
                `Saved ${window.FootballTournamentEngine.getProgress(tournament).completed}/15 matches · ${tournament.selectedClub} · ${tournament.status === "COMPLETED" ? "Tournament complete" : "ready to continue"}.`);
            setHidden("savedTournamentPrompt", false);
        }
        addLog("Returned to main menu.");
    } finally {
        isBusy = false;
        updateConnectionUI(isReady ? "connected" : "disconnected");
    }
}

function continueSavedTournament() {
    if (!tournament) return;
    selectedClub = tournament.selectedClub;
    selectedDifficulty = tournament.difficulty;
    difficultyApplied = true;
    const activeMatch = window.FootballTournamentEngine.getCurrentPlayerMatch(tournament);
    activeTournamentMatchId = activeMatch?.id || null;
    setHidden("savedTournamentPrompt", true);
    finishSimulatedFixtures();
    navigateToScreen("tournamentScreen");
}

function playSound(kind) {
    if (!soundEnabled || !audioContext) return;
    const notes = {
        click: [520],
        whistle: [780, 940],
        goal: [440, 660, 880],
        saved: [500, 300],
        miss: [280],
        post: [560, 240],
        victory: [523, 659, 784, 1047],
        defeat: [392, 330, 262]
    }[kind] || [];
    let start = audioContext.currentTime;
    notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(.07, start + .025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + .19);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + .2);
        start += .14;
    });
}

async function toggleSound() {
    soundEnabled = !soundEnabled;
    const button = $("soundToggle");
    button.setAttribute("aria-pressed", String(soundEnabled));
    button.setAttribute("aria-label", soundEnabled ? "Sound on" : "Sound off");
    updateText("soundLabel", soundEnabled ? "SOUND ON" : "SOUND OFF");
    if (soundEnabled) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) {
            soundEnabled = false;
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", "Sound unavailable");
            updateText("soundLabel", "SOUND N/A");
            addLog("Sound is unavailable in this browser.");
            return;
        }
        audioContext = audioContext || new AudioContextConstructor();
        try {
            await audioContext.resume();
            playSound("click");
        } catch (error) {
            addLog("SOUND ERROR: " + error.message);
        }
    }
}

function setupEvents() {
    document.querySelectorAll("[data-screen-link]").forEach(button => {
        button.addEventListener("click", () => navigateToScreen(button.dataset.screenLink));
    });
    $("startTournamentButton").addEventListener("click", runAction(startNewTournament));
    $("clubContinueButton").addEventListener("click", () => {
    if (isMultiplayerClubSelection) {
        window.Multiplayer?.confirmClubSelection();
        return;
    }

    if (selectedClub) navigateToScreen("settingsScreen");
});
    document.querySelectorAll(".difficulty-card").forEach(card => {
        card.addEventListener("click", () => selectDifficulty(Number(card.dataset.difficulty)));
    });
    $("beginTournamentButton").addEventListener("click", runAction(beginTournament));
    $("coinTossButton").addEventListener("click", runAction(flipCoin));
    $("continueToIntroButton").addEventListener("click", enterShootout);
    $("startShootoutButton").addEventListener("click", runAction(startShootout));
    $("lockMoveBtn").addEventListener("click", runAction(lockPlayerMove));
    $("nextPenaltyBtn").addEventListener("click", runAction(async () => {
        setHidden("penaltyResult", true);
        resetPitchAnimation();
        await prepareCurrentPenalty();
    }));
    $("returnMenuButton").addEventListener("click", runAction(returnToMenu));
    $("playTournamentMatchButton").addEventListener("click", runAction(startTournamentMatch));
    $("continueToTournamentButton").addEventListener("click", runAction(continueToTournament));
    $("abandonTournamentButton").addEventListener("click", runAction(returnToMenu));
    $("newTournamentButton").addEventListener("click", runAction(startNewTournament));
    $("continueSavedTournamentButton").addEventListener("click", runAction(continueSavedTournament));
    $("newSavedTournamentButton").addEventListener("click", runAction(startNewTournament));
    $("viewFinalBracketButton").addEventListener("click", () => {
        $("tournamentBracket").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    $("viewTournamentStatisticsButton").addEventListener("click", () => {
        $("tournamentStatsPanel").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    $("championReturnMenuButton").addEventListener("click", runAction(returnToMenu));
    $("viewStatsButton").addEventListener("click", () => {
        $("finalStats").scrollIntoView({ behavior: "smooth", block: "center" });
        $("finalStats").focus({ preventScroll: true });
    });
    $("soundToggle").addEventListener("click", runAction(toggleSound));
    document.querySelectorAll(".choice-button").forEach(button => {
        button.addEventListener("click", () => {
            setMoveSelection(button.dataset.choiceGroup, button.dataset.value);
        });
    });
}

// ==========================================
// MULTIPLAYER CLUB SELECTION API
// ==========================================

window.AFCClubSelection = {
    getClubs() {
        return CLUBS.map((name, index) => ({
            name,
            badge: CLUB_BADGES[index]
        }));
    },

    openMultiplayer() {
        if (!isMultiplayerClubSelection) {
            offlineSelectedClubBeforeMultiplayer = selectedClub;
        }

        isMultiplayerClubSelection = true;
        selectedClub = "";

        renderClubGrid();
        setButtonDisabled("clubContinueButton", true);

        navigateToScreen("clubScreen");
    },

    setSelectedClub(name) {
        if (!CLUBS.includes(name)) return false;

        selectClub(name);
        return true;
    },

    getSelectedClub() {
        return selectedClub;
    },

    isMultiplayerMode() {
        return isMultiplayerClubSelection;
    },

    closeMultiplayer() {
        if (!isMultiplayerClubSelection) return;

        isMultiplayerClubSelection = false;
        selectedClub = offlineSelectedClubBeforeMultiplayer;
        offlineSelectedClubBeforeMultiplayer = "";

        renderClubGrid();
        setButtonDisabled("clubContinueButton", !selectedClub);
    }
};
document.addEventListener("DOMContentLoaded", () => {
    renderClubGrid();
    setupEvents();
    resetMoveSelection();
    document.querySelectorAll(".screen").forEach(screen => {
        const active = screen.id === "mainMenu";
        screen.setAttribute("aria-hidden", String(!active));
    });
    updateText("difficultyValue", "02");
    isReady = true; isConnected = true; difficultyApplied = true;
    updateConnectionUI();
    updateText("coinTossResult", "The AI will determine the first kicker.");
    addLog("AI Football Championship loaded. Offline opponent ready.");
    try {
        tournament = window.FootballTournamentStorage.load();
        if (tournament) {
            selectedClub = tournament.selectedClub;
            selectedDifficulty = tournament.difficulty;
            const progress = window.FootballTournamentEngine.getProgress(tournament);
            updateText("savedTournamentMessage",
                `Saved tournament · ${selectedClub} · ${progress.completed}/15 matches completed.`);
            setHidden("savedTournamentPrompt", false);
            renderSelectedClub();
            addLog("A saved tournament is available to continue.");
        }
    } catch (error) {
        addLog("TOURNAMENT RESTORE ERROR: " + error.message);
        showNotice("The saved tournament could not be restored. Its saved data was left unchanged.");
    }

    addLog("All gameplay runs locally. No hardware, USB, or internet connection required.");
});
