import { infoEmbed, errorEmbed, gameEmbed } from "../utils/embeds.js";
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

export async function handleButton(interaction, action, gameId, ctx) {
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

      const betAmount = game.betAmount ?? 0;
      if (betAmount > 0) {
        const [challengerBalance, opponentBalance] = await Promise.all([
          getBalance(game.challengerId),
          getBalance(game.opponentId),
        ]);
        if (challengerBalance < betAmount || opponentBalance < betAmount) {
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
          addBalance(game.challengerId, -betAmount),
          addBalance(game.opponentId, -betAmount),
        ]);
      }

      startGame(game, game.challengerId, game.opponentId);
      games.set(gameId, game);

      await interaction.update(buildActiveGameMessage(game));
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

    case "seotda_show": {
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

      const payload = buildResultUpdatePayload(game);

      const betAmount = game.betAmount ?? 0;
      if (betAmount > 0) {
        const ids = Object.keys(game.players);
        const pA = game.players[ids[0]];
        const pB = game.players[ids[1]];
        const cmp = compareHands(pA.rank, pB.rank);
        let betText = "";

        if (cmp === 0) {
          betText = `무승부: 배팅금 ${formatMoney(betAmount)}원 환급`;
          if (!game.botId) {
            await Promise.all([
              addBalance(pA.id, betAmount),
              addBalance(pB.id, betAmount),
            ]);
          } else {
            await addBalance(pA.id, betAmount);
          }
        } else {
          const winner = cmp > 0 ? pA : pB;
          const loser = cmp > 0 ? pB : pA;
          betText = `승자: ${winner.label}\n패자: ${loser.label}\n승자 +${formatMoney(
            betAmount,
          )}원 / 패자 -${formatMoney(betAmount)}원`;
          if (winner.id !== "AI") {
            await addBalance(winner.id, betAmount * 2);
          }
        }

        payload.embeds?.[0]?.addFields({
          name: "베팅 결과",
          value: betText,
          inline: false,
        });
      }

      game.ended = true;
      games.delete(gameId);

      await interaction.update(payload);
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
