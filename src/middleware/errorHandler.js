import logger from "../utils/logger.js";

/**
 * Middleware для централізованої обробки помилок
 */
export const errorHandler = (err, req, res, next) => {
  logger.error(`Помилка ${req.method} ${req.path}:`, err);

  // Помилка валідації
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: "Помилка валідації",
      details: err.message
    });
  }

  // Помилка з'єднання з базою даних
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return res.status(503).json({
      success: false,
      error: "Помилка бази даних",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Помилка JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: "Невірний токен авторизації"
    });
  }

  // Помилка timeout
  if (err.code === 'ECONNABORTED') {
    return res.status(408).json({
      success: false,
      error: "Час очікування вичерпано"
    });
  }

  // Помилка з'єднання з зовнішнім API
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      error: "Зовнішній сервіс недоступний",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Помилка обмеження швидкості
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      error: "Забагато запитів. Спробуйте пізніше"
    });
  }

  // Загальна помилка сервера
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Внутрішня помилка сервера",
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

/**
 * Middleware для обробки неіснуючих маршрутів
 */
export const notFoundHandler = (req, res) => {
  logger.warn(`404: ${req.method} ${req.path} не знайдено`);
  
  res.status(404).json({
    success: false,
    error: "Маршрут не знайдено",
    path: req.path
  });
};

/**
 * Wrapper для async функцій щоб автоматично передавати помилки в errorHandler
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};