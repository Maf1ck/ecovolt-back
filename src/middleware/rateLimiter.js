import logger from "../utils/logger.js";

/**
 * Простий in-memory rate limiter
 */
class SimpleRateLimiter {
  constructor() {
    this.clients = new Map();
    this.cleanup();
  }

  /**
   * Перевіряє чи дозволений запит для клієнта
   */
  isAllowed(clientId, windowMs, maxRequests) {
    const now = Date.now();
    
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        requests: [],
        windowStart: now
      });
    }

    const client = this.clients.get(clientId);
    
    // Очищуємо старі запити за межами вікна
    client.requests = client.requests.filter(
      requestTime => now - requestTime < windowMs
    );

    // Перевіряємо ліміт
    if (client.requests.length >= maxRequests) {
      return false;
    }

    // Додаємо поточний запит
    client.requests.push(now);
    return true;
  }

  /**
   * Очищає старі записи кожні 10 хвилин
   */
  cleanup() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 година
      
      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.windowStart > maxAge) {
          this.clients.delete(clientId);
        }
      }
      
      logger.debug(`Rate limiter cleanup: ${this.clients.size} активних клієнтів`);
    }, 10 * 60 * 1000);
  }
}

const rateLimiter = new SimpleRateLimiter();

/**
 * Створює middleware для rate limiting
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 хвилин
    max = 100,                  // 100 запитів
    message = "Перевищено ліміт запитів",
    keyGenerator = (req) => req.ip,
    skip = () => false
  } = options;

  return (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const clientId = keyGenerator(req);
    
    if (!rateLimiter.isAllowed(clientId, windowMs, max)) {
      logger.warn(`Rate limit перевищено для ${clientId}`);
      
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    next();
  };
};

/**
 * Базовий rate limiter для API
 */
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 100,                  // 100 запитів на IP
  message: "Забагато запитів з цього IP. Спробуйте пізніше."
});

/**
 * Строгий rate limiter для адміністративних операцій
 */
export const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000,      // 1 хвилина
  max: 5,                   // 5 запитів
  message: "Забагато адміністративних запитів. Зачекайте хвилину."
});