import express from "express";
import { 
  getSolarPanels,
  getSolarPanelById,
  searchSolarPanels 
} from "../controllers/productsController.js";

const router = express.Router();

// Получение списка солнечных панелей
router.get("/solar-panels", getSolarPanels);

// Получение конкретной панели по ID
router.get("/solar-panels/:id", getSolarPanelById);

// Поиск панелей по названию
router.get("/solar-panels/search/:query", searchSolarPanels);

router.get("/", getProducts);

export default router;