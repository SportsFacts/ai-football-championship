
// ==========================================
// AI FOOTBALL CHAMPIONSHIP
// SUPABASE CONNECTION
// ==========================================

const SUPABASE_URL = "https://qtzysosbayqozvxytmsk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vkGRZVtbUMRKyl2vXUtydQ_tGE-FPCX";

// Create Supabase client
window.afcSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);

// Create or restore a guest player session
window.afcSupabaseReady = (async () => {
    try {
        const { data: sessionData, error: sessionError } =
            await window.afcSupabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (sessionData.session) {
            console.log("AFC: Existing guest session restored.");
            return sessionData.session;
        }

        const { data, error } =
            await window.afcSupabase.auth.signInAnonymously();

        if (error) throw error;

        console.log("AFC: Guest player authenticated.");
        return data.session;

    } catch (error) {
        console.error("AFC SUPABASE CONNECTION ERROR:", error.message);
        throw error;
    }
})();

console.log("AFC: Supabase client initialized.");
