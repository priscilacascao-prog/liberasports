# Otimizar Tela de Cadastrar Venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir rolagem na tela de Cadastrar Venda, separar campos de endereço com autopreenchimento via ViaCEP (igual loja) e incluir endereço de entrega na mensagem do WhatsApp.

**Architecture:** Alterações restritas ao `app/dashboard/page.tsx`. Novos states individuais para os campos de endereço substituem o textarea único; um helper `buildDeliveryAddress()` concatena os campos ao salvar no Firestore, mantendo compatibilidade com `delivery_address` (string única). A sidebar de checkout é reorganizada em 4 blocos compactos com divisores finos.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, Tailwind 4, Firebase Firestore, ViaCEP (API pública).

**Spec:** `docs/superpowers/specs/2026-04-09-otimizar-tela-cadastrar-venda-design.md`

**Test strategy:** Projeto não tem testes unitários. Verificação = `npx tsc --noEmit` + `npm run build` + teste manual no `npm run dev` (preenchendo uma venda real de ponta a ponta).

---

## File Structure

**Arquivo único alterado:** `app/dashboard/page.tsx`

- **Linhas 172–186 (states da venda):** remover `saleDeliveryAddress`, adicionar 8 novos states
- **Dentro do componente, perto de outras funções helper (~linha 560, antes de `handleSaleSubmit`):** adicionar `buildDeliveryAddress()`
- **Linha ~588–600 (montagem do objeto da venda):** usar helper em vez de `saleDeliveryAddress.trim()`
- **Linha ~670–690 (mensagem WhatsApp):** adicionar bloco de endereço de entrega
- **Linha ~693–710 (reset pós-cadastro):** zerar os 8 novos states
- **Linha ~2797–2887 (JSX da sidebar de checkout):** reorganizar em 4 blocos densos, substituir textarea de endereço por campos separados

---

## Task 1: Adicionar states de endereço separados e helper `buildDeliveryAddress`

**Files:**
- Modify: `app/dashboard/page.tsx` (states ~linha 179 e função helper próxima a `handleSaleSubmit`)

### - [ ] Step 1.1: Substituir o state `saleDeliveryAddress` por 8 states granulares

Localizar a linha:

```tsx
const [saleDeliveryAddress, setSaleDeliveryAddress] = useState('');
```

Substituir por:

```tsx
const [saleCep, setSaleCep] = useState('');
const [saleEndereco, setSaleEndereco] = useState('');
const [saleNumero, setSaleNumero] = useState('');
const [saleQuadra, setSaleQuadra] = useState('');
const [saleLote, setSaleLote] = useState('');
const [saleCidade, setSaleCidade] = useState('');
const [saleEstado, setSaleEstado] = useState('');
const [saleComplemento, setSaleComplemento] = useState('');
```

### - [ ] Step 1.2: Adicionar helper `buildDeliveryAddress` dentro do componente `DashboardPage`

Localizar a função `handleSaleSubmit` (em torno da linha 560). Logo **antes** dela, dentro do componente, adicionar:

```tsx
const buildDeliveryAddress = () => {
    const endereco = saleEndereco.trim();
    const numero = saleNumero.trim();
    const quadra = saleQuadra.trim();
    const lote = saleLote.trim();
    const complemento = saleComplemento.trim();
    const cidade = saleCidade.trim();
    const estado = saleEstado.trim();
    const cep = saleCep.trim();

    const firstParts: string[] = [];
    if (endereco) firstParts.push(endereco);
    if (numero) firstParts.push(`Nº ${numero}`);
    if (quadra) firstParts.push(`Qd ${quadra}`);
    if (lote) firstParts.push(`Lt ${lote}`);
    if (complemento) firstParts.push(complemento);

    const locationParts: string[] = [];
    if (cidade && estado) locationParts.push(`${cidade}/${estado}`);
    else if (cidade) locationParts.push(cidade);
    else if (estado) locationParts.push(estado);
    if (cep) locationParts.push(`CEP: ${cep}`);

    const sections: string[] = [];
    if (firstParts.length) sections.push(firstParts.join(', '));
    if (locationParts.length) sections.push(locationParts.join(' - '));

    return sections.join(' - ');
};
```

### - [ ] Step 1.3: Rodar typecheck para garantir que nada quebrou

Run: `cd /Users/macbookpro/Documents/libera-sports/.claude/worktrees/amazing-euler && npx tsc --noEmit 2>&1 | grep -v "react-label" | head -30`

