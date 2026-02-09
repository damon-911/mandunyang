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
  players: {
    [userId]: { id, label, isBot, hand:[c1,c2], rank, checked:boolean }
  },
  botId: 'AI' | null,
  ended: false
}
*/

function buildGameMessage(game) {
  const ids = Object.keys(game.players).filter((id) => id !== 'AI');
  const labels = ids.map((id) => `<@${id}>`).join(' vs ');
  const opponentLabel = game.botId ? '만두냥' : labels;

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

  return {
    content:
      `🎴 **섯다 시작!**\n` +
      `대결: ${game.botId ? `<@${ids[0]}> vs 만두냥` : opponentLabel}\n\n` +
      `- **패 확인**: 본인에게만 패를 보여줘요.\n` +
      `- **승부 보기**: 패를 공개하고 결과를 냅니다.`,
    components: [row],
  };
}

function safeGetPlayer(game, userId) {
  const p = game.players[userId];
  return p ?? null;
}

client.once('ready', () => {
  console.log(`🐱 만두냥 로그인 완료: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // 슬래시 명령어가 아닌 경우
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === '핑') {
      await interaction.reply('퐁! 🏓');
    }
    else if (interaction.commandName === '섯다') {
      const opponent = interaction.options.getUser('상대'); // 없으면 null

      // 상대가 자기 자신이면 막기
      if (opponent && opponent.id === interaction.user.id) {
        await interaction.reply({ content: '자기 자신과는 대결할 수 없어 😅', ephemeral: true });
        return;
      }

      // 상대가 봇이면 막기(옵션 없이 쓰면 만두냥과 대결)
      if (opponent && opponent.bot) {
        await interaction.reply({ content: '봇이 아닌 사람을 태그해줘! (옵션 없이 쓰면 만두냥과 대결해)', ephemeral: true });
        return;
      }

      const deck = shuffle(createDeck());

      // 플레이어 1 (명령어 친 사람)
      const p1Hand = draw(deck, 2);
      const p1Rank = getHandRank(p1Hand[0], p1Hand[1]);

      // 플레이어 2 (상대 or 만두냥)
      const p2Hand = draw(deck, 2);
      const p2Rank = getHandRank(p2Hand[0], p2Hand[1]);

      const gameId = randomUUID();
      const game = {
        id: gameId,
        channelId: interaction.channelId,
        createdAt: Date.now(),
        ended: false,
        botId: opponent ? null : 'AI',
        players: {
          [interaction.user.id]: {
            id: interaction.user.id,
            label: `<@${interaction.user.id}>`,
            isBot: false,
            hand: p1Hand,
            rank: p1Rank,
            checked: false,
          },
          [opponent ? opponent.id : 'AI']: {
            id: opponent ? opponent.id : 'AI',
            label: opponent ? `<@${opponent.id}>` : '만두냥',
            isBot: !opponent,
            hand: p2Hand,
            rank: p2Rank,
            checked: !opponent, // 만두냥은 굳이 “확인” 안 해도 되게 true 처리
          },
        },
      };

      games.set(gameId, game);

      // 10분 지나면 자동 폐기(메모리 정리용)
      setTimeout(() => {
        const g = games.get(gameId);
        if (g && !g.ended) games.delete(gameId);
      }, 10 * 60 * 1000);

      await interaction.reply(buildGameMessage(game));
      return;
    }

    // 2) Buttons
    if (interaction.isButton()) {
      const [action, gameId] = interaction.customId.split(':');
      if (!action || !gameId) return;

      const game = games.get(gameId);
      if (!game || game.ended) {
        await interaction.reply({ content: '이 게임은 이미 끝났거나 만료됐어 😿', ephemeral: true });
        return;
      }

      // 다른 채널에서 버튼 눌러도 막기
      if (interaction.channelId !== game.channelId) {
        await interaction.reply({ content: '이 게임이 시작된 채널에서만 조작할 수 있어!', ephemeral: true });
        return;
      }

      // 참가자만 조작 가능
      const player = safeGetPlayer(game, interaction.user.id);
      if (!player) {
        await interaction.reply({ content: '이 게임 참가자만 누를 수 있어!', ephemeral: true });
        return;
      }

      if (action === 'seotda_check') {
        player.checked = true;

        const c1 = formatCard(player.hand[0]);
        const c2 = formatCard(player.hand[1]);

        await interaction.reply({
          ephemeral: true,
          content:
            `🃏 **너의 패**\n` +
            `${c1}, ${c2}\n` +
            `→ **${player.rank.name}**`,
        });
        return;
      }

      if (action === 'seotda_show') {
        // (선택 룰) 사람 vs 사람일 때, 둘 다 패 확인 후에만 공개하고 싶으면 아래 주석 해제
        // if (!game.botId) {
        //   const ids = Object.keys(game.players).filter(id => id !== 'AI');
        //   const allChecked = ids.every(id => game.players[id]?.checked);
        //   if (!allChecked) {
        //     await interaction.reply({ content: '두 사람 모두 **패 확인**을 누른 뒤에 승부를 볼 수 있어!', ephemeral: true });
        //     return;
        //   }
        // }

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
          content:
            `🎴 **섯다 결과**\n\n` +
            `${pA.label}: ${formatCard(pA.hand[0])}, ${formatCard(pA.hand[1])} → **${pA.rank.name}**\n` +
            `${pB.label}: ${formatCard(pB.hand[0])}, ${formatCard(pB.hand[1])} → **${pB.rank.name}**\n\n` +
            `${result}`,
        });
        return;
      }
    }
  } catch (err) {
    console.error(err);
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: '😿 에러가 났다냥!', ephemeral: true });
      }
    } catch { }
  }
});

client.login(process.env.DISCORD_TOKEN);