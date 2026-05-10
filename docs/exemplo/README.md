# docs/exemplo — Planilhas de referência

Esta pasta contém planilhas de **exemplo** usadas para documentar a estrutura dos arquivos consumidos pelos importers do sistema.

## Política LGPD

**Apenas arquivos `*_sample.xlsx` devem ser versionados.** Eles contêm header + 1 linha fictícia (`EXEMPLO COLABORADOR`, CPF `000.000.000-00`, etc.) e servem como referência de schema.

**Não comite planilhas reais** (com nomes, CPF, matrículas verdadeiras). Use-as apenas localmente para testar o importer; após o teste, remova ou mantenha fora do tracking.

## Arquivos atuais

- `*_sample.xlsx` — versões anonimizadas, seguras para o repositório.

## Sistemas-fonte das planilhas

| Sistema | Arquivo de referência | O que contém | Importer |
|---|---|---|---|
| Tirvu | `Trabalhadores, de YYYY-MM-DD.XLS` | Cadastro de colaboradores | `/employees/import` |
| Tirvu | `Postos de Serviço.xlsx` | Postos e contratos | `/allocations/import` |
| Tirvu | `Gestao Operacional - YYYY-MM-DD a YYYY-MM-DD.xls` | Férias ATUAIS + coberturas | `/admin/vacations/import-operational` |
| Dexion | `Trabalhadores, de YYYY-MM-DD.XLS` | Folha + salários | `/admin/employees/salaries` |
| Dexion | `Relação de Previsão de Férias, em YYYY-MM-DD.XLS` | Períodos aquisitivos e direitos | (parser disponível, sem endpoint ainda) |
| Manual | `Colaboradores, para fins de validação.xlsx` | Para conferir matrícula via CPF | `/admin/employees/registration/backfill` |

## Estrutura do arquivo "Gestão Operacional" (Tirvu) — colunas

```
0: Status              1: ID (Tirvu)       2: Motivo (FÉRIAS, etc.)
3: Colaborador         4: Matrícula        5: Posto
6: Substituto          7: Matrícula sub.   8: Data Início Cobertura
9: Início Vigência    10: Fim Vigência    11: Aprov. Supervisor
12: Observações       13: CID             14: CRM
15: Nome Médico
```

Datas vêm como Excel serial number OU string `dd/MM/yyyy`. Encoding ANSI/Win1252 (acentos corrompidos nos títulos; matrícula e números OK).