Expected: **zero erros em `app/dashboard/page.tsx`**. (O erro de `react-label` em `components/ui/label.tsx` é preexistente e não tem relação; pode ser ignorado.)

**Se aparecer erro** sobre `saleDeliveryAddress` não definido em algum ponto que não está nesta task, **pare** — é um consumidor que a próxima task vai atualizar. Anote a linha e prossiga para a Task 2 (não commitar ainda).

### - [ ] Step 1.4: NÃO commitar ainda

O código está em estado inconsistente (consumidores de `saleDeliveryAddress` ainda existem). Prosseguir direto para Task 2.

---

## Task 2: Atualizar `handleSaleSubmit` (uso do helper) e reset pós-cadastro

**Files:**
- Modify: `app/dashboard/page.tsx` (linhas ~588–600 e ~693–710)

### - [ ] Step 2.1: Substituir uso de `saleDeliveryAddress.trim()` pelo helper

Localizar no `handleSaleSubmit` a linha:

```tsx
delivery_address: saleDeliveryAddress.trim(),
```

Substituir por:

```tsx
delivery_address: buildDeliveryAddress(),
```

### - [ ] Step 2.2: Atualizar o bloco de reset pós-cadastro

Localizar a linha:

```tsx
setSaleDeliveryAddress('');
```

Substituir por:

```tsx
setSaleCep('');
setSaleEndereco('');
setSaleNumero('');
setSaleQuadra('');
setSaleLote('');
setSaleCidade('');
setSaleEstado('');
setSaleComplemento('');
```

### - [ ] Step 2.3: Rodar typecheck

Run: `npx tsc --noEmit 2>&1 | grep "dashboard/page" | head -20`

Expected: pode ainda mostrar **um erro** em `saleDeliveryAddress` no JSX (textarea na ~linha 2881). A próxima task resolve.

### - [ ] Step 2.4: NÃO commitar

Estado ainda inconsistente (JSX). Prosseguir para Task 3.

---

## Task 3: Atualizar mensagem do WhatsApp para incluir endereço de entrega

**Files:**
- Modify: `app/dashboard/page.tsx` (bloco de construção do `msgLines`, ~linha 669–683)

### - [ ] Step 3.1: Adicionar endereço de entrega ao `msgLines`

Localizar o array `msgLines` dentro do `if (saleEntersProduction && saleWhatsapp.trim())`:

```tsx
const msgLines = [
    `Olá *${clientName}*! Seu pedido na *Libera Sports* foi cadastrado com sucesso!`,
    '',
    `*Pedido:* ${newOrderNumber}`,
    `*Valor:* R$ ${formattedValue}`,
    ...(deliveryDate ? [`*Entrega prevista:* ${deliveryDate}`] : []),
    `*Método:* ${saleDeliveryMethod}`,
    `*Pagamento:* ${paymentMethod}`,
    ...(saleDeliveryMethod === 'RETIRADA' ? ['', '*Endereço de retirada:* _Rua Manguapé, Quadra 40-A, Lote 01-A, Vila Alzira, Aparecida de Goiânia-GO, CEP: 74.913-350_'] : []),
    '',
    'Acompanhe seu pedido em tempo real:',
    trackingUrl,
    '',
    '_Libera Sports - Vista Libera e viva a liberdade_'
];
```

Substituir por:

```tsx
const builtDeliveryAddress = buildDeliveryAddress();
const msgLines = [
    `Olá *${clientName}*! Seu pedido na *Libera Sports* foi cadastrado com sucesso!`,
    '',
    `*Pedido:* ${newOrderNumber}`,
    `*Valor:* R$ ${formattedValue}`,
    ...(deliveryDate ? [`*Entrega prevista:* ${deliveryDate}`] : []),
    `*Método:* ${saleDeliveryMethod}`,
    `*Pagamento:* ${paymentMethod}`,
    ...(saleDeliveryMethod === 'RETIRADA'
        ? ['', '*Endereço de retirada:* _Rua Manguapé, Quadra 40-A, Lote 01-A, Vila Alzira, Aparecida de Goiânia-GO, CEP: 74.913-350_']
        : builtDeliveryAddress
            ? ['', '*Endereço de entrega:*', `_${builtDeliveryAddress}_`]
            : []),
    '',
    'Acompanhe seu pedido em tempo real:',
    trackingUrl,
    '',
    '_Libera Sports - Vista Libera e viva a liberdade_'
];
```

