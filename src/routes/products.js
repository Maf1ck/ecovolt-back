import express from "express";
import { 
  getProducts,
  getProductById,
  getProductsByCategory,
  testAPI,
  refreshCache,
  clearCache,
  getProductsStats
} from "../controllers/productsController.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { apiLimiter, strictLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// КРИТИЧНО: Порядок маршрутів має значення!
// Специфічні маршрути ЗАВЖДИ повинні бути ПЕРЕД параметризованими

// 1. Специфічні маршрути (без параметрів)
router.get("/test", apiLimiter, asyncHandler(testAPI));
router.get("/stats", apiLimiter, asyncHandler(getProductsStats));

// 2. Адміністративні маршрути
router.post("/refresh-cache", strictLimiter, asyncHandler(refreshCache));
router.delete("/cache", strictLimiter, asyncHandler(clearCache));

// 3. Маршрути для категорій (з префіксом для уникнення конфліктів)
router.get("/category/:category", apiLimiter, asyncHandler(getProductsByCategory));

// 4. Товар за ID (з regex для перевірки що це число)
router.get("/product/:id(\\d+)", apiLimiter, asyncHandler(getProductById));

// 5. Головний маршрут для всіх товарів (БЕЗ СЛЕШУ в кінці)
router.get("", apiLimiter, asyncHandler(getProducts));

export default router;