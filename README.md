# Pizzaria Borda Dourada · UrFood

Sistema de pedidos para a Pizzaria Borda Dourada, com cardápio digital, montagem de pizzas inteiras ou meio a meio, combos e painel administrativo.

## Funcionalidades

- Cardápio com categorias, imagens, preços e disponibilidade.
- Escolha de sabores por pizza, inclusive em combos com várias pizzas.
- Carrinho, checkout, entrega ou retirada e acompanhamento do pedido.
- Pagamentos via Mercado Pago: Pix e cartão.
- Painel com dashboard, pedidos, cardápio, estoque, clientes, financeiro, cupons, relatórios, configurações e usuários.
- Atualizações em tempo real com Socket.IO.
- Cupons com validade e regras de desconto. Desativar mantém o cadastro; a lixeira exclui o cupom e seus vínculos de resgate. Os descontos registrados nos pedidos são preservados.

Identidade visual: preto `#131313`, vinho `#6F0801` e dourado `#CA9239`.

## Estrutura e requisitos

Monorepo com npm workspaces:

```text
apps/
  web/                  React 19, TypeScript e Vite
    public/images/      Logo e imagens
    src/features/admin/ Módulos administrativos
    src/pages/          Login, perfil, pedidos e pagamentos
    src/services/       Clientes HTTP e Socket.IO
  api/                  Node.js, Express, Sequelize e MySQL
    .env.example        Modelo das variáveis do backend
    src/config/         Leitura e validação do ambiente
    src/database/       Models, migrações e scripts de banco
    src/modules/        Rotas e regras de negócio
    src/realtime/       Autorização do Socket.IO
    src/shared/         Middlewares e utilitários
docs/                   Pagamentos e revisão de segurança
```

Use Node.js 22.12 ou superior e npm com suporte a workspaces. O MySQL precisa estar criado e com o schema atualizado; iniciar a API não cria todas as tabelas automaticamente.

## Executar localmente

Na raiz do repositório:

```powershell
npm install
```

Se ainda não existir um `.env` na raiz, copie `apps/api/.env.example` para `.env`. Preserve o arquivo existente se ele já contiver suas credenciais. No VS Code, use **Ctrl + P → .env** para abri-lo.

Preencha a conexão do banco e gere uma chave JWT:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copie o resultado para `JWT_SECRET`. A API exige pelo menos 32 caracteres. Trocar essa chave invalida as sessões e os tokens de acompanhamento anteriores.

```powershell
npm run db:check
npm run dev
```

| Serviço | Endereço local |
| --- | --- |
| Login do admin | http://localhost:5173/ |
| Cardápio público | http://localhost:5173/cardapio |
| Perfil do cliente | http://localhost:5173/perfil |
| Saúde da API | http://localhost:3333/health |

No desenvolvimento, o Vite encaminha `/api` para a API na porta 3333 e `/socket.io` para o servidor de eventos. As rotas do Express não possuem prefixo `/api` diretamente.

Se o PowerShell bloquear `npm.ps1`, utilize `npm.cmd`. Após alterar o `.env` do backend, reinicie a API.

## Variáveis de ambiente

O backend lê `.env` no diretório de execução e, como alternativa, `../../.env`, permitindo usar o arquivo da raiz ao executar dentro de `apps/api`. Variáveis já definidas pelo ambiente têm prioridade. Evite manter dois arquivos com configurações diferentes.

### Backend

Exemplo sem credenciais reais:

```dotenv
NODE_ENV=development
PORT=3333
WEB_URL=http://localhost:5173
API_PUBLIC_URL=https://api.seu-dominio.com
JWT_SECRET=SUBSTITUA_POR_UMA_CHAVE_ALEATORIA

# HostGator
DB_HOST=69.6.213.160
DB_PORT=3306
DB_NAME=kauanv60_food_jeitinhoBr
DB_USER=kauanv60_devkauan
DB_PASSWORD="SUBSTITUA_PELA_SENHA_DO_USUARIO_MYSQL"

# Local: comente o bloco acima antes de ativar este.
# DB_HOST=localhost
# DB_PORT=3306
# DB_NAME=urfood
# DB_USER=root
# DB_PASSWORD="SUA_SENHA_LOCAL"

DB_LOGGING=false
DB_POOL_MAX=10
DB_POOL_MIN=0
DB_POOL_IDLE_MS=60000
DB_CONNECT_TIMEOUT_MS=10000

MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=

# Recuperação de senha por e-mail
RESEND_API_KEY=
EMAIL_FROM=Pizzaria Borda Dourada <contato@seu-dominio.com>
```

Use aspas ao redor da senha no arquivo `.env`, especialmente se ela contiver `#`: sem aspas, esse caractere inicia um comentário e a senha pode ser lida incompleta.

`WEB_URL` é a origem do frontend permitida no CORS e no Socket.IO. `API_PUBLIC_URL` é o endereço HTTPS público do backend, utilizado nas notificações de pagamento. Nenhum deles é o endereço do MySQL.

### Frontend

O frontend usa `VITE_API_URL` para localizar a API. Sem essa variável, usa `/api`, adequado ao proxy local do Vite.

Para desenvolvimento com API externa, crie `apps/web/.env.local`:

```dotenv
VITE_API_URL=https://api.seu-dominio.com
```

Não acrescente `/api` ao acessar diretamente o Express. Inclua esse prefixo somente se um proxy público estiver configurado para atendê-lo.

Variáveis `VITE_*` são incorporadas ao código público do navegador. Nunca use esse prefixo para senha do banco, JWT, Access Token ou segredo do webhook. O frontend obtém a Public Key do Mercado Pago pela API.

## Banco na HostGator

No cPanel:

