import axios from "axios";
import { config } from "../config/env.js";

export const getProducts = async (req, res) => {
  const { limit = 10, last_id } = req.query;

  try {
    const response = await axios.get(
      "https://my.prom.ua/api/v1/products/list",
      {
        headers: {
          Authorization: `Bearer ${config.promApiToken}`,
          "X-LANGUAGE": "uk",
        },
        params: {
          limit,
          ...(last_id ? { last_id } : {}),
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error fetching products:", error.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};