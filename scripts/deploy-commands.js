import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("섯다")
    .setDescription("섯다 게임")
    .addIntegerOption((opt) =>
      opt
        .setName("기본금")
        .setDescription("기본금 (최소 1,000원)")
        .setMinValue(1000)
        .setRequired(true),
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
    .setName("송금")
    .setDescription("다른 사용자에게 게임머니를 송금")
    .addUserOption((opt) =>
      opt.setName("대상").setDescription("송금할 사용자").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("금액")
        .setDescription("송금 금액 (최소 1,000원)")
        .setMinValue(1000)
        .setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("순위")
    .setDescription("보유금 순위 확인")
    .addStringOption((opt) =>
      opt
        .setName("기준")
        .setDescription("순위 기준")
        .addChoices(
          { name: "서버", value: "server" },
          { name: "전체", value: "global" },
        )
        .setRequired(false),
    )
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
