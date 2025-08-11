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

// Отримання сонячних панелей
export const getSolarPanels = async (req, res) => {
  try {
    const { lastId } = req.query;
    
    const response = await axios.get(
      "https://my.prom.ua/api/v1/products/list",
      {
        headers: {
          Authorization: `Bearer ${config.promApiToken}`,
          "X-LANGUAGE": "uk",
        },
        params: {
          limit: 100,
          group_id: 97668952,
          ...(lastId && { last_id: lastId }),
        },
      }
    );

    res.json({
      products: response.data.products || [],
      last_id: response.data.last_id,
      count: response.data.products?.length || 0
    });
  } catch (error) {
    res.status(500).json({
      error: "Помилка при отриманні сонячних панелей",
      details: error.message
    });
  }
};

// Функція для оновлення кешу
export const refreshCache = async (req, res) => {
  try {
    cache.allProducts = await fetchProducts();
    cache.solarPanels = cache.allProducts.filter(
      p => p.group?.id === 97668952
    );
    cache.lastUpdated = Date.now();
    
    res.json({
      success: true,
      count: cache.allProducts.length,
      solarPanelsCount: cache.solarPanels.length
    });
  } catch (error) {
    res.status(500).json({
      error: "Не вдалося оновити кеш",
      details: error.message
    });
  }
};