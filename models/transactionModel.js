const db = require("../config/db");

const beginTransaction = () => new Promise((resolve, reject) => {
  db.beginTransaction((error) => {
    if (error) {
      return reject(error);
    }

    return resolve();
  });
});

const commit = () => new Promise((resolve, reject) => {
  db.commit((error) => {
    if (error) {
      return reject(error);
    }

    return resolve();
  });
});

const rollback = () => new Promise((resolve) => {
  db.rollback(() => resolve());
});

const query = (sql, values = []) => new Promise((resolve, reject) => {
  db.query(sql, values, (error, results) => {
    if (error) {
      return reject(error);
    }

    return resolve(results);
  });
});

const getSingle = async (sql, values = []) => {
  const results = await query(sql, values);
  return results[0] || null;
};

const getManagerDateFilter = (filter) => {
  if (filter === "today") {
    return "DATE(t.created_at) = CURDATE()";
  }

  if (filter === "week") {
    return "YEARWEEK(t.created_at, 1) = YEARWEEK(CURDATE(), 1)";
  }

  if (filter === "month") {
    return "YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE())";
  }

  return "1 = 1";
};

const getManagerChartGroupConfig = (filter) => {
  if (filter === "today") {
    return {
      selectExpr: "DATE_FORMAT(t.created_at, '%Y-%m-%d %H:00:00')",
      groupExpr: "DATE_FORMAT(t.created_at, '%Y-%m-%d %H:00:00')",
      alias: "sales_period"
    };
  }

  if (filter === "all") {
    return {
      selectExpr: "DATE_FORMAT(t.created_at, '%Y-%m-%d')",
      groupExpr: "DATE_FORMAT(t.created_at, '%Y-%m-%d')",
      alias: "sales_period"
    };
  }

  return {
    selectExpr: "DATE_FORMAT(t.created_at, '%Y-%m-%d')",
    groupExpr: "DATE_FORMAT(t.created_at, '%Y-%m-%d')",
    alias: "sales_period"
  };
};

