export const CARDS = [
  { cardId: "1-0", month: 1, variant: 0, isGwang: true, label: "1월(광)" },
  { cardId: "1-1", month: 1, variant: 1, isGwang: false, label: "1월" },

  { cardId: "2-0", month: 2, variant: 0, isGwang: false, label: "2월" },
  { cardId: "2-1", month: 2, variant: 1, isGwang: false, label: "2월" },

  { cardId: "3-0", month: 3, variant: 0, isGwang: true, label: "3월(광)" },
  { cardId: "3-1", month: 3, variant: 1, isGwang: false, label: "3월" },

  { cardId: "4-0", month: 4, variant: 0, isGwang: false, label: "4월" },
  { cardId: "4-1", month: 4, variant: 1, isGwang: false, label: "4월" },

  { cardId: "5-0", month: 5, variant: 0, isGwang: false, label: "5월" },
  { cardId: "5-1", month: 5, variant: 1, isGwang: false, label: "5월" },

  { cardId: "6-0", month: 6, variant: 0, isGwang: false, label: "6월" },
  { cardId: "6-1", month: 6, variant: 1, isGwang: false, label: "6월" },

  { cardId: "7-0", month: 7, variant: 0, isGwang: false, label: "7월" },
  { cardId: "7-1", month: 7, variant: 1, isGwang: false, label: "7월" },

  { cardId: "8-0", month: 8, variant: 0, isGwang: true, label: "8월(광)" },
  { cardId: "8-1", month: 8, variant: 1, isGwang: false, label: "8월" },

  { cardId: "9-0", month: 9, variant: 0, isGwang: false, label: "9월" },
  { cardId: "9-1", month: 9, variant: 1, isGwang: false, label: "9월" },

  { cardId: "10-0", month: 10, variant: 0, isGwang: false, label: "10월" },
  { cardId: "10-1", month: 10, variant: 1, isGwang: false, label: "10월" },
];

export function createDeck() {
  return CARDS.map((c) => ({ ...c }));
}

export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function draw(deck, n = 1) {
  if (deck.length < n) throw new Error("덱에 카드가 부족합니다.");
  return deck.splice(0, n);
}

export function formatCard(card) {
  const monthEmoji = {
    1: "1️⃣",
    2: "2️⃣",
    3: "3️⃣",
    4: "4️⃣",
    5: "5️⃣",
    6: "6️⃣",
    7: "7️⃣",
    8: "8️⃣",
    9: "9️⃣",
    10: "🔟",
  }[card.month] ?? `${card.month}`;

  return card.isGwang ? `${monthEmoji}(광)` : monthEmoji;
}
