import { logger } from "./utils/logger";
import { GA4Service } from "./ga.service";
import { TelegramService } from "./telegram.service";
import * as dotenv from 'dotenv';

dotenv.config();

interface InsightReport {
    title: string;
    data: any;
}

export class GAInsightsService {
    private ga4Service: GA4Service;
    private telegramService: TelegramService;

    constructor() {
        const ga4PropertyId = process.env.GA4_PROPERTY_ID || '489280622';
        this.ga4Service = new GA4Service(ga4PropertyId, 'Apeoff.fun');
        this.telegramService = new TelegramService();
    }

    /**
     * Gửi báo cáo từ Google Analytics qua Telegram
     */
    async sendDailyGAInsights(): Promise<boolean> {
        try {
            logger.info('Đang thu thập thông tin Google Analytics...');

            // Thu thập dữ liệu từ nhiều báo cáo GA
            const [
                usersByCountry,
                deviceSessions,
                topPages,
                channelConversions,
                trafficComparison
            ] = await Promise.all([
                this.ga4Service.getUsersByCountry(),
                this.ga4Service.getSessionsByDeviceCategory('yesterday', 'yesterday'),
                this.ga4Service.getPopularPagesWithEngagement('7daysAgo', 'yesterday', 5),
                this.ga4Service.getConversionsBySourceMedium('7daysAgo', 'yesterday', 5),
                this.ga4Service.compareTodayVsYesterday('sessions')
            ]);

            // Định dạng thông tin
            const formattedMessage = this.formatGAInsightsReport([
                { title: '📊 Người dùng theo quốc gia (hôm qua)', data: usersByCountry },
                { title: '📱 Phiên theo thiết bị (hôm qua)', data: deviceSessions },
                { title: '📄 Trang phổ biến (7 ngày qua)', data: topPages },
                { title: '🔄 Chuyển đổi theo nguồn (7 ngày qua)', data: channelConversions },
                { title: '📈 So sánh lưu lượng (hôm nay vs hôm qua)', data: trafficComparison }
            ]);

            // Gửi tin nhắn
            logger.info('Đang gửi báo cáo Google Analytics qua Telegram...');
            return await this.telegramService.sendMessage(formattedMessage);
        } catch (error) {
            logger.error('Lỗi khi thu thập và gửi thông tin GA:', error);
            await this.telegramService.sendMessage('❌ Không thể thu thập dữ liệu Google Analytics: ' + (error as Error).message);
            return false;
        }
    }