**Detalhes:**
- Quando `saleDeliveryMethod === 'RETIRADA'`: mantém o bloco de retirada existente
- Quando método ≠ RETIRADA e `builtDeliveryAddress` tem conteúdo: adiciona `*Endereço de entrega:* _{string}_`
- Quando método ≠ RETIRADA e `builtDeliveryAddress` vazio: não adiciona nada (fallback silencioso)

### - [ ] Step 3.2: NÃO commitar

JSX ainda não atualizado. Prosseguir para Task 4.

---

## Task 4: Reorganizar JSX da sidebar de checkout em 4 blocos compactos

**Files:**
- Modify: `app/dashboard/page.tsx` (linhas ~2797–2887 — bloco "Dados do Cliente e Produção")

Esta é a task maior. Ela substitui inteiramente o bloco `<div className="space-y-3 mb-6 border-b border-zinc-900 pb-6">` atual.

### - [ ] Step 4.1: Localizar o bloco atual

Encontrar este trecho (aproximadamente linhas 2797–2887):

```tsx
{/* Dados do Cliente e Produção */}
<div className="space-y-3 mb-6 border-b border-zinc-900 pb-6">
    <div className="relative">
        <label className="block text-sm font-black uppercase tracking-widest text-white mb-1">Cliente</label>
        ...
```

Termina em:

```tsx
        <label className="flex items-center gap-3 cursor-pointer mt-2 bg-zinc-950/50 rounded-xl p-3">
            <input type="checkbox" checked={saleEntersProduction} onChange={e => setSaleEntersProduction(e.target.checked)} className="w-5 h-5 rounded accent-[#39FF14]" />
            <span className="text-sm font-black uppercase tracking-widest text-white">Entra em Produção</span>
        </label>
    </div>
```

### - [ ] Step 4.2: Substituir o bloco inteiro pelo novo JSX compactado

Substituir tudo que foi localizado no Step 4.1 por:

