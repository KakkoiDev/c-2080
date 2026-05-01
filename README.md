# c-2080

The 20% of C that gets you 80% of results. Pareto-style reference.

Live: https://kakkoidev.github.io/c-2080/

Covers: types, pointers, arrays & decay, structs, enums & tagged unions, strings, functions, function pointers, linkage & storage, the preprocessor, variadic functions, file I/O, bit manipulation, the standard library survival kit, main/argv/signals, concurrency primer, build flags, undefined behavior, testing, CPU performance foundations, the debugger, Helix setup, and patterns (arenas, stretchy buffers, slices, handles, hash maps, errors, defer, unity build, logging, fuzz harness, optimization journey, indexes over pointers, Barker's way).

## Read in your terminal

```bash
# full document, ANSI-colored, 256-color terminal recommended
curl -L https://kakkoidev.github.io/c-2080/terminal.txt | less -R

# skim variant: TL;DRs + section headers + pattern names
curl -L https://kakkoidev.github.io/c-2080/terminal-tldr.txt | less -R
```

GitHub Pages serves these as `text/plain`. Pipe through `less -R` to keep ANSI colors while paging.

## Build

```bash
npm install
npm run build       # writes index.html, terminal.txt, terminal-tldr.txt
npm run watch       # rebuild on src/ changes
npm run serve       # local http://127.0.0.1:8765
```

Source lives in `src/index.md` (markdown) and `src/template.html` (page shell). `build.mjs` runs markdown-it with custom containers (`::: rule | warn | tip | pattern | grid | item | tldr | diagram`) and emits three artifacts:

- `index.html` for the website
- `terminal.txt` for `curl` users (full document, 256-color ANSI)
- `terminal-tldr.txt` for skimming (TL;DRs + headings + pattern names)

CI verifies all three committed artifacts match the rebuilt output.

## Attribution

Heavily informed by Nic Barker's public talks "How to write better C" and the CPU performance / kitchen-analogy talk, plus the Clay layout library (https://github.com/nicbarker/clay). All credit for those ideas is his. This repo is a curated reference, not original research.

No license. The C language and the cited talks are not mine to license.
