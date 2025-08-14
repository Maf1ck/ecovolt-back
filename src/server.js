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
    const ip = req.ip || req.connection.remoteAddress;

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
    crossOriginEmbedderPolicy: false,
  })
);

// CORS налаштування - ВИПРАВЛЕНО
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com'] // Замініть на ваш реальний домен
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Cache-Control', // ДОДАНО
    'Accept',
    'Origin',
    'User-Agent',
    'DNT',
    'If-Modified-Since',
    'Keep-Alive',
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Length', 'X-JSON'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Обробка preflight запитів
app.options('*', cors());

// Парсинг JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Базовий endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "EcoVolt API is running", 
    endpoints: {
      products: "/api/products",
      test: "/api/products/test",
      health: "/health"
    },
    cors: {
      origin: req.headers.origin,
      allowed: true
    }
  });
});

// Базовий health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    cors: {
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']
    }
  });
});

// API маршрути
app.use("/api/products", productsRouter);

// Обробка неіснуючих маршрутів
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

    // Ініціалізуємо кеш
    await initializeCache();

    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`✅ Сервер запущено на порту ${config.port}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(`🛠️ API test: http://localhost:${config.port}/api/products/test`);
    });

    // Налаштування таймаутів
    server.timeout = 30000; // 30 секунд
    server.keepAliveTimeout = 61000; // 61 секунда
    server.headersTimeout = 62000; // 62 секунди

  } catch (error) {
    logger.error("❌ Критична помилка запуску сервера:", error);
    process.exit(1);
  }
};

startServer();