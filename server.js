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

app.use(express.json({ limit: "1mb" }));
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

/* =========================================================
   FRONTEND
========================================================= */

const frontendPath = path.join(__dirname, "frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================================================
   UTILITAIRE DERIV
========================================================= */

function derivHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Deriv-App-ID": DERIV_APP_ID,
    "Content-Type": "application/json"
  };
}

async function parseDerivResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      errors: [
        {
          message: `Réponse inattendue de Deriv (${response.status}).`
        }
      ]
    };
  }
}

/* =========================================================
   CONNEXION PAR PAT
========================================================= */

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
      ATLAS vérifie le PAT auprès de Deriv.
    */

    const response = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",
        headers: derivHeaders(token)
      }
    );

    const data = await parseDerivResponse(response);

    if (!response.ok) {
      console.error("Erreur Deriv :", data);

      return res.status(response.status).json({
        success: false,
        message:
          data?.errors?.[0]?.message ||
          "Token invalide ou permissions insuffisantes."
      });
    }

    /*
      Le PAT reste uniquement côté serveur.
    */

    req.session.derivAccessToken = token;

    req.session.derivAccounts =
      data?.data || data;

    return res.json({
      success: true,
      accounts:
        data?.data || data
    });

  } catch (error) {

    console.error("Erreur connexion PAT :", error);

    return res.status(500).json({
      success: false,
      message:
        "Impossible de contacter l'API Deriv."
    });
  }
});

/* =========================================================
   STATUT AUTHENTIFICATION
========================================================= */

app.get("/api/auth/status", (req, res) => {

  res.json({
    connected:
      Boolean(req.session.derivAccessToken),

    accounts:
      req.session.derivAccounts || []
  });
});

/* =========================================================
   COMPTES DERIV
========================================================= */

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

/* =========================================================
   WEBSOCKET AUTHENTIFIÉ
========================================================= */

app.post("/api/deriv/otp", async (req, res) => {

  try {

    if (!req.session.derivAccessToken) {

      return res.status(401).json({
        success: false,
        message: "ATLAS n'est pas connecté."
      });
    }

    const accountId =
      String(req.body.accountId || "").trim();

    if (!accountId) {

      return res.status(400).json({
        success: false,
        message: "Identifiant du compte manquant."
      });
    }

    /*
      Deriv fournit une URL WebSocket temporaire
      authentifiée avec un OTP.
    */

    const response = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(
        accountId
      )}/otp`,
      {
        method: "POST",

        headers: derivHeaders(
          req.session.derivAccessToken
        )
      }
    );

    const data =
      await parseDerivResponse(response);

    if (!response.ok) {

      console.error(
        "Erreur OTP Deriv :",
        data
      );

      return res.status(response.status).json({
        success: false,

        message:
          data?.errors?.[0]?.message ||
          "Impossible de créer la connexion WebSocket."
      });
    }

    const websocketUrl =
      data?.data?.url ||
      data?.url ||
      null;

    if (!websocketUrl) {

      return res.status(500).json({
        success: false,
        message:
          "Deriv n'a pas fourni d'URL WebSocket."
      });
    }

    return res.json({
      success: true,
      url: websocketUrl
    });

  } catch (error) {

    console.error(
      "Erreur WebSocket :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de préparer la connexion WebSocket."
    });
  }
});

/* =========================================================
   DECONNEXION
========================================================= */

app.post("/auth/logout", (req, res) => {

  req.session.destroy(() => {

    res.json({
      success: true
    });

  });
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {

  res.json({

    status: "ok",

    platform: "ATLAS",

    authentication: "PAT",

    derivAppConfigured:
      Boolean(DERIV_APP_ID)

  });

});

/* =========================================================
   SERVEUR
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 ATLAS fonctionne sur le port ${PORT}`
    );

  }
);
