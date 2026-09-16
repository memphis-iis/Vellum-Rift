import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  const sharedConnect = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryLibrary = sharedQuery;
  (globalThis as Record<string, unknown>).__pgMockConnectLibrary = sharedConnect;
  return {
    ...actual,
    default: {
      Pool: class {
        query = sharedQuery;
        connect = sharedConnect;
      },
    },
  };
});

const mocks = {
  query: (globalThis as Record<string, unknown>).__pgMockQueryLibrary as ReturnType<
    typeof vi.fn
  >,
  connect: (globalThis as Record<string, unknown>).__pgMockConnectLibrary as ReturnType<
    typeof vi.fn
  >,
};

import libraryRouter from "../routes/library.js";
import gltfModelRouter from "../routes/gltfModel.js";

const OWNER = { sub: "acct:owner", email: "owner@memphis.edu", exp: 9999999999 };
const STRANGER = { sub: "acct:stranger", email: "stranger@memphis.edu", exp: 9999999999 };
const SHAREE = { sub: "acct:sharee", email: "sharee@memphis.edu", exp: 9999999999 };

const LIBRARY_ID = "11111111-1111-1111-1111-111111111111";
const ROOT_ID = "22222222-2222-2222-2222-222222222222";
const UPLOADS_ID = "33333333-3333-3333-3333-333333333333";
const CHILD_ID = "44444444-4444-4444-4444-444444444444";
const MODEL_ID = "55555555-5555-5555-5555-555555555555";
const SHARE_ID = "66666666-6666-6666-6666-666666666666";

function libRow() {
  return {
    library_id: LIBRARY_ID,
    owner_sub: OWNER.sub,
    owner_email: OWNER.email,
    created_at: "2026-09-01T00:00:00.000Z",
  };
}

function folderRow(overrides: Record<string, unknown> = {}) {
  return {
    folder_id: ROOT_ID,
    library_id: LIBRARY_ID,
    parent_id: null,
    name: "",
    is_root: true,
    is_system: true,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function uploadsFolder() {
  return folderRow({
    folder_id: UPLOADS_ID,
    parent_id: ROOT_ID,
    name: "Uploads",
    is_root: false,
    is_system: true,
  });
}

function childFolder() {
  return folderRow({
    folder_id: CHILD_ID,
    parent_id: ROOT_ID,
    name: "Codices",
    is_root: false,
    is_system: false,
  });
}

function modelRow(overrides: Record<string, unknown> = {}) {
  return {
    model_id: MODEL_ID,
    session_id: null,
    label: "folio",
    storage_key: "models/folio.glb",
    height_mode: "red",
    width: 4,
    height: 4,
    vertex_count: 16,
    file_size: 1024,
    created_at: "2026-09-01T00:00:00.000Z",
    owner_sub: OWNER.sub,
    folder_id: UPLOADS_ID,
    ...overrides,
  };
}

function resolveFolder(folderId: string) {
  if (folderId === ROOT_ID) return folderRow();
  if (folderId === UPLOADS_ID) return uploadsFolder();
  if (folderId === CHILD_ID) return childFolder();
  return null;
}

function mockOwnerAclQueries(extra?: (sql: string, params?: unknown[]) => unknown | null) {
  mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    const fromExtra = extra?.(text, params);
    if (fromExtra != null) return fromExtra;

    if (text.includes("FROM library_folders WHERE folder_id")) {
      const row = resolveFolder(String(params?.[0] ?? ""));
      return { rows: row ? [row] : [] };
    }
    if (text.includes("FROM manuscript_libraries WHERE library_id")) {
      return { rows: [libRow()] };
    }
    if (text.includes("FROM library_shares") && text.includes("ANY")) {
      return { rows: [] };
    }
    return { rows: [] };
  });
}

function buildApp(user: typeof OWNER) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use("/api/library", libraryRouter);
  app.use("/api/models", gltfModelRouter);
  return app;
}

