/**
 * Minimal Telegram Bot API client (https://core.telegram.org/bots/api) — only the methods we use.
 * Injected by token so tests replace the network layer.
 */
export const BOT_API = Symbol('BOT_API');

export interface BotApi {
  getMe(token: string): Promise<{ id: number; username: string; first_name: string }>;
  setWebhook(token: string, url: string, secretToken: string): Promise<void>;
  deleteWebhook(token: string): Promise<void>;
  setChatMenuButton(token: string, text: string, webAppUrl: string): Promise<void>;
  sendMessage(token: string, chatId: number, text: string, button?: { text: string; webAppUrl: string }): Promise<void>;
}

export class BotApiError extends Error {}

export class HttpBotApi implements BotApi {
  private async call<T>(token: string, method: string, body: object = {}): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
    // Never include the token (it is in the URL) in errors or logs.
    if (!json?.ok) throw new BotApiError(`Telegram ${method} failed: ${json?.description ?? res.status}`);
    return json.result as T;
  }

  getMe(token: string) {
    return this.call<{ id: number; username: string; first_name: string }>(token, 'getMe');
  }

  async setWebhook(token: string, url: string, secretToken: string) {
    await this.call(token, 'setWebhook', { url, secret_token: secretToken, allowed_updates: ['message'], drop_pending_updates: true });
  }

  async deleteWebhook(token: string) {
    await this.call(token, 'deleteWebhook', { drop_pending_updates: true });
  }

  async setChatMenuButton(token: string, text: string, webAppUrl: string) {
    await this.call(token, 'setChatMenuButton', { menu_button: { type: 'web_app', text, web_app: { url: webAppUrl } } });
  }

  async sendMessage(token: string, chatId: number, text: string, button?: { text: string; webAppUrl: string }) {
    await this.call(token, 'sendMessage', {
      chat_id: chatId,
      text,
      ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.webAppUrl } }]] } } : {}),
    });
  }
}
