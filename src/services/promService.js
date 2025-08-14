import axios from "axios";
import { config } from "../config/env.js";
import logger from "../utils/logger.js";

class PromService {
  constructor() {
    this.baseURL = "https://my.prom.ua/api/v1";
    this.requestDelay = 300; // Збільшили затримку
    this.maxRetries = 3;
    this.timeout = 30000;
  }

  /**
   * Створює HTTP клієнт з налаштуваннями
   */
  createClient() {
    return axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        Authorization: `Bearer ${config.promApiToken}`,
        "X-LANGUAGE": "uk",
      },
    });
  }

  /**
   * Затримка між запитами
   */
  async delay(ms = this.requestDelay) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Повторення запиту з exponential backoff
   */
  async retryRequest(requestFn, retries = this.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        logger.warn(`Спроба ${attempt}/${retries} невдала:`, error.message);
        
        if (attempt === retries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffTime = Math.pow(2, attempt) * 1000;
        logger.info(`Очікування ${backoffTime}мс перед повторною спробою...`);
        await this.delay(backoffTime);
      }
    }
  }

  /**
   * ВИПРАВЛЕНА ФУНКЦІЯ: Завантажує ВСІ товари з Prom.ua API
   * Використовує пагінацію для отримання всіх товарів понад 100
   */
  async fetchAllProducts() {
    logger.info("🚀 Початок завантаження всіх товарів з Prom.ua");
    
    const client = this.createClient();
    let allProducts = [];
    let lastId = null;
    let hasMore = true;
    let requestCount = 0;
    const limit = 100; // Максимальний ліміт Prom.ua
    const maxRequests = 1000; // Безпечний ліміт запитів

    try {
      while (hasMore && requestCount < maxRequests) {
        requestCount++;
        
        logger.info(`📞 Запит #${requestCount}${lastId ? `, last_id: ${lastId}` : ''}`);

        // Виконуємо запит з повтореннями
        const response = await this.retryRequest(async () => {
          const params = {
            limit,
            // ВАЖЛИВО: додаємо last_id тільки якщо він є
            ...(lastId && { last_id: lastId }),
          };
          
          logger.debug(`📡 Параметри запиту:`, params);
          
          return await client.get('/products/list', {
            params: params
          });
        });

        const responseData = response.data;
        logger.debug(`📋 Структура відповіді:`, {
          hasProducts: !!responseData.products,
          productsCount: responseData.products?.length,
          hasLastId: !!responseData.last_id,
          lastIdValue: responseData.last_id
        });

        const { products, last_id } = responseData;

        // Перевіряємо чи є товари
        if (!products || products.length === 0) {
          logger.info("✅ Немає більше товарів для завантаження");
          hasMore = false;
          break;
        }

        // Додаємо товари до загального списку
        allProducts.push(...products);
        logger.info(`📦 Завантажено ${products.length} товарів. Всього: ${allProducts.length}`);

        // Перевіряємо умови завершення
        if (!last_id) {
          logger.info("✅ Досягнуто кінець списку товарів (немає last_id)");
          hasMore = false;
        } else if (last_id === lastId) {
          logger.info("✅ Досягнуто кінець списку товарів (last_id не змінився)");
          hasMore = false;
        } else {
          // Оновлюємо last_id для наступного запиту
          lastId = last_id;
          logger.debug(`🔄 Наступний last_id: ${lastId}`);
          
          // Затримка між запитами
          await this.delay();
        }

        // Логування прогресу кожні 5 запитів
        if (requestCount % 5 === 0) {
          logger.info(`📊 Прогрес: ${requestCount} запитів, ${allProducts.length} товарів`);
        }
      }

      if (requestCount >= maxRequests) {
        logger.warn(`⚠️ Досягнуто ліміт запитів (${maxRequests}). Завантажено ${allProducts.length} товарів`);
      }

      logger.info(`🏁 Завантаження завершено. Всього товарів: ${allProducts.length}`);
      
      // Додаткова перевірка на дублікати
      const uniqueProducts = this.removeDuplicates(allProducts);
      if (uniqueProducts.length !== allProducts.length) {
        logger.warn(`⚠️ Видалено ${allProducts.length - uniqueProducts.length} дублікатів`);
      }
      
      return uniqueProducts;

    } catch (error) {
      logger.error("❌ Критична помилка при завантаженні товарів:", error);
      
      // Якщо маємо хоча б частину товарів, повертаємо їх
      if (allProducts.length > 0) {
        logger.warn(`⚠️ Повертаємо частково завантажені товари: ${allProducts.length}`);
        return this.removeDuplicates(allProducts);
      }
      
      throw new Error(`Не вдалося завантажити товари: ${error.message}`);
    }
  }

  /**
   * Видаляє дублікати товарів за ID
   */
  removeDuplicates(products) {
    const seen = new Set();
    return products.filter(product => {
      if (seen.has(product.id)) {
        return false;
      }
      seen.add(product.id);
      return true;
    });
  }

  /**
   * ВИПРАВЛЕНА ФУНКЦІЯ: Завантажує товари конкретної категорії
   */
  async fetchProductsByCategory(groupId) {
    if (!groupId) {
      logger.warn("⚠️ Не вказано group_id, завантажуємо всі товари");
      return await this.fetchAllProducts();
    }

    logger.info(`🚀 Завантаження товарів категорії (group_id: ${groupId})`);
    
    const client = this.createClient();
    let categoryProducts = [];
    let lastId = null;
    let hasMore = true;
    let requestCount = 0;
    const limit = 100;
    const maxRequests = 500; // Менший ліміт для категорій

    try {
      while (hasMore && requestCount < maxRequests) {
        requestCount++;
        
        logger.info(`📞 Запит #${requestCount} для group_id ${groupId}${lastId ? `, last_id: ${lastId}` : ''}`);

        const response = await this.retryRequest(async () => {
          const params = {
            limit,
            group_id: groupId,
            ...(lastId && { last_id: lastId }),
          };
          
          return await client.get('/products/list', {
            params: params
          });
        });

        const { products, last_id } = response.data;

        if (!products || products.length === 0) {
          logger.info(`✅ Немає більше товарів для категорії ${groupId}`);
          hasMore = false;
          break;
        }

        categoryProducts.push(...products);
        logger.info(`📦 Завантажено ${products.length} товарів для категорії. Всього: ${categoryProducts.length}`);

        if (!last_id || last_id === lastId) {
          logger.info(`✅ Досягнуто кінець категорії ${groupId}`);
          hasMore = false;
        } else {
          lastId = last_id;
          await this.delay();
        }
      }

      logger.info(`🏁 Категорія ${groupId} завантажена. Товарів: ${categoryProducts.length}`);
      
      // Видаляємо дублікати
      const uniqueProducts = this.removeDuplicates(categoryProducts);
      return uniqueProducts;

    } catch (error) {
      logger.error(`❌ Помилка завантаження категорії ${groupId}:`, error);
      
      if (categoryProducts.length > 0) {
        logger.warn(`⚠️ Повертаємо частково завантажені товари категорії: ${categoryProducts.length}`);
        return this.removeDuplicates(categoryProducts);
      }
      
      throw new Error(`Не вдалося завантажити категорію ${groupId}: ${error.message}`);
    }
  }

  /**
   * Отримує конкретний товар за ID
   */
  async fetchProductById(productId) {
    logger.info(`🔍 Завантаження товару ID: ${productId}`);
    
    const client = this.createClient();

    try {
      const response = await this.retryRequest(async () => {
        return await client.get(`/products/${productId}`);
      });

      logger.info(`✅ Товар ${productId} завантажено успішно`);
      return response.data;

    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`⚠️ Товар ${productId} не знайдено`);
        throw new Error("Товар не знайдено");
      }
      
      logger.error(`❌ Помилка завантаження товару ${productId}:`, error);
      throw new Error(`Не вдалося завантажити товар: ${error.message}`);
    }
  }

  /**
   * Тестування з'єднання з API
   */
  async testConnection() {
    logger.info("🔍 Тестування з'єднання з Prom.ua API");
    
    const client = this.createClient();

    try {
      const response = await client.get('/products/list', {
        params: { limit: 1 }
      });

      const { products } = response.data;
      
      logger.info("✅ З'єднання з API працює");
      
      return {
        success: true,
        message: "API доступний",
        sampleProduct: products?.[0] || null,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error("❌ Помилка тестування API:", error);
      
      return {
        success: false,
        message: `API недоступний: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Отримує статистику API
   */
  async getAPIStats() {
    logger.info("📊 Отримання статистики API");
    
    try {
      // Тестуємо з'єднання
      const testResult = await this.testConnection();
      
      if (!testResult.success) {
        throw new Error(testResult.message);
      }

      // Отримуємо кілька товарів для статистики
      const client = this.createClient();
      const response = await client.get('/products/list', {
        params: { limit: 10 }
      });

      return {
        apiStatus: "OK",
        timestamp: new Date().toISOString(),
        sampleProducts: response.data.products?.length || 0,
        hasLastId: !!response.data.last_id,
        sampleProduct: response.data.products?.[0] || null
      };

    } catch (error) {
      logger.error("❌ Помилка отримання статистики:", error);
      throw error;
    }
  }
}

// Експортуємо singleton
const promService = new PromService();
export default promService;