/**
 * Text chat surface. Default on when unset; set CHAT_ENABLED=false to disable
 * (LAN party profile). IIS leaves this unset.
 */
export function isChatEnabled(): boolean {
  return process.env.CHAT_ENABLED !== "false";
}
