export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
  }
  
  class Logger {
    private logLevel: LogLevel;
  
    constructor() {
      const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
      this.logLevel = LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO;
    }
  
    private formatMessage(level: string, message: string, ...args: any[]): string {
      const timestamp = new Date().toISOString();
      const formattedArgs = args.length > 0 ? ` ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')}` : '';
      
      return `[${timestamp}] ${level}: ${message}${formattedArgs}`;
    }
  
    public error(message: string, ...args: any[]): void {
      if (this.logLevel >= LogLevel.ERROR) {
        console.error(this.formatMessage('ERROR', message, ...args));
      }
    }
  
    public warn(message: string, ...args: any[]): void {
      if (this.logLevel >= LogLevel.WARN) {
        console.warn(this.formatMessage('WARN', message, ...args));
      }
    }
  
    public info(message: string, ...args: any[]): void {
      if (this.logLevel >= LogLevel.INFO) {
        console.info(this.formatMessage('INFO', message, ...args));
      }
    }
  
    public debug(message: string, ...args: any[]): void {
      if (this.logLevel >= LogLevel.DEBUG) {
        console.debug(this.formatMessage('DEBUG', message, ...args));
      }
    }
  }
  
  export const logger = new Logger(); 