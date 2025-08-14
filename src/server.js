import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env.js";
import productsRouter from "./routes/products.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { initializeCache } from "./controllers/productsController.js";
import logger from "./utils/logger.js";

const app = express();

// Логування запитів
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;
    const ip = req.ip;

    logger.info(`${method} ${url} ${status} ${duration}ms - ${ip}`);
  });

  next();
});

// Безпека
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "blob:"],
        connectSrc: ["'self'", "*"],
      },
    },
  })
);

// CORS налаштування
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://ecovolt-back.onrender.com'] // Замініть на ваш домен
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Парсинг JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Базовий health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API маршрути
app.use("/api/products", productsRouter);

// Обробка неіснуючих маршрутів (без '*', щоб уникнути помилки path-to-regexp)
app.use(notFoundHandler);

// Централізована обробка помилок
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Отримано сигнал ${signal}. Виконуємо graceful shutdown...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Запуск сервера
const startServer = async () => {
  try {
    logger.info("🚀 Запуск сервера EcoVolt...");

    await initializeCache();

    app.listen(config.port, () => {
      logger.info(`✅ Сервер запущено на порту ${config.port}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(`🛠️ API test: http://localhost:${config.port}/api/products/test`);
    });

  } catch (error) {
    logger.error("❌ Критична помилка запуску сервера:", error);
    process.exit(1);
  }
};

startServer();
