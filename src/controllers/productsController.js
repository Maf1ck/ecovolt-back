import promService from "../services/promService.js";
import cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";

/**
 * Функція оновлення кешу у фоні
 */
const updateCacheInBackground = async () => {
  if (cacheService.cache.products.isUpdating) {
    logger.info("⏳ Оновлення кешу вже виконується");
    return;
  }

  try {
    cacheService.setUpdating(true);
    logger.info("🔄 Початок фонового оновлення кешу...");

    // Спочатку тестуємо з'єднання
    const testResult = await promService.testConnection();
    if (!testResult.success) {
      throw new Error(`API недоступний: ${testResult.message}`);
    }

    // Завантажуємо всі товари з Prom.ua API
    logger.info("📡 Запуск завантаження всіх товарів...");
    const { products, last_id } = await promService.fetchAllProducts();
    
    if (!products || products.length === 0) {
      throw new Error("Не отримано жодного товару з API");
    }

    // Оновлюємо кеш
    cacheService.updateCache(products);
    
    logger.info(`✅ Фонове оновлення завершено успішно: ${products.length} товарів, last_id: ${last_id}`);

    // Детальна статистика по категоріях
    const categoryStats = {};
    Object.keys(cacheService.categoryGroups).forEach(category => {
      const categoryProducts = cacheService.getCategoryProducts(category);
      if (categoryProducts.length > 0) {
        categoryStats[category] = categoryProducts.length;
      }
    });

    logger.info(`📊 Статистика по категоріях:`, categoryStats);

  } catch (error) {
    logger.error("❌ Помилка фонового оновлення кешу:", error);
    
    // Якщо кеш порожній і оновлення не вдалося - це критично
    if (cacheService.getAllProducts().length === 0) {
      logger.error("🚨 КРИТИЧНО: Немає кешованих товарів і оновлення не вдалося!");
    }
    
    throw error; // Пробрасываем ошибку дальше
  } finally {
    cacheService.setUpdating(false);
  }
};

/**
 * Ініціалізація кешу при запуску сервера
 */
export const initializeCache = async () => {
  logger.info("🚀 Ініціалізація кешу продуктів...");
  
  try {
    await updateCacheInBackground();
    
    // Запускаємо періодичне оновлення кешу кожні 15 хвилин
    setInterval(() => {
      if (cacheService.shouldUpdateCache()) {
        logger.info("⏰ Запуск планового оновлення кешу");
        updateCacheInBackground();
      }
    }, 15 * 60 * 1000);
    
  } catch (error) {
    logger.error("❌ Критична помилка ініціалізації кешу:", error);
    
    // Плануємо повторну спробу через 5 хвилин
    setTimeout(() => {
      logger.info("🔄 Повторна спроба ініціалізації кешу...");
      initializeCache();
    }, 5 * 60 * 1000);
  }
};

/**
 * Допоміжна функція для створення відповіді з пагінацією через last_id
 */
const createPaginationResponse = (products, limit, lastId = null, category = null) => {
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 100));
  // Сортуємо товари за id
  const sortedProducts = [...products].sort((a, b) => parseInt(a.id) - parseInt(b.id));

  let startIdx = 0;
  if (lastId) {
    const idx = sortedProducts.findIndex(p => String(p.id) === String(lastId));
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const endIdx = startIdx + limitNum;
  const paginatedProducts = sortedProducts.slice(startIdx, endIdx);
  const newLastId = paginatedProducts.length > 0 ? paginatedProducts[paginatedProducts.length - 1].id : null;
  const hasMore = endIdx < sortedProducts.length;

  return {
    success: true,
    products: paginatedProducts,
    pagination: {
      limit: limitNum,
      last_id: newLastId,
      hasMore,
      totalItems: sortedProducts.length,
      showing: `${startIdx + 1}-${Math.min(endIdx, sortedProducts.length)} з ${sortedProducts.length}`
    },
    category: category,
    fromCache: true,
    cacheAge: cacheService.getCacheAge(),
    cacheStatus: cacheService.getCacheStatus(),
    debug: {
      originalProductsCount: products.length,
      sortedProductsCount: sortedProducts.length,
      requestedLimit: limitNum,
      requestedLastId: lastId
    }
  };
};

/**
 * ГОЛОВНИЙ ENDPOINT: Отримання всіх товарів або товарів за категорією
 */
