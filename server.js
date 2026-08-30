const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const DERIV_APP_ID = process.env.DERIV_APP_ID;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "atlas-development-secret-change-me";

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

/* =========================
   FRONTEND
========================= */

const frontendPath = path.join(__dirname, "frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   CONNEXION API TOKEN
========================= */

app.post("/auth/token", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "API Token manquant."
      });
    }

    if (!DERIV_APP_ID) {
      return res.status(500).json({
        success: false,
        message: "DERIV_APP_ID n'est pas configuré."
      });
    }

    const response = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Deriv-App-ID": DERIV_APP_ID,
          "Content-Type": "application/json"
        }
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    const raw = await response.text();

    let data;

    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = {
          errors: [
            {
              message: "Réponse JSON invalide de Deriv."
            }
          ]
        };
      }
    } else {
      data = {
        errors: [
          {
            message:
              "Deriv a renvoyé une réponse inattendue."
          }
        ]
      };
    }

    if (!response.ok) {
      console.error(
        "Erreur Deriv:",
        response.status,
        data
      );

      return res.status(response.status).json({
        success: false,
        message:
          data?.errors?.[0]?.message ||
          "API Token invalide ou permissions insuffisantes."
      });
    }

    req.session.derivAccessToken = token;
    req.session.derivAccounts =
      data.data || data;

    return res.json({
      success: true,
      message: "Compte Deriv connecté.",
      accounts: data.data || data
    });

  } catch (error) {

    console.error(
      "Erreur connexion Deriv:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de contacter l'API Deriv."
    });
  }
});

/* =========================
   STATUT
========================= */

app.get("/api/auth/status", (req, res) => {

  res.json({
    connected:
      Boolean(req.session.derivAccessToken)
  });

});

/* =========================
   COMPTES
========================= */

app.get("/api/deriv/accounts", (req, res) => {

  if (!req.session.derivAccessToken) {
    return res.status(401).json({
      success: false,
      message: "ATLAS n'est pas connecté à Deriv."
    });
  }

  res.json({
    success: true,
    accounts:
      req.session.derivAccounts || []
  });

});

/* =========================
   DÉCONNEXION
========================= */

app.post("/auth/logout", (req, res) => {

  req.session.destroy(() => {

    res.json({
      success: true
    });

  });

});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {

  res.json({
    status: "ok",
    platform: "ATLAS",
    authentication: "PAT",
    derivAppConfigured:
      Boolean(DERIV_APP_ID)
  });

});

/* =========================
   SERVEUR
========================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `🚀 ATLAS fonctionne sur le port ${PORT}`
  );

});
