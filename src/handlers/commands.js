import { randomUUID } from "crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import { infoEmbed, errorEmbed, gameEmbed } from "../utils/embeds.js";
import { getKstDateString } from "../utils/kst.js";
import { buildSeotdaRulesText } from "../utils/seotdaRules.js";
import {
  getUser,
  getBalance,
  addBalance,
  canAttend,
  attend,
} from "../data/userStore.js";

import {
  createGame,
  startGame,
  buildActiveGameMessage,
  buildPendingMessage,
} from "../features/seotda/gameFlow.js";

const formatMoney = (amount) => Number(amount ?? 0).toLocaleString("ko-KR");

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

function buildInitialBettingComponents(game, balance) {
  const quarterAmount = Math.max(1, Math.floor(game.pot * 0.25));
  const halfAmount = Math.max(1, Math.floor(game.pot * 0.5));
  const maxAmount = Math.max(0, balance);
  const quarterRequired =
    game.currentBet > 0 ? game.currentBet + quarterAmount : quarterAmount;
  const halfRequired =
    game.currentBet > 0 ? game.currentBet + halfAmount : halfAmount;
  const maxRequired =
    game.currentBet > 0 ? game.currentBet + maxAmount : maxAmount;

  const disableAll = game.turnId === "AI";
  const canCheck = game.currentBet === 0;
  const canCall = game.currentBet > 0 && balance >= game.currentBet;
  const canQuarter =
    balance >= quarterRequired &&
    quarterAmount > 0 &&
    quarterAmount >= game.currentBet;
  const canHalf =
    balance >= halfRequired && halfAmount > 0 && halfAmount >= game.currentBet;
  const canMax =
    balance >= maxRequired && maxAmount > 0 && maxAmount >= game.currentBet;
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
        .setStyle(ButtonStyle.Danger)
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
      .setCustomId(`seotda_bet:${game.id}:check`)
      .setLabel("체크")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || !canCheck),
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:call`)
      .setLabel(
        `콜${game.currentBet ? `(${formatMoney(game.currentBet)})` : ""}`,
      )
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
      .setCustomId(`seotda_bet:${game.id}:quarter`)
      .setLabel(`쿼터(${formatMoney(quarterAmount)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableAll || !canQuarter),
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:half`)
      .setLabel(`하프(${formatMoney(halfAmount)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableAll || !canHalf),
    new ButtonBuilder()
      .setCustomId(`seotda_bet:${game.id}:max`)
      .setLabel(`맥스(${formatMoney(maxAmount)})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disableAll || !canMax),
  );

  return [row1, row2, row3];
}

function setGameExpiry(games, gameId, ms = 10 * 60 * 1000) {
  setTimeout(() => {
    const g = games.get(gameId);
    if (g && !g.ended) games.delete(gameId);
  }, ms);
}

function hasActiveGame(games, userId) {
  for (const g of games.values()) {
    if (g?.ended) continue;
    if (g.challengerId === userId || g.opponentId === userId) return true;
  }
  return false;
}

export async function handleCommand(interaction, ctx) {
  const { games } = ctx;

  switch (interaction.commandName) {
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

    case "족보": {
      await interaction.reply({
        ephemeral: true,
        embeds: [infoEmbed("🎴 섯다 족보", buildSeotdaRulesText())],
      });
      return;
    }

    case "섯다": {
      const opponent = interaction.options.getUser("상대");
      const baseInput = interaction.options.getInteger("기본금");
      const baseAmount = baseInput ?? 1000;
      const userId = interaction.user.id;

      if (opponent && opponent.id === userId) {
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

      if (hasActiveGame(games, userId)) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("이미 게임 중", "진행 중인 섯다 게임이 있어!")],
        });
        return;
      }

      if (opponent && hasActiveGame(games, opponent.id)) {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("상대 게임 중", "상대가 이미 다른 섯다 게임 중이야!"),
          ],
        });
        return;
      }

      if (baseAmount < 1000) {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("기본금 오류", "기본금은 최소 1,000원부터 가능해!"),
          ],
        });
        return;
      }

      const challengerBalance = await getBalance(userId);
      if (challengerBalance < baseAmount) {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            errorEmbed("잔액 부족", "보유금이 부족해서 기본금을 낼 수 없어!"),
          ],
        });
        return;
      }

      await interaction.deferReply();

      const gameId = randomUUID();
      const game = createGame({
        id: gameId,
        channelId: interaction.channelId,
        challengerId: userId,
        opponentId: opponent ? opponent.id : null,
      });
      game.baseAmount = baseAmount;

      // 솔로면 즉시 시작
      if (!opponent) {
        game.botUserId = interaction.client.user?.id ?? null;
        await addBalance(userId, -baseAmount);
        game.pot = baseAmount * 2;
        startGame(game, userId, "AI");
        games.set(gameId, game);
        setGameExpiry(games, gameId);

        const payload = buildActiveGameMessage(game);
        addBalancesToPayload(payload, game, {
          [userId]: challengerBalance - baseAmount,
        });
        payload.components = buildInitialBettingComponents(
          game,
          challengerBalance - baseAmount,
        );
        await interaction.editReply(payload);
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
