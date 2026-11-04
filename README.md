# Vilar Burguer — Cardápio digital e pedidos

Plataforma estática responsiva para cardápio, personalização, carrinho, checkout e abertura do WhatsApp, com **painel administrativo** e banco independente.

## Links

- **Cardápio:** https://vilar-burguer.onrender.com/
- **Painel:** https://vilar-burguer.onrender.com/admin.html
- **Privacidade:** https://vilar-burguer.onrender.com/privacidade.html
- **Link antigo:** https://vilar-burguer-pedidos.onrender.com/ (redireciona para o novo)
- **Supabase:** projeto `Vilar Burguer - Pedidos`, referência `dlreaviyprmgdumwwpcp`, região `sa-east-1`

## Como funciona

1. O cardápio consulta produtos, adicionais, categorias, taxas e configurações no Supabase, por meio de chave **publicável**.
2. O cliente escolhe produtos e adicionais. O carrinho é salvo apenas no navegador.
3. O checkout valida dados e chama a Edge Function `submit-order`. **Todos os preços e descontos são recalculados no servidor**, nunca confiados ao navegador.
4. A solicitação é registrada como `whatsapp_pending` e o WhatsApp abre com o resumo. **Não é possível comprovar automaticamente que a mensagem foi enviada**.
5. A equipe confere a conversa recebida e altera o status para `received` no painel.

Pedidos sem taxa cadastrada exibem valor final **a confirmar**. Horários e bairros ainda não confirmados devem ser configurados pelo proprietário antes de divulgar a loja.

## Arquivos

- `index.html` — layout, estilos e imagens ilustrativas temporárias.
- `app.js` — catálogo, carrinho, validação e integração com a Edge Function.
- `admin.html` e `admin.js` — gestão autenticada de produtos, adicionais, categorias, bairros, cupons, horários, pagamentos, pedidos e relatórios.
- `config.js` — URL do projeto e **chave publicável**; nunca inserir chaves secretas.
- `privacidade.html` — aviso de privacidade.
- `manifest.webmanifest`, `sw.js`, `icon.svg` — recursos PWA.
- `supabase/functions/submit-order/index.ts` — fonte da Edge Function.

## Primeiro acesso administrativo

1. Abra `/admin.html`, informe e-mail e senha e clique em **Criar minha conta**.
2. Confirme o e-mail, se solicitado pelo Supabase.
3. O responsável técnico deve localizar o usuário em **Supabase > Authentication > Users** e liberar seu UUID na tabela `public.admin_users`, por exemplo:

   ```sql
   insert into public.admin_users (user_id,role)
   values ('UUID_REAL_DO_USUARIO','owner');
   ```

4. Depois, use **Entrar no painel**. Apenas contas explicitamente cadastradas em `admin_users` podem administrar o site.

**Nunca habilite cadastro administrativo automático baseado apenas no e-mail digitado pelo usuário.**

## Configuração comercial

Antes do lançamento: revisar preços e descrições, cadastrar bairros/cidades e taxas, informar horários, confirmar pagamentos e testar pedido completo com o WhatsApp da hamburgueria. As imagens permanecem ilustrativas até a entrega das fotos reais.

## Segurança e privacidade

- Supabase Row Level Security (RLS) habilitado em todas as tabelas públicas.
- Catálogo e configurações públicas somente para leitura anônima.
- Pedidos, cupons e edição do cardápio exigem conta administrativa autorizada.
- Edge Function recalcula valores e aplica limite básico de tentativas por telefone.
- Não há captura de dados de cartão nem processamento de pagamento online.
- Os dados pessoais ficam no banco de pedidos; exportações CSV devem ser tratadas como informações restritas.
- O projeto deve revisar periodicamente os dados retidos e suas obrigações LGPD.

## Implantação

O site oficial usa o serviço estático Render `vilar-burguer`, que copia os arquivos HTML/JS/SVG/manifest para `site/`. Alterações na branch `main` podem disparar deploy automático; se o webhook não disparar, usar **Deploy latest commit**.

O serviço antigo `vilar-burguer-pedidos` continua ativo apenas para preservar o link histórico e redirecionar para o novo endereço.

## Limitações conhecidas

- **Acesso administrativo:** requer cadastro e liberação de pelo menos um usuário.
- **Taxas e horários:** dependem de confirmação do proprietário; não há valores fictícios cadastrados.
- **Pedidos:** registro no site não equivale à confirmação de recebimento no WhatsApp.
- **Fotos:** placeholders ilustrativos até o envio das fotos reais.
- **Cupons:** uso contabilizado quando a equipe confirma o pedido.
- **Testes ponta a ponta:** validar com um pedido de teste em navegador real antes de divulgar comercialmente.
- **Custos:** criação do projeto Supabase foi cotada a US$ 0/mês; verificar limites gratuitos e eventuais alterações de planos.

## Operação

Os pedidos são exibidos no painel por status. **Pedidos pendentes não devem ser somados às vendas**; a visão de faturamento usa apenas pedidos marcados como entregues. O proprietário pode exportar o histórico em CSV.