    /**
     * Định dạng báo cáo GA để hiển thị trên Telegram
     */
    private formatGAInsightsReport(reports: InsightReport[]): string {
        const currentDate = new Date().toLocaleDateString('vi-VN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let message = `<b>📊 BÁO CÁO GOOGLE ANALYTICS</b>\n`;
        message += `<i>${currentDate}</i>\n`;
        message += `<i>Service: ${this.ga4Service.getName()}</i>\n\n`;

        for (const report of reports) {
            message += `<b>${report.title}</b>\n`;

            if (!report.data || !report.data.data || report.data.data.length === 0) {
                message += '- Không có dữ liệu\n\n';
                continue;
            }

            // Format dữ liệu từng báo cáo
            if (report.title.includes('Người dùng theo quốc gia')) {
                message += this.formatCountryReport(report.data);
            } else if (report.title.includes('Phiên theo thiết bị')) {
                message += this.formatDeviceReport(report.data);
            } else if (report.title.includes('Trang phổ biến')) {
                message += this.formatPagesReport(report.data);
            } else if (report.title.includes('Chuyển đổi theo nguồn')) {
                message += this.formatConversionsReport(report.data);
            } else if (report.title.includes('So sánh lưu lượng')) {
                message += this.formatComparisonReport(report.data);
            }

            message += '\n';
        }

        return message;
    }

    /**
     * Định dạng báo cáo người dùng theo quốc gia
     */
    private formatCountryReport(data: any): string {
        let result = '';
        let total = 0;

        for (const item of data.data.slice(0, 5)) {
            total += parseInt(item.totalUsers);
            result += `- ${item.country}: ${item.totalUsers} người dùng (${item.sessions} phiên)\n`;
        }

        if (data.data.length > 5) {
            result += `- <i>... và ${data.data.length - 5} quốc gia khác</i>\n`;
        }

        result += `<b>Tổng: ${total} người dùng</b>\n`;
        return result;
    }

    /**
     * Định dạng báo cáo phiên theo thiết bị
     */
    private formatDeviceReport(data: any): string {
        let result = '';
        let total = 0;

        for (const item of data.data) {
            const sessions = parseInt(item.totalUsers);
            total += sessions;
            result += `- ${item.country}: ${sessions} phiên\n`;
        }

        result += `<b>Tổng: ${total} phiên</b>\n`;
        return result;
    }

    /**
     * Định dạng báo cáo trang phổ biến
     */
    private formatPagesReport(data: any): string {
        let result = '';

        for (const item of data.data.slice(0, 5)) {
            const pagePath = item.country.length > 30
                ? item.country.substring(0, 27) + '...'
                : item.country;
            const views = parseInt(item.totalUsers);
            const duration = (parseInt(item.newUsers) / 1000).toFixed(1);

            result += `- ${pagePath}: ${views} lượt xem (${duration}s)\n`;
        }

        if (data.data.length > 5) {
            result += `- <i>... và ${data.data.length - 5} trang khác</i>\n`;
        }

        return result;
    }

    /**
     * Định dạng báo cáo chuyển đổi theo nguồn
     */
    private formatConversionsReport(data: any): string {
        let result = '';

        for (const item of data.data.slice(0, 5)) {
            const source = item.country.length > 25
                ? item.country.substring(0, 22) + '...'
                : item.country;
            result += `- ${source}: ${item.totalUsers} chuyển đổi\n`;
        }

        if (data.data.length > 5) {
            result += `- <i>... và ${data.data.length - 5} nguồn khác</i>\n`;
        }

        return result;
    }

    /**
     * Định dạng báo cáo so sánh lưu lượng
     */
    private formatComparisonReport(data: any): string {
        if (data.data.length < 2) return '- Không đủ dữ liệu để so sánh\n';

        const today = parseInt(data.data[0].totalUsers);
        const yesterday = parseInt(data.data[1].totalUsers);

        let change = 0;
        let changeText = '';

        if (yesterday > 0) {
            change = ((today - yesterday) / yesterday) * 100;
            const changeSymbol = change >= 0 ? '▲' : '▼';
            changeText = ` (${changeSymbol} ${Math.abs(change).toFixed(1)}%)`;
        }

        return `- Hôm nay: ${today} phiên\n- Hôm qua: ${yesterday} phiên${changeText}\n`;
    }

    /**
     * Kiểm tra kết nối GA và Telegram
     */
    async testConnection(): Promise<boolean> {
        try {
            // Kiểm tra kết nối Telegram
            const telegramOk = await this.telegramService.testConnection();
            if (!telegramOk) {
                logger.error('Không thể kết nối với Telegram');
                return false;
            }

            // Kiểm tra kết nối GA bằng cách lấy dữ liệu đơn giản
            const gaData = await this.ga4Service.compareTodayVsYesterday('sessions');
            if (!gaData) {
                logger.error('Không thể kết nối với Google Analytics');
                return false;
            }

            // Gửi tin nhắn kiểm tra
            await this.telegramService.sendMessage('✅ Kết nối GA Insights đã hoạt động!');
            return true;
        } catch (error) {
            logger.error('Lỗi khi kiểm tra kết nối:', error);
            return false;
        }
    }
}

// Kiểm tra service nếu file được chạy trực tiếp
if (require.main === module) {
    const gaInsights = new GAInsightsService();
    gaInsights.sendDailyGAInsights().then(result => {
        console.log('Kết quả gửi báo cáo:', result ? 'thành công' : 'thất bại');
        process.exit(0);
    }).catch(err => {
        console.error('Lỗi khi chạy service:', err);
        process.exit(1);
    });
} 