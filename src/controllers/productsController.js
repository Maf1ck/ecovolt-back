import axios from "axios";
import { config } from "../config/env.js";

// Кеш для товарів
const cache = {
  allProducts: null,
  categorizedProducts: {},
  lastUpdated: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин

// Мапа категорій з їх group_id
const CATEGORY_GROUPS = {
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

// Основна функція для завантаження товарів з покращеною логікою
const fetchProducts = async (filter = null) => {
  let allProducts = [];
  let lastId = null;
  let hasMore = true;
  let requestCount = 0;
  const maxRequests = 200; // Збільшено максимальну кількість запитів
  const requestLimit = 1000; // Максимальний ліміт на запит для Prom.ua
  
  console.log("🚀 Починаємо завантаження товарів");
  
  try {
    while (hasMore && requestCount < maxRequests) {
      requestCount++;
      console.log(`📞 Запит #${requestCount}${lastId ? `, lastId: ${lastId}` : ''}`);
      
      const params = {
        limit: requestLimit, // Використовуємо максимальний ліміт
        ...(lastId && { last_id: lastId }),
      };
      
      const response = await axios.get(
        "https://my.prom.ua/api/v1/products/list",
        {
          headers: {
            Authorization: `Bearer ${config.promApiToken}`,
            "X-LANGUAGE": "uk",
          },
          params,
          timeout: 45000, // Збільшено таймаут до 45 секунд
        }
      );

      const { products, last_id } = response.data;
      
      console.log(`📦 Отримано товарів: ${products?.length || 0}`);
      
      if (products?.length > 0) {
        const filtered = filter ? products.filter(filter) : products;
        allProducts = [...allProducts, ...filtered];
        
        console.log(`✅ Додано товарів: ${filtered.length}, всього: ${allProducts.length}`);
        
        // Оновлена логіка для продовження завантаження
        if (!last_id) {
          console.log("✅ last_id відсутній, досягнуто кінця");
          hasMore = false;
        } else if (last_id === lastId) {
          console.log("⚠️ last_id не змінився, можливо досягнуто кінця");
          hasMore = false;
        } else {
          lastId = last_id;
          
          // Якщо отримали менше товарів ніж ліміт, можливо це останній запит
          if (products.length < requestLimit) {
            console.log(`⚠️ Отримано ${products.length} товарів, менше ніж ліміт ${requestLimit}`);
            // Не завершуємо тут, бо можуть бути ще товари
          }
        }
        
      } else {
        console.log("❌ Товари відсутні, завершуємо завантаження");
        hasMore = false;
      }

      // Затримка між запитами для уникнення rate limit
      await new Promise(resolve => setTimeout(resolve, 300)); // Збільшена затримка
    }
    
    if (requestCount >= maxRequests) {
      console.log(`⚠️ Досягнуто максимальну кількість запитів (${maxRequests})`);
    }
    
    console.log(`✅ Завантаження завершено. Всього товарів: ${allProducts.length}`);
    return allProducts;
    
  } catch (error) {
    console.error("❌ Помилка при завантаженні:", error.message);
    if (error.response) {
      console.error("📄 Статус відповіді:", error.response.status);
      console.error("📄 Дані відповіді:", error.response.data);
    }
    throw error;
  }
};

// Функція з offset методом як резервна опція
const fetchProductsWithOffset = async (filter = null) => {
  let allProducts = [];
  let offset = 0;
  let hasMore = true;
  const limit = 1000; // Збільшено ліміт
  let requestCount = 0;
  const maxRequests = 50; // Менше запитів, але з більшим лімітом
  
  console.log("🚀 Починаємо завантаження товарів з offset (резервний метод)");
  
  try {
    while (hasMore && requestCount < maxRequests) {
      requestCount++;
      console.log(`📞 Запит #${requestCount}, offset: ${offset}, limit: ${limit}`);
      
      const response = await axios.get(
        "https://my.prom.ua/api/v1/products/list",
        {
          headers: {
            Authorization: `Bearer ${config.promApiToken}`,
            "X-LANGUAGE": "uk",
          },
          params: {
            limit: limit,
            offset: offset
          },
          timeout: 45000,
        }
      );

      const { products } = response.data;
      
      console.log(`📦 Отримано товарів: ${products?.length || 0}`);
      
      if (products?.length > 0) {
        const filtered = filter ? products.filter(filter) : products;
        allProducts = [...allProducts, ...filtered];
        
        console.log(`✅ Всього товарів: ${allProducts.length}`);
        
        // Якщо отримали менше товарів ніж limit, значить це останній запит
        if (products.length < limit) {
          hasMore = false;
          console.log("✅ Отримано менше товарів ніж limit, завершуємо");
        } else {
          offset += limit;
        }
      } else {
        hasMore = false;
        console.log("❌ Товари відсутні, завершуємо");
      }

      await new Promise(resolve => setTimeout(resolve, 400)); // Збільшена затримка
    }
    
    console.log(`✅ Завантаження завершено. Всього товарів: ${allProducts.length}`);
    return allProducts;
    
  } catch (error) {
    console.error("❌ Помилка при завантаженні з offset:", error.message);
    throw error;
  }
};

// Функція для пакетного завантаження (альтернативний підхід)
const fetchProductsBatch = async (filter = null) => {
  let allProducts = [];
  let page = 1;
  let hasMore = true;
  const limit = 1000;
  const maxPages = 100;
  
  console.log("🚀 Починаємо пакетне завантаження товарів");
  
  try {
    while (hasMore && page <= maxPages) {
      console.log(`📞 Завантажуємо сторінку ${page} з лімітом ${limit}`);
      
      const response = await axios.get(
        "https://my.prom.ua/api/v1/products/list",
        {
          headers: {
            Authorization: `Bearer ${config.promApiToken}`,
            "X-LANGUAGE": "uk",
          },
          params: {
            limit: limit,
            offset: (page - 1) * limit
          },
          timeout: 45000,
        }
      );

      const { products } = response.data;
      
      if (products?.length > 0) {
        const filtered = filter ? products.filter(filter) : products;
        allProducts = [...allProducts, ...filtered];
        
        console.log(`✅ Сторінка ${page}: отримано ${products.length}, загалом ${allProducts.length}`);
        
        if (products.length < limit) {
          hasMore = false;
          console.log("✅ Досягнуто кінця товарів");
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ Пакетне завантаження завершено. Всього товарів: ${allProducts.length}`);
    return allProducts;
    
  } catch (error) {
    console.error("❌ Помилка при пакетному завантаженні:", error.message);
    throw error;
  }
};

// Функція для категоризації товарів
const categorizeProducts = (products) => {
  const categorized = {};
  
  // Ініціалізуємо категорії
  Object.keys(CATEGORY_GROUPS).forEach(category => {
    categorized[category] = [];
  });

  products.forEach(product => {
    const groupId = product.group?.id;
    
    // Знаходимо категорію за group_id
    const category = Object.entries(CATEGORY_GROUPS).find(
      ([key, id]) => id === groupId
    );
    
    if (category) {
      categorized[category[0]].push(product);
    }
  });

  return categorized;
};

// Покращена функція завантаження з множинними спробами
const loadProductsWithRetry = async (filter = null, maxAttempts = 3) => {
  const methods = [
    () => fetchProducts(filter),
    () => fetchProductsWithOffset(filter),
    () => fetchProductsBatch(filter)
  ];
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (let methodIndex = 0; methodIndex < methods.length; methodIndex++) {
      try {
        console.log(`🔄 Спроба ${attempt + 1}, метод ${methodIndex + 1}`);
        const products = await methods[methodIndex]();
        
        if (products.length > 0) {
          console.log(`✅ Успішно завантажено ${products.length} товарів методом ${methodIndex + 1}`);
          return products;
        }
      } catch (error) {
        console.error(`❌ Метод ${methodIndex + 1}, спроба ${attempt + 1} не вдалася:`, error.message);
      }
    }
  }
  
  throw new Error("Всі методи завантаження товарів не вдалися");
};

// Отримання товарів з кешуванням
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 8, category } = req.query;
    
    // Перевірка кешу
    const now = Date.now();
    if (!cache.allProducts || !cache.lastUpdated || 
        (now - cache.lastUpdated) > CACHE_DURATION) {
      console.log("🔄 Оновлюємо кеш...");
      
      cache.allProducts = await loadProductsWithRetry();
      cache.categorizedProducts = categorizeProducts(cache.allProducts);
      cache.lastUpdated = now;
      
      console.log(`✅ Кеш оновлено. Всього товарів: ${cache.allProducts.length}`);
      
      // Логування кількості товарів по категоріям
      Object.entries(cache.categorizedProducts).forEach(([key, products]) => {
        if (products.length > 0) {
          console.log(`📂 ${key}: ${products.length} товарів`);
        }
      });
    }

    let products;
    if (category && cache.categorizedProducts[category]) {
      products = cache.categorizedProducts[category];
    } else {
      products = cache.allProducts;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    res.json({
      success: true,
      products: products.slice(start, end),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(products.length / limitNum),
        totalItems: products.length,
        hasMore: end < products.length,
        showing: `${start + 1}-${Math.min(end, products.length)} з ${products.length}`
      },
      fromCache: true,
      totalProductsInCache: cache.allProducts?.length || 0
    });
  } catch (error) {
    console.error("❌ Помилка в getProducts:", error);
    res.status(500).json({
      success: false,
      error: "Помилка сервера",
      details: error.message
    });
  }
};

// Отримання товару по ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(
      `https://my.prom.ua/api/v1/products/${id}`,
      {
        headers: {
          Authorization: `Bearer ${config.promApiToken}`,
          "X-LANGUAGE": "uk",
        },
        timeout: 15000,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(`❌ Помилка отримання товару ${req.params.id}:`, error.message);
    res.status(500).json({
      error: "Не вдалося отримати товар",
      details: error.message
    });
  }
};

// Отримання товарів за категорією
export const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 8 } = req.query;

    if (!CATEGORY_GROUPS.hasOwnProperty(category)) {
      return res.status(400).json({
        success: false,
        error: "Невідома категорія"
      });
    }

    // Перевірка кешу
    const now = Date.now();
    if (!cache.allProducts || !cache.lastUpdated || 
        (now - cache.lastUpdated) > CACHE_DURATION) {
      console.log("🔄 Оновлюємо кеш для категорії...");
      
      cache.allProducts = await loadProductsWithRetry();
      cache.categorizedProducts = categorizeProducts(cache.allProducts);
      cache.lastUpdated = now;
    }

    const products = cache.categorizedProducts[category] || [];
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    res.json({
      success: true,
      products: products.slice(start, end),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(products.length / limitNum),
        totalItems: products.length,
        hasMore: end < products.length,
        showing: `${start + 1}-${Math.min(end, products.length)} з ${products.length}`
      },
      category: category,
      fromCache: true,
      totalProductsInCache: cache.allProducts?.length || 0
    });
  } catch (error) {
    console.error(`❌ Помилка при отриманні категорії ${category}:`, error);
    res.status(500).json({
      success: false,
      error: `Помилка при отриманні категорії ${category}`,
      details: error.message
    });
  }
};

// Функція для оновлення кешу
export const refreshCache = async (req, res) => {
  try {
    console.log("🔄 Примусове оновлення кешу...");
    
    cache.allProducts = await loadProductsWithRetry();
    cache.categorizedProducts = categorizeProducts(cache.allProducts);
    cache.lastUpdated = Date.now();
    
    const categoryStats = Object.entries(cache.categorizedProducts).map(([key, products]) => ({
      category: key,
      count: products.length
    }));
    
    console.log(`✅ Кеш оновлено. Всього товарів: ${cache.allProducts.length}`);
    
    res.json({
      success: true,
      totalCount: cache.allProducts.length,
      categories: categoryStats,
      lastUpdated: new Date(cache.lastUpdated).toISOString()
    });
  } catch (error) {
    console.error("❌ Помилка оновлення кешу:", error);
    res.status(500).json({
      success: false,
      error: "Не вдалося оновити кеш",
      details: error.message
    });
  }
};

// Функція для отримання статистики кешу
export const getCacheStats = async (req, res) => {
  try {
    const categoryStats = Object.entries(cache.categorizedProducts || {}).map(([key, products]) => ({
      category: key,
      count: products.length
    }));
    
    res.json({
      success: true,
      cacheExists: !!cache.allProducts,
      totalProducts: cache.allProducts?.length || 0,
      lastUpdated: cache.lastUpdated ? new Date(cache.lastUpdated).toISOString() : null,
      cacheAge: cache.lastUpdated ? Date.now() - cache.lastUpdated : null,
      categories: categoryStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Помилка отримання статистики",
      details: error.message
    });
  }
};