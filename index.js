import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { randomUUID } from 'crypto';
import { createDeck, shuffle, draw, formatCard } from './seotda/cards.js';
import { getHandRank, compareHands } from './seotda/rank.js';
import { infoEmbed, errorEmbed, gameEmbed } from './utils/embeds.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// gameId -> game
const games = new Map();
/**
game = {
  id,
  channelId,
  createdAt,
  state: 'pending' | 'active',
  challengerId,
  opponentId, // 사람 1:1일 때만
  players: {
    [userId or 'AI']: { id, label, isBot, hand, rank, checked }
  },
  botId: 'AI' | null,
  ended: false
}
*/

function buildActiveGameMessage(game) {
  const ids = Object.keys(game.players).filter((id) => id !== 'AI');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_check:${game.id}`)
      .setLabel('패 확인')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`seotda_show:${game.id}`)
      .setLabel('승부 보기')
      .setStyle(ButtonStyle.Success),
  );

  const vsText = game.botId
    ? `<@${ids[0]}> vs 만두냥`
    : `<@${ids[0]}> vs <@${ids[1]}>`;

  return {
    embeds: [
      gameEmbed('🎴 섯다 시작!', [
        { name: '대결', value: vsText },
        {
          name: '진행 방법',
          value:
            '• **패 확인**: 본인에게만 패 공개\n' +
            '• **승부 보기**: 패 공개 후 결과 확인',
        },
      ]),
    ],
    components: [row],
  };
}

function buildPendingMessage(game) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seotda_accept:${game.id}`)
      .setLabel('수락')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`seotda_decline:${game.id}`)
      .setLabel('거절')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [
      gameEmbed('🎴 섯다 대결 신청!', [
        {
          name: '대결',
          value: `<@${game.challengerId}> vs <@${game.opponentId}>`,
        },
        {
          name: '안내',
          value: `👉 <@${game.opponentId}> 님이 **수락/거절**을 눌러주세요.`,
        },
      ]),
    ],
    components: [row],
  };
}

function safeGetPlayer(game, userId) {
  const p = game.players[userId];
  return p ?? null;
}