1. Confirme que o banco e o usuário existem com seus nomes completos, incluindo `kauanv60_`.
2. Em **Adicionar usuário ao banco de dados**, associe o usuário ao banco e configure os privilégios necessários. Migrações também precisam de permissão para alterar o schema.
3. Em **Banco de dados remoto / MySQL remoto**, adicione o IP público da máquina que executa a API.
4. Importe um backup atualizado pelo phpMyAdmin se o banco estiver vazio.
5. Execute `npm run db:check` para validar a conexão.

O host no `.env` continua sendo `69.6.213.160`. O IP liberado no cPanel é o IP de saída do computador ou servidor da API. Se ele mudar, atualize a liberação. Ao hospedar o backend, libere o IP de saída dessa hospedagem.

O erro `ER_ACCESS_DENIED_ERROR` / `1045` exige conferir usuário, senha, associação ao banco e acesso remoto. `using password: YES` significa apenas que uma senha foi enviada.

Referência: [acesso remoto na HostGator](https://suporte.hostgator.com.br/hc/pt-br/articles/30811068544403-Como-habilitar-acesso-remoto-no-banco-de-dados-MySQL).

### Migrações

Os scripts ficam em `apps/api/src/database` e estão registrados em `apps/api/package.json`. Aplique as migrações correspondentes ao schema do backup importado, com backup prévio. Não execute seeds sobre um banco existente apenas para tentar corrigir uma conexão.

Entre as atualizações necessárias estão a associação dos pedidos às contas dos clientes e os campos usados pelos pagamentos:

```powershell
npm run db:migrate-order-ownership -w @urfood/api
npm run db:migrate-pix-qr -w @urfood/api
```

Esses comandos não substituem a preparação completa de um banco vazio. O script `db:seed-admin` cria ou redefine uma conta administrativa de desenvolvimento; não o execute em produção sem revisar seu conteúdo.

## Frontend na Vercel

Importe o repositório e configure:

| Configuração | Valor |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `apps/web` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Como o projeto usa workspaces e o lockfile fica na raiz, permita acesso aos arquivos fora da Root Directory nas configurações de build do monorepo, se necessário.

Em **Settings → Environment Variables**, adicione:

```dotenv
VITE_API_URL=https://api.seu-dominio.com
```

Selecione **Production** e os outros ambientes que utilizar. Faça um novo deploy após alterar variáveis: o Vite grava esses valores durante o build.

Para abrir ou atualizar rotas como `/cardapio` e `/admin/dashboard`, crie `apps/web/vercel.json` com o fallback da SPA:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Esse fallback pressupõe a API em um endereço separado, configurado em `VITE_API_URL`.

Referências: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite) e [variáveis de ambiente](https://vercel.com/docs/environment-variables).

### Backend em produção

Publicar `apps/web` na Vercel não publica `apps/api`. O backend atual utiliza um servidor Node com Socket.IO, tarefas periódicas e arquivos enviados para `uploads`. Ele precisa de um deploy próprio que atenda a essas necessidades; cadastrar variáveis no frontend não inicia a API.

Na hospedagem do backend:

1. Instale as dependências e compile a API com `npm run build -w @urfood/api`, a partir da raiz.
2. Configure as variáveis de banco, autenticação, pagamento e e-mail no ambiente do servidor.
3. Defina `NODE_ENV=production`, `WEB_URL=https://seu-projeto.vercel.app` e `API_PUBLIC_URL=https://api.seu-dominio.com` com os endereços reais.
4. Inicie com `npm run start -w @urfood/api` e disponibilize a API por HTTPS. A API respeita a variável `PORT` fornecida pela hospedagem.
5. Configure armazenamento persistente para `uploads` e libere o IP de saída do backend no MySQL remoto.
6. Valide `/health`, login, cardápio, eventos e checkout pelo domínio publicado.

Um frontend publicado não consegue acessar `localhost:3333` do seu computador. Se usar um túnel temporário, ele precisa permanecer online; o endereço deve estar coerente com a configuração da API e dos webhooks.

## Mercado Pago

Configure no backend as credenciais da aplicação e a assinatura secreta do webhook. No painel Mercado Pago, utilize o endpoint:

```text
https://api.seu-dominio.com/payments/mercado-pago/webhook
```

Os tópicos utilizados são `order` para Pix e `payment` para cartão e fluxos anteriores. Se houver um prefixo público no proxy, inclua-o também em `API_PUBLIC_URL` e no endereço cadastrado.

Diagnóstico sem criar cobranças:

```powershell
npm run check:payments -w @urfood/api
```

O diagnóstico consulta credenciais e disponibilidade do endereço público; não substitui um pagamento completo para validar checkout, notificação e recebimento. Confira o ambiente das credenciais antes de realizar uma compra.

Detalhes: [integração com Mercado Pago](docs/mercado-pago.md) e [revisão de segurança](docs/revisao-seguranca.md). A revisão registra o estado observado na sua data; não representa uma verificação automática do deploy atual.

## Comandos úteis

Execute a partir da raiz:

| Comando | Função |
| --- | --- |
| `npm run dev` | Inicia API e frontend em desenvolvimento |
| `npm run db:check` | Testa autenticação no MySQL |
| `npm run build` | Compila todos os workspaces |
| `npm run build -w @urfood/web` | Compila somente o frontend |
| `npm run build -w @urfood/api` | Compila somente a API |
| `npm start` | Inicia a API compilada; não serve o frontend |
| `npm run preview -w @urfood/web` | Prévia do frontend compilado; não inicia a API nem o proxy de desenvolvimento |
| `npm run check:payments -w @urfood/api` | Diagnóstico dos pagamentos |

Não publique `.env`, anotações com credenciais ou backups do banco. Use os exemplos como modelo e configure os valores reais no ambiente de cada serviço.
