import express from "express";
import { 
  getProducts,
  getSolarPanels,
  getProductById
} from "../controllers/productsController.js";

const router = express.Router();

// Основной маршрут для товаров
router.get("/", getProducts);

// Маршрут для солнечных панелей
router.get("/solar-panels", getSolarPanels);

// Маршрут для получения товара по ID
router.get("/:id", getProductById);

export default router;