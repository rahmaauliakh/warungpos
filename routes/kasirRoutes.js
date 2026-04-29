const express = require("express");
const kasirController = require("../controllers/kasirController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/kasir", requireRole("kasir"), kasirController.index);
router.get("/kasir/receipt/:id", requireRole("kasir"), kasirController.receipt);
router.post("/kasir/direct-sale", requireRole("kasir"), kasirController.createDirectSale);
router.post("/kasir/approve/:id", requireRole("kasir"), kasirController.approveTransaction);
router.post("/kasir/reject/:id", requireRole("kasir"), kasirController.rejectTransaction);
router.post("/kasir/pay/:id", requireRole("kasir"), kasirController.payTransaction);
router.post("/pos/pembayaran", requireRole("kasir"), kasirController.smartBankPayment);

module.exports = router;
