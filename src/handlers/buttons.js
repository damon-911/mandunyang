import { infoEmbed, errorEmbed, gameEmbed } from "../utils/embeds.js";
import {
  startGame,
  buildActiveGameMessage,
  buildHandEmbed,
  buildResultUpdatePayload,
} from "../features/seotda/gameFlow.js";

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
