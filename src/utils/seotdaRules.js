export function buildSeotdaRulesText(highlightName = null) {
  const lines = [];

  const push = (label) => {
    lines.push(highlightName === label ? `👉 **${label}**` : label);
  };

  push("38광땡");
  push("13광땡");
  push("18광땡");

  const highlightRanges = (labels, rangeText) => {
    if (!highlightName) return rangeText;
    return labels.includes(highlightName) ? `👉 **${rangeText}**` : rangeText;
  };

  const ddangLabels = ["장땡"];
  for (let n = 9; n >= 1; n -= 1) ddangLabels.push(`${n}땡`);
  lines.push(highlightRanges(ddangLabels, "장땡 ~ 1땡"));

  const specialLabels = ["알리", "독사", "구삥", "장삥", "장사", "세륙"];
  for (const label of specialLabels) push(label);

  const kkeutLabels = [];
  for (let n = 9; n >= 1; n -= 1) kkeutLabels.push(`${n}끗`);
  lines.push(highlightRanges(kkeutLabels, "9끗 ~ 1끗"));

  push("망통");

  return lines.join("\n");
}
