# Mercado Pago no UrFood

Pix usa a Orders API (`/v1/orders`) para gerar QR Code e Copia e Cola únicos por pedido. A API exige o e-mail do pagador; o UrFood não pede CPF/CNPJ para Pix. O pedido é liberado somente após consulta autenticada ao Mercado Pago confirmar status, método Pix, referência e valor. Crédito e débito continuam na Payments API (`/v1/payments`). Pedidos Pix antigos de Checkout Pro continuam consultáveis.

## Configuração

```env
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_PUBLIC_KEY=...
MERCADO_PAGO_WEBHOOK_SECRET=...
WEB_URL=https://loja.seu-dominio.com
API_PUBLIC_URL=https://api.seu-dominio.com
```

No Mercado Pago Developers, configure o tópico **order** e mantenha **payment** para os cartões/fluxos antigos. O webhook deve apontar para `${API_PUBLIC_URL}/payments/mercado-pago/webhook`. Se a API estiver atrás do proxy `/api` do frontend, inclua `/api` em `API_PUBLIC_URL`. Não exponha Access Token nem segredo do webhook no navegador.

Rode `npm run db:migrate-pix-qr -w @urfood/api` em cada banco e reinicie a API após alterações no `.env`.

## Validade e conciliação

A API do Mercado Pago aceita prazo Pix mínimo de 30 minutos. O UrFood mantém o limite local de seis minutos e solicita o cancelamento da order no provedor ao expirar. Confirmações tardias são registradas no financeiro para revisão/estorno, sem liberar o pedido para preparo. O QR exibido é uma cobrança gerada pelo Mercado Pago para a conta vinculada ao Access Token, não um QR estático da chave digitada no painel.

Fontes: [Pix na Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix), [notificações de orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications), [cancelar order](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/overview).
