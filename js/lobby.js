// ================================================================
//  BANDIT CARDS — Lobby & Waiting Room
// ================================================================

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}

async function doCreateGame() {
  showSync('Creating game…');
  const code = generateCode();
  const isQuick = document.getElementById('quick-play-check')?.checked || false;
  const redrawActions = document.getElementById('redraw-actions-check')?.checked || false;
  const faceDown = document.getElementById('face-down-check')?.checked || false;
  const timer = parseInt(document.getElementById('timer-select')?.value || '60');
  
  const gameData = {
    join_code: code, status: 'waiting', host_id: currentUser.id,
    max_players: 10, 
    target_score: isQuick ? QUICK_TARGET : DEFAULT_TARGET,
    quick_play: isQuick,
    redraw_initial_actions: redrawActions,
    face_down_cards: faceDown,
    turn_timer_secs: timer === 0 ? null : timer
  };

  let { data, error } = await db.from('bandit_games').insert(gameData).select().single();
  
  // FALLBACK: If column is missing in DB, retry without it
  if (error && error.message?.includes('column "redraw_initial_actions" does not exist')) {
    console.warn("[Lobby] Missing 'redraw_initial_actions' column, falling back...");
    delete gameData.redraw_initial_actions;
    const retry = await db.from('bandit_games').insert(gameData).select().single();
    data = retry.data;
    error = retry.error;
  }
  if (error) { showSynced(); addLog('Could not create game: ' + error.message, 'bad'); return; }

  gameId = data.id;
  joinCode = code;
  isHost = true;
  gameCache = data;
  localStorage.setItem('bandit_game_' + currentUser.id, gameId);

  // Auto-claim seat 1 for host
  await claimSeat(1);
  subscribeToGame();
  // Set UI state immediately for better responsiveness (don't wait for renderWaiting fetch)
  document.getElementById('code-display').textContent = code;
  showScreen('scr-waiting');
  renderWaiting();
  showSynced();
}

async function doJoinGame() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const err  = document.getElementById('join-err');
  err.textContent = '';
  if (code.length < 4) { err.textContent = 'Enter a join code.'; return; }

  const { data, error } = await db.from('bandit_games')
    .select('*').eq('join_code', code).in('status', ['waiting','active']).single();
  if (error || !data) { err.textContent = 'Game not found.'; return; }

  gameId = data.id;
  joinCode = data.join_code;
  gameCache = data;
  isHost = data.host_id === currentUser.id;
  localStorage.setItem('bandit_game_' + currentUser.id, gameId);

  subscribeToGame();

  if (data.status === 'active') {
    // Rejoin active game
    const { data: myRow } = await db.from('bandit_players')
      .select('seat_number').eq('game_id', gameId).eq('profile_id', currentUser.id).single();
    if (myRow) {
      mySeat = myRow.seat_number;
      showScreen('scr-game');
      renderGame();
      return;
    }
  }
  showScreen('scr-waiting');
  renderWaiting();
}

async function refreshActiveGames() {
  const section = document.getElementById('active-games-section');
  const list = document.getElementById('active-games-list');
  if (!section || !list || !currentUser) return;

  // Find games where I'm a player
  const { data: myPlayers } = await db.from('bandit_players')
    .select('game_id').eq('profile_id', currentUser.id);
  if (!myPlayers || myPlayers.length === 0) { section.style.display = 'none'; return; }

  const gameIds = myPlayers.map(p => p.game_id);
  const { data, error } = await db.from('bandit_games')
    .select('id, join_code, status, current_round, created_at')
    .in('id', gameIds)
    .in('status', ['waiting', 'active'])
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'flex';
  list.innerHTML = '';
  data.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'auth-btn sec';
    btn.style.cssText = 'font-size:10px;text-align:left;padding:8px 12px;display:flex;justify-content:space-between;';
    const statusTxt = g.status === 'active' ? `ROUND ${g.current_round}` : 'LOBBY';
    const date = new Date(g.created_at).toLocaleDateString([], {month:'short', day:'numeric'});
    btn.innerHTML = `<span><b style="color:var(--primary)">[${g.join_code}]</b> ${statusTxt}</span>
      <span style="opacity:0.6;font-size:8px;">${date}</span>`;
    btn.onclick = () => {
      gameId = g.id; joinCode = g.join_code;
      tryRejoin(g.id);
    };
    
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.marginBottom = '8px';
    
    btn.style.flex = '1';
    btn.style.marginBottom = '0';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'auth-btn';
    delBtn.style.cssText = 'font-size:12px; padding: 0 10px; margin-left: 8px; border-color: var(--danger); color: var(--danger); font-weight: bold; width: auto;';
    delBtn.innerHTML = 'X';
    delBtn.title = "Delete or Leave Game";
    delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to abandon this game?")) {
            await abandonGame(g.id);
        }
    };

    wrapper.appendChild(btn);
    wrapper.appendChild(delBtn);
    list.appendChild(wrapper);
  });
}

