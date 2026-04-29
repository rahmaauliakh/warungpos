const ProductModel = require("../models/productModel");
const TransactionModel = require("../models/transactionModel");

const setFlash = (req, payload) => {
  req.session.flash = payload;
};

const ROLE_REDIRECTS = {
  manager: "/manager",
  operator: "/operator",
  kasir: "/kasir",
  konsumen: "/konsumen"
};

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

const findCartItemIndex = (cart, productId) => cart.findIndex((item) => item.productId === productId);

const generateInvoice = () => {
  const timestamp = Date.now();
  const randomPart = Math.floor(1000 + (Math.random() * 9000));
  return `INV${timestamp}${randomPart}`;
};

exports.index = async (req, res) => {
  const search = req.query.search ? req.query.search.trim() : "";
  const kategori = req.query.kategori ? req.query.kategori.trim() : "";

  try {
    const [products, categoryRows] = await Promise.all([
      ProductModel.getCatalog({ search, kategori }),
      ProductModel.getCategories()
    ]);

    const cart = buildCartView(normalizeCart(req.session.cart));

    return res.render("konsumen/index", {
      pageTitle: "Katalog Produk",
      products,
      categories: categoryRows.map((row) => row.kategori),
      filters: {
        search,
        kategori
      },
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
        kategori
      },
      cart: buildCartView([]),
      catalogError: "Gagal memuat katalog produk."
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
    const fee = 0;
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

    if (transaction.status === "approved") {
      return res.redirect(`/konsumen/receipt/${invoice}`);
    }

    return res.render("konsumen/waiting", {
      pageTitle: "Waiting Approval",
      transaction: {
        ...transaction,
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
    const transaction = await TransactionModel.getByInvoiceAndUser(invoice, req.session.user.id);

    if (!transaction) {
      setFlash(req, {
        type: "error",
        message: "Transaksi tidak ditemukan."
      });
      return res.redirect("/konsumen");
    }

    const items = await TransactionModel.getItemsByTransactionId(transaction.id);

    return res.render("konsumen/receipt", {
      pageTitle: "Receipt",
      transaction: {
        ...transaction,
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
