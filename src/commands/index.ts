import { ChatInputCommandInteraction } from 'discord.js';
import { handleContextCommand } from './context.ts';
import { handlePing } from './ping.ts';
import { handleRoastMe } from './roastme.ts';

export type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

export const commandHandlers: Record<string, CommandHandler> = {
  ping: handlePing,
  roastme: handleRoastMe,
  contexto: handleContextCommand
};
