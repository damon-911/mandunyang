import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("핑")
    .setDescription("만두냥 작동 테스트")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("섯다")
    .setDescription("섯다 게임")
    .addIntegerOption((opt) =>
      opt
        .setName("기본금")
        .setDescription("기본금 (최소 1,000원)")
        .setMinValue(1000)
        .setRequired(false),
    )
    .addUserOption((opt) =>
      opt
        .setName("상대")
        .setDescription("대결할 사람을 태그")
        .setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("출석체크")
    .setDescription("하루 한 번 출석하고 10,000원 받기")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("내정보")
    .setDescription("내 게임머니/출석 정보 확인")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("족보")
    .setDescription("섯다 족보 보기")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
  body: commands,
});
