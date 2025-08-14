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

// CORS налаштування - максимально спрощено для розробки
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
  credentials: false
}));

// Додаткові CORS заголовки для всіх запитів
app.use((req, res, next) => {
  // Логуємо CORS запити
  logger.info(`🌐 CORS запит: ${req.method} ${req.path} з origin: ${req.headers.origin}`);
  
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    logger.info(`✅ CORS preflight запит оброблено для ${req.path}`);
    res.sendStatus(200);
  } else {
    next();
  }
});

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
      health: "/health",
      cors: "/cors-test",
      productsCount: "/products-count",
      cacheStats: "/cache-stats",
      refreshCache: "/refresh-cache (POST)",
      promStats: "/prom-stats"
    },
    cors: {
      origin: req.headers.origin,
      allowed: true
    }
  });
});

// Тестовий endpoint для перевірки CORS
app.get("/cors-test", (req, res) => {
  logger.info(`🧪 CORS тест запит: ${req.method} ${req.path} з origin: ${req.headers.origin}`);
  
  res.json({
    success: true,
    message: "CORS тест пройшов успішно",
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    cors: {
      allowOrigin: res.getHeader('Access-Control-Allow-Origin'),
      allowMethods: res.getHeader('Access-Control-Allow-Methods'),
      allowHeaders: res.getHeader('Access-Control-Allow-Headers')
    }
  });
});

// Тестовий endpoint для перевірки кількості товарів
app.get("/products-count", async (req, res) => {
  try {
    const cacheServiceModule = await import('./services/cacheService.js');
    const cacheService = cacheServiceModule.default;
    const products = cacheService.getAllProducts();
    
    res.json({
      success: true,
      totalProducts: products.length,
      message: `В кеші зберігається ${products.length} товарів`,
      timestamp: new Date().toISOString(),
      cacheStatus: "active"
    });
  } catch (error) {
    logger.error("Помилка при отриманні кількості товарів:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати кількість товарів",
      details: error.message
    });
  }
});

// Endpoint для примусового оновлення кешу
app.post("/refresh-cache", async (req, res) => {
  try {
    logger.info("🔄 Запит на примусове оновлення кешу");
    
    const { updateCacheInBackground } = await import('./controllers/productsController.js');
    await updateCacheInBackground();
    
    const cacheServiceModule = await import('./services/cacheService.js');
    const cacheService = cacheServiceModule.default;
    const products = cacheService.getAllProducts();
    
    res.json({
      success: true,
      message: "Кеш оновлено успішно",
      totalProducts: products.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Помилка при оновленні кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося оновити кеш",
      details: error.message
    });
  }
});

// Endpoint для отримання детальної статистики кешу
app.get("/cache-stats", async (req, res) => {
  try {
    const cacheServiceModule = await import('./services/cacheService.js');
    const cacheService = cacheServiceModule.default;
    const allProducts = cacheService.getAllProducts();
    const cacheStatus = cacheService.getCacheStatus();
    
    // Статистика по категоріях
    const categoryStats = {};
    Object.keys(cacheService.categoryGroups).forEach(category => {
      const products = cacheService.getCategoryProducts(category);
      if (products.length > 0) {
        categoryStats[category] = products.length;
      }
    });
    
    res.json({
      success: true,
      totalProducts: allProducts.length,
      categories: categoryStats,
      cacheStatus: cacheStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Помилка при отриманні статистики кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати статистику кешу",
      details: error.message
    });
  }
});
// Endpoint для отримання детальної статистики кешу
app.get("/cache-stats", async (req, res) => {
  try {
    const cacheServiceModule = await import('./services/cacheService.js');
    const cacheService = cacheServiceModule.default;
    const allProducts = cacheService.getAllProducts();
    const cacheStatus = cacheService.getCacheStatus();
    
    // Статистика по категоріях
    const categoryStats = {};
    Object.keys(cacheService.categoryGroups).forEach(category => {
      const products = cacheService.getCategoryProducts(category);
      if (products.length > 0) {
        categoryStats[category] = products.length;
      }
    });
    
    res.json({
      success: true,
      totalProducts: allProducts.length,
      categories: categoryStats,
      cacheStatus: cacheStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Помилка при отриманні статистики кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати статистику кешу",
      details: error.message
    });
  }
});


// Endpoint для отримання детальної статистики кешу
app.get("/cache-stats", async (req, res) => {
  try {
    const cacheServiceModule = await import('./services/cacheService.js');
    const cacheService = cacheServiceModule.default;
    const allProducts = cacheService.getAllProducts();
    const cacheStatus = cacheService.getCacheStatus();
    
    // Статистика по категоріях
    const categoryStats = {};
    Object.keys(cacheService.categoryGroups).forEach(category => {
      const products = cacheService.getCategoryProducts(category);
      if (products.length > 0) {
        categoryStats[category] = products.length;
      }
    });
    
    res.json({
      success: true,
      totalProducts: allProducts.length,
      categories: categoryStats,
      cacheStatus: cacheStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Помилка при отриманні статистики кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати статистику кешу",
      details: error.message
    });
  }
});

// Endpoint для отримання статистики Prom.ua профілю
app.get("/prom-stats", async (req, res) => {
  try {
    logger.info("🔍 Запит статистики Prom.ua профілю");
    
    const { promService } = await import('./services/promService.js');
    
    // Тестуємо з'єднання з API
    const connectionTest = await promService.testConnection();
    
    // Отримуємо статистику API
    const apiStats = await promService.getAPIStats();
    
    // Додатково спробуємо отримати загальну кількість товарів
    let totalProductsInProfile = 0;
    try {
      // Робимо тестовий запит без фільтрів для оцінки загальної кількості
      const testResponse = await promService.createClient().get('/products/list', {
        params: { limit: 1 }
      });
      
      // Якщо API повертає загальну кількість
      if (testResponse.data.total) {
        totalProductsInProfile = testResponse.data.total;
      }
    } catch (error) {
      logger.warn("Не вдалося отримати загальну кількість товарів:", error.message);
    }
    
    res.json({
      success: true,
      message: "Статистика Prom.ua профілю",
      connection: connectionTest,
      apiStats: apiStats,
      profileInfo: {
        estimatedTotalProducts: totalProductsInProfile || "Невідомо",
        note: "Це приблизна оцінка. Точна кількість може відрізнятися."
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error("Помилка при отриманні статистики Prom.ua:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати статистику Prom.ua",
      details: error.message
    });
  }
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