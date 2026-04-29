const express = require("express");
const operatorController = require("../controllers/operatorController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/operator", requireRole("operator"), operatorController.index);
router.post("/operator/products", requireRole("operator"), operatorController.createProduct);
router.post("/operator/products/:id/update", requireRole("operator"), operatorController.updateProduct);
router.post("/operator/products/:id/stock", requireRole("operator"), operatorController.updateStock);
router.post("/operator/products/:id/delete", requireRole("operator"), operatorController.deleteProduct);

module.exports = router;
