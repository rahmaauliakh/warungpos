const ProductModel = require("../models/productModel");
const TransactionModel = require("../models/transactionModel");
const UserModel = require("../models/userModel");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcrypt");

const setFlash = (req, payload) => {
  req.session.flash = payload;
};

const ROLE_REDIRECTS = {
  manager: "/manager",
  operator: "/operator",
  kasir: "/kasir",
  konsumen: "/konsumen"
};

const FEE_RATE = 0.01;

const formatCurrency = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(value);

const formatDateTime = (value) => new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}).format(new Date(value));

const STATUS_META = {
  pending: {
    label: "Menunggu Approve",
    tone: "bg-amber-100 text-amber-700 ring-amber-200",
    description: "Pesanan sudah masuk dan menunggu konfirmasi kasir."
  },
  approved: {
    label: "Disetujui",
    tone: "bg-sky-100 text-sky-700 ring-sky-200",
    description: "Pesanan sudah disetujui kasir dan menunggu pembayaran."
  },
  paid: {
    label: "Selesai Dibayar",
    tone: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    description: "Pesanan sudah dibayar dan transaksi selesai."
  },
  rejected: {
    label: "Ditolak",
    tone: "bg-rose-100 text-rose-700 ring-rose-200",
    description: "Pesanan ditolak. Silakan buat pesanan baru jika masih diperlukan."
  }
};

const getStatusMeta = (status) => STATUS_META[status] || {
  label: status || "Unknown",
  tone: "bg-slate-100 text-slate-700 ring-slate-200",
  description: "Status transaksi belum dikenali sistem."
};

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

const normalizeCart = (cart = []) => {
  if (!Array.isArray(cart)) {
    return [];
  }

  return cart.filter((item) => item && item.productId);
};

const getCartTotals = (cartItems) => {
  const totalQty = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + (item.qty * item.harga), 0);

  return {
    totalQty,
    subtotal,
    subtotalFormatted: formatCurrency(subtotal)
  };
};

const buildCartView = (cartItems) => {
  const items = cartItems.map((item) => ({
    ...item,
    total: item.qty * item.harga,
    hargaFormatted: formatCurrency(item.harga),
    totalFormatted: formatCurrency(item.qty * item.harga)
  }));

  return {
    items,
    ...getCartTotals(items)
  };
};

const getReceiptData = async (invoice, userId) => {
  const transaction = await TransactionModel.getByInvoiceAndUser(invoice, userId);

  if (!transaction) {
    return null;
  }

  const items = await TransactionModel.getItemsByTransactionId(transaction.id);

  return {
    transaction: {
      ...transaction,
      status_meta: getStatusMeta(transaction.status),
      grand_total_formatted: formatCurrency(transaction.grand_total),
      subtotal_formatted: formatCurrency(transaction.subtotal),
      fee_formatted: formatCurrency(transaction.fee),
      created_at_formatted: formatDateTime(transaction.created_at)
    },
    items: items.map((item) => ({
      ...item,
      price_formatted: formatCurrency(item.price),
      subtotal_formatted: formatCurrency(item.subtotal)
    }))
  };
};

const redirectUnpaidToStatus = (req, res, transaction) => {
  setFlash(req, {
    type: "error",
    message: "Struk pembayaran hanya tersedia setelah pesanan dibayar."
  });

  return res.redirect(`/konsumen/waiting/${transaction.invoice}`);
};

const findCartItemIndex = (cart, productId) => cart.findIndex((item) => item.productId === productId);

const generateInvoice = () => {
  const timestamp = Date.now();
  const randomPart = Math.floor(1000 + (Math.random() * 9000));
  return `INV${timestamp}${randomPart}`;
};

const getSafeUserSession = (user) => ({
  id: user.id,
  nama: user.nama,
  email: user.email,
  phone: user.phone || "",
  role: user.role
});

