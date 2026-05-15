// ================================================================
//  BANDIT CARDS — Statistics Engine (Spectator Exclusive)
// ================================================================

/**
 * Calculates a comprehensive stats object for a specific game state.
 */
function calculateStats(game) {
  const rs = game.round_state;
  if (!rs || !rs.hands) return null;

  const fullDeck = buildDeck(); // from deck.js
  const hands = Object.values(rs.hands);
  const discard = game.discard_pile || [];

  // 1. Identify "Known" cards (those out of the deck)
  const knownCards = [...discard];
  hands.forEach(h => knownCards.push(...(h.cards || [])));

  // 2. Calculate "Hidden" deck
  // Note: We don't know the order, but we know the count of what's left.
  const remainingDeck = [...fullDeck];
  knownCards.forEach(kc => {
    const idx = remainingDeck.findIndex(rc => 
      rc.type === kc.type && 
      (rc.value === kc.value || rc.effect === kc.effect)
    );
    if (idx !== -1) remainingDeck.splice(idx, 1);
  });

  const totalRemaining = remainingDeck.length;

  // 3. For each player, calculate Bust % and EV
  const playerStats = {};
  Object.entries(rs.hands).forEach(([seat, hand]) => {
    if (hand.status !== 'playing') return;

    const currentHand = hand.cards || [];
    const currentScore = scoreHand(currentHand);
    
    let bustCount = 0;
    let totalScoreOfSafeHits = 0;
    let safeCount = 0;

    remainingDeck.forEach(card => {
      if (wouldBust(currentHand, card)) {
        bustCount++;
      } else {
        safeCount++;
        // What would the score be if they hit this card?
        const potentialScore = scoreHand([...currentHand, card]);
        totalScoreOfSafeHits += (potentialScore - currentScore);
      }
    });

    const bustProb = totalRemaining > 0 ? (bustCount / totalRemaining) : 0;
    const ev = safeCount > 0 ? (totalScoreOfSafeHits / totalRemaining) : 0;

    playerStats[seat] = {
      bustProb: (bustProb * 100).toFixed(1) + '%',
      ev: '+' + ev.toFixed(1),
      isHighRisk: bustProb > 0.5
    };
  });

  // 4. Global deck breakdown
  const counts = {};
  remainingDeck.forEach(c => {
    const key = c.type === 'number' ? c.value : c.name;
    counts[key] = (counts[key] || 0) + 1;
  });

  return {
    playerStats,
    deckRemaining: totalRemaining,
    deckBreakdown: counts
  };
}
