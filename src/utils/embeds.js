import { EmbedBuilder } from "discord.js";

const COLOR = 0xffc83d; // 만두냥 컬러

export function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description + "\n")
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

  fields.forEach((f) => embed.addFields(f));

  return embed;
}
