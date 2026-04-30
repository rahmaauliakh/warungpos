const db = require("../config/db");

exports.findByEmail = (email) => new Promise((resolve, reject) => {
  const query = `
    SELECT id, COALESCE(nama, name) AS nama, email, password, role
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
