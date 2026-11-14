import { useEffect, useRef, useState } from "react";
import { adminApi } from "../../services/admin-api";
import { createAdminSocket } from "../../services/realtime";
import { orderSoundReady, ringOrderSound, unlockOrderSound } from "../../services/order-sound";
import type { Order } from "../../types/admin";
import { isPaymentWaiting } from "../order-status/order-presentation";
import { dueNewOrderReminders } from "../../utils/order-waiting";
import { orderClockNow } from "../../utils/order-clock";
type AlertOrder = Pick<Order,"id"|"status"|"createdAt"|"statusHistory"|"paymentMethod"|"paymentStatus"|"paymentProvider">;

export function useOrderAlerts() {
  const [newOrders, setNewOrders] = useState(0);
  const [soundReady, setSoundReady] = useState(orderSoundReady);
  const seen = useRef(new Set<string>());
  const pendingSound = useRef(false);
  const reminders = useRef(new Map<string, string>());
  const latestOrders = useRef<AlertOrder[]>([]);

  const enableSound = async () => {
    const hadPending = pendingSound.current;
    if (await unlockOrderSound()) { if (!hadPending) ringOrderSound(); pendingSound.current = false; }
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
    const unlock = () => { if (!orderSoundReady()) void unlockOrderSound(); };
    const checkReminders = () => {
      if (!active) return;
      const waiting = latestOrders.current.filter(order=>!isPaymentWaiting(order));
      if (dueNewOrderReminders(waiting,orderClockNow(),reminders.current)) ring();
    };
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const orders = await adminApi.orders();
        if (!active) return;
        latestOrders.current = orders;
        window.dispatchEvent(new CustomEvent("urfood:orders-refreshed", { detail: orders }));
        const paid = orders.filter(order => !isPaymentWaiting(order));
        setNewOrders(paid.filter(order => order.status === "NEW").length);
        const arrivals = paid.filter(order => !seen.current.has(order.id) && ["NEW", "CONFIRMED"].includes(order.status));
        paid.forEach(order => seen.current.add(order.id));
        const remind = dueNewOrderReminders(paid, orderClockNow(), reminders.current);
        if ((initialized && arrivals.length) || remind) ring();
        initialized = true;
      } catch { /* The next socket event, focus or poll retries the request. */ }
      finally { fetching = false; }
    };
    const visible = () => { if (document.visibilityState === "visible") { void refresh(); soundChanged(); } };
    const socket = createAdminSocket();
    socket.on("connect", () => { void refresh(); });
    socket.on("order:new", (order: Pick<Order, "id"> & Partial<Order>) => {
      if (typeof order?.id !== "string") return;
      if (!seen.current.has(order.id)) {
        seen.current.add(order.id); ring(); setNewOrders(count => count + 1);
      }
      if (order.status === "NEW" && typeof order.createdAt === "string" && !latestOrders.current.some(item=>item.id===order.id)) latestOrders.current.push({id:order.id,status:order.status,createdAt:order.createdAt,statusHistory:order.statusHistory??[],paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,paymentProvider:order.paymentProvider});
      void refresh();
    });
    socket.on("order:updated", (event: Partial<Order>) => {
      if (event?.id && event.status && event.status !== "NEW") {
        latestOrders.current = latestOrders.current.map(order=>order.id===event.id?{...order,status:event.status!}:order);
        setNewOrders(latestOrders.current.filter(order=>order.status==="NEW"&&!isPaymentWaiting(order)).length);
      }
      void refresh();
    });
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    const reminderTimer = window.setInterval(checkReminders, 5_000);
    window.addEventListener("urfood:order-sound", soundChanged);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false; socket.disconnect(); window.clearInterval(timer); window.clearInterval(reminderTimer);
      window.removeEventListener("urfood:order-sound", soundChanged);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return { newOrders, soundReady, enableSound };
}
