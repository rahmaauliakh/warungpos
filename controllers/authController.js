const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");
const UserModel = require("../models/userModel");

const ROLE_REDIRECTS = {
  manager: "/manager",
  operator: "/operator",
  kasir: "/kasir",
  konsumen: "/konsumen"
};

const getSafeUserSession = (user) => ({
  id: user.id,
  nama: user.nama,
  email: user.email,
  role: user.role
});

exports.showLogin = (req, res) => {
  if (req.session.user?.role) {
    return res.redirect(ROLE_REDIRECTS[req.session.user.role] || "/login");
  }

  return res.render("auth/login", {
    error: null,
    oldInput: {
      email: ""
    }
  });
};

exports.showRegister = (req, res) => {
  if (req.session.user?.role) {
    return res.redirect(ROLE_REDIRECTS[req.session.user.role] || "/login");
  }

  return res.render("auth/register", {
    error: null,
    oldInput: {
      nama: "",
      email: ""
    }
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).render("auth/login", {
      error: errors.array()[0].msg,
      oldInput: {
        email: normalizedEmail
      }
    });
  }

  if (!normalizedEmail || !password) {
    return res.status(400).render("auth/login", {
      error: "Email dan password wajib diisi.",
      oldInput: {
        email: normalizedEmail
      }
    });
  }

  try {
    const user = await UserModel.findByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).render("auth/login", {
        error: "Email atau password tidak valid.",
        oldInput: {
          email: normalizedEmail
        }
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).render("auth/login", {
        error: "Email atau password tidak valid.",
        oldInput: {
          email: normalizedEmail
        }
      });
    }

    const redirectPath = ROLE_REDIRECTS[user.role];

    if (!redirectPath) {
      return res.status(403).render("auth/login", {
        error: "Role user tidak diizinkan mengakses sistem.",
        oldInput: {
          email: normalizedEmail
        }
      });
    }

    req.session.user = getSafeUserSession(user);

    return req.session.save((sessionError) => {
      if (sessionError) {
        return res.status(500).render("auth/login", {
          error: "Terjadi kesalahan saat menyimpan sesi login.",
          oldInput: {
            email: normalizedEmail
          }
        });
      }

      return res.redirect(redirectPath);
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).render("auth/login", {
      error: "Terjadi kesalahan pada server.",
      oldInput: {
        email: normalizedEmail
      }
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};

exports.register = async (req, res) => {
  const { nama, email, password, confirmPassword } = req.body;
  const normalizedNama = nama ? nama.trim() : "";
  const normalizedEmail = email ? email.trim().toLowerCase() : "";
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).render("auth/register", {
      error: errors.array()[0].msg,
      oldInput: {
        nama: normalizedNama,
        email: normalizedEmail
      }
    });
  }

  if (!normalizedNama || !normalizedEmail || !password || !confirmPassword) {
    return res.status(400).render("auth/register", {
      error: "Semua field wajib diisi.",
      oldInput: {
        nama: normalizedNama,
        email: normalizedEmail
      }
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).render("auth/register", {
      error: "Konfirmasi password tidak sama.",
      oldInput: {
        nama: normalizedNama,
        email: normalizedEmail
      }
    });
  }

  try {
    const existingUser = await UserModel.findByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).render("auth/register", {
        error: "Email sudah terdaftar.",
        oldInput: {
          nama: normalizedNama,
          email: normalizedEmail
        }
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await UserModel.create({
      nama: normalizedNama,
      email: normalizedEmail,
      password: hashedPassword,
      role: "konsumen"
    });

    req.session.flash = {
      type: "success",
      message: "Registrasi berhasil. Silakan login."
    };

    return res.redirect("/login");
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).render("auth/register", {
      error: "Terjadi kesalahan pada server.",
      oldInput: {
        nama: normalizedNama,
        email: normalizedEmail
      }
    });
  }
};

exports.renderRoleDashboard = (role) => (req, res) => {
  res.render("auth/dashboard", {
    title: `Dashboard ${role}`,
    role
  });
};
