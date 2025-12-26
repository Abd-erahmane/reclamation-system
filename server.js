const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./db");
console.log("SERVER FILE LOADED");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.set("view engine", "ejs");

app.use(session({
  secret: "mobilis_secret",
  resave: false,
  saveUninitialized: false
}));

/* ===== PAGE LOGIN ===== */
app.get("/", (req, res) => {
  res.render("login", { error: null });
});

app.get("/register", (req, res) => {
    res.render("register", { error: null });
});


/* ===== TRAITEMENT LOGIN ===== */
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (results.length === 
        0) {
        return res.render("login", { error: "Identifiants incorrects" });
      }

      const user = results[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.render("login", { error: "Identifiants incorrects" });
      }

      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role
      };

      res.redirect("/dashboard");
    }
  );
});

/* ===== TRAITEMENT REGISTER ===== */
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render("register", { error: "Tous les champs sont obligatoires" });
  }

  db.query(
    "SELECT id FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (results.length > 0) {
        return res.render("register", { error: "Email déjà utilisé" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      db.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, 'user')",
        [email, hashedPassword],
        err => {
          if (err) {
            return res.render("register", { error: "Erreur serveur" });
          }
          res.redirect("/");
        }
      );
    }
  );
});
app.post("/reclamation", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const { subject, message } = req.body;

  db.query(
    "INSERT INTO reclamations (user_id, subject, message) VALUES (?, ?, ?)",
    [req.session.user.id, subject, message],
    err => {
      if (err) return res.send("Erreur serveur");
      res.redirect("/dashboard");
    }
  );
});
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const user = req.session.user;

  if (user.role === "admin") {
    db.query(
      `SELECT r.*, u.email 
       FROM reclamations r
       JOIN users u ON r.user_id = u.id`,
      (err, reclamations) => {

        if (err) return res.send("Erreur serveur");

        // 🔔 compter les réclamations ouvertes
        const openCount = reclamations.filter(r => r.status === "ouvert").length;

        res.render("dashboard", {
          user,
          reclamations,
          openCount
        });
      }
    );
  } else {
    db.query(
      "SELECT * FROM reclamations WHERE user_id = ?",
      [user.id],
      (err, reclamations) => {
        if (err) return res.send("Erreur serveur");

        res.render("dashboard", {
          user,
          reclamations
        });
      }
    );
  }
});

app.post("/reclamation/status", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/");
  }

  db.query(
    "UPDATE reclamations SET status='traite' WHERE id=?",
    [req.body.id],
    () => res.redirect("/dashboard")
  );
});
function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/");
  }
  next();
}

/* ===== DASHBOARD PROTÉGÉ ===== */
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.render("dashboard", { user: req.session.user });
});

/* ===== LOGOUT ===== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===== LANCEMENT SERVEUR ===== */
app.listen(3000, () =>
  console.log("Serveur lancé : http://localhost:3000")
);