export const getProducts = async (req, res) => {
  try {
    const { limit = 100, last_id = null, category } = req.query;
    logger.info(`🔍 Запит товарів: category=${category || 'всі'}, last_id=${last_id}, limit=${limit}`);

    // Запускаємо оновлення кешу у фоні якщо потрібно (не чекаємо)
    if (cacheService.shouldUpdateCache() && !cacheService.cache.products.isUpdating) {
      logger.info("🔄 Запускаємо фонове оновлення кешу...");
      updateCacheInBackground().catch(error => {
        logger.error("❌ Помилка фонового оновлення:", error);
      });
    }

    let products;
    let productsSource = '';

    if (category && cacheService.categoryExists(category)) {
      // Отримуємо товари конкретної категорії
      products = cacheService.getCategoryProducts(category);
      productsSource = `категорії ${category}`;
      logger.info(`📂 Використано кешовані товари категорії ${category}: ${products.length}`);
    } else {
      // Отримуємо всі товари
      products = cacheService.getAllProducts();
      productsSource = 'всі товари';
      logger.info(`📦 Використано всі кешовані товари: ${products.length}`);
    }

    // Якщо немає товарів і кеш не оновлюється
    if (products.length === 0) {
      if (!cacheService.cache.products.isUpdating) {
        logger.warn("⚠️ Немає товарів в кеші, спробуємо завантажити");
        try {
          // Спробуємо завантажити товари синхронно
          await updateCacheInBackground();
          products = category ? cacheService.getCategoryProducts(category) : cacheService.getAllProducts();
        } catch (error) {
          logger.error("❌ Не вдалося завантажити товари:", error);
        }
      }
      // Якщо все ще немає товарів
      if (products.length === 0) {
        return res.status(503).json({
          success: false,
          error: "Товари тимчасово недоступні. Спробуйте пізніше.",
          isUpdating: cacheService.cache.products.isUpdating,
          cacheStatus: cacheService.getCacheStatus(),
          details: `Не знайдено товарів для: ${productsSource}`
        });
      }
    }

    // Створюємо відповідь з пагінацією через last_id
    const response = createPaginationResponse(products, limit, last_id, category);
    logger.info(`📊 Надіслано ${response.products.length} товарів (last_id=${response.pagination.last_id})`);
    res.json(response);
  } catch (error) {
    logger.error("❌ Помилка в getProducts:", error);
    res.status(500).json({
      success: false,
      error: "Помилка сервера",
      details: error.message
    });
  }
};


/**
 * Отримання товарів за категорією (окремий endpoint)
 */
export const getProductsByCategory = async (req, res) => {
  const { category } = req.params;
  
  logger.info(`🔍 Запит товарів категорії: ${category}`);

  if (!cacheService.categoryExists(category)) {
    return res.status(400).json({
      success: false,
      error: "Невідома категорія",
      availableCategories: cacheService.getAvailableCategories()
    });
  }

  // Перенаправляємо на головний endpoint
  req.query.category = category;
  return getProducts(req, res);
};

