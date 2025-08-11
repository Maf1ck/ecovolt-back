import axios from "axios";
import { config } from "../config/env.js";

// Кеш для товарів
const cache = {
  allProducts: null,
  solarPanels: null,
  lastUpdated: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин

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
            limit: 100,
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

// Отримання товарів з кешуванням
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 8, solarPanels } = req.query;
    const shouldFilter = solarPanels === 'true';
    
    // Перевірка кешу
    const now = Date.now();
    if (!cache.allProducts || !cache.lastUpdated || 
        (now - cache.lastUpdated) > CACHE_DURATION) {
      cache.allProducts = await fetchProducts();
      cache.solarPanels = cache.allProducts.filter(
        p => p.group?.id === 97668952
      );
      cache.lastUpdated = now;
    }

    const products = shouldFilter ? cache.solarPanels : cache.allProducts;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    res.json({
      products: products.slice(start, end),
      pagination: {
        page: pageNum,
        totalPages: Math.ceil(products.length / limitNum),
        totalItems: products.length,
        hasMore: end < products.length
      }
    });
  } catch (error) {
    res.status(500).json({
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
let solarPanelsCache = {
  data: [],
  lastUpdated: null,
  lastId: null
};
// Оновлення кешу
export const getSolarPanels = async (req, res) => {
  try {
    const { lastId } = req.query;
    
    // Перевіряємо чи можна використати кеш
    const shouldUseCache = !lastId && 
                         solarPanelsCache.lastUpdated && 
                         (Date.now() - solarPanelsCache.lastUpdated) < CACHE_DURATION;

    if (shouldUseCache) {
      console.log("Returning cached solar panels");
      return res.json({
        success: true,
        products: solarPanelsCache.data,
        last_id: solarPanelsCache.lastId,
        count: solarPanelsCache.data.length
      });
    }

    console.log("Fetching fresh solar panels data...");
    const response = await axios.get(
      "https://my.prom.ua/api/v1/products/list",
      {
        headers: {
          Authorization: `Bearer ${config.PROM_API_TOKEN}`,
          "X-LANGUAGE": "uk",
        },
        params: {
          limit: 100,
          group_id: 97668952,
          ...(lastId && { last_id: lastId }),
        },
        timeout: 10000
      }
    );

    const products = response.data.products || [];
    const newLastId = response.data.last_id;

    // Оновлюємо кеш тільки для першого запиту (без lastId)
    if (!lastId) {
      solarPanelsCache = {
        data: products,
        lastUpdated: Date.now(),
        lastId: newLastId
      };
    }

    res.json({
      success: true,
      products,
      last_id: newLastId,
      count: products.length
    });

  } catch (error) {
    console.error("API Error:", {
      message: error.message,
      response: error.response?.data,
      config: error.config
    });

    // Спроба повернути кешовані дані у разі помилки
    if (solarPanelsCache.data.length > 0) {
      console.warn("Returning cached data due to API error");
      return res.json({
        success: true,
        products: solarPanelsCache.data,
        last_id: solarPanelsCache.lastId,
        count: solarPanelsCache.data.length,
        fromCache: true
      });
    }

    res.status(500).json({
      success: false,
      error: "Помилка сервера",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};