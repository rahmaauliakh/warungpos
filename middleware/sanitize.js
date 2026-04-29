const sanitizeValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(/\0/g, "")
    .replace(/[<>]/g, "")
    .trim();
};

const sanitizeObject = (input) => {
  if (Array.isArray(input)) {
    return input.map(sanitizeObject);
  }

  if (!input || typeof input !== "object") {
    return sanitizeValue(input);
  }

  Object.keys(input).forEach((key) => {
    input[key] = sanitizeObject(input[key]);
  });

  return input;
};

module.exports = (req, res, next) => {
  if (req.body) {
    sanitizeObject(req.body);
  }

  if (req.query) {
    sanitizeObject(req.query);
  }

  if (req.params) {
    sanitizeObject(req.params);
  }

  next();
};
