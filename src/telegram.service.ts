import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import 'dotenv/config';

export class TelegramService {
    private axiosInstance: AxiosInstance;
    private botToken: string;
    private chatId: string;
    private useProxy: boolean;

    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
        this.chatId = process.env.TELEGRAM_CHAT_ID || '';
        this.useProxy = process.env.USE_PROXY === 'true';

        if (!this.botToken || !this.chatId) {
            console.warn('⚠️ Telegram bot token or chat ID not configured');
        }

        this.axiosInstance = this.createAxiosInstance();
    }

    private createAxiosInstance(): AxiosInstance {
        const config: any = {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Configure SOCKS5 proxy if enabled
        if (this.useProxy && process.env.SOCKS5_PROXY_URL) {
            try {
                const proxyAgent = new SocksProxyAgent(process.env.SOCKS5_PROXY_URL);
                config.httpAgent = proxyAgent;
                config.httpsAgent = proxyAgent;
                console.log('🔗 Using SOCKS5 proxy for Telegram:', process.env.SOCKS5_PROXY_URL);
            } catch (error) {
                console.error('❌ Failed to configure SOCKS5 proxy:', error);
                console.log('📡 Falling back to direct connection');
            }
        }

        return axios.create(config);
    }

    /**
     * Send a message to Telegram chat
     * @param message - The message text to send
     * @param parseMode - Message parse mode (optional)
     * @returns Promise<boolean> - Success status
     */
    async sendMessage(message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
        if (!this.botToken || !this.chatId) {
            console.warn('⚠️ Telegram not configured, skipping message');
            return false;
        }

        try {
            const [chatId, topicId] = this.chatId.split('_');
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const payload = {
                chat_id: chatId,
                message_thread_id: topicId,
                text: message,
                parse_mode: parseMode,
                disable_web_page_preview: true,
            };

            const response = await this.axiosInstance.post(url, payload);

            if (response.data.ok) {
                console.log('✅ Telegram message sent successfully');
                return true;
            } else {
                console.error('❌ Telegram API error:', response.data);
                return false;
            }
        } catch (error: any) {
            console.error('❌ Failed to send Telegram message:', error.data.description);

            // Log specific error details
            if (error.code === 'ECONNREFUSED') {
                console.error('🔒 Connection refused - check proxy settings');
            } else if (error.code === 'ETIMEDOUT') {
                console.error('⏰ Request timeout - proxy may be slow');
            }

            return false;
        }
    }

    /**
     * Test Telegram connection and proxy
     * @returns Promise<boolean> - Connection status
     */
    async testConnection(): Promise<boolean> {
        if (!this.botToken) {
            console.warn('⚠️ No Telegram bot token configured');
            return false;
        }

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/getMe`;
            const response = await this.axiosInstance.get(url);

            if (response.data.ok) {
                console.log('✅ Telegram connection test successful');
                console.log(`🤖 Bot: ${response.data.result.first_name} (@${response.data.result.username})`);
                return true;
            } else {
                console.error('❌ Telegram connection test failed:', response.data);
                return false;
            }
        } catch (error: any) {
            console.error('❌ Telegram connection test error:', error.message);
            return false;
        }
    }
}

if (require.main === module) {
    const telegramService = new TelegramService();
    telegramService.sendMessage('Hello, world!', 'Markdown').then(result => {
        console.log('Test result:', result);
    });
}