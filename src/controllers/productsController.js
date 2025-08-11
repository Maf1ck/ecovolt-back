import axios from "axios";
import { config } from "../config/env.js";

// Кеш для всіх товарів
let cachedProducts = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин

// Кеш для сонячних панелей
let cachedSolarPanels = null;
let solarPanelsCacheTimestamp = null;

// Загальна функція для отримання товарів з API
const fetchProductsFromAPI = async (filterFn = null) => {
  let allProducts = [];
  let lastId = null;
  let hasMore = true;
  
  console.log("🔄 Починаємо завантаження товарів...");

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
            ...(lastId ? { last_id: lastId } : {}),
          },
        }
      );

      const { products, last_id } = response.data;
      
      if (products?.length) {
        // Застосовуємо фільтр, якщо він є
        const filteredProducts = filterFn ? products.filter(filterFn) : products;
        allProducts = [...allProducts, ...filteredProducts];
        
        console.log(`📦 Завантажено ${allProducts.length} товарів...`);
        
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

    console.log(`✅ Успішно завантажено ${allProducts.length} товарів`);
    return allProducts;
  } catch (error) {
    console.error("❌ Помилка при завантаженні:", error.message);
    throw error;
  }
};

// Отримання всіх товарів
const getAllProducts = async () => {
  const now = Date.now();
  if (!cachedProducts || now - cacheTimestamp > CACHE_DURATION) {
    cachedProducts = await fetchProductsFromAPI();
    cacheTimestamp = now;
  }
  return cachedProducts;
};

// Отримання сонячних панелей
const getSolarPanels = async () => {
  const now = Date.now();
  if (!cachedSolarPanels || now - solarPanelsCacheTimestamp > CACHE_DURATION) {
    cachedSolarPanels = await fetchProductsFromAPI(
      product => product.group?.id === 97668952
    );
    solarPanelsCacheTimestamp = now;
  }
  return cachedSolarPanels;
};

// Контролер для отримання товарів з пагінацією
export const getProducts = async (req, res) => {
  const { page = 1, limit = 8, solarPanels = false } = req.query;
  
  try {
    const products = solarPanels === 'true' 
      ? await getSolarPanels() 
      : await getAllProducts();

    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.max(1, parseInt(limit, 10));
    
    const startIndex = (pageNumber - 1) * limitNumber;
    const endIndex = startIndex + limitNumber;
    const paginatedProducts = products.slice(startIndex, endIndex);

    res.json({
      products: paginatedProducts,
      pagination: {
        current_page: pageNumber,
        total_pages: Math.ceil(products.length / limitNumber),
        total_products: products.length,
        products_per_page: limitNumber,
        has_more: endIndex < products.length,
        showing: `${startIndex + 1}-${Math.min(endIndex, products.length)} з ${products.length}`
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Не вдалося завантажити товари",
      message: error.message 
    });
  }
};

// Оновлення кешу
export const refreshCache = async (req, res) => {
  try {
    const [products, solarPanels] = await Promise.all([
      fetchProductsFromAPI(),
      fetchProductsFromAPI(product => product.group?.id === 97668952)
    ]);
    
    cachedProducts = products;
    cachedSolarPanels = solarPanels;
    cacheTimestamp = solarPanelsCacheTimestamp = Date.now();
    
    res.json({
      success: true,
      total_products: products.length,
      total_solar_panels: solarPanels.length
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Не вдалося оновити кеш",
      message: error.message 
    });
  }
};

// Інформація про кеш
export const getCacheInfo = (req, res) => {
  const now = Date.now();
  
  res.json({
    all_products: {
      cached: !!cachedProducts,
      age: cacheTimestamp ? now - cacheTimestamp : null,
      count: cachedProducts?.length || 0
    },
    solar_panels: {
      cached: !!cachedSolarPanels,
      age: solarPanelsCacheTimestamp ? now - solarPanelsCacheTimestamp : null,
      count: cachedSolarPanels?.length || 0
    },
    cache_duration: CACHE_DURATION
  });
};