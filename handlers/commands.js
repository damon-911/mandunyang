import { randomUUID } from 'crypto';

import { infoEmbed, errorEmbed, gameEmbed } from '../utils/embeds.js';
import { getKstDateString } from '../utils/kst.js';
import { getUser, canAttend, attend } from '../data/userStore.js';

import { createGame, startGame, buildActiveGameMessage, buildPendingMessage } from '../seotda/gameFlow.js';

function setGameExpiry(games, gameId, ms = 10 * 60 * 1000) {
    setTimeout(() => {
        const g = games.get(gameId);
        if (g && !g.ended) games.delete(gameId);
    }, ms);
}

export async function handleCommand(interaction, ctx) {
    const { games } = ctx;

    switch (interaction.commandName) {
        case '핑': {
            await interaction.reply({ embeds: [infoEmbed('핑', '퐁! 🏓')] });
            return;
        }

        case '출석체크': {
            const userId = interaction.user.id;
            const today = getKstDateString(); // KST 기준 YYYY-MM-DD

            if (!canAttend(userId, today)) {
                const user = getUser(userId);
                await interaction.reply({
                    ephemeral: true,
                    embeds: [
                        errorEmbed(
                            '이미 출석했어!',
                            `오늘은 이미 출석체크를 했어 😼\n\n현재 보유금: **${user.money.toLocaleString()}원**`,
                        ),
                    ],
                });
                return;
            }

            const user = attend(userId, today, 10000);

            await interaction.reply({
                embeds: [
                    gameEmbed('📅 출석체크 완료!', [
                        { name: '획득', value: `**10,000원**`, inline: true },
                        { name: '현재 보유금', value: `**${user.money.toLocaleString()}원**`, inline: true },
                        { name: '기준 날짜(KST)', value: today },
                    ]),
                ],
            });
            return;
        }

        case '내정보': {
            const userId = interaction.user.id;
            const user = getUser(userId);

            await interaction.reply({
                ephemeral: true,
                embeds: [
                    gameEmbed('👤 내정보', [
                        { name: '보유금', value: `**${user.money.toLocaleString()}원**`, inline: true },
                        { name: '마지막 출석', value: user.lastAttendance ?? '없음', inline: true },
                    ]),
                ],
            });
            return;
        }

        case '섯다': {
            const opponent = interaction.options.getUser('상대'); // 없으면 null

            if (opponent && opponent.id === interaction.user.id) {
                await interaction.reply({
                    ephemeral: true,
                    embeds: [errorEmbed('잘못된 대결', '자기 자신과는 대결할 수 없어 😅')],
                });
                return;
            }

            if (opponent && opponent.bot) {
                await interaction.reply({
                    ephemeral: true,
                    embeds: [errorEmbed('잘못된 상대', '봇이 아닌 사람을 태그해줘!')],
                });
                return;
            }

            const gameId = randomUUID();
            const game = createGame({
                id: gameId,
                channelId: interaction.channelId,
                challengerId: interaction.user.id,
                opponentId: opponent ? opponent.id : null,
            });

            // 솔로면 즉시 시작
            if (!opponent) {
                startGame(game, interaction.user.id, 'AI');
                games.set(gameId, game);
                setGameExpiry(games, gameId);

                await interaction.reply(buildActiveGameMessage(game));
                return;
            }

            // 1:1이면 수락 대기
            games.set(gameId, game);
            setGameExpiry(games, gameId);

            await interaction.reply(buildPendingMessage(game));
            return;
        }

        default: {
            await interaction.reply({
                ephemeral: true,
                embeds: [errorEmbed('알 수 없는 명령어', '등록되지 않은 명령어야!')],
            });
            return;
        }
    }
}
