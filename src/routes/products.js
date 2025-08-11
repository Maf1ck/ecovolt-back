import express from "express";
import { 
  getProducts,
  getProductById,
  refreshCache
} from "../controllers/productsController.js";

const router = express.Router();

// Основні маршрути
router.get("/", getProducts);
router.get("/:id", getProductById);

// Додаткові маршрути для управління кешем
router.post("/refresh-cache", refreshCache);

export default router;