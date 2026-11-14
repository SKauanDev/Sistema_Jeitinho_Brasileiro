import { Link } from "react-router-dom";
export function TableScanPage() {
  return <main className="table-scan-page"><img src="/images/logo.webp" alt="Jeitinho Brasileiro" /><span>COMANDA MOBILE</span><h1>Seu pedido começa aqui</h1><p>A leitura do QR code está disponível somente no atendimento do salão, dentro do sistema.</p><Link to="/cardapio">Ver cardápio</Link></main>;
}
