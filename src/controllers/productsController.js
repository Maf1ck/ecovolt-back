import axios from "axios";
import { config } from "../config/env.js";

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

// Основна функція для завантаження всіх товарів
const fetchAllProducts = async () => {
  let allProducts = [];
  let lastId = null;
  let hasMore = true;
  let requestCount = 0;
  const requestLimit = 100; // Максимум для Prom.ua

  console.log("🚀 Починаємо завантаження всіх товарів");

  try {
    while (hasMore) {
      requestCount++;
      console.log(`📞 Запит #${requestCount}${lastId ? `, last_id: ${lastId}` : ''}`);

      const params = {
        limit: requestLimit,
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
          timeout: 30000,
        }
      );

      const { products, last_id } = response.data;
      console.log(`📦 Отримано товарів: ${products?.length || 0}`);

      if (products?.length > 0) {
        allProducts.push(...products);
        console.log(`✅ Всього товарів: ${allProducts.length}`);

        if (!last_id || last_id === lastId) {
          console.log("✅ Досягнуто кінця списку товарів");
          hasMore = false;
        } else {
          lastId = last_id;
        }
      } else {
        console.log("❌ Порожня відповідь, зупиняємось");
        hasMore = false;
      }

      // Пауза між запитами
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`🏁 Завантаження завершено. Всього товарів: ${allProducts.length}`);
    return allProducts;

  } catch (error) {
    console.error("❌ Помилка при завантаженні:", error.message);
    throw error;
  }
};

// Функція для завантаження товарів за категорією
const fetchProductsByCategory = async (categoryKey) => {
  const groupId = CATEGORY_GROUPS[categoryKey];
  
  if (!groupId) {
    console.log(`⚠️ Категорія ${categoryKey} не має group_id, завантажуємо всі товари`);
    const allProducts = await fetchAllProducts();
    return allProducts.filter(product => {
      // Можна додати додаткову логіку фільтрації тут
      return true;
    });
  }

  let categoryProducts = [];
  let lastId = null;
  let hasMore = true;
  let requestCount = 0;
  const requestLimit = 100;

  console.log(`🚀 Завантажуємо товари категорії ${categoryKey} (group_id: ${groupId})`);

  try {
    while (hasMore) {
      requestCount++;
      console.log(`📞 Запит #${requestCount} для категорії ${categoryKey}`);

      const params = {
        limit: requestLimit,
        group_id: groupId,
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
          timeout: 30000,
        }
      );

      const { products, last_id } = response.data;
      console.log(`📦 Отримано товарів для ${categoryKey}: ${products?.length || 0}`);

      if (products?.length > 0) {
        categoryProducts.push(...products);
        console.log(`✅ Всього товарів в категорії ${categoryKey}: ${categoryProducts.length}`);

        if (!last_id || last_id === lastId) {
          console.log(`✅ Досягнуто кінця категорії ${categoryKey}`);
          hasMore = false;
        } else {
          lastId = last_id;
        }
      } else {
        console.log(`❌ Порожня відповідь для категорії ${categoryKey}`);
        hasMore = false;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`🏁 Завантаження категорії ${categoryKey} завершено. Товарів: ${categoryProducts.length}`);
    return categoryProducts;

  } catch (error) {
    console.error(`❌ Помилка завантаження категорії ${categoryKey}:`, error.message);
    throw error;
  }
};

// Функція для категоризації товарів (якщо завантажуємо всі)
const categorizeAllProducts = (products) => {
  const categorized = {};

  Object.keys(CATEGORY_GROUPS).forEach(category => {
    categorized[category] = [];
  });

  products.forEach(product => {
    const groupId = product.group?.id;
    const category = Object.entries(CATEGORY_GROUPS).find(
      ([key, id]) => id === groupId
    );
    if (category) {
      categorized[category[0]].push(product);
    }
  });

  return categorized;
};

// Отримання всіх товарів або товарів за категорією
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 8, category } = req.query;

    console.log(`🔍 Запит товарів: category=${category || 'всі'}, page=${page}, limit=${limit}`);

    let products;

    if (category && CATEGORY_GROUPS.hasOwnProperty(category)) {
      // Завантажуємо конкретну категорію
      products = await fetchProductsByCategory(category);
    } else {
      // Завантажуємо всі товари
      const allProducts = await fetchAllProducts();
      
      if (category && CATEGORY_GROUPS.hasOwnProperty(category)) {
        // Фільтруємо з усіх товарів
        const categorized = categorizeAllProducts(allProducts);
        products = categorized[category] || [];
      } else {
        products = allProducts;
      }
    }

    // Пагінація
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    console.log(`📊 Всього товарів: ${products.length}, показуємо: ${start + 1}-${Math.min(end, products.length)}`);

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
      category: category || null,
      totalProducts: products.length
    });

  } catch (error) {
    console.error("❌ Помилка в getProducts:", error);
    res.status(500).json({
      success: false,
      error: "Помилка сервера при завантаженні товарів",
      details: error.message
    });
  }
};

// Отримання товару по ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Завантажуємо товар з ID: ${id}`);

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

    res.json({
      success: true,
      product: response.data
    });

  } catch (error) {
    console.error(`❌ Помилка отримання товару ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: "Не вдалося отримати товар",
      details: error.message
    });
  }
};

// Отримання товарів за категорією (окремий endpoint)
export const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 8 } = req.query;

    console.log(`🔍 Запит товарів категорії: ${category}`);

    if (!CATEGORY_GROUPS.hasOwnProperty(category)) {
      return res.status(400).json({
        success: false,
        error: "Невідома категорія",
        availableCategories: Object.keys(CATEGORY_GROUPS)
      });
    }

    const products = await fetchProductsByCategory(category);

    // Пагінація
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    console.log(`📊 Товарів в категорії ${category}: ${products.length}`);

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
      totalProducts: products.length
    });

  } catch (error) {
    console.error(`❌ Помилка при отриманні категорії ${category}:`, error);
    res.status(500).json({
      success: false,
      error: `Помилка при завантаженні категорії ${category}`,
      details: error.message
    });
  }
};

// Функція для тестування API (корисно для діагностики)
export const testAPI = async (req, res) => {
  try {
    console.log("🔍 Тестування Prom.ua API");

    // Тест базового запиту
    const testResponse = await axios.get(
      "https://my.prom.ua/api/v1/products/list",
      {
        headers: {
          Authorization: `Bearer ${config.promApiToken}`,
          "X-LANGUAGE": "uk",
        },
        params: { limit: 10 },
        timeout: 15000,
      }
    );

    const { products, last_id } = testResponse.data;

    res.json({
      success: true,
      test: {
        productsReceived: products?.length || 0,
        hasLastId: !!last_id,
        firstProduct: products?.[0] ? {
          id: products[0].id,
          name: products[0].name,
          group_id: products[0].group?.id
        } : null
      },
      categories: CATEGORY_GROUPS
    });

  } catch (error) {
    console.error("❌ Помилка тестування API:", error);
    res.status(500).json({
      success: false,
      error: "Помилка тестування API",
      details: error.message
    });
  }
};