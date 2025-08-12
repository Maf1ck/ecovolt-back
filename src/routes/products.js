import express from "express";
import { 
  getProducts,
  getProductById,
  refreshCache,
  getProductsByCategory,
  getCacheStats
} from "../controllers/productsController.js";

const router = express.Router();

// ВАЖЛИВО: Специфічні маршрути повинні бути ПЕРЕД параметризованими маршрутами
// Інакше /:id перехопить запити, призначені для /category/:category

// Спочатку специфічні маршрути
router.post("/refresh-cache", refreshCache);
router.get("/category/:category", getProductsByCategory); // Новий маршрут для категорій
router.get("/cache-stats", getCacheStats); // Новий маршрут для статистики кешу

// Параметризовані маршрути в кінці
router.get("/", getProducts);
router.get("/:id", getProductById);

export default router;