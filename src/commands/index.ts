import { ChatInputCommandInteraction } from 'discord.js';
import { handleForceMessageEventCommand } from './force-message-event.ts';
import { handleLanguageCommand } from './language.ts';
import { handlePersonalityCommand } from './personality.ts';
import { handleRoastMe } from './roastme.ts';
import { handleUpdateContextCommand } from './update-context.ts';

export type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

export const commandHandlers: Record<string, CommandHandler> = {
  roastme: handleRoastMe,
  updatecontext: handleUpdateContextCommand,
  personality: handlePersonalityCommand,
  language: handleLanguageCommand,
  forcemessageevent: handleForceMessageEventCommand
};
