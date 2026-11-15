
/* =====================================
   AI FOOTBALL CHAMPIONSHIP
   ONLINE MULTIPLAYER
   ===================================== */

const Multiplayer = (() => {
    let currentRoom = null;
    let currentPlayer = null;
    let roomSubscription = null;

    const supabase = window.afcSupabase;

    function getElement(id) {
        return document.getElementById(id);
    }

    function setStatus(message) {
    const status = getElement("multiplayerMessage");
    if (status) status.textContent = message;
}

    function generatePlayerId() {
        let id = localStorage.getItem("footballPlayerId");

        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem("footballPlayerId", id);
        }

        return id;
    }

    async function createRoom() {
        try {
            if (!supabase) throw new Error("Supabase client not initialized.");

setStatus("Connecting to Supabase...");
await window.afcSupabaseReady;

setStatus("Creating room...");

            const { data, error } = await supabase.rpc("create_multiplayer_room");

console.log("CREATE ROOM RESPONSE:", data);
console.log("CREATE ROOM RESPONSE TYPE:", typeof data);

if (error) throw error;

currentRoom = data;
displayRoom(data);

            setStatus("Room created successfully!");
        } catch (error) {
            console.error(error);
            setStatus(error.message);
        }
    }

    async function joinRoom() {
        try {
            if (!supabase) throw new Error("Supabase client not initialized.");

setStatus("Connecting to Supabase...");
await window.afcSupabaseReady;

const roomCode = getElement("joinRoomCode")?.value?.trim().toUpperCase();

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

            currentRoom = data;
            currentPlayer = generatePlayerId();

            displayRoom(data);

            setStatus("Joined room successfully!");
        } catch (error) {
            console.error(error);
            setStatus(error.message);
        }
    }

    function displayRoom(room) {
    // Supabase returns an array, so get the first room
    const roomData = Array.isArray(room) ? room[0] : room;

    const lobby = getElement("roomLobby");

    if (lobby) {
        lobby.classList.remove("hidden");
        lobby.style.display = "block";
    }

    const code = getElement("roomCodeDisplay");

    if (code) {
        code.textContent = roomData?.room_code || "Code unavailable";
    }
}

    async function copyRoomCode() {
        const code = getElement("roomCodeDisplay")?.textContent;

        if (!code) return;

        await navigator.clipboard.writeText(code);
        setStatus("Room code copied!");
    }

    function leaveRoom() {
        if (roomSubscription) {
            supabase.removeChannel(roomSubscription);
            roomSubscription = null;
        }

        currentRoom = null;
        currentPlayer = null;

        const lobby = getElement("roomLobby");
        if (lobby) lobby.style.display = "none";

        setStatus("You left the room.");
    }

    return {
        createRoom,
        joinRoom,
        copyRoomCode,
        leaveRoom
    };
})();

window.Multiplayer = Multiplayer;
// Connect Multiplayer buttons
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("createRoomButton")
        ?.addEventListener("click", () => Multiplayer.createRoom());

    document.getElementById("joinRoomButton")
        ?.addEventListener("click", () => Multiplayer.joinRoom());

    document.getElementById("copyRoomCodeButton")

    document.getElementById("leaveRoomButton")
        ?.addEventListener("click", () => Multiplayer.leaveRoom());
});