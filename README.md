# Vilar Burguer — Cardápio, Pix antecipado e acompanhamento

Aplicação responsiva com cardápio editável, personalização, carrinho, gestão de pedidos e acompanhamento individual.

**Situação atual (novembro de 2026):** o cardápio e o carrinho estão disponíveis. **O checkout está bloqueado** enquanto não houver uma conta Pix com integração automática. Nenhum pedido pode ser liberado para preparo antes da confirmação de pagamento pelo provedor.

## Endereços

- Cardápio: https://vilar-burguer.onrender.com/
- Administração: https://vilar-burguer.onrender.com/admin.html
- Acompanhamento: https://vilar-burguer.onrender.com/acompanhar.html
- **Prévia ilustrativa do acompanhamento:** https://vilar-burguer.onrender.com/acompanhar.html?demo=1
- Privacidade: https://vilar-burguer.onrender.com/privacidade.html
- Link antigo: https://vilar-burguer-pedidos.onrender.com/ (redirecionamento)
- Supabase independente: `dlreaviyprmgdumwwpcp` (`Vilar Burguer - Pedidos`)

## Fluxo operacional planejado

1. Cliente monta carrinho e informa endereço.
2. Backend calcula preço, adicionais, descontos e taxa. **Taxa desconhecida impede a cobrança**, pois o Pix deve ter valor final definido.
3. Provedor gera QR Code Pix dinâmico e código Copia e Cola.
4. O pagamento é confirmado **somente via API/webhook autenticado do provedor**. Print ou comprovante enviado não substitui a confirmação.
5. O backend registra `payment_status='paid'`, `paid_at`, `provider_payment_id` e libera `status='received'` de forma idempotente.
6. O pedido entra na fila da cozinha; cliente recebe um link individual de acompanhamento.
7. Equipe atualiza `received → preparing → dispatched → delivered` no painel. Cliente vê as mudanças no link, com consulta a cada 10 segundos.
8. Equipe pode compartilhar o status pelo WhatsApp com mensagem pré-preenchida; **o envio é manual**. Automação requer WhatsApp Business Platform/API.

**Não existe pagamento Pix real nesta versão.** O botão de finalizar está desabilitado no frontend e a função `submit-order` retorna HTTP 503, mesmo que alguém tente chamá-la diretamente. A flag `payment_gateway_ready` está bloqueada para alterações pelo painel e a configuração comercial está com `accepting_orders=false`.

## Gestão e segurança

- Supabase Auth + tabela `admin_users` definem o acesso à administração. Contas recém-criadas não ganham permissão automaticamente.
- `orders` armazena `payment_status`, `paid_at`, `provider_payment_id` e `tracking_token` aleatório (UUID).
- Restrições e gatilhos PostgreSQL impedem marcar pedidos como recebidos/em preparo/em rota/entregues sem pagamento aprovado e referência do provedor.
- Administradores podem mudar **apenas o status operacional**, seguindo transições permitidas; não podem editar valores, dados do pagamento ou marcar um Pix como pago.
- `order_status_events` registra o histórico das etapas. Apenas administradores podem consultar o histórico diretamente; inserções são feitas por trigger.
- `order-status` é uma Edge Function que recebe o token individual e devolve **apenas código, situação do pagamento, status e horários**. Não expõe nome, telefone, endereço ou itens.
- O link individual deve ser tratado como privado. A página usa `noindex`, `no-referrer` e `Cache-Control: no-store`.
- O acompanhamento consulta a API a cada 10 segundos com a página visível; não é push via WhatsApp.
- Vendas no painel somam somente pedidos pagos e entregues.
- O cliente não fornece dados de cartão ao site.

## Arquivos

- `index.html`: interface do cardápio e imagens ilustrativas.
- `app.js`: carrinho e estado do checkout Pix bloqueado.
- `admin.html` e `admin.js`: administração e compartilhamento de andamento.
- `acompanhar.html`: rastreamento individual e prévia de demonstração.
- `config.js`: chave publicável (nunca inserir chaves secretas).
- `privacidade.html`: aviso sobre dados pessoais e links de acompanhamento.
- `supabase/functions/submit-order/index.ts`: endpoint **bloqueado** até a integração Pix.
- `supabase/functions/order-status/index.ts`: endpoint de consulta por token.
- `tests/smoke.mjs`: verificações automáticas de sintaxe e controles principais.
- `render.yaml`: publicação estática multipágina.

## Pedidos de teste, relatórios e autonomia do contratante

- O painel possui a aba **🧪 Pedidos de teste**, acessível somente a administradores autenticados.
- A criação de pedidos simulados consulta produtos e preços atuais, sem gerar Pix e sem acionar WhatsApp.
- Os pedidos simulados ficam em `demo_orders` e `demo_order_events`, separados dos pedidos e eventos comerciais.
- A página de acompanhamento aceita `?demo_token=UUID`, identificando claramente o pedido como **TESTE — SEM PAGAMENTO REAL**.
- É possível avançar as etapas, copiar o link e excluir testes. As transições são validadas no PostgreSQL.
- O dashboard usa `vilar_daily_sales` para mostrar, por dia em São Paulo, confirmações de pagamento, entregas e faturamento real. O ticket médio usa somente vendas reais entregues.
- Em **Configurações**, o administrador pode trocar a própria senha após confirmar a senha atual, usando Supabase Auth.
- A edição de fotos continua disponível pelo painel (JPEG/PNG/WebP, até 5 MB), com armazenamento Supabase separado.
- **Vencimento contratual informado:** 25/11/2026, R$ 350. Registrado em `platform_contract` apenas para controle. **Aviso e suspensão automática estão desativados**, até confirmação da natureza da cobrança, cláusula contratual e forma de reativação. Nenhum bloqueio de dados ou pedidos existentes foi configurado.

## Habilitação do Pix (fase futura, depende do proprietário)

1. Definir a conta de recebimento e provedor (por exemplo, Mercado Pago ou Asaas).
2. Validar titularidade da conta, taxas, prazo de liquidação e modalidade Pix dinâmico com webhook.
3. Configurar credenciais **somente no backend** (Secrets do Supabase), nunca no HTML ou GitHub.
4. Implementar criação de cobrança, expiração, conciliação e verificação de autenticidade de webhook.
5. Testar cenários: pagamento aprovado, pendente, expirado, cancelado, reembolso, pagamento duplicado, taxa de entrega e cupom.
6. Publicar o fluxo de pagamento com QR Code e Copia e Cola, redirecionamento para acompanhamento e liberação de WhatsApp **apenas após confirmação**.
7. Habilitar `payment_gateway_ready` somente após homologação e, depois, `accepting_orders`.

## Configuração da loja

No painel, revisar produtos, bairros atendidos, taxas, horários e contato comercial. A opção de aceitar novos pedidos permanece bloqueada até a integração Pix. As fotos são ilustrativas até a entrega das imagens reais.

Para o primeiro administrador: criar conta em `/admin.html`, confirmar e-mail se solicitado e cadastrar o UUID em `public.admin_users` como `owner` por meio de um responsável autorizado. Nunca conceder acesso automaticamente apenas pelo e-mail informado.

## Implantação e limitações

A aplicação é publicada na Render a partir de `main`. O site antigo preserva links históricos. Não foram executados testes com pagamentos reais porque **a conta Pix ainda não foi definida**. O acompanhamento pode ser visualizado em modo demonstração, claramente identificado como não real. Não prometer confirmação de pedido, entrega ou WhatsApp automático enquanto as integrações não estiverem homologadas.
