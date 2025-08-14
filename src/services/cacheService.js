import logger from "../utils/logger.js";

class CacheService {
  constructor() {
    // Головний кеш продуктів
    this.cache = {
      products: {
        all: [],
        categories: {},
        lastUpdate: null,
        isUpdating: false,
        updatePromise: null
      }
    };

    // Налаштування кешу
    this.config = {
      // Час життя кешу (30 хвилин)
      TTL: 30 * 60 * 1000,
      // Час для retry після помилки (5 хвилин)
      RETRY_DELAY: 5 * 60 * 1000,
      // Максимальний час очікування оновлення
      UPDATE_TIMEOUT: 10 * 60 * 1000
    };

    // Мапа категорій
    this.categoryGroups = {
      'solar-panels': 97668952,
      'inverters': 130134486,
      'fuses': null,
      'ups': null,
      'cables': 130135807,
      'optimizers': 130139474,
      'controllers': null,
      'mounting': 130139468,
      'batteries': 140995307,
      'drone-batteries': null,
      'charging-stations': null,
      'mushrooms': null,
      'boilers': null,
      'air-conditioners': 130300043
    };

    // Автоматичне оновлення кешу кожні 5 хвилин
    setInterval(() => {
      this.scheduleUpdateIfNeeded();
    }, 5 * 60 * 1000);
  }

  /**
   * Перевіряє чи потрібно оновити кеш
   */
  shouldUpdateCache() {
    const { lastUpdate } = this.cache.products;
    
    if (!lastUpdate) {
      return true;
    }
    
    const age = Date.now() - lastUpdate;
    return age > this.config.TTL;
  }

  /**
   * Отримує вік кешу в мілісекундах
   */
  getCacheAge() {
    const { lastUpdate } = this.cache.products;
    return lastUpdate ? Date.now() - lastUpdate : null;
  }

  /**
   * Отримує статус кешу
   */
  getCacheStatus() {
    const { all, lastUpdate, isUpdating } = this.cache.products;
    const age = this.getCacheAge();
    
    return {
      totalProducts: all.length,
      lastUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : null,
      ageMinutes: age ? Math.round(age / 60000) : null,
      isStale: this.shouldUpdateCache(),
      isUpdating,
      categories: Object.keys(this.cache.products.categories).reduce((acc, key) => {
        acc[key] = this.cache.products.categories[key].length;
        return acc;
      }, {})
    };
  }

  /**
   * Категоризує продукти за group_id
   */
  categorizeProducts(products) {
    const categorized = {};
    
    // Ініціалізуємо всі категорії
    Object.keys(this.categoryGroups).forEach(category => {
      categorized[category] = [];
    });

    // Розподіляємо продукти по категоріях
    products.forEach(product => {
      const groupId = product.group?.id;
      
      if (groupId) {
        const categoryEntry = Object.entries(this.categoryGroups).find(
          ([key, id]) => id === groupId
        );
        
        if (categoryEntry) {
          const [categoryKey] = categoryEntry;
          categorized[categoryKey].push(product);
        }
      }
    });

    // Логуємо статистику категорій
    const stats = Object.entries(categorized)
      .filter(([, products]) => products.length > 0)
      .map(([category, products]) => `${category}: ${products.length}`)
      .join(', ');
    
    logger.info(`📂 Категоризація завершена: ${stats}`);
    
    return categorized;
  }

  /**
   * Оновлює кеш новими продуктами
   */
  updateCache(products) {
    if (!Array.isArray(products)) {
      logger.error("❌ Помилка: products має бути масивом");
      throw new Error("Invalid products data: expected array");
    }
    
    if (products.length === 0) {
      logger.warn("⚠️ Отримано порожній масив товарів");
    }
    
    logger.info(`🔄 Оновлення кешу з ${products.length} продуктами`);
    
    try {
      // Категоризуємо продукти
      const categories = this.categorizeProducts(products);
      
      // Атомарне оновлення кешу
      this.cache.products = {
        all: products,
        categories,
        lastUpdate: Date.now(),
        isUpdating: false,
        updatePromise: null
      };

      logger.info(`✅ Кеш оновлено успішно. Товарів: ${products.length}`);
      this.logCacheStatus();
      
    } catch (error) {
      logger.error("❌ Помилка оновлення кешу:", error);
      throw error;
    }
  }

