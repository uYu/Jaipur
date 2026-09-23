# Jaipur AI technical report

This directory contains an internal technical report typeset with the supplied ICLR 2027 LaTeX template. It is not an ICLR submission.

- `jaipur_ai_report.tex`: editable report source.
- `jaipur_ai_report.pdf`: compiled five-page report.
- `iclr2027_conference.sty`, `.bst`, `fancyhdr.sty`, `natbib.sty`: copied template dependencies from `/Users/franzyu/Documents/code/Master-Template/iclr2027`.
- `data/`: complete native benchmark match logs, including every action.

Compile from this directory:

```sh
tectonic -X compile jaipur_ai_report.tex --outdir .
```

The report describes the Jaipur working tree as inspected on 2026-09-23. Native games are paired by seed with seats swapped. In each JSONL record, `winner: 0` means the `candidate` won and `winner: 1` means the `baseline` won. The `budget` field is the command's common argument; profiles with an `x<ms>` suffix override it for that side. These logs do not claim browser WebAssembly match results.

| Data file | Candidate | Baseline | Seeds | Candidate wins |
| --- | --- | --- | --- | ---: |
| `guided-vs-old-200ms.jsonl` | Current eight-tree search, 200 ms | Pinned old search, 200 ms | 2601–2610 | 20/20 |
| `guided-vs-old-1s.jsonl` | Current eight-tree search, 1 s | Pinned old search, 1 s | 2701–2703 | 6/6 |
| `trees16-vs8-200ms.jsonl` | 16 trees, 200 ms | 8 trees, 200 ms | 2801–2810 | 10/20 |
| `trees16-400-vs8-200.jsonl` | 16 trees, 400 ms | 8 trees, 200 ms | 2901–2910 | 9/20 |

The earlier 50 ms comparison and saved case studies are in [`analysis/ai-eval-2026-09-23`](../../analysis/ai-eval-2026-09-23/README.md).
