import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "./admin-api";

const connections = new Map<Socket, "admin" | "customer">();
function disconnectSession(kind: "admin" | "customer") {
  for (const [socket, session] of connections) if (session === kind) socket.disconnect();
}
window.addEventListener("urfood:admin-logout", () => disconnectSession("admin"));
window.addEventListener("urfood:customer-session", () => { if (!localStorage.getItem("urfood_customer_token")) disconnectSession("customer"); });
window.addEventListener("storage", event => {
  if (event.key === "urfood_token" && !event.newValue) disconnectSession("admin");
  if (event.key === "urfood_customer_token" && !event.newValue) disconnectSession("customer");
});
function trackingTokens(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem("urfood_tracking_tokens") ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {};
  } catch { return {}; }
}
export function rememberTrackingToken(id: string, token: string) {
  const entries = Object.entries(trackingTokens()).filter(([key]) => key !== id);
  localStorage.setItem("urfood_tracking_tokens", JSON.stringify(Object.fromEntries([...entries.slice(-49), [id, token]])));
}
export function orderRequestHeaders(orderId: string): Record<string, string> {
  const session = localStorage.getItem("urfood_customer_token") || localStorage.getItem("urfood_token");
  const tracking = trackingTokens()[orderId];
  return { ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(tracking ? { "X-Order-Token": tracking } : {}) };
}
export function registrationProof() {
  const latest = Object.entries(trackingTokens()).at(-1);
  return latest ? { orderId: latest[0], orderToken: latest[1] } : {};
}
function connect(kind: "admin" | "customer", orderId?: string) {
  const socket = io(SOCKET_URL, { auth: callback => callback({ token: kind === "admin" ? localStorage.getItem("urfood_token") : localStorage.getItem("urfood_customer_token") || (orderId ? trackingTokens()[orderId] : "") }) });
  connections.set(socket, kind);
  socket.on("connect", () => connections.set(socket, kind));
  socket.on("disconnect", () => connections.delete(socket));
  socket.on("connect_error", () => connections.delete(socket));
  return socket;
}
export const createAdminSocket = () => connect("admin");
export const createCustomerSocket = (orderId?: string) => connect("customer", orderId);
