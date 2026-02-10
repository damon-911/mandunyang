import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { infoEmbed, errorEmbed } from "../utils/embeds.js";
import { buildSeotdaRulesText } from "../utils/seotdaRules.js";
import {
  startGame,
  buildActiveGameMessage,
  buildHandEmbed,
  buildResultUpdatePayload,
} from "../features/seotda/gameFlow.js";
import { compareHands } from "../features/seotda/rank.js";
import { getBalance, addBalance } from "../data/userStore.js";

function safeGetPlayer(game, userId) {
  return game.players[userId] ?? null;
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    if (err?.code === 40060) {
      return interaction.followUp(payload);
    }
    throw err;
  }
}

function formatMoney(amount) {
  return Number(amount ?? 0).toLocaleString("ko-KR");
}

function addBalancesToPayload(payload, game, balances) {
  const lines = Object.values(game.players)
    .filter((p) => p.id !== "AI")
    .map((p) => `${p.label}: ${formatMoney(balances[p.id] ?? 0)}원`);
  payload.embeds?.[0]?.addFields({
    name: "보유금",
    value: lines.join("\n"),
    inline: false,
  });
}

async function getBalances(game) {
  const ids = Object.keys(game.players).filter((id) => id !== "AI");
  const rows = await Promise.all(
    ids.map(async (id) => ({ id, balance: await getBalance(id) })),
  );
  return rows.reduce((acc, r) => {
    acc[r.id] = r.balance;
    return acc;
  }, {});
}

function getBalanceForId(balances, id) {
  if (id === "AI") return Number.POSITIVE_INFINITY;
  return balances[id] ?? 0;
}

function getOtherPlayerId(game, id) {
  return Object.keys(game.players).find((pid) => pid !== id);
}

function computeBetAmount(game, action, balances) {
  if (action === "quarter") return Math.max(1, Math.floor(game.pot * 0.25));
  if (action === "half") return Math.max(1, Math.floor(game.pot * 0.5));
  if (action === "max") {
    const humanIds = Object.keys(game.players).filter((id) => id !== "AI");
    const minBalance =
      humanIds.length === 0
        ? 0
        : Math.min(...humanIds.map((id) => getBalanceForId(balances, id)));
    return Math.max(0, minBalance);
  }
  return 0;
}

function getRaiseAmount(game, action, balances) {
  const base = computeBetAmount(game, action, balances);
  if (action === "max" && game.currentBet > 0) {
    return Math.max(0, base - game.currentBet);
  }
  return base;
}

function processBetAction(game, actorId, actionName, balances) {
  const actorBalance = getBalanceForId(balances, actorId);
  const otherId = getOtherPlayerId(game, actorId);

  if (actionName === "check") {
    if (game.currentBet > 0) {
      return { error: "체크 불가: 이미 베팅이 진행 중이야!" };
    }
    game.checksInRow += 1;
    if (game.checksInRow >= 2) {
      return { endType: "showdown", required: 0 };
    }
    game.turnId = otherId;
    return { endType: null, required: 0 };
  }

  if (actionName === "call") {
    if (game.currentBet <= 0) {
      return { error: "콜 불가: 받을 베팅이 없어!" };
    }
    const callAmount = game.currentBet;
    if (actorBalance < callAmount) {
      return { error: "잔액 부족: 콜할 수 없어!" };
    }
    game.pot += callAmount;
    game.currentBet = 0;
    game.lastBetBy = null;
    game.checksInRow = 0;
    return { endType: "showdown", required: callAmount };
  }

  if (actionName === "die") {
    return { endType: "die", loserId: actorId, required: 0 };
  }

  if (["quarter", "half", "max"].includes(actionName)) {
    const raiseAmount = getRaiseAmount(game, actionName, balances);
    if (raiseAmount <= 0) {
      return { error: "베팅 불가: 베팅 금액이 올바르지 않아!" };
    }
    const required =
      game.currentBet > 0 ? game.currentBet + raiseAmount : raiseAmount;
    if (actorBalance < required) {
      return { error: "잔액 부족: 베팅할 수 없어!" };
    }
    game.pot += required;
    game.currentBet = raiseAmount;
    game.lastBetBy = actorId;
    game.checksInRow = 0;
    game.turnId = otherId;
    return { endType: null, required };
  }

  return { error: "알 수 없는 베팅" };
}