async function abandonGame(idToAbandon) {
    showSync('Removing game...');
    
    // Check if user is host
    const { data: g } = await db.from('bandit_games').select('host_id').eq('id', idToAbandon).single();
    if (g && g.host_id === currentUser.id) {
        await db.from('bandit_players').delete().eq('game_id', idToAbandon);
        await db.from('bandit_games').delete().eq('id', idToAbandon);
    } else {
        await db.from('bandit_players').delete().eq('game_id', idToAbandon).eq('profile_id', currentUser.id);
    }

    if (gameId === idToAbandon) {
        gameId = null;
        joinCode = null;
        gameCache = null;
        localStorage.removeItem('bandit_game_' + currentUser.id);
    }

    showSynced();
    refreshActiveGames();
}

async function doJoinAsSpectator() {
  const code = document.getElementById('join-code-input').value.toUpperCase().trim();
  if (!code) return;
  showSync('Joining as spectator…');
  
  const { data: g, error: gErr } = await db.from('bandit_games').select('*').eq('join_code', code).single();
  if (gErr) { addLog('Game not found', 'bad'); showSynced(); return; }

  const { error: sErr } = await db.from('bandit_spectators')
    .upsert({ game_id: g.id, profile_id: currentUser.id });
  
  if (sErr) { addLog('Could not spectate: ' + sErr.message, 'bad'); showSynced(); return; }

  gameId = g.id;
  isSpectator = true;
  localStorage.setItem('bandit_game_' + currentUser.id, gameId);
  subscribeToGame();
  
  if (g.status === 'active' || g.status === 'waiting') {
    if (g.status === 'active') showScreen('scr-game');
    else showScreen('scr-waiting');
    renderGame(); // This will handle waiting vs active
  }
  showSynced();
}

async function claimSeat(seatNumber) {
  showSync('Claiming seat…');
  const name = currentProfile?.username || 'Player';
  const { error } = await db.from('bandit_players')
    .insert({
      game_id: gameId, profile_id: currentUser.id,
      seat_number: seatNumber, display_name: name,
      is_ai: false, is_connected: true, last_seen: new Date().toISOString()
    });
  if (error) {
    addLog('Could not claim seat: ' + error.message, 'bad');
    showSynced();
    return;
  }
  mySeat = seatNumber;
  showSynced();
  renderWaiting();
}

async function addAiPlayer() {
  if (!isHost) return;
  showSync('Adding AI…');
  
  // Find next empty seat
  const { data: players } = await db.from('bandit_players').select('seat_number').eq('game_id', gameId);
  const taken = (players || []).map(p => p.seat_number);
  let nextSeat = 1;
  while (taken.includes(nextSeat)) nextSeat++;
  
  if (nextSeat > gameCache.max_players) { addLog('Game is full!', 'bad'); showSynced(); return; }

  const diff = document.getElementById('ai-difficulty').value;
  const pers = document.getElementById('ai-personality').value;
  const names = ['Unit-01', 'Bandit-Bot', 'Rusty', 'Dealer-X', 'Ace', 'Shadow', 'Neon-7', 'Glitched', 'Vector', 'Ghost'];
  const name = names[Math.floor(Math.random() * names.length)] + ' (AI)';

  const { error } = await db.from('bandit_players')
    .insert({
      game_id: gameId, seat_number: nextSeat, display_name: name,
      is_ai: true, ai_difficulty: parseInt(diff), ai_personality: pers,
      is_connected: true
    });
  
  if (error) addLog('AI failed: ' + error.message, 'bad');
  showSynced();
  renderWaiting();
}

