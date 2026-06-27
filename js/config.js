// ================================================================
//  BANDIT CARDS — Configuration & Constants
// ================================================================

const SUPABASE_URL  = 'https://ffztxyeevdqlhvxzcopn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmenR4eWVldmRxbGh2eHpjb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzgxMTMsImV4cCI6MjA4Nzg1NDExM30.EdA8cwETE00YFENj-CN93ScKMFN4yfNNG63BentHiQ4';
const AUTH_DOMAIN   = '@FreeGames.com'; // shared auth across all games

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Global State ─────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let gameId         = null;
let joinCode       = null;
let mySeat         = null;
let isHost         = false;
let isSpectator    = false;
let realtimeChan   = null;
let gameCache      = null;   // cached bandit_games row

// ── Game Constants ───────────────────────────────────────────────
const MAX_PLAYERS      = 10;
const DEFAULT_TARGET   = 200;
const QUICK_TARGET     = 100;
const SEVEN_CARD_BONUS = 15;
