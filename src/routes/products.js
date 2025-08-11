import express from "express";
import { 
  getProducts,
  getProductById,
  refreshCache,
  getSolarPanels 
} from "../controllers/productsController.js";

const router = express.Router();

// ВАЖЛИВО: Специфічні маршрути повинні бути ПЕРЕД параметризованими маршрутами
// Інакше /:id перехопить запити, призначені для /solar-panels

// Спочатку специфічні маршрути
router.get("/solar-panels", getSolarPanels);
router.post("/refresh-cache", refreshCache);

// Параметризовані маршрути в кінці
router.get("/", getProducts);
router.get("/:id", getProductById);

export default router;