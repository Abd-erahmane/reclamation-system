const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./db");
console.log("SERVER FILE LOADED");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Pour les requêtes JSON
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

/* ===== MIDDLEWARE ADMIN ===== */
function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/");
  }
  next();
}

/* ===== DASHBOARD PROTÉGÉ ===== */
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const user = req.session.user;

  if (user.role === "admin") {
    db.query(
      `SELECT r.*, u.email 
       FROM reclamations r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC`,
      (err, reclamations) => {
        if (err) return res.send("Erreur serveur");

        // 🔔 Stats de base
        const total = reclamations.length;
        const openCount = reclamations.filter(r => r.status === "ouvert").length;
        const treatedCount = total - openCount;

        // 📊 Calculs analytiques
        const resolutionRate = total > 0 ? ((treatedCount / total) * 100).toFixed(1) : 0;

        // Temps moyen de traitement (en heures)
        const treatedItems = reclamations.filter(r => r.status === "traité" && r.treated_at);
        let avgProcessingTime = 0;
        if (treatedItems.length > 0) {
          const totalMs = treatedItems.reduce((acc, r) => {
            const start = new Date(r.created_at);
            const end = new Date(r.treated_at);
            return acc + (end - start);
          }, 0);
          avgProcessingTime = (totalMs / treatedItems.length / (1000 * 60 * 60)).toFixed(2);
        }

        // Utilisateurs les plus actifs
        const userActivity = {};
        reclamations.forEach(r => {
          userActivity[r.email] = (userActivity[r.email] || 0) + 1;
        });
        const activeUsers = Object.entries(userActivity)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        // Volume par jour (7 derniers jours)
        const volumeByDay = {};
        const now = new Date();
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(now.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          volumeByDay[dateStr] = 0;
        }

        reclamations.forEach(r => {
          const dateStr = new Date(r.created_at).toISOString().split('T')[0];
          if (volumeByDay[dateStr] !== undefined) {
            volumeByDay[dateStr]++;
          }
        });

        res.render("dashboard", {
          user,
          reclamations,
          openCount,
          stats: {
            resolutionRate,
            avgProcessingTime,
            activeUsers,
            volumeData: Object.entries(volumeByDay).reverse()
          },
          userReclamations: null
        });
      }
    );
  } else {
    db.query(
      "SELECT * FROM reclamations WHERE user_id = ? ORDER BY created_at DESC",
      [user.id],
      (err, userReclamations) => {
        if (err) return res.send("Erreur serveur");

        res.render("dashboard", {
          user,
          reclamations: [],
          openCount: 0,
          stats: null,
          userReclamations
        });
      }
    );
  }
});

/* ===== ENVOYER UNE RÉCLAMATION ===== */
app.post("/reclamation", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const { subject, message, priority } = req.body;

  db.query(
    "INSERT INTO reclamations (user_id, subject, message, priority) VALUES (?, ?, ?, ?)",
    [req.session.user.id, subject, message, priority || 'Moyenne'],
    err => {
      if (err) return res.send("Erreur serveur");
      res.redirect("/dashboard");
    }
  );
});

/* ===== CHANGER LE STATUT D'UNE RÉCLAMATION (ADMIN) ===== */
app.post("/reclamation/status", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/");
  }

  const { id, admin_comment } = req.body;

  db.query(
    "UPDATE reclamations SET status='traité', treated_at=CURRENT_TIMESTAMP, admin_comment=? WHERE id=?",
    [admin_comment || null, id],
    () => res.redirect("/dashboard")
  );
});

/* ===== SUPPRIMER UNE RÉCLAMATION ===== */
app.post("/reclamation/delete", (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, error: "Non authentifié" });
  }

  const reclamationId = req.body.id;
  const userId = req.session.user.id;
  const isAdmin = req.session.user.role === "admin";

  // Vérifier si l'utilisateur a le droit de supprimer
  const query = isAdmin
    ? "DELETE FROM reclamations WHERE id = ?"
    : "DELETE FROM reclamations WHERE id = ? AND user_id = ?";

  const params = isAdmin
    ? [reclamationId]
    : [reclamationId, userId];

  db.query(query, params, (err, result) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, error: "Erreur serveur" });
    }

    if (result.affectedRows === 0) {
      return res.json({ success: false, error: "Réclamation non trouvée ou non autorisée" });
    }

    res.json({ success: true });
  });
});

/* ===== LOGOUT ===== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===== LANCEMENT SERVEUR ===== */
app.listen(3000, () =>
  console.log("Serveur lancé : http://localhost:3000")
);
