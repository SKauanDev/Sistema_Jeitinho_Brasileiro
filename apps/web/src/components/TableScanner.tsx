import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera, ScanLine, X, RotateCcw, LoaderCircle } from "lucide-react";
import { tablePathFromQr } from "../utils/table-qr";
import { authorizeTableScan } from "../services/table-access";
import { getCurrentUser } from "../services/auth";

const canUseSalonScanner = (pathname: string) => pathname === "/mesas" && !!localStorage.getItem("urfood_token") && ["ADMIN", "OPERATOR"].includes(getCurrentUser()?.role ?? "");

export function ScanTableButton({ className = "" }: { className?: string }) {
  const location = useLocation(), navigate = useNavigate();
  if (!canUseSalonScanner(location.pathname)) return null;
  return <button type="button" className={`scan-table-button ${className}`} onClick={() => {
    const params = new URLSearchParams(location.search); params.set("leitor", "mesa");
    navigate({ pathname: location.pathname, search: params.toString() }, { state: { ...location.state, qrScanner: true }, preventScrollReset: true });
  }}><ScanLine size={19} /><span>Escanear</span></button>;
}

export function TableScanner() {
  const location = useLocation(), navigate = useNavigate();
  if (!canUseSalonScanner(location.pathname) || new URLSearchParams(location.search).get("leitor") !== "mesa") return null;
  const close = () => {
    if (location.state?.qrScanner) navigate(-1);
    else { const params = new URLSearchParams(location.search); params.delete("leitor"); navigate({ pathname: location.pathname, search: params.toString() }, { replace: true, state: location.state }); }
  };
  return <QRScannerDialog onClose={close} onRead={async (path, signal) => { await authorizeTableScan(path, signal); navigate(path, { replace: true, state: null }); }} />;
}

function QRScannerDialog({ onClose, onRead }: { onClose: () => void; onRead: (path: string, signal: AbortSignal) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ onRead, onClose }); handlers.current = { onRead, onClose };
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(""), [starting, setStarting] = useState(true), [paused, setPaused] = useState(false), [validating, setValidating] = useState(false);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { if (element.open) element.close(); }; }, []);
  useEffect(() => {
    const authorization = new AbortController();
    let cancelled = false, done = false, stream: MediaStream | null = null, frame = 0, lastFrame = 0;
    const stop = () => { cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); if (video.current?.srcObject === stream) video.current.srcObject = null; };
    const pause = () => { if (document.visibilityState === "hidden") { stop(); setPaused(true); setStarting(false); } };
    setError(""); setPaused(false); setStarting(true);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
        const mediaRequest = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }).then(media => {
          stream = media; if (cancelled || done) media.getTracks().forEach(track => track.stop()); return media;
        });
        const [decoder, media] = await Promise.all([import("jsqr"), mediaRequest]);
        stream = media;
        if (cancelled || document.visibilityState === "hidden") { stop(); if (!cancelled) { setPaused(true); setStarting(false); } return; }
        const element = video.current!; element.srcObject = media; await element.play();
        if (cancelled) { stop(); return; }
        setStarting(false);
        const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("CAMERA_UNAVAILABLE");
        const scan = (time: number) => {
          if (cancelled || done) return;
          if (time - lastFrame >= 150 && element.readyState >= 2 && element.videoWidth && element.videoHeight) {
            lastFrame = time;
            const scale = Math.min(1, 640 / Math.max(element.videoWidth, element.videoHeight));
            canvas.width = Math.round(element.videoWidth * scale); canvas.height = Math.round(element.videoHeight * scale);
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const qr = decoder.default(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
            if (qr) {
              const path = tablePathFromQr(qr.data, window.location.origin);
              if (path) {
                done = true; stop(); setValidating(true);
                void handlers.current.onRead(path, authorization.signal).catch(reason => {
                  if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível validar a comanda. Escaneie novamente.");
                }).finally(() => { if (!cancelled) setValidating(false); });
                return;
              }
              setError("Este QR não é de uma comanda deste restaurante. Aponte para o QR da mesa.");
            }
          }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch (reason) {
        done = true;
        stop(); if (cancelled) return;
        const name = reason instanceof Error ? reason.name : "";
        setError(name === "NotAllowedError" ? "Permita o acesso à câmera no navegador para escanear a mesa." : name === "NotFoundError" ? "Nenhuma câmera foi encontrada neste dispositivo." : name === "NotReadableError" ? "A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente." : "Não foi possível abrir a câmera. Verifique a permissão e use o sistema por HTTPS.");
        setStarting(false);
      }
    };
    document.addEventListener("visibilitychange", pause); void start();
    return () => { cancelled = true; authorization.abort(); document.removeEventListener("visibilitychange", pause); stop(); };
  }, [attempt]);

  return <dialog ref={dialog} className="table-scanner-dialog" aria-labelledby="table-scanner-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => event.target === event.currentTarget && onClose()}>
    <header><div><span>COMANDA MOBILE</span><h2 id="table-scanner-title">Escanear QR da mesa</h2></div><button type="button" aria-label="Fechar câmera" onClick={onClose}><X size={21} /></button></header>
    <p>Aponte a câmera para o QR code da mesa. A comanda abre aqui mesmo.</p>
    <div className="table-camera-preview"><video ref={video} autoPlay muted playsInline aria-label="Câmera para leitura do QR code" /><div className="table-camera-frame" aria-hidden="true" />{starting && <div className="table-camera-state"><LoaderCircle className="spinner" size={26} /><span>Abrindo câmera...</span></div>}{paused && <div className="table-camera-state"><Camera size={28} /><span>Leitura pausada</span></div>}</div>
    {error && <p className="table-scanner-error" role="alert">{error}</p>}
    {(error || paused) && <button className="table-camera-retry" type="button" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={17} /> {paused ? "Retomar câmera" : "Tentar novamente"}</button>}
    {validating && <p role="status"><LoaderCircle className="spinner" size={18} /> Validando comanda...</p>}
  </dialog>;
}
