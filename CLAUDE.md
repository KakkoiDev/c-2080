# c-2080

Pareto reference: 20% of C for 80% of results. Static site, single-page, Nic Barker-informed.

## Build commands
- `npm run build` writes `index.html` from `src/index.md` + `src/template.html`
- `npm run watch` rebuilds on src/ changes
- `npm run serve` serves at http://127.0.0.1:8765
- CI verifies committed `index.html` matches `src/index.md` output. ALWAYS run `npm run build` after editing `src/index.md` and commit both files together.

## Source layout
- `src/index.md` - all content
- `src/template.html` - page shell
- `build.mjs` - markdown-it pipeline with custom containers
- `index.html` - generated, committed
- `.github/` - CI that diffs rebuilt output against committed `index.html`

## Conventions (strict)
- No emojis anywhere in output or files
- No em dashes (the long Unicode dash U+2014). Use regular hyphens, periods, or restructure the sentence
- Every section has a `::: tldr` block at the top
- Every section ends with a `### Practice` block
- Custom markdown-it containers: `tldr`, `rule`, `warn`, `tip`, `pattern`, `grid`, `item`
- Section anchor pattern: `## NN Title {#slug data-toc="..."}`
- Code fences use language tags (`c`, `bash`, `yaml`, `toml`, `cmake`)

## CRITICAL invariant: roadmap stays in sync with section numbers
Section 00 (Study Roadmap) lists Day 1 / Week 1 / Month 1 sections by NUMBER.
If you reorder sections, the roadmap numbers MUST be updated. Same for any cross-references in the body.

After ANY reorder or section addition/removal:
1. Run `grep -nE "^## " src/index.md` to enumerate current section numbers
2. Update Section 00 Day 1 / Week 1 lists accordingly
3. Search for stale references: `grep -nE "section [0-9]+|^- [0-9]+ " src/index.md`
4. Run `npm run build` and commit both `src/index.md` and `index.html`

### Current section map (verify with grep before editing)
```
00 Study Roadmap
01 Build System Minimum
02 Building & Safety
03 C in Helix Editor
04 Debugger Tips
05 Types & the Memory Model
06 Pointers (demystified)
07 Visual Memory Models
08 Arrays & Decay
09 Strings
10 Structs & Composition
11 Enums & Tagged Unions
12 Memory Management
13 Error Handling Idioms
14 Functions & Headers
15 Function Pointers
16 Linkage & Storage
17 The Preprocessor & #define
18 Variadic Functions
19 File I/O
20 Bit Manipulation
21 Standard Library Survival Kit
22 main / argv / signals
23 Concurrency Primer
24 Testing
25 Common Rookie Traps
26 Undefined Behavior Catalog
27 CPU Performance Foundations
*  Patterns (between 27 and 28)
28 Drills
29 Glossary
+  Quick Reference
```

## Project ladder (referenced from Section 00)
1. echo clone - argv, exit codes, no allocations
2. wc clone - file I/O, loops, edge cases
3. Hash table (open addressing) - malloc/free, structs, hashing, resizing
4. Arena allocator - pointer arithmetic, alignment, lifetimes
5. Tiny shell (fork + exec + pipe) - syscalls, signals, processes

Course intentionally stops at 5. Natural follow-ups (NOT in scope here):
- Interpreter: Crafting Interpreters Part III (clox)
- Networking: Beej's Guide to Network Programming

## Scope and non-goals
- IS: Pareto reference for self-study, Helix-friendly, sanitizer-first
- IS NOT: a complete C tour, embedded-specific guide, MISRA/CERT enforcement
- Tooling covered: gcc/clang flags, ASan/UBSan/TSan, valgrind, fuzzers, clangd, gdb/lldb
- Tooling NOT covered: clang-tidy, cppcheck, scan-build (potential future addition)

## Attribution
- Heavily informed by Nic Barker's "How to write better C" plus CPU performance talks
- Clay layout library (https://github.com/nicbarker/clay)
- No license. Not original research.

## When editing
- Prefer Edit tool over Write for `src/index.md` (file is large)
- After editing, ALWAYS rebuild: `npm run build`
- Stage both `src/index.md` and `index.html` together
- Atomic commits per global CLAUDE.md rules