```tsx
{/* BLOCO 1 — CLIENTE */}
<div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
    <div className="relative">
        <label className="block text-[10px] font-black uppercase tracking-widest text-white mb-1">Cliente</label>
        <input type="text" value={saleClient}
            onChange={e => { setSaleClient(e.target.value); setShowClientSuggestions(e.target.value.length > 0); }}
            onFocus={() => { if (saleClient.length > 0) setShowClientSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
            placeholder="Nome do cliente..."
            className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
        {showClientSuggestions && saleClient.length > 1 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden z-50 shadow-xl max-h-[200px] overflow-y-auto">
                {fornecedores.filter(f => f.name.toLowerCase().includes(saleClient.toLowerCase()) || (f.cpf_cnpj && f.cpf_cnpj.includes(saleClient.replace(/\D/g, '')))).map(f => (
                    <button key={f.id} type="button"
                        onMouseDown={() => {
                            setSaleClient(f.name);
                            setSaleWhatsapp(f.whatsapp || '');
                            setSaleCpfCnpj(f.cpf_cnpj ? formatCpfCnpj(f.cpf_cnpj) : '');
                            setShowClientSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors">
                        <p className="text-sm font-bold text-white">{f.name}</p>
                        <p className="text-xs text-white/50">
                            {f.cpf_cnpj ? (f.cpf_cnpj.length === 11 ? f.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) : ''}
                            {f.whatsapp && ` • ${f.whatsapp}`}
                        </p>
                    </button>
                ))}
                {fornecedores.filter(f => f.name.toLowerCase().includes(saleClient.toLowerCase())).length === 0 && (
                    <button type="button"
                        onMouseDown={() => {
                            setFornecedorName(saleClient.trim());
                            setFornecedorType('CLIENTE');
                            setFornecedorCpfCnpj('');
                            setFornecedorCpfCnpjError('');
                            setFornecedorWhatsapp('');
                            setEditingFornecedor(null);
                            setFornecedorModalOpen(true);
                            setShowClientSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors border-t border-zinc-800">
                        <p className="text-sm font-bold text-[#39FF14]">+ Cadastrar &quot;{saleClient.trim().toUpperCase()}&quot; como cliente</p>
                    </button>
                )}
            </div>
        )}
    </div>
    <div className="grid grid-cols-2 gap-2">
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white mb-1">WhatsApp</label>
            <input type="text" value={saleWhatsapp} onChange={e => setSaleWhatsapp(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
        </div>
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white mb-1">CPF/CNPJ</label>
            <input type="text" value={saleCpfCnpj} onChange={e => { const formatted = formatCpfCnpj(e.target.value); setSaleCpfCnpj(formatted); const d = e.target.value.replace(/\D/g, ''); if (d.length === 11 || d.length === 14) setSaleCpfCnpjError(validateCpfCnpj(d) ? '' : 'Inválido'); else setSaleCpfCnpjError(''); }} placeholder="000.000.000-00" className={`w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 text-sm font-bold placeholder:text-zinc-600 ${saleCpfCnpjError ? 'ring-1 ring-red-500' : 'focus:ring-[#39FF14]'}`} />
            {saleCpfCnpjError && <p className="text-red-500 text-[10px] font-bold mt-0.5">{saleCpfCnpjError}</p>}
        </div>
    </div>
</div>

{/* BLOCO 2 — PEDIDO */}
<div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
    <div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-white mb-1">Descrição / Grade</label>
        <textarea value={saleDescription} onChange={e => setSaleDescription(e.target.value)} placeholder="Detalhes do pedido..." rows={2} className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600 resize-none" />
    </div>
    {cart.length === 0 && (
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-[#39FF14] mb-1">Valor Total (R$)</label>
            <input type="text" value={saleManualValue} onChange={e => setSaleManualValue(formatCurrency(e.target.value))} placeholder="0,00" className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
        </div>
    )}
    <div className="grid grid-cols-2 gap-2">
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white mb-1">Prazo de Entrega</label>
            <input type="date" value={saleDeadline} onChange={e => setSaleDeadline(e.target.value)} className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold [color-scheme:dark]" />
        </div>
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white mb-1">Método de Entrega</label>
            <select value={saleDeliveryMethod} onChange={e => setSaleDeliveryMethod(e.target.value as any)} className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold appearance-none">
                <option value="MOTOBOY">MOTOBOY</option>
                <option value="CORREIOS/TRANSPORTADORA">CORREIOS/TRANSPORTADORA</option>
                <option value="RETIRADA">RETIRADA</option>
            </select>
        </div>
    </div>
    <label className="flex items-center gap-2 cursor-pointer mt-1 bg-zinc-900/50 rounded-xl p-2">
        <input type="checkbox" checked={saleEntersProduction} onChange={e => setSaleEntersProduction(e.target.checked)} className="w-4 h-4 rounded accent-[#39FF14]" />
        <span className="text-[11px] font-black uppercase tracking-widest text-white">Entra em Produção</span>
    </label>
</div>

{/* BLOCO 3 — ENDEREÇO DE ENTREGA (só se método ≠ RETIRADA) */}
{saleDeliveryMethod !== 'RETIRADA' && (
    <div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
        <label className="block text-[10px] font-black uppercase tracking-widest text-white">Endereço de Entrega</label>
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">CEP</label>
            <input type="text" value={saleCep} onChange={async e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                const formatted = v.length > 5 ? v.replace(/(\d{5})(\d)/, '$1-$2') : v;
                setSaleCep(formatted);
                if (v.length === 8) {
                    try {
                        const res = await fetch(`https://viacep.com.br/ws/${v}/json/`);
                        const data = await res.json();
                        if (!data.erro) {
                            setSaleEndereco(`${data.logradouro || ''}${data.bairro ? ', ' + data.bairro : ''}`);
                            setSaleCidade(data.localidade || '');
                            setSaleEstado(data.uf || '');
                        }
                    } catch {}
                }
            }} placeholder="00000-000"
                className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
        </div>
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Endereço</label>
            <input type="text" value={saleEndereco} onChange={e => setSaleEndereco(e.target.value)} placeholder="Rua, bairro..."
                className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
        </div>
        <div className="grid grid-cols-3 gap-2">
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Número</label>
                <input type="text" value={saleNumero} onChange={e => setSaleNumero(e.target.value)} placeholder="Nº"
                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
            </div>
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Quadra</label>
                <input type="text" value={saleQuadra} onChange={e => setSaleQuadra(e.target.value)} placeholder="Qd"
                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
            </div>
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Lote</label>
                <input type="text" value={saleLote} onChange={e => setSaleLote(e.target.value)} placeholder="Lt"
                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
            </div>
        </div>
        <div className="grid grid-cols-[1fr_80px] gap-2">
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Cidade</label>
                <input type="text" value={saleCidade} onChange={e => setSaleCidade(e.target.value)} placeholder="Cidade"
                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
            </div>
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">UF</label>
                <input type="text" value={saleEstado} onChange={e => setSaleEstado(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF"
                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600 text-center" />
            </div>
        </div>
        <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Complemento</label>
            <input type="text" value={saleComplemento} onChange={e => setSaleComplemento(e.target.value)} placeholder="Apt, bloco, referência..."
                className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
        </div>
    </div>
)}
```

**Observações sobre o JSX:**

- Comentário `{/* Dados do Cliente e Produção */}` foi substituído por comentários por bloco
- Labels mudaram de `text-sm` (14px) para `text-[10px]` — muito mais denso
- Inputs mudaram de `p-3` para `p-2` — economiza ~8px vertical por campo
- Espaçamentos mudaram de `space-y-3` para `space-y-2`
- Divisor entre blocos mudou de `mb-6 pb-6` (48px) para `mb-4 pb-4` (32px) — economiza 16px × 3 divisores = 48px total
- Bloco de endereço fica dentro de um `{saleDeliveryMethod !== 'RETIRADA' && (...)}` — quando é retirada, o bloco some inteiro
- Cidade/UF usam grid `[1fr_80px]` (UF fixa em 80px, cidade ocupa o resto) para caber bem em mobile
- UF força uppercase e limita a 2 caracteres no `onChange`
- Campo "Endereço de Entrega" no topo do bloco serve como label geral da seção

### - [ ] Step 4.3: Rodar typecheck

Run: `npx tsc --noEmit 2>&1 | grep "dashboard/page" | head -20`

Expected: **zero erros** em `app/dashboard/page.tsx`.

Se houver erro sobre `saleDeliveryAddress` não encontrado em algum lugar que não foi tocado, buscar com:

Run: `grep -n "saleDeliveryAddress" app/dashboard/page.tsx`

Expected: **zero linhas** (o state foi completamente removido).

### - [ ] Step 4.4: Rodar build do Next

Run: `npm run build 2>&1 | tail -30`

Expected: build termina com sucesso, `Compiled successfully`. Se houver erro de ESLint ou tipos, ler o erro e corrigir no arquivo. Erros preexistentes em outros arquivos (ex: `components/ui/label.tsx`) podem ser ignorados se não bloquearem o build.

### - [ ] Step 4.5: Teste manual no dev server

Run: `npm run dev` em um terminal separado (não bloqueante para o agente — iniciar e deixar rodando).

**Checklist de teste manual:**

1. Abrir `http://localhost:3000/dashboard`, fazer login, ir na aba de Vendas (PDV).
2. Verificar que a sidebar direita está mais compacta — labels menores, menos espaço vertical, divisores finos.
3. Preencher "Cliente" com um nome. Verificar que autocomplete ainda funciona.
4. Preencher WhatsApp e CPF — campos ainda lado a lado.
5. Preencher Descrição.
6. Mudar Método de Entrega para `RETIRADA` — o bloco de endereço deve **desaparecer**.
7. Voltar para `MOTOBOY` — o bloco de endereço deve **reaparecer**.
8. Digitar um CEP válido (ex: `01310-100` — Avenida Paulista). Esperar ~1 segundo.
9. Verificar que Endereço, Cidade e UF foram **preenchidos automaticamente** (`Avenida Paulista, Bela Vista`, `São Paulo`, `SP`).
10. Preencher Número/Quadra/Lote manualmente (qualquer valor).
11. Preencher Complemento.
12. Escolher forma de pagamento PIX, preencher Data.
13. Adicionar um produto ao carrinho OU preencher Valor Total manual.
14. Clicar "Cadastrar Venda + Produção".
15. Verificar que a venda foi criada no Firestore com `delivery_address` = `"Avenida Paulista, Bela Vista, Nº 123, Qd X, Lt Y, Apt 5 - São Paulo/SP - CEP: 01310-100"` (ou similar, dependendo do que foi preenchido).
16. Verificar que o WhatsApp abriu com o bloco `*Endereço de entrega:* _...`
17. Voltar à tela de Venda — verificar que **todos** os campos de endereço foram zerados junto com os outros.