const renderProfilePage = (res, {
  profile,
  profileError = null,
  passwordError = null,
  oldInput = {},
  passwordInput = {}
}) => res.render("konsumen/profile", {
  pageTitle: "Profil Saya",
  profile,
  profileError,
  passwordError,
  oldInput: {
    nama: oldInput.nama || profile?.nama || "",
    email: oldInput.email || profile?.email || "",
    phone: oldInput.phone || profile?.phone || ""
  },
  passwordInput: {
    currentPassword: passwordInput.currentPassword || "",
    newPassword: passwordInput.newPassword || "",
    confirmPassword: passwordInput.confirmPassword || ""
  }
});

exports.index = async (req, res) => {
  const search = req.query.search ? req.query.search.trim() : "";
  const kategori = req.query.kategori ? req.query.kategori.trim() : "";
  const page = Number(req.query.page) || 1;
  const productLimit = 6;

  try {
    const [productPage, categoryRows] = await Promise.all([
      ProductModel.getCatalogPaginated({ search, kategori, page, limit: productLimit }),
      ProductModel.getCategories()
    ]);

    const cart = buildCartView(normalizeCart(req.session.cart));
    const pagination = buildPagination(productPage);

    return res.render("konsumen/index", {
      pageTitle: "Katalog Produk",
      products: productPage.rows,
      categories: categoryRows.map((row) => row.kategori),
      filters: {
        search,
        kategori,
        page: pagination.currentPage
      },
      pagination,
      cart
    });
  } catch (error) {
    console.error("Konsumen catalog error:", error);

    return res.status(500).render("konsumen/index", {
      pageTitle: "Katalog Produk",
      products: [],
      categories: [],
      filters: {
        search,
        kategori,
        page: 1
      },
      pagination: buildPagination({ page: 1, limit: productLimit, total: 0 }),
      cart: buildCartView([]),
      catalogError: "Gagal memuat katalog produk."
    });
  }
};

exports.history = async (req, res) => {
  try {
    const transactions = await TransactionModel.getByUser(req.session.user.id);

    return res.render("konsumen/history", {
      pageTitle: "Riwayat Transaksi",
      transactions: transactions.map((transaction) => ({
        ...transaction,
        status_meta: getStatusMeta(transaction.status),
        grand_total_formatted: formatCurrency(transaction.grand_total),
        subtotal_formatted: formatCurrency(transaction.subtotal),
        fee_formatted: formatCurrency(transaction.fee),
        created_at_formatted: formatDateTime(transaction.created_at)
      }))
    });
  } catch (error) {
    console.error("Konsumen history error:", error);

    return res.status(500).render("konsumen/history", {
      pageTitle: "Riwayat Transaksi",
      transactions: [],
      historyError: "Gagal memuat riwayat transaksi."
    });
  }
};

exports.profile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.session.user.id);

    if (!user) {
      setFlash(req, {
        type: "error",
        message: "Profil pengguna tidak ditemukan."
      });
      return res.redirect("/login");
    }

    return renderProfilePage(res, { profile: user });
  } catch (error) {
    console.error("Konsumen profile error:", error);

    return res.status(500).render("konsumen/profile", {
      pageTitle: "Profil Saya",
      profile: req.session.user,
      profileError: "Gagal memuat profil pengguna.",
      passwordError: null,
      oldInput: {
        nama: req.session.user?.nama || "",
        email: req.session.user?.email || "",
        phone: req.session.user?.phone || ""
      },
      passwordInput: {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }
    });
  }
};

exports.updateProfile = async (req, res) => {
  const nama = req.body.nama ? req.body.nama.trim() : "";
  const email = req.body.email ? req.body.email.trim().toLowerCase() : "";
  const phone = req.body.phone ? req.body.phone.trim() : "";

  if (!nama || !email) {
    return res.status(400).render("konsumen/profile", {
      pageTitle: "Profil Saya",
      profile: req.session.user,
      profileError: "Nama dan email wajib diisi.",
      passwordError: null,
      oldInput: { nama, email, phone },
      passwordInput: {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }
    });
  }

  try {
    const currentUser = await UserModel.findById(req.session.user.id);
    const existingUser = await UserModel.findByEmailExcludingId(email, req.session.user.id);

    if (existingUser) {
      return renderProfilePage(res, {
        profile: currentUser || req.session.user,
        profileError: "Email sudah dipakai akun lain.",
        oldInput: { nama, email, phone }
      });
    }

    const updatedUser = await UserModel.updateProfile({
      id: req.session.user.id,
      nama,
      email,
      phone
    });

    req.session.user = getSafeUserSession(updatedUser);
    setFlash(req, {
      type: "success",
      message: "Profil berhasil diperbarui."
    });

    return req.session.save(() => res.redirect("/konsumen/profile"));
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).render("konsumen/profile", {
      pageTitle: "Profil Saya",
      profile: req.session.user,
      profileError: "Gagal memperbarui profil.",
      passwordError: null,
      oldInput: { nama, email, phone },
      passwordInput: {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }
    });
  }
};

