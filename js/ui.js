// ================================================================
//  BANDIT CARDS — UI / Screen Management (Phase 2)
// ================================================================

function showScreen(id) {
  ['scr-auth','scr-lobby','scr-waiting','scr-game','scr-gameover'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

function showAuthPanel(which) {
  document.getElementById('auth-login').classList.toggle('hidden', which !== 'login');
  document.getElementById('auth-register').classList.toggle('hidden', which !== 'register');
}

let syncTimer = null;
function showSync(msg) {
  clearTimeout(syncTimer);
  document.getElementById('syncDot').className = 'sync-dot saving';
  document.getElementById('syncTxt').textContent = msg;
  document.getElementById('syncRow').classList.add('vis');
}
function showSynced() {
  document.getElementById('syncDot').className = 'sync-dot saved';
  document.getElementById('syncTxt').textContent = 'Saved';
  syncTimer = setTimeout(() => document.getElementById('syncRow').classList.remove('vis'), 2000);
}

function addLog(msg, type = '') {
  const log = document.getElementById('game-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'log-entry' + (type ? ' ' + type : '');
  el.textContent = msg;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  const log = document.getElementById('game-log');
  if (log) log.innerHTML = '';
}

async function renderWaiting() {
  const { data: g } = await db.from('bandit_games').select('*').eq('id', gameId).single();
  if (!g) return;
  gameCache = g;

  const { data: players } = await db.from('bandit_players')
    .select('*, profiles(username)')
    .eq('game_id', gameId)
    .order('seat_number');

  const mine = currentUser.id;
  mySeat = null;
  const seatRows = document.getElementById('seat-rows');
  seatRows.innerHTML = '';

  (players || []).forEach(p => {
    if (p.profile_id === mine) mySeat = p.seat_number;
    const isMe = p.profile_id === mine;
    const name = p.profiles?.username || p.display_name;
    const color = isMe ? 'var(--primary)' : 'var(--dim)';
    const badge = isMe ? '<span class="seat-badge you">YOU</span>' : '<span class="seat-badge joined">JOINED</span>';
    
    let btn = '';
    if (isMe) {
      btn = `<button class="seat-btn rel" onclick="releaseSeat(${p.seat_number})">RELEASE</button>`;
    } else if (isHost && p.is_ai) {
      btn = `<button class="seat-btn rel" onclick="releaseSeat(${p.seat_number})">REMOVE</button>`;
    }

    seatRows.innerHTML += `<div class="seat-row ${isMe?'mine':'taken'}">
      <div class="seat-dot" style="background:${color}"></div>
      <div class="seat-name">${name} · SEAT ${p.seat_number}</div>
      ${badge} ${btn}
    </div>`;
  });

  const seatCount = (players || []).length;
  if (!mySeat && seatCount < g.max_players) {
    const nextSeat = seatCount + 1;
    seatRows.innerHTML += `<div class="seat-row">
      <div class="seat-dot" style="background:var(--border)"></div>
      <div class="seat-name" style="color:var(--dim)">EMPTY SEAT ${nextSeat}</div>
      <button class="seat-btn" onclick="claimSeat(${nextSeat})">CLAIM</button>
    </div>`;
  }

  isHost = g.host_id === mine;
  document.getElementById('ai-controls').classList.toggle('hidden', !isHost);
  document.getElementById('code-display').textContent = g.join_code;
  document.getElementById('wait-title').textContent = isHost ? '// WAITING FOR PLAYERS' : '// JOINED — WAITING TO START';

  const btnStart = document.getElementById('btn-start');
  btnStart.style.display = isHost ? 'block' : 'none';
  const canStart = isHost && seatCount >= 2 && mySeat !== null;
  btnStart.disabled = !canStart;

  const statusMsg = seatCount < 2 ? 'Need at least 2 players to start…' : isHost ? 'Ready! You can start the game.' : 'Waiting for host to start…';
  const statusEl = document.getElementById('wait-status');
  statusEl.textContent = statusMsg;
  statusEl.className = 'wait-status' + (seatCount >= 2 ? ' ok' : '');
}

let lastRenderState = null;

function renderGame() {
  if (!gameCache) return;
  const g = gameCache;
  const rs = g.round_state || {};
  const hands = rs.hands || {};
  const scores = rs.scores || {};
  const activeSeat = rs.active_seat;
  const phase = rs.phase || 'waiting';
  const isAwaitingTarget = rs.awaiting_target && rs.awaiting_target.seat === mySeat;

  // Sound Triggers
  if (lastRenderState) {
    // Check if anyone drew a card
    Object.keys(hands).forEach(seat => {
      const oldH = lastRenderState.hands[seat];
      const newH = hands[seat];
      if (oldH && newH) {
        if (newH.cards.length > oldH.cards.length) sfx('zip');
        if (newH.status === 'busted' && oldH.status !== 'busted') sfx('bust');
        if (newH.status === 'stayed' && oldH.status !== 'stayed') sfx('ding');
      }
    });
    if (phase === 'gameover' && lastRenderState.phase !== 'gameover') sfx('ding');
  }
  lastRenderState = JSON.parse(JSON.stringify(rs));

  document.getElementById('hRound').textContent = g.current_round || '-';
  const hUser = document.getElementById('hUser');
  if (hUser) hUser.textContent = currentProfile?.username || '—';

  const area = document.getElementById('players-area');
  area.innerHTML = '';

  const seatNums = Object.keys(hands).map(Number).sort((a,b) => a - b);
  const activeHands = Object.entries(hands).filter(([s, h]) => h.status === 'playing');
  const otherActivePlayers = activeHands.filter(([s]) => parseInt(s) !== mySeat);
  const needsTarget = rs.awaiting_target && rs.awaiting_target.seat === mySeat;

  seatNums.forEach(seat => {
    const h = hands[seat];
    const cards = h.cards || [];
    const status = h.status || 'waiting';
    const name = h.name || `Player ${seat}`;
    const totalScore = scores[seat] || 0;
    const isMe = seat === mySeat;
    const isActive = seat === activeSeat && phase === 'playing';

    // Targeting Logic:
    // Any active player (including self) is a valid target.
    // Self-targeting is only allowed when there are no other active players.
    let isTargetable = false;
    if (needsTarget) {
      if (!isMe && status === 'playing') isTargetable = true;
      if (isMe && status === 'playing' && otherActivePlayers.length === 0) isTargetable = true;
    }

    const rowClass = [
      'player-row',
      isActive ? 'active' : '',
      status === 'busted' ? 'busted' : '',
      status === 'stayed' ? 'stayed' : '',
      h.is_frozen ? 'frozen' : '',
      rs.zap_target_seat === seat ? 'zapped' : '',
      rs.safety_consumed_seat === seat ? 'shield-pulse' : '',
      isTargetable ? 'targetable' : ''
    ].filter(Boolean).join(' ');

    const onclick = isTargetable ? `onclick="selectTarget(${seat})"` : '';

    let statusBadge = '';
    if (h.is_frozen) statusBadge = '<span class="player-status-badge stayed" style="border-color:#0ff;color:#0ff;">FROZEN</span>';
    else if (status === 'playing' && isActive) statusBadge = '<span class="player-status-badge playing">ACTIVE</span>';
    else if (status === 'playing') statusBadge = '<span class="player-status-badge waiting">WAITING</span>';
    else if (status === 'stayed') statusBadge = '<span class="player-status-badge stayed">STAYED</span>';
    else if (status === 'busted') statusBadge = '<span class="player-status-badge busted">BUSTED</span>';

    const cardsHtml = cards.map((c, i) => {
      const isLast = i === cards.length - 1 && h.lastDrawn;
      const isBust = status === 'busted' && i === cards.length - 1;
      
      const isHidden = g.face_down_cards && i > 0 && !isMe;

      let cls = 'card';
      if (isHidden) cls += ' card-back';
      
      if (isBust) cls += ' bust-card';
      else if (isLast) cls += ' new';
      
      if (!isHidden) {
          if (c.type === 'number') {
              cls += ' standard card-val-' + c.value;
          } else if (c.type === 'action') {
              cls += ' action card-val-' + c.name.toLowerCase().replace(' ', '_');
          } else if (c.type === 'modifier') {
              cls += ' modifier card-val-' + c.name.toLowerCase().replace(' ', '_');
          }
      }

      let label = '';
      let sub = '';

      if (!isHidden) {
          label = c.value;
          if (c.type === 'action') label = c.name.charAt(0);
          if (c.type === 'modifier') label = c.name;
          sub = c.type === 'action' ? `<span class="card-label">${c.name}</span>` : '';
      }
      
      return `<div class="${cls}">${label}${sub}</div>`;
    }).join('');

    const handSum = scoreHand(cards);
    const sumText = status === 'busted' ? '<b style="color:var(--danger)">BUST</b>' : `Sum: <b>${handSum}</b>`;

    area.innerHTML += `<div class="${rowClass}" ${onclick}>
      <div class="player-header">
        <span class="player-name ${isMe?'':'other'}">${isMe?'► ':''}${name}${isMe?' (YOU)':''}</span>
        <span class="player-score">Total: <b>${totalScore}</b></span>
        ${statusBadge}
      </div>
      <div class="hand">${cardsHtml}<span class="hand-sum">${sumText}</span></div>
    </div>`;
  });

  const actionBar = document.getElementById('action-bar');
  const isMyTurn = phase === 'playing' && activeSeat === mySeat && !rs.awaiting_target;
  actionBar.classList.toggle('hidden', !isMyTurn && !needsTarget);

  // If I'm targetting, show a specific message
  if (needsTarget) {
    const card = rs.awaiting_target.card;
    const mustSelfTarget = otherActivePlayers.length === 0;
    
    let msg = mustSelfTarget 
      ? `SYSTEM ALERT: NO VALID TARGETS. YOU MUST ${card.name.toUpperCase()} YOURSELF.`
      : `SELECT AN OPPONENT TO ${card.name.toUpperCase()}`;

    actionBar.innerHTML = `<div style="color:var(--accent);font-family:var(--font-display);font-size:10px;letter-spacing:2px;padding:10px;text-align:center;width:100%;">
      ${msg}
    </div>`;
  } else if (isMyTurn) {
    actionBar.innerHTML = `
      <button id="btn-hit" class="game-btn hit" onclick="doHit()">HIT</button>
      <button id="btn-stay" class="game-btn stay" onclick="doStay()">STAY</button>
    `;
  }

  // Next Round Button for host
  if (isHost && phase === 'round_end') {
    const bar = document.getElementById('action-bar');
    bar.classList.remove('hidden');
    bar.innerHTML = `<button id="btn-next-round" class="game-btn next" onclick="startNextRound()" style="width:280px;">START NEXT ROUND</button>`;
  }

  document.getElementById('deck-count').textContent = (g.deck_state || []).length;
  document.getElementById('target-display').textContent = g.target_score;

  // Handle Turn Timer UI
  const timerBox = document.getElementById('timer-box');
  const hTimer = document.getElementById('hTimer');
  if (g.turn_deadline && phase === 'playing') {
    timerBox.classList.remove('hidden');
    startHeaderTimer(g.turn_deadline);
  } else {
    timerBox.classList.add('hidden');
    stopHeaderTimer();
  }

  // Handle Spectator Stats
  if (isSpectator) {
    document.getElementById('stats-panel').classList.remove('hidden');
    renderSpectatorStats();
  } else {
    document.getElementById('stats-panel').classList.add('hidden');
  }
}

function renderSpectatorStats() {
  const stats = calculateStats(gameCache);
  if (!stats) return;

  const content = document.getElementById('stats-content');
  let html = `<div class="stat-row" style="margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:5px;">
    <span class="stat-label">DECK REMAINING</span>
    <span class="stat-val ok" style="font-size:14px;">${stats.deckRemaining}</span>
  </div>`;

  Object.entries(stats.playerStats).forEach(([seat, s]) => {
    const name = gameCache.round_state.hands[seat]?.name || `Seat ${seat}`;
    html += `<div style="margin-bottom:8px;">
        <div class="stat-label" style="font-size:8px;text-transform:uppercase;color:var(--accent-dim);">${name}</div>
        <div class="stat-row">
            <span>BUST PROB</span>
            <span class="stat-val ${parseFloat(s.bustProb) > 50 ? 'bad' : 'ok'}">${s.bustProb}</span>
        </div>
        <div class="stat-row">
            <span>EXP. VALUE</span>
            <span class="stat-val ok">${s.ev} pts</span>
        </div>
    </div>`;
  });

  content.innerHTML = html;
}

let headerTimer = null;
function startHeaderTimer(deadline) {
  stopHeaderTimer();
  const update = () => {
    const remaining = Math.max(0, Math.floor((new Date(deadline) - new Date()) / 1000));
    document.getElementById('hTimer').textContent = remaining + 's';
    if (remaining <= 10) document.getElementById('hTimer').style.color = 'var(--danger)';
    else document.getElementById('hTimer').style.color = 'var(--accent)';
    
    // Auto-Stay if I am host and timer is 0
    if (remaining === 0 && isHost) {
      const rs = gameCache.round_state;
      if (rs.active_seat && rs.phase === 'playing') {
        if (rs.awaiting_target) {
          rs.log.push(`Time expired for ${rs.hands[rs.active_seat].name} — Action forced on self!`);
          selectTarget(rs.active_seat, rs.active_seat);
        } else {
          rs.log.push(`Time expired for ${rs.hands[rs.active_seat].name} — Auto-Stayed.`);
          doStay(rs.active_seat);
        }
      }
      stopHeaderTimer();
    }
  };
  update();
  headerTimer = setInterval(update, 1000);
}
function stopHeaderTimer() {
  clearInterval(headerTimer);
}

function renderGameOver() {
  if (!gameCache) return;
  const rs = gameCache.round_state || {};
  const scores = rs.scores || {};
  const hands = rs.hands || {};

  let maxScore = -1, winnerName = '';
  Object.entries(scores).forEach(([seat, score]) => {
    if (score > maxScore) { maxScore = score; winnerName = hands[seat]?.name || `Player ${seat}`; }
  });

  document.getElementById('gameover-winner').textContent = winnerName;
  
  const theme = localStorage.getItem('bandit_theme');
  let flavor = '';
  if (theme === 'bebop') flavor = '<div style="margin-top:20px;font-size:12px;color:var(--primary);letter-spacing:4px;opacity:0.7;">SEE YOU SPACE COWBOY...</div>';
  else if (theme === 'lagoon') flavor = '<div style="margin-top:20px;font-size:12px;color:var(--accent);letter-spacing:4px;opacity:0.7;">LIFE\'S A BITCH, THEN YOU DIE.</div>';

  const scoreList = document.getElementById('gameover-scores');
  scoreList.innerHTML = Object.entries(scores).sort(([,a],[,b]) => b - a)
    .map(([seat, score]) => `${hands[seat]?.name || 'Player '+seat}: ${score} pts`).join('<br>') + flavor;
}

function copyCode() {
  navigator.clipboard.writeText(gameCache?.join_code || joinCode).then(() => {
    document.getElementById('wait-status').textContent = 'Code copied!';
    setTimeout(renderWaiting, 2000);
  });
}

// ================================================================
// DYNAMIC SCREEN FITTING (Mobile scaling)
// ================================================================
function enforceScreenFit() {
  const mode = window.globalSettings?.displayMode || 'auto';
  const userScale = (window.globalSettings?.resolutionScale || 100) / 100;

  if (mode === 'desktop') {
     document.documentElement.style.setProperty('--app-zoom', userScale);
     return;
  }

  const minW = 420;
  const minH = 750;
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  
  const scaleW = ww / minW;
  const scaleH = wh / minH;
  let scale = Math.min(scaleW, scaleH);
  
  // In 'auto' mode, we now use native CSS media queries instead of JS zoom.
  if (mode === 'auto') {
      scale = 1; 
  }
  
  document.documentElement.style.setProperty('--app-zoom', scale * userScale);
}

// Initial calculation and listener binding
window.addEventListener('resize', enforceScreenFit);
window.addEventListener('orientationchange', () => setTimeout(enforceScreenFit, 100));
enforceScreenFit();
