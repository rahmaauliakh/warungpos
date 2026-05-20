const express = require("express");
const konsumenController = require("../controllers/konsumenController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/konsumen", requireRole("konsumen"), konsumenController.index);
router.get("/konsumen/profile", requireRole("konsumen"), konsumenController.profile);
router.get("/konsumen/history", requireRole("konsumen"), konsumenController.history);
router.get("/konsumen/waiting/:invoice", requireRole("konsumen"), konsumenController.waitingApproval);
router.get("/konsumen/receipt/:invoice/download", requireRole("konsumen"), konsumenController.downloadReceipt);
router.get("/konsumen/receipt/:invoice", requireRole("konsumen"), konsumenController.receipt);
router.post("/konsumen/cart/:id/add", requireRole("konsumen"), konsumenController.addToCart);
router.post("/konsumen/cart/:id/qty", requireRole("konsumen"), konsumenController.updateCartQuantity);
router.post("/konsumen/cart/:id/remove", requireRole("konsumen"), konsumenController.removeFromCart);
router.post("/konsumen/checkout", requireRole("konsumen"), konsumenController.checkout);
router.post("/konsumen/profile", requireRole("konsumen"), konsumenController.updateProfile);
router.post("/konsumen/profile/password", requireRole("konsumen"), konsumenController.updatePassword);

module.exports = router;
