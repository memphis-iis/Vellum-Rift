import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// 1. Create a mock 'info' function using vi.hoisted so it's available before the mock factory
const mockInfo = vi.hoisted(() => vi.fn());

// 2. Mock winston BEFORE importing the app
vi.mock("winston", () => {
  return {
    default: {
      format: {
        combine: vi.fn(),
        timestamp: vi.fn(),
        json: vi.fn(),
      },
      transports: {
        Console: vi.fn(),
      },
      createLogger: vi.fn().mockReturnValue({
        info: mockInfo, // Attach our mock spy here
      }),
    },
  };
});

// 3. Mock the database pool so the server starts without a real Postgres
const mockQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
vi.mock("./lib/db.js", () => ({
  default: { query: mockQuery },
  checkConnection: vi.fn().mockResolvedValue(true),
}));

// 4. Import the app after the mocks are established
import "./index.js";

describe("Winston Logger Middleware", () => {
  beforeEach(() => {
    mockInfo.mockClear();
  });

  it("should log incoming requests with the correct method, URL, and IP", async () => {
    // The app auto-starts on port 4000 via app.listen() in index.ts
    const response = await request("http://localhost:4000")
      .get("/api/health")
      .set("x-forwarded-for", "123.45.67.89");

    expect(response.status).toBe(200);

    // Assert that winston's info method was called
    expect(mockInfo).toHaveBeenCalled();

    // Verify the exact string format your middleware outputs
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining("Incoming request: GET /api/health from IP: 123.45.67.89")
    );
  });
});

it("returns game-state statistics from /health", async () => {
  const response = await request("http://localhost:4000")
    .get("/health");

  expect(response.status).toBe(200);
  expect(response.body.gameState).toEqual({
    totalSessionsCreated: 0,
    activeSessions: 0,
    totalPlayers: 0,
    connectedPlayers: 0,
    orphanedSessions: 0,
    avgPlayersPerActiveSession: 0,
  });
});