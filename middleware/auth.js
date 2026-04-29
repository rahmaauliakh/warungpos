const ROLE_REDIRECTS = {
  manager: "/manager",
  operator: "/operator",
  kasir: "/kasir",
  konsumen: "/konsumen"
};

exports.requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  return next();
};

exports.requireRole = (role) => (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  if (req.session.user.role !== role) {
    return res.status(403).render("errors/403", {
      pageTitle: "Access Denied",
      requestedRole: role,
      fallbackPath: ROLE_REDIRECTS[req.session.user.role] || "/login"
    });
  }

  return next();
};
