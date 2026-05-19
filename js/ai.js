// ================================================================
//  BANDIT CARDS — AI Intelligence (Phase 2)
// ================================================================

let aiThinking = false;

/**
 * Main entry point for AI turns.
 * Loops internally as long as it's this AI's turn.
 */
async function processAiTurn(seatNumber) {
  if (!isHost || !gameCache || aiThinking) return;
  aiThinking = true;

  try {
    while (true) {
      if (!gameCache) break;
      const g = gameCache;
      const rs = g.round_state;

      // Stop if it's no longer this AI's turn
      if (rs.active_seat !== seatNumber || rs.phase !== 'playing') break;

      console.log(`[AI] Seat ${seatNumber} is thinking...`);
      
      const hand = rs.hands[seatNumber];
      const player = { 
        is_ai: true, 
        ai_difficulty: hand.ai_difficulty ?? 3, 
        ai_personality: hand.ai_personality ?? 'balanced', 
        seat_number: seatNumber 
      };

      const cards = hand.cards || [];
      
      // 1. Handle Action Card Targeting
      if (rs.awaiting_target && rs.awaiting_target.seat === seatNumber) {
        await new Promise(r => setTimeout(r, 200));
        await resolveAiAction(seatNumber, rs.awaiting_target.card);
        continue; 
      }

      // 2. Decide: HIT or STAY
      const decision = decideAiMove(player, cards, g.deck_state || [], rs.scores);
      console.log(`[AI] Seat ${seatNumber} decision: ${decision}`);
      
      await new Promise(r => setTimeout(r, 300));
      
      if (decision === 'hit') {
        await doHit(seatNumber);
        break; // One card per turn — pass to the next player
      } else {
        await doStay(seatNumber);
        break; // Turn ended
      }

      // Small pause to allow the local state (gameCache) to update from the move
      await new Promise(r => setTimeout(r, 100));
    }
  } catch (err) {
    console.error(`[AI] Critical error for seat ${seatNumber}:`, err);
  } finally {
    aiThinking = false;
  }
}

function decideAiMove(player, handCards, deck, scores) {
  const personality = player.ai_personality || 'balanced';
  const difficulty = player.ai_difficulty || 3;
  const mySeat = player.seat_number;
  const myTotalScore = scores[mySeat] || 0;
  
  const currentRoundScore = scoreHand(handCards);
  const targetScore = gameCache?.target_score || 200;

  // 1. If we can win right now by staying, DO IT.
  if (currentRoundScore + myTotalScore >= targetScore) return 'stay';

  // 2. Calculate bust probability
  const bustProb = calculateBustProbability(handCards, deck);
  
  // 3. Personality-based Risk Threshold (0.15 - 0.45)
  let riskThreshold = 0.3; // Balanced
  if (personality === 'aggressive') riskThreshold = 0.45;
  if (personality === 'cautious') riskThreshold = 0.15;

  // 4. Safety Factors:
  const cardCount = handCards.filter(c => c.type === 'number').length;
  
  // As we get more cards, we should be much more cautious
  if (cardCount >= 3) riskThreshold *= 0.8; 
  if (cardCount >= 4) riskThreshold *= 0.5; 
  if (cardCount >= 5) riskThreshold *= 0.2; 

  // If we have a good hand (15+), bank it!
  if (currentRoundScore >= 15) riskThreshold *= 0.7;

  return (bustProb > riskThreshold) ? 'stay' : 'hit';
}

function calculateBustProbability(handCards, deck) {
  if (!deck || deck.length === 0) return 0.5; // Unknown

  const currentValues = handCards.filter(c => c.type === 'number').map(c => c.value);
  const valuesNeededToBust = new Set(currentValues);
  
  const hasSafety = handCards.some(c => c.type === 'action' && c.effect === 'second_chance');
  
  const numbersInDeck = deck.filter(c => c.type === 'number');
  if (numbersInDeck.length === 0) return 0;

  const bustCards = numbersInDeck.filter(c => valuesNeededToBust.has(c.value));
  const prob = bustCards.length / numbersInDeck.length;

  // If we have a safety card, our "perceived" risk is lower
  return hasSafety ? (prob * 0.5) : prob;
}

async function resolveAiAction(aiSeat, card) {
  if (!gameCache) return;
  const rs = gameCache.round_state;
  const seats = Object.keys(rs.hands).map(Number);
  const targetScore = gameCache.target_score || 200;
  
  // Find a target: prefer other active players, but fall back to self
  // for any action card when no one else is active.
  let targets = seats.filter(s => s !== aiSeat && rs.hands[s].status === 'playing');
  
  let targetSeat = null;
  if (targets.length === 0) {
    // No other active players — must self-target
    targetSeat = aiSeat;
  } else {
    // Target the person with the highest overall score
    targets.sort((a, b) => (rs.scores[b] || 0) - (rs.scores[a] || 0));
    targetSeat = targets[0];
  }

  await selectTarget(targetSeat, aiSeat);
}
