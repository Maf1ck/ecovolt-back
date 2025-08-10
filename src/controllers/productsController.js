import axios from "axios";
import { config } from "../config/env.js";

export const getProducts = async (req, res) => {
  try {
    const response = await axios.get(
      "https://my.prom.ua/api/v1/products/list",
      {
        headers: {
          Authorization: `Bearer ${config.promApiToken}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error fetching products:", error.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};