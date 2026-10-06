#!/usr/bin/env node
/**
 * UDP broadcast beacon for museum-kit / optional lan-party discovery.
 * Advertises apiBase/dashboard/webgl every BEACON_INTERVAL_MS (default 2000).
 */
const dgram = require("dgram");

const port = Number(process.env.DISCOVER_PORT || 41234);
const intervalMs = Number(process.env.BEACON_INTERVAL_MS || 2000);
const ip = (process.env.SERVER_LAN_IP || "").trim();
const apiPort = process.env.PORT || "4000";
const dashboardUrl =
  (process.env.DASHBOARD_PUBLIC_URL || "").trim() ||
  (ip ? `http://${ip}/` : "");
const webglUrl =
  (process.env.WEBGL_PUBLIC_URL || "").trim() ||
  (ip ? `http://${ip}/webgl/` : "");
const apiBase =
  (process.env.API_PUBLIC_URL || "").trim() ||
  (ip ? `http://${ip}:${apiPort}` : "");

if (!apiBase) {
  console.error("[lan-discover] SERVER_LAN_IP or API_PUBLIC_URL required");
  process.exit(1);
}

const payload = Buffer.from(
  JSON.stringify({
    service: "vellum-rift",
    v: 1,
    apiBase: apiBase.replace(/\/$/, ""),
    dashboard: dashboardUrl,
    webgl: webglUrl,
  }),
);

const socket = dgram.createSocket("udp4");
socket.bind(() => {
  socket.setBroadcast(true);
  console.log(
    `[lan-discover] broadcasting on UDP ${port} every ${intervalMs}ms → ${payload}`,
  );
  const tick = () => {
    socket.send(payload, 0, payload.length, port, "255.255.255.255", (err) => {
      if (err) console.error("[lan-discover] send failed:", err.message);
    });
  };
  tick();
  setInterval(tick, intervalMs);
});
