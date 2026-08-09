/**
 * Download a Telegram photo file for vision-based meal logging.
 */
import { logger } from "../logger.js";

export type TelegramPhotoPayload = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  return token;
}

function mediaTypeFromPath(filePath: string): TelegramPhotoPayload["mediaType"] {
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

export async function downloadTelegramPhoto(fileId: string): Promise<TelegramPhotoPayload> {
  const token = botToken();
  const fileRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  if (!fileRes.ok) {
    throw new Error(`Telegram getFile failed: ${fileRes.status}`);
  }

  const fileJson = (await fileRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = fileJson.result?.file_path;
  if (!fileJson.ok || !filePath) {
    throw new Error("Telegram getFile returned no path");
  }

  const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!downloadRes.ok) {
    throw new Error(`Telegram file download failed: ${downloadRes.status}`);
  }

  const buf = Buffer.from(await downloadRes.arrayBuffer());
  if (buf.length > 4 * 1024 * 1024) {
    throw new Error("Photo too large for meal vision (max 4MB)");
  }

  logger.debug({ fileId, bytes: buf.length }, "telegram photo downloaded for meal log");

  return {
    base64: buf.toString("base64"),
    mediaType: mediaTypeFromPath(filePath),
  };
}
