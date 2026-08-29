# ATLAS V1 — Deriv OAuth 2.0

Cette V1 contient :
- frontend ATLAS sombre responsive ;
- authentification Deriv OAuth 2.0 avec PKCE ;
- validation du paramètre state ;
- échange du code OAuth côté serveur ;
- stockage du token dans la session serveur, jamais dans le frontend ;
- récupération du statut de session ;
- base prête pour connecter ensuite comptes, solde, marchés privés et WebSocket authentifié.

## 1. Prérequis

Node.js 20+ recommandé.

## 2. Installer

```bash
npm install
```

## 3. Configurer Deriv

Enregistrer une application OAuth 2.0 chez Deriv.

Définir comme redirect URI exactement :

`http://localhost:3000/auth/callback`

Puis copier le client ID dans `.env`.

Créer `.env` à partir de `.env.example`.

## 4. Lancer

```bash
npm start
```

Ouvrir :

`http://localhost:3000`

## 5. Flux de connexion

ATLAS :
1. génère un code_verifier et un state ;
2. dérive code_challenge avec SHA-256 ;
3. redirige vers Deriv ;
4. reçoit code + state ;
5. vérifie state ;
6. échange code + code_verifier contre access_token côté serveur ;
7. conserve le token dans la session serveur ;
8. expose uniquement un statut de connexion au navigateur.

## Important

Ne mets jamais `DERIV_CLIENT_ID`, les tokens ou le `SESSION_SECRET` dans le frontend.
Pour la mise en production, utilise HTTPS, un vrai secret de session, un store de session persistant et une URL HTTPS enregistrée chez Deriv.

Cette V1 ne place volontairement aucun ordre réel. Le bouton de trading est réservé à l'étape suivante, après validation de l'authentification et du compte démo.
