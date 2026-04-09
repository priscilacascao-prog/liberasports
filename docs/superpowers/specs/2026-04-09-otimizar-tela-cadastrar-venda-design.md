# Otimizar tela de Cadastrar Venda

**Data:** 2026-04-09
**Autora:** Priscila
**Arquivo afetado:** `app/dashboard/page.tsx`

## Motivação

A tela atual de Cadastrar Venda exige muita rolagem, especialmente no mobile. O endereço de entrega é um textarea livre, sem integração com CEP — diferente da loja, que já tem autopreenchimento via ViaCEP. O objetivo é reduzir rolagem, tornar o preenchimento mais rápido e padronizar o endereço com o que a loja já usa.

## Escopo

### Dentro do escopo

1. Compactar a sidebar direita de checkout da tela de Venda em blocos densos separados por divisores finos
2. Substituir o textarea único de endereço por campos separados (CEP, endereço, número, quadra, lote, cidade, UF, complemento)
3. Integrar autopreenchimento via ViaCEP (mesmo comportamento da loja)
4. Bloco de endereço desaparece quando método de entrega é `RETIRADA`
5. Todos os campos de endereço permanecem opcionais
6. Concatenar campos separados em `delivery_address` no momento de salvar no Firestore — sem migração de dados antigos
7. Incluir endereço de entrega na mensagem de WhatsApp quando o pedido entra em produção e método ≠ `RETIRADA`
8. Manter responsividade: desktop em 2 colunas (já é assim), mobile em 1 coluna

### Fora do escopo

- Tela da loja (`app/loja/page.tsx`) — já funciona como referência e não será alterada
- Vendas já salvas no Firestore — continuam com `delivery_address` no formato antigo
- Rastreio, relatório PDF ou outros consumidores de `delivery_address` — continuam lendo a mesma string
- Criação de componente reutilizável de endereço (seria útil, mas é fora do escopo deste spec)

## Estrutura da sidebar de checkout

A sidebar direita (`lg:col-span-2`) passa a ter **4 blocos** separados por `border-b border-zinc-800`, sem `mb-6 pb-6` entre eles:

```
RESUMO DA VENDA (título)
├── Carrinho (lista de produtos) OU input de valor manual
├── ──────────────────────────────
├── BLOCO 1 — CLIENTE
│   ├── Nome (autocomplete de clientes cadastrados)
│   └── WhatsApp | CPF/CNPJ  (grid 2 cols)
├── ──────────────────────────────
├── BLOCO 2 — PEDIDO
│   ├── Descrição / Grade (textarea 2 rows)
│   ├── Valor Total (R$) — só se carrinho vazio
│   ├── Prazo de Entrega | Método de Entrega  (grid 2 cols)
│   └── ☑ Entra em Produção
├── ──────────────────────────────
├── BLOCO 3 — ENDEREÇO DE ENTREGA  (só se método ≠ RETIRADA)
│   ├── CEP
│   ├── Endereço (autopreenchido pelo CEP, editável)
│   ├── Número | Quadra | Lote  (grid 3 cols)
│   ├── Cidade | UF  (grid com UF menor)
│   └── Complemento
├── ──────────────────────────────
├── BLOCO 4 — PAGAMENTO
│   ├── Forma de Pagamento (botões: PIX | BOLETO | CRÉDITO | DÉBITO | OUTROS)
│   └── Data | Parcelas (Parcelas só se CRÉDITO)
├── ──────────────────────────────
├── TOTAL: R$ X,XX
└── Botão: Cadastrar Venda / Cadastrar Venda + Produção
```

### Densidade

Para caber mais informação na altura da tela:

- Labels passam para `text-[10px]` (hoje alguns são `text-sm`)
- Inputs passam de `p-3` para `p-2`
- `space-y-3` entre campos dentro de um bloco vira `space-y-2`
- `mb-6 pb-6 border-b` dos grupos vira `pb-4 mb-4 border-b border-zinc-800`

## Campos de endereço separados

### Novos states

Substituem o state único `saleDeliveryAddress`:

```
saleCep, saleEndereco, saleNumero, saleQuadra, saleLote,
saleCidade, saleEstado, saleComplemento
```

