# @pokemon-champions/shared

**Responsabilidade única:** ser a **fonte única da verdade** sobre o formato dos dados que
trafegam entre o `server` e o `web`. Define os schemas e os tipos de um "time" — e **nada
mais** (sem I/O, sem lógica de negócio, sem rede, sem disco).

## Por que existe (o problema que resolve)

Sem um contrato central, o `server` decidiria o formato do JSON de um jeito e o `web`
adivinharia esse formato de outro. Quando um lado mudasse, o outro só descobriria o
desencontro **em runtime, em produção**. Aqui, os dois importam o **mesmo** schema, então
qualquer divergência vira **erro de compilação na hora**.

Padrão de mercado: **contrato compartilhado / DTO** (Data Transfer Object) num *shared
kernel*.

## Por que zod-first

Em vez de declarar o tipo TypeScript **e** uma validação separada (que podem divergir),
declaramos **um** schema zod e derivamos o tipo dele:

```ts
export const TeamSchema = z.object({ id: z.string(), /* ... */ });
export type Team = z.infer<typeof TeamSchema>;  // tipo nasce do schema
```

Um único lugar gera **duas garantias**: o tipo (compile-time) e o validador (runtime).
É o princípio **DRY** aplicado à fronteira de dados. O `server` usa o schema para validar
o que sai; o `web` usa o mesmo schema para revalidar o que chega.

## Configuração

| Arquivo | Função |
|---|---|
| `package.json` | Exporta `./src/index.ts` **direto** (padrão *internal package*): quem consome transpila o TS na hora; não há etapa de build separada. |
| `tsconfig.json` | Herda o `tsconfig.base.json` (strict). |
| `vitest.config.ts` | Testes em ambiente `node`. |
| `src/domain.ts` | Os schemas + tipos. |
| `src/index.ts` | Ponto de entrada público (re-exporta `domain`). |

## Princípio de responsabilidade aplicado

Este pacote é **puro e passivo**: descreve dados, não os busca nem os transforma. Se um dia
aparecer aqui um `fetch`, uma leitura de arquivo ou regra de negócio, é sinal de que a
responsabilidade vazou — isso pertence ao `server`.
