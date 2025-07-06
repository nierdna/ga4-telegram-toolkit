import { logger } from "./utils/logger";
import axios from 'axios';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Interfaces để định nghĩa cấu trúc dữ liệu GA4
interface GA4DateRange {
    startDate: string;
    endDate: string;
}

interface GA4Dimension {
    name: string;
}

interface GA4Metric {
    name: string;
}

interface GA4RequestPayload {
    dateRanges: GA4DateRange[];
    dimensions: GA4Dimension[];
    metrics: GA4Metric[];
    limit?: number;
}

interface GA4DimensionValue {
    value: string;
}

interface GA4MetricValue {
    value: string;
}

interface GA4Row {
    dimensionValues: GA4DimensionValue[];
    metricValues: GA4MetricValue[];
}

interface GA4Response {
    rows?: GA4Row[];
    dimensionHeaders: { name: string }[];
    metricHeaders: { name: string }[];
}

interface CountryUserReport {
    country: string;
    totalUsers: string;
    newUsers: string;
    sessions: string;
}

interface ReportResult {
    headers: string[];
    data: CountryUserReport[];
    message?: string;
}

// Interface cho Google Service Account Key đầy đủ (bao gồm cả field cố định)
export interface GoogleServiceAccountKey {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
    universe_domain: string;
}

// Bổ sung interface mới cho orderBy và filter
interface GA4OrderBy {
    metric?: { metricName: string };
    dimension?: { dimensionName: string };
    desc?: boolean;
}

interface GA4DimensionFilter {
    fieldName: string;
    stringFilter?: { matchType: string; value: string; caseSensitive?: boolean };
    inListFilter?: { values: string[] };
    not?: boolean;
}

interface GA4Filter {
    filter: GA4DimensionFilter;
}

interface GA4RequestPayloadExtended extends GA4RequestPayload {
    orderBys?: GA4OrderBy[];
    dimensionFilter?: GA4Filter;
}

// Interface cho Google Service Account Key chỉ gồm các field động
export interface GoogleServiceAccountKeyInput {
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    client_x509_cert_url: string;
}

export class GA4Service {
    private propertyId: string;
    private serviceAccountKey: GoogleServiceAccountKey | null = null;
    private keyFilePath: string | undefined;
    private debug: boolean;
    private name: string;
    private serviceAccountObj?: GoogleServiceAccountKeyInput;

    constructor(propertyId: string, name: string = 'GA4Service', keyFilePath?: string, debug: boolean = false, serviceAccountObj?: GoogleServiceAccountKeyInput) {
        if (!propertyId) {
            throw new Error('Google Analytics 4 Property ID is required');
        }
        this.propertyId = propertyId;
        this.name = name;
        this.keyFilePath = keyFilePath || path.join(__dirname, 'lynx-460617-4dcaad897518.json');
        this.debug = debug;
        this.serviceAccountObj = serviceAccountObj;
    }

    getName() {
        return this.name;
    }

    /**
     * Lấy Service Account Key từ file JSON hoặc object truyền vào
     */
    private loadServiceAccountKey(): GoogleServiceAccountKey {
        try {
            if (!this.serviceAccountKey) {
                if (this.serviceAccountObj) {
                    // Merge các field cố định
                    this.serviceAccountKey = {
                        type: "service_account",
                        auth_uri: "https://accounts.google.com/o/oauth2/auth",
                        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                        token_uri: "https://oauth2.googleapis.com/token",
                        universe_domain: "googleapis.com",
                        ...this.serviceAccountObj
                    };
                    logger.info('Successfully loaded Google service account key from object');
                } else {
                    const keyFileContent = fs.readFileSync(this.keyFilePath as string, 'utf-8');
                    const rawKey = JSON.parse(keyFileContent);
                    // Merge các field cố định (đề phòng thiếu field trong file)
                    this.serviceAccountKey = {
                        type: "service_account",
                        auth_uri: "https://accounts.google.com/o/oauth2/auth",
                        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                        token_uri: "https://oauth2.googleapis.com/token",
                        universe_domain: "googleapis.com",
                        ...rawKey
                    };
                    logger.info('Successfully loaded Google service account key from file');
                }
            }
            return this.serviceAccountKey as GoogleServiceAccountKey;
        } catch (error) {
            logger.error('Error loading Google service account key:', error);
            throw new Error('Failed to load Google service account key file or object');
        }
    }

