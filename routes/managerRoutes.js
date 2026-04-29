const express = require("express");
const managerController = require("../controllers/managerController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/manager", requireRole("manager"), managerController.index);
router.get("/manager/export/csv", requireRole("manager"), managerController.exportCsv);
router.get("/manager/export/pdf", requireRole("manager"), managerController.exportPdf);

module.exports = router;