Todos inicializados com `''`. Todos opcionais — nenhuma validação obriga preenchimento.

### Reset após salvar

Todos os 8 states acima são zerados junto com os demais campos no reset pós-cadastro (bloco que já zera `saleClient`, `saleWhatsapp`, etc.).

### Comportamento do CEP

Copiado da loja (`app/loja/page.tsx`):

1. Usuário digita no campo CEP
2. Máscara `00000-000` aplicada (8 dígitos máximo)
3. Quando atinge 8 dígitos, `fetch('https://viacep.com.br/ws/{cep}/json/')`
4. Se resposta não tem `erro`:
   - `saleEndereco` = `"{logradouro}, {bairro}"`
   - `saleCidade` = `localidade`
   - `saleEstado` = `uf`
5. Se der erro de rede ou CEP inválido: silencioso, usuário pode preencher manualmente
6. Campos autopreenchidos continuam editáveis (pode corrigir à mão)

### Exibição condicional

```
{saleDeliveryMethod !== 'RETIRADA' && (
  <div className="pb-4 mb-4 border-b border-zinc-800">
    ... campos de endereço ...
  </div>
)}
```

## Integração com `delivery_address` do Firestore

### Concatenação no salvamento

No momento de salvar, uma função helper `buildDeliveryAddress()` monta a string a partir dos campos separados, juntando apenas as partes preenchidas:

```
"{endereco}, Nº {numero}, Qd {quadra}, Lt {lote}, {complemento} - {cidade}/{estado} - CEP: {cep}"
```

Regras:

- Cada parte só é incluída se o campo correspondente não estiver vazio
- Separadores (`, ` e ` - `) só são inseridos entre partes realmente presentes
- Se todos os campos estão vazios (ex: método = RETIRADA), `delivery_address` fica `""`

### Compatibilidade retroativa

- `delivery_address` continua sendo uma string única no Firestore
- Vendas antigas (string livre) continuam funcionando em todos os consumidores (rastreio, PDF, WhatsApp, etc.)
- Nenhuma migração de dados necessária
- Os 8 campos novos **não** são gravados separadamente no Firestore — só a string concatenada

## Mensagem do WhatsApp

### Hoje

Quando pedido entra em produção e tem WhatsApp preenchido, a mensagem inclui:
- Pedido, Valor, Entrega prevista, Método, Pagamento
- Se método = RETIRADA: endereço fixo da Libera (para retirada)
- Link de rastreio

### Novo comportamento

Adicionar bloco de endereço de entrega quando:
- Pedido entra em produção (`saleEntersProduction === true`)
- Tem WhatsApp preenchido (`saleWhatsapp.trim()`)
- Método **não** é RETIRADA
- `delivery_address` concatenado não está vazio

Bloco adicional na mensagem:

```
*Endereço de entrega:*
_{delivery_address concatenado}_
```

Posicionamento: depois de `*Pagamento:*` e antes do link de rastreio.

Quando método = RETIRADA: continua igual (mostra o endereço fixo da Libera para retirada).

## Responsividade

- Desktop (`lg:` e acima): mantém 2 colunas — `lg:col-span-3` produtos + `lg:col-span-2` sidebar
- Mobile (abaixo de `lg:`): 1 coluna, sidebar abaixo dos produtos (já é assim hoje via `order-1 lg:order-2`)

Nenhum breakpoint novo necessário — a compactação de densidade beneficia ambos.

## Arquivos alterados

- `app/dashboard/page.tsx` — único arquivo. States, JSX da sidebar de checkout, função `handleSaleSubmit` (concatenação de endereço), construção da mensagem do WhatsApp, reset pós-cadastro.

## Riscos e trade-offs

- **Densidade pode ficar apertada no mobile**: labels `text-[10px]` são pequenas. Se ficar ilegível na prática, voltar para `text-[11px]` só no breakpoint mobile.
- **ViaCEP pode falhar**: é uma API externa. Já tratado com `try/catch` silencioso (igual loja) — usuário preenche manualmente nesse caso.
- **Endereço no WhatsApp pode vazar dados sensíveis**: é uma escolha explícita do usuário (Priscila). O cliente está recebendo a própria mensagem, então é seu próprio endereço.
