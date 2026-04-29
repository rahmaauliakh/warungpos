const TransactionModel = require("../models/transactionModel");
const ProductModel = require("../models/productModel");

const ROLE_REDIRECTS = {
  manager: "/manager",
  operator: "/operator",
  kasir: "/kasir",
  konsumen: "/konsumen"
};

const PAYMENT_METHODS = ["cash", "qris", "transfer", "smartbank"];
const FEE_RATE = 0.01;

const setFlash = (req, payload) => {
  req.session.flash = payload;
};

const formatCurrency = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(value);

const formatDateTime = (value) => new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}).format(new Date(value));

const calculateFee = (subtotal) => Math.round(Number(subtotal || 0) * FEE_RATE);

const buildPagination = ({ page, limit, total }) => {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);

  return {
    currentPage,
    totalPages,
    totalItems: total,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    prevPage: Math.max(currentPage - 1, 1),
    nextPage: Math.min(currentPage + 1, totalPages)
  };
};

const paginateItems = (items, page, limit) => {
  const pagination = buildPagination({ page, limit, total: items.length });
  const start = (pagination.currentPage - 1) * limit;

  return {
    rows: items.slice(start, start + limit),
    pagination
  };
};

const normalizeTransaction = (transaction) => ({
  ...transaction,
  customer_name: transaction.customer_name || transaction.customer_email || "Konsumen",
  grand_total_formatted: formatCurrency(transaction.grand_total),
  subtotal_formatted: formatCurrency(transaction.subtotal),
  fee_formatted: formatCurrency(transaction.fee),
  created_at_formatted: formatDateTime(transaction.created_at)
});

const normalizeItem = (item) => ({
  ...item,
  price_formatted: formatCurrency(item.price),
  subtotal_formatted: formatCurrency(item.subtotal)
});

const generateInvoice = () => {
  const timestamp = Date.now();
  const randomPart = Math.floor(1000 + (Math.random() * 9000));
  return `KSR${timestamp}${randomPart}`;
};

const normalizeProduct = (product) => ({
  ...product,
  harga_number: Number(product.harga || 0),
  harga_formatted: formatCurrency(product.harga)
});

const getLocalDateKey = (value = new Date()) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildDashboardStats = (transactions) => {
  const todayKey = getLocalDateKey();
  const todayPaidTransactions = transactions.filter((transaction) => {
    return transaction.status === "paid" && getLocalDateKey(transaction.created_at) === todayKey;
  });

  return [
    {
      label: "Pending",
      value: transactions.filter((transaction) => transaction.status === "pending").length,
      description: "Menunggu approve"
    },
    {
      label: "Approved",
      value: transactions.filter((transaction) => transaction.status === "approved").length,
      description: "Siap dibayar"
    },
    {
      label: "Paid Hari Ini",
      value: todayPaidTransactions.length,
      description: "Transaksi selesai"
    },
    {
      label: "Omzet Hari Ini",
      value: formatCurrency(todayPaidTransactions.reduce((sum, transaction) => sum + Number(transaction.grand_total || 0), 0)),
      description: "Total paid"
    }
  ];
};

const buildStatusChart = (transactions) => {
  const labels = ["pending", "approved", "paid", "rejected"];

  return {
    labels: ["Pending", "Approved", "Paid", "Rejected"],
    values: labels.map((status) => transactions.filter((transaction) => transaction.status === status).length)
  };
};

exports.requireKasir = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  if (req.session.user.role !== "kasir") {
    return res.redirect(ROLE_REDIRECTS[req.session.user.role] || "/login");
  }

  return next();
};

exports.index = async (req, res) => {
  const productPageNumber = Number(req.query.productPage) || 1;
  const transactionPageNumber = Number(req.query.transactionPage) || 1;
  const productLimit = 6;
  const transactionLimit = 8;

  try {
    const [transactions, productPage] = await Promise.all([
      TransactionModel.getDashboardTransactions(),
      ProductModel.getPaginated({ page: productPageNumber, limit: productLimit })
    ]);
    const detailedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const items = await TransactionModel.getItemsByTransactionId(transaction.id);
        return {
          ...normalizeTransaction(transaction),
          items: items.map(normalizeItem)
        };
      })
    );

    const productPagination = buildPagination(productPage);

    const transactionPage = paginateItems(detailedTransactions, transactionPageNumber, transactionLimit);

    return res.render("kasir/dashboard", {
      pageTitle: "Kasir Dashboard",
      transactions: transactionPage.rows,
      transactionPagination: transactionPage.pagination,
      products: productPage.rows.map(normalizeProduct),
      productPagination,
      stats: buildDashboardStats(transactions),
      statusChart: buildStatusChart(transactions)
    });
  } catch (error) {
    console.error("Kasir dashboard error:", error);

    return res.status(500).render("kasir/dashboard", {
      pageTitle: "Kasir Dashboard",
      transactions: [],
      transactionPagination: buildPagination({ page: 1, limit: transactionLimit, total: 0 }),
      products: [],
      productPagination: buildPagination({ page: 1, limit: productLimit, total: 0 }),
      stats: buildDashboardStats([]),
      statusChart: buildStatusChart([]),
      dashboardError: "Gagal memuat daftar transaksi."
    });
  }
};

