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
  'inverters': 130134486, // Замініть на реальний ID
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

// Функція для завантаження товарів з API
const fetchProducts = async (filter = null) => {
  let allProducts = [];
  let lastId = null;
  let hasMore = true;
  
  try {
    while (hasMore) {
      const response = await axios.get(
        "https://my.prom.ua/api/v1/products/list",
        {
          headers: {
            Authorization: `Bearer ${config.promApiToken}`,
            "X-LANGUAGE": "uk",
          },
          params: {
            limit: 500,
            ...(lastId && { last_id: lastId }),
          },
        }
      );

      const { products, last_id } = response.data;
      
      if (products?.length) {
        const filtered = filter ? products.filter(filter) : products;
        allProducts = [...allProducts, ...filtered];
        
        if (last_id && last_id !== lastId) {
          lastId = last_id;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return allProducts;
  } catch (error) {
    console.error("Помилка при завантаженні:", error);
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
      cache.allProducts = await fetchProducts();
      cache.categorizedProducts = categorizeProducts(cache.allProducts);
      cache.lastUpdated = now;
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
      fromCache: true
    });
  } catch (error) {
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
      }
    );
    res.json(response.data);
  } catch (error) {
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
      cache.allProducts = await fetchProducts();
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
      fromCache: true
    });
  } catch (error) {
    console.error(`Помилка при отриманні категорії ${category}:`, error);
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
    cache.allProducts = await fetchProducts();
    cache.categorizedProducts = categorizeProducts(cache.allProducts);
    cache.lastUpdated = Date.now();
    
    res.json({
      success: true,
      count: cache.allProducts.length,
      categories: Object.entries(cache.categorizedProducts).map(([key, products]) => ({
        category: key,
        count: products.length
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: "Не вдалося оновити кеш",
      details: error.message
    });
  }
};