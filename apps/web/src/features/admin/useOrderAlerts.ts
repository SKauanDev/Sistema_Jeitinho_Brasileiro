import { useEffect, useRef, useState } from "react";
import { adminApi } from "../../services/admin-api";
import { createAdminSocket } from "../../services/realtime";
import { orderSoundReady, ringOrderSound, unlockOrderSound } from "../../services/order-sound";
import type { Order } from "../../types/admin";

export function useOrderAlerts() {
  const [newOrders, setNewOrders] = useState(0);
  const [soundReady, setSoundReady] = useState(orderSoundReady);
  const seen = useRef(new Set<string>());
  const pendingSound = useRef(false);

  const enableSound = async () => {
    if (await unlockOrderSound()) { ringOrderSound(); pendingSound.current = false; }
    setSoundReady(orderSoundReady());
  };

  useEffect(() => {
    let active = true, initialized = false, fetching = false;
    const ring = () => {
      if (!ringOrderSound()) pendingSound.current = true;
      setSoundReady(orderSoundReady());
    };
    const soundChanged = () => {
      const ready = orderSoundReady(); setSoundReady(ready);
      if (ready && pendingSound.current) { pendingSound.current = false; ringOrderSound(); }
    };
    const unlock = () => { void unlockOrderSound(); };
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const orders = await adminApi.orders();
        if (!active) return;
        window.dispatchEvent(new CustomEvent("urfood:orders-refreshed", { detail: orders }));
        const paid = orders.filter(order => ["NOT_REQUIRED", "APPROVED"].includes(order.paymentStatus ?? ""));
        setNewOrders(paid.filter(order => order.status === "NEW").length);
        const arrivals = paid.filter(order => !seen.current.has(order.id) && ["NEW", "CONFIRMED"].includes(order.status));
        paid.forEach(order => seen.current.add(order.id));
        if (initialized && arrivals.length) ring();
        initialized = true;
      } catch { /* The next socket event, focus or poll retries the request. */ }
      finally { fetching = false; }
    };
    const visible = () => { if (document.visibilityState === "visible") { void refresh(); soundChanged(); } };
    const socket = createAdminSocket();
    socket.on("connect", () => { void refresh(); });
    socket.on("order:new", (order: Pick<Order, "id">) => {
      if (typeof order?.id !== "string") return;
      if (!seen.current.has(order.id)) {
        seen.current.add(order.id); ring(); setNewOrders(count => count + 1);
      }
      void refresh();
    });
    socket.on("order:updated", () => { void refresh(); });
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    window.addEventListener("urfood:order-sound", soundChanged);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false; socket.disconnect(); window.clearInterval(timer);
      window.removeEventListener("urfood:order-sound", soundChanged);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return { newOrders, soundReady, enableSound };
}