  /**
   * Позначає кеш як такий, що оновлюється
   */
  setUpdating(isUpdating, updatePromise = null) {
    this.cache.products.isUpdating = isUpdating;
    this.cache.products.updatePromise = updatePromise;
    
    if (isUpdating) {
      logger.info("⏳ Кеш позначено як такий, що оновлюється");
    } else {
      logger.info("✅ Кеш більше не оновлюється");
    }
  }

  /**
   * Очищає кеш
   */
  clearCache() {
    logger.warn("🗑️ Очищення кешу");
    
    this.cache.products = {
      all: [],
      categories: {},
      lastUpdate: null,
      isUpdating: false,
      updatePromise: null
    };
  }

  /**
   * Отримує всі продукти з кешу
   */
  getAllProducts() {
    return [...this.cache.products.all]; // Повертаємо копію
  }

  /**
   * Отримує продукти конкретної категорії
   */
  getCategoryProducts(categoryKey) {
    const products = this.cache.products.categories[categoryKey];
    return products ? [...products] : []; // Повертаємо копію
  }

  /**
   * Шукає продукт за ID в кеші
   */
  findProductById(productId) {
    return this.cache.products.all.find(
      product => product.id.toString() === productId.toString()
    );
  }

  /**
   * Перевіряє чи існує категорія
   */
  categoryExists(categoryKey) {
    return this.categoryGroups.hasOwnProperty(categoryKey);
  }

  /**
   * Отримує group_id для категорії
   */
  getCategoryGroupId(categoryKey) {
    return this.categoryGroups[categoryKey];
  }

  /**
   * Отримує список доступних категорій
   */
  getAvailableCategories() {
    return Object.keys(this.categoryGroups);
  }

  /**
   * Планує оновлення якщо потрібно
   */
  scheduleUpdateIfNeeded() {
    if (this.shouldUpdateCache() && !this.cache.products.isUpdating) {
      logger.info("⏰ Заплановано автоматичне оновлення кешу");
      // Тут можна викликати функцію оновлення
      // Це робиться в контролері щоб уникнути циклічних залежностей
    }
  }

  /**
   * Чекає поки поточне оновлення завершиться
   */
  async waitForUpdate(timeout = this.config.UPDATE_TIMEOUT) {
    if (!this.cache.products.isUpdating) {
      return;
    }

    logger.info("⏳ Очікування завершення поточного оновлення...");
    
    const startTime = Date.now();
    
    while (this.cache.products.isUpdating) {
      if (Date.now() - startTime > timeout) {
        logger.warn("⚠️ Таймаут очікування оновлення кешу");
        break;
      }
      
      // Чекаємо 100мс перед наступною перевіркою
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Логує поточний статус кешу
   */
  logCacheStatus() {
    const status = this.getCacheStatus();
    logger.info(`📊 Статус кешу: ${status.totalProducts} товарів, ` +
               `оновлено ${status.ageMinutes || 0} хв. тому, ` +
               `застарілий: ${status.isStale}, оновлюється: ${status.isUpdating}`);
  }

  /**
   * Отримує детальну статистику для API
   */
  getDetailedStats() {
    const status = this.getCacheStatus();
    
    return {
      cache: status,
      config: {
        ttlMinutes: this.config.TTL / 60000,
        retryDelayMinutes: this.config.RETRY_DELAY / 60000,
        updateTimeoutMinutes: this.config.UPDATE_TIMEOUT / 60000
      },
      categories: this.categoryGroups
    };
  }
}

// Експортуємо singleton
const cacheService = new CacheService();
export default cacheService;