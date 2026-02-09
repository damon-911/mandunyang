import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { createDeck, shuffle, draw, formatCard } from './seotda/cards.js';
import { getHandRank, compareHands } from './seotda/rank.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`🐱 만두냥 로그인 완료: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === '핑') {
    await interaction.reply('퐁! 🏓');
  }
  else if (interaction.commandName === '섯다') {
    const opponent = interaction.options.getUser('상대'); // 없으면 null

    // 자기 자신 태그 방지
    if (opponent && opponent.id === interaction.user.id) {
      await interaction.reply({ content: '자기 자신과는 대결할 수 없어 😅', ephemeral: true });
      return;
    }

    // 봇 계정 태그 방지(만두냥 솔로는 옵션 없이)
    if (opponent && opponent.bot) {
      await interaction.reply({ content: '봇이 아닌 사람을 태그해줘! (옵션 없이 쓰면 만두냥과 대결해)', ephemeral: true });
      return;
    }

    const deck = shuffle(createDeck());

    const p1Hand = draw(deck, 2);
    const p1Rank = getHandRank(p1Hand[0], p1Hand[1]);

    const p2Hand = draw(deck, 2);
    const p2Rank = getHandRank(p2Hand[0], p2Hand[1]);

    const p2Label = opponent ? `<@${opponent.id}>` : '만두냥';
    const modeLabel = opponent ? '1:1' : '솔로';

    const cmp = compareHands(p1Rank, p2Rank);
    const result =
      cmp > 0 ? `🎉 <@${interaction.user.id}> 승!`
        : cmp < 0 ? `🏆 ${p2Label} 승!`
          : `🤝 무승부!`;

    await interaction.reply(
      `🎴 **섯다 ${modeLabel}**\n\n` +
      `<@${interaction.user.id}>: ${formatCard(p1Hand[0])}, ${formatCard(p1Hand[1])} → **${p1Rank.name}**\n` +
      `${p2Label}: ${formatCard(p2Hand[0])}, ${formatCard(p2Hand[1])} → **${p2Rank.name}**\n\n` +
      `${result}`
    );
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);