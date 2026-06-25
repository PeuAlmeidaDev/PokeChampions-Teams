# Spec — Ingest real (planilha + sprites)

- **Data:** 2026-06-25
- **Projeto:** PokémonChampions
- **Fatia:** mata o seam `sample.ts` e pluga o ingest real (rede), entregando times
  reais com sprites reais ponta-a-ponta.
- **Pré-requisito:** o esqueleto que anda está concluído
  (`sheet CSV de exemplo → parse → assemble → GET /api/teams → fetchTeams → React`).

## Objetivo

Trocar a fonte de dados de exemplo (`sampleTeams()`) pelo cano real, alimentando o
contrato `Team`/`PokemonSet` **já existente** em `@pokemon-champions/shared` com dados
vivos da planilha de campeões + sprites da PokeAPI. Sem mudar o contrato.

## Escopo (decisões tomadas no brainstorming)

### Dentro

- Buscar a planilha CSV (segue redirect 307).
- Parsear colunas por **cabeçalho** (nunca letra fixa): `id`, `name`, `ownerName`,
  `ownerHandle`, `tournament`, `rank`, `pokepasteUrl` e **as 6 espécies** (colunas 37–42 no
  layout atual, mas achadas por nome de cabeçalho).
- Resolver sprite + dexId de cada espécie **única** via PokeAPI.
- Montar `Team[]` reais e servir em `GET /api/teams`.
- Cache **L1 memória** (segura `Team[]` após o 1º ingest) + **L2 disco só para o mapa
  `species → {spriteUrl, dexId}`** (caro de resolver e estável).
- Ingest **lazy + single-flight**: o 1º request dispara; promise memoizada deduplica
  concorrentes; resultado fica em memória.

### Fora (YAGNI — adiado, com porquê)

- **Pokepaste + `@pkmn/sets`:** o contrato atual (`species/spriteUrl/dexId`) não tem campo
  para item/EV/IV/nature/Tera/moves. Buscar ~200 pokepastes é o multiplicador de rede mais
  caro e arriscado, e não serve nenhum requisito de hoje. Volta na **fatia de detalhe do
  time**, junto com a extensão do contrato em `shared`.
- **TTL + `POST /api/refresh` + stale-while-revalidate:** a planilha muda semanalmente;
  reiniciar o processo já pega dado novo. Re-ingest = restart, por enquanto.
- Mudar o contrato `shared`. Esta fatia preenche o contrato existente.

## Arquitetura (functional core / imperative shell)

Direção de dependência: **casca → núcleo, nunca o contrário**. `domain/` é puro (sem rede,
disco, relógio, `process.env`).

### Núcleo puro (`packages/server/src/domain/`)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `csv.ts` | estender | `RawTeam` cresce: `+ ownerName, ownerHandle, tournament, rank` e as 6 espécies. Colunas achadas por cabeçalho. |
| `names.ts` | novo | Nome Showdown → slug PokeAPI: normalização naive + 9 overrides conhecidos + `Floette-Eternal-Mega → floette-mega` + fallback de segmentos. |
| `assemble.ts` | estender | Recebe `RawTeam[]` + mapa `species → {spriteUrl, dexId}` → monta `Team[]` reais. Continua puro. |

### Casca — I/O

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `ingest/sheet.ts` | novo | Busca o CSV (segue 307, User-Agent descritivo, valida texto não-vazio). |
| `ingest/sprites.ts` | novo | Dado o conjunto de espécies únicas, resolve cada slug na PokeAPI (zod na resposta), `p-limit`, retry backoff **só 5xx/rede, nunca 404**. 404/falha → placeholder + log. |
| `ingest/orchestrator.ts` | novo | Maestro: sheet → parse → coletar espécies únicas → resolver sprites (com cache disco) → assemble → `Team[]`. Single-flight + hold em memória + carimba `fetchedAt`. |
| `cache/sprites.ts` | novo | L2 disco: lê/grava o mapa `species → {spriteUrl, dexId}` em `data/cache/sprites.json`. |

### Borda HTTP / ambiente

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `http/app.ts` | mudar | `buildApp({ getTeams })` recebe o ingest por **injeção de dependência**; handler fino chama `getTeams()` e traduz erro → **503**. |
| `index.ts` | mudar | Lê env (`SHEET_CSV_URL`, `POKEAPI_BASE_URL` **pinada**, dir de cache) — única borda de ambiente — e injeta o orchestrator real no `buildApp`. |
| `sample.ts` + `sample.test.ts` | deletar | O seam morre, como planejado. |

**Dep nova:** `p-limit`. `fetch` é global no Node 20+.

## Fluxo de dados (1º request, lazy)

