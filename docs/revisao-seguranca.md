# Revisão do backend e do Mercado Pago — 09/11/2026

As credenciais do `.env` foram consultadas diretamente na API oficial, sem registrar seus valores e sem gerar cobrança. O Access Token foi aceito por `/users/me` e `/v1/payment_methods`; a Public Key também foi aceita na consulta pública dos meios de pagamento. A conta está ativa, no Brasil, e não está identificada como conta de teste. Ambas as credenciais são reconhecidas; isso não substitui uma compra completa para confirmar todo o fluxo e o recebimento na conta pretendida.

PIX e cartões online estão habilitados nas configurações da loja. Na consulta inicial, o endereço público respondeu com `ERR_NGROK_3200` (túnel offline) e `MERCADO_PAGO_WEBHOOK_SECRET` estava vazio. O webhook mantém a validação obrigatória: não aceita notificações sem assinatura. A consulta autenticada ao provedor continua disponível para conciliação por polling.

## Correções aplicadas

- A chave JWT local foi substituída por uma chave aleatória forte. É preciso fazer login novamente; tokens antigos de sessão e acompanhamento deixam de funcionar. A API não inicia com chave ausente ou fraca.
- Sessões HTTP agora verificam algoritmo, validade, conta ativa e papel atual no banco. Desativar uma conta revoga seu acesso HTTP e Socket.IO.
- Consulta de pedidos, PIX e envio/consulta de cartão exigem a conta proprietária, um administrador/operador ativo ou um token de acompanhamento válido para aquele pedido.
- Pedidos possuem `customer_account_id`. O histórico do cliente usa essa associação, e não apenas o telefone informado. Novos cadastros precisam provar posse do pedido inicial e não herdam pedidos alheios pelo telefone.
- A migração `db:migrate-order-ownership` já foi aplicada neste banco. Em outro banco, executá-la antes da API. Ela preserva a associação anterior das contas já existentes; novos cadastros seguem a regra mais restrita.
- A criação de cartão usa uma chave de idempotência definida no servidor, compartilhada entre tentativas simultâneas. A identificação do pagamento recusado permite uma nova tentativa.
- Limites de tentativas em login, cadastro, criação de pedidos e envio de cartão; limites para quantidade de linhas/opções do carrinho; erros JSON sem stack/SQL; cabeçalhos `nosniff`, proteção contra iframe e política de referência.
- O servidor de desenvolvimento bloqueia acesso externo a `.env`, anotações e backup do banco. As anotações locais também foram adicionadas ao `.gitignore`.
- Atualizações compatíveis de dependências corrigiram os alertas críticos e altos encontrados na auditoria npm.

## Evidências

- 34 testes automatizados passaram, sem skips na execução selecionada: MySQL, autorização HTTP, cadastro e isolamento do histórico, estoque/reservas, Socket.IO, expiração, assinatura do webhook, PIX/cartões simulados e idempotência.
- API e frontend compilaram. O backend iniciou e respondeu em `/health`.
- Testes no navegador cobriram cardápio, montagem meio a meio, combos, carrinho/checkout, acompanhamento, admin e telas para celular.
- Um pedido local temporário em dinheiro confirmou que o preço enviado pelo navegador não substitui o preço do banco e que o acompanhamento aceita o token correto. Os registros foram removidos. Nenhuma cobrança Mercado Pago foi criada nesses testes.
- Consultas anônimas a rotas administrativas, sessão de cliente, detalhes de pedido e pagamento retornaram 401. `.env`, anotações e backup retornaram 403 pelo Vite.

## Pendências antes de considerar a integração completa

1. Preencher `MERCADO_PAGO_WEBHOOK_SECRET` com a assinatura secreta da aplicação no painel Mercado Pago. Não é uma chave aleatória gerada pelo projeto e não deve ser enviada pelo chat.
2. Iniciar o frontend/backend e o túnel ngrok no endereço configurado em `WEB_URL` e `API_PUBLIC_URL`. Se o endereço mudar, atualizar ambos e reiniciar os processos.
3. Conferir no painel do Mercado Pago os eventos `order` (PIX na Orders API) e `payment` (cartões) e a URL `${API_PUBLIC_URL}/payments/mercado-pago/webhook`.
4. Fazer uma compra completa apropriada ao ambiente escolhido e conferir aprovação, recebimento na conta correta e confirmação do pedido. As credenciais atuais apontam para conta real; os testes automatizados não debitam cartões nem pagam PIX.
5. A auditoria ainda aponta dois alertas moderados transitivos ligados a `uuid`/Sequelize. O caminho descrito no aviso envolve UUID v3/v5/v6 com buffer fornecido; o ORM instalado usa v4 sem esse buffer. Não foi identificado esse uso vulnerável na aplicação. Não foi aplicado `npm audit fix --force`, que propõe substituir o ORM por uma versão incompatível. Isso continua sendo uma pendência de manutenção, não uma garantia de ausência de risco.

Para repetir as verificações externas sem criar cobranças:

```powershell
npm.cmd run check:payments -w @urfood/api
```

O comando mostra apenas indicadores de configuração, não credenciais, e retorna falha enquanto houver pendências na configuração/rede. Ele não valida sozinho a entrega de uma notificação nem a liquidação de um pagamento.

Fontes oficiais: [credenciais](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/credentials), [assinatura e configuração de notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/optional-notifications), [aviso de segurança do UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