    /**
     * Tạo JWT token từ service account key
     */
    private async getAccessToken(): Promise<string> {
        try {
            const key = this.loadServiceAccountKey();
            
            // Tạo JWT header
            const header = {
                alg: 'RS256',
                typ: 'JWT',
                kid: key.private_key_id
            };
            
            // Thời gian hiện tại tính bằng giây
            const iat = Math.floor(Date.now() / 1000);
            const exp = iat + 3600; // Hết hạn sau 1 giờ
            
            // JWT Claims (payload)
            const payload = {
                iss: key.client_email,
                sub: key.client_email,
                aud: 'https://oauth2.googleapis.com/token',
                iat: iat,
                exp: exp,
                scope: 'https://www.googleapis.com/auth/analytics.readonly'
            };
            
            // Encode header và payload
            const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            
            const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            
            // Chuẩn bị chuỗi để ký
            const signatureInput = `${encodedHeader}.${encodedPayload}`;
            
            // Ký bằng private key
            const signer = crypto.createSign('RSA-SHA256');
            signer.update(signatureInput);
            const signature = signer.sign(key.private_key, 'base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            
            // Tạo JWT token hoàn chỉnh
            const jwt = `${signatureInput}.${signature}`;
            
            // Gọi API để lấy access token
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            return response.data.access_token;
        } catch (error) {
            logger.error('Error generating access token:', error);
            throw new Error('Failed to generate Google Analytics access token');
        }
    }

    /**
     * Lấy dữ liệu báo cáo từ Google Analytics 4
     * @param dateRanges Khoảng thời gian cho báo cáo
     * @param dimensions Các chiều dữ liệu (country, device, source, etc.)
     * @param metrics Các số liệu cần đo lường (users, sessions, etc.)
     * @param limit Giới hạn số lượng kết quả
     * @returns Dữ liệu báo cáo từ GA4
     */
    async getReport(
        dateRanges: GA4DateRange[],
        dimensions: GA4Dimension[],
        metrics: GA4Metric[],
        limit: number = 10
    ): Promise<GA4Response> {
        const payload: GA4RequestPayload = {
            dateRanges,
            dimensions,
            metrics,
            limit
        };
        
        try {
            logger.info(`Fetching GA4 report data for property ${this.propertyId}`);

            const url = `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`;

            logger.info(`GA4 payload: ${JSON.stringify(payload)}`);

            // Lấy token xác thực từ service account
            logger.info('Getting access token from service account');
            const token = await this.getAccessToken();
            
            if (this.debug) {
                // Chỉ hiển thị một phần của token để gỡ lỗi nhưng không lộ toàn bộ token
                logger.info(`Access token prefix: ${token.substring(0, 20)}...`);
            }
            
            logger.info('Successfully obtained access token');

            logger.info(`Making API request to GA4 endpoint: ${url}`);
            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info(`Successfully retrieved GA4 report data with status code: ${response.status}`);
            return response.data as GA4Response;
        } catch (error) {
            logger.error('Error fetching GA4 report:', error);
            if (axios.isAxiosError(error) && error.response) {
                logger.error('GA4 API error details:', error.response.data);
                logger.error(`GA4 API error status: ${error.response.status}`);
                logger.error(`GA4 API error statusText: ${error.response.statusText}`);
                
                // Kiểm tra chi tiết hơn về lỗi
                if (error.response.status === 403) {
                    logger.error(`Permission denied for property ID: ${this.propertyId}. Please check if the service account has proper access.`);
                } else if (error.response.status === 400) {
                    logger.error(`Bad request. Please check the payload format: ${JSON.stringify(payload)}`);
                } else if (error.response.status === 401) {
                    logger.error('Unauthorized. Authentication failed. Please check your credentials.');
                }
            }
            throw new Error('Failed to fetch GA4 report');
        }
    }

    /**
     * Lấy báo cáo người dùng theo quốc gia trong ngày hôm qua
     * @returns Dữ liệu báo cáo người dùng theo quốc gia
     */
    async getUsersByCountry(): Promise<ReportResult> {
        const dateRanges = [{ startDate: 'yesterday', endDate: 'yesterday' }];
        const dimensions = [{ name: 'country' }];
        const metrics = [
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'sessions' }
        ];

        const report = await this.getReport(dateRanges, dimensions, metrics, 10);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Country', 'Total Users', 'New Users', 'Sessions'],
                data: [],
                message: 'No data available'
            };
        }

        // Chuyển đổi dữ liệu thành định dạng dễ đọc
        return {
            headers: ['Country', 'Total Users', 'New Users', 'Sessions'],
            data: report.rows.map(row => {
                // Đảm bảo các giá trị không undefined
                const country = row.dimensionValues[0]?.value || 'Unknown';
                const totalUsers = row.metricValues[0]?.value || '0';
                const newUsers = row.metricValues[1]?.value || '0';
                const sessions = row.metricValues[2]?.value || '0';

                return { country, totalUsers, newUsers, sessions };
            })
        };
    }

    /**
     * Lấy dữ liệu báo cáo từ Google Analytics 4 với bộ lọc và sắp xếp
     * @param dateRanges Khoảng thời gian cho báo cáo
     * @param dimensions Các chiều dữ liệu (country, device, source, etc.)
     * @param metrics Các số liệu cần đo lường (users, sessions, etc.)
     * @param dimensionFilter Bộ lọc dựa trên dimension
     * @param orderBys Sắp xếp kết quả
     * @param limit Giới hạn số lượng kết quả
     * @returns Dữ liệu báo cáo từ GA4
     */
    async getDetailedReport(
        dateRanges: GA4DateRange[],
        dimensions: GA4Dimension[],
        metrics: GA4Metric[],
        dimensionFilter?: GA4Filter,
        orderBys?: GA4OrderBy[],
        limit: number = 50
    ): Promise<GA4Response> {
        const payload: GA4RequestPayloadExtended = {
            dateRanges,
            dimensions,
            metrics,
            limit
        };

        if (dimensionFilter) payload.dimensionFilter = dimensionFilter;
        if (orderBys) payload.orderBys = orderBys;

        try {
            logger.info(`Fetching GA4 detailed report data for property ${this.propertyId}`);

            const url = `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`;

            const token = await this.getAccessToken();

            logger.info('Making API request to GA4 endpoint with detailed payload');
            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info(`Successfully retrieved GA4 report data with status code: ${response.status}`);
            return response.data as GA4Response;
        } catch (error) {
            logger.error('Error fetching GA4 detailed report:', error);
            if (axios.isAxiosError(error) && error.response) {
                logger.error('GA4 API error details:', error.response.data);
            }
            throw new Error('Failed to fetch GA4 detailed report');
        }
    }

    // ==== NHÓM 1: CHUYỂN ĐỔI (CONVERSIONS) ====

    /**
     * Lấy danh sách top sự kiện chuyển đổi
     */
    async getTopConversionEvents(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'eventName' }];
        const metrics = [{ name: 'conversions' }];
        const orderBys = [{ metric: { metricName: 'conversions' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Event Name', 'Conversions'],
                data: [],
                message: 'No conversion events data available'
            };
        }

        return {
            headers: ['Event Name', 'Conversions'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    /**
     * Lấy dữ liệu chuyển đổi theo nguồn lưu lượng
     */
    async getConversionsBySourceMedium(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'sourceMedium' }];
        const metrics = [{ name: 'conversions' }];
        const orderBys = [{ metric: { metricName: 'conversions' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Source/Medium', 'Conversions'],
                data: [],
                message: 'No source/medium conversion data available'
            };
        }

        return {
            headers: ['Source/Medium', 'Conversions'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    /**
     * Lấy dữ liệu chuyển đổi theo loại thiết bị
     */
    async getConversionsByDevice(startDate: string = 'yesterday', endDate: string = 'yesterday'): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'deviceCategory' }];
        const metrics = [{ name: 'conversions' }];
        const orderBys = [{ metric: { metricName: 'conversions' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Device Category', 'Conversions'],
                data: [],
                message: 'No device conversion data available'
            };
        }

        return {
            headers: ['Device Category', 'Conversions'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    // ==== NHÓM 2: HÀNH VI NGƯỜI DÙNG (USER BEHAVIOR) ====

    /**
     * Lấy danh sách trang phổ biến và thời gian tương tác
     */
    async getPopularPagesWithEngagement(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'pagePath' }];
        const metrics = [
            { name: 'screenPageViews' },
            { name: 'userEngagementDuration' }
        ];
        const orderBys = [{ metric: { metricName: 'screenPageViews' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Page Path', 'Page Views', 'Engagement Duration (s)'],
                data: [],
                message: 'No page engagement data available'
            };
        }

        return {
            headers: ['Page Path', 'Page Views', 'Engagement Duration (s)'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: row.metricValues[1]?.value || '0',
                sessions: '0'
            }))
        };
    }

    /**
     * Lấy hành trình di chuyển của người dùng giữa các trang
     */
    async getUserJourneyPaths(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [
            { name: 'pageReferrer' },
            { name: 'pagePath' }
        ];
        const metrics = [{ name: 'screenPageViews' }];
        const orderBys = [{ metric: { metricName: 'screenPageViews' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['From Page', 'To Page', 'Page Views'],
                data: [],
                message: 'No user journey data available'
            };
        }

        return {
            headers: ['From Page', 'To Page', 'Page Views'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.dimensionValues[1]?.value || 'Unknown',
                newUsers: row.metricValues[0]?.value || '0',
                sessions: '0'
            }))
        };
    }

    /**
     * Lấy các sự kiện tương tác hàng đầu (loại trừ page_view)
     */
    async getTopInteractionEvents(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'eventName' }];
        const metrics = [{ name: 'eventCount' }];

        const dimensionFilter: GA4Filter = {
            filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'EXACT', value: 'page_view', caseSensitive: false },
                not: true
            }
        };

        const orderBys = [{ metric: { metricName: 'eventCount' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, dimensionFilter, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Event Name', 'Event Count'],
                data: [],
                message: 'No interaction events data available'
            };
        }

        return {
            headers: ['Event Name', 'Event Count'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    // ==== NHÓM 3: THIẾT BỊ & KÊNH TRUY CẬP (DEVICE AND TRAFFIC CHANNELS) ====

    /**
     * Lấy phiên truy cập theo loại thiết bị
     */
    async getSessionsByDeviceCategory(startDate: string = 'yesterday', endDate: string = 'yesterday'): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'deviceCategory' }];
        const metrics = [{ name: 'sessions' }];
        const orderBys = [{ metric: { metricName: 'sessions' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Device Category', 'Sessions'],
                data: [],
                message: 'No device session data available'
            };
        }

        return {
            headers: ['Device Category', 'Sessions'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    /**
     * Lấy phiên theo nhóm kênh mặc định
     */
    async getSessionsByDefaultChannelGroup(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'sessionDefaultChannelGroup' }];
        const metrics = [{ name: 'sessions' }];
        const orderBys = [{ metric: { metricName: 'sessions' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Default Channel Group', 'Sessions'],
                data: [],
                message: 'No channel group data available'
            };
        }

        return {
            headers: ['Default Channel Group', 'Sessions'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    /**
     * So sánh lưu lượng organic vs paid
     */
    async compareOrganicVsPaid(startDate: string = 'yesterday', endDate: string = 'yesterday'): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'sessionMedium' }];
        const metrics = [{ name: 'sessions' }];

        const dimensionFilter: GA4Filter = {
            filter: {
                fieldName: 'sessionMedium',
                inListFilter: { values: ['organic', 'cpc'] }
            }
        };

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, dimensionFilter);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Medium', 'Sessions'],
                data: [],
                message: 'No organic vs paid data available'
            };
        }

        return {
            headers: ['Medium', 'Sessions'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    // ==== NHÓM 4: ĐỊA LÝ & NHÂN KHẨU HỌC (GEOGRAPHY AND DEMOGRAPHICS) ====

    /**
     * Lấy người dùng theo thành phố
     */
    async getUsersByCity(startDate: string = 'yesterday', endDate: string = 'yesterday', limit: number = 10): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'city' }];
        const metrics = [{ name: 'activeUsers' }];
        const orderBys = [{ metric: { metricName: 'activeUsers' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys, limit);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['City', 'Active Users'],
                data: [],
                message: 'No city data available'
            };
        }

        return {
            headers: ['City', 'Active Users'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    /**
     * Lấy người dùng theo nhóm tuổi (nếu có Google Signals)
     */
    async getUsersByAgeBracket(startDate: string = 'yesterday', endDate: string = 'yesterday'): Promise<ReportResult> {
        const dateRanges = [{ startDate, endDate }];
        const dimensions = [{ name: 'userAgeBracket' }];
        const metrics = [{ name: 'activeUsers' }];
        const orderBys = [{ metric: { metricName: 'activeUsers' }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: ['Age Bracket', 'Active Users'],
                data: [],
                message: 'No age bracket data available'
            };
        }

        return {
            headers: ['Age Bracket', 'Active Users'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0',
                newUsers: '0',
                sessions: '0'
            }))
        };
    }

    // ==== NHÓM 5: SO SÁNH THEO THỜI GIAN (TIME-BASED COMPARISON) ====

    /**
     * So sánh hôm nay và hôm qua
     */
    async compareTodayVsYesterday(metric: string = 'sessions'): Promise<ReportResult> {
        const dateRanges = [
            { startDate: 'today', endDate: 'today' },
            { startDate: 'yesterday', endDate: 'yesterday' }
        ];
        const metrics = [{ name: metric }];

        const report = await this.getDetailedReport(dateRanges, [], metrics);

        const today = report.rows && report.rows[0]?.metricValues[0]?.value || '0';
        const yesterday = report.rows && report.rows[0]?.metricValues[1]?.value || '0';

        return {
            headers: ['Period', metric],
            data: [
                { country: 'Today', totalUsers: today, newUsers: '0', sessions: '0' },
                { country: 'Yesterday', totalUsers: yesterday, newUsers: '0', sessions: '0' }
            ]
        };
    }

    /**
     * So sánh tuần này và tuần trước theo kênh truy cập
     */
    async compareThisWeekVsLastWeek(dimension: string = 'sessionDefaultChannelGroup', metric: string = 'sessions'): Promise<ReportResult> {
        const dateRanges = [
            { startDate: '14daysAgo', endDate: '8daysAgo' },
            { startDate: '7daysAgo', endDate: 'yesterday' }
        ];
        const dimensions = [{ name: dimension }];
        const metrics = [{ name: metric }];
        const orderBys = [{ metric: { metricName: metric }, desc: true }];

        const report = await this.getDetailedReport(dateRanges, dimensions, metrics, undefined, orderBys);

        if (!report.rows || report.rows.length === 0) {
            return {
                headers: [dimension, 'Last Week', 'This Week'],
                data: [],
                message: 'No comparison data available'
            };
        }

        return {
            headers: [dimension, 'Last Week', 'This Week'],
            data: report.rows.map(row => ({
                country: row.dimensionValues[0]?.value || 'Unknown',
                totalUsers: row.metricValues[0]?.value || '0', // Last week
                newUsers: row.metricValues[1]?.value || '0',  // This week
                sessions: '0'
            }))
        };
    }
}

