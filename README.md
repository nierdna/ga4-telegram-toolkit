# GA4 Telegram Toolkit

Thư viện hỗ trợ tương tác với Google Analytics 4 và Telegram API.

[![npm version](https://img.shields.io/npm/v/ga4-telegram-toolkit.svg)](https://www.npmjs.com/package/ga4-telegram-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Cài đặt

```bash
npm install ga4-telegram-toolkit
```

## Sử dụng

### Import thư viện

```typescript
// Import đầy đủ
import { GA4Service, TelegramService, GAInsightsService } from 'ga4-telegram-toolkit';

// Hoặc import từng module riêng biệt
import { GA4Service } from 'ga4-telegram-toolkit';
import { TelegramService } from 'ga4-telegram-toolkit';
```

### Kết nối Google Analytics 4

```typescript
// Khởi tạo GA4Service với Property ID
const ga4PropertyId = process.env.GA4_PROPERTY_ID || '489280622';
const ga4Service = new GA4Service(ga4PropertyId, 'MyWebsite');

// Lấy báo cáo người dùng theo quốc gia
const usersByCountry = await ga4Service.getUsersByCountry();

// Lấy phiên theo thiết bị
const deviceSessions = await ga4Service.getSessionsByDeviceCategory('yesterday', 'yesterday');

// Lấy trang phổ biến nhất (7 ngày qua)
const topPages = await ga4Service.getPopularPagesWithEngagement('7daysAgo', 'yesterday', 5);

// So sánh lưu lượng hôm nay và hôm qua
const trafficComparison = await ga4Service.compareTodayVsYesterday('sessions');
```

### Gửi tin nhắn qua Telegram

```typescript
// Khởi tạo TelegramService (cần cấu hình biến môi trường)
// TELEGRAM_BOT_TOKEN=your_bot_token
// TELEGRAM_CHAT_ID=your_chat_id
const telegramService = new TelegramService();

// Gửi tin nhắn đơn giản
await telegramService.sendMessage('Hello from GA4 Telegram Toolkit!');

// Gửi tin nhắn với định dạng HTML
await telegramService.sendMessage('<b>Báo cáo GA4</b>\n<i>Thông tin quan trọng</i>', 'HTML');

// Kiểm tra kết nối
const isConnected = await telegramService.testConnection();
```

### Tạo báo cáo GA4 và gửi qua Telegram

```typescript
// Khởi tạo service tích hợp
const gaInsightsService = new GAInsightsService();

// Gửi báo cáo GA4 hàng ngày
await gaInsightsService.sendDailyGAInsights();

// Kiểm tra kết nối
await gaInsightsService.testConnection();
```

### Sử dụng Proxy SOCKS5 (tùy chọn)

```typescript
// Cấu hình biến môi trường để sử dụng proxy
// USE_PROXY=true
// SOCKS5_PROXY_URL=socks5://user:pass@host:port
```

## Cấu hình môi trường

Tạo file `.env` với nội dung:

```
GA4_PROPERTY_ID=your_property_id
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
USE_PROXY=false
SOCKS5_PROXY_URL=
```

## Links

- [NPM Package](https://www.npmjs.com/package/ga4-telegram-toolkit)
- [GitHub Repository](https://github.com/nierdna/ga4-telegram-toolkit)

## License

MIT 