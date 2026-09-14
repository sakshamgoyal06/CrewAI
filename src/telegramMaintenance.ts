import { Telegraf } from "telegraf";

import { MAINTENANCE_MESSAGE } from "./maintenance.js";

export type TelegramMaintenance = {
  stop: () => Promise<void>;
};

export async function startTelegramMaintenance(token: string): Promise<TelegramMaintenance> {
  const bot = new Telegraf(token);

  const reply = async (ctx: { reply: (text: string) => Promise<unknown> }) => {
    await ctx.reply(MAINTENANCE_MESSAGE);
  };

  bot.command("start", reply);
  bot.command("help", reply);
  bot.on("message", reply);

  await bot.telegram.setMyCommands([
    { command: "start", description: "Magnus status" },
    { command: "help", description: "Magnus status" },
  ]);

  await bot.launch();

  return {
    stop: async () => {
      bot.stop("SIGTERM");
    },
  };
}
