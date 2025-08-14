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

// Варіант 1: З точними маршрутами
router.get("/test", apiLimiter, asyncHandler(testAPI));
router.get("/stats", apiLimiter, asyncHandler(getProductsStats));
router.post("/refresh-cache", strictLimiter, asyncHandler(refreshCache));
router.delete("/cache", strictLimiter, asyncHandler(clearCache));
router.get("/category/:category", apiLimiter, asyncHandler(getProductsByCategory));

// Головний маршрут БЕЗ слешу
router.get("", apiLimiter, asyncHandler(getProducts));

// ID маршрут з regex (тільки цифри)
router.get("/:id(\\d+)", apiLimiter, asyncHandler(getProductById));

export default router;