function buildBettingComponents(game, balances) {
  const currentId = game.turnId;
  const currentBalance = getBalanceForId(balances, currentId);
  const callAmount = game.currentBet;
  const quarterAmount = getRaiseAmount(game, "quarter", balances);
  const halfAmount = getRaiseAmount(game, "half", balances);
  const maxAmount = getRaiseAmount(game, "max", balances);
  const quarterRequired =
    game.currentBet > 0 ? game.currentBet + quarterAmount : quarterAmount;
  const halfRequired =
    game.currentBet > 0 ? game.currentBet + halfAmount : halfAmount;
  const maxRequired =
    game.currentBet > 0 ? game.currentBet + maxAmount : maxAmount;

  const disableAll = game.turnId === "AI";
  const canCheck = game.currentBet === 0;
  const canCall = game.currentBet > 0 && currentBalance >= callAmount;
  const canQuarter = currentBalance >= quarterRequired && quarterAmount > 0;
  const canHalf = currentBalance >= halfRequired && halfAmount > 0;
  const canMax = currentBalance >= maxRequired && maxAmount > 0;
  const canDie = game.currentBet > 0;

  if (game.botId) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`seotda_check:${game.id}`)
        .setLabel("패 확인")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`seotda_rules:${game.id}`)
        .setLabel("족보")
        .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`seotda_bet:${game.id}:check`)
        .setLabel("체크")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disableAll || !canCheck),
      new ButtonBuilder()
        .setCustomId(`seotda_bet:${game.id}:quarter`)
        .setLabel(`쿼터(${formatMoney(quarterAmount)})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disableAll || !canQuarter),
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`seotda_bet:${game.id}:half`)
        .setLabel(`하프(${formatMoney(halfAmount)})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disableAll || !canHalf),
      new ButtonBuilder()
        .setCustomId(`seotda_bet:${game.id}:max`)
        .setLabel(`올인(${formatMoney(maxAmount)})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disableAll || !canMax),
    );

    return [row1, row2, row3];
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_check:${game.id}`)
      .setLabel("패 확인")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`seotda_rules:${game.id}`)
      .setLabel("족보")
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:call`)
      .setLabel(`콜${callAmount ? `(${formatMoney(callAmount)})` : ""}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disableAll || !canCall),
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:die`)
      .setLabel("다이")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disableAll || !canDie),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:check`)
      .setLabel("체크")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || !canCheck),
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:quarter`)
      .setLabel(`쿼터(${formatMoney(quarterAmount)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableAll || !canQuarter),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:half`)
      .setLabel(`하프(${formatMoney(halfAmount)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableAll || !canHalf),
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:max`)
      .setLabel(`맥스(${formatMoney(maxAmount)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableAll || !canMax),
  );

  return [row1, row2, row3, row4];
}

function decideAiAction(game) {
  const rankValue = game.players.AI?.rank?.value ?? 0;
  if (game.currentBet > 0) {
    return rankValue >= 900 || rankValue >= 806 ? "call" : "die";
  }
  if (rankValue >= 1000) return "max";
  if (rankValue >= 900) return "half";
  if (rankValue >= 806) return "quarter";
  if (rankValue >= 105) return "check";
  return "check";
}

async function settleShowdown(game) {
  const ids = Object.keys(game.players);
  const pA = game.players[ids[0]];
  const pB = game.players[ids[1]];
  const cmp = compareHands(pA.rank, pB.rank);
  if (cmp === 0) {
    const share = Math.floor(game.pot / 2);
    if (pA.id !== "AI") await addBalance(pA.id, share);
    if (pB.id !== "AI") await addBalance(pB.id, share);
    return { result: "draw", winner: null, loser: null, delta: share };
  }
  const winner = cmp > 0 ? pA : pB;
  const loser = cmp > 0 ? pB : pA;
  if (winner.id !== "AI") await addBalance(winner.id, game.pot);
  return { result: "win", winner, loser, delta: game.pot };
}

async function settleDie(game, loserId) {
  const winnerId = getOtherPlayerId(game, loserId);
  if (winnerId && winnerId !== "AI") {
    await addBalance(winnerId, game.pot);
  }
  return { winnerId, loserId, delta: game.pot };
}

async function addBalancesToResult(payload, game) {
  const ids = Object.values(game.players)
    .filter((p) => p.id !== "AI")
    .map((p) => p.id);
  if (ids.length === 0) return;
  const rows = await Promise.all(
    ids.map(async (id) => ({ id, balance: await getBalance(id) })),
  );
  const balances = rows.reduce((acc, r) => {
    acc[r.id] = r.balance;
    return acc;
  }, {});
  const lines = Object.values(game.players)
    .filter((p) => p.id !== "AI")
    .map((p) => `${p.label}: ${formatMoney(balances[p.id] ?? 0)}원`);
  payload.embeds?.[0]?.addFields({
    name: "최종 보유금",
    value: lines.join("\n"),
    inline: false,
  });
}

async function renderActive(interaction, game) {
  const balances = await getBalances(game);
  const payload = buildActiveGameMessage(game);
  addBalancesToPayload(payload, game, balances);
  payload.components = buildBettingComponents(game, balances);
  await interaction.update(payload);
}

export async function handleButton(
  interaction,
  action,
  gameId,
  ctx,
  subAction,
) {
  const { games } = ctx;

  const game = games.get(gameId);
  if (!game || game.ended) {
    await safeReply(interaction, {
      ephemeral: true,
      embeds: [errorEmbed("만료됨", "이 게임은 이미 끝났거나 만료됐어 😿")],
    });
    return;
  }

  if (interaction.channelId !== game.channelId) {
    await safeReply(interaction, {
      ephemeral: true,
      embeds: [
        errorEmbed("조작 불가", "이 게임이 시작된 채널에서만 조작할 수 있어!"),
      ],
    });
    return;
  }

  switch (action) {
    case "seotda_rules": {
      const player =
        game.state === "active"
          ? safeGetPlayer(game, interaction.user.id)
          : null;
      const rulesText = buildSeotdaRulesText(player?.rank?.name ?? null);
      await safeReply(interaction, {
        ephemeral: true,
        embeds: [infoEmbed("🎴 섯다 족보", rulesText)],
      });
      return;
    }

    // --- 수락/거절 ---
    case "seotda_accept": {
      if (game.state !== "pending") {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [
            errorEmbed("요청 불가", "이미 진행 중이거나 종료된 요청이야!"),
          ],
        });
        return;
      }
      if (interaction.user.id !== game.opponentId) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "상대만 수락할 수 있어!")],
        });
        return;
      }

      const baseAmount = game.baseAmount ?? 0;
      const [challengerBalance, opponentBalance] = await Promise.all([
        getBalance(game.challengerId),
        getBalance(game.opponentId),
      ]);
      if (challengerBalance < baseAmount || opponentBalance < baseAmount) {
        game.ended = true;
        games.delete(gameId);
        await interaction.update({
          embeds: [
            errorEmbed(
              "대결 취소",
              "한쪽의 보유금이 부족해서 대결이 취소됐어 😿",
            ),
          ],
          components: [],
        });
        return;
      }

      await Promise.all([
        addBalance(game.challengerId, -baseAmount),
        addBalance(game.opponentId, -baseAmount),
      ]);

      game.pot = baseAmount * 2;
      startGame(game, game.challengerId, game.opponentId);
      games.set(gameId, game);

      await renderActive(interaction, game);
      return;
    }

    case "seotda_decline": {
      if (game.state !== "pending") {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [
            errorEmbed("요청 불가", "이미 진행 중이거나 종료된 요청이야!"),
          ],
        });
        return;
      }
      if (interaction.user.id !== game.opponentId) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "상대만 거절할 수 있어!")],
        });
        return;
      }

      game.ended = true;
      games.delete(gameId);

      await interaction.update({
        embeds: [
          infoEmbed(
            "대결 거절",
            `😿 <@${game.opponentId}> 님이 대결을 거절했어요.`,
          ),
        ],
        components: [],
      });
      return;
    }

    // --- 진행 단계 ---
    case "seotda_check": {
      if (game.state !== "active") {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("대기 중", "아직 수락 대기 중이야!")],
        });
        return;
      }

      const player = safeGetPlayer(game, interaction.user.id);
      if (!player) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "이 게임 참가자만 누를 수 있어!")],
        });
        return;
      }

      player.checked = true;

      await safeReply(interaction, {
        ephemeral: true,
        embeds: [buildHandEmbed(player)],
      });
      return;
    }

    case "seotda_bet": {
      if (game.state !== "active") {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("대기 중", "아직 수락 대기 중이야!")],
        });
        return;
      }

      const player = safeGetPlayer(game, interaction.user.id);
      if (!player) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "이 게임 참가자만 누를 수 있어!")],
        });
        return;
      }

      if (interaction.user.id !== game.turnId) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("차례 아님", "지금은 네 차례가 아니야!")],
        });
        return;
      }

      const actionName = subAction;
      if (!actionName) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("잘못된 요청", "알 수 없는 베팅 동작이야!")],
        });
        return;
      }

      if (game.botId && ["call", "die"].includes(actionName)) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [
            errorEmbed("동작 불가", "AI전에서는 체크/쿼터/하프/올인만 가능해!"),
          ],
        });
        return;
      }

      if (actionName === "call" && game.currentBet <= 0) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("콜 불가", "받을 베팅이 없어!")],
        });
        return;
      }

      const balances = await getBalances(game);

      if (game.botId) {
        const required =
          actionName === "check"
            ? 0
            : game.currentBet > 0
              ? game.currentBet + getRaiseAmount(game, actionName, balances)
              : getRaiseAmount(game, actionName, balances);
        if (required <= 0 && actionName !== "check") {
          await safeReply(interaction, {
            ephemeral: true,
            embeds: [errorEmbed("베팅 불가", "베팅 금액이 올바르지 않아!")],
          });
          return;
        }
        if (
          actionName !== "check" &&
          getBalanceForId(balances, interaction.user.id) < required
        ) {
          await safeReply(interaction, {
            ephemeral: true,
            embeds: [
              errorEmbed("잔액 부족", "보유금이 부족해서 베팅할 수 없어!"),
            ],
          });
          return;
        }
        if (required > 0) {
          await addBalance(interaction.user.id, -required);
          game.pot += required;
        }

        const outcome = await settleShowdown(game);
        const payload = buildResultUpdatePayload(game);
        const resultLines = [];
        if (outcome?.result === "draw") {
          resultLines.push(`🤝 무승부: 각자 +${formatMoney(outcome.delta)}원`);
        } else if (outcome?.result === "win" && outcome.winner && outcome.loser) {
          resultLines.push(
            `🏆 승자: ${outcome.winner.label} +${formatMoney(outcome.delta)}원`,
          );
          resultLines.push(
            `😿 패자: ${outcome.loser.label} -${formatMoney(outcome.delta)}원`,
          );
        }
        if (resultLines.length > 0) {
          payload.embeds?.[0]?.addFields({
            name: "결과",
            value: resultLines.join("\n"),
            inline: false,
          });
        }
        await addBalancesToResult(payload, game);
        game.ended = true;
        games.delete(gameId);
        await interaction.update(payload);
        return;
      }

      const result = processBetAction(
        game,
        interaction.user.id,
        actionName,
        balances,
      );
      if (result.error) {
        await safeReply(interaction, {
          ephemeral: true,
          embeds: [errorEmbed("베팅 오류", result.error)],
        });
        return;
      }

      const required = result.required ?? 0;
      if (required > 0 && interaction.user.id !== "AI") {
        await addBalance(interaction.user.id, -required);
        balances[interaction.user.id] -= required;
      }

      if (result.endType) {
        let outcome = null;
        if (result.endType === "showdown") {
          outcome = await settleShowdown(game);
        } else if (result.endType === "die") {
          outcome = await settleDie(game, result.loserId);
        }

        const payload = buildResultUpdatePayload(game);
        const resultLines = [];
        if (result.endType === "showdown" && outcome) {
          if (outcome.result === "draw") {
            resultLines.push(
              `🤝 무승부: 각자 +${formatMoney(outcome.delta)}원`,
            );
          } else if (
            outcome.result === "win" &&
            outcome.winner &&
            outcome.loser
          ) {
            resultLines.push(
              `🏆 승자: ${outcome.winner.label} +${formatMoney(outcome.delta)}원`,
            );
            resultLines.push(
              `😿 패자: ${outcome.loser.label} -${formatMoney(outcome.delta)}원`,
            );
          }
        }
        if (result.endType === "die") {
          if (outcome?.winnerId) {
            const winnerLabel = game.players[outcome.winnerId]?.label ?? "승자";
            resultLines.push(
              `🏆 승자: ${winnerLabel} +${formatMoney(outcome.delta)}원`,
            );
            resultLines.push(
              `😿 패자: ${player.label} -${formatMoney(outcome.delta)}원`,
            );
          }
        }
        if (resultLines.length > 0) {
          payload.embeds?.[0]?.addFields({
            name: "결과",
            value: resultLines.join("\n"),
            inline: false,
          });
        }
        await addBalancesToResult(payload, game);
        game.ended = true;
        games.delete(gameId);
        await interaction.update(payload);
        return;
      }

      if (game.botId && game.turnId === "AI") {
        const aiBalances = await getBalances(game);
        const aiAction = decideAiAction(game);
        const aiResult = processBetAction(game, "AI", aiAction, aiBalances);
        if (aiResult.endType) {
          let outcome = null;
          if (aiResult.endType === "showdown") {
            outcome = await settleShowdown(game);
          } else if (aiResult.endType === "die") {
            outcome = await settleDie(game, aiResult.loserId);
          }
          const payload = buildResultUpdatePayload(game);
          const resultLines = [];
          if (aiResult.endType === "showdown" && outcome) {
            if (outcome.result === "draw") {
              resultLines.push(
                `🤝 무승부: 각자 +${formatMoney(outcome.delta)}원`,
              );
            } else if (
              outcome.result === "win" &&
              outcome.winner &&
              outcome.loser
            ) {
              resultLines.push(
                `🏆 승자: ${outcome.winner.label} +${formatMoney(
                  outcome.delta,
                )}원`,
              );
              resultLines.push(
                `😿 패자: ${outcome.loser.label} -${formatMoney(
                  outcome.delta,
                )}원`,
              );
            }
          }
          if (aiResult.endType === "die") {
            if (outcome?.winnerId) {
              const winnerLabel =
                game.players[outcome.winnerId]?.label ?? "승자";
              resultLines.push(
                `🏆 승자: ${winnerLabel} +${formatMoney(outcome.delta)}원`,
              );
              resultLines.push(
                `😿 패자: ${game.players.AI.label} -${formatMoney(
                  outcome.delta,
                )}원`,
              );
            }
          }
          if (resultLines.length > 0) {
            payload.embeds?.[0]?.addFields({
              name: "결과",
              value: resultLines.join("\n"),
              inline: false,
            });
          }
          await addBalancesToResult(payload, game);
          game.ended = true;
          games.delete(gameId);
          await interaction.update(payload);
          return;
        }
      }

      await renderActive(interaction, game);
      return;
    }

    default: {
      await safeReply(interaction, {
        ephemeral: true,
        embeds: [errorEmbed("알 수 없는 버튼", "처리할 수 없는 버튼이야!")],
      });
      return;
    }
  }
}
