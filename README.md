# Pizzaria Borda Dourada · UrFood

Sistema de pedidos para a Pizzaria Borda Dourada, com cardápio digital, montagem de pizzas inteiras ou meio a meio, combos e painel administrativo.

## Funcionalidades

- Cardápio com categorias, imagens, preços e disponibilidade.
- Escolha de sabores por pizza, inclusive em combos com várias pizzas.
- Preços por tamanho P, M, G e GG no mesmo cadastro. O cliente escolhe um tamanho; no meio a meio, vale o maior preço dos dois sabores nesse tamanho. Sabores repetidos na mesma pizza são bloqueados.
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

`WEB_URL` é a origem principal do frontend permitida no CORS e no Socket.IO. Para permitir outros domínios, preencha `WEB_ALLOWED_ORIGINS` com origens separadas por vírgula. `API_PUBLIC_URL` é o endereço HTTPS público do backend, utilizado nas notificações de pagamento. Nenhum deles é o endereço do MySQL.

Para usar o domínio próprio e manter o acesso pela Vercel, configure no servidor da API e reinicie o processo após publicar a versão que oferece essa lista:

```dotenv
WEB_URL=https://www.jeitinhobrasileiroap.com
WEB_ALLOWED_ORIGINS=https://comandacom.vercel.app,https://jeitinhobrasileiroap.com
API_PUBLIC_URL=https://apijb.nivel3ti.com.br
```

Cada origem deve usar o protocolo correto e não conter caminhos. A configuração do DNS e do certificado de cada domínio deve estar válida independentemente dessa autorização.

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

Para habilitar os tamanhos de pizza em outro banco, execute antes de iniciar a nova versão da API:

```powershell
npm run db:migrate-pizza-sizes -w @urfood/api
```

A migração adiciona a coluna JSON `products.sizes` e preserva os produtos existentes. No admin, edite uma pizza e preencha os preços em **Tamanhos e preços**; campos vazios não são oferecidos ao cliente. Sem tamanhos preenchidos, o produto mantém o preço único. Para organizar cadastros antigos separados por tamanho, consolide os preços no cadastro desejado e revise os antigos antes de desativá-los; a migração não mescla produtos automaticamente. Nos combos, os sabores continuam sendo escolhidos por pizza e o preço é o do combo.

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

O arquivo `apps/web/vercel.json` já configura o fallback da SPA para abrir ou atualizar rotas como `/cardapio` e `/admin/dashboard`:

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

### VPS com PM2

O arquivo `ecosystem.config.cjs`, na raiz, inicia a API compilada como `jeitinho-api`, usando `apps/api` como diretório de trabalho. Ele mantém uma única instância em modo fork para não duplicar as tarefas periódicas e preservar o funcionamento do Socket.IO e dos uploads locais.

Execute na raiz do projeto no VPS, com o PM2 instalado:

```bash
npm run build -w @urfood/api
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
pm2 logs jeitinho-api --lines 100
```

Após atualizar o código, repita a compilação e o `startOrRestart`. As credenciais continuam no `.env` da raiz ou em `apps/api/.env`; não são colocadas no ecosystem. Variáveis definidas no ecosystem têm prioridade sobre o `.env`.

A configuração fornecida usa `HOST=0.0.0.0`, `PORT=3333` e `TRUST_PROXY=loopback, 192.168.199.39`. A API lê essa lista de proxies confiáveis para identificar o IP do cliente atrás do proxy. Os domínios configurados são `https://www.jeitinhobrasileiroap.com` e `https://apijb.nivel3ti.com.br`; origens adicionais continuam em `WEB_ALLOWED_ORIGINS` no `.env`.

Um frontend publicado não consegue acessar `localhost:3333` do seu computador. Se usar um túnel temporário, ele precisa permanecer online; o endereço deve estar coerente com a configuração da API e dos webhooks.

## Acesso da cozinha e alertas

Em **Usuários → Novo usuário** (ou ao editar uma conta), selecione **Cozinha** em **Perfil de acesso**. Somente o administrador pode gerenciar essas contas.

- A conta Cozinha entra diretamente em `/pedidos`, acompanha o Kanban, avança os status e imprime os pedidos.
- Os demais módulos ficam ocultos e bloqueados na API. Abrir suas URLs diretamente redireciona para Pedidos.
- O sininho recebe os eventos de novos pedidos por Socket.IO. Uma consulta a cada 10 segundos também recupera pedidos quando o tempo real estiver desconectado, sem repetir o alerta do mesmo pedido.
- O painel informa **Som ativo** ou **Ativar som**. O botão permite ativar e testar o alerta. O navegador pode exigir esse clique após abrir ou atualizar a página; mantenha a página aberta e o áudio do dispositivo habilitado.

