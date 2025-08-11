import axios from "axios";
import { config } from "../config/env.js";

// Кеш для збереження всіх товарів
let cachedProducts = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин

// Функція для отримання всіх товарів з API
const fetchAllProducts = async () => {
  let allProducts = [];
  let lastId = null;
  let hasMore = true;
  
  console.log("🔄 Починаємо завантаження всіх товарів...");

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
            limit: 100, // Збільшуємо ліміт для швидшого завантаження
            ...(lastId ? { last_id: lastId } : {}),
          },
        }
      );

      const { products, last_id } = response.data;
      
      if (products && products.length > 0) {
        allProducts = allProducts.concat(products);
        console.log(`📦 Завантажено ${allProducts.length} товарів...`);
        
        // Якщо є last_id, продовжуємо завантаження
        if (last_id && last_id !== lastId) {
          lastId = last_id;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      // Додаємо невелику затримку між запитами
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Завантажено всього товарів: ${allProducts.length}`);
    return allProducts;
  } catch (error) {
    console.error("❌ Помилка при завантаженні товарів:", error.message);
    throw error;
  }
};

// Основна функція для отримання товарів з пагінацією
export const getProducts = async (req, res) => {
  const { page = 1, limit = 8 } = req.query;
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);

  try {
    // Перевіряємо кеш
    const now = Date.now();
    const isCacheValid = cachedProducts && 
                        cacheTimestamp && 
                        (now - cacheTimestamp) < CACHE_DURATION;

    if (!isCacheValid) {
      console.log("🔄 Оновлюємо кеш товарів...");
      cachedProducts = await fetchAllProducts();
      cacheTimestamp = now;
    } else {
      console.log("✅ Використовуємо кешовані товари");
    }

    // Розрахунок пагінації
    const startIndex = (pageNumber - 1) * limitNumber;
    const endIndex = startIndex + limitNumber;
    const paginatedProducts = cachedProducts.slice(startIndex, endIndex);

    // Додаткова інформація про пагінацію
    const totalProducts = cachedProducts.length;
    const totalPages = Math.ceil(totalProducts / limitNumber);
    const hasMore = pageNumber < totalPages;

    res.json({
      products: paginatedProducts,
      pagination: {
        current_page: pageNumber,
        total_pages: totalPages,
        total_products: totalProducts,
        products_per_page: limitNumber,
        has_more: hasMore,
        showing: `${startIndex + 1}-${Math.min(endIndex, totalProducts)} з ${totalProducts}`
      }
    });

  } catch (error) {
    console.error("❌ Помилка при отриманні товарів:", error.message);
    res.status(500).json({ 
      error: "Не вдалося завантажити товари",
      message: error.message 
    });
  }
};

// Функція для примусового оновлення кешу
export const refreshProducts = async (req, res) => {
  try {
    console.log("🔄 Примусове оновлення кешу товарів...");
    cachedProducts = await fetchAllProducts();
    cacheTimestamp = Date.now();
    
    res.json({
      success: true,
      message: "Кеш товарів успішно оновлено",
      total_products: cachedProducts.length
    });
  } catch (error) {
    console.error("❌ Помилка при оновленні кешу:", error.message);
    res.status(500).json({ 
      error: "Не вдалося оновити кеш товарів",
      message: error.message 
    });
  }
};

// Функція для отримання інформації про кеш
export const getCacheInfo = async (req, res) => {
  const now = Date.now();
  const cacheAge = cacheTimestamp ? now - cacheTimestamp : null;
  const isCacheValid = cachedProducts && 
                      cacheTimestamp && 
                      cacheAge < CACHE_DURATION;

  res.json({
    cache_exists: !!cachedProducts,
    cache_valid: isCacheValid,
    cache_age_ms: cacheAge,
    cache_age_minutes: cacheAge ? Math.floor(cacheAge / 60000) : null,
    total_cached_products: cachedProducts ? cachedProducts.length : 0,
    cache_expires_in_ms: isCacheValid ? CACHE_DURATION - cacheAge : 0
  });
};

export const getProductsByGroup = async (req, res) => {
  const { page = 1, limit = 8, groupId } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  try {
    // Отримуємо всі товари (з кешу або API)
    const allProducts = await fetchAllProducts();
    
    // Фільтруємо по group_id
    const filteredProducts = allProducts.filter(
      product => product.group?.id.toString() === groupId
    );

    // Пагінація
    const startIdx = (pageNum - 1) * limitNum;
    const paginatedProducts = filteredProducts.slice(startIdx, startIdx + limitNum);

    res.json({
      products: paginatedProducts,
      pagination: {
        current_page: pageNum,
        total_pages: Math.ceil(filteredProducts.length / limitNum),
        total_products: filteredProducts.length,
        has_more: (startIdx + limitNum) < filteredProducts.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};