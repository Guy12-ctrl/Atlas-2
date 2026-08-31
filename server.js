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

const DERIV_API =
  "https://api.derivws.com";

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

/* =====================================================
   FRONTEND
===================================================== */

const frontendPath = path.join(__dirname, "frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =====================================================
   AUTHENTIFICATION PAT
===================================================== */

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

    /*
      Le PAT reste uniquement côté serveur.
      Il n'est jamais renvoyé au navigateur.
    */

    const response = await fetch(
      `${DERIV_API}/trading/v1/options/accounts`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Deriv-App-ID": DERIV_APP_ID,
          Accept: "application/json"
        }
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        errors: [
          {
            message:
              "Réponse inattendue reçue de Deriv."
          }
        ]
      };
    }

    if (!response.ok) {
      console.error(
        "Erreur comptes Deriv:",
        response.status,
        data
      );

      return res.status(response.status).json({
        success: false,
        message:
          data?.errors?.[0]?.message ||
          "PAT invalide ou permissions insuffisantes."
      });
    }

    /*
      On conserve le PAT dans la session serveur.
    */

    req.session.derivAccessToken = token;

    /*
      La réponse des comptes est conservée
      pour permettre au frontend de choisir
      le compte à utiliser.
    */

    const accounts =
      data?.data ||
      data?.accounts ||
      [];

    req.session.derivAccounts = accounts;

    return res.json({
      success: true,
      accounts
    });

  } catch (error) {
    console.error(
      "Erreur /auth/token:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de contacter l'API Deriv."
    });
  }
});

/* =====================================================
   STATUT AUTHENTIFICATION
===================================================== */

app.get("/api/auth/status", (req, res) => {

  res.json({
    connected:
      Boolean(req.session.derivAccessToken),

    accounts:
      req.session.derivAccounts || []
  });

});

/* =====================================================
   OBTENIR L'URL WEBSOCKET AUTHENTIFIÉE
===================================================== */

app.post("/api/deriv/otp", async (req, res) => {

  try {

    if (!req.session.derivAccessToken) {
      return res.status(401).json({
        success: false,
        message:
          "ATLAS n'est pas connecté à Deriv."
      });
    }

    if (!DERIV_APP_ID) {
      return res.status(500).json({
        success: false,
        message:
          "DERIV_APP_ID n'est pas configuré."
      });
    }

    const accountId =
      String(req.body.accountId || "").trim();

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message:
          "Identifiant du compte manquant."
      });
    }

    /*
      Deriv demande un OTP REST pour ouvrir
      ensuite le WebSocket authentifié.
    */

    const response = await fetch(
      `${DERIV_API}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${req.session.derivAccessToken}`,

          "Deriv-App-ID":
            DERIV_APP_ID,

          Accept:
            "application/json"
        }
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        errors: [
          {
            message:
              "Réponse OTP invalide de Deriv."
          }
        ]
      };
    }

    if (!response.ok) {

      console.error(
        "Erreur OTP Deriv:",
        response.status,
        data
      );

      return res.status(response.status).json({
        success: false,
        message:
          data?.errors?.[0]?.message ||
          "Impossible d'obtenir la connexion WebSocket."
      });
    }

    const url =
      data?.data?.url ||
      data?.url;

    if (!url) {

      console.error(
        "OTP sans URL:",
        data
      );

      return res.status(500).json({
        success: false,
        message:
          "Deriv n'a pas fourni d'URL WebSocket."
      });
    }

    return res.json({
      success: true,
      url
    });

  } catch (error) {

    console.error(
      "Erreur /api/deriv/otp:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible d'établir la connexion WebSocket Deriv."
    });
  }

});

/* =====================================================
   COMPTES
===================================================== */

app.get("/api/deriv/accounts", (req, res) => {

  if (!req.session.derivAccessToken) {
    return res.status(401).json({
      success: false,
      message:
        "ATLAS n'est pas connecté à Deriv."
    });
  }

  res.json({
    success: true,
    accounts:
      req.session.derivAccounts || []
  });

});

/* =====================================================
   DÉCONNEXION
===================================================== */

app.post("/auth/logout", (req, res) => {

  req.session.destroy(() => {

    res.json({
      success: true
    });

  });

});

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/api/health", (req, res) => {

  res.json({
    status: "ok",
    platform: "ATLAS",
    authentication: "PAT",
    derivAppConfigured:
      Boolean(DERIV_APP_ID),
    websocket:
      "OTP authenticated"
  });

});

/* =====================================================
   SERVEUR
===================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 ATLAS fonctionne sur le port ${PORT}`
    );

  }
);
