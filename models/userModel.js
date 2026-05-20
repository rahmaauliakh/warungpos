const db = require("../config/db");

const querySingle = (query, values = []) => new Promise((resolve, reject) => {
  db.query(query, values, (error, results) => {
    if (error) {
      return reject(error);
    }

    return resolve(results[0] || null);
  });
});

const queryRun = (query, values = []) => new Promise((resolve, reject) => {
  db.query(query, values, (error, results) => {
    if (error) {
      return reject(error);
    }

    return resolve(results);
  });
});

exports.findByEmail = (email) => new Promise((resolve, reject) => {
  const query = `
    SELECT id, COALESCE(nama, name) AS nama, email, phone, password, role
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.query(query, [email], (error, results) => {
    if (error) {
      return reject(error);
    }

    return resolve(results[0] || null);
  });
});

exports.create = (user) => new Promise((resolve, reject) => {
  const query = `
    INSERT INTO users (name, nama, email, password, role)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [user.nama, user.nama, user.email, user.password, user.role], (error, results) => {
    if (error) {
      return reject(error);
    }

    return resolve({
      id: results.insertId,
      ...user
    });
  });
});

exports.findById = (id) => querySingle(
  `
    SELECT id, COALESCE(nama, name) AS nama, email, phone, role
    FROM users
    WHERE id = ?
    LIMIT 1
  `,
  [id]
);

exports.findByEmailExcludingId = (email, excludedId) => querySingle(
  `
    SELECT id, COALESCE(nama, name) AS nama, email, phone, role
    FROM users
    WHERE email = ? AND id <> ?
    LIMIT 1
  `,
  [email, excludedId]
);

exports.findPasswordById = (id) => querySingle(
  `
    SELECT id, password
    FROM users
    WHERE id = ?
    LIMIT 1
  `,
  [id]
);

exports.updateProfile = async ({ id, nama, email, phone }) => {
  await queryRun(
    `
      UPDATE users
      SET name = ?, nama = ?, email = ?, phone = ?
      WHERE id = ?
    `,
    [nama, nama, email, phone || null, id]
  );

  return exports.findById(id);
};

exports.updatePassword = (id, password) => queryRun(
  `
    UPDATE users
    SET password = ?
    WHERE id = ?
  `,
  [password, id]
);
