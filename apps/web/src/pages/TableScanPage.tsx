import { Link } from "react-router-dom";
import { ScanTableButton } from "../components/TableScanner";
export function TableScanPage() {
  return <main className="table-scan-page"><img src="/images/logo.webp" alt="Jeitinho Brasileiro" /><span>COMANDA MOBILE</span><h1>Seu pedido começa aqui</h1><p>Escaneie o QR code da sua mesa para abrir a comanda e escolher no cardápio.</p><ScanTableButton /><Link to="/cardapio">Ver cardápio</Link></main>;
}