exports.createDirectSale = async (req, res) => {
  const paymentMethod = req.body.payment_method ? req.body.payment_method.trim().toLowerCase() : "";
  const productIds = Array.isArray(req.body.product_ids)
    ? req.body.product_ids
    : [req.body.product_ids].filter(Boolean);

  if (!PAYMENT_METHODS.includes(paymentMethod) || paymentMethod === "smartbank") {
    setFlash(req, {
      type: "error",
      message: "Metode pembayaran transaksi kasir tidak valid."
    });
    return res.redirect("/kasir");
  }

  try {
    const products = await ProductModel.getAll();
    const productMap = new Map(products.map((product) => [String(product.id), product]));
    const items = [];

    productIds.forEach((productId) => {
      const qty = Number(req.body[`qty_${productId}`] || 0);
      const product = productMap.get(String(productId));

      if (!product || !Number.isInteger(qty) || qty <= 0) {
        return;
      }

      items.push({
        product_id: product.id,
        qty,
        price: Number(product.harga),
        subtotal: Number(product.harga) * qty
      });
    });

    if (items.length === 0) {
      setFlash(req, {
        type: "error",
        message: "Pilih minimal satu produk untuk transaksi kasir."
      });
      return res.redirect("/kasir");
    }

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const fee = calculateFee(subtotal);
    const result = await TransactionModel.createDirectPaidTransaction({
      transaction: {
        invoice: generateInvoice(),
        cashier_id: req.session.user.id,
        subtotal,
        fee,
        grand_total: subtotal + fee,
        payment_method: paymentMethod
      },
      items
    });

    if (!result.success) {
      const message = result.reason === "insufficient_stock"
        ? `Stock untuk ${result.productName} tidak mencukupi.`
        : "Ada produk transaksi yang sudah tidak tersedia.";

      setFlash(req, {
        type: "error",
        message
      });
      return res.redirect("/kasir");
    }

    setFlash(req, {
      type: "success",
      message: "Transaksi kasir berhasil dibuat."
    });

    return res.redirect(`/kasir/receipt/${result.transactionId}`);
  } catch (error) {
    console.error("Create direct sale error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal membuat transaksi kasir."
    });
    return res.redirect("/kasir");
  }
};

exports.approveTransaction = async (req, res) => {
  const transactionId = Number(req.params.id);

  if (!transactionId) {
    setFlash(req, {
      type: "error",
      message: "Transaksi tidak ditemukan."
    });
    return res.redirect("/kasir");
  }

  try {
    const result = await TransactionModel.updateStatus({
      transactionId,
      status: "approved",
      cashierId: req.session.user.id,
      allowedCurrentStatuses: ["pending"]
    });

    if (!result.success) {
      let message = "Transaksi tidak ditemukan.";

      if (result.reason === "invalid_status") {
        message = "Hanya transaksi pending yang bisa di-approve.";
      }

      if (result.reason === "product_not_found") {
        message = "Ada produk transaksi yang sudah tidak tersedia.";
      }

      if (result.reason === "insufficient_stock") {
        message = `Stock untuk ${result.productName} tidak mencukupi.`;
      }

      setFlash(req, {
        type: "error",
        message
      });
      return res.redirect("/kasir");
    }

    setFlash(req, {
      type: "success",
      message: "Transaksi berhasil di-approve."
    });
  } catch (error) {
    console.error("Approve transaction error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal meng-approve transaksi."
    });
  }

  return res.redirect("/kasir");
};