exports.createTransactionWithItems = async ({ transaction, items }) => {
  try {
    await beginTransaction();

    const transactionResult = await query(
      `
        INSERT INTO transactions (invoice, user_id, cashier_id, subtotal, fee, grand_total, status, payment_method, stock_deducted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        transaction.invoice,
        transaction.user_id || null,
        transaction.cashier_id || null,
        transaction.subtotal,
        transaction.fee,
        transaction.grand_total,
        transaction.status,
        transaction.payment_method || null,
        transaction.stock_deducted || 0
      ]
    );

    const transactionId = transactionResult.insertId;
    const itemValues = items.map((item) => [
      transactionId,
      item.product_id,
      item.qty,
      item.price,
      item.subtotal
    ]);

    await query(
      `
        INSERT INTO transaction_items (transaction_id, product_id, qty, price, subtotal)
        VALUES ?
      `,
      [itemValues]
    );

    await commit();

    return {
      id: transactionId,
      invoice: transaction.invoice
    };
  } catch (error) {
    await rollback();
    throw error;
  }
};

exports.createDirectPaidTransaction = async ({ transaction, items }) => {
  try {
    await beginTransaction();

    for (const item of items) {
      const product = await getSingle(
        `
          SELECT id, nama_produk, stock
          FROM products
          WHERE id = ?
          LIMIT 1
        `,
        [item.product_id]
      );

      if (!product) {
        await rollback();
        return { success: false, reason: "product_not_found" };
      }

      if (Number(product.stock) < Number(item.qty)) {
        await rollback();
        return {
          success: false,
          reason: "insufficient_stock",
          productName: product.nama_produk
        };
      }
    }

    const transactionResult = await query(
      `
        INSERT INTO transactions (invoice, user_id, cashier_id, subtotal, fee, grand_total, status, payment_method, stock_deducted, created_at)
        VALUES (?, NULL, ?, ?, ?, ?, 'paid', ?, 1, NOW())
      `,
      [
        transaction.invoice,
        transaction.cashier_id,
        transaction.subtotal,
        transaction.fee,
        transaction.grand_total,
        transaction.payment_method
      ]
    );

    const transactionId = transactionResult.insertId;
    const itemValues = items.map((item) => [
      transactionId,
      item.product_id,
      item.qty,
      item.price,
      item.subtotal
    ]);

    await query(
      `
        INSERT INTO transaction_items (transaction_id, product_id, qty, price, subtotal)
        VALUES ?
      `,
      [itemValues]
    );

    for (const item of items) {
      await query(
        `
          UPDATE products
          SET stock = stock - ?
          WHERE id = ?
        `,
        [item.qty, item.product_id]
      );
    }

    await commit();

    return {
      success: true,
      transactionId,
      invoice: transaction.invoice
    };
  } catch (error) {
    await rollback();
    throw error;
  }
};

exports.getDashboardTransactions = async () => {
  return query(
    `
      SELECT
        t.id,
        t.invoice,
        t.user_id,
        t.cashier_id,
        t.subtotal,
        t.fee,
        t.grand_total,
        t.status,
        t.payment_method,
        t.created_at,
        u.nama AS customer_name,
        u.email AS customer_email,
        c.nama AS cashier_name
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users c ON c.id = t.cashier_id
      ORDER BY t.created_at DESC, t.id DESC
    `
  );
};

exports.getByInvoiceAndUser = async (invoice, userId) => {
  const results = await query(
    `
      SELECT id, invoice, user_id, subtotal, fee, grand_total, status, payment_method, created_at
      FROM transactions
      WHERE invoice = ? AND user_id = ?
      LIMIT 1
    `,
    [invoice, userId]
  );

  return results[0] || null;
};

exports.getByUser = async (userId) => {
  return query(
    `
      SELECT
        t.id,
        t.invoice,
        t.user_id,
        t.cashier_id,
        t.subtotal,
        t.fee,
        t.grand_total,
        t.status,
        t.payment_method,
        t.created_at,
        c.nama AS cashier_name,
        COUNT(ti.id) AS total_items,
        COALESCE(SUM(ti.qty), 0) AS total_qty
      FROM transactions t
      LEFT JOIN users c ON c.id = t.cashier_id
      LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
      WHERE t.user_id = ?
      GROUP BY
        t.id,
        t.invoice,
        t.user_id,
        t.cashier_id,
        t.subtotal,
        t.fee,
        t.grand_total,
        t.status,
        t.payment_method,
        t.created_at,
        c.nama
      ORDER BY t.created_at DESC, t.id DESC
    `,
    [userId]
  );
};

exports.getById = async (transactionId) => {
  return getSingle(
    `
      SELECT
        t.id,
        t.invoice,
        t.user_id,
        t.cashier_id,
        t.subtotal,
        t.fee,
        t.grand_total,
        t.status,
        t.payment_method,
        t.created_at,
        u.nama AS customer_name,
        u.email AS customer_email,
        c.nama AS cashier_name
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users c ON c.id = t.cashier_id
      WHERE t.id = ?
      LIMIT 1
    `,
    [transactionId]
  );
};

exports.getItemsByTransactionId = async (transactionId) => {
  return query(
    `
      SELECT
        ti.id,
        ti.transaction_id,
        ti.product_id,
        ti.qty,
        ti.price,
        ti.subtotal,
        p.nama_produk,
        p.gambar,
        p.kategori
      FROM transaction_items ti
      LEFT JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = ?
      ORDER BY ti.id ASC
    `,
    [transactionId]
  );
};

exports.updateStatus = async ({ transactionId, status, cashierId, allowedCurrentStatuses }) => {
  try {
    await beginTransaction();

    const transaction = await getSingle(
      `
        SELECT id, invoice, status, stock_deducted
        FROM transactions
        WHERE id = ?
        LIMIT 1
      `,
      [transactionId]
    );

    if (!transaction) {
      await rollback();
      return { success: false, reason: "not_found" };
    }

    if (!allowedCurrentStatuses.includes(transaction.status)) {
      await rollback();
      return { success: false, reason: "invalid_status", transaction };
    }

    await query(
      `
        UPDATE transactions
        SET status = ?, cashier_id = ?, stock_deducted = ?
        WHERE id = ?
      `,
      [status, cashierId, Number(transaction.stock_deducted || 0), transactionId]
    );

    await commit();

    return { success: true };
  } catch (error) {
    await rollback();
    throw error;
  }
};

exports.payTransaction = async ({ transactionId, cashierId, paymentMethod }) => {
  try {
    await beginTransaction();

    const transaction = await getSingle(
      `
        SELECT id, invoice, status, stock_deducted
        FROM transactions
        WHERE id = ?
        LIMIT 1
      `,
      [transactionId]
    );

    if (!transaction) {
      await rollback();
      return { success: false, reason: "not_found" };
    }

    if (transaction.status !== "approved") {
      await rollback();
      return { success: false, reason: "invalid_status", transaction };
    }

    if (Number(transaction.stock_deducted || 0) === 0) {
      const items = await query(
        `
          SELECT product_id, qty
          FROM transaction_items
          WHERE transaction_id = ?
        `,
        [transactionId]
      );

      for (const item of items) {
        const product = await getSingle(
          `
            SELECT id, nama_produk, stock
            FROM products
            WHERE id = ?
            LIMIT 1
          `,
          [item.product_id]
        );

        if (!product) {
          await rollback();
          return { success: false, reason: "product_not_found" };
        }

        if (Number(product.stock) < Number(item.qty)) {
          await rollback();
          return {
            success: false,
            reason: "insufficient_stock",
            productName: product.nama_produk
          };
        }

        await query(
          `
            UPDATE products
            SET stock = stock - ?
            WHERE id = ?
          `,
          [item.qty, item.product_id]
        );
      }
    }

    await query(
      `
        UPDATE transactions
        SET status = ?, cashier_id = ?, payment_method = ?, stock_deducted = 1
        WHERE id = ?
      `,
      ["paid", cashierId, paymentMethod, transactionId]
    );

    await commit();

    return { success: true };
  } catch (error) {
    await rollback();
    throw error;
  }
};

exports.getManagerKpis = async (filter) => {
  const dateCondition = getManagerDateFilter(filter);

  return getSingle(
    `
      SELECT
        COALESCE(SUM(t.grand_total), 0) AS total_sales,
        COUNT(*) AS total_transactions,
        COALESCE(SUM(t.fee), 0) AS total_fee,
        COALESCE(AVG(t.grand_total), 0) AS average_transaction
      FROM transactions t
      WHERE t.status = 'paid' AND ${dateCondition}
    `
  );
};

exports.countManagerRecentTransactions = async (filter) => {
  const dateCondition = getManagerDateFilter(filter);

  const result = await getSingle(
    `
      SELECT COUNT(*) AS total
      FROM transactions t
      WHERE ${dateCondition}
    `
  );

  return Number(result?.total || 0);
};

exports.getManagerRecentTransactions = async (filter, limit = 10, offset = 0) => {
  const dateCondition = getManagerDateFilter(filter);

  return query(
    `
      SELECT
        t.id,
        t.invoice,
        t.grand_total,
        t.payment_method,
        t.status,
        t.created_at,
        u.nama AS customer_name,
        u.email AS customer_email,
        c.nama AS cashier_name
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users c ON c.id = t.cashier_id
      WHERE ${dateCondition}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ?
      OFFSET ?
    `,
    [limit, offset]
  );
};

exports.getManagerReportTransactions = async (filter) => {
  const dateCondition = getManagerDateFilter(filter);

  return query(
    `
      SELECT
        t.id,
        t.invoice,
        t.grand_total,
        t.fee,
        t.payment_method,
        t.status,
        t.created_at,
        u.nama AS customer_name,
        u.email AS customer_email,
        c.nama AS cashier_name
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users c ON c.id = t.cashier_id
      WHERE ${dateCondition}
      ORDER BY t.created_at DESC, t.id DESC
    `
  );
};

exports.getManagerCashierPerformance = async (filter) => {
  const dateCondition = getManagerDateFilter(filter);

  return query(
    `
      SELECT
        t.cashier_id,
        COALESCE(u.nama, u.email, 'Kasir') AS cashier_name,
        COUNT(*) AS total_transactions,
        COALESCE(SUM(t.grand_total), 0) AS total_sales,
        COALESCE(SUM(t.fee), 0) AS total_fee
      FROM transactions t
      LEFT JOIN users u ON u.id = t.cashier_id
      WHERE t.status = 'paid'
        AND t.cashier_id IS NOT NULL
        AND ${dateCondition}
      GROUP BY t.cashier_id, u.nama, u.email
      ORDER BY total_sales DESC, total_transactions DESC
    `
  );
};

exports.getManagerSalesChart = async (filter) => {
  const dateCondition = getManagerDateFilter(filter);
  const chartGroup = getManagerChartGroupConfig(filter);

  return query(
    `
      SELECT
        ${chartGroup.selectExpr} AS ${chartGroup.alias},
        COALESCE(SUM(t.grand_total), 0) AS total_sales
      FROM transactions t
      WHERE t.status = 'paid'
        AND ${dateCondition}
      GROUP BY ${chartGroup.groupExpr}
      ORDER BY ${chartGroup.alias} ASC
    `
  );
};
