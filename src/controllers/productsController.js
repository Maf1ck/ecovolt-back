import axios from "axios";
import { config } from "../config/env.js";

// Кеш для товарів
const cache = {
  allProducts: null,
  categorizedProducts: {},
  lastUpdated: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин

// Мапа категорій з їх group_id (ці ID потрібно взяти з вашого Prom.ua)
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

// Функція для завантаження товарів з API з покращеною логікою
const fetchProducts = async (filter = null) => {
  let allProducts = [];
  let lastId = null;
  let hasMore = true;
  let requestCount = 0;
  const maxRequests = 50; // Збільшили максимальну кількість запитів
  
  console.log("🚀 Починаємо завантаження товарів");
  
  try {
    while (hasMore && requestCount < maxRequests) {
      requestCount++;
      console.log(`📞 Запит #${requestCount}, lastId: ${lastId}`);
      
      const params = {
        limit: 500,
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
          timeout: 30000, // 30 секунд таймаут
        }
      );

      const { products, last_id } = response.data;
      
      console.log(`📦 Отримано товарів: ${products?.length || 0}`);
      console.log(`🔄 Новий last_id: ${last_id}`);
      
      if (products?.length > 0) {
        const filtered = filter ? products.filter(filter) : products;
        allProducts = [...allProducts, ...filtered];
        
        console.log(`✅ Додано товарів: ${filtered.length}, всього: ${allProducts.length}`);
        
        // Перевіряємо умови для продовження
        if (!last_id) {
          console.log("⚠️ last_id відсутній, припиняємо завантаження");
          hasMore = false;
        } else if (last_id === lastId) {
          console.log("⚠️ last_id не змінився, припиняємо завантаження");
          hasMore = false;
        } else {
          lastId = last_id;
          
          // Якщо отримали менше товарів ніж максимум, можливо це останній запит
          if (products.length < 500) {
            console.log(`⚠️ Отримано менше товарів (${products.length}) ніж максимум (500)`);
          }
        }
        
      } else {
        console.log("❌ Товари відсутні або масив порожній, припиняємо завантаження");
        hasMore = false;
      }

      // Затримка між запитами для уникнення перевантаження API
      await new Promise(resolve => setTimeout(resolve, 150));
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

// Альтернативна функція з використанням offset (якщо last_id не працює)
const fetchProductsWithOffset = async (filter = null) => {
  let allProducts = [];
  let offset = 0;
  let hasMore = true;
  const limit = 100; // Менший ліміт для стабільності
  let requestCount = 0;
  const maxRequests = 100;
  
  console.log("🚀 Починаємо завантаження товарів з offset");
  
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
          timeout: 30000,
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

      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ Завантаження завершено. Всього товарів: ${allProducts.length}`);
    return allProducts;
    
  } catch (error) {
    console.error("❌ Помилка при завантаженні з offset:", error.message);
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

// Отримання товарів з кешуванням
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 8, category } = req.query;
    
    // Перевірка кешу
    const now = Date.now();
    if (!cache.allProducts || !cache.lastUpdated || 
        (now - cache.lastUpdated) > CACHE_DURATION) {
      console.log("🔄 Оновлюємо кеш...");
      
      // Спробуємо спочатку основну функцію, потім альтернативну
      try {
        cache.allProducts = await fetchProducts();
      } catch (error) {
        console.log("⚠️ Основна функція не спрацювала, пробуємо з offset...");
        cache.allProducts = await fetchProductsWithOffset();
      }
      
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
      
      try {
        cache.allProducts = await fetchProducts();
      } catch (error) {
        console.log("⚠️ Основна функція не спрацювала, пробуємо з offset...");
        cache.allProducts = await fetchProductsWithOffset();
      }
      
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
    
    // Спробуємо обидва методи
    try {
      cache.allProducts = await fetchProducts();
    } catch (error) {
      console.log("⚠️ Основна функція не спрацювала, пробуємо з offset...");
      cache.allProducts = await fetchProductsWithOffset();
    }
    
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