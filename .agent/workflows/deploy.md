---
description: Como fazer o deploy da Libera Sports no Vercel para acesso mundial
---

Para que qualquer pessoa no mundo possa acessar o sistema, siga estes passos:

1. **GitHub (Obrigatório)**:
   - Crie uma conta no [GitHub](https://github.com) se não tiver.
   - Crie um repositório chamado `libera-sports`.
   - Suba o código atual da pasta para esse repositório.

2. **Vercel (Hospedagem)**:
   - Vá para [vercel.com](https://vercel.com) e conecte sua conta do GitHub.
   - Clique em **"Add New"** -> **"Project"**.
   - Importe o repositório `libera-sports`.

3. **Configuração de Variáveis (CRÍTICO)**:
   - Durante a importação, procure a seção **"Environment Variables"**.
   - Adicione estas duas variáveis exatamente como abaixo:
     - `NEXT_PUBLIC_SUPABASE_URL`: (Copie do seu arquivo .env.local)
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Copie do seu arquivo .env.local)

4. **Deploy**:
   - Clique em **"Deploy"**.
   - Em 1-2 minutos, a Vercel gerará um link (ex: `libera-sports.vercel.app`) que você poderá enviar para qualquer pessoa.

5. **Sincronização em Tempo Real**:
   - Para que todos vejam as mudanças sem atualizar a página, vá no seu [Painel do Supabase](https://app.supabase.com).
   - Vá em **Database** -> **Replication**.
   - Ative (ON) na tabela `orders`. Isso permitirá que todos os usuários conectados vejam as atualizações instantaneamente.
