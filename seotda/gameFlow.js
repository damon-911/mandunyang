import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import { createDeck, shuffle, draw, formatCard } from "./cards.js";
import { getHandRank, compareHands } from "./rank.js";
import { gameEmbed } from "../utils/embeds.js";

export function createGame({ id, channelId, challengerId, opponentId }) {
    return {
        id,
        channelId,
        createdAt: Date.now(),
        state: opponentId ? "pending" : "active",
        challengerId,
        opponentId: opponentId ?? null,
        botId: opponentId ? null : "AI",
        ended: false,
        players: {},
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
                label: `<@${p1Id}>`,
                isBot: false,
                hand: p1Hand,
                rank: p1Rank,
                checked: false,
            },
            [opponentUserIdOrAI]: {
                id: opponentUserIdOrAI,
                label: `<@${opponentUserIdOrAI}>`,
                isBot: false,
                hand: p2Hand,
                rank: p2Rank,
                checked: false,
            },
        };
    } else {
        game.botId = "AI";
        game.players = {
            [p1Id]: {
                id: p1Id,
                label: `<@${p1Id}>`,
                isBot: false,
                hand: p1Hand,
                rank: p1Rank,
                checked: false,
            },
            AI: {
                id: "AI",
                label: "만두냥",
                isBot: true,
                hand: p2Hand,
                rank: p2Rank,
                checked: true,
            },
        };
    }

    game.state = "active";
}

export function buildPendingMessage(game) {
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
                    value: `<@${game.challengerId}> vs <@${game.opponentId}>`,
                },
                {
                    name: "안내",
                    value: `👉 <@${game.opponentId}> 님이 **수락/거절**을 눌러주세요.`,
                },
            ]),
        ],
        components: [row],
    };
}

export function buildActiveGameMessage(game) {
    const ids = Object.keys(game.players).filter((id) => id !== "AI");
    const vsText = game.botId
        ? `<@${ids[0]}> vs 만두냥`
        : `<@${ids[0]}> vs <@${ids[1]}>`;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`seotda_check:${game.id}`)
            .setLabel("패 확인")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`seotda_show:${game.id}`)
            .setLabel("승부 보기")
            .setStyle(ButtonStyle.Success),
    );

    return {
        embeds: [
            gameEmbed("🎴 섯다 시작!", [
                { name: "대결", value: vsText },
                {
                    name: "진행 방법",
                    value:
                        "• **패 확인**: 본인에게만 패 공개\n" +
                        "• **승부 보기**: 패 공개 후 결과 확인",
                },
            ]),
        ],
        components: [row],
    };
}

export function buildHandEmbed(player) {
    const c1 = formatCard(player.hand[0]);
    const c2 = formatCard(player.hand[1]);

    return gameEmbed("🃏 내 패", [
        { name: "카드", value: `${c1}, ${c2}` },
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
                    name: pA.label,
                    value: `${formatCard(pA.hand[0])}, ${formatCard(pA.hand[1])}\n→ **${pA.rank.name}**`,
                    inline: true,
                },
                {
                    name: pB.label,
                    value: `${formatCard(pB.hand[0])}, ${formatCard(pB.hand[1])}\n→ **${pB.rank.name}**`,
                    inline: true,
                },
                { name: "결과", value: result },
            ]),
        ],
    };
}
