const TransactionModel = require("../models/transactionModel");
const { createObjectCsvStringifier } = require("csv-writer");
const PDFDocument = require("pdfkit");

const ALLOWED_FILTERS = ["today", "week", "month", "all"];
const RECENT_TRANSACTIONS_PER_PAGE = 6;

const formatCurrency = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(value);

const formatDate = (value) => new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}).format(new Date(value));

const getDateKey = (value) => {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value).slice(0, 10);
};

const getHourKey = (value) => {
  if (value instanceof Date) {
    return String(value.getHours()).padStart(2, "0");
  }

  return String(value).slice(11, 13);
};

const buildTodayChartDataset = (rows) => {
  const salesMap = new Map(
    rows.map((row) => {
      const hourKey = getHourKey(row.sales_period);
      return [hourKey, Number(row.total_sales)];
    })
  );
  const labels = [];
  const totals = [];

  for (let hour = 0; hour < 24; hour += 1) {
    const hourKey = String(hour).padStart(2, "0");
    labels.push(`${hourKey}:00`);
    totals.push(salesMap.get(hourKey) || 0);
  }

  return { labels, totals };
};

const buildDateRangeChartDataset = (rows, startDate, endDate) => {
  const salesMap = new Map(
    rows.map((row) => [getDateKey(row.sales_period), Number(row.total_sales)])
  );
  const labels = [];
  const totals = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    labels.push(
      new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short"
      }).format(cursor)
    );
    totals.push(salesMap.get(key) || 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  return { labels, totals };
};

const buildAllChartDataset = (rows) => {
  const labels = rows.map((row) => new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(getDateKey(row.sales_period))));
  const totals = rows.map((row) => Number(row.total_sales));

  return { labels, totals };
};

const buildChartDataset = (rows, filter) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (filter === "today") {
    return buildTodayChartDataset(rows);
  }

  if (filter === "week") {
    const startDate = new Date(today);
    const day = startDate.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    startDate.setDate(startDate.getDate() - diffToMonday);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    return buildDateRangeChartDataset(rows, startDate, endDate);
  }

  if (filter === "month") {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return buildDateRangeChartDataset(rows, startDate, endDate);
  }

  return buildAllChartDataset(rows);
};

const getFilterMeta = (filter) => ({
  today: "Hari Ini",
  week: "Minggu Ini",
  month: "Bulan Ini",
  all: "Semua"
}[filter] || "Semua");

const getChartRangeLabel = (filter) => {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (filter === "today") {
    return formatter.format(today);
  }

  if (filter === "week") {
    const startDate = new Date(today);
    const day = startDate.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    startDate.setDate(startDate.getDate() - diffToMonday);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
  }

  if (filter === "month") {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
  }

  return "Seluruh data transaksi";
};

const getManagerDashboardData = async (filter, recentTransactionPage = 1) => {
  const safePage = Number.isFinite(recentTransactionPage) && recentTransactionPage > 0
    ? Math.floor(recentTransactionPage)
    : 1;
  const offset = (safePage - 1) * RECENT_TRANSACTIONS_PER_PAGE;
  const [kpis, recentTransactions, recentTransactionCount, cashierPerformance, chartRows] = await Promise.all([
    TransactionModel.getManagerKpis(filter),
    TransactionModel.getManagerRecentTransactions(filter, RECENT_TRANSACTIONS_PER_PAGE, offset),
    TransactionModel.countManagerRecentTransactions(filter),
    TransactionModel.getManagerCashierPerformance(filter),
    TransactionModel.getManagerSalesChart(filter)
  ]);

  const chartData = buildChartDataset(chartRows, filter);
  const normalizedTransactions = recentTransactions.map((transaction) => ({
    ...transaction,
    customer_name: transaction.customer_name || transaction.customer_email || "Konsumen",
    cashier_name: transaction.cashier_name || "-",
    payment_method: transaction.payment_method || "-",
    grand_total_formatted: formatCurrency(transaction.grand_total),
    created_at_formatted: formatDate(transaction.created_at)
  }));
  const normalizedCashiers = cashierPerformance.map((cashier) => ({
    ...cashier,
    total_sales_formatted: formatCurrency(cashier.total_sales),
    total_fee_formatted: formatCurrency(cashier.total_fee)
  }));

  return {
    kpis,
    chartData,
    recentTransactions: normalizedTransactions,
    cashierMonitor: normalizedCashiers,
    recentTransactionsPagination: {
      currentPage: safePage,
      perPage: RECENT_TRANSACTIONS_PER_PAGE,
      totalItems: recentTransactionCount,
      totalPages: Math.max(1, Math.ceil(recentTransactionCount / RECENT_TRANSACTIONS_PER_PAGE))
    }
  };
};