/**
 * Отримання товару за ID
 */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🔍 Запит товару ID: ${id}`);

    // Спочатку шукаємо в кеші
    const cachedProduct = cacheService.findProductById(id);
    
    if (cachedProduct) {
      logger.info(`✅ Товар знайдено в кеші: ${cachedProduct.name}`);
      return res.json({
        success: true,
        product: cachedProduct,
        fromCache: true
      });
    }

    // Якщо не знайдено в кеші, звертаємося до API
    logger.info("📞 Товар не знайдено в кеші, запит до API");
    
    const product = await promService.fetchProductById(id);

    res.json({
      success: true,
      product: product,
      fromCache: false
    });

  } catch (error) {
    logger.error(`❌ Помилка отримання товару ${req.params.id}:`, error);
    
    if (error.message === "Товар не знайдено") {
      res.status(404).json({
        success: false,
        error: "Товар не знайдено"
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Не вдалося завантажити товар",
        details: error.message
      });
    }
  }
};

/**
 * Тестування завантаження товарів (для діагностики)
 */
export const testProductLoading = async (req, res) => {
  try {
    logger.info("🧪 Тестування завантаження товарів");
    
    // Тестуємо з'єднання з Prom.ua API
    const apiTest = await promService.testConnection();
    
    if (!apiTest.success) {
      return res.status(503).json({
        success: false,
        error: "API недоступний",
        details: apiTest.message
      });
    }
    
    // Спробуємо завантажити кілька товарів для тесту
    const testProducts = await promService.fetchAllProducts();
    
    res.json({
      success: true,
      message: "Тест завантаження пройшов успішно",
      api: apiTest,
      products: {
        count: testProducts.length,
        sample: testProducts.slice(0, 3) // Перші 3 товари для прикладу
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error("❌ Помилка тестування завантаження:", error);
    res.status(500).json({
      success: false,
      error: "Помилка тестування завантаження",
      details: error.message
    });
  }
};

/**
 * Тестування API та отримання діагностичної інформації
 */
export const testAPI = async (req, res) => {
  try {
    logger.info("🔍 Запит тестування API");

    // Тестуємо з'єднання з Prom.ua API
    const apiTest = await promService.testConnection();
    
    // Отримуємо статус кешу
    const cacheStatus = cacheService.getDetailedStats();
    
    res.json({
      success: true,
      api: apiTest,
      cache: cacheStatus,
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error("❌ Помилка тестування API:", error);
    res.status(500).json({
      success: false,
      error: "Помилка тестування API",
      details: error.message,
      cache: cacheService.getCacheStatus()
    });
  }
};

/**
 * Примусове оновлення кешу (адміністративний endpoint)
 */
export const refreshCache = async (req, res) => {
  try {
    logger.info("🔄 Запит примусового оновлення кешу");
    
    if (cacheService.cache.products.isUpdating) {
      return res.status(409).json({
        success: false,
        error: "Оновлення кешу вже виконується",
        isUpdating: true,
        cacheStatus: cacheService.getCacheStatus()
      });
    }

    // Запускаємо оновлення і чекаємо результату
    await updateCacheInBackground();
    
    const cacheStatus = cacheService.getCacheStatus();
    
    res.json({
      success: true,
      message: "Кеш оновлено успішно",
      cache: cacheStatus
    });

  } catch (error) {
    logger.error("❌ Помилка примусового оновлення кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося оновити кеш",
      details: error.message,
      cache: cacheService.getCacheStatus()
    });
  }
};

/**
 * Очищення кешу (адміністративний endpoint)
 */
export const clearCache = async (req, res) => {
  try {
    logger.info("🗑️ Запит очищення кешу");
    
    cacheService.clearCache();
    
    res.json({
      success: true,
      message: "Кеш очищено успішно",
      cache: cacheService.getCacheStatus()
    });

  } catch (error) {
    logger.error("❌ Помилка очищення кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося очистити кеш",
      details: error.message
    });
  }
};

/**
 * Отримання всіх товарів без пагінації (для експорту або адміністрації)
 */
export const getAllProductsRaw = async (req, res) => {
  try {
    logger.info("🔍 Запит всіх товарів без пагінації");
    
    const products = cacheService.getAllProducts();
    
    if (products.length === 0) {
      return res.status(503).json({
        success: false,
        error: "Товари тимчасово недоступні",
        cacheStatus: cacheService.getCacheStatus()
      });
    }
    
    res.json({
      success: true,
      products: products,
      total: products.length,
      fromCache: true,
      cacheAge: cacheService.getCacheAge(),
      cacheStatus: cacheService.getCacheStatus()
    });
    
  } catch (error) {
    logger.error("❌ Помилка отримання всіх товарів:", error);
    res.status(500).json({
      success: false,
      error: "Помилка сервера",
      details: error.message
    });
  }
};

/**
 * Отримання статистики продуктів
 */
export const getProductsStats = async (req, res) => {
  try {
    const cacheStatus = cacheService.getCacheStatus();
    const allProducts = cacheService.getAllProducts();
    
    // Статистика по категоріях
    const categoryStats = {};
    Object.keys(cacheService.categoryGroups).forEach(category => {
      const products = cacheService.getCategoryProducts(category);
      categoryStats[category] = {
        count: products.length,
        groupId: cacheService.getCategoryGroupId(category)
      };
    });

    // Загальна статистика
    const stats = {
      total: allProducts.length,
      categories: categoryStats,
      cache: cacheStatus,
      lastProduct: allProducts.length > 0 ? {
        id: allProducts[allProducts.length - 1].id,
        name: allProducts[allProducts.length - 1].name
      } : null
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error("❌ Помилка отримання статистики:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати статистику",
      details: error.message
    });
  }
};
// Експортуємо функцію для оновлення кешу
export { updateCacheInBackground };

export const getLoadingStats = async (req, res) => {
  try {
    const cacheStatus = cacheService.getDetailedStats();
    const allProducts = cacheService.getAllProducts();
    
    // Статистика по категоріях
    const categoryStats = {};
    Object.keys(cacheService.categoryGroups).forEach(category => {
      const products = cacheService.getCategoryProducts(category);
      if (products.length > 0) {
        categoryStats[category] = {
          count: products.length,
          groupId: cacheService.getCategoryGroupId(category),
          firstProduct: products[0]?.name || 'N/A'
        };
      }
    });

    // Тестуємо API
    const apiTest = await promService.testConnection();

    res.json({
      success: true,
      api: apiTest,
      cache: cacheStatus,
      products: {
        total: allProducts.length,
        categories: categoryStats,
        lastUpdate: cacheStatus.cache.lastUpdate,
        sampleProduct: allProducts[0] || null
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error("❌ Помилка отримання статистики завантаження:", error);
    res.status(500).json({
      success: false,
      error: "Помилка отримання статистики",
      details: error.message
    });
  }
};