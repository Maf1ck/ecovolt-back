import axios from "axios";
import { config } from "../config/env.js";

// Кеш для товаров
let cachedProducts = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

// Получение всех товаров
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 8 } = req.query;
    
    // Проверка кеша
    if (Date.now() - lastFetchTime > CACHE_DURATION) {
      const response = await axios.get(
        "https://my.prom.ua/api/v1/products/list",
        {
          headers: {
            Authorization: `Bearer ${config.PROM_API_TOKEN}`,
            "X-LANGUAGE": "uk",
          },
          params: { limit: 100 }
        }
      );
      cachedProducts = response.data.products || [];
      lastFetchTime = Date.now();
    }

    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedProducts = cachedProducts.slice(startIndex, endIndex);

    res.json({
      products: paginatedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(cachedProducts.length / limit),
        totalProducts: cachedProducts.length,
        showing: `${startIndex + 1}-${Math.min(endIndex, cachedProducts.length)}`
      }
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// Получение солнечных панелей
export const getSolarPanels = async (req, res) => {
  try {
    const { lastId } = req.query;
    const response = await axios.get(
      "https://my.prom.ua/api/v1/products/list",
      {
        headers: {
          Authorization: `Bearer ${config.PROM_API_TOKEN}`,
          "X-LANGUAGE": "uk",
        },
        params: {
          limit: 100,
          ...(lastId && { last_id: lastId }),
        },
      }
    );

    const solarPanels = response.data.products?.filter(
      product => product.group?.id === 97668952
    ) || [];

    res.json({
      products: solarPanels,
      last_id: response.data.last_id,
      count: solarPanels.length,
    });
  } catch (error) {
    console.error("Error fetching solar panels:", error);
    res.status(500).json({ error: "Failed to fetch solar panels" });
  }
};

// Получение товара по ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(
      `https://my.prom.ua/api/v1/products/${id}`,
      {
        headers: {
          Authorization: `Bearer ${config.PROM_API_TOKEN}`,
          "X-LANGUAGE": "uk",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
};