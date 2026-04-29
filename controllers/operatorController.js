const ProductModel = require("../models/productModel");

const setFlash = (req, payload) => {
  req.session.flash = payload;
};

const formatCurrency = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(value);

const parseNumberInput = (value) => {
  if (value === undefined || value === null || value === "") {
    return Number.NaN;
  }

  return Number(value);
};

const mapProductInput = (body) => ({
  nama_produk: body.nama_produk ? body.nama_produk.trim() : "",
  harga: parseNumberInput(body.harga),
  stock: parseNumberInput(body.stock),
  kategori: body.kategori ? body.kategori.trim() : "",
  gambar: body.gambar ? body.gambar.trim() : ""
});

const validateProductInput = (product) => {
  if (!product.nama_produk) {
    return "Nama produk wajib diisi.";
  }

  if (!Number.isFinite(product.harga) || product.harga < 0) {
    return "Harga produk harus berupa angka minimal 0.";
  }

  if (!Number.isInteger(product.stock) || product.stock < 0) {
    return "Stock produk harus berupa bilangan bulat minimal 0.";
  }

  if (!product.kategori) {
    return "Kategori produk wajib diisi.";
  }

  return null;
};

const validateStockInput = (stock) => {
  if (!Number.isInteger(stock) || stock < 0) {
    return "Stock produk harus berupa bilangan bulat minimal 0.";
  }

  return null;
};

const buildDashboardData = (products) => {
  const totalProducts = products.length;
  const totalStock = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const inventoryValue = products.reduce((sum, product) => {
    return sum + (Number(product.harga || 0) * Number(product.stock || 0));
  }, 0);
  const categories = [...new Set(products.map((product) => product.kategori).filter(Boolean))];

  return {
    stats: [
      {
        label: "Total Produk",
        value: `${totalProducts}`,
        description: "Produk aktif dalam katalog",
        accent: "from-cyan-500 to-blue-500"
      },
      {
        label: "Total Stock",
        value: `${totalStock}`,
        description: "Unit tersedia saat ini",
        accent: "from-emerald-500 to-teal-500"
      },
      {
        label: "Nilai Inventory",
        value: formatCurrency(inventoryValue),
        description: "Akumulasi harga x stock",
        accent: "from-amber-500 to-orange-500"
      },
      {
        label: "Kategori",
        value: `${categories.length}`,
        description: "Kategori produk aktif",
        accent: "from-fuchsia-500 to-pink-500"
      }
    ],
    categories
  };
};

exports.index = async (req, res) => {
  try {
    const products = await ProductModel.getAll();
    const dashboardData = buildDashboardData(products);

    return res.render("operator/dashboard", {
      pageTitle: "Operator Product Management",
      products,
      stats: dashboardData.stats,
      categories: dashboardData.categories,
      formData: req.flashData?.oldInput || {},
      activeModal: req.flashData?.modal || null,
      activeProductId: req.flashData?.productId || null
    });
  } catch (error) {
    console.error("Operator dashboard error:", error);

    return res.status(500).render("operator/dashboard", {
      pageTitle: "Operator Product Management",
      products: [],
      stats: buildDashboardData([]).stats,
      categories: [],
      formData: {},
      activeModal: null,
      activeProductId: null
    });
  }
};

exports.createProduct = async (req, res) => {
  const product = mapProductInput(req.body);
  const validationError = validateProductInput(product);

  if (validationError) {
    setFlash(req, {
      type: "error",
      message: validationError,
      modal: "create",
      oldInput: req.body
    });
    return res.redirect("/operator");
  }

  try {
    await ProductModel.create(product);
    setFlash(req, {
      type: "success",
      message: "Produk berhasil ditambahkan."
    });
  } catch (error) {
    console.error("Create product error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal menambahkan produk.",
      modal: "create",
      oldInput: req.body
    });
  }

  return res.redirect("/operator");
};

exports.updateProduct = async (req, res) => {
  const productId = Number(req.params.id);
  const product = mapProductInput(req.body);
  const validationError = validateProductInput(product);

  if (!productId) {
    setFlash(req, {
      type: "error",
      message: "Produk tidak ditemukan."
    });
    return res.redirect("/operator");
  }

  if (validationError) {
    setFlash(req, {
      type: "error",
      message: validationError,
      modal: "edit",
      productId,
      oldInput: req.body
    });
    return res.redirect("/operator");
  }

  try {
    const existingProduct = await ProductModel.getById(productId);

    if (!existingProduct) {
      setFlash(req, {
        type: "error",
        message: "Produk tidak ditemukan."
      });
      return res.redirect("/operator");
    }

    await ProductModel.update(productId, product);
    setFlash(req, {
      type: "success",
      message: "Produk berhasil diperbarui."
    });
  } catch (error) {
    console.error("Update product error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memperbarui produk.",
      modal: "edit",
      productId,
      oldInput: req.body
    });
  }

  return res.redirect("/operator");
};

exports.updateStock = async (req, res) => {
  const productId = Number(req.params.id);
  const stock = parseNumberInput(req.body.stock);
  const validationError = validateStockInput(stock);

  if (!productId) {
    setFlash(req, {
      type: "error",
      message: "Produk tidak ditemukan."
    });
    return res.redirect("/operator");
  }

  if (validationError) {
    setFlash(req, {
      type: "error",
      message: validationError,
      modal: "stock",
      productId,
      oldInput: req.body
    });
    return res.redirect("/operator");
  }

  try {
    const existingProduct = await ProductModel.getById(productId);

    if (!existingProduct) {
      setFlash(req, {
        type: "error",
        message: "Produk tidak ditemukan."
      });
      return res.redirect("/operator");
    }

    await ProductModel.updateStock(productId, stock);
    setFlash(req, {
      type: "success",
      message: "Stock produk berhasil diperbarui."
    });
  } catch (error) {
    console.error("Update stock error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal memperbarui stock produk.",
      modal: "stock",
      productId,
      oldInput: req.body
    });
  }

  return res.redirect("/operator");
};

exports.deleteProduct = async (req, res) => {
  const productId = Number(req.params.id);

  if (!productId) {
    setFlash(req, {
      type: "error",
      message: "Produk tidak ditemukan."
    });
    return res.redirect("/operator");
  }

  try {
    const existingProduct = await ProductModel.getById(productId);

    if (!existingProduct) {
      setFlash(req, {
        type: "error",
        message: "Produk tidak ditemukan."
      });
      return res.redirect("/operator");
    }

    await ProductModel.delete(productId);
    setFlash(req, {
      type: "success",
      message: "Produk berhasil dihapus."
    });
  } catch (error) {
    console.error("Delete product error:", error);
    setFlash(req, {
      type: "error",
      message: "Gagal menghapus produk."
    });
  }

  return res.redirect("/operator");
};
