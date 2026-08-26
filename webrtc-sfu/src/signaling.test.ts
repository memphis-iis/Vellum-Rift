import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { signHs256Jwt } from "./realtimeJwt.js";
import { resetRoomsForTests } from "./rooms.js";
import { app } from "./index.js";

describe("SFU signaling", () => {
  beforeEach(() => {
    resetRoomsForTests();
    process.env.AUTH_REQUIRED = "true";
    process.env.REALTIME_JWT_SECRET = "sfu-test-secret";
  });

  afterEach(() => {
    process.env.AUTH_REQUIRED = "false";
    resetRoomsForTests();
  });

  function token(sessionId: string, playerId = "player-1") {
    return signHs256Jwt(
      {
        sub: "acct:1",
        sessionId,
        playerId,
        purpose: "sfu-signaling",
      },
      "sfu-test-secret",
      120,
    );
  }

  it("rejects join without auth when AUTH_REQUIRED=true", async () => {
    const res = await request(app).post("/v1/sessions/sess-a/join").send({});
    expect(res.status).toBe(401);
  });

  it("joins and exchanges offer/answer via poll", async () => {
    const t = token("sess-a");
    const joinA = await request(app)
      .post("/v1/sessions/sess-a/join")
      .set("Authorization", `Bearer ${t}`)
      .send({ peerId: "peer-a", displayName: "A" });
    expect(joinA.status).toBe(201);
    expect(joinA.body.peerId).toBe("peer-a");

    const joinB = await request(app)
      .post("/v1/sessions/sess-a/join")
      .set("Authorization", `Bearer ${t}`)
      .send({ peerId: "peer-b" });
    expect(joinB.status).toBe(201);
    expect(joinB.body.peers).toEqual(
      expect.arrayContaining([expect.objectContaining({ peerId: "peer-a" })]),
    );

    const signal = await request(app)
      .post("/v1/sessions/sess-a/signal")
      .set("Authorization", `Bearer ${t}`)
      .send({
        fromPeerId: "peer-a",
        toPeerId: "peer-b",
        type: "offer",
        sdp: "v=0 fake-offer",
      });
    expect(signal.status).toBe(202);

    const poll = await request(app)
      .get("/v1/sessions/sess-a/signal")
      .query({ peerId: "peer-b" })
      .set("Authorization", `Bearer ${t}`);
    expect(poll.status).toBe(200);
    expect(poll.body.messages).toHaveLength(1);
    expect(poll.body.messages[0].type).toBe("offer");
    expect(poll.body.messages[0].sdp).toBe("v=0 fake-offer");
  });

  it("rejects token session mismatch", async () => {
    const t = token("sess-a");
    const res = await request(app)
      .post("/v1/sessions/other/join")
      .set("Authorization", `Bearer ${t}`)
      .send({ peerId: "peer-a" });
    expect(res.status).toBe(403);
  });
});

describe("SFU signaling (AUTH_REQUIRED unset)", () => {
  beforeEach(() => {
    resetRoomsForTests();
    delete process.env.AUTH_REQUIRED;
  });

  it("allows local join without a Bearer token", async () => {
    const res = await request(app).post("/v1/sessions/dev-session/join").send({ peerId: "local-1" });
    expect(res.status).toBe(201);
    expect(res.body.peerId).toBe("local-1");
  });
});
