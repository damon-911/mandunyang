import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

import { handleCommand } from "./handlers/commands.js";
import { handleButton } from "./handlers/buttons.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// gameId -> game (메모리 저장)
const games = new Map();

client.once("ready", () => {
  console.log(`🐱 만두냥 로그인 완료: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, { games });
      return;
    }

    if (interaction.isButton()) {
      const [action, gameId] = interaction.customId.split(":");
      if (!action || !gameId) return;

      await handleButton(interaction, action, gameId, { games });
      return;
    }
  } catch (err) {
    console.error(err);
    // 여기서는 공통 에러 처리만. (각 핸들러가 대부분 처리함)
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "😿 에러가 났다냥!",
          ephemeral: true,
        });
      }
    } catch {}
  }
});

client.login(process.env.DISCORD_TOKEN);
