// ================================================================
//  BANDIT CARDS — Realtime Synchronization
// ================================================================

function subscribeToGame() {
  if (!gameId) return;
  if (realtimeChan) {
    db.removeChannel(realtimeChan);
  }

  realtimeChan = db.channel(`game:${gameId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'bandit_games',
      filter: `id=eq.${gameId}`
    }, payload => {
      onGameUpdate(payload.new);
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'bandit_players',
      filter: `game_id=eq.${gameId}`
    }, () => {
      // Refresh waiting room or game UI if players change
      if (gameCache && gameCache.status === 'waiting') {
        renderWaiting();
      } else if (gameCache && gameCache.status === 'active') {
        // In an active game, player row updates (like is_connected) 
        // are usually handled via game state, but we can refresh if needed.
        renderGame();
      }
    })
    .subscribe();
}

function onGameUpdate(newGame) {
  const oldStatus = gameCache ? gameCache.status : null;
  gameCache = newGame;

  // Handle status transitions
  if (oldStatus === 'waiting' && newGame.status === 'active') {
    enterGame();
  } else if (newGame.status === 'active') {
    renderGame();
  }

  // AI Turn Trigger (Host Only) - Runs on every update
  const rs = newGame.round_state || {};
  const activeSeat = rs.active_seat;
  if (isHost && activeSeat && rs.phase === 'playing') {
    const activeHand = rs.hands[activeSeat];
    if (activeHand && activeHand.is_ai) {
      processAiTurn(activeSeat);
    }
  }

    if (newGame.status === 'active' && rs.phase === 'round_end') {
      // If I'm the host, show the "Next Round" button logic is in the UI
      // UI.js handles showing the right bits based on phase
    } else if (rs.phase === 'gameover') {
      showScreen('scr-gameover');
      renderGameOver();
    } else if (newGame.status === 'finished') {
      showScreen('scr-gameover');
      renderGameOver();
    }

  // Always update the log if it exists in the state
  if (newGame.round_state && newGame.round_state.log) {
    updateLogFromState(newGame.round_state.log);
  }
}

function enterGame() {
  showScreen('scr-game');
  clearLog();
  renderGame();
  addLog('Game started!', 'info');
}

function updateLogFromState(stateLog) {
  const logEl = document.getElementById('game-log');
  if (!logEl) return;
  
  // Simple way: clear and redraw log if lengths differ
  // Advanced way: only add new entries
  const currentCount = logEl.children.length;
  if (stateLog.length > currentCount) {
    for (let i = currentCount; i < stateLog.length; i++) {
      const entry = stateLog[i];
      // Determine type based on content or we could store type in the log array
      let type = '';
      if (entry.includes('BUST')) type = 'bad';
      if (entry.includes('wins') || entry.includes('Safe')) type = 'ok';
      if (entry.includes('begins') || entry.includes('complete')) type = 'info';
      
      addLog(entry, type);
    }
  }
}
