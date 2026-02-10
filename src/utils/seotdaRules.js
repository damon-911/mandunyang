export function buildSeotdaRulesText(highlightName = null) {
  const lines = [];

  const push = (label) => {
    lines.push(highlightName === label ? `👉 **${label}**` : label);
  };

  push("38광땡");
  push("13광땡");
  push("18광땡");

  for (let n = 10; n >= 1; n -= 1) {
    push(`${n}땡`);
  }

  push("알리");
  push("독사");
  push("구삥");
  push("장삥");
  push("장사");
  push("세륙");

  for (let n = 9; n >= 1; n -= 1) {
    push(`${n}끗`);
  }
  push("망통");

  lines.push("뒷패 없음");
  return lines.join("\n");
}
