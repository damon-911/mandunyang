import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('핑')
    .setDescription('만두냥 작동 테스트')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('섯다')
    .setDescription('섯다 게임 (상대 없으면 만두냥과 대결)')
    .addUserOption(opt =>
      opt.setName('상대')
        .setDescription('대결할 서버 사람을 태그')
        .setRequired(false)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  { body: commands }
);