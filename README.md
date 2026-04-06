<div align="center">
  <img src="docs/assets/cover.png" alt="Gestão de Férias Banner" width="800">
  <h1>🌴 Gestão de Férias - Multi-tenant BMM</h1>
  <p>Uma solução empresarial de alta performance para gerenciamento de ciclos de férias, integrada ao framework BMM.</p>

  [![Status](https://img.shields.io/badge/Status-Project%20Ready-success?style=for-the-badge)]()
  [![Docker](https://img.shields.io/badge/Docker-Ready-0db7ed?logo=docker&logoColor=white&style=for-the-badge)]()
  [![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&style=for-the-badge)]()
  [![Stack](https://img.shields.io/badge/Portainer-Stack-blue?logo=portainer&style=for-the-badge)]()
</div>

---

## 🔍 Visão Geral

Este projeto é uma plataforma robusta de **Gestão de Férias**, desenvolvida sobre o framework **BMM**. Ele oferece uma arquitetura multi-tenant escalável, permitindo que diferentes empresas ou departamentos gerenciem seus cronogramas de descanso de forma isolada e segura.

## 🏗️ Matriz de Deploy (Tríplice Flexibilidade)

Este repositório foi projetado para rodar em qualquer lugar. Escolha sua estratégia:

| Cenário | Arquivo Manifesto | Proxy / SSL | Build | Quando Usar |
| :--- | :--- | :--- | :--- | :--- |
| **🏠 Local** | `docker-compose.yml` | `http://localhost` | On-the-fly | Desktop do dev e testes rápidos |
| **🚀 Solo VPS** | `docker-compose.prod.yml` | Nginx Externo (Host) | Imagem Docker | VPS simples (Single Node) sem Swarm |
| **🐝 Swarm Hub** | `docker-stack.yml` | Traefik (Overlay) | Imagem Docker | Produção Escalonada / Portainer |

---

## 🚀 Guia de Configuração Rápida

### 1. Preparando o Ambiente
Antes de tudo, crie seu arquivo `.env`:
```bash
cp .env.example .env
```
Edite as variáveis conforme as instruções internas do arquivo.

### 2. Rodando Localmente
```bash
docker-compose up --build
```
- API: [http://localhost:3000](http://localhost:3000)
- Web: [http://localhost:3002](http://localhost:3002)

### 3. Deploy em VPS Solo (Nginx Externo)
1. Certifique-se de que o Nginx no seu host está rodando.
2. Suba o ambiente: `docker-compose -f docker-compose.prod.yml up -d`.
3. Configure seu bloco `server` do Nginx para apontar:
   - **API:** `proxy_pass http://localhost:8080/`
   - **Web:** `proxy_pass http://localhost:3001/`

### 4. Deploy em VPS Swarm (Portainer / Traefik)
1. No Portainer, crie uma **Stack** usando o [`docker-stack.yml`](./docker-stack.yml).
2. Configure as **Environment Variables** no formulário do Portainer.
3. Garanta que a rede `traefik_public` exista no Swarm.

---

## ✨ Funcionalidades em Destaque

- **💼 Gestão Multi-tenant:** Controle isolado por empresa.
- **🛡️ Segurança Máxima:** Validação rígida de variáveis críticas em produção (`:?`).
- **📧 Fluxo de Signatures:** Assinatura eletrônica de avisos integrada.
- **📊 Relatórios Financeiros:** Simulação de proventos e encargos.

---

## 📂 Estrutura do Repositório

```text
├── backend-api/      # Código fonte do Servidor (Node.js)
├── frontend-web/     # Interface WEB (Next.js)
├── docs/             # Documentação e Assets
├── docker-stack.yml  # Configuração Swarm (Traefik)
├── docker-compose.prod.yml # Configuração VPS Solo (Nginx)
├── docker-compose.yml # Configuração Local (Dev)
└── .env.example      # Mapa de variáveis
```

## 🛡️ Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais detalhes.

---

<div align="center">
  <p>Desenvolvido com ❤️ pela equipe Fontes Mídias</p>
</div>
