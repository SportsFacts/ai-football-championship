
/* =====================================
   AI FOOTBALL CHAMPIONSHIP
   ONLINE MULTIPLAYER
   ===================================== */

const Multiplayer = (() => {
    let currentRoom = null;
    let currentRole = null;
    let currentUserId = null;
    let roomSubscription = null;
let onlineMatchOpened = false;
    let clubSelectionOpened = false;
    let clubConfirmed = false;

    const supabase = window.afcSupabase;

    function getElement(id) {
        return document.getElementById(id);
    }

    function setStatus(message) {
        const status = getElement("multiplayerMessage");
        if (status) status.textContent = message;
    }

    function getFirstRow(data) {
        return Array.isArray(data) ? data[0] : data;
    }

    async function ensureAuthenticated() {
        if (!supabase) {
            throw new Error("Supabase client not initialized.");
        }

        const session = await window.afcSupabaseReady;

        if (!session?.user?.id) {
            throw new Error("Player authentication failed. Please refresh.");
        }

        currentUserId = session.user.id;
        return currentUserId;
    }

    async function fetchRoom(roomId) {
        const { data, error } = await supabase
            .from("multiplayer_rooms")
            .select("*")
            .eq("id", roomId)
            .single();

        if (error) throw error;

        return data;
    }

    function updateOpponentClub(room) {
        const opponentText = getElement("multiplayerOpponentClub");
        if (!opponentText) return;

        const opponentClub = currentRole === "host"
            ? room.guest_club
            : room.host_club;

        opponentText.classList.remove("hidden");

        opponentText.textContent = opponentClub
            ? `Opponent selected: ${opponentClub}`
            : "Opponent is choosing a club...";
    }

    // =====================================
    // MULTIPLAYER COIN TOSS DISPLAY
    // =====================================

    function renderMatchState(room) {
        const panel = getElement("multiplayerTossPanel");
        if (!panel) return;

        const bothClubsSelected =
            Boolean(room.host_club && room.guest_club);

        if (!bothClubsSelected) {
            panel.classList.add("hidden");
            return;
        }

        panel.classList.remove("hidden");

        const state = room.match_state || {};
        const toss = state.toss || {};
        const tossCompleted = toss.completed === true;
        const decisionMade = Boolean(toss.choice);

        const waiting = getElement("multiplayerTossWaiting");
        const result = getElement("multiplayerTossResult");
        const choices = getElement("multiplayerTossChoices");
        const readyPanel = getElement("multiplayerReadyPanel");

        const startButton = getElement("startMultiplayerTossButton");
        const winnerText = getElement("multiplayerTossWinner");
        const instruction = getElement("multiplayerTossInstruction");
        const decisionStatus = getElement("multiplayerTossDecisionStatus");
        const shootingOrder = getElement("multiplayerShootingOrder");
        const readyStatus = getElement("multiplayerReadyStatus");

        if (!tossCompleted) {
            waiting?.classList.remove("hidden");
            result?.classList.add("hidden");
            readyPanel?.classList.add("hidden");

            if (startButton) {
                startButton.classList.toggle(
                    "hidden",
                    currentRole !== "host"
                );

                startButton.disabled = false;
                startButton.textContent = "START COIN TOSS";
            }

            const waitingText = waiting?.querySelector("p:last-of-type");

            if (waitingText) {
                waitingText.textContent = currentRole === "host"
                    ? "Both clubs are confirmed. Start the coin toss!"
                    : "Waiting for the host to start the coin toss...";
            }

            return;
        }

        waiting?.classList.add("hidden");
        result?.classList.remove("hidden");

        const winnerRole = toss.winner_role;
        const isWinner = currentRole === winnerRole;

        if (winnerText) {
            winnerText.textContent = isWinner
                ? "YOU WON THE COIN TOSS!"
                : "OPPONENT WON THE COIN TOSS!";
        }

        if (!decisionMade) {
            choices?.classList.toggle("hidden", !isWinner);
            readyPanel?.classList.add("hidden");

            if (instruction) {
                instruction.textContent = isWinner
                    ? "Choose what your team wants to do."
                    : "Waiting for the toss winner to make a decision...";
            }

            if (decisionStatus) {
                decisionStatus.textContent = "";
            }

            return;
        }

        choices?.classList.add("hidden");
        readyPanel?.classList.remove("hidden");

        const choiceText = toss.choice === "kick_first"
            ? "The toss winner chose to KICK FIRST."
            : "The toss winner chose to KEEP FIRST.";

        if (instruction) {
            instruction.textContent = choiceText;
        }

        if (decisionStatus) {
            decisionStatus.textContent = "Decision confirmed!";
        }

        const hostClub = room.host_club;
        const guestClub = room.guest_club;

        const firstShooterClub = toss.first_shooter === "host"
            ? hostClub
            : guestClub;

        const firstKeeperClub = toss.first_keeper === "host"
            ? hostClub
            : guestClub;

        if (shootingOrder) {
            shootingOrder.textContent =
                `${firstShooterClub} shoots first. ${firstKeeperClub} keeps goal first.`;
        }

        
const hostReady = state.players?.host?.ready === true;
const guestReady = state.players?.guest?.ready === true;

const hostReadyLabel = getElement("hostReadyStatus");
const guestReadyLabel = getElement("guestReadyStatus");

const readyButton = getElement("multiplayerReadyButton");
const startMatchButton = getElement("multiplayerStartMatchButton");

if (hostReadyLabel) {
    hostReadyLabel.textContent = hostReady
        ? "HOST: READY ✓"
        : "HOST: NOT READY";
}

if (guestReadyLabel) {
    guestReadyLabel.textContent = guestReady
        ? "GUEST: READY ✓"
        : "GUEST: NOT READY";
}

const ownReady = currentRole === "host"
    ? hostReady
    : guestReady;

// Gameplay has started. Hide the lobby setup panel.
if (state.phase === "in_progress") {
    panel.classList.add("hidden");
    return;
}

// Show READY button only until this player confirms.
if (readyButton) {
    readyButton.classList.toggle("hidden", ownReady);
    readyButton.disabled = false;
}

// Only host can start, and only when both are ready.
if (startMatchButton) {
    startMatchButton.classList.toggle(
        "hidden",
        currentRole !== "host" || !hostReady || !guestReady
    );

    startMatchButton.disabled = false;
}

if (readyStatus) {
    readyStatus.textContent = hostReady && guestReady
        ? "Both players are READY! Host can start the match."
        : "Waiting for both players to confirm readiness...";
}

    }

    // =====================================
// AUTOMATIC ONLINE GAMEPLAY TRANSITION
// =====================================

function openOnlineMatchIfReady(room) {

    if (room?.match_state?.phase !== "in_progress") {
        return false;
    }

    // Prevent duplicate initialization from repeated Realtime updates.
    if (onlineMatchOpened) {
        return true;
    }

    if (!window.AFCOnlineMatch?.start) {
        console.error("AFCOnlineMatch API is not available.");
        setStatus("Could not initialize gameplay. Please refresh.");
        return false;
    }

    const success = window.AFCOnlineMatch.start(room, currentRole);

    if (success) {
        onlineMatchOpened = true;
        console.log("AFC: Both players can now enter gameplay.");
        return true;
    }

    setStatus("Could not initialize the online match. Check the console.");
    return false;
}
    // =====================================
    // RENDER ROOM
    // =====================================

    function renderRoom(room) {
        if (!room) return;

        currentRoom = room;

        const lobby = getElement("roomLobby");

        if (lobby) {
            lobby.classList.remove("hidden");
            lobby.style.display = "block";
        }

        const code = getElement("roomCodeDisplay");

        if (code) {
            code.textContent = room.room_code || "------";
        }

        const hostLabel = getElement("hostPlayerLabel");
        const guestLabel = getElement("guestPlayerLabel");

        const hostStatus = getElement("hostPlayerStatus");
        const guestStatus = getElement("guestPlayerStatus");

        const hostConnected = Boolean(room.host_user_id);
        const guestConnected = Boolean(room.guest_user_id);

        if (currentRole === "host") {
            if (hostLabel) hostLabel.textContent = "YOU (HOST)";
            if (guestLabel) guestLabel.textContent = "OPPONENT (GUEST)";

            if (hostStatus) hostStatus.textContent = "Connected";

            if (guestStatus) {
                guestStatus.textContent = guestConnected
                    ? "Connected"
                    : "Waiting for opponent...";
            }
        }

        if (currentRole === "guest") {
            if (hostLabel) hostLabel.textContent = "OPPONENT (HOST)";
            if (guestLabel) guestLabel.textContent = "YOU (GUEST)";

            if (hostStatus) hostStatus.textContent = "Connected";

            if (guestStatus) {
                guestStatus.textContent = "Connected";
            }
        }

        const readyMessage = getElement("roomReadyMessage");

        if (readyMessage) {
            readyMessage.textContent = guestConnected
                ? "Both players are connected! Ready for club selection."
                : "Share your room code with your opponent.";
        }

        updateOpponentClub(room);
        // Automatically enter gameplay when the host starts the match.
if (room.match_state?.phase === "in_progress") {
    openOnlineMatchIfReady(room);
}

        const ownClub = currentRole === "host"
            ? room.host_club
            : room.guest_club;

        if (ownClub) {
            clubConfirmed = true;

            const continueButton = getElement("clubContinueButton");

            if (continueButton) {
                continueButton.disabled = true;
                continueButton.textContent = "CLUB CONFIRMED";
            }
        }

        if (
            hostConnected &&
            guestConnected &&
            !clubSelectionOpened &&
            !room.host_club &&
            !room.guest_club
        ) {
            clubSelectionOpened = true;
            window.AFCClubSelection?.openMultiplayer();

            setStatus("Both players connected! Choose your clubs.");
        }

        renderMatchState(room);

        if (room.host_club && room.guest_club) {
            if (readyMessage) {
                readyMessage.textContent =
                    "Both clubs are confirmed! Complete the coin toss.";
            }
        }
    }

    // =====================================
    // REALTIME SUBSCRIPTION
    // =====================================

    async function subscribeToRoom(roomId) {
        if (roomSubscription) {
            await supabase.removeChannel(roomSubscription);
            roomSubscription = null;
        }

        roomSubscription = supabase
            .channel(`afc-room-${roomId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "multiplayer_rooms",
                    filter: `id=eq.${roomId}`
                },
                (payload) => {
                    console.log("AFC ROOM UPDATED:", payload.new);

                    if (payload.new) {
                        renderRoom(payload.new);
                    }
                }
            )
            .subscribe((status) => {
                console.log("AFC REALTIME STATUS:", status);
            });
    }

    async function openRoom(roomId) {
        await subscribeToRoom(roomId);

        const room = await fetchRoom(roomId);

        renderRoom(room);
    }

    // =====================================
    // CREATE ROOM
    // =====================================

    async function createRoom() {
        try {
            setStatus("Connecting to Supabase...");

            await ensureAuthenticated();

            setStatus("Creating room...");

            const { data, error } = await supabase.rpc(
                "create_multiplayer_room"
            );

            if (error) throw error;

            const roomResult = getFirstRow(data);

            if (!roomResult?.room_id) {
                throw new Error("Room ID was not returned.");
            }

            currentRole = "host";
            onlineMatchOpened = false;
            clubSelectionOpened = false;
            clubConfirmed = false;

            await openRoom(roomResult.room_id);

            setStatus("Room created successfully! Waiting for opponent...");

            console.log("AFC HOST ROOM:", currentRoom);

        } catch (error) {
            console.error("AFC CREATE ROOM ERROR:", error);
            setStatus(error.message || "Could not create room.");
        }
    }

    // =====================================
    // JOIN ROOM
    // =====================================

    async function joinRoom() {
        try {
            setStatus("Connecting to Supabase...");

            await ensureAuthenticated();

            const roomCode = getElement("joinRoomCode")
                ?.value?.trim().toUpperCase();

            if (!roomCode) {
                setStatus("Enter a room code first.");
                return;
            }

            setStatus("Joining room...");

            const { data, error } = await supabase.rpc(
                "join_multiplayer_room",
                {
                    p_room_code: roomCode
                }
            );

            if (error) throw error;

            const roomResult = getFirstRow(data);

            if (!roomResult?.room_id) {
                throw new Error("Could not retrieve the room ID.");
            }

            currentRole = "guest";
            onlineMatchOpened = false;
            clubSelectionOpened = false;
            clubConfirmed = false;

            await openRoom(roomResult.room_id);

            setStatus("Joined room successfully!");

            console.log("AFC GUEST ROOM:", currentRoom);

        } catch (error) {
            console.error("AFC JOIN ROOM ERROR:", error);
            setStatus(error.message || "Could not join room.");
        }
    }

    // =====================================
    // CONFIRM CLUB SELECTION
    // =====================================

    async function confirmClubSelection() {
        try {
            if (!currentRoom || !currentRole) {
                throw new Error("You are not inside a multiplayer room.");
            }

            if (clubConfirmed) return;

            const selectedClub =
                window.AFCClubSelection?.getSelectedClub();

            if (!selectedClub) {
                setStatus("Please select a club first.");
                return;
            }

            const continueButton = getElement("clubContinueButton");

            if (continueButton) {
                continueButton.disabled = true;
                continueButton.textContent = "SAVING...";
            }

            setStatus("Saving your club...");

            const { error } = await supabase.rpc(
                "set_multiplayer_club",
                {
                    p_room_id: currentRoom.id,
                    p_club: selectedClub
                }
            );

            if (error) throw error;

            clubConfirmed = true;

            if (continueButton) {
                continueButton.textContent = "CLUB CONFIRMED";
            }

            setStatus("Club locked in! Waiting for opponent...");

            const updatedRoom = await fetchRoom(currentRoom.id);

            renderRoom(updatedRoom);

        } catch (error) {
            console.error("AFC CLUB SELECTION ERROR:", error);

            const continueButton = getElement("clubContinueButton");

            if (continueButton && !clubConfirmed) {
                continueButton.disabled = false;
                continueButton.textContent = "CONTINUE →";
            }

            setStatus(error.message || "Could not save your club.");
        }
    }

    // =====================================
    // START MULTIPLAYER COIN TOSS
    // =====================================

    async function startCoinToss() {
        try {
            if (!currentRoom || currentRole !== "host") {
                throw new Error("Only the host can start the coin toss.");
            }

            if (!currentRoom.host_club || !currentRoom.guest_club) {
                throw new Error("Both players must confirm their clubs first.");
            }

            const button = getElement("startMultiplayerTossButton");

            if (button) {
                button.disabled = true;
                button.textContent = "TOSS IN PROGRESS...";
            }

            setStatus("Starting the coin toss...");

            const { error } = await supabase.rpc(
                "start_multiplayer_coin_toss",
                {
                    p_room_id: currentRoom.id
                }
            );

            if (error) throw error;

            const updatedRoom = await fetchRoom(currentRoom.id);

            renderRoom(updatedRoom);

            setStatus("Coin toss completed!");

        } catch (error) {
            console.error("AFC COIN TOSS ERROR:", error);

            const button = getElement("startMultiplayerTossButton");

            if (button) {
                button.disabled = false;
                button.textContent = "START COIN TOSS";
            }

            setStatus(error.message || "Could not start coin toss.");
        }
    }

    // =====================================
    // CHOOSE TOSS DECISION
    // =====================================

    async function chooseTossDecision(choice) {
        try {
            if (!currentRoom || !currentRole) {
                throw new Error("You are not inside a multiplayer room.");
            }

            const choices = getElement("multiplayerTossChoices");

            if (choices) {
                choices.classList.add("hidden");
            }

            const status = getElement("multiplayerTossDecisionStatus");

            if (status) {
                status.textContent = "Saving your decision...";
            }

            setStatus("Confirming toss decision...");

            const { error } = await supabase.rpc(
                "choose_multiplayer_toss_decision",
                {
                    p_room_id: currentRoom.id,
                    p_choice: choice
                }
            );

            if (error) throw error;

            const updatedRoom = await fetchRoom(currentRoom.id);

            renderRoom(updatedRoom);

            setStatus("Toss decision confirmed!");

        } catch (error) {
            console.error("AFC TOSS DECISION ERROR:", error);

            const choices = getElement("multiplayerTossChoices");

            if (choices) {
                choices.classList.remove("hidden");
            }

            const status = getElement("multiplayerTossDecisionStatus");

            if (status) {
                status.textContent = error.message;
            }

            setStatus(error.message || "Could not save toss decision.");
        }
    }

// =====================================
// PLAYER READY CONFIRMATION
// =====================================

async function confirmReady() {
    try {
        if (!currentRoom || !currentRole) {
            throw new Error("You are not inside a multiplayer room.");
        }

        const button = getElement("multiplayerReadyButton");

        if (button) {
            button.disabled = true;
            button.textContent = "SAVING...";
        }

        setStatus("Confirming your readiness...");

        const { error } = await supabase.rpc(
            "set_multiplayer_ready",
            {
                p_room_id: currentRoom.id
            }
        );

        if (error) throw error;

        const updatedRoom = await fetchRoom(currentRoom.id);

        renderRoom(updatedRoom);

        setStatus("You are READY!");

    } catch (error) {
        console.error("AFC READY ERROR:", error);

        const button = getElement("multiplayerReadyButton");

        if (button) {
            button.disabled = false;
            button.textContent = "I'M READY";
        }

        setStatus(error.message || "Could not confirm readiness.");
    }
}


// =====================================
// HOST STARTS THE MATCH
// =====================================

async function startMatch() {
    try {
        if (!currentRoom || currentRole !== "host") {
            throw new Error("Only the host can start the match.");
        }

        const button = getElement("multiplayerStartMatchButton");

        if (button) {
            button.disabled = true;
            button.textContent = "STARTING...";
        }

        setStatus("Starting multiplayer match...");

        const { error } = await supabase.rpc(
            "start_multiplayer_match",
            {
                p_room_id: currentRoom.id
            }
        );

        if (error) throw error;

        const updatedRoom = await fetchRoom(currentRoom.id);

        renderRoom(updatedRoom);

    

    } catch (error) {
        console.error("AFC START MATCH ERROR:", error);

        const button = getElement("multiplayerStartMatchButton");

        if (button) {
            button.disabled = false;
            button.textContent = "START MATCH";
        }

        setStatus(error.message || "Could not start the match.");
    }
}

    // =====================================
    // LEAVE ROOM
    // =====================================


    async function leaveRoom() {
        if (roomSubscription) {
            await supabase.removeChannel(roomSubscription);
            roomSubscription = null;
        }

        currentRoom = null;
        onlineMatchOpened = false;
        currentRole = null;
        currentUserId = null;

        clubSelectionOpened = false;
        clubConfirmed = false;

        const lobby = getElement("roomLobby");

        if (lobby) {
            lobby.style.display = "none";
            lobby.classList.add("hidden");
        }

        const opponentText = getElement("multiplayerOpponentClub");

        if (opponentText) {
            opponentText.classList.add("hidden");
            opponentText.textContent = "Opponent is choosing a club...";
        }

        const tossPanel = getElement("multiplayerTossPanel");

        if (tossPanel) {
            tossPanel.classList.add("hidden");
        }

        window.AFCClubSelection?.closeMultiplayer();

        setStatus("You left the lobby on this device.");
    }

    return {
    createRoom,
    joinRoom,
    leaveRoom,
    confirmClubSelection,
    startCoinToss,
    chooseTossDecision,
    confirmReady,
    startMatch
};
})();

window.Multiplayer = Multiplayer;

// =====================================
// MULTIPLAYER BUTTON EVENTS
// =====================================

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("createRoomButton")
        ?.addEventListener("click", () => Multiplayer.createRoom());

    document.getElementById("joinRoomButton")
        ?.addEventListener("click", () => Multiplayer.joinRoom());

    document.getElementById("leaveRoomButton")
        ?.addEventListener("click", () => Multiplayer.leaveRoom());

    document.getElementById("startMultiplayerTossButton")
        ?.addEventListener("click", () => Multiplayer.startCoinToss());

    document.getElementById("chooseKickFirstButton")
        ?.addEventListener("click", () =>
            Multiplayer.chooseTossDecision("kick_first")
        );

    document.getElementById("chooseKeepFirstButton")
        ?.addEventListener("click", () =>
            Multiplayer.chooseTossDecision("keep_first")
        );
        document.getElementById("multiplayerReadyButton")
    ?.addEventListener("click", () => Multiplayer.confirmReady());

document.getElementById("multiplayerStartMatchButton")
    ?.addEventListener("click", () => Multiplayer.startMatch());
});