```
GET /api/teams
  └─ orchestrator.getTeams()   [single-flight: ingest em voo → anexa nessa promise]
       ├─ ingest/sheet   → CSV string (307 seguido, valida texto)
       ├─ domain/csv     → RawTeam[] (id, name, owner, tournament, rank, pokepasteUrl, 6 espécies)
       ├─ coletar Set de espécies únicas de todos os times
       ├─ cache/sprites (disco) → quais slugs já conheço
       ├─ ingest/sprites → resolve só os faltantes (p-limit, retry 5xx) → grava no disco
       ├─ domain/assemble(RawTeam[], mapa) → Team[]
       └─ segura Team[] em memória + carimba fetchedAt (relógio na borda)
  └─ 200 { fetchedAt, teams }   [requests seguintes: servidos da memória]
```

## Tratamento de falha (dois níveis)

1. **Fonte-raiz (sheet inacessível/vazia):** sem planilha não há o que degradar. O
   orchestrator **propaga o erro**, a promise single-flight é **limpa** (não memoiza
   fracasso), a rota responde **503**, o **próximo** request tenta de novo
   (auto-recuperação). `/api/health` segue de pé.
2. **Item (uma espécie):** **degradação graciosa**. 404 após os fallbacks de nome, 5xx
   após os retries, **ou resposta 200 com `front_default: null`** (a PokeAPI conhece o
   Pokémon mas não tem sprite) → `spriteUrl` = placeholder, `dexId` = `null`, **logado**,
   ingest **segue**. Um sprite ruim nunca derruba o time nem a resposta. (O contrato exige
   `spriteUrl: string`; o placeholder é o que satisfaz isso quando a fonte falha.)

**Canário de integridade:** após o parse, contagem de times abaixo do esperado
(esperado ~**200**; warning se vier abaixo de um limiar próximo disso, ex.: < 150,
configurável) → **warning** logado ("layout do CSV pode ter mudado" — risco #3),
**não falha**. É sinal, não trava.

**Validação na borda (zod):**
- Resposta da PokeAPI → schema zod (`{ id: number, sprites: { front_default: string|null } }`)
  antes de entrar no domínio.
- CSV → presença das colunas-chave por cabeçalho + o canário fazem o papel de guarda.

## Estratégia de teste (TDD)

Princípio: **stub na fronteira da rede, não no nosso código** (padrão do commit
`stub the network, not our client`). Funções de `ingest/` recebem um `fetch`-shaped por
parâmetro (default `globalThis.fetch`); o teste injeta um stub.

### Núcleo puro — fixtures, zero mock

| Alvo | Casos |
|---|---|
| `domain/csv` | colunas embaralhadas (acha por cabeçalho); linha parcial; extrai 6 espécies + owner/tournament/rank. |
| `domain/names` | os 9 overrides; `Floette-Eternal-Mega → floette-mega`; normalização naive; fallback de segmentos; nome desconhecido → slug best-effort. |
| `domain/assemble` | `RawTeam[]` + mapa → `Team[]`; espécie ausente no mapa → placeholder + `dexId null`. |

### Casca — stub do `fetch` injetado

| Alvo | Casos |
|---|---|
| `ingest/sheet` | 307 seguido; 200 com CSV; não-OK → erro; corpo vazio → erro. |
| `ingest/sprites` | 200 → `{spriteUrl,dexId}` (zod); **404 → placeholder, sem retry** (logado); 5xx → retry backoff → placeholder; **dedupe** (espécie 2x = 1 fetch); `p-limit` respeitado. |
| `cache/sprites` | roundtrip grava/lê; arquivo ausente → mapa vazio; mescla novos com cacheados. |
| `ingest/orchestrator` | fluxo ponta-a-ponta com stubs; **single-flight** (2 chamadas concorrentes = 1 ingest); cache disco hit pula PokeAPI; falha da sheet propaga + limpa memo. |

### HTTP

`app.test.ts` injeta `getTeams` stub → testa **200 (shape)** e **503 (ingest lança)** sem
tocar a rede. `index.ts` injeta o orchestrator real.

## Definition of done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes (rodados agora).
- `pnpm dev` servindo **times reais com sprites reais** em `localhost:5173`.
- `sample.ts` + teste removidos; nenhuma referência remanescente.
- `process.env` lido só em `index.ts`.

## Riscos herdados (do CLAUDE.md — não repetir)

1. **PokeAPI não-padrão** (serve fan-megas): **pinar base URL em config**.
2. **`Floette-Eternal-Mega` sem sprite** → fallback `floette-mega`.
3. **Layout do CSV frágil**: achar colunas por cabeçalho; canário de contagem.
4. **Bom cidadão de API**: 307, `p-limit`, retry só 5xx/rede nunca 404, dedupe, cache
   disco, User-Agent descritivo.
5. **Mapeamento Showdown→PokeAPI**: 9 overrides + normalização + fallback de segmentos.
6. **Degradação graciosa**: dado externo ruim nunca derruba o ingest nem a resposta.
