# Spec — Sprite do item no modal de detalhe

**Data:** 2026-06-27
**Tipo:** fatia vertical (shared + server + web) — adiciona um dado externo novo (sprite do item)
**Branch alvo:** `feat/item-sprites` (stackada após `feat/move-chips`)

## Problema / objetivo

No modal de detalhe, a linha do item de cada Pokémon é só texto (`@ {item}`). O Pedro quer o
**ícone do item** ao lado do nome. Como o front nunca fala com a PokeAPI direto (web/CLAUDE.md),
o sprite do item precisa ser **resolvido no server**, entrar no **contrato `TeamDetail`** com
cache e degradação graciosa, e só então o web renderiza.

Escopo desta fatia: **só o sprite do item**. Cor-por-tipo e hover-com-detalhes dos golpes ficam
para outra fatia (decisão do Pedro — manter a fatia fina, método Akita).

## Princípio de design

**Espelhar o pipeline de sprite de espécie que já existe** — não inventar nada novo. Cada peça
nova tem um gêmeo no projeto. A PokeAPI pública (`pokeapi.co/api/v2`, a base configurada no
`.env` local) serve `GET /item/{slug}` com a mesma forma de `/pokemon/{slug}`:

```
GET /item/assault-vest → { id, name, sprites: { default: "<url do ícone .png>" } }
```

(Confirmado contra a API em 2026-06-27 — não de memória.) `sprites.default` é o ícone do item.

## Fonte e mapeamento