exports.updatePassword = async (req, res) => {
  const currentPassword = req.body.currentPassword || "";
  const newPassword = req.body.newPassword || "";
  const confirmPassword = req.body.confirmPassword || "";

  try {
    const user = await UserModel.findById(req.session.user.id);

    if (!user) {
      setFlash(req, {
        type: "error",
        message: "Profil pengguna tidak ditemukan."
      });
      return res.redirect("/login");
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return renderProfilePage(res, {
        profile: user,
        passwordError: "Semua field password wajib diisi.",
        passwordInput: { currentPassword, newPassword, confirmPassword }
      });
    }

    if (newPassword.length < 6) {
      return renderProfilePage(res, {
        profile: user,
        passwordError: "Password baru minimal 6 karakter.",
        passwordInput: { currentPassword, newPassword, confirmPassword }
      });
    }

    if (newPassword !== confirmPassword) {
      return renderProfilePage(res, {
        profile: user,
        passwordError: "Konfirmasi password baru tidak sama.",
        passwordInput: { currentPassword, newPassword, confirmPassword }
      });
    }

    const currentUserPassword = await UserModel.findPasswordById(req.session.user.id);
    const isPasswordValid = await bcrypt.compare(currentPassword, currentUserPassword?.password || "");

    if (!isPasswordValid) {
      return renderProfilePage(res, {
        profile: user,
        passwordError: "Password saat ini tidak sesuai.",
        passwordInput: { currentPassword: "", newPassword, confirmPassword }
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await UserModel.updatePassword(req.session.user.id, hashedPassword);

    setFlash(req, {
      type: "success",
      message: "Password berhasil diperbarui."
    });

    return res.redirect("/konsumen/profile");
  } catch (error) {
    console.error("Update password error:", error);

    return res.status(500).render("konsumen/profile", {
      pageTitle: "Profil Saya",
      profile: req.session.user,
      profileError: null,
      passwordError: "Gagal memperbarui password.",
      oldInput: {
        nama: req.session.user?.nama || "",
        email: req.session.user?.email || "",
        phone: req.session.user?.phone || ""
      },
      passwordInput: {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }
    });
  }
};

exports.addToCart = async (req, res) => {
  const productId = Number(req.params.id);
  const redirectUrl = req.body.redirect || "/konsumen";

  if (!productId) {
    setFlash(req, {
      type: "error",
      message: "Produk tidak ditemukan."
    });
    return res.redirect(redirectUrl);
  }

  try {
    const product = await ProductModel.getById(productId);

    if (!product) {
      setFlash(req, {
        type: "error",
        message: "Produk tidak ditemukan."
      });
      return res.redirect(redirectUrl);
    }

    if (Number(product.stock) <= 0) {
      setFlash(req, {
        type: "error",
        message: "Stock produk sedang habis."
      });
      return res.redirect(redirectUrl);
    }

    const cart = normalizeCart(req.session.cart);
    const itemIndex = findCartItemIndex(cart, productId);

    if (itemIndex >= 0) {
      const nextQty = cart[itemIndex].qty + 1;

      if (nextQty > Number(product.stock)) {
        setFlash(req, {
          type: "error",
          message: "Jumlah di cart melebihi stock tersedia."
        });
        return res.redirect(redirectUrl);
      }

      cart[itemIndex].qty = nextQty;
    } else {
      cart.push({
        productId: product.id,
        nama_produk: product.nama_produk,
        harga: Number(product.harga),
        gambar: product.gambar || "",
        kategori: product.kategori || "",
        stock: Number(product.stock),
        qty: 1
      });
    }

    req.session.cart = cart;
    setFlash(req, {
      type: "success",
      message: "Produk ditambahkan ke cart."
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal menambahkan produk ke cart."
    });
  }

  return res.redirect(redirectUrl);
};

exports.updateCartQuantity = async (req, res) => {
  const productId = Number(req.params.id);
  const action = req.body.action;
  const redirectUrl = req.body.redirect || "/konsumen";
  const cart = normalizeCart(req.session.cart);
  const itemIndex = findCartItemIndex(cart, productId);

  if (itemIndex < 0) {
    setFlash(req, {
      type: "error",
      message: "Item cart tidak ditemukan."
    });
    return res.redirect(redirectUrl);
  }

  try {
    const product = await ProductModel.getById(productId);

    if (!product) {
      req.session.cart = cart.filter((item) => item.productId !== productId);
      setFlash(req, {
        type: "error",
        message: "Produk sudah tidak tersedia."
      });
      return res.redirect(redirectUrl);
    }

    if (action === "increase") {
      if (cart[itemIndex].qty >= Number(product.stock)) {
        setFlash(req, {
          type: "error",
          message: "Jumlah item sudah mencapai batas stock."
        });
        return res.redirect(redirectUrl);
      }

      cart[itemIndex].qty += 1;
    }

    if (action === "decrease") {
      cart[itemIndex].qty -= 1;

      if (cart[itemIndex].qty <= 0) {
        req.session.cart = cart.filter((item) => item.productId !== productId);
        setFlash(req, {
          type: "success",
          message: "Item dihapus dari cart."
        });
        return res.redirect(redirectUrl);
      }
    }

    cart[itemIndex].stock = Number(product.stock);
    req.session.cart = cart;
  } catch (error) {
    console.error("Update cart quantity error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memperbarui cart."
    });
  }

  return res.redirect(redirectUrl);
};

exports.removeFromCart = (req, res) => {
  const productId = Number(req.params.id);
  const redirectUrl = req.body.redirect || "/konsumen";
  const cart = normalizeCart(req.session.cart);

  req.session.cart = cart.filter((item) => item.productId !== productId);
  setFlash(req, {
    type: "success",
    message: "Item dihapus dari cart."
  });

  return res.redirect(redirectUrl);
};

exports.checkout = async (req, res) => {
  const redirectUrl = req.body.redirect || "/konsumen";
  const cart = normalizeCart(req.session.cart);

  if (cart.length === 0) {
    setFlash(req, {
      type: "error",
      message: "Cart masih kosong."
    });
    return res.redirect(redirectUrl);
  }

  try {
    const validatedItems = [];

    for (const item of cart) {
      const product = await ProductModel.getById(item.productId);

      if (!product || Number(product.stock) < item.qty) {
        setFlash(req, {
          type: "error",
          message: `Stock untuk ${item.nama_produk} tidak mencukupi.`
        });
        return res.redirect(redirectUrl);
      }

      validatedItems.push({
        product_id: product.id,
        qty: item.qty,
        price: Number(product.harga),
        subtotal: Number(product.harga) * item.qty
      });
    }

    const subtotal = validatedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const fee = calculateFee(subtotal);
    const grandTotal = subtotal + fee;
    const invoice = generateInvoice();

    await TransactionModel.createTransactionWithItems({
      transaction: {
        invoice,
        user_id: req.session.user.id,
        subtotal,
        fee,
        grand_total: grandTotal,
        status: "pending"
      },
      items: validatedItems
    });

    req.session.cart = [];

    return req.session.save(() => {
      res.redirect(`/konsumen/waiting/${invoice}`);
    });
  } catch (error) {
    console.error("Checkout error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memproses checkout."
    });
  }

  return res.redirect(redirectUrl);
};

exports.waitingApproval = async (req, res) => {
  const { invoice } = req.params;

  try {
    const transaction = await TransactionModel.getByInvoiceAndUser(invoice, req.session.user.id);

    if (!transaction) {
      setFlash(req, {
        type: "error",
        message: "Transaksi tidak ditemukan."
      });
      return res.redirect("/konsumen");
    }

    if (transaction.status === "paid") {
      return res.redirect(`/konsumen/receipt/${invoice}`);
    }

    return res.render("konsumen/waiting", {
      pageTitle: "Waiting Approval",
      transaction: {
        ...transaction,
        status_meta: getStatusMeta(transaction.status),
        grand_total_formatted: formatCurrency(transaction.grand_total),
        subtotal_formatted: formatCurrency(transaction.subtotal),
        created_at_formatted: formatDateTime(transaction.created_at)
      }
    });
  } catch (error) {
    console.error("Waiting approval error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memuat status transaksi."
    });
    return res.redirect("/konsumen");
  }
};