function startGame(game, interactionUserId, opponentUserIdOrAI) {
  const deck = shuffle(createDeck());

  const p1Hand = draw(deck, 2);
  const p1Rank = getHandRank(p1Hand[0], p1Hand[1]);

  const p2Hand = draw(deck, 2);
  const p2Rank = getHandRank(p2Hand[0], p2Hand[1]);

  // 사람 vs 사람
  if (opponentUserIdOrAI !== 'AI') {
    game.botId = null;
    game.players = {
      [interactionUserId]: {
        id: interactionUserId,
        label: `<@${interactionUserId}>`,
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
    // 솔로
    game.botId = 'AI';
    game.players = {
      [interactionUserId]: {
        id: interactionUserId,
        label: `<@${interactionUserId}>`,
        isBot: false,
        hand: p1Hand,
        rank: p1Rank,
        checked: false,
      },
      AI: {
        id: 'AI',
        label: '만두냥',
        isBot: true,
        hand: p2Hand,
        rank: p2Rank,
        checked: true, // 만두냥은 확인 필요 없음
      },
    };
  }

  game.state = 'active';
}

client.once('ready', () => {
  console.log(`🐱 만두냥 로그인 완료: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // 1) Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === '핑') {
        await interaction.reply({
          embeds: [infoEmbed('핑', '퐁! 🏓')],
        });
        return;
      }

      if (interaction.commandName === '섯다') {
        const opponent = interaction.options.getUser('상대'); // 없으면 null

        // 자기 자신 태그 방지
        if (opponent && opponent.id === interaction.user.id) {
          await interaction.reply({
            ephemeral: true,
            embeds: [errorEmbed('잘못된 대결', '자기 자신과는 대결할 수 없어 😅')],
          });
          return;
        }

        // 봇 태그 방지(옵션 없이 쓰면 만두냥과 대결)
        if (opponent && opponent.bot) {
          await interaction.reply({
            ephemeral: true,
            embeds: [errorEmbed('잘못된 상대', '봇이 아닌 사람을 태그해줘!')],
          });
          return;
        }

        const gameId = randomUUID();
        const game = {
          id: gameId,
          channelId: interaction.channelId,
          createdAt: Date.now(),
          state: opponent ? 'pending' : 'active',
          challengerId: interaction.user.id,
          opponentId: opponent ? opponent.id : null,
          botId: opponent ? null : 'AI',
          ended: false,
          players: {},
        };

        // 솔로면 바로 시작
        if (!opponent) {
          startGame(game, interaction.user.id, 'AI');
          games.set(gameId, game);

          setTimeout(() => {
            const g = games.get(gameId);
            if (g && !g.ended) games.delete(gameId);
          }, 10 * 60 * 1000);

          await interaction.reply(buildActiveGameMessage(game));
          return;
        }

        // 1:1이면 “수락 대기”
        games.set(gameId, game);

        setTimeout(() => {
          const g = games.get(gameId);
          if (g && !g.ended) games.delete(gameId);
        }, 10 * 60 * 1000);

        await interaction.reply(buildPendingMessage(game));
        return;
      }
    }

    // 2) Buttons
    if (interaction.isButton()) {
      const [action, gameId] = interaction.customId.split(':');
      if (!action || !gameId) return;

      const game = games.get(gameId);
      if (!game || game.ended) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed('만료됨', '이 게임은 이미 끝났거나 만료됐어 😿')],
        });
        return;
      }

      // 채널 고정
      if (interaction.channelId !== game.channelId) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed('조작 불가', '이 게임이 시작된 채널에서만 조작할 수 있어!')],
        });
        return;
      }

      // --- 수락/거절 단계 ---
      if (action === 'seotda_accept') {
        if (game.state !== 'pending') {
          await interaction.reply({
            ephemeral: true,
            embeds: [errorEmbed('요청 불가', '이미 진행 중이거나 종료된 요청이야!')],
          });
          return;
        }
        if (interaction.user.id !== game.opponentId) {
          await interaction.reply({
            ephemeral: true,
            embeds: [errorEmbed('권한 없음', '상대만 수락할 수 있어!')],
          });
          return;
        }

        // 게임 시작(카드 배분)
        startGame(game, game.challengerId, game.opponentId);
        games.set(gameId, game);

        await interaction.update(buildActiveGameMessage(game));
        return;
      }

      if (action === 'seotda_decline') {
        if (game.state !== 'pending') {
          await interaction.reply({
            ephemeral: true,
            embeds: [errorEmbed('요청 불가', '이미 진행 중이거나 종료된 요청이야!')],
          });
          return;
        }
        if (interaction.user.id !== game.opponentId) {
          await interaction.reply({
            ephemeral: true,
            embeds: [errorEmbed('권한 없음', '상대만 거절할 수 있어!')],
          });
          return;
        }

        game.ended = true;
        games.delete(gameId);

        await interaction.update({
          embeds: [
            infoEmbed('대결 거절', `😿 <@${game.opponentId}> 님이 대결을 거절했어요.`),
          ],
          components: [],
        });
        return;
      }

      // --- 진행 단계(패 확인/승부 보기) ---
      if (game.state !== 'active') {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed('대기 중', '아직 수락 대기 중이야!')],
        });
        return;
      }

      // 참가자만 조작 가능
      const player = safeGetPlayer(game, interaction.user.id);
      if (!player) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed('권한 없음', '이 게임 참가자만 누를 수 있어!')],
        });
        return;
      }

      if (action === 'seotda_check') {
        player.checked = true;

        const c1 = formatCard(player.hand[0]);
        const c2 = formatCard(player.hand[1]);

        await interaction.reply({
          ephemeral: true,
          embeds: [
            gameEmbed('🃏 내 패', [
              { name: '카드', value: `${c1}, ${c2}` },
              { name: '패', value: `**${player.rank.name}**` },
            ]),
          ],
        });
        return;
      }

      if (action === 'seotda_show') {
        // 사람 vs 사람일 때: 둘 다 패 확인 후 승부 보기 (긴장감↑)
        if (!game.botId) {
          const ids = Object.keys(game.players).filter((id) => id !== 'AI');
          const allChecked = ids.every((id) => game.players[id]?.checked);
          if (!allChecked) {
            await interaction.reply({
              ephemeral: true,
              embeds: [
                errorEmbed('아직 안 돼!', '두 사람 모두 **패 확인**을 누른 뒤에 승부를 볼 수 있어!'),
              ],
            });
            return;
          }
        }

        const keys = Object.keys(game.players);
        const pA = game.players[keys[0]];
        const pB = game.players[keys[1]];

        const cmp = compareHands(pA.rank, pB.rank);
        const result =
          cmp > 0 ? `🏆 승자: ${pA.label}`
            : cmp < 0 ? `🏆 승자: ${pB.label}`
              : `🤝 무승부!`;

        game.ended = true;
        games.delete(gameId);

        await interaction.update({
          components: [],
          embeds: [
            gameEmbed('🎴 섯다 결과', [
              {
                name: pA.label,
                value:
                  `${formatCard(pA.hand[0])}, ${formatCard(pA.hand[1])}\n` +
                  `→ **${pA.rank.name}**`,
                inline: true,
              },
              {
                name: pB.label,
                value:
                  `${formatCard(pB.hand[0])}, ${formatCard(pB.hand[1])}\n` +
                  `→ **${pB.rank.name}**`,
                inline: true,
              },
              { name: '결과', value: result },
            ]),
          ],
        });
        return;
      }
    }
  } catch (err) {
    console.error(err);
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed('에러', '😿 에러가 났다냥!')],
        });
      }
    } catch { }
  }
});

client.login(process.env.DISCORD_TOKEN);