exports.index = async (req, res) => {
  const filter = ALLOWED_FILTERS.includes(req.query.filter) ? req.query.filter : "all";
  const requestedRecentTransactionPage = Number.parseInt(req.query.recentPage, 10) || 1;

  try {
    const dashboardData = await getManagerDashboardData(filter, requestedRecentTransactionPage);
    const totalPages = dashboardData.recentTransactionsPagination.totalPages;
    const currentPage = Math.min(dashboardData.recentTransactionsPagination.currentPage, totalPages);

    if (currentPage !== dashboardData.recentTransactionsPagination.currentPage) {
      const normalizedData = await getManagerDashboardData(filter, currentPage);

      return res.render("manager/dashboard", {
        pageTitle: "Manager Dashboard",
        filters: [
          { key: "today", label: "Hari Ini" },
          { key: "week", label: "Minggu Ini" },
          { key: "month", label: "Bulan Ini" },
          { key: "all", label: "Semua" }
        ],
        activeFilter: filter,
        summaryCards: [
          {
            title: "Total Penjualan",
            value: formatCurrency(normalizedData.kpis.total_sales || 0),
            description: "Akumulasi transaksi paid",
            accent: "from-blue-500 to-blue-600"
          },
          {
            title: "Total Transaksi",
            value: `${Number(normalizedData.kpis.total_transactions || 0)} transaksi`,
            description: "Jumlah transaksi paid",
            accent: "from-sky-500 to-blue-500"
          },
          {
            title: "Total Fee POS",
            value: formatCurrency(normalizedData.kpis.total_fee || 0),
            description: "Akumulasi fee layanan",
            accent: "from-indigo-500 to-blue-600"
          },
          {
            title: "Rata-rata Transaksi",
            value: formatCurrency(normalizedData.kpis.average_transaction || 0),
            description: "Nilai rata-rata per transaksi",
            accent: "from-blue-700 to-indigo-600"
          }
        ],
        recentTransactions: normalizedData.recentTransactions,
        recentTransactionsPagination: normalizedData.recentTransactionsPagination,
        cashierMonitor: normalizedData.cashierMonitor,
        chartData: normalizedData.chartData,
        chartRangeLabel: getChartRangeLabel(filter),
        todayLabel: new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric"
        }).format(new Date())
      });
    }

    return res.render("manager/dashboard", {
      pageTitle: "Manager Dashboard",
      filters: [
        { key: "today", label: "Hari Ini" },
        { key: "week", label: "Minggu Ini" },
        { key: "month", label: "Bulan Ini" },
        { key: "all", label: "Semua" }
      ],
      activeFilter: filter,
      summaryCards: [
        {
          title: "Total Penjualan",
          value: formatCurrency(dashboardData.kpis.total_sales || 0),
          description: "Akumulasi transaksi paid",
          accent: "from-blue-500 to-blue-600"
        },
        {
          title: "Total Transaksi",
          value: `${Number(dashboardData.kpis.total_transactions || 0)} transaksi`,
          description: "Jumlah transaksi paid",
          accent: "from-sky-500 to-blue-500"
        },
        {
          title: "Total Fee POS",
          value: formatCurrency(dashboardData.kpis.total_fee || 0),
          description: "Akumulasi fee layanan",
          accent: "from-indigo-500 to-blue-600"
        },
        {
          title: "Rata-rata Transaksi",
          value: formatCurrency(dashboardData.kpis.average_transaction || 0),
          description: "Nilai rata-rata per transaksi",
          accent: "from-blue-700 to-indigo-600"
        }
      ],
      recentTransactions: dashboardData.recentTransactions,
      recentTransactionsPagination: dashboardData.recentTransactionsPagination,
      cashierMonitor: dashboardData.cashierMonitor,
      chartData: dashboardData.chartData,
      chartRangeLabel: getChartRangeLabel(filter),
      todayLabel: new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date())
    });
  } catch (error) {
    console.error("Manager dashboard error:", error);

    return res.status(500).render("manager/dashboard", {
      pageTitle: "Manager Dashboard",
      filters: [
        { key: "today", label: "Hari Ini" },
        { key: "week", label: "Minggu Ini" },
        { key: "month", label: "Bulan Ini" },
        { key: "all", label: "Semua" }
      ],
      activeFilter: filter,
      summaryCards: [
        {
          title: "Total Penjualan",
          value: formatCurrency(0),
          description: "Akumulasi transaksi paid",
          accent: "from-blue-500 to-blue-600"
        },
        {
          title: "Total Transaksi",
          value: "0 transaksi",
          description: "Jumlah transaksi paid",
          accent: "from-sky-500 to-blue-500"
        },
        {
          title: "Total Fee POS",
          value: formatCurrency(0),
          description: "Akumulasi fee layanan",
          accent: "from-indigo-500 to-blue-600"
        },
        {
          title: "Rata-rata Transaksi",
          value: formatCurrency(0),
          description: "Nilai rata-rata per transaksi",
          accent: "from-blue-700 to-indigo-600"
        }
      ],
      recentTransactions: [],
      recentTransactionsPagination: {
        currentPage: 1,
        perPage: RECENT_TRANSACTIONS_PER_PAGE,
        totalItems: 0,
        totalPages: 1
      },
      cashierMonitor: [],
      chartData: {
        labels: [],
        totals: []
      },
      chartRangeLabel: getChartRangeLabel(filter),
      todayLabel: new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date()),
      dashboardError: "Gagal memuat dashboard manager dari database."
    });
  }
};

