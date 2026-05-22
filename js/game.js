// ================================================================
//  BANDIT CARDS — Core Game Loop (Phase 2)
// ================================================================

// ── HIT: Draw a card ─────────────────────────────────────────────
async function doHit(actingSeat = null) {
  const seat = actingSeat || mySeat;
  if (!gameCache || !seat) return;
  const g = gameCache;
  const rs = { ...g.round_state };
  delete rs.zap_target_seat;
  delete rs.safety_consumed_seat;
  if (rs.active_seat !== seat || rs.phase !== 'playing') return;
  if (rs.awaiting_target) {
    if (seat === mySeat) addLog('Select a target for your action card first!', 'info');
    return;
  }

  let deck = [...(g.deck_state || [])];
  const discard = [...(g.discard_pile || [])];

  if (deck.length === 0) {
    if (discard.length === 0) { if (seat === mySeat) addLog('No cards left!', 'bad'); return; }
    deck = shuffleDeck(discard);
    discard.length = 0;
    rs.log.push('Deck empty — reshuffled discard pile.');
  }

  const card = deck.shift();
  const hand = rs.hands[seat];
  const playerName = hand.name || 'Player ' + seat;

  Object.values(rs.hands).forEach(h => h.lastDrawn = false);
  hand.lastDrawn = true;

  if (card.type === 'number') {
    const duplicate = hand.cards.find(c => c.type === 'number' && c.value === card.value);
    if (duplicate) {
      const safetyIdx = hand.cards.findIndex(c => c.type === 'action' && c.effect === 'second_chance');
      if (safetyIdx !== -1) {
        hand.cards.splice(safetyIdx, 1);
        discard.push(card); 
        rs.log.push(`${playerName} drew a duplicate ${card.value}, but used SAFETY! Both discarded.`);
        rs.safety_consumed_seat = seat; // Trigger VFX
        advanceTurn(rs); // Safe after safety — pass turn
      } else {
        hand.cards.push(card);
        hand.status = 'busted';
        discard.push(...hand.cards);
        rs.log.push(`${playerName} drew ${card.value} — BUST! Duplicate card.`);
        advanceTurn(rs);
      }
    } else {
      hand.cards.push(card);
      rs.log.push(`${playerName} drew ${card.value} — Safe.`);
      advanceTurn(rs); // One card per turn — pass turn immediately
    }
  } 
  else if (card.type === 'action') {
    hand.cards.push(card);
    if (card.effect === 'second_chance') {
      rs.log.push(`${playerName} drew a SAFETY card! It will protect their next bust.`);
      advanceTurn(rs);
    } else {
      rs.awaiting_target = { card, seat: seat };
      rs.log.push(`${playerName} drew ${card.name}! Selecting a target...`);
    }
  } 
  else if (card.type === 'modifier') {
    hand.cards.push(card);
    rs.log.push(`${playerName} drew a ${card.name} modifier!`);
    advanceTurn(rs);
  }

  updateGameState(deck, discard, rs);
}

