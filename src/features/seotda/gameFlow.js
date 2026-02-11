import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  inlineCode,
} from "discord.js";

import { createDeck, shuffle, draw, formatCard } from "./cards.js";
import { getHandRank, compareHands } from "./rank.js";
import { gameEmbed } from "../../utils/embeds.js";

function getPlayerLabel(id) {
  if (!id) return "알 수 없음";
  return `<@${id}>`;
}

function getBotLabel(game) {
  return game.botUserId ? `<@${game.botUserId}>` : "만두냥";
}

export function createGame({ id, channelId, challengerId, opponentId }) {
  return {
    id,
    channelId,
    createdAt: Date.now(),
    state: opponentId ? "pending" : "active",
    challengerId,
    opponentId: opponentId ?? null,
    botId: opponentId ? null : "AI",
    botUserId: null,
    ended: false,
    players: {},
    baseAmount: 0,
    pot: 0,
    currentBet: 0,
    lastBetBy: null,
    checksInRow: 0,
    turnId: challengerId,
  };
}

export function startGame(game, p1Id, opponentUserIdOrAI) {
  const deck = shuffle(createDeck());

  const p1Hand = draw(deck, 2);
  const p1Rank = getHandRank(p1Hand[0], p1Hand[1]);

  const p2Hand = draw(deck, 2);
  const p2Rank = getHandRank(p2Hand[0], p2Hand[1]);

  if (opponentUserIdOrAI !== "AI") {
    game.botId = null;
    game.players = {
      [p1Id]: {
        id: p1Id,
        label: getPlayerLabel(p1Id),
        isBot: false,
        hand: p1Hand,
        rank: p1Rank,
        checked: false,
      },
      [opponentUserIdOrAI]: {
        id: opponentUserIdOrAI,
        label: getPlayerLabel(opponentUserIdOrAI),
        isBot: false,
        hand: p2Hand,
        rank: p2Rank,
        checked: false,
      },
    };
    const ids = [p1Id, opponentUserIdOrAI];
    game.turnId = ids[Math.floor(Math.random() * ids.length)];
  } else {
    game.botId = "AI";
    game.players = {
      [p1Id]: {
        id: p1Id,
        label: getPlayerLabel(p1Id),
        isBot: false,
        hand: p1Hand,
        rank: p1Rank,
        checked: false,
      },
      AI: {
        id: "AI",
        label: getBotLabel(game),
        isBot: true,
        hand: p2Hand,
        rank: p2Rank,
        checked: true,
      },
    };
    game.turnId = p1Id;
  }

  game.state = "active";
  game.currentBet = 0;
  game.lastBetBy = null;
  game.checksInRow = 0;
}

export function buildPendingMessage(game) {
  const challengerLabel = getPlayerLabel(game.challengerId);
  const opponentLabel = getPlayerLabel(game.opponentId);
  const baseText = game.baseAmount
    ? `${game.baseAmount.toLocaleString("ko-KR")}원`
    : "없음";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_accept:${game.id}`)
      .setLabel("수락")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`seotda_decline:${game.id}`)
      .setLabel("거절")
      .setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [
      gameEmbed("🎴 섯다 대결 신청!", [
        {
          name: "대결",
          value: `${challengerLabel} vs ${opponentLabel}`,
        },
        { name: "기본금", value: baseText },
        {
          name: "안내",
          value: `👉 ${opponentLabel} 님이 **수락/거절**을 눌러주세요.`,
        },
      ]),
    ],
    components: [row],
  };
}

export function buildActiveGameMessage(game) {
  const ids = Object.keys(game.players).filter((id) => id !== "AI");
  const p1Label = getPlayerLabel(ids[0]);
  const p2Label = game.botId ? getBotLabel(game) : getPlayerLabel(ids[1]);
  const baseText = game.baseAmount
    ? `${game.baseAmount.toLocaleString("ko-KR")}원`
    : "없음";
  const potText = `${game.pot.toLocaleString("ko-KR")}원`;
  const vsText = game.botId
    ? `${p1Label} vs ${p2Label}`
    : `${p1Label} vs ${p2Label}`;

  return {
    embeds: [
      gameEmbed("🎴 섯다 시작!", [
        { name: "대결", value: vsText },
        { name: "기본금", value: baseText, inline: true },
        { name: "판돈", value: potText, inline: true },
        {
          name: "지금 차례",
          value:
            game.turnId === "AI"
              ? getBotLabel(game)
              : getPlayerLabel(game.turnId),
          inline: true,
        },
        {
          name: "현재 베팅",
          value:
            game.currentBet > 0
              ? `${game.currentBet.toLocaleString("ko-KR")}원`
              : "없음",
          inline: true,
        },
        {
          name: "진행 방법",
          value:
            "• **체크**: 배팅 없이 넘기기\n" +
            "• **콜**: 상대 배팅과 동일하게 내기\n" +
            "• **쿼터/하프/맥스**: 판돈 기준 추가 배팅\n" +
            "• **다이**: 포기하고 판돈 양보",
        },
      ]),
    ],
    components: [],
  };
}

export function buildHandEmbed(player) {
  const c1 = formatCard(player.hand[0]);
  const c2 = formatCard(player.hand[1]);

  return gameEmbed("🃏 내 패", [
    { name: "카드", value: `${c1} / ${c2}` },
    { name: "패", value: `**${player.rank.name}**` },
  ]);
}

export function buildResultUpdatePayload(game) {
  const keys = Object.keys(game.players);
  const pA = game.players[keys[0]];
  const pB = game.players[keys[1]];

  const cmp = compareHands(pA.rank, pB.rank);
  const result =
    cmp > 0
      ? `🏆 승자: ${pA.label}`
      : cmp < 0
        ? `🏆 승자: ${pB.label}`
        : `🤝 무승부!`;

  return {
    components: [],
    embeds: [
      gameEmbed("🎴 섯다 결과", [
        {
          name: `플레이어 1`,
          value: `${pA.label}\n${formatCard(pA.hand[0])} / ${formatCard(pA.hand[1])} → **${pA.rank.name}**`,
        },
        {
          name: `플레이어 2`,
          value: `${pB.label}\n${formatCard(pB.hand[0])} / ${formatCard(pB.hand[1])} → **${pB.rank.name}**`,
        },
        {
          name: "판돈",
          value: `${game.pot.toLocaleString("ko-KR")}원`,
        },
      ]),
    ],
  };
}