exports.exportCsv = async (req, res) => {
  const filter = ALLOWED_FILTERS.includes(req.query.filter) ? req.query.filter : "all";

  try {
    const transactions = await TransactionModel.getManagerReportTransactions(filter);
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: "invoice", title: "Invoice" },
        { id: "customer_name", title: "Konsumen" },
        { id: "cashier_name", title: "Kasir" },
        { id: "grand_total", title: "Total" },
        { id: "fee", title: "Fee" },
        { id: "payment_method", title: "Metode Bayar" },
        { id: "status", title: "Status" },
        { id: "created_at_formatted", title: "Tanggal" }
      ]
    });

    const records = transactions.map((transaction) => ({
      invoice: transaction.invoice,
      customer_name: transaction.customer_name || transaction.customer_email || "Konsumen",
      cashier_name: transaction.cashier_name || "-",
      grand_total: Number(transaction.grand_total || 0),
      fee: Number(transaction.fee || 0),
      payment_method: transaction.payment_method || "-",
      status: transaction.status,
      created_at_formatted: formatDate(transaction.created_at)
    }));

    const csvContent = `${csvStringifier.getHeaderString()}${csvStringifier.stringifyRecords(records)}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="warungpos-manager-${filter}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    console.error("Manager export CSV error:", error);
    return res.status(500).render("errors/500", {
      pageTitle: "Server Error"
    });
  }
};

exports.exportPdf = async (req, res) => {
  const filter = ALLOWED_FILTERS.includes(req.query.filter) ? req.query.filter : "all";

  try {
    const [dashboardData, transactions] = await Promise.all([
      getManagerDashboardData(filter),
      TransactionModel.getManagerReportTransactions(filter)
    ]);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="warungpos-manager-${filter}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text("WarungPOS Manager Report", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#475569").text(`Filter: ${getFilterMeta(filter)}`);
    doc.text(`Generated: ${new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date())}`);
    doc.fillColor("#111827");
    doc.moveDown();

    const kpiLines = [
      `Total Penjualan: ${formatCurrency(dashboardData.kpis.total_sales || 0)}`,
      `Total Transaksi: ${Number(dashboardData.kpis.total_transactions || 0)} transaksi`,
      `Total Fee POS: ${formatCurrency(dashboardData.kpis.total_fee || 0)}`,
      `Rata-rata Transaksi: ${formatCurrency(dashboardData.kpis.average_transaction || 0)}`
    ];

    kpiLines.forEach((line) => doc.fontSize(11).text(line));
    doc.moveDown();
    doc.fontSize(14).text("Daftar Transaksi");
    doc.moveDown(0.5);

    if (transactions.length === 0) {
      doc.fontSize(11).text("Belum ada transaksi untuk periode ini.");
    } else {
      transactions.forEach((transaction, index) => {
        doc.fontSize(11).text(
          `${index + 1}. ${transaction.invoice} | ${transaction.customer_name || transaction.customer_email || "Konsumen"} | ${transaction.cashier_name || "-"} | ${formatCurrency(transaction.grand_total || 0)} | ${transaction.payment_method || "-"} | ${transaction.status} | ${formatDate(transaction.created_at)}`
        );
        if (doc.y > 760) {
          doc.addPage();
        }
      });
    }

    doc.end();
  } catch (error) {
    console.error("Manager export PDF error:", error);
    return res.status(500).render("errors/500", {
      pageTitle: "Server Error"
    });
  }
};
