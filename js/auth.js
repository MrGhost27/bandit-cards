// ================================================================
//  BANDIT CARDS — Authentication (shared with Ironfield)
// ================================================================

async function initApp() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile(currentUser.id);
    // Check for active game to rejoin
    const saved = localStorage.getItem('bandit_game_' + currentUser.id);
    if (saved) {
      const ok = await tryRejoin(saved);
      if (ok) return;
      localStorage.removeItem('bandit_game_' + currentUser.id);
    }
    showScreen('scr-lobby');
  } else {
    showScreen('scr-auth');
  }
}

async function loadProfile(uid) {
  const { data } = await db.from('profiles').select('*').eq('id', uid).single();
  if (data) {
    currentProfile = data;
    const display = data.username ? data.username.charAt(0).toUpperCase() + data.username.slice(1) : data.username;
    const hUser = document.getElementById('hUser');
    const lobbyUser = document.getElementById('lobbyUser');
    if (hUser) hUser.textContent = display;
    if (lobbyUser) lobbyUser.textContent = display;
  }
}

async function doLogin() {
  const user = document.getElementById('au-user').value.trim().toLowerCase();
  const pass = document.getElementById('au-pass').value;
  const err  = document.getElementById('au-err');
  const btn  = document.getElementById('au-btn');
  err.textContent = '';
  if (!user || !pass) { err.textContent = 'Enter callsign and password.'; return; }

  btn.disabled = true; btn.textContent = 'SIGNING IN…';
  const { data, error } = await db.auth.signInWithPassword({
    email: user + AUTH_DOMAIN, password: pass
  });
  btn.disabled = false; btn.textContent = 'SIGN IN';
  if (error) { err.textContent = 'Invalid credentials.'; return; }

  currentUser = data.user;
  await loadProfile(currentUser.id);

  // Check for active game
  const saved = localStorage.getItem('bandit_game_' + currentUser.id);
  if (saved) {
    const ok = await tryRejoin(saved);
    if (ok) return;
    localStorage.removeItem('bandit_game_' + currentUser.id);
  }
  showScreen('scr-lobby');
}

async function doRegister() {
  const user = document.getElementById('rg-user').value.trim().toLowerCase();
  const pass = document.getElementById('rg-pass').value;
  const conf = document.getElementById('rg-conf').value;
  const err  = document.getElementById('rg-err');
  const btn  = document.getElementById('rg-btn');
  err.textContent = '';

  if (user.length < 3 || user.includes(' ')) { err.textContent = 'Callsign must be 3+ chars, no spaces.'; return; }
  if (pass.length < 6) { err.textContent = 'Password must be 6+ characters.'; return; }
  if (pass !== conf) { err.textContent = 'Passwords do not match.'; return; }

  btn.disabled = true; btn.textContent = 'CREATING…';
  const { data, error } = await db.auth.signUp({
    email: user + AUTH_DOMAIN, password: pass
  });
  if (error) { btn.disabled = false; btn.textContent = 'CREATE ACCOUNT'; err.textContent = error.message; return; }

  // Create profile
  const { error: pe } = await db.from('profiles').insert({ id: data.user.id, username: user });
  btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
  if (pe) { err.textContent = 'Callsign taken.'; await db.auth.signOut(); return; }

  currentUser = data.user;
  currentProfile = { id: data.user.id, username: user };
  const display = user.charAt(0).toUpperCase() + user.slice(1);
  const hUser = document.getElementById('hUser');
  const lobbyUser = document.getElementById('lobbyUser');
  if (hUser) hUser.textContent = display;
  if (lobbyUser) lobbyUser.textContent = display;
  showScreen('scr-lobby');
}

async function doSignOut() {
  if (realtimeChan) { await db.removeChannel(realtimeChan); realtimeChan = null; }
  await db.auth.signOut();
  currentUser = null; currentProfile = null;
  gameId = null; joinCode = null; mySeat = null; isHost = false; gameCache = null;
  showScreen('scr-auth');
  showAuthPanel('login');
}

async function tryRejoin(savedGameId) {
  const { data: g } = await db.from('bandit_games')
    .select('*').eq('id', savedGameId).single();
  if (!g) return false;

  // Check I'm a player or spectator
  const { data: myRow } = await db.from('bandit_players')
    .select('seat_number').eq('game_id', savedGameId).eq('profile_id', currentUser.id).single();
  
  if (myRow) {
    mySeat = myRow.seat_number;
    isSpectator = false;
    // Update connected status
    await db.from('bandit_players')
      .update({ is_connected: true, last_seen: new Date().toISOString() })
      .eq('game_id', savedGameId).eq('profile_id', currentUser.id);
  } else {
    const { data: spec } = await db.from('bandit_spectators')
      .select('*').eq('game_id', savedGameId).eq('profile_id', currentUser.id).single();
    if (!spec) return false;
    isSpectator = true;
    mySeat = null;
  }

  gameId = savedGameId;
  joinCode = g.join_code;
  gameCache = g;
  isHost = g.host_id === currentUser.id;

  subscribeToGame();

  if (g.status === 'active') {
    showScreen('scr-game');
    renderGame();
    addLog(isSpectator ? 'Spectating game...' : 'Reconnected to active game.', 'ok');
    return true;
  }
  if (g.status === 'waiting') {
    showScreen('scr-waiting');
    renderWaiting();
    return true;
  }
  return false;
}
