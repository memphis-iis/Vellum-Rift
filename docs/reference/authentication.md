# Bluekey SSO Authentication

Vellum Rift uses the University of Memphis **Bluekey** Single Sign-On system for authentication. This document describes how auth works, which routes are public vs protected, and how to add auth to new routes.

GlyphWitch document/team ACL workflows are **out of scope** for now. Route protection is Bluekey identity when `AUTH_REQUIRED=true`.

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

When `AUTH_REQUIRED` is **not** `true` in `.env`, `requireAuth` attaches a stub user and allows every request. No token is needed. This is for local development only.

### Shared / Test / Production Hosts

**Any shared or publicly reachable environment must set:**

```
BLUEKEY_SOFTWARE_ID=your-app-uuid-here
AUTH_REQUIRED=true
```

Without `AUTH_REQUIRED=true`, all "protected" routes behave as open (stub user). That is unsafe on shared hosts.

When enabled, `requireAuth` will:

1. Extract the `Bearer` token from the `Authorization` header
2. Call the Bluekey introspection endpoint (`BLUEKEY_INTROSPECT_URL`) to verify it
3. Attach the verified user to `req.user` on success
4. Return `401 { error: "..." }` on failure

Introspection is implemented in `backend/src/lib/auth.ts` (no uncomment step required).

---

## Public vs Protected Routes

Policy: only liveness/health endpoints are anonymous. Application data and processing surfaces require auth when `AUTH_REQUIRED=true`.

| Route family | Status | Rationale |
|--------------|--------|-----------|
| `GET /health` | **Public** | Load balancer / ops liveness |
| `GET /api/health` | **Public** | Same (includes coarse game-state stats) |
| `/api/game-state/*` | **Protected** | Session presence, chat, summon, lasers, artifacts |
| `/api/models/*` | **Protected** | Model metadata and generation |
| `/api/upload` | **Protected** | Manuscript upload / processing start |
| `/api/jobs/*` | **Protected** | Job status and listing (processing progress) |
| `/api/assets/*` | **Protected** | Asset manifests / progressive chunk discovery |
| `/api/lod-tiers/*` | **Protected** | Platform LoD budgets |

There are **no** intentional public discovery endpoints for jobs, assets, or LoD tiers. Clients that poll job progress or load manifests must send `Authorization: Bearer <token>` whenever auth is required.

Wire new routers in `backend/src/index.ts` under the protected section unless there is an explicit, documented reason to leave them public.

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
  // ...
}
```

```typescript
interface AuthenticatedUser {
  sub: string;   // Bluekey user ID
  email: string; // User's email
  exp: number;   // Token expiry timestamp
}
```

---

## Frontend: Bluekey Login Popup

```typescript
const BLUEKEY_SOFTWARE_ID = "YOUR_APP_UUID";
const BLUEKEY_PORTAL_URL  = "https://iis.memphis.edu/static/bluekey/";
const BLUEKEY_ORIGIN      = "https://iis.memphis.edu";
```

**Flow:**

1. Open a popup: `window.open(BLUEKEY_PORTAL_URL + "?appUuid=" + BLUEKEY_SOFTWARE_ID + "&mode=popup", ...)`
2. Listen for `message` events and validate `event.origin === BLUEKEY_ORIGIN`
3. Store the `accessToken` from the event data
4. Send it as `Authorization: Bearer <token>` on **all** protected API calls (including jobs / assets / lod-tiers)

---

## File Locations

| File | Purpose |
|------|---------|
| `backend/src/lib/auth.ts` | Middleware + introspection |
| `backend/src/lib/auth.test.ts` | Middleware unit tests |
| `backend/src/routes/apiAuthPolicy.test.ts` | Route-family 401 policy tests |
| `backend/.env.example` | Env var reference |
| `docs/reference/authentication.md` | This document |

---

## Enabling Auth On A Shared Host

1. Register the app in Bluekey and set `BLUEKEY_SOFTWARE_ID`
2. Set `AUTH_REQUIRED=true`
3. Confirm protected routes return `401` without a token
4. Confirm protected routes succeed with a valid Bluekey Bearer token
5. Confirm Unity / dashboard clients attach the Bearer header on jobs, assets, and lod-tier calls
