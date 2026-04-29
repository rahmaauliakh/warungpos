const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const managerRoutes = require("./routes/managerRoutes");
const kasirRoutes = require("./routes/kasirRoutes");
const konsumenRoutes = require("./routes/konsumenRoutes");
const operatorRoutes = require("./routes/operatorRoutes");
const sanitizeInput = require("./middleware/sanitize");
const errorController = require("./controllers/errorController");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_MAX_AGE = 30 * 60 * 1000;

app.set("view engine", "ejs");
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sanitizeInput);
app.use(express.static("public"));

app.use(session({
  secret: "warungpossecret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: "lax"
  }
}));

app.use((req, res, next) => {
  if (req.session.user) {
    const now = Date.now();
    const lastActivity = req.session.lastActivity || now;

    if (now - lastActivity > SESSION_MAX_AGE) {
      return req.session.destroy(() => res.redirect("/login"));
    }

    req.session.lastActivity = now;
  }

  res.locals.sessionUser = req.session.user || null;
  req.flashData = req.session.flash || null;
  res.locals.flash = req.flashData;
  delete req.session.flash;
  res.locals.currentPath = req.path;
  next();
});

app.use("/", authRoutes);
app.use("/", managerRoutes);
app.use("/", operatorRoutes);
app.use("/", konsumenRoutes);
app.use("/", kasirRoutes);

app.use(errorController.notFound);
app.use(errorController.serverError);

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
