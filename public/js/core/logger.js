/* eslint-disable no-console */
// Structured logging utility with environment-aware configuration

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    // Determine environment from URL or hostname
    this.isProduction = this.detectProduction();
    this.level = this.isProduction ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG;
  }

  detectProduction() {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.');
  }

  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      ...context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
  }

  error(message, context = {}) {
    if (this.level >= LOG_LEVELS.ERROR) {
      const formatted = this.formatMessage('ERROR', message, context);
      console.error(`[${formatted.timestamp}] ERROR:`, message, context);
      
      // In production, you could send to error tracking service here
      // e.g., Sentry, LogRocket, etc.
      if (this.isProduction) {
        this.sendToErrorTracking(formatted);
      }
    }
  }

  warn(message, context = {}) {
    if (this.level >= LOG_LEVELS.WARN) {
      const formatted = this.formatMessage('WARN', message, context);
      console.warn(`[${formatted.timestamp}] WARN:`, message, context);
    }
  }

  info(message, context = {}) {
    if (this.level >= LOG_LEVELS.INFO) {
      const formatted = this.formatMessage('INFO', message, context);
      console.info(`[${formatted.timestamp}] INFO:`, message, context);
    }
  }

  debug(message, context = {}) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message, context);
      console.debug(`[${formatted.timestamp}] DEBUG:`, message, context);
    }
  }

  sendToErrorTracking(logEntry) {
    // Placeholder for error tracking integration
    // Could send to Sentry, custom endpoint, etc.
    // For now, just store in sessionStorage for debugging
    try {
      const errors = JSON.parse(sessionStorage.getItem('app_errors') || '[]');
      errors.push(logEntry);
      // Keep only last 50 errors
      if (errors.length > 50) errors.shift();
      sessionStorage.setItem('app_errors', JSON.stringify(errors));
    } catch {
      // Silently fail if storage is unavailable
    }
  }
}

// Export singleton instance
export const logger = new Logger();
