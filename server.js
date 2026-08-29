const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.DERIV_CLIENT_ID;
const REDIRECT_URI = process.env.DERIV_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SCOPE = process.env.DERIV_SCOPE || "trade";

if (!CLIENT_ID) {
  console.warn("ATLAS: DERIV_CLIENT_ID n'est pas défini. Configure .env avant de tester OAuth.");
}

app.set("trust proxy", 1);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "..", "frontend")));

function base64url(buffer) {
  return buffer.toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

function pkceChallenge(verifier) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

app.get("/auth/login", (req, res) => {
  if (!CLIENT_ID) return res.status(500).send("DERIV_CLIENT_ID manquant.");

  const state = randomString(32);
  const verifier = randomString(48);
  const challenge = pkceChallenge(verifier);

  req.session.oauth = { state, verifier, createdAt: Date.now() };

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  res.redirect(`https://auth.deriv.com/oauth2/auth?${params.toString()}`);
});

app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`Connexion Deriv refusée : ${error_description || error}`);
    }

    const oauth = req.session.oauth;
    if (!oauth || !state || state !== oauth.state) {
      return res.status(400).send("Échec de sécurité OAuth : state invalide ou session expirée.");
    }

    if (!code) return res.status(400).send("Code OAuth manquant.");

    const response = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: oauth.verifier,
        redirect_uri: REDIRECT_URI
      })
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      console.error("Deriv token exchange:", data);
      return res.status(502).send("Deriv n'a pas accepté l'échange du code OAuth.");
    }

    req.session.oauth = null;
    req.session.deriv = {
      accessToken: data.access_token,
      tokenType: data.token_type || "Bearer",
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
    };

    res.redirect("/?connected=1");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur interne pendant la connexion Deriv.");
  }
});

app.get("/api/auth/status", (req, res) => {
  const d = req.session.deriv;
  res.json({
    connected: Boolean(d && d.accessToken),
    expiresAt: d?.expiresAt || null
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/*
  V1: helper serveur pour les prochains endpoints Deriv.
  Le token ne quitte jamais le serveur.
*/
async function derivFetch(url, options = {}) {
  const d = req.session.deriv;
  if (!d?.accessToken) throw new Error("NOT_AUTHENTICATED");

  const headers = {
    ...(options.headers || {}),
    "Authorization": `Bearer ${d.accessToken}`,
    "Deriv-App-ID": CLIENT_ID
  };

  return fetch(url, { ...options, headers });
}

/*
  Endpoint de santé. Les endpoints compte/OTP/trading seront ajoutés
  après validation du login OAuth.
*/
app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch("https://api.derivws.com/v1/health");
    const data = await r.json();
    res.json({ atlas: "ok", deriv: data });
  } catch {
    res.status(502).json({ atlas: "ok", deriv: "unreachable" });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ATLAS V1 : http://localhost:${PORT}`);
  console.log(`Callback OAuth : ${REDIRECT_URI}`);
});
