# Roast Bot POC Roadmap

Este roadmap descreve as etapas sugeridas para evoluir o bot atual até um MVP sólido focado em segurança, consentimento e observabilidade. Cada fase é incremental e pode ser entregue isoladamente.

## P0 – Stabilize & Cleanup (30–60 min)
- Atualizar o listener de inicialização para `clientReady` e substituir `ephemeral: true` por `flags: MessageFlags.Ephemeral`.
- Adicionar um healthcheck simples do provedor LLM no boot (ex.: `GET /api/tags`) e desabilitar `/roastme` se falhar.
- Centralizar variáveis de ambiente em `src/config.ts` com defaults (modelo, temperatura, timeouts, limites).

## P1 – Consentimento & Persistência (SQLite) (1–2 h)
- Adicionar `better-sqlite3` e inicializar o banco via `src/db.ts` + `schema.sql`.
- Tabelas: `users`, `guild_settings`, `audit_log` com campos para opt-in, estilo, intensidade, modo passivo e limites.
- Implementar `/optin`, `/optout` e `/prefs set` para atualizar preferências do usuário.
- `/roastme` deve usar defaults armazenados quando opções não forem fornecidas.

## P2 – Rate Limits & Safety Switches (1 h)
- Extrair rate-limit para `src/ratelimit.ts` com token bucket por usuário e canal.
- Respeitar whitelists/blacklists de canais/usuários.
- Aplicar limites de contexto, timeout de inferência e retries controlados.

## P3 – Modo Passivo (2–3 h)
- Adicionar `passive_mode` nas configurações da guilda com comando `/settings set passive_mode <on|off>`.
- Listener `messageCreate` que responde respeitando whitelists, cooldowns e preferências do alvo.
- Construir prompt usando últimas N mensagens definidas em `context_messages`.

## P4 – Roast direcionado com consentimento (1–2 h)
- Novo comando `/roast` com opção de usuário alvo e parâmetros opcionais.
- Validar que o alvo fez opt-in antes de gerar a resposta.
- Priorizar mensagens recentes do solicitante e alvo ao montar o contexto.

## P5 – Style Packs & Prompt Templates (1–2 h)
- Definir estilos (`light`, `witty`, `spicy-safe`, `gamer`, `dev`, `nerd`).
- Criar `src/prompt.ts` com `buildSystemPrompt` e `buildUserPrompt` por estilo/intensidade.
- Permitir `/style set <nome>` para atualizar preferências.

## P6 – Admin & Operação (1–2 h)
- Comandos com permissão `MANAGE_GUILD`:
  - `/settings show`
  - `/settings set context_messages <0-15>`
  - `/settings set per_user_cooldown_ms <int>`
  - `/settings set per_channel_cooldown_ms <int>`
  - `/settings set model <string>`
  - `/settings set temperature <float>`
  - `/settings channels add #canal` / `remove #canal`
- Comando `/status` mostrando latência do Discord e RTT do LLM.

## P7 – Observabilidade & Auditoria (1–2 h)
- Logging estruturado (ex.: Pino) gravando audit trail no banco.
- Comando `/metrics` (ephemeral) listando últimos eventos e totais.
- (Opcional) Endpoint Prometheus com Fastify expondo métricas.

## P8 – Qualidade & Robustez (1–2 h)
- Timeouts de inferência via `AbortController` e limite de retries (0/1) para erros 5xx.
- Modelo de fallback (ex.: `MODEL_FALLBACK` em `.env`).

## P9 – Delivery & Docs (1 h)
- Atualizar README com setup `.env`, URL de convite e intents.
- Documentar comandos disponíveis e tabela de configurações/prefs.
- Scripts PNPM: `migrate`, `lint` e orientação para backup do DB (`./data/roast.db`).

## Backlog (Opcional)
- Fila de geração por guilda (`p-limit`).
- Curadoria de contexto priorizando mensagens do alvo/solicitante e limpando URLs/mentions.
- Filtro configurável de palavras proibidas por canal.
- Overrides por canal (modelo, temperatura, contexto) via JSON.
- Cache com TTL para configurações e invalidar ao usar `/settings set`.

## Estrutura de Pastas Sugerida
```
src/
  config.ts
  db.ts
  schema.sql
  prompt.ts
  ratelimit.ts
  llm.ts
  commands/
    register.ts
    optin.ts
    optout.ts
    prefs.ts
    roast.ts
    settings.ts
    status.ts
  listeners/
    interactions.ts
    messageCreate.ts
  index.ts
```