async function releaseSeat(seatNumber) {
  showSync('Releasing…');
  // If it's my seat OR if I'm host and it's an AI seat
  const { data: target } = await db.from('bandit_players')
    .select('*').eq('game_id', gameId).eq('seat_number', seatNumber).single();
  
  if (!target) return;
  const isMySeat = target.profile_id === currentUser.id;
  const isAiSeat = target.is_ai;

  if (isMySeat || (isHost && isAiSeat)) {
    await db.from('bandit_players')
      .delete()
      .eq('game_id', gameId)
      .eq('seat_number', seatNumber);
    if (isMySeat) mySeat = null;
  }

  showSynced();
  renderWaiting();
}

async function doStartGame() {
  if (!isHost) return;
  showSync('Starting game…');

  // Fetch players
  const { data: players } = await db.from('bandit_players')
    .select('seat_number, display_name, profile_id')
    .eq('game_id', gameId)
    .order('seat_number');
  if (!players || players.length < 2) {
    addLog('Need at least 2 players to start!', 'bad');
    showSynced();
    return;
  }

  // Build deck and initial state
  const deck = shuffleDeck(buildDeck());

  // Deal one card to each player
  const hands = {};
  const scores = {};
  players.forEach(p => {
    let card = deck.shift();
    
    // HOUSE RULE: Redraw initial action cards
    if (gameCache.redraw_initial_actions) {
      const drawnActions = [];
      while (card && card.type !== 'number') {
        console.log(`[House Rule] Redrawing initial action card: ${card.name}`);
        drawnActions.push(card);
        card = deck.shift();
      }
      // Put actions back and reshuffle if we had to redraw
      if (drawnActions.length > 0) {
        deck.push(...drawnActions);
        deck.sort(() => Math.random() - 0.5); // Simple reshuffle
      }
    }

    hands[p.seat_number] = {
      cards: [card], status: 'playing', name: p.display_name, 
      lastDrawn: true, is_ai: p.is_ai
    };
    scores[p.seat_number] = 0;
  });

  const roundState = {
    phase: 'playing',
    current_round: 1,
    active_seat: players[0].seat_number,
    dealer_seat: players[0].seat_number,
    hands, scores,
    log: ['Round 1 begins — cards dealt.']
  };

  const updateData = {
    status: 'active', current_round: 1,
    active_seat: players[0].seat_number,
    deck_state: deck, discard_pile: [],
    round_state: roundState,
    updated_at: new Date().toISOString()
  };

  const { error } = await db.from('bandit_games')
    .update(updateData)
    .eq('id', gameId);

  if (error) { 
    addLog('Start failed: ' + error.message, 'bad'); 
    showSynced(); 
    return; 
  }

  // Update local cache and switch screen immediately for the host
  gameCache = { ...gameCache, ...updateData };
  showSynced();
  showScreen('scr-game');
  renderGame();
}

function leaveWaiting() {
  if (mySeat) releaseSeat(mySeat);
  if (realtimeChan) { db.removeChannel(realtimeChan); realtimeChan = null; }
  localStorage.removeItem('bandit_game_' + currentUser.id);
  gameId = null; joinCode = null; mySeat = null; isHost = false; gameCache = null;
  showScreen('scr-lobby');
  refreshActiveGames();
}

function returnToLobby() {
  if (realtimeChan) { db.removeChannel(realtimeChan); realtimeChan = null; }
  localStorage.removeItem('bandit_game_' + currentUser.id);
  gameId = null; joinCode = null; mySeat = null; isHost = false; gameCache = null;
  showScreen('scr-lobby');
  refreshActiveGames();
}
