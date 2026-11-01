/**
 * The only two commands Magnus registers with Telegram.
 *
 * Everything else is a plain message: there are no department commands and no lane picker, because
 * the user talks to Magnus and Magnus decides internally who answers.
 *
 * Kept free of imports so the setup CLI can read it without booting Supabase, Redis or Anthropic.
 */
export type TelegramBotCommand = { command: string; description: string };

export const BOT_COMMANDS: readonly TelegramBotCommand[] = [
  { command: "start", description: "What Magnus can do" },
  { command: "help", description: "How to talk to Magnus" },
];
