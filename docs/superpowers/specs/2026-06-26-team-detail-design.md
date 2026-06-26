# Spec — Detalhe do time (item/EV/IV/nature/Tera/moves)

**Data:** 2026-06-26
**Projeto:** PokémonChampions
**Status:** aprovado no brainstorming, aguardando revisão do spec

## Objetivo

Permitir que o usuário veja a **configuração completa** de cada Pokémon de um time
campeão (item, habilidade, nature, Tera, EVs, IVs, moves) **dentro do app**, em vez de
ser despachado para o pokepaste externo. O link externo "ver paste →" permanece como
fallback.

Fatia vertical fina (método Akita): um objetivo nomeável — "ver a config de um time
dentro do app" — atravessando as três camadas, sem inflar nem tocar o que já está verde.

## Decisões tomadas (com porquê)

1. **Lazy fetch (sob demanda), não eager no ingest.** O pokepaste de um time só é
   buscado/parseado quando o usuário abre aquele time. Endpoint novo
   `GET /api/teams/:id/detail`. *Por quê:* reversível (porta de 2 vias); lado barato de
   errar (no máximo ~300ms no 1º clique vs. ingest mais frágil/lento); a coisa mais
   simples que funciona (não busca 259 pastes que talvez ninguém abra — YAGNI). Mantém o
   ingest atual (259 times, verde) **intocado**.

2. **Contrato separado, não estender `PokemonSet`.** `DetailedPokemonSet`/`TeamDetail`
   são schemas novos. *Por quê:* o grid não precisa de EV/move; não inflar o payload de
   259 cards com dado que ninguém pediu; grid e detalhe evoluem independente; o contrato
   do grid (verde) não corre risco.

3. **Todos os campos de config opcionais/parciais.** *Por quê:* hurdle #4 — pastes reais
   omitem EV/IV/Tera. O schema tolera set parcial em vez de quebrar.

4. **Sprite sempre do nosso pipeline (PokeAPI + cache), nunca do pokepaste.** O pokepaste
   `/json` fornece apenas **texto**; nunca renderizamos imagem dele (tem muito sprite
   quebrado). O sprite é resolvido **no server**, reusando `resolveSprites` + `names.ts`
   (9 overrides) + o cache de disco já quente do ingest → normalmente cache-hit, sem rede
   nova. *Por quê resolver no server e não casar por nome no cliente:* casar paste↔card
   por nome no front é frágil (planilha e paste divergem em nomes como
   `Floette-Eternal-Mega`); o `names.ts` trata isso de forma consistente, e o modal fica
   auto-contido.

5. **UI: modal/overlay, não rota nem expandir card.** *Por quê:* sem dependência nova
   (sem react-router); reusa o padrão de status explícito do `App`; mais simples.

6. **Layout do modal: grade 2×3 de cards compactos.** Vê o time inteiro de uma vez,
   espelhando o grid de times. (Detalhe de CSS — barato de trocar depois.)

## Contrato (`packages/shared`)

Novos schemas em `domain.ts`, re-exportados por `index.ts`. O grid (`TeamsResponse`) **não
muda**.

```
DetailedPokemonSetSchema = {
  species:   string                 // nome Showdown, ex "Incineroar"
  spriteUrl: string                 // resolvido pelo nosso pipeline (PokeAPI + cache)
  item:      string | null
  ability:   string | null
  nature:    string | null
  teraType:  string | null
  evs:       Record<string, number> // {} quando o paste não traz
  ivs:       Record<string, number> // {} quando o paste não traz
  moves:     string[]               // 0–4
}

TeamDetailSchema = {
  id:        string                 // mesmo id do grid
  pokemon:   DetailedPokemonSet[]   // normalmente 6, tolera menos
}
```

## Server (`packages/server`) — functional core / imperative shell

### `domain/paste.ts` (PURO)
- Entrada: **texto cru do pokepaste** (string). Saída: `DetailedPokemonSet[]` **sem
  `spriteUrl`** (só campos do paste).
- Usa `@pkmn/sets` para parsear o formato Showdown; mapeia o resultado para o nosso
  contrato; valida na borda do parse (dado externo nunca entra cru).
- Pura: mesma string → mesma saída, sem rede. Onde mora o grosso dos testes (fixtures).
- **A API exata do `@pkmn/sets` será confirmada via context7 na fase de plano** — não
  gerar a chamada de memória (regra: documentação antes de código).

### `ingest/pokepaste.ts` (CASCA — I/O)
- Entrada: URL do pokepaste de um time. Busca o `/json`. Cliente educado: retry com
  backoff só em 5xx/rede, **nunca 404**; User-Agent descritivo.
- Passa o texto para `domain/paste.ts`. Falha de fetch/parse não derruba nada — sinaliza
  ao handler.

### `cache/detail.ts` (L1 memória + L2 disco)
- Chave = **team id**. Espelha `cache/sprites.ts` (arquivo ausente/corrompido → degrada,
  nunca quebra). *Por quê cachear:* detalhe é estável na semana; evita rebuscar a cada
  clique e é educado com o pokepaste.

### `http/app.ts` — `GET /api/teams/:id/detail` (handler fino)
- Cache hit → responde. Miss → acha o time pelo `id` (dos teams em memória, que têm
  `pokepasteUrl`) → ingest → resolve sprites (reusa `resolveSprites`/cache) → monta
  `TeamDetail` → cacheia → responde.
- Time inexistente → **404**. Paste/rede falhou → **503** com `{error}` (alinhado ao
  padrão do `GET /api/teams`).
- Injetado via `AppDeps` (novo `getTeamDetail(id)`), igual `getTeams` hoje.

## Web (`packages/web`)

- **`api/client.ts`**: `fetchTeamDetail(id)` chama o endpoint e **revalida com
  `TeamDetailSchema`** (anti-corruption layer).
- **Estado** (no `App` ou hook fino): `selectedTeamId` + status do detalhe
  (`idle|loading|error|ready`), reusando o padrão de status explícito existente.
- **`TeamCard`**: vira clicável → avisa o `App` qual id abrir. Link "ver paste →"
  permanece.
- **`TeamDetailModal`** (novo): recebe `detail`+`status`+`onClose` por props; mostra
  loading/erro(+retry)/conteúdo; fecha no Esc e no clique no backdrop.
- **`PokemonDetailCard`** (novo): um Pokémon detalhado (sprite + campos), reusa
  `PokemonSprite`. Omite campos null/vazios (nunca mostra "null").

## Degradação graciosa

- Pokepaste fora do ar → 503; modal mostra erro + "tentar de novo".
- Paste parcial → renderiza o que tem, omite o resto.
- Set malformado → `domain/paste.ts` descarta esse set, segue com os demais.
- Sprite ausente no cache → placeholder do `PokemonSprite`.

## Testes (TDD red→green)

- `domain/paste.ts` — **puro, grosso dos testes**: paste completo, sem-EV, sem-Tera,
  parcial, lixo. Sem mocks.
- `ingest/pokepaste.ts` — `FetchLike` mockado: sucesso, 404, 5xx-com-retry, rede-caiu.
- `cache/detail.ts` — hit/miss/corrompido (espelha `sprites.test.ts`).
- `http/app.ts` — `app.inject()`: 200 com detalhe, 404 inexistente, 503 ao lançar.
- `web` — `api/client` revalida; `TeamDetailModal` loading/erro/ready; abre/fecha
  (Esc + backdrop).

## Fora de escopo (YAGNI)

- Busca por Pokémon (fatia separada, futura).
- Eager fetch no ingest.
- TTL/refresh do cache de detalhe (paste estável na semana; restart basta, como sprites).
```