// ── Target Selection for Actions ─────────────────────────────────
async function selectTarget(targetSeat, actingSeat = null) {
  const seat = actingSeat || mySeat;
  if (!gameCache || !seat) return;
  const g = gameCache;
  const rs = { ...g.round_state };
  delete rs.zap_target_seat;
  delete rs.safety_consumed_seat;
  const card = rs.awaiting_target.card;
  // Any active player (including self) is a valid target for action cards.
  // Self-targeting is only meaningful when there are no other active players;
  // the UI and AI already enforce that logic — we just don't block it here.
  if (targetSeat === seat && rs.hands[seat].status !== 'playing') {
    if (seat === mySeat) addLog('Cannot target yourself — you are no longer active!', 'bad');
    return;
  }

  const targetHand = rs.hands[targetSeat];
  const targetName = targetHand.name || 'Player ' + targetSeat;
  const myName = rs.hands[seat].name || 'Player ' + seat;

  let deck = [...(g.deck_state || [])];
  const discard = [...(g.discard_pile || [])];

  if (card.effect === 'freeze') {
    targetHand.status = 'stayed';
    targetHand.is_frozen = true;
    targetHand.round_score = scoreHand(targetHand.cards);
    if (targetSeat === seat) {
      rs.log.push(`${myName} FROZE THEMSELVES! They are out for the round.`);
    } else {
      rs.log.push(`${myName} FROZE ${targetName}! They are out for the round.`);
    }
  } 
  else if (card.effect === 'flip_three') {
    rs.zap_target_seat = targetSeat; // Trigger VFX
    rs.log.push(`${myName} used FLIP 3 on ${targetName}!`);
    for (let i = 0; i < 3; i++) {
      if (targetHand.status !== 'playing') break;
      if (deck.length === 0) {
        if (discard.length === 0) break;
        deck = shuffleDeck(discard);
        discard.length = 0;
      }
      const newCard = deck.shift();
      const isDup = targetHand.cards.find(c => c.type === 'number' && c.value === newCard.value);
      targetHand.cards.push(newCard);
      if (isDup) {
        // Safety check for Flip 3 victims
        const safetyIdx = targetHand.cards.findIndex(c => c.type === 'action' && c.effect === 'second_chance');
        if (safetyIdx !== -1) {
            targetHand.cards.splice(safetyIdx, 1);
            discard.push(newCard);
            targetHand.cards.pop(); // remove the duplicate we just pushed
            rs.log.push(`${targetName} duplicate ${newCard.value} absorbed by SAFETY!`);
            rs.safety_consumed_seat = targetSeat; // Trigger VFX
        } else {
            targetHand.status = 'busted';
            discard.push(...targetHand.cards);
            rs.log.push(`${targetName} drew ${newCard.value} and BUSTED from the Flip 3!`);
        }
      } else {
        rs.log.push(`${targetName} drew ${newCard.value} — Safe.`);
      }
    }
  }

  delete rs.awaiting_target;
  advanceTurn(rs);
  updateGameState(deck, discard, rs);
}

async function updateGameState(deck, discard, rs) {
  showSync('Updating…');
  
  let deadline = null;
  if (gameCache.turn_timer_secs && rs.active_seat && rs.phase === 'playing') {
    // Set deadline to now + timer
    const now = new Date();
    deadline = new Date(now.getTime() + gameCache.turn_timer_secs * 1000).toISOString();
  }

  const updateFields = {
    deck_state: deck, discard_pile: discard,
    round_state: rs, active_seat: rs.active_seat,
    turn_deadline: deadline,
    updated_at: new Date().toISOString()
  };

  const { error } = await db.from('bandit_games')
    .update(updateFields)
    .eq('id', gameId);

  if (error) {
    addLog('Update failed: ' + error.message, 'bad');
  } else if (isHost) {
    // OPTIMISTIC UPDATE: Host updates local state immediately
    // This ensures AI triggers and UI updates even if realtime echo is disabled or slow.
    onGameUpdate({ ...gameCache, ...updateFields });
  }

  showSynced();
}

// ── STAY: Bank your hand ─────────────────────────────────────────
async function doStay(actingSeat = null) {
  const seat = actingSeat || mySeat;
  if (!gameCache || !seat) return;
  const g = gameCache;
  const rs = { ...g.round_state };
  delete rs.zap_target_seat;
  delete rs.safety_consumed_seat;
  if (rs.active_seat !== seat || rs.phase !== 'playing') return;

  const hand = rs.hands[seat];
  hand.status = 'stayed';
  hand.round_score = scoreHand(hand.cards);
  const playerName = hand.name || 'Player ' + seat;
  rs.log.push(`${playerName} stayed with ${hand.round_score} points.`);

  // Clear any pending action card state so it doesn't bleed into the next turn/round
  delete rs.awaiting_target;

  Object.values(rs.hands).forEach(h => h.lastDrawn = false);
  advanceTurn(rs);

  updateGameState(g.deck_state, g.discard_pile, rs);
}

