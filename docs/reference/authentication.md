# Bluekey SSO Authentication

Vellum Rift uses the University of Memphis **Bluekey** Single Sign-On system for authentication. This document describes how auth works and how to add it to new routes.

---

## Quick Reference

| Action | Code |
|--------|------|
| Protect a route | `app.post("/api/upload", requireAuth, handler)` |
| Protect a router | `app.use("/api/upload", requireAuth, uploadRouter)` |
| Get the current user | `req.user!.sub` (user ID) or `req.user!.email` |
| Dev mode stub user | `{ sub: "acct:dev", email: "dev@memphis.edu" }` |

---

## How It Works

### Development Mode (default)

When `AUTH_REQUIRED` is **not set** in `.env`, the `requireAuth` middleware silently attaches a stub user and passes every request through. No token is needed. This lets developers build features without setting up Bluekey.

### Production Mode

Set these in `.env`:

```
BLUEKEY_SOFTWARE_ID=your-app-uuid-here
AUTH_REQUIRED=true
```

When enabled, `requireAuth` will:

1. Extract the `Bearer` token from the `Authorization` header
2. Call `POST https://iis.memphis.edu/apis/bluekey/public/sso/introspect` to verify it
3. Attach the verified user to `req.user` on success
4. Return `401 { error: "..." }` on failure

---

## Adding Auth to a New Route

### 1. Import the middleware

```typescript
import { requireAuth } from "./lib/auth.js";
```

### 2. Apply it

**For a single handler:**

```typescript
app.post("/api/upload", requireAuth, uploadHandler);
```

**For an entire router:**

```typescript
app.use("/api/upload", requireAuth, uploadRouter);
```

### 3. Use the authenticated user

```typescript
function uploadHandler(req: Request, res: Response) {
  const userId = req.user!.sub;   // e.g. "acct:123"
  const email  = req.user!.email; // e.g. "user@memphis.edu"

  // ... your handler logic ...
}
```

The `req.user` object is typed as `AuthenticatedUser`:

```typescript
interface AuthenticatedUser {
  sub: string;   // Bluekey user ID
  email: string; // User's email
  exp: number;   // Token expiry timestamp
}
```

---

## Public vs Protected Routes

| Route | Status |
|-------|--------|
| `GET /health` | Public |
| `GET /api/health` | Public |
| `GET /api/game-state/*` | Protected |
| `POST /api/game-state/*` | Protected |
| `DELETE /api/game-state/*` | Protected |
| `GET /api/models/*` | Protected |
| `POST /api/models/*` | Protected |

Add new routes to `backend/src/index.ts` in the appropriate section.

---

## Frontend: Bluekey Login Popup

The frontend uses a popup flow. Key constants from the Bluekey docs:

```typescript
const BLUEKEY_SOFTWARE_ID = "YOUR_APP_UUID";
const BLUEKEY_PORTAL_URL  = "https://iis.memphis.edu/static/bluekey/";
const BLUEKEY_ORIGIN      = "https://iis.memphis.edu";
```

**Flow:**

1. Open a popup: `window.open(BLUEKEY_PORTAL_URL + "?appUuid=" + BLUEKEY_SOFTWARE_ID + "&mode=popup", ...)`
2. Listen for `message` events and validate `event.origin === BLUEKEY_ORIGIN`
3. Store the `accessToken` from the event data
4. Send it as `Authorization: Bearer <token>` on all API calls

---

## File Locations

| File | Purpose |
|------|---------|
| `backend/src/lib/auth.ts` | Middleware implementation |
| `backend/src/lib/auth.test.ts` | Tests |
| `backend/.env.example` | Env var reference |
| `docs/reference/authentication.md` | This document |

---

## Enabling Production Auth

When you have a real `BLUEKEY_SOFTWARE_ID`:

1. Set `BLUEKEY_SOFTWARE_ID` and `AUTH_REQUIRED=true` in `.env`
2. In `backend/src/lib/auth.ts`, uncomment the real `introspectToken` implementation (lines 92-116)
3. Remove the dev-mode stub branch (lines 80-90)
4. Test that protected routes return 401 without a token
5. Test that protected routes return 200 with a valid Bluekey token