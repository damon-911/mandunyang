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

export async function handleButton(interaction, action, gameId, ctx) {
  const { games } = ctx;

  const game = games.get(gameId);
  if (!game || game.ended) {
    await interaction.reply({
      ephemeral: true,
      embeds: [errorEmbed("만료됨", "이 게임은 이미 끝났거나 만료됐어 😿")],
    });
    return;
  }

  if (interaction.channelId !== game.channelId) {
    await interaction.reply({
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
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("요청 불가", "이미 진행 중이거나 종료된 요청이야!"),
          ],
        });
        return;
      }
      if (interaction.user.id !== game.opponentId) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "상대만 수락할 수 있어!")],
        });
        return;
      }

      game.playerLabels[interaction.user.id] =
        interaction.member?.displayName ?? interaction.user.username;
      startGame(game, game.challengerId, game.opponentId);
      games.set(gameId, game);

      await interaction.update(buildActiveGameMessage(game));
      return;
    }

    case "seotda_decline": {
      if (game.state !== "pending") {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("요청 불가", "이미 진행 중이거나 종료된 요청이야!"),
          ],
        });
        return;
      }
      if (interaction.user.id !== game.opponentId) {
        await interaction.reply({
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
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("대기 중", "아직 수락 대기 중이야!")],
        });
        return;
      }

      const player = safeGetPlayer(game, interaction.user.id);
      if (!player) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "이 게임 참가자만 누를 수 있어!")],
        });
        return;
      }

      player.checked = true;

      await interaction.reply({
        ephemeral: true,
        embeds: [buildHandEmbed(player)],
      });
      return;
    }

    case "seotda_show": {
      if (game.state !== "active") {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("대기 중", "아직 수락 대기 중이야!")],
        });
        return;
      }

      const player = safeGetPlayer(game, interaction.user.id);
      if (!player) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("권한 없음", "이 게임 참가자만 누를 수 있어!")],
        });
        return;
      }

      // 사람 vs 사람일 때: 둘 다 패 확인 후 승부 보기
      if (!game.botId) {
        const ids = Object.keys(game.players).filter((id) => id !== "AI");
        const allChecked = ids.every((id) => game.players[id]?.checked);
        if (!allChecked) {
          await interaction.reply({
            ephemeral: true,
            embeds: [
              errorEmbed(
                "아직 안 돼!",
                "두 사람 모두 **패 확인**을 누른 뒤에 승부를 볼 수 있어!",
              ),
            ],
          });
          return;
        }
      }

      const payload = buildResultUpdatePayload(game);

      game.ended = true;
      games.delete(gameId);

      await interaction.update(payload);
      return;
    }

    default: {
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("알 수 없는 버튼", "처리할 수 없는 버튼이야!")],
      });
      return;
    }
  }
}
