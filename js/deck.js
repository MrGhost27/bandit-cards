// ================================================================
//  BANDIT CARDS — Deck Generation & Shuffle (Phase 2)
// ================================================================

function buildDeck() {
  const deck = [];

  // 1. Number cards: value N appears N times (0 appears once)
  for (let v = 0; v <= 12; v++) {
    const count = v === 0 ? 1 : v;
    for (let i = 0; i < count; i++) {
      deck.push({ type: 'number', value: v });
    }
  }

  // 2. Action Cards
  // Freeze (3): Prevents a player from playing for the rest of the round.
  for (let i = 0; i < 3; i++) deck.push({ type: 'action', name: 'Freeze', effect: 'freeze' });
  
  // Flip Three (3): Target draws 3 cards immediately.
  for (let i = 0; i < 3; i++) deck.push({ type: 'action', name: 'Flip 3', effect: 'flip_three' });
  
  // Second Chance (3): Absorb the next bust.
  for (let i = 0; i < 3; i++) deck.push({ type: 'action', name: 'Safety', effect: 'second_chance' });

  // 3. Modifier Cards
  // x2 Multiplier (2): Doubles round score.
  for (let i = 0; i < 2; i++) deck.push({ type: 'modifier', name: 'x2', effect: 'double' });
  
  // +5 Bonus (3): Adds 5 points.
  for (let i = 0; i < 3; i++) deck.push({ type: 'modifier', name: '+5', effect: 'plus_five' });

  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function wouldBust(hand, newCard) {
  if (newCard.type !== 'number') return false;
  const isDup = hand.some(c => c.type === 'number' && c.value === newCard.value);
  if (!isDup) return false;

  // If they have a safety card, this duplicate won't bust them
  const hasSafety = hand.some(c => c.type === 'action' && c.effect === 'second_chance');
  return !hasSafety;
}

function scoreHand(cards) {
  const numberCards = cards.filter(c => c.type === 'number');
  let sum = numberCards.reduce((s, c) => s + c.value, 0);

  // Apply +5 modifiers
  const plusFiveCount = cards.filter(c => c.type === 'modifier' && c.effect === 'plus_five').length;
  sum += (plusFiveCount * 5);

  // Apply x2 multiplier (only one is needed)
  const hasDouble = cards.some(c => c.type === 'modifier' && c.effect === 'double');
  if (hasDouble) sum *= 2;

  // Seven Card Bonus: 7 unique numbers = +15
  const uniqueNumbers = new Set(numberCards.map(c => c.value));
  if (uniqueNumbers.size >= 7) sum += SEVEN_CARD_BONUS;

  return sum;
}
