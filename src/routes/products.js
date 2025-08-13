import express from "express";
import { 
  getProducts,
  getProductById,
  getProductsByCategory,
  testAPI
} from "../controllers/productsController.js";

const router = express.Router();

// ВАЖЛИВО: Специфічні маршрути повинні бути ПЕРЕД параметризованими маршрутами
// Інакше /:id перехопить запити, призначені для /category/:category або /test

// Тестовий маршрут для діагностики API
router.get("/test", testAPI);

// Маршрут для категорій
router.get("/category/:category", getProductsByCategory);

// Основні маршрути (параметризовані в кінці)
router.get("/", getProducts);
router.get("/:id", getProductById);

export default router;