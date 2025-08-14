class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    // Поточний рівень логування (можна змінити через ENV)
    this.currentLevel = process.env.LOG_LEVEL || 'info';
  }

  /**
   * Форматує повідомлення з часовою міткою
   */
  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    
    return [`[${timestamp}] ${levelUpper}:`, message, ...args];
  }

  /**
   * Перевіряє чи потрібно виводити повідомлення цього рівня
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.currentLevel];
  }

  /**
   * Помилки (завжди виводяться)
   */
  error(message, ...args) {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage('error', message, ...args));
    }
  }

  /**
   * Попередження
   */
  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage('warn', message, ...args));
    }
  }

  /**
   * Інформаційні повідомлення
   */
  info(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(...this.formatMessage('info', message, ...args));
    }
  }

  /**
   * Відладочна інформація
   */
  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      console.log(...this.formatMessage('debug', message, ...args));
    }
  }

  /**
   * Встановлює рівень логування
   */
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.currentLevel = level;
      this.info(`Рівень логування змінено на: ${level}`);
    } else {
      this.warn(`Невідомий рівень логування: ${level}`);
    }
  }
}

// Експортуємо singleton
const logger = new Logger();
export default logger;