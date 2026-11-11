import { useEffect } from "react";
import { createCustomerSocket } from "./realtime";

export function usePaymentUpdates(id: string | undefined, refresh: () => Promise<void>) {
  useEffect(() => {
    if (!id) return;
    const socket = createCustomerSocket(id);
    let connectedBefore = false;
    socket.on("connect", () => {
      socket.emit("watch:order", id);
      if (connectedBefore) void refresh();
      connectedBefore = true;
    });
    const updated = (event: { id?: string }) => { if (event?.id === id) void refresh(); };
    socket.on("order:payment", updated);
    socket.on("order:status", updated);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      socket.disconnect();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id, refresh]);
}
