import { Construction } from "lucide-react";

export function PlaceholderModule({ title }: { title: string }) {
  return <div className="admin-module"><div className="module-title"><div><span>PRÓXIMA ETAPA</span><h1>{title}</h1><p>A estrutura de navegação está pronta. Este módulo será conectado após Dashboard e Pedidos.</p></div></div><div className="admin-placeholder"><Construction /><h2>Módulo em preparação</h2><p>Nenhum dado fictício será exibido aqui.</p></div></div>;
}
