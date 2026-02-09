export function getHandRank(c1, c2) {
  const a = c1.month;
  const b = c2.month;

  if (a === b) return { rank: 80 + a, name: `${a}땡` };

  const kkeut = (a + b) % 10;
  if (kkeut === 0) return { rank: 1, name: "망통" };
  return { rank: 1 + kkeut, name: `${kkeut}끗` };
}

export function compareHands(h1, h2) {
  if (h1.rank > h2.rank) return 1;
  if (h1.rank < h2.rank) return -1;
  return 0;
}
