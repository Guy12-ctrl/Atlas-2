const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DERIV_CLIENT_ID;
const REDIRECT_URI =
  process.env.DERIV_REDIRECT_URI ||
  "https://atlas-2-iy4i.onrender.com/auth/callback";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "atlas-development-secret-change-me";

if (!CLIENT_ID) {
  console.warn("⚠️ DERIV_CLIENT_ID n'est pas configuré.");
}

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

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   UTILITAIRES PKCE
========================= */

function generateCodeVerifier() {
  return crypto
    .randomBytes(64)
    .toString("base64url")
    .slice(0, 96);
}

function generateCodeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

/* =========================
   CONNEXION DERIV
========================= */

app.get("/auth/login", (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).send("DERIV_CLIENT_ID n'est pas configuré.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  const authUrl = new URL("https://auth.deriv.com/oauth2/auth");

  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);

  // ATLAS demande uniquement l'accès nécessaire au trading.
  authUrl.searchParams.set("scope", "trade");

  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  res.redirect(authUrl.toString());
});

/* =========================
   CALLBACK DERIV
========================= */

app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <h2>Connexion Deriv annulée</h2>
        <p>${error_description || error}</p>
        <p><a href="/">Retour à ATLAS</a></p>
      `);
    }

    if (!code || !state) {
      return res.status(400).send("Code ou state manquant.");
    }

    if (!req.session.oauthState || state !== req.session.oauthState) {
      return res.status(400).send("Erreur de sécurité : state invalide.");
    }

    if (!req.session.codeVerifier) {
      return res.status(400).send("Code PKCE manquant.");
    }

    const response = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: req.session.codeVerifier,
        redirect_uri: REDIRECT_URI
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erreur Deriv:", data);
      return res.status(400).send(`
        <h2>Erreur de connexion Deriv</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
        <p><a href="/">Retour à ATLAS</a></p>
      `);
    }

    /*
      Le token reste côté serveur.
      Il n'est jamais envoyé directement au navigateur.
    */
    req.session.derivAccessToken = data.access_token;

    delete req.session.oauthState;
    delete req.session.codeVerifier;

    res.redirect("/?connected=1");
  } catch (error) {
    console.error(error);

    res.status(500).send(`
      <h2>Erreur serveur ATLAS</h2>
      <p>Impossible de terminer la connexion Deriv.</p>
      <p><a href="/">Retour à ATLAS</a></p>
    `);
  }
});

/* =========================
   STATUT CONNEXION
========================= */

app.get("/api/auth/status", (req, res) => {
  res.json({
    connected: Boolean(req.session.derivAccessToken)
  });
});

/* =========================
   DÉCONNEXION
========================= */

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* =========================
   TEST SERVEUR
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    platform: "ATLAS",
    derivOAuth: Boolean(CLIENT_ID)
  });
});

/* =========================
   SERVEUR
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ATLAS fonctionne sur le port ${PORT}`);
});const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DERIV_CLIENT_ID;
const REDIRECT_URI =
  process.env.DERIV_REDIRECT_URI ||
  "https://atlas-2-iy4i.onrender.com/auth/callback";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "atlas-development-secret-change-me";

if (!CLIENT_ID) {
  console.warn("⚠️ DERIV_CLIENT_ID n'est pas configuré.");
}

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

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   UTILITAIRES PKCE
========================= */

function generateCodeVerifier() {
  return crypto
    .randomBytes(64)
    .toString("base64url")
    .slice(0, 96);
}

function generateCodeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

/* =========================
   CONNEXION DERIV
========================= */

app.get("/auth/login", (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).send("DERIV_CLIENT_ID n'est pas configuré.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  const authUrl = new URL("https://auth.deriv.com/oauth2/auth");

  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);

  // ATLAS demande uniquement l'accès nécessaire au trading.
  authUrl.searchParams.set("scope", "trade");

  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  res.redirect(authUrl.toString());
});

/* =========================
   CALLBACK DERIV
========================= */

app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <h2>Connexion Deriv annulée</h2>
        <p>${error_description || error}</p>
        <p><a href="/">Retour à ATLAS</a></p>
      `);
    }

    if (!code || !state) {
      return res.status(400).send("Code ou state manquant.");
    }

    if (!req.session.oauthState || state !== req.session.oauthState) {
      return res.status(400).send("Erreur de sécurité : state invalide.");
    }

    if (!req.session.codeVerifier) {
      return res.status(400).send("Code PKCE manquant.");
    }

    const response = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: req.session.codeVerifier,
        redirect_uri: REDIRECT_URI
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erreur Deriv:", data);
      return res.status(400).send(`
        <h2>Erreur de connexion Deriv</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
        <p><a href="/">Retour à ATLAS</a></p>
      `);
    }

    /*
      Le token reste côté serveur.
      Il n'est jamais envoyé directement au navigateur.
    */
    req.session.derivAccessToken = data.access_token;

    delete req.session.oauthState;
    delete req.session.codeVerifier;

    res.redirect("/?connected=1");
  } catch (error) {
    console.error(error);

    res.status(500).send(`
      <h2>Erreur serveur ATLAS</h2>
      <p>Impossible de terminer la connexion Deriv.</p>
      <p><a href="/">Retour à ATLAS</a></p>
    `);
  }
});

/* =========================
   STATUT CONNEXION
========================= */

app.get("/api/auth/status", (req, res) => {
  res.json({
    connected: Boolean(req.session.derivAccessToken)
  });
});

/* =========================
   DÉCONNEXION
========================= */

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* =========================
   TEST SERVEUR
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    platform: "ATLAS",
    derivOAuth: Boolean(CLIENT_ID)
  });
});

/* =========================
   SERVEUR
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ATLAS fonctionne sur le port ${PORT}`);
});