// Test service nếu file này được chạy trực tiếp
if (require.main === module) {
    const ga4PropertyId = process.env.GA4_PROPERTY_ID || '489280622';

    async function testGA4Service() {
        try {
            // Sử dụng service key để xác thực, với chế độ debug = true
            const ga4Service = new GA4Service(ga4PropertyId, 'GATestService', undefined, true, {
                project_id: 'lynx-460617',
                private_key_id: '4dcaad897518966b5f51614cd5f96c8e41b4c6d1',
                private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDBk8EdUGEiAmxT\nrg94cerNGDRAmMaND8DZhhqFRvg5UNEJ/hk9hrjIX6NOOJePHZOVbYls8mmpCvLb\np1vFwdBuPFozhmXQQZ9+kYYUmku7p91oK7QZB0WY3ny+OuM9S9+BdQ3z9tIpXUFp\nhub1/R4DDAPpg8pX0GdBFDPQH9PSTa5tHhEa0mZLjKb7ut81Vzz7E/YumCp0p5QD\n/mwG8tx+/XASjwbX9i/NV/6XIgA5W3QTrEr0xnEQ8/npah0+yNcvkq1qgDXgswjj\nLxzhyHaWCzqGqI1KWA/desDAm9PmynonC7dLejKLcLbbby+L3fodnEyde8PnxwUP\ncWCnumynAgMBAAECggEADEPo6gsURHvj0j+GomqRZpJgiTFE714uqXm6R3SSOMt6\nm0f64G+fWK7aoZOrYrmMhtzMZtdLQ5c6gRlvEq4vnzR6wKYE4Hev++yLktWd89N0\nj2upeyZ/TerW+5Sunk0m6cR5cFpUwaMziFSwYKi7lJTX0J11ni/JwxFdIRRLLxl5\nqD3yNpavZQE13jVgCPLPrIMk72HOhnTfK9ldX1h7V9FtqovswIl/MlUMCd5tixRb\nUahAGo4I5FdBmz3S+Oza92YYPZ4SbrZCiy/Yx5pFAOVr8bDs+y327nwMlDrjJBk3\ncYgE0GEkJ30FFUkt1TMaSgSxcDtBXbV9WDNwk22NkQKBgQDv7h6MZx5rtaTmFvvI\nHIBlgB8vEqyMNwP/dA85lAExM4qj8VWyKw5yLTElL7iVVDPsquVXu5Zy56V+7seT\npmApaUQYtYZCfhVpsIeYl59rek7a+qi6WFznT+Tn88pWw+zIefwlTZEYttHM5DmR\nO5sr0YJ/gMCHhkvXRJOUoVpX1wKBgQDOitv66bbgno+CijrWOMCcB7ajYal5S+Lq\n26svE30T/POlYnGRT2X0Mi9Fuj13gISAuC11Ecjq/vmXlag6FTLF3SzZllkak61L\nwiaMPuAa+RACwdu3sIsaeCHpLoETKVExJvHFsPl/Y+ofPi7Mfx5fIrREWOOz6+yc\nYU4DVS+3sQKBgQDhCnmAu5/e6wr1/Yy/j2wmx9t37Y4GHfwT+KnnGZlcqrlZOB1m\n9deg5B56gJ4jAk2JqGlgtsRQllG2EwUCykTb0q5adritWVGARmGIkH6o8plP71ef\nIQ5Sr69GmHWqmC5Zg4ErA+waQC/cfBw6yquql+JM8VikRSSRjvLVr9nrFQKBgCVO\nBU97eRF28hq01s2scHV+GynFUPPclf6vcGrPTU8X5/XeIv8I5TRHACzK56E28DfD\njEpRzQVMyk3rtPfQrlv4h8pBEpTvSWSei5HXJWkZxR+KXiH+XBGK0y0nvh503vpO\nu2pmfZnZtQaxl4hOCXFLdl3F5FKx8QmJtap6b2TxAoGAZcV3tpEsJ2cQpZD2ik2J\ns8BurOa1AFSldjFLGyJkh0w9kELQAhZVFH+9As9/ThgRyRIYV0xz4hbUjobcLgM0\nR7X+GS9FqBKn/5zJRTTpZ3jZEyY91qv3mVQKx6V0Ws1V+YOWjJEXGc1wkyOEA93B\nw9JSQgSDyZHPSC/WVEHA3mU=\n-----END PRIVATE KEY-----\n",
                client_email: 'ga4-124@lynx-460617.iam.gserviceaccount.com',
                client_id: '117680020391704302024',
                client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/ga4-124%40lynx-460617.iam.gserviceaccount.com'
            });
            const yesterday = 'yesterday';

            console.log('Testing GA4 getUsersByCountry report...');
            const [
                usersByCountry,
                deviceSessions,
                topPages,
                channelConversions,
                compareTraffic
            ] = await Promise.all([
                ga4Service.getUsersByCountry(),
                ga4Service.getSessionsByDeviceCategory(yesterday, yesterday),
                ga4Service.getPopularPagesWithEngagement('7daysAgo', yesterday),
                ga4Service.getConversionsBySourceMedium('30daysAgo', yesterday),
                ga4Service.compareTodayVsYesterday('sessions')
            ]);
            console.log('Report result:');
            console.log(JSON.stringify(usersByCountry, null, 2));
            console.log(JSON.stringify(deviceSessions, null, 2));
            console.log(JSON.stringify(topPages, null, 2));
            console.log(JSON.stringify(channelConversions, null, 2));
            console.log(JSON.stringify(compareTraffic, null, 2));
        } catch (error) {
            console.error('Test failed:', error);
        }
    }

    testGA4Service();
}
