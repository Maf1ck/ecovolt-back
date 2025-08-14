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

// ВАЖЛИВО: Специфічні маршрути повинні бути ПЕРЕД параметризованими
router.get("/test", apiLimiter, asyncHandler(testAPI));
router.get("/stats", apiLimiter, asyncHandler(getProductsStats));

// Адміністративні маршрути (з строгим rate limiting)
router.post("/refresh-cache", strictLimiter, asyncHandler(refreshCache));
router.delete("/cache", strictLimiter, asyncHandler(clearCache));

// Маршрути для категорій (з базовим rate limiting)
router.get("/:category", apiLimiter, asyncHandler(getProductsByCategory));

// Основні маршрути (параметризовані в кінці)
router.get("/", apiLimiter, asyncHandler(getProducts));
router.get("/:id", apiLimiter, asyncHandler(getProductById));

export default router;