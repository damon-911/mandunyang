export function getHandRank(c1, c2) {
  const a = c1.month;
  const b = c2.month;

  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const key = `${min}-${max}`;

  // 광땡 (38 > 13 > 18)
  if (c1.isGwang && c2.isGwang) {
    if (key === "3-8") return { value: 1003, name: "38광땡" };
    if (key === "1-3") return { value: 1002, name: "13광땡" };
    if (key === "1-8") return { value: 1001, name: "18광땡" };
  }

  // 땡 (10땡 > 9땡 > ... > 1땡)
  if (a === b) {
    const name = a === 10 ? "장땡" : `${a}땡`;
    return { value: 900 + a, name };
  }

  // 특수패
  const special = {
    "1-2": { value: 806, name: "알리" },
    "1-4": { value: 805, name: "독사" },
    "1-9": { value: 804, name: "구삥" },
    "1-10": { value: 803, name: "장삥" },
    "4-10": { value: 802, name: "장사" },
    "4-6": { value: 801, name: "세륙" },
  }[key];
  if (special) return special;

  // 끗 / 망통
  const kkeut = (a + b) % 10;
  if (kkeut === 0) return { value: 0, name: "망통" };
  return { value: 100 + kkeut, name: `${kkeut}끗` };
}

export function compareHands(h1, h2) {
  if (h1.value > h2.value) return 1;
  if (h1.value < h2.value) return -1;
  return 0;
}
