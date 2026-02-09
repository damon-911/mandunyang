import { randomUUID } from "crypto";

import { infoEmbed, errorEmbed, gameEmbed } from "../utils/embeds.js";
import { getKstDateString } from "../utils/kst.js";
import { getUser, canAttend, attend } from "../data/userStore.js";

import {
  createGame,
  startGame,
  buildActiveGameMessage,
  buildPendingMessage,
} from "../features/seotda/gameFlow.js";

const formatMoney = (amount) => Number(amount ?? 0).toLocaleString("ko-KR");

function setGameExpiry(games, gameId, ms = 10 * 60 * 1000) {
  setTimeout(() => {
    const g = games.get(gameId);
    if (g && !g.ended) games.delete(gameId);
  }, ms);
}

export async function handleCommand(interaction, ctx) {
  const { games } = ctx;

  switch (interaction.commandName) {
    case "핑": {
      await interaction.reply({ embeds: [infoEmbed("핑", "퐁! 🏓")] });
      return;
    }

    case "출석체크": {
      const userId = interaction.user.id;
      const today = getKstDateString();
      const DAILY_REWARD = 10000;

      if (!(await canAttend(userId, today))) {
        const user = await getUser(userId);
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("이미 출석했어!", `오늘은 이미 출석체크를 했어 😼`),
          ],
        });
        return;
      }

      const user = await attend(userId, today, DAILY_REWARD);

      await interaction.reply({
        embeds: [
          gameEmbed("📅 출석체크 완료!", [
            {
              name: "획득",
              value: `${formatMoney(DAILY_REWARD)}원`,
              inline: false,
            },
            {
              name: "현재 보유금",
              value: `${formatMoney(user.balance)}원`,
              inline: false,
            },
            { name: "출석 날짜", value: today },
          ]),
        ],
      });
      return;
    }

    case "내정보": {
      const userId = interaction.user.id;
      const user = await getUser(userId);
      const lastAttendance = user.last_attendance_date
        ? user.last_attendance_date.toISOString().slice(0, 10)
        : null;

      await interaction.reply({
        ephemeral: true,
        embeds: [
          gameEmbed("👤 내 정보", [
            {
              name: "보유금",
              value: `${formatMoney(user.balance)}원`,
              inline: false,
            },
            {
              name: "마지막 출석",
              value: lastAttendance ?? "없음",
              inline: false,
            },
          ]),
        ],
      });
      return;
    }

    case "섯다": {
      const opponent = interaction.options.getUser("상대"); // 없으면 null

      if (opponent && opponent.id === interaction.user.id) {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("잘못된 대결", "자기 자신과는 대결할 수 없어 😅"),
          ],
        });
        return;
      }

      if (opponent && opponent.bot) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("잘못된 상대", "봇이 아닌 사람을 태그해줘!")],
        });
        return;
      }

      await interaction.deferReply();

      const gameId = randomUUID();
      const game = createGame({
        id: gameId,
        channelId: interaction.channelId,
        challengerId: interaction.user.id,
        opponentId: opponent ? opponent.id : null,
      });

      // 솔로면 즉시 시작
      if (!opponent) {
        game.botUserId = interaction.client.user?.id ?? null;
        startGame(game, interaction.user.id, "AI");
        games.set(gameId, game);
        setGameExpiry(games, gameId);

        await interaction.editReply(buildActiveGameMessage(game));
        return;
      }

      // 1:1이면 수락 대기
      games.set(gameId, game);
      setGameExpiry(games, gameId);

      await interaction.editReply(buildPendingMessage(game));
      return;
    }

    default: {
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("알 수 없는 명령어", "등록되지 않은 명령어야!")],
      });
      return;
    }
  }
}
