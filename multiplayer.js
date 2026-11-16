
/* =====================================
   AI FOOTBALL CHAMPIONSHIP
   ONLINE MULTIPLAYER
   ===================================== */

const Multiplayer = (() => {
    let currentRoom = null;
    let currentRole = null;
    let currentUserId = null;
    let roomSubscription = null;

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

            if (hostStatus) {
                hostStatus.textContent = hostConnected
                    ? "Connected"
                    : "Connecting...";
            }

            if (guestStatus) {
                guestStatus.textContent = guestConnected
                    ? "Connected"
                    : "Waiting for opponent...";
            }
        }

        if (currentRole === "guest") {
            if (hostLabel) hostLabel.textContent = "OPPONENT (HOST)";
            if (guestLabel) guestLabel.textContent = "YOU (GUEST)";

            if (hostStatus) {
                hostStatus.textContent = hostConnected
                    ? "Connected"
                    : "Host unavailable";
            }

            if (guestStatus) {
                guestStatus.textContent = guestConnected
                    ? "Connected"
                    : "Connecting...";
            }
        }

        const readyMessage = getElement("roomReadyMessage");

        if (readyMessage) {
            readyMessage.textContent = guestConnected
                ? "Both players are connected! Ready for the match."
                : "Share your room code with your opponent.";
        }
    }

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

                        if (payload.new.guest_user_id) {
                            setStatus("Both players connected!");
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log("AFC REALTIME STATUS:", status);
            });
    }

    async function openRoom(roomId) {
        // Subscribe first so we do not miss a room update.
        await subscribeToRoom(roomId);

        // Fetch the complete room record.
        const room = await fetchRoom(roomId);

        renderRoom(room);
    }

    async function createRoom() {
        try {
            setStatus("Connecting to Supabase...");

            await ensureAuthenticated();

            setStatus("Creating room...");

            const { data, error } = await supabase.rpc(
                "create_multiplayer_room"
            );

            if (error) throw error;

            const result = getFirstRow(data);

            if (!result?.room_id) {
                throw new Error("Room was created, but its ID was not returned.");
            }

            currentRole = "host";

            await openRoom(result.room_id);

            setStatus("Room created successfully!");

            console.log("AFC HOST ROOM:", currentRoom);

        } catch (error) {
            console.error("AFC CREATE ROOM ERROR:", error);
            setStatus(error.message || "Could not create room.");
        }
    }

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

            const result = getFirstRow(data);

            if (!result?.room_id) {
                throw new Error("Could not retrieve the room ID.");
            }

            currentRole = "guest";

            await openRoom(result.room_id);

            setStatus("Joined room successfully!");

            console.log("AFC GUEST ROOM:", currentRoom);

        } catch (error) {
            console.error("AFC JOIN ROOM ERROR:", error);
            setStatus(error.message || "Could not join room.");
        }
    }

    async function leaveRoom() {
        if (roomSubscription) {
            await supabase.removeChannel(roomSubscription);
            roomSubscription = null;
        }

        currentRoom = null;
        currentRole = null;
        currentUserId = null;

        const lobby = getElement("roomLobby");

        if (lobby) {
            lobby.style.display = "none";
            lobby.classList.add("hidden");
        }

        setStatus("You left the lobby on this device.");
    }

    return {
        createRoom,
        joinRoom,
        leaveRoom
    };
})();

window.Multiplayer = Multiplayer;

// Connect multiplayer buttons
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("createRoomButton")
        ?.addEventListener("click", () => Multiplayer.createRoom());

    document.getElementById("joinRoomButton")
        ?.addEventListener("click", () => Multiplayer.joinRoom());

    document.getElementById("leaveRoomButton")
        ?.addEventListener("click", () => Multiplayer.leaveRoom());
});