**Se qualquer passo falhar**, parar e investigar antes de commitar.

### - [ ] Step 4.6: Commit único com todas as alterações das Tasks 1–4

```bash
git add app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
Venda: layout compactado + endereço separado com autopreenchimento CEP

Reorganiza a sidebar de Cadastrar Venda em 4 blocos densos (Cliente,
Pedido, Endereço, Pagamento) para reduzir rolagem. Substitui o
textarea único de endereço por campos separados (CEP, endereço,
número, quadra, lote, cidade, UF, complemento) com autopreenchimento
via ViaCEP — mesmo padrão da loja. Inclui endereço de entrega na
mensagem do WhatsApp quando o pedido entra em produção e o método
não é RETIRADA.

delivery_address continua sendo uma string única no Firestore,
montada por concatenação via helper buildDeliveryAddress(). Vendas
antigas não são afetadas.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verificação final

**Files:**
- Nenhum — só verificação

### - [ ] Step 5.1: Confirmar que `saleDeliveryAddress` foi completamente removido

Run: `grep -n "saleDeliveryAddress" app/dashboard/page.tsx`

Expected: **zero linhas**.

### - [ ] Step 5.2: Confirmar que o helper está sendo usado em ambos os lugares

Run: `grep -n "buildDeliveryAddress" app/dashboard/page.tsx`

Expected: **3 linhas** — 1 declaração + 2 usos (handleSaleSubmit montando objeto, e construção da mensagem WhatsApp).

### - [ ] Step 5.3: Typecheck final

Run: `npx tsc --noEmit 2>&1 | grep -v "react-label" | grep "error TS" | wc -l`

Expected: `0`

### - [ ] Step 5.4: Build final

Run: `npm run build 2>&1 | tail -15`

Expected: build compila sem erros novos.

### - [ ] Step 5.5: Status git

Run: `git status && git log --oneline -3`

Expected: árvore limpa, último commit é o das alterações da Venda.

### - [ ] Step 5.6: Pausar para decisão de merge/deploy

**NÃO** fazer merge para `main` nem push automaticamente. Avisar a usuária e perguntar:

> "Implementação concluída no worktree. Commits: X. Quer que eu faça merge em main e push para deploy, ou prefere revisar antes?"

---

## Self-Review

### Spec coverage

- ✅ Compactação em 4 blocos — Task 4
- ✅ Divisores finos `border-zinc-800` — Task 4.2
- ✅ Labels/padding reduzidos — Task 4.2
- ✅ Novos states de endereço — Task 1.1
- ✅ Helper `buildDeliveryAddress` — Task 1.2
- ✅ Autopreenchimento ViaCEP — Task 4.2
- ✅ Bloco endereço some se RETIRADA — Task 4.2 (`{saleDeliveryMethod !== 'RETIRADA' && ...}`)
- ✅ Todos campos opcionais — não há validação obrigatória em nenhum campo novo
- ✅ Concatenação no `handleSaleSubmit` — Task 2.1
- ✅ Reset pós-cadastro — Task 2.2
- ✅ Compatibilidade `delivery_address` — preservada via string única no Firestore
- ✅ Endereço na mensagem WhatsApp — Task 3.1
- ✅ Sem migração de dados antigos — Task 2.1 (só altera o momento de salvar, não toca em dados existentes)
- ✅ Responsividade mobile — mantida (não mexe em `lg:` / `order-`)
- ✅ Valor Total manual (quando carrinho vazio) — Task 4.2

### Placeholder scan

- Sem "TBD", "TODO", "fill in details"
- Sem "add error handling" vago — o `try/catch` no CEP está explícito no código
- Sem "similar to Task N" — cada task tem seu código completo
- Todos os steps têm código concreto ou comandos exatos

### Type consistency

- `buildDeliveryAddress(): string` — consistente em todos os usos
- States usam naming `sale<Campo>` e setters `setSale<Campo>` — consistente
- `saleDeliveryMethod` tipo union inalterado (`'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA'`)

### Notas

- O helper é uma **closure** sobre os states — deliberadamente não é `useCallback` porque é chamado dentro do `handleSaleSubmit` no mesmo render, simples e sem re-renders envolvidos.
- O Task 4 é intencionalmente grande (uma substituição em bloco) porque quebrar o JSX em múltiplos Edit seria mais frágil — o bloco inteiro é substituído de uma vez, e a verificação manual cobre o comportamento.
