exports.notFound = (req, res) => {
  res.status(404).render("errors/404", {
    pageTitle: "Not Found"
  });
};

exports.serverError = (error, req, res, next) => {
  console.error("Unhandled error:", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).render("errors/500", {
    pageTitle: "Server Error"
  });
};