describe("Library API (#233–#235)", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.connect.mockReset();
  });

  it("GET /api/library get-or-creates library with Uploads", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM manuscript_libraries WHERE owner_sub")) {
        return { rows: [] };
      }
      if (text.includes("FROM library_shares ls") || text.includes("SELECT DISTINCT ON")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const clientQuery = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO manuscript_libraries")) {
        return { rows: [libRow()] };
      }
      if (text.includes("SELECT * FROM library_folders WHERE library_id") && text.includes("is_root")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO library_folders") && text.includes("true, true")) {
        return { rows: [folderRow()] };
      }
      if (text.includes("lower(name) = 'uploads'")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO library_folders") && text.includes("'Uploads'")) {
        return { rows: [uploadsFolder()] };
      }
      return { rows: [] };
    });

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release: vi.fn(),
    });

    const res = await request(buildApp(OWNER)).get("/api/library");
    expect(res.status).toBe(200);
    expect(res.body.rootFolderId).toBe(ROOT_ID);
    expect(res.body.uploadsFolderId).toBe(UPLOADS_ID);
    expect(res.body.badge).toBe("only_you");
    expect(
      clientQuery.mock.calls.some((c) => String(c[0]).includes("ON CONFLICT (owner_sub)")),
    ).toBe(true);
  });

  it("POST /api/library/folders creates under editable parent", async () => {
    mockOwnerAclQueries((text) => {
      if (text.includes("INSERT INTO library_folders")) {
        return {
          rows: [
            folderRow({
              folder_id: CHILD_ID,
              parent_id: UPLOADS_ID,
              name: "Codices",
              is_root: false,
              is_system: false,
            }),
          ],
        };
      }
      return null;
    });

    const res = await request(buildApp(OWNER))
      .post("/api/library/folders")
      .send({ parentId: UPLOADS_ID, name: "Codices" });

    expect(res.status).toBe(201);
    expect(res.body.folderId).toBe(CHILD_ID);
    expect(res.body.name).toBe("Codices");
  });

  it("denies folder list for non-sharee", async () => {
    mockOwnerAclQueries();
    const res = await request(buildApp(STRANGER)).get(
      `/api/library/folders/${UPLOADS_ID}`,
    );
    expect(res.status).toBe(403);
  });

  it("allows view sharee to list but not create", async () => {
    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM library_folders WHERE folder_id")) {
        const row = resolveFolder(String(params?.[0] ?? ""));
        return { rows: row ? [row] : [] };
      }
      if (text.includes("FROM manuscript_libraries WHERE library_id")) {
        return { rows: [libRow()] };
      }
      if (text.includes("FROM library_shares") && text.includes("ANY")) {
        return {
          rows: [
            {
              id: SHARE_ID,
              folder_id: UPLOADS_ID,
              subject_sub: SHAREE.sub,
              email: SHAREE.email,
              role: "view",
              added_by_sub: OWNER.sub,
              added_by_email: OWNER.email,
              created_at: "2026-09-01T00:00:00.000Z",
            },
          ],
        };
      }
      if (text.includes("WHERE parent_id =")) {
        return { rows: [] };
      }
      if (text.includes("FROM gltf_models WHERE folder_id")) {
        return { rows: [modelRow()] };
      }
      return { rows: [] };
    });

    const list = await request(buildApp(SHAREE)).get(
      `/api/library/folders/${UPLOADS_ID}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.access).toBe("view");
    expect(list.body.models).toHaveLength(1);

    const create = await request(buildApp(SHAREE))
      .post("/api/library/folders")
      .send({ parentId: UPLOADS_ID, name: "Nope" });
    expect(create.status).toBe(403);
  });

  it("edit sharee can create folders", async () => {
    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM library_folders WHERE folder_id")) {
        const row = resolveFolder(String(params?.[0] ?? ""));
        return { rows: row ? [row] : [] };
      }
      if (text.includes("FROM manuscript_libraries WHERE library_id")) {
        return { rows: [libRow()] };
      }
      if (text.includes("FROM library_shares") && text.includes("ANY")) {
        return {
          rows: [
            {
              id: SHARE_ID,
              folder_id: UPLOADS_ID,
              subject_sub: SHAREE.sub,
              email: SHAREE.email,
              role: "edit",
              added_by_sub: OWNER.sub,
              added_by_email: OWNER.email,
              created_at: "2026-09-01T00:00:00.000Z",
            },
          ],
        };
      }
      if (text.includes("INSERT INTO library_folders")) {
        return {
          rows: [
            folderRow({
              folder_id: CHILD_ID,
              parent_id: UPLOADS_ID,
              name: "Shared notes",
              is_root: false,
              is_system: false,
            }),
          ],
        };
      }
      return { rows: [] };
    });

    const res = await request(buildApp(SHAREE))
      .post("/api/library/folders")
      .send({ parentId: UPLOADS_ID, name: "Shared notes" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Shared notes");
  });

  it("PATCH /api/models/:id/location moves for owner", async () => {
    mockOwnerAclQueries((text) => {
      if (text.includes("FROM gltf_models WHERE model_id")) {
        return { rows: [modelRow({ folder_id: UPLOADS_ID })] };
      }
      if (text.includes("UPDATE gltf_models")) {
        return { rows: [modelRow({ folder_id: CHILD_ID })] };
      }
      return null;
    });

    const res = await request(buildApp(OWNER))
      .patch(`/api/models/${MODEL_ID}/location`)
      .send({ folderId: CHILD_ID });

    expect(res.status).toBe(200);
    expect(res.body.folderId).toBe(CHILD_ID);
  });

  it("owner can add and list shares", async () => {
    mockOwnerAclQueries((text) => {
      if (text.includes("INSERT INTO library_shares")) {
        return {
          rows: [
            {
              id: SHARE_ID,
              folder_id: UPLOADS_ID,
              subject_sub: null,
              email: "sharee@memphis.edu",
              role: "view",
              added_by_sub: OWNER.sub,
              added_by_email: OWNER.email,
              created_at: "2026-09-01T00:00:00.000Z",
            },
          ],
        };
      }
      if (text.includes("FROM library_shares WHERE folder_id = $1 ORDER BY")) {
        return {
          rows: [
            {
              id: SHARE_ID,
              folder_id: UPLOADS_ID,
              subject_sub: null,
              email: "sharee@memphis.edu",
              role: "view",
              added_by_sub: OWNER.sub,
              added_by_email: OWNER.email,
              created_at: "2026-09-01T00:00:00.000Z",
            },
          ],
        };
      }
      return null;
    });

    const add = await request(buildApp(OWNER))
      .post(`/api/library/folders/${UPLOADS_ID}/shares`)
      .send({ email: "sharee@memphis.edu", role: "view" });
    expect(add.status).toBe(201);
    expect(add.body.email).toBe("sharee@memphis.edu");

    const list = await request(buildApp(OWNER)).get(
      `/api/library/folders/${UPLOADS_ID}/shares`,
    );
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("DELETE empty folder succeeds; non-empty returns 409", async () => {
    mockOwnerAclQueries((text) => {
      if (text.includes("COUNT(*)") && text.includes("library_folders")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("COUNT(*)") && text.includes("gltf_models")) {
        return { rows: [{ n: 1 }] };
      }
      return null;
    });

    const blocked = await request(buildApp(OWNER)).delete(
      `/api/library/folders/${CHILD_ID}`,
    );
    expect(blocked.status).toBe(409);

    mockOwnerAclQueries((text) => {
      if (text.includes("COUNT(*)")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("DELETE FROM library_folders")) {
        return { rowCount: 1, rows: [] };
      }
      return null;
    });

    const ok = await request(buildApp(OWNER)).delete(
      `/api/library/folders/${CHILD_ID}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.deleted).toBe(true);
  });
});
