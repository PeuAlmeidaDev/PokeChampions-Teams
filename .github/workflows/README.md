# .github/workflows/

Automação de **Integração Contínua (CI)** que roda no GitHub a cada `push` e
`pull_request`.

## `ci.yml`

Roda, em sequência, exatamente os mesmos comandos que você roda local — numa máquina limpa
(Ubuntu) para garantir que "funciona na minha máquina" vire "funciona em qualquer máquina":

```
pnpm install --frozen-lockfile   # instala travado no lockfile (build reproduzível)
pnpm lint                        # estilo/erros estáticos
pnpm typecheck                   # checagem de tipos
pnpm test                        # testes
pnpm build                       # build de produção
```

## Por que CI existe (first principle)

**Verificar tem que ser barato.** Com a IA gerando muito código rápido, o teste/checagem é
a rede que pega quando algo quebra. A CI tira de você a tarefa de "lembrar de conferir": a
máquina confere sozinha em todo commit e te avisa. Princípio do Método Akita: **todo commit
é candidato a produção — CI verde sempre.**

> Observação: a CI só executa de fato quando o repositório tiver um **remote no GitHub** e
> receber um `push`. Localmente, `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
> reproduz o mesmo gate.