function advanceTurn(rs) {
  const seats = Object.keys(rs.hands).map(Number).sort((a,b) => a - b);
  const current = rs.active_seat;
  const currentIdx = seats.indexOf(current);

  for (let i = 1; i <= seats.length; i++) {
    const nextIdx = (currentIdx + i) % seats.length;
    const nextSeat = seats[nextIdx];
    if (rs.hands[nextSeat].status === 'playing') {
      rs.active_seat = nextSeat;
      return;
    }
  }
  endRound(rs);
}

function endRound(rs) {
  rs.phase = 'scoring';
  rs.active_seat = null;
  rs.log.push('── Round complete ──');

  const seats = Object.keys(rs.hands).map(Number).sort((a,b) => a - b);
  seats.forEach(seat => {
    const h = rs.hands[seat];
    if (h.status === 'stayed') {
      const roundScore = scoreHand(h.cards);
      h.round_score = roundScore;
      rs.scores[seat] = (rs.scores[seat] || 0) + roundScore;
      rs.log.push(`${h.name}: +${roundScore} pts (total: ${rs.scores[seat]})`);
    } else {
      h.round_score = 0;
      rs.log.push(`${h.name}: 0 pts (total: ${rs.scores[seat] || 0})`);
    }
  });

  const target = gameCache?.target_score || DEFAULT_TARGET;
  const winners = seats.filter(s => (rs.scores[s] || 0) >= target);
  if (winners.length > 0) {
    rs.phase = 'gameover';
    const topScore = Math.max(...winners.map(s => rs.scores[s]));
    const winner = winners.find(s => rs.scores[s] === topScore);
    rs.winner_seat = winner;
    rs.log.push(`🏆 ${rs.hands[winner].name} wins with ${topScore} points!`);
  } else {
    rs.phase = 'round_end';
  }
}

async function startNextRound() {
  if (!gameCache) return;
  const g = gameCache;
  const rs = { ...g.round_state };
  let deck = [...(g.deck_state || [])];
  const discard = [...(g.discard_pile || [])];

  Object.values(rs.hands).forEach(h => { if (h.cards) discard.push(...h.cards); });
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffleDeck(discard);
    discard.length = 0;
  }

  const nextRound = (g.current_round || 1) + 1;
  const seats = Object.keys(rs.hands).map(Number).sort((a,b) => a - b);
  const oldDealer = rs.dealer_seat || seats[0];
  const newDealerIdx = (seats.indexOf(oldDealer) + 1) % seats.length;
  const newDealer = seats[newDealerIdx];

  seats.forEach(seat => {
    let card = deck.length > 0 ? deck.shift() : null;
    
    // HOUSE RULE: Redraw initial action cards
    if (gameCache.redraw_initial_actions && card) {
      const drawnActions = [];
      while (card && card.type !== 'number') {
        console.log(`[House Rule] Round ${nextRound} Redrawing initial action card: ${card.name}`);
        drawnActions.push(card);
        card = deck.length > 0 ? deck.shift() : null;
      }
      if (drawnActions.length > 0) {
        deck.push(...drawnActions);
        deck.sort(() => Math.random() - 0.5); // Simple reshuffle
      }
    }

    const h = rs.hands[seat];
    rs.hands[seat] = {
      cards: card ? [card] : [],
      status: 'playing',
      name: h.name,
      is_ai: h.is_ai,
      ai_difficulty: h.ai_difficulty,
      ai_personality: h.ai_personality,
      lastDrawn: true,
      round_score: 0
    };
  });

  rs.active_seat = seats[(newDealerIdx + 1) % seats.length];
  rs.dealer_seat = newDealer;
  rs.phase = 'playing';
  rs.current_round = nextRound;
  // Safety net: ensure no stale action-card state from the previous round
  delete rs.awaiting_target;
  rs.log.push(`── Round ${nextRound} begins ──`);

  updateGameState(deck, discard, rs);
}
