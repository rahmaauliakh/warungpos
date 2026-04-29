const db = require("../config/db");

const query = (sql, values = []) => new Promise((resolve, reject) => {
  db.query(sql, values, (error, results) => {
    if (error) {
      return reject(error);
    }

    return resolve(results);
  });
});

exports.getAll = async () => {
  const sql = `
    SELECT id, nama_produk, harga, stock, kategori, gambar
    FROM products
    ORDER BY id DESC
  `;

  return query(sql);
};

exports.getPaginated = async ({ page = 1, limit = 6 } = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.max(Number(limit) || 6, 1);
  const offset = (safePage - 1) * safeLimit;
  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT id, nama_produk, harga, stock, kategori, gambar
        FROM products
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `,
      [safeLimit, offset]
    ),
    query("SELECT COUNT(*) AS total FROM products")
  ]);

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
    page: safePage,
    limit: safeLimit
  };
};

exports.getCatalog = async ({ search = "", kategori = "" } = {}) => {
  let sql = `
    SELECT id, nama_produk, harga, stock, kategori, gambar
    FROM products
    WHERE 1 = 1
  `;
  const values = [];

  if (search) {
    sql += " AND nama_produk LIKE ?";
    values.push(`%${search}%`);
  }

  if (kategori) {
    sql += " AND kategori = ?";
    values.push(kategori);
  }

  sql += " ORDER BY id DESC";

  return query(sql, values);
};

exports.getCatalogPaginated = async ({ search = "", kategori = "", page = 1, limit = 6 } = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.max(Number(limit) || 6, 1);
  const offset = (safePage - 1) * safeLimit;
  let whereSql = "WHERE 1 = 1";
  const values = [];

  if (search) {
    whereSql += " AND nama_produk LIKE ?";
    values.push(`%${search}%`);
  }

  if (kategori) {
    whereSql += " AND kategori = ?";
    values.push(kategori);
  }

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT id, nama_produk, harga, stock, kategori, gambar
        FROM products
        ${whereSql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `,
      [...values, safeLimit, offset]
    ),
    query(
      `
        SELECT COUNT(*) AS total
        FROM products
        ${whereSql}
      `,
      values
    )
  ]);

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
    page: safePage,
    limit: safeLimit
  };
};

exports.getCategories = async () => {
  const sql = `
    SELECT DISTINCT kategori
    FROM products
    WHERE kategori IS NOT NULL AND kategori <> ''
    ORDER BY kategori ASC
  `;

  return query(sql);
};

exports.getById = async (id) => {
  const sql = `
    SELECT id, nama_produk, harga, stock, kategori, gambar
    FROM products
    WHERE id = ?
    LIMIT 1
  `;

  const results = await query(sql, [id]);
  return results[0] || null;
};

exports.create = async (product) => {
  const sql = `
    INSERT INTO products (nama_produk, harga, stock, kategori, gambar)
    VALUES (?, ?, ?, ?, ?)
  `;

  return query(sql, [
    product.nama_produk,
    product.harga,
    product.stock,
    product.kategori,
    product.gambar
  ]);
};

exports.update = async (id, product) => {
  const sql = `
    UPDATE products
    SET nama_produk = ?, harga = ?, stock = ?, kategori = ?, gambar = ?
    WHERE id = ?
  `;

  return query(sql, [
    product.nama_produk,
    product.harga,
    product.stock,
    product.kategori,
    product.gambar,
    id
  ]);
};

exports.updateStock = async (id, stock) => {
  const sql = `
    UPDATE products
    SET stock = ?
    WHERE id = ?
  `;

  return query(sql, [stock, id]);
};

exports.delete = async (id) => {
  const sql = "DELETE FROM products WHERE id = ?";
  return query(sql, [id]);
};