O login tenta liberar o áudio durante a interação com o formulário. Se o navegador ainda bloquear a reprodução, aparece o aviso de ativação. Veja as [regras de áudio dos navegadores](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

Em outro banco, habilite o perfil antes de iniciar a nova versão da API:

```powershell
npm run db:migrate-kitchen-role -w @urfood/api
```

A migração preserva as contas existentes. Após publicar, atualize a API no VPS e o frontend na Vercel.

## Pizzas, pedidos manuais e comandas

Antes de iniciar a API desta versão em outro banco, execute a migração aditiva:

```powershell
npm run db:migrate-dining -w @urfood/api
```

Ela adiciona regras de pizza, mesas, sessões de consumo e identificação da mesa no pedido. Preserva produtos e pedidos existentes. Depois, compile e reinicie a API no VPS e publique o frontend na Vercel.

Em **Cardápio → Preços e bordas**, a organização é **categoria → estilo da massa → tamanho**. Cada sabor é cadastrado uma única vez e herda a tabela da categoria. As categorias com “premium” no nome identificam os sabores premium; as com “doce” identificam os doces. O cadastro do sabor mostra os preços herdados, sem exigir repetir os valores por produto.

Para cadastrar a tabela informada em outro ambiente, depois da migração acima, execute uma única vez:

```powershell
npm run db:configure-pizza-styles -w @urfood/api
```

O comando preserva os recheios existentes e não sobrescreve uma tabela de estilos já configurada.

| Categoria | Estilo | P | M | G | GG | Borda recheada |
| --- | --- | --- | --- | --- | --- | --- |
| Comum | Napolitana | R$ 32,90 | R$ 34,00 | R$ 67,00 | R$ 77,00 | + R$ 15,00 |
| Comum | Tonda romana | R$ 35,00 | R$ 50,00 | R$ 60,00 | — | Não oferecida |
| Premium | Napolitana | R$ 49,00 | R$ 59,00 | R$ 77,00 | R$ 87,00 | Salgada: Comuns; doce: Doces |
| Premium | Tonda romana | R$ 44,00 | R$ 55,00 | R$ 70,00 | — | Não oferecida |
| Doce | Napolitana | R$ 39,00 | R$ 54,00 | R$ 67,00 | R$ 77,00 | + R$ 18,00 |

Na aba **Recheios de borda**, cadastre os nomes e os tipos. Selecione os recheios salgados em **Comuns** e os doces em **Doces**. Nas pizzas avulsas, o tipo do recheio determina o acréscimo: **Salgada → Comuns**, **Doce → Doces**, inclusive nas pizzas premium e meio a meio. A categoria dos sabores não muda o preço da borda. O antigo acréscimo premium deixa de ser utilizado; os preços base das pizzas continuam seguindo suas tabelas. Borda com preço pendente ou não selecionada para oferta não aparece para o cliente. Tonda romana aceita apenas P/M/G e não oferece borda; pizza doce é somente napolitana e combina apenas com outros sabores doces.

O meio a meio comum + premium usa uma **tabela própria por estilo**, preenchida na aba correspondente. A borda segue o tipo do recheio, conforme descrito acima. Preços mistos ficam pendentes até serem informados; não são copiados da premium. Sem preço em um tamanho/combinação, o pedido não pode ser concluído. Os dois sabores usam o mesmo estilo e tamanho. Premium + premium segue a tabela premium; doce + doce segue a tabela doce. Combos preservam seus preços e adicionais anteriores; os preços de estilos se aplicam às pizzas avulsas.

O cliente escolhe estilo, tamanho, sabores e borda. O pedido guarda os nomes e valores efetivos para cozinha, histórico e impressão. O servidor recalcula tudo e rejeita estilos, tamanhos e bordas inválidos, independentemente dos valores enviados pelo navegador.

O catálogo público e o admin devolvem os preços herdados da tabela, mesmo que um produto ainda tenha valores antigos no cadastro. “A partir de” indica o menor preço entre os estilos e tamanhos disponíveis; o preço exato aparece ao selecionar massa e tamanho. Ao salvar a tabela, o cardápio aberto na mesma origem é atualizado, inclusive o carrinho. Páginas em outros dispositivos atualizam ao recuperar o foco ou na próxima verificação periódica. Se uma configuração do carrinho perder disponibilidade, o sistema pede uma nova escolha antes de continuar.

Na **Central de pedidos → Adicionar pedido manual**, monte o pedido no mesmo cardápio e preencha os dados do cliente. A opção **Pagamento online já recebido** registra o recebimento confirmado pela equipe; não gera cobrança no Mercado Pago. Somente administradores e operadores podem criar pedidos manuais. O perfil Cozinha continua restrito ao acompanhamento e avanço de pedidos.

Em **Mesas e comandas**, o padrão é 40 mesas. Ajuste a quantidade para ocultar as excedentes, preservando os números, links e históricos. Mesas com contas abertas não podem ser ocultadas. Imprima os QR codes pelo módulo; cada link `/mesa/:chave` identifica uma única mesa e funciona sem conta de cliente. Imprima a partir do domínio público que os clientes utilizarão, nunca do endereço localhost.

O cliente escaneia, abre a comanda e envia pedidos com observações diretamente à cozinha. O consumo não exige nome, telefone ou endereço e não recebe taxa de entrega ou taxa digital. Novos pedidos entram na central com os mesmos alertas de som. A equipe confere o consumo e registra a forma de recebimento ao fechar a conta; esse registro não dispara uma cobrança eletrônica. O sistema verifica se o consumo e a sessão ainda são os mesmos antes de fechar. A próxima abertura cria uma sessão nova. Pedidos de contas recebidas não podem ser cancelados pela central.

O botão **Escanear** está no módulo de mesas, no cardápio público e na página da comanda. A entrada pública `/comanda` também permite abrir o leitor. Ele solicita a câmera traseira, lê o QR no próprio navegador, valida a mesa na API e navega na mesma aba. QR codes externos são recusados; links antigos dos domínios do restaurante são convertidos para a rota local. A câmera é liberada ao fechar o leitor, sair da tela ou colocar a página em segundo plano. A colagem de links foi removida desse fluxo.

Abrir o endereço da mesa diretamente em um navegador sem autorização mostra **“Não autorizado, validado apenas pelo sistema.”** A API exige uma autorização assinada específica da mesa para consultar consumo, abrir a comanda e enviar pedidos. Essa autorização fica no `sessionStorage`, não no QR nem na URL: vale por 5 minutos antes da abertura e por até 4 horas para a sessão aberta. Após fechar a conta, o acesso vinculado àquela sessão é recusado. Atualizar a página e usar voltar na mesma aba preserva a autorização. A equipe autenticada também pode abrir a mesa pelo botão do admin.

O endpoint de leitura aceita apenas origens cadastradas em `WEB_URL`/`WEB_ALLOWED_ORIGINS`, além das origens locais em desenvolvimento. Isso protege o fluxo normal do navegador; não comprova a presença física nem a utilização de uma câmera. Um cliente programático pode reproduzir chamadas de um site público. Restrição à rede do restaurante exige controle adicional de rede ou autenticação. A validação de assinatura, finalidade, expiração e sessão segue as recomendações de [controle de acesso em APIs da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).

A câmera precisa de permissão do navegador e de uma origem segura (HTTPS ou localhost), conforme a [documentação de getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia). A leitura usa [jsQR](https://github.com/cozmo/jsQR), carregado apenas quando o leitor é aberto.

Categorias, montagem da pizza, sabores, carrinho e finalização da comanda participam do histórico da mesma página. O botão voltar do celular retorna uma etapa; avançar restaura a etapa seguinte. Itens e observações permanecem durante essa navegação. O link da mesa no admin também usa navegação interna, sem abrir outra aba.

O cupom térmico usa o logo atual, identifica a mesa quando houver, tem espaços reduzidos e texto reforçado. O QR de acompanhamento foi removido do cupom; os QR codes de mesa são impressos separadamente.

## Estoque e ordenação do catálogo

Antes de iniciar a API atualizada em outro banco, execute a migração aditiva:

```powershell
npm run db:migrate-inventory-removal -w @urfood/api
```

A exclusão retira o item do estoque e impede que a sincronização do catálogo o recrie. O produto do cardápio permanece disponível; o histórico de movimentações é preservado para consulta e estornos de pedidos anteriores.

No cardápio administrativo, clique no cabeçalho **Produto** para ordenar de A–Z; o próximo clique inverte para Z–A. A ordenação respeita a busca e a categoria selecionada.

## Imagens do cardápio

Fotos do banco são entregues em WebP nos tamanhos adequados para miniaturas e detalhes, sem recortar a imagem. As imagens existentes recebem versões otimizadas na consulta; não é necessário reenviá-las nem executar migração. O endereço original continua funcionando. Novos uploads são redimensionados para até 1200 px e comprimidos antes de salvar. O processamento usa [Sharp](https://sharp.pixelplumbing.com/api-resize/), com limite de concorrência e cache de memória limitado a 32 MB para as versões geradas.

No frontend, imagens fora da área visível carregam sob demanda. A visualização do produto recebe prioridade, e banner e logo usam arquivos WebP menores. Para regenerar esses arquivos após substituir os originais locais:

```powershell
node --import tsx apps/api/src/diagnostics/optimize-web-images.ts
```

Ao publicar esta atualização, execute `npm ci` na raiz do VPS antes de compilar e reiniciar a API, para instalar o processador de imagens. Publique também o frontend atualizado na Vercel.

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
