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
import { applyAiTurn } from "./buttons.js";

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

function setGameExpiry(games, game, ms = 5 * 60 * 1000) {
  if (game.expireTimer) clearTimeout(game.expireTimer);
  game.expireTimer = setTimeout(() => {
    const g = games.get(game.id);
    if (g && !g.ended) {
      games.delete(game.id);
      g.lastTimeoutNoticeAt = Date.now();
      g._timeoutNoticeChannel
        ?.send("⏰ 게임이 종료되어 판돈이 소멸되었습니다.")
        .then(() => {
          if (g._timeoutNoticeChannel?.isThread?.()) {
            setTimeout(() => {
              g._timeoutNoticeChannel
                ?.delete("Seotda game timed out")
                .catch(() => { });
            }, 10_000);
          }
        })
        .catch(() => { });
    }
  }, ms);
}

function hasActiveGame(games, userId) {
  for (const g of games.values()) {
    if (g?.ended) continue;
    if (g.challengerId === userId || g.opponentId === userId) return true;
  }
  return false;
}

async function ensureGameChannel(interaction, gameId, opponent) {
  const baseChannel = interaction.channel;
  if (!baseChannel) return null;
  if (baseChannel.isThread?.()) return baseChannel;

  const canCreateThread = typeof baseChannel.threads?.create === "function";
  if (!canCreateThread) return baseChannel;

  const p1 = interaction.user.username;
  const p2 = opponent?.username ?? "만두냥";
  const safeName = `🎴 만두냥 섯다방 (${p1} vs ${p2})`.slice(0, 90);
  try {
    const thread = await baseChannel.threads.create({
      name: safeName,
      autoArchiveDuration: 60,
      reason: "Seotda game",
    });
    if (opponent) {
      baseChannel
        .send(
          `😺 만두냥이 섯다방을 열었어! 여기로 이동해줘: <#${thread.id}>`,
        )
        .catch(() => { });
    }
    return thread;
  } catch {
    return baseChannel;
  }
}

export async function handleCommand(interaction, ctx) {
  const { games } = ctx;

  async function errorReply(payload) {
    await interaction.reply(payload);
    if (payload?.ephemeral) {
      setTimeout(() => {
        if (interaction.deferred || interaction.replied) {
          interaction.deleteReply().catch(() => { });
        }
      }, 5000);
    }
  }

  switch (interaction.commandName) {
    case "출석체크": {
      const userId = interaction.user.id;
      const today = getKstDateString();
      const DAILY_REWARD = 10000;

      if (!(await canAttend(userId, today))) {
        const user = await getUser(userId);
        await errorReply({
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
        await errorReply({
          ephemeral: true,
          embeds: [
            errorEmbed("잘못된 대결", "자기 자신과는 대결할 수 없어 😅"),
          ],
        });
        return;
      }

      if (opponent && opponent.bot) {
        await errorReply({
          ephemeral: true,
          embeds: [errorEmbed("잘못된 상대", "봇이 아닌 사람을 태그해줘!")],
        });
        return;
      }

      if (hasActiveGame(games, userId)) {
        await errorReply({
          ephemeral: true,
          embeds: [errorEmbed("이미 게임 중", "진행 중인 섯다 게임이 있어!")],
        });
        return;
      }

      if (opponent && hasActiveGame(games, opponent.id)) {
        await errorReply({
          ephemeral: true,
          embeds: [
            errorEmbed("상대 게임 중", "상대가 이미 다른 섯다 게임 중이야!"),
          ],
        });
        return;
      }

      if (baseAmount < 1000) {
        await errorReply({
          ephemeral: true,
          embeds: [
            errorEmbed("기본금 오류", "기본금은 최소 1,000원부터 가능해!"),
          ],
        });
        return;
      }

      const challengerBalance = await getBalance(userId);
      if (challengerBalance < baseAmount) {
        await errorReply({
          ephemeral: true,
          embeds: [
            errorEmbed("잔액 부족", "보유금이 부족해서 기본금을 낼 수 없어!"),
          ],
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const gameId = randomUUID();
      const game = createGame({
        id: gameId,
        channelId: interaction.channelId,
        challengerId: userId,
        opponentId: opponent ? opponent.id : null,
      });
      game.baseAmount = baseAmount;

      const gameChannel = await ensureGameChannel(
        interaction,
        gameId,
        opponent,
      );
      if (!gameChannel) {
        await interaction.editReply({
          content: "채널 정보를 가져오지 못했어. 다시 시도해줘!",
        });
        return;
      }
      game.channelId = gameChannel.id;
      game._timeoutNoticeChannel = gameChannel;

      // 솔로면 즉시 시작
      if (!opponent) {
        game.botUserId = interaction.client.user?.id ?? null;
        await addBalance(userId, -baseAmount);
        game.pot = baseAmount * 2;
        startGame(game, userId, "AI");
        games.set(gameId, game);
        setGameExpiry(games, game);

        if (game.turnId === "AI") {
          const aiTurn = await applyAiTurn(
            game,
            games,
            game._timeoutNoticeChannel,
          );
          await gameChannel.send(aiTurn.payload);
          if (gameChannel.id !== interaction.channelId) {
            await interaction.editReply({
              content: `😺 만두냥이 섯다방을 열었어! 여기로 이동해줘: <#${gameChannel.id}>`,
            });
            setTimeout(() => {
              if (interaction.deferred || interaction.replied) {
                interaction.deleteReply().catch(() => { });
              }
            }, 10_000);
          } else {
            await interaction.editReply({ content: "게임을 시작했어!" });
          }
          return;
        }

        const payload = buildActiveGameMessage(game);
        addBalancesToPayload(payload, game, {
          [userId]: challengerBalance - baseAmount,
        });
        payload.components = buildInitialBettingComponents(
          game,
          challengerBalance - baseAmount,
        );
        await gameChannel.send(payload);
        if (gameChannel.id !== interaction.channelId) {
          await interaction.editReply({
            content: `😺 만두냥이 섯다방을 열었어! 여기로 이동해줘: <#${gameChannel.id}>`,
          });
          setTimeout(() => {
            if (interaction.deferred || interaction.replied) {
              interaction.deleteReply().catch(() => { });
            }
          }, 10_000);
        } else {
          await interaction.editReply({ content: "게임을 시작했어!" });
        }
        return;
      }

      // 1:1이면 수락 대기
      games.set(gameId, game);
      setGameExpiry(games, game);

      await gameChannel.send(buildPendingMessage(game));
      if (gameChannel.id !== interaction.channelId) {
        await interaction.editReply({
          content: `😺 만두냥이 섯다방을 열었어! 여기로 이동해줘: <#${gameChannel.id}>`,
        });
        setTimeout(() => {
          if (interaction.deferred || interaction.replied) {
            interaction.deleteReply().catch(() => { });
          }
        }, 10_000);
      } else {
        await interaction.editReply({ content: "대결 신청을 보냈어!" });
      }
      return;
    }

    default: {
      await errorReply({
        ephemeral: true,
        embeds: [errorEmbed("알 수 없는 명령어", "등록되지 않은 명령어야!")],
      });
      return;
    }
  }
}
