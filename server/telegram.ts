/**
 * Telegram Bot alert dispatcher.
 *
 * Reads TELEGRAM_BOT_TOKEN strictly from environment variables (never hard-coded).
 * If TELEGRAM_BOT_TOKEN is not set, sends are safely skipped and logged cleanly.
 */

export async function sendTelegramAlert(
  chatId: string | null | undefined,
  message: string
): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN not configured' };
  }
  if (!chatId || !chatId.trim()) {
    return { sent: false, reason: 'No telegram_chat_id set for this event' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[telegram] Failed to deliver message:', errText);
      return { sent: false, reason: `Telegram HTTP ${response.status}` };
    }

    return { sent: true };
  } catch (err) {
    console.warn('[telegram] Network error:', (err as Error).message);
    return { sent: false, reason: (err as Error).message };
  }
}
