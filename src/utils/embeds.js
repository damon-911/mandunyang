import { EmbedBuilder } from "discord.js";

const COLOR = 0xffc83d; // 만두냥 컬러

export function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

export function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function gameEmbed(title, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setTimestamp();

  const SPACER = { name: "\u200B", value: "\u200B", inline: false };
  fields.forEach((f, idx) => {
    embed.addFields(f);
    if (idx < fields.length - 1) embed.addFields(SPACER);
  });
  return embed;
}