- **Endpoint:** `${POKEAPI_BASE_URL}/item/{slug}` → `sprites.default` (string | null).
- **Slug:** `itemSlug("Assault Vest") = "assault-vest"` — minúsculo, runs de não-alfanuméricos →
  hífen, sem hífen nas pontas. Reusa a mesma transformação do `naiveSlug` de `domain/names.ts`
  (DRY). **Sem tabela de overrides agora** (a esmagadora maioria dos itens VGC tem slug limpo:
  Choice Specs/Band/Scarf, Leftovers, Focus Sash, Rocky Helmet, Life Orb, Sitrus Berry, Booster
  Energy, Covert Cloak, Clear Amulet, Loaded Dice, Safety Goggles… — YAGNI).
  **Borda conhecida (apóstrofo):** a slug naive diverge da PokeAPI em nomes com `'` — ex:
  "King's Rock" → naive `king-s-rock`, mas a PokeAPI usa `kings-rock`. Isso é um **miss gracioso**
  (sem ícone, só o nome) nesta fatia; vira override quando aparecer no log (mesma estratégia de
  `names.ts`, hurdle #6). Não bloqueia — itens VGC com apóstrofo são raríssimos.
- **Bom cidadão de API:** dedupe, `p-limit`, retry com backoff só em 5xx/rede, **nunca em 404**
  (404 = bug de mapeamento, logar), igual `ingest/sprites.ts`.

## Mudança de contrato (`shared`)

`DetailedPokemonSetSchema` ganha um campo:

```ts
itemSpriteUrl: z.string().nullable(),  // ícone resolvido, ou null quando item ausente/não-mapeado
```

`Team` (grid) **não muda**. A rota `GET /api/teams/:id/detail` **não muda** (já responde
`TeamDetail`; o campo novo flui pelo schema zod). O `web/api/client.ts` revalida pelo schema do
`shared`, então pega o campo novo automaticamente.

## Componentes (cada um espelha um existente)

| Peça | Espelha | Responsabilidade |
|---|---|---|
| `shared/src/domain.ts` | — | `+ itemSpriteUrl` em `DetailedPokemonSetSchema` |
| `domain/names.ts` → `itemSlug()` | `naiveSlug` (reusa) | puro: nome do item → slug. TDD |
| `ingest/items.ts` → `resolveItemSprites()` | `ingest/sprites.ts` | rede: `/item/{slug}` → `sprites.default`; p-limit, retry 5xx-não-404, zod, loga miss, **omite no miss** |
| `cache/items.ts` | `cache/sprites.ts` | L2 disco (`data/cache/items.json`); corrupt/missing → mapa vazio |
| `domain/assemble.ts` → `assembleTeamDetail` | — | recebe `itemSprites: Map<string,string>` e seta `itemSpriteUrl` |
| `ingest/detail.ts` | (já resolve species) | resolve itens junto: lê cache de itens, busca faltantes, merge, grava; passa pro assemble |
| `index.ts` | — | fia `resolveItemSprites` + cache de itens (env `ITEM_CACHE_PATH`, default `data/cache/items.json`) |
| `web/components/ItemSprite.tsx` | `PokemonSprite` | `<img>` ~20px; `onError` → não renderiza (degrada) |
| `web/components/PokemonDetailCard.tsx` | — | linha do item vira `[ItemSprite] {item}` (removo o `@`) |

## Tipos / assinaturas novas (contrato entre tarefas)

```ts
// domain/names.ts
export function itemSlug(item: string): string;

// ingest/items.ts  (mesma forma de resolveSprites, mas value = string URL)
export interface ResolveItemSpritesOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
  logger?: { warn: (msg: string) => void };
}
export function resolveItemSprites(
  items: string[],
  opts: ResolveItemSpritesOptions,
): Promise<Map<string, string>>;   // itemName -> sprite URL; misses omitidos

// cache/items.ts
export function readItemCache(path: string): Promise<Map<string, string>>;
export function writeItemCache(path: string, items: Map<string, string>): Promise<void>;

// domain/assemble.ts  (assinatura nova de assembleTeamDetail)
export function assembleTeamDetail(
  id: string,
  sets: ParsedSet[],
  sprites: Map<string, ResolvedSprite>,
  itemSprites: Map<string, string>,
): TeamDetail;
```

`ingest/detail.ts` ganha nas deps: `resolveItemSprites`, `readItemCache`, `writeItemCache`
(espelhando as três de sprite).

## Degradação graciosa (3 pontos, igual ao resto do projeto)

1. Item `null` no set → `itemSpriteUrl = null`.
2. Item não-mapeado (404 / sem `sprites.default`) → resolver **omite** → `itemSpriteUrl = null`.
3. URL presente mas a imagem falha no browser → `ItemSprite` `onError` esconde o ícone.

Em todos: o web mostra **só o nome do item** (comportamento atual). Nada derruba a resposta.

## Render no card

Linha do item: `<span class="flex items-center gap-1"><ItemSprite .../> {item}</span>`. Quando
`itemSpriteUrl` é null, renderiza só o nome (sem ícone). Removo o prefixo `@` (convenção
Showdown; com ícone fica mais limpo). Os testes existentes usam regex parcial (`/Assault Vest/`)
e seguem válidos.

## Testes (TDD no núcleo puro; comportamento no web)

- `domain/names.test.ts`: `itemSlug` — testa o contrato da função (a transformação naive), não a
  PokeAPI: "Choice Specs" → "choice-specs", "Assault Vest" → "assault-vest", trim de pontas.
  Documentar a borda do apóstrofo no teste ("King's Rock" → `king-s-rock`) como comportamento
  conhecido da slug naive (não como slug correto da API).
- `domain/assemble.test.ts`: `assembleTeamDetail` seta `itemSpriteUrl` do mapa; `null` quando
  item ausente ou fora do mapa.
- `ingest/items.test.ts`: hit (200 + `sprites.default`); 404 → omite (sem retry); 5xx → retry e
  depois omite; `sprites.default` null → omite; dedupe.
- `cache/items.test.ts`: round-trip; arquivo ausente → mapa vazio; corrupt → mapa vazio + warn.
- `ingest/detail.test.ts`: detalhe inclui `itemSpriteUrl`; itens já em cache não re-buscam.
- `web/ItemSprite.test.tsx`: renderiza `<img>` com a URL; `onError` esconde.
- `web/PokemonDetailCard.test.tsx`: mostra ícone quando há `itemSpriteUrl`; só o nome quando
  null. (Atualizar o factory `makeDetailedPokemon` com `itemSpriteUrl`.)

## Verificação

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes.
- **Browser:** abrir o modal — ícones dos itens ao lado do nome; item raro/sem-sprite mostra só
  o nome (sem ícone quebrado); cold vs cached coerente (cache de itens grava em `items.json`).

## Plano de entrega (fatia vertical, de dentro pra fora)

Ordem sugerida (núcleo puro → casca → web), commits granulares:
1. `shared`: `+ itemSpriteUrl`.
2. `domain/names`: `itemSlug` (TDD).
3. `domain/assemble`: `assembleTeamDetail` recebe `itemSprites` (TDD).
4. `ingest/items`: `resolveItemSprites` (TDD).
5. `cache/items`: read/write (TDD).
6. `ingest/detail`: resolve itens junto (TDD nas deps).
7. `index.ts`: wiring (typecheck/build; sobe a feature ponta-a-ponta).
8. `web`: `ItemSprite` + `PokemonDetailCard` + factory (TDD).
