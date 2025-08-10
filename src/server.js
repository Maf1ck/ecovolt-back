import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import productsRouter from "./routes/products.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/products", productsRouter);

app.listen(config.port, () => {
  console.log(`✅ Server running on port ${config.port}`);
});
