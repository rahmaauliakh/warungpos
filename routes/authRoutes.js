const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const ROLE_REDIRECTS = {
  manager: "/manager",
  operator: "/operator",
  kasir: "/kasir",
  konsumen: "/konsumen"
};

router.get("/", (req, res) => {
  if (!req.session.user?.role) {
    return res.redirect("/login");
  }

  return res.redirect(ROLE_REDIRECTS[req.session.user.role] || "/login");
});

router.get("/login", authController.showLogin);
router.get("/register", authController.showRegister);
router.post("/login", [
  body("email").trim().isEmail().withMessage("Format email tidak valid.").normalizeEmail(),
  body("password").trim().notEmpty().withMessage("Password wajib diisi.")
], authController.login);
router.post("/register", [
  body("nama").trim().notEmpty().withMessage("Nama wajib diisi.").isLength({ min: 3 }).withMessage("Nama minimal 3 karakter."),
  body("email").trim().isEmail().withMessage("Format email tidak valid.").normalizeEmail(),
  body("password").trim().isLength({ min: 6 }).withMessage("Password minimal 6 karakter."),
  body("confirmPassword").trim().notEmpty().withMessage("Konfirmasi password wajib diisi.")
], authController.register);
router.post("/logout", requireAuth, authController.logout);

module.exports = router;