exports.rejectTransaction = async (req, res) => {
  const transactionId = Number(req.params.id);

  if (!transactionId) {
    setFlash(req, {
      type: "error",
      message: "Transaksi tidak ditemukan."
    });
    return res.redirect("/kasir");
  }

  try {
    const result = await TransactionModel.updateStatus({
      transactionId,
      status: "rejected",
      cashierId: req.session.user.id,
      allowedCurrentStatuses: ["pending"]
    });

    if (!result.success) {
      const message = result.reason === "invalid_status"
        ? "Hanya transaksi pending yang bisa ditolak."
        : "Transaksi tidak ditemukan.";

      setFlash(req, {
        type: "error",
        message
      });
      return res.redirect("/kasir");
    }

    setFlash(req, {
      type: "success",
      message: "Transaksi berhasil ditolak."
    });
  } catch (error) {
    console.error("Reject transaction error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal menolak transaksi."
    });
  }

  return res.redirect("/kasir");
};

exports.payTransaction = async (req, res) => {
  const transactionId = Number(req.params.id);
  const paymentMethod = req.body.payment_method ? req.body.payment_method.trim().toLowerCase() : "";

  if (!transactionId) {
    setFlash(req, {
      type: "error",
      message: "Transaksi tidak ditemukan."
    });
    return res.redirect("/kasir");
  }

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    setFlash(req, {
      type: "error",
      message: "Metode pembayaran tidak valid."
    });
    return res.redirect("/kasir");
  }

  try {
    const result = await TransactionModel.payTransaction({
      transactionId,
      cashierId: req.session.user.id,
      paymentMethod
    });

    if (!result.success) {
      let message = "Gagal memproses pembayaran.";

      if (result.reason === "not_found") {
        message = "Transaksi tidak ditemukan.";
      }

      if (result.reason === "invalid_status") {
        message = "Hanya transaksi approved yang bisa dibayar.";
      }

      if (result.reason === "product_not_found") {
        message = "Ada produk transaksi yang sudah tidak tersedia.";
      }

      if (result.reason === "insufficient_stock") {
        message = `Stock untuk ${result.productName} tidak mencukupi.`;
      }

      setFlash(req, {
        type: "error",
        message
      });
      return res.redirect("/kasir");
    }

    setFlash(req, {
      type: "success",
      message: "Pembayaran berhasil diproses."
    });

    return res.redirect(`/kasir/receipt/${transactionId}`);
  } catch (error) {
    console.error("Pay transaction error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memproses pembayaran transaksi."
    });
    return res.redirect("/kasir");
  }
};

exports.smartBankPayment = async (req, res) => {
  const transactionId = Number(req.body.transaction_id);

  if (!transactionId) {
    return res.status(400).json({
      success: false,
      message: "transaction_id wajib diisi."
    });
  }

  try {
    const transaction = await TransactionModel.getById(transactionId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan."
      });
    }

    if (transaction.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Hanya transaksi approved yang bisa diproses ke SmartBank."
      });
    }

    const paymentRequestId = `SB-${Date.now()}-${Math.floor(1000 + (Math.random() * 9000))}`;
    const paymentSucceeded = Math.random() >= 0.35;

    if (!paymentSucceeded) {
      return res.status(200).json({
        success: false,
        payment_request_id: paymentRequestId,
        status: "failed",
        message: "Pembayaran SmartBank gagal diproses."
      });
    }

    const result = await TransactionModel.payTransaction({
      transactionId,
      cashierId: req.session.user.id,
      paymentMethod: "smartbank"
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        payment_request_id: paymentRequestId,
        status: "failed",
        message: "Transaksi gagal diubah ke status paid."
      });
    }

    return res.status(200).json({
      success: true,
      payment_request_id: paymentRequestId,
      status: "success",
      transaction_id: transactionId,
      message: "Pembayaran SmartBank berhasil."
    });
  } catch (error) {
    console.error("SmartBank payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat memproses SmartBank."
    });
  }
};

exports.receipt = async (req, res) => {
  const transactionId = Number(req.params.id);

  if (!transactionId) {
    setFlash(req, {
      type: "error",
      message: "Transaksi tidak ditemukan."
    });
    return res.redirect("/kasir");
  }

  try {
    const transaction = await TransactionModel.getById(transactionId);

    if (!transaction) {
      setFlash(req, {
        type: "error",
        message: "Transaksi tidak ditemukan."
      });
      return res.redirect("/kasir");
    }

    const items = await TransactionModel.getItemsByTransactionId(transactionId);

    return res.render("kasir/receipt", {
      pageTitle: "Struk Kasir",
      transaction: normalizeTransaction(transaction),
      items: items.map(normalizeItem)
    });
  } catch (error) {
    console.error("Kasir receipt error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memuat struk transaksi."
    });
    return res.redirect("/kasir");
  }
};
