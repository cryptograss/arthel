import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
// Native fetch available in Node 18+
import { getProjectDirs, initProjectDirs } from './locations.js';
import { blueRailroadContractAddress } from './constants.js';

initProjectDirs("justinholmes.com"); // TODO: Where does this justly belong, for tests?

dotenv.config();

function parseDiscordUrl(url) {
    // Discord URLs format: https://discord.com/channels/SERVER_ID/CHANNEL_ID/MESSAGE_ID
    const parts = url.split('/');
    return {
        serverId: parts[parts.length - 3],
        channelId: parts[parts.length - 2],
        messageId: parts[parts.length - 1]
    };
}

async function downloadVideo(videoUrl, outputPath) {
    const response = await fetch(videoUrl);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

export async function downloadVideos(metadataList, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const metadata of metadataList) {
        const outputPath = path.join(outputDir, metadata.fileName);

        // Skip if already downloaded
        if (fs.existsSync(outputPath)) {
            continue;
        }

        await downloadVideo(metadata.discordUrl, outputPath);
    }
}

export async function generateVideoMetadata(messageUrls) {
    const client = new Client({
        intents: [
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages
        ]
    });

    try {
        await client.login(process.env.DISCORD_BOT_TOKEN);
        const metadata = [];

        for (const url of messageUrls) {
            const { channelId, messageId } = parseDiscordUrl(url);
            const videoFileName = `${messageId}.mp4`;

            let message;
            let videoAttachment;

            try {
                const channel = await client.channels.fetch(channelId);
                message = await channel.messages.fetch(messageId);
                videoAttachment = message.attachments.find(
                    attachment => attachment.contentType?.startsWith('video/')
                );

                if (videoAttachment) {
                    metadata.push({
                        originalUrl: url,
                        discordUrl: videoAttachment.url,
                        fileName: videoFileName,
                        timestamp: message.createdTimestamp,
                        contentType: videoAttachment.contentType
                    });
                }
            } catch (error) {
                console.warn(`Failed to fetch message from ${url}:`, error);
            }
        }

        await client.destroy();
        return metadata;
    } catch (error) {
        console.error('Error fetching Discord video metadata:', error);
        throw error;
    }
}

export function generateVideoFilename(token, videoUrl) {
    const chainId = '10'; // Optimism TODO: Generalize this somewhere
    const contractAddress = blueRailroadContractAddress.slice(2, 10);
    const tokenId = token.id;
    const extension = videoUrl.split('.').pop() || 'mp4'; //TODO: Fix for no file extension, and also IPFS

    return `${chainId}-${contractAddress}-${tokenId}.${extension}`;
}

async function fetchBlueRailroadVideos() {
    const chainData = deserializeChainData();
    const { blueRailroads } = chainData;

    // Get all Discord URLs from the tokens
    const discordUrls = Object.values(blueRailroads)
        .map(token => ({
            token,
            url: token.uri
        }))
        .filter(({ url }) => url && url.includes('discord.com'));

    // Fetch videos
    const videos = [];
    for (const { token, url } of discordUrls) {
        const videoFileName = generateVideoFilename(token, url);
        const videoPath = path.join(fetchedVideosDir, videoFileName);

        // Check if we already have this video
        if (fs.existsSync(videoPath)) {
            videos.push({
                originalUrl: url,
                localPath: videoPath,
                fileName: videoFileName,
                token
            });
            continue;
        }

        try {
            const fetchedVideos = await fetchDiscordVideos([url]);
            if (fetchedVideos.length > 0) {
                videos.push({
                    ...fetchedVideos[0],
                    fileName: videoFileName,
                    token
                });
            }
        } catch (error) {
            console.warn(`Failed to fetch video for token ${token.id}:`, error);
        }
    }

    return videos;
}