exports.receipt = async (req, res) => {
  const { invoice } = req.params;

  try {
    const receiptData = await getReceiptData(invoice, req.session.user.id);

    if (!receiptData) {
      setFlash(req, {
        type: "error",
        message: "Transaksi tidak ditemukan."
      });
      return res.redirect("/konsumen");
    }

    if (receiptData.transaction.status !== "paid") {
      return redirectUnpaidToStatus(req, res, receiptData.transaction);
    }

    return res.render("konsumen/receipt", {
      pageTitle: "Struk Transaksi",
      transaction: receiptData.transaction,
      items: receiptData.items
    });
  } catch (error) {
    console.error("Receipt error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memuat receipt transaksi."
    });
    return res.redirect("/konsumen");
  }
};

exports.downloadReceipt = async (req, res) => {
  const { invoice } = req.params;

  try {
    const receiptData = await getReceiptData(invoice, req.session.user.id);

    if (!receiptData) {
      setFlash(req, {
        type: "error",
        message: "Transaksi tidak ditemukan."
      });
      return res.redirect("/konsumen/history");
    }

    if (receiptData.transaction.status !== "paid") {
      return redirectUnpaidToStatus(req, res, receiptData.transaction);
    }

    const { transaction, items } = receiptData;
    const doc = new PDFDocument({ margin: 36, size: [226, 640] });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="struk-${transaction.invoice}.pdf"`);
    doc.pipe(res);

    doc.fontSize(14).text("WARUNGPOS", { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor("#475569").text("Struk Transaksi", { align: "center" });
    doc.text("Terima kasih sudah berbelanja", { align: "center" });
    doc.fillColor("#111827");
    doc.moveDown(0.8);
    doc.fontSize(8).text("--------------------------------");
    doc.text(`Invoice : ${transaction.invoice}`);
    doc.text(`Tanggal : ${transaction.created_at_formatted}`);
    doc.text(`Status  : ${transaction.status_meta.label}`);
    doc.text(`Bayar   : ${transaction.payment_method || "-"}`);
    doc.text("--------------------------------");
    doc.moveDown(0.4);

    items.forEach((item) => {
      doc.fontSize(8).text(item.nama_produk || "Produk");
      doc.text(`${item.qty} x ${formatCurrency(item.price)} = ${formatCurrency(item.subtotal)}`, {
        align: "right"
      });
      doc.moveDown(0.3);
    });

    doc.text("--------------------------------");
    doc.text(`Subtotal    ${transaction.subtotal_formatted}`, { align: "right" });
    doc.text(`Fee         ${transaction.fee_formatted}`, { align: "right" });
    doc.fontSize(10).text(`TOTAL       ${transaction.grand_total_formatted}`, { align: "right" });
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor("#475569").text(transaction.status_meta.description, { align: "center" });
    doc.moveDown(0.6);
    doc.text("Simpan struk ini sebagai bukti transaksi.", { align: "center" });
    doc.end();
  } catch (error) {
    console.error("Download receipt error:", error);
    return res.status(500).render("errors/500", {
      pageTitle: "Server Error"
    });
  }
};
