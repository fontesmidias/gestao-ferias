# Pesquisa: Modulo Proprio de Assinatura Digital

**Data:** 2026-04-14
**Objetivo:** Encontrar projeto open-source para fork e criar modulo proprio de gestao de assinaturas digitais, podendo ser standalone ou integrado ao GestaoFerias.

---

## Candidatos Analisados

### 1. DocuSeal (RECOMENDADO para fork)
- **Repo:** https://github.com/docusealco/docuseal
- **Stars:** 11.7k | **Forks:** 1k
- **Stack:** Ruby on Rails + Vue.js + Tailwind CSS
- **Licenca:** AGPLv3 (pode fazer fork, deve manter open source)
- **Docker:** Sim, one-liner: `docker run -p 3000:3000 docuseal/docuseal`
- **Banco:** SQLite/PostgreSQL/MySQL
- **API:** REST completa com SDKs (Ruby, Python, PHP, Node)
- **Ultimo update:** 13/04/2026 (v2.4.4) — muito ativo

**Por que e o melhor candidato:**
- Mais maduro e estavel (11.7k stars)
- Stack simples (Rails + Vue) — facil de entender e modificar
- Docker deploy trivial — roda com SQLite sem dependencias
- API REST completa — integrar com GestaoFerias seria via HTTP
- PDF builder WYSIWYG — admin monta templates arrastando campos
- 12 tipos de campo (assinatura, data, checkbox, upload, etc.)
- Envio automatico por email
- Verificacao de assinatura embutida
- Mobile-friendly

**Pontos de atencao:**
- Ruby on Rails (nao e Node/TS como o GestaoFerias) — fork seria um servico separado
- AGPLv3 — qualquer modificacao precisa ser open source
- Para integrar como modulo do GestaoFerias, seria via API (microservico)

---

### 2. Documenso
- **Repo:** https://github.com/documenso/documenso
- **Stars:** 12.6k | **Forks:** 2.5k
- **Stack:** TypeScript + Next.js + Prisma + Tailwind + tRPC
- **Licenca:** AGPLv3
- **Docker:** Sim, container oficial
- **Banco:** PostgreSQL (Prisma)
- **API:** tRPC (type-safe)

**Por que considerar:**
- MESMA STACK do GestaoFerias (TypeScript, Prisma, Next.js, Tailwind)
- Poderia literalmente extrair modulos e integrar diretamente
- Mais moderno e mais stars (12.6k)
- Prisma = mesma ORM = pode compartilhar schema

**Pontos de atencao:**
- Projeto MUITO grande e complexo (3.9k commits, monorepo)
- Usa React Router/Remix (nao App Router puro)
- Requer Node 22+
- Stripe integrado (billing) — precisaria remover
- AGPLv3

---

### 3. OpenSign
- **Repo:** https://github.com/OpenSignLabs/OpenSign
- **Stars:** 6.2k | **Forks:** 671
- **Stack:** Node.js + JavaScript + MongoDB
- **Licenca:** AGPLv3
- **Docker:** Sim

**Por que NAO recomendar:**
- MongoDB como banco (GestaoFerias usa PostgreSQL)
- Menor comunidade (6.2k stars)
- JavaScript puro (nao TypeScript)
- Menos maduro que DocuSeal e Documenso

---

### 4. LibreSign (Nextcloud)
- Integrado ao Nextcloud
- Nao serve como modulo standalone
- Descartado

### 5. Open eSignForms
- Java-based
- Muito antigo
- Descartado

---

## Recomendacao Final

### Opcao A: Fork do DocuSeal como microservico (MAIS PRATICO)

**Estrategia:** Fork do DocuSeal, deploy como container separado, integrar via API REST.

```
GestaoFerias (Node/TS)  →  API REST  →  DocuSeal (Ruby/Vue)
                                         ↓
                                     Container Docker separado
                                     Porta 3001 ou subdominio
```

**Vantagens:**
- Mais rapido de implementar (ja funciona out-of-the-box)
- API REST pronta — so chamar endpoints
- Nao precisa entender Ruby para usar
- Atualizacoes upstream faceis de mergear

**Desvantagens:**
- Dois servicos para manter (dois containers)
- Stack diferente do projeto principal

---

### Opcao B: Extrair modulos do Documenso (MAIS INTEGRADO)

**Estrategia:** Fork do Documenso, extrair a logica de assinatura (PDF-Lib, campos, verificacao) e integrar diretamente no GestaoFerias como modulo interno.

```
GestaoFerias (Node/TS)
  └── modules/
       └── digital-signature/   ← extraido do Documenso
            ├── pdf-builder.ts
            ├── signature-verifier.ts
            ├── field-placer.ts
            └── email-sender.ts
```

**Vantagens:**
- Mesma stack (TypeScript, Prisma, Next.js)
- Um unico deploy, um unico banco
- Controle total do codigo
- UX consistente com o resto do produto

**Desvantagens:**
- Trabalho significativo de extracao (Documenso e grande)
- Dificil acompanhar updates upstream apos extrair
- Precisa entender a arquitetura interna do Documenso

---

### Opcao C: MVP proprio inspirado nos dois (MAIS CONTROLE)

**Estrategia:** Criar modulo proprio do zero usando as bibliotecas que Documenso usa (pdf-lib, node-canvas) mas com arquitetura propria.

**Bibliotecas chave:**
- `pdf-lib` — manipulacao de PDF (criar, editar, inserir campos)
- `node-canvas` — renderizar assinaturas desenhadas
- `crypto` — hash SHA-256 para integridade
- `qrcode` — gerar QR code de verificacao

**Funcionalidades MVP:**
1. Upload de PDF template
2. Posicionar campos de assinatura (drag-and-drop no frontend)
3. Gerar link de assinatura para cada signatario
4. Signatario desenha/digita assinatura no browser
5. Inserir assinatura no PDF + hash + timestamp
6. Pagina de verificacao (QR code → confirma autenticidade)
7. Webhook quando assinado

**Vantagens:**
- Controle total, sem dependencia de fork
- Stack identica ao GestaoFerias
- Peso minimo (sem Rails, sem Remix)

**Desvantagens:**
- Mais trabalho inicial
- Precisa validar conformidade juridica (MP 2.200-2)

---

## Decisao Sugerida

**Curto prazo (agora):** Manter ZapSign como provedor (ja integrado, funciona, tem validade juridica).

**Medio prazo (1-3 meses):** Fork do DocuSeal como microservico Docker ao lado do GestaoFerias. Substituir ZapSign por DocuSeal self-hosted. Custo zero por assinatura.

**Longo prazo (6+ meses):** Se o volume justificar, extrair logica do Documenso ou criar MVP proprio com pdf-lib.

---

## Links

- DocuSeal: https://github.com/docusealco/docuseal
- Documenso: https://github.com/documenso/documenso
- OpenSign: https://github.com/OpenSignLabs/OpenSign
- DocuSeal API: https://www.docuseal.com/docs/api
- pdf-lib: https://github.com/Hopding/pdf-lib
