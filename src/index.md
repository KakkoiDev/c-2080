## 00 Study Roadmap {#roadmap data-toc="Study Roadmap"}

::: tldr
don't read this guide front-to-back. Pick a path below, write code as you go, and treat the rest as reference.
:::

### Time-boxed paths

**Day 1 (3-4 hours).** Read these only:

- 01 Types & Memory Model
- 02 Pointers
- 03 Arrays & Decay
- 06 Strings
- 27 Build System Minimum

Then write a `wc` clone (counts lines, words, bytes from a file). That's enough to start writing C.

**Week 1.** Day 1 plus:

- 04 Structs & Composition
- 05 Enums & Tagged Unions
- 07 Functions & Headers
- 17 Building & Safety (focus on the compile flags)
- 23 Memory Management
- 24 Error Handling Idioms
- 26 Common Rookie Traps

Build: a hash table (open addressing) and a tiny JSON parser.

**Month 1.** Week 1 plus everything else, plus:

- 28 Drills (do at least 5 per major topic)
- The full project ladder below

### Project ladder

Five projects, each forces a different muscle. Build them in order. If you finish all five with sanitizers clean, you know enough C to ship real software.

| # | Project | Forces |
|---|---------|--------|
| 1 | `echo` clone | argv, exit codes, no allocations |
| 2 | `wc` clone | file I/O, loops, edge cases (empty file, no trailing newline) |
| 3 | Hash table (open addressing) | malloc/free, structs, hashing, resizing |
| 4 | Arena allocator | pointer arithmetic, alignment, lifetimes |
| 5 | Tiny shell (fork + exec + pipe) | syscalls, signals, processes |

::: tip
Build every project under `-fsanitize=address,undefined`. If the sanitizers complain, fix it before moving on. Most C bugs hide for years; the sanitizers find them in seconds.
:::

::: rule
Read fast, write slow. Spend more time at the keyboard than at the page. C is a muscle skill: typing `malloc`/`free`/`memcpy` until they're automatic is the actual point.
:::

---

## 01 Build System Minimum {#build-min data-toc="Build System Minimum"}

::: tldr
copy these files, edit the SRCS line, you're shipping.
:::

### Just `cc` (one file, dev workflow)

For a single .c file you don't need any build system at all:

```bash
cc -std=c99 -Wall -Wextra -g -O0 \
   -fsanitize=address,undefined \
   main.c -o main
./main
```

Wrap that in a `run.sh`. You can build a real project with this for a long time.

### Minimum Makefile

```makefile
CC      := cc
CFLAGS  := -std=c99 -Wall -Wextra -Wpedantic -g
LDFLAGS :=
SRCS    := main.c parser.c table.c
OBJS    := $(SRCS:.c=.o)
BIN     := myprog

.PHONY: all clean run dev

all: $(BIN)

$(BIN): $(OBJS)
	$(CC) $(CFLAGS) $(OBJS) -o $@ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

dev: CFLAGS  += -O0 -fsanitize=address,undefined
dev: LDFLAGS += -fsanitize=address,undefined
dev: $(BIN)

clean:
	rm -f $(OBJS) $(BIN)

run: all
	./$(BIN)
```

`make` for release. `make dev` for sanitizers. `make clean` to reset.

### Minimum CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.16)
project(myprog C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)   # enables clangd / Helix LSP

add_compile_options(-Wall -Wextra -Wpedantic)

add_executable(myprog
    src/main.c
    src/parser.c
    src/table.c
)

option(DEV "developer build" OFF)
if (DEV)
    target_compile_options(myprog PRIVATE -O0 -g -fsanitize=address,undefined)
    target_link_options   (myprog PRIVATE     -fsanitize=address,undefined)
endif()
```

```bash
cmake -B build -DDEV=ON
cmake --build build
./build/myprog
```

::: tip
`compile_commands.json` is what every modern C tool reads (clangd, Helix, IDEs). CMake generates one with `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`; for Make, run `bear -- make`. Without it, your editor cannot find symbols.
:::

### Practice

Drop the Makefile from this section into a 3-file project (`main.c`, `parser.c`, `table.c` - they can be empty stubs). Run `make`, `make dev`, `make clean` in sequence. Verify `make dev` produced a binary linked against ASan: `ldd ./myprog | grep asan` should show a libasan entry.

---

## 02 Building & Safety {#building}

::: tldr
Pick C99. Turn on `-Wall -Wextra -Werror -fsanitize=address,undefined` for dev. Two build modes: dev (max safety, slow, readable) and release (fast, hardened with `-D_FORTIFY_SOURCE=2`).
:::

The C standard, the compiler, and the sanitizers form your safety net. This section is what every C project's build script should look like.

### C99: the version to pick

C89 is widely supported but cumbersome. C99 fixes the main pain points and is supported by every modern compiler. C11/17/23 are fine, but C99 has the broadest reach and covers the 80%.

- **Designated initializers** `.field = v` - the killer feature.
- **Mixed declarations and statements**: declare where used, including `for (int i = 0; ...)`.
- **Fixed-width types** via `<stdint.h>`: `int32_t`, `uint64_t`. Plain `int` is at least 16 bits per spec; `long` is 32-bit on Windows, 64-bit on Linux.
- **`<stdbool.h>`**: `bool`, `true`, `false`.
- **`//` line comments**.
- **Compound literals**: `foo((Vec2){1, 2})` - struct literals as arguments.

::: rule
C89: variables must be declared at the top of a function, loop counters leak, struct init is positional (you can swap two same-typed fields by mistake). C99 fixes all of this.
:::

### Always-on warning flags

```c
-Wall -Wextra -Wshadow -Wconversion -Wformat=2 -Wnull-dereference
```

Add `-Werror` to make warnings stop the build. Switch it on from day one - it's much harder to clean up later. `-Wpedantic` is useful when you want maximum portability, but it flags widely-used compiler extensions (like `_Alignof` in C99 mode) - add it when you specifically need ISO conformance.

### Sanitizers

```bash
# AddressSanitizer (heap/stack overflow, use-after-free, double-free, leaks)
-fsanitize=address -fno-omit-frame-pointer
# env: ASAN_OPTIONS=detect_leaks=1

# UndefinedBehaviorSanitizer (signed overflow, null deref, alignment, OOB shifts)
-fsanitize=undefined

# Combined
-fsanitize=address,undefined
```

::: tip
Run with ASan basically all the time during local dev. Without it, a one-byte overrun into the slack space of a malloc block silently corrupts memory and surfaces as a "visual glitch" six minutes later. ASan catches the bug at the line where it happens.
:::

### Release hardening

```bash
-fstack-protector-strong       # canaries against stack smashes
-D_FORTIFY_SOURCE=2            # bounds-checked libc (needs -O1+)
```

### Two build modes

```bash
# dev: max safety, slow, readable crashes
clang -std=c99 -g -O0 -Wall -Wextra -Wpedantic -Werror \
      -fsanitize=address,undefined -fno-omit-frame-pointer \
      main.c -o app

# release: fast, hardened
clang -std=c99 -O2 -DNDEBUG -Wall -Wextra \
      -fstack-protector-strong -D_FORTIFY_SOURCE=2 \
      main.c -o app
```

### What is a segfault, really

The OS gives your process a virtual address space. `malloc` maps regions into it. A read or write outside any mapped region traps as `SIGSEGV`. `NULL` is `0`, which is unmapped, hence the classic null-deref segfault. ASan catches the bug *before* it ever becomes a segfault by instrumenting every load and store.

::: warn
A segfault is a *lucky* outcome. The unlucky version is silent corruption: your bad write lands inside a different valid allocation and the program keeps running with garbage data until something visible breaks much later.
:::

### Practice

Write a 10-line program that writes one byte past the end of a 4-byte stack array. Compile and run without sanitizers - probably no error. Recompile with `-fsanitize=address` and run - ASan prints the exact line and reports a stack-buffer-overflow.

---

## 03 C in Helix Editor {#helix data-toc="Helix Setup"}

::: tldr
Helix has built-in LSP and DAP. Install `clangd` plus `lldb-dap`, drop a `.clangd` and `compile_commands.json` in the repo, wire the debugger in `~/.config/helix/languages.toml`. `hx --health c` confirms the toolchain.
:::

Helix is a modal terminal editor with built-in LSP and DAP support. C works out of the box once you install `clangd`.

### Install

```bash
# macOS
brew install llvm bear helix

# Debian / Ubuntu
sudo apt install clang clangd clang-format lldb bear gdb
# helix from https://helix-editor.com/
# lldb ships the DAP binary as lldb-dap-NN. Symlink it so Helix finds it:
sudo ln -sf "$(ls /usr/bin/lldb-dap-* | sort -V | tail -1)" /usr/local/bin/lldb-dap

# Arch
sudo pacman -S clang lldb bear gdb helix

# Verify
hx --health c            # clangd should show "Found"
```

### Project file: `./.clangd`

Save this in your repo root.

```yaml
CompileFlags:
  Add: [-std=c99, -Wall, -Wextra, -Wpedantic]
Diagnostics:
  UnusedIncludes: Strict
```

### Project file: `./compile_commands.json`

clangd reads this for accurate cross-file analysis. Generate it with one of:

```bash
# with a Makefile: bear records each clang invocation
bear -- make

# single-file project: write the file directly via heredoc
cat > compile_commands.json <<EOF
[
  {
    "directory": "$(pwd)",
    "command": "clang -std=c99 -Wall main.c",
    "file": "main.c"
  }
]
EOF
```

### Project file: `./.clang-format`

Save this in your repo root. `clang-format` picks it up automatically.

```yaml
BasedOnStyle: LLVM
IndentWidth: 4
ColumnLimit: 100
AlignConsecutiveDeclarations: true
```

### User config: `~/.config/helix/languages.toml`

Add this single `[[language]]` entry. Wires up format-on-save and DAP debugging in one block. Create the file if it doesn't exist (`mkdir -p ~/.config/helix` first).

```toml
[[language]]
name = "c"
auto-format = true
formatter = { command = "clang-format" }
debugger = { name = "lldb-dap", transport = "stdio", command = "lldb-dap" }
[[language.debugger.templates]]
name = "binary"
request = "launch"
completion = [ { name = "binary", completion = "filename" } ]
args = { program = "{0}" }
```

In Helix: `:debug-start binary ./app`, then `Space + g` for the debug menu. Build with `-g -O0`.

### Useful keybinds for C

| Key | Action |
|---|---|
| `gd` | goto definition |
| `gr` | goto references |
| `Space r` | rename symbol |
| `Space a` | code actions |
| `Space d` | diagnostics list |
| `Space s` | symbol picker |
| `K` | hover (type info) |

Tree-sitter highlighting ships built-in. Run `hx --grammar fetch && hx --grammar build` once if highlights look off.

::: tip
clangd plus ASan plus a TUI debugger gives you most of what CLion provides, in 30 MB of tooling. No license, no IDE startup time.
:::

---

## 04 Debugger Tips {#debugger}

::: tldr
gdb and lldb cover 90% of C debugging with the same dozen commands: `b`, `r`, `n`, `s`, `c`, `bt`, `p`, `info locals`, `watch`, `q`. Build with `-g -O0` for clean info.
:::

You absolutely need a debugger to be productive in C. Print debugging will not scale. The good news: gdb and lldb are 90% the same and you only need a dozen commands.

::: rule
Compile with `-g -O0` for clean debug info. Optimization mangles line numbers and elides locals - the debugger will refuse to show variables that the optimizer "doesn't believe" exist.
:::

### gdb cheat sheet

```bash
gdb ./app
b main                       # breakpoint at function
b file.c:42                  # breakpoint at line
b parse_int if x > 100         # conditional
r arg1 arg2                  # run with args
n / s                        # next / step in
c                            # continue
finish                       # step out of current frame
bt / bt full                 # backtrace (with locals)
p var / p *ptr / p/x val     # print value (decimal/hex)
info locals                  # all locals in current frame
watch ptr->field             # break when value changes
rwatch / awatch              # break on read / read-or-write
display var                  # show every step
layout src                   # TUI source view (or: gdb -tui)
set print pretty on            # readable struct dumps
q                            # quit
```

### lldb equivalents

| gdb | lldb |
|---|---|
| `b main` | `b main` |
| `n` / `s` | `n` / `s` |
| `p var` | `p var` or `fr v` |
| `bt` | `bt` |
| `info locals` | `fr v` |
| `watch x` | `w s v x` |

### Core dumps (post-mortem)

```bash
ulimit -c unlimited
./app                    # crashes -> ./core file
gdb ./app core           # load post-mortem

# on systemd-based Linux
coredumpctl gdb          # picks up the latest crash
```

### Optional `~/.gdbinit`

```bash
set print pretty on
set print array on
set pagination off
set history save on
```

### When ASan isn't available: valgrind

```bash
valgrind --leak-check=full --show-leak-kinds=all ./app
```

Slower than ASan, but works without recompiling and sometimes finds different bugs.

### Time-travel debugging: rr (Linux)

```bash
rr record ./app
rr replay                # reverse-step through any bug
```

### Standalone GUI debuggers

- **RemedyBG** (paid, Windows/Linux) - built for game-dev iteration speed.
- **RAD Debugger** (free, in development) - from the Handmade community.
- Both wrap the same DWARF info gdb/lldb use, just with a faster UI.

::: warn
Never debug optimized binaries unless forced to. `-O0 -g` first; switch to `-O2 -g` only if the bug only reproduces under optimization.
:::

### Practice

Write a program that segfaults via NULL deref. Run under `gdb ./prog`. When it crashes: `bt` (see the call stack), `p ptr` (confirm NULL), `frame N` to the caller, `p` the variable that should have been set. Fix the bug and re-run.

---

## 05 Types & the Memory Model {#types data-toc="Types & Memory Model"}

::: tldr
C has no runtime. Every variable lives on the stack (auto-freed) or the heap (manual). Use `<stdint.h>` fixed-width types and never plain `int`/`long`.
:::

C has no runtime. Every variable is either on the **stack** (automatic, freed when function returns) or the **heap** (manual, lives until you free it). This is everything.

### The types you'll actually use

```c
#include <stdint.h>   // fixed-width types - use these always
#include <stddef.h>   // size_t, NULL, ptrdiff_t
#include <stdbool.h>  // bool, true, false

int8_t   a;   // signed  8-bit  (-128..127)
uint8_t  b;   // unsigned 8-bit  (0..255)  - byte
int32_t  c;   // signed 32-bit  - default int choice
int64_t  d;   // signed 64-bit
uint64_t e;   // unsigned 64-bit
size_t   n;   // for sizes and counts (pointer-sized)
float    f;   // 32-bit float
double   g;   // 64-bit float
bool     ok;  // true / false
```

::: rule
Avoid plain `int`, `long`, `short` - their sizes are platform-defined. Use `int32_t`, `int64_t`, etc. for anything you care about.
:::

### Stack vs Heap at a glance

```c
void example(void) {
    // STACK - automatic, zero overhead, dies with function
    int32_t x = 42;
    float   buf[256];   // 1 KB on stack - fine

    // HEAP - manual, survives the function
    int32_t *data = malloc(1024 * sizeof(int32_t)); // 4 KB
    if (!data) { /* always check! */ return; }

    data[0] = 7;
    free(data);  // you MUST free it - there's no GC
    data = NULL; // null it out to catch use-after-free
}
```

::: warn
Never put large arrays on the stack (>~16 KB). Stack overflows are silent and deadly. Use the heap or static storage for big data.
:::

### Practice

Write a program that allocates a 16-element `int32_t` array on the stack and a 1,000,000-element `int32_t` array on the heap. Fill both with their indices, sum each, and print the totals. Build with `-fsanitize=address` and confirm zero leaks at exit.

---

## 06 Pointers (demystified) {#pointers}

::: tldr
A pointer is just an integer holding a memory address. `&x` reads the address; `*p` reads (or writes) through it. Everything else is variations on that theme.
:::

A pointer is just an integer holding a memory address. That's the whole mystery.

::: tip
**Coming from Python/JS:** every variable in Python/JS is already a reference under the hood. C exposes the machinery. `int x = 5` puts the value 5 in a memory cell; `int *p = &x` is a second cell holding the address of the first. There is no magic indirection layer. The asterisk (`*`) and ampersand (`&`) are how you cross between "value" and "where it lives".
:::

```c
int32_t  x   = 10;     // x is the value
int32_t *p   = &x;    // p holds the ADDRESS of x
int32_t  val = *p;    // *p dereferences - reads through address
*p = 20;              // write through pointer - x is now 20
```

### The three faces of `*`

The asterisk has three unrelated jobs in C. Reading code is easier once you can spot which one you're looking at.

```c
int32_t *p;             // 1. DECLARATION: p is a pointer to int32_t
int32_t  v = *p;        // 2. EXPRESSION: dereference, read through p
int32_t  z = a * b;     // 3. OPERATOR: multiplication, unrelated

// In a declaration, * binds to the variable, not the type:
int32_t *a, *b;         // both a and b are pointers
int32_t *a,  b;         // a is a pointer, b is just int32_t
```

::: rule
Convention: write `int32_t *p` with the asterisk hugging the name. It makes the second case above immediately obvious.
:::

### `&` - address-of

`&` returns the address of an lvalue. It is the mirror of `*`: `*(&x) == x`.

```c
int32_t  x = 42;
int32_t *p = &x;          // fine: x has an address

// Cannot take address of:
//   - a literal:        &42         (error)
//   - an rvalue:        &(a + b)    (error)
//   - a register var:   ®_var    (error if marked register)
```

::: warn
Dereferencing a `NULL`, freed, or uninitialized pointer is undefined behaviour. In practice you get a segfault if you're lucky and silent memory corruption if you're not. Build with `-fsanitize=address` during development.
:::

### Why pointers exist

1. Pass large data without copying. 2. Let a function mutate a caller's variable. 3. Point into heap memory. 4. Build data structures.

```c
// Without pointer: caller's value unchanged
void bad_add(int32_t n) { n += 1; }

// With pointer: caller's value IS changed
void good_add(int32_t *n) { *n += 1; }

int32_t val = 5;
good_add(&val);  // val is now 6
```

### Pointer arithmetic

```c
int32_t arr[4] = {10, 20, 30, 40};
int32_t *p = arr;       // points to arr[0]
int32_t  a = *(p + 2); // same as arr[2] == 30
p++;                    // p now points to arr[1]
```

::: tip
`arr[i]` is literally syntactic sugar for `*(arr + i)`. Arrays and pointers are deeply the same thing in C.
:::

### Pointer to pointer `**`

Three real-world cases where you need a double pointer.

```c
// 1. Output parameter - function allocates, returns via arg
void alloc_buf(uint8_t **out, size_t n) {
    *out = malloc(n);
}
uint8_t *buf = NULL;
alloc_buf(&buf, 1024);

// 2. argv - array of strings (each string is a char*)
int main(int argc, char **argv) {
    for (int i = 0; i < argc; i++) {
        printf("%s\n", argv[i]);  // argv[i] is char*
    }
    return 0;
}

// 3. Pointer-to-pointer to update a list head from a helper
typedef struct Node { int32_t v; struct Node *next; } Node;

void push_front(Node **head, int32_t v) {
    Node *n = malloc(sizeof(*n));
    n->v = v; n->next = *head;
    *head = n;                          // caller's head now points to n
}

Node *list = NULL;
push_front(&list, 42);
```

::: tip
Read `**` right-to-left: `char **argv` = "argv is a pointer to a pointer to char" = "an array of strings". Same pattern works for any output-parameter or container-of-pointers situation.
:::

### Practice

Implement `void swap(int32_t *a, int32_t *b)` and `void reverse(int32_t *xs, size_t n)` (two-pointer walk inward, no recursion, no extra array). Verify by reversing `{1,2,3,4,5}` to `{5,4,3,2,1}`.

---

## 07 Visual Memory Models {#diagrams data-toc="Visual Memory Models"}

::: tldr
when in doubt, draw boxes and arrows. Most C bugs are spatial, not logical.
:::

### Process memory layout

```text
    high addresses
    +------------------+
    |  command line    |
    |  environment     |
    +------------------+
    |  STACK           |  <- grows DOWN
    |  ----------      |
    |  local vars      |
    |  return addr     |
    |  saved regs      |
    |       v          |
    |                  |
    |       ^          |
    |  HEAP            |  <- grows UP (malloc)
    +------------------+
    |  .bss            |  uninitialised globals (zeroed)
    |  .data           |  initialised globals
    |  .rodata         |  string literals (read-only)
    |  .text           |  the code
    +------------------+
    low addresses
```

### A pointer in pictures

```text
int x = 42;
int *p = &x;

  STACK
  +-----------+   address: 0x7ffd_a0
  |    42     |   <-- x
  +-----------+

  +-----------+   address: 0x7ffd_a8
  | 0x7ffd_a0 |   <-- p (holds the address of x)
  +-----------+

  *p reads through the arrow: 0x7ffd_a8 -> 0x7ffd_a0 -> 42
```

### Pointer to pointer (argv)

```text
char **argv;

  +-------+      +---+---+---+---+---+
  | argv  | ---> | * | * | * |...| 0 |   <- array of char*
  +-------+      +---+---+---+---+---+
                   |   |   |
                   v   v   v
                "./a" "x" "yz"           <- the actual strings
```

### A struct in memory

```text
struct Point { int32_t x; int32_t y; };
Point p = {3, 7};

  +---+---+---+---+---+---+---+---+
  | 03  00  00  00 | 07  00  00  00 |   little-endian, 8 bytes total
  +---+---+---+---+---+---+---+---+
   ^                ^
   p.x  (offset 0)  p.y  (offset 4)
```

### Array decay

```text
int arr[4] = {10, 20, 30, 40};

In its own scope:
  arr     -->  the whole array, sizeof(arr) == 16
  &arr    -->  pointer to int[4]

Passed to a function:
  void f(int a[]) { ... }
  f(arr);
        arr decays to &arr[0] - a plain int*
        sizeof(a) inside f == sizeof(int*) (8 on 64-bit), NOT 16
```

::: warn
This decay is the most common source of `sizeof` bugs. Inside a function parameter, `int a[]` and `int *a` are the same type. The size of the original array is gone forever; pass the length explicitly.
:::

### Stack frame layout

```text
caller calls callee(x, y):

  +---------------------+   <- top of stack BEFORE call
  | caller locals       |
  +---------------------+
  | y           (arg)   |     args (or in registers, x86_64 SysV)
  | x           (arg)   |
  | return addr         |     saved by `call`
  | saved frame ptr     |
  | callee locals       |     callee allocates
  +---------------------+   <- top during call

On return: restore frame ptr, jump to return addr.
Caller's stack is exactly as it was.
```

### Practice

Compile a 5-line program with `int x = 42; int *p = &x; uint8_t *heap = malloc(8);`. Run it under `gdb` and `p &x`, `p p`, `p heap`. Sketch the three addresses on paper, label which is stack and which is heap based on the magnitude.

---

## 08 Arrays & Decay {#arrays}

::: tldr
Arrays know their size; pointers do not. The moment you pass an array to a function, it decays to a pointer and `sizeof` lies. Always pass length explicitly.
:::

An array is a contiguous run of elements. In C it is *not* a pointer, but it silently turns into one almost everywhere you use it. Knowing exactly when that happens is the difference between code that works and code that quietly reads garbage.

### Declaration vs decay

```c
int32_t arr[5] = {10, 20, 30, 40, 50};

// At the point of declaration, arr is an ARRAY of 5 int32_t.
sizeof(arr);              // 20 bytes (5 * 4) - knows the size
sizeof(arr) / sizeof(arr[0]); // 5 - element count

// In almost any expression, arr decays to a pointer to its first element.
int32_t *p = arr;        // implicit decay: arr -> &arr[0]
sizeof(p);                // 8 bytes (a pointer) - size info LOST
```

::: rule
`sizeof` on a declared array gives total bytes. `sizeof` on a pointer gives the pointer's own size (8 on 64-bit). The compiler cannot recover the element count from a pointer.
:::

### The decay rule

An array expression converts to a pointer to its first element **except** in three cases:

- Operand of `sizeof`
- Operand of unary `&` (address-of)
- String literal used to initialize a `char` array

```c
int32_t arr[5];

sizeof(arr);   // no decay: 20
&arr;           // no decay: type is int32_t (*)[5] - pointer to array of 5
arr + 1;        // decays: pointer arithmetic, type int32_t*
arr[2];         // decays then derefs: equivalent to *(arr + 2)
```

### Array as a function parameter

This trips everyone up. These three signatures are *identical* to the compiler:

```c
void f(int32_t arr[10]);   // looks like an array
void f(int32_t arr[]);     // also looks like an array
void f(int32_t *arr);      // the truth

void f(int32_t arr[10]) {
    sizeof(arr);            // 8 (a pointer) - the [10] is a LIE
}
```

::: warn
A function never receives an array. It receives a pointer. The bracketed size is documentation for humans; the compiler ignores it. To pass length, pass it explicitly as a separate parameter, or use a slice struct ([Pattern: Slices](#slices)).
:::

### The C99 `static` hint

```c
// "arr will be at least 4 elements" - a contract, not a check
void sum4(int32_t arr[static 4]) {
    // compiler may use this for optimization / warnings
    // some compilers warn if you call it with NULL or fewer elements
}
```

### Iterating safely

```c
int32_t arr[] = {10, 20, 30, 40};
size_t  n   = sizeof(arr) / sizeof(arr[0]);

for (size_t i = 0; i < n; i++) {
    printf("%d\n", arr[i]);
}

// Common helper macro - works ONLY where arr has not decayed
#define ARRAY_LEN(a) (sizeof(a) / sizeof((a)[0]))

for (size_t i = 0; i < ARRAY_LEN(arr); i++) { /* ... */ }
```

::: warn
`ARRAY_LEN` silently returns the wrong value if `arr` is actually a pointer (function parameter, dynamic allocation). Use it only on declared arrays whose definition is in scope.
:::

### VLAs - skip them

```c
// Variable Length Array: size known at runtime, lives on stack
void process(size_t n) {
    int32_t buf[n];           // C99 VLA - tempting, dangerous
    // stack overflow if n is large or attacker-controlled
    // no way to handle the failure - it's just a crash
}
```

::: rule
VLAs are optional in C11 and later. They have unpredictable stack costs and no failure path. Use a fixed-size buffer for small bounded sizes; `malloc` or an arena for anything dynamic. Many code bases ban VLAs outright.
:::

### Multi-dimensional arrays

```c
// Row-major in memory: grid[0][0], grid[0][1], ..., grid[1][0], ...
int32_t grid[3][4];

grid[2][1] = 7;             // row 2, column 1

// As a parameter: only the FIRST dimension may be omitted
void draw(int32_t g[][4], size_t rows);

// In practice: flatten to 1D and compute the index yourself
void draw_flat(int32_t *g, size_t rows, size_t cols) {
    for (size_t y = 0; y < rows; y++)
        for (size_t x = 0; x < cols; x++)
            g[y * cols + x] = 0;
}
```

::: tip
Flat 1D arrays plus manual indexing give you the same memory layout as a 2D array, but pass and resize cleanly and play well with arenas. The CPU sees identical bytes; only the source looks different.
:::

### Out-of-bounds is undefined

```c
int32_t arr[4] = {0};
arr[4] = 99;     // UB: index 4 is one PAST the end
arr[-1] = 99;    // UB: before the array
```

::: warn
Reading or writing outside an array is undefined behaviour, even by one element. The hardware will not stop you. Build with `-fsanitize=address` in dev and the bug surfaces at the offending line; without it, you corrupt a neighbour and the symptom appears anywhere.
:::

### Practice

Write `bool all_positive(const int32_t *xs, size_t n)`. Call it twice from main: once with a stack array literal `{1, 2, 3}` and once with a heap-allocated array of zeros. Do not use `sizeof` inside the function.

---

## 09 Strings {#strings}

::: tldr
C strings are null-terminated `char` arrays. Never use `strcpy`/`strcat`/`==`. Use `snprintf` for building strings and `strcmp` for comparing them.
:::

C strings are null-terminated arrays of `char`. They are the biggest source of bugs in C. Know the rules.

```c
#include <string.h>

// String literal - lives in read-only memory, do NOT write to it
const char *s1 = "hello";

// Mutable copy on stack - you CAN write to this
char buf[64] = "hello";

// NEVER use strcpy/strcat - use the safe n-versions
strncpy(buf, "world", sizeof(buf) - 1);
buf[sizeof(buf) - 1] = '\0';  // always null-terminate

// Better: use snprintf for building strings
char msg[128];
snprintf(msg, sizeof(msg), "Player %d: score=%d", id, score);

// Useful string functions
size_t len = strlen(s1);         // length (not counting \0)
int    cmp = strcmp(s1, "hi");   // 0 if equal
```

::: warn
Never compare strings with `==`. That compares pointer addresses, not content. Always use `strcmp`.
:::

### Modern: String View (non-owning slice)

```c
// A string that doesn't own its memory - great for parsing
typedef struct {
    const char *data;
    size_t      len;
} Str;

#define STR(literal) ((Str){ (literal), sizeof(literal)-1 })
#define STR_FMT      "%.*s"
#define STR_ARG(s)   (int)(s).len, (s).data

Str name = STR("Alice");
printf("Hello, " STR_FMT "!\n", STR_ARG(name));
// → Hello, Alice!
```

### Practice

Implement `bool starts_with(const char *s, const char *prefix)` from scratch (no `strncmp`). Test on these cases and assert: `("hello", "he") -> true`, `("hi", "hello") -> false`, `("", "") -> true`, `("abc", "") -> true`.

---

## 10 Structs & Composition {#structs}

::: tldr
C has no classes. Structs are your objects. Use designated initializers (`.field = v`); pass a `Self *self` as the first arg of "method" functions.
:::

C has no classes. Structs are your objects. Composition over inheritance.

```c
typedef struct {
    float x, y;
} Vec2;

typedef struct {
    Vec2    pos;      // embedded struct
    Vec2    vel;
    float   radius;
    bool    active;
} Ball;

// Designated initializers (C99+) - use these, they're clear
Ball b = {
    .pos    = {100.0f, 200.0f},
    .vel    = {3.0f,   -1.5f},
    .radius = 16.0f,
    .active = true,
};

// Accessing fields through pointer
Ball *bp = &b;
bp->radius = 20.0f;   // arrow = dereference + access
(*bp).radius = 20.0f; // same thing, uglier
```

### Function "methods" on structs

```c
// Convention: first arg is pointer to the struct
void  ball_update(Ball *b, float dt);
void  ball_draw  (const Ball *b);  // const = won't mutate
bool  ball_alive (const Ball *b);

// Call-site reads naturally
ball_update(&b, 0.016f);
ball_draw(&b);
```

### Practice

Define `Ball { Vec2 pos, vel; float radius; bool active; }` and `void ball_update(Ball *b, float dt)` that advances `pos` by `vel*dt`. Initialize a Ball with designated init, call update 10 times, print the final position.

---

## 11 Enums & Tagged Unions {#enums}

::: tldr
Enum gives names to integer constants. Union holds one of several payloads in the same memory. Together they encode "this is exactly one of N variants".
:::

Enums give you typed names instead of magic numbers. Unions let one piece of memory hold one of several types. Combined, they encode *sum types*: "this thing is exactly one of these variants". This is the C answer to Rust's `enum` and Haskell's algebraic data types.

### Plain enums

```c
typedef enum {
    DIR_UP    = 0,
    DIR_RIGHT = 1,
    DIR_DOWN  = 2,
    DIR_LEFT  = 3,
    DIR_COUNT          // = 4 - automatic, useful sentinel
} Direction;

Direction d = DIR_UP;

switch (d) {
    case DIR_UP:    /* ... */ break;
    case DIR_DOWN:  /* ... */ break;
    case DIR_LEFT:
    case DIR_RIGHT: /* ... */ break;
    // no default - compiler warns about missing cases with -Wswitch-enum
}
```

::: rule
An enum value is an `int`-sized constant. You can mix it with integer arithmetic - `d + 1` compiles - but treat enum values as *opaque names*, not numbers. Use `DIR_COUNT` as the loop bound instead of hard-coding 4.
:::

### Bit flags

```c
typedef enum {
    PERM_READ  = 1 << 0,   // 0b0001
    PERM_WRITE = 1 << 1,   // 0b0010
    PERM_EXEC  = 1 << 2,   // 0b0100
    PERM_OWNER = 1 << 3,   // 0b1000
} Perm;

uint32_t perms = PERM_READ | PERM_WRITE;   // combine

if (perms & PERM_WRITE) { /* writable */ }   // test
perms |=  PERM_EXEC;                          // set
perms &= ~PERM_WRITE;                         // clear
perms ^=  PERM_READ;                          // toggle
```

::: tip
Always store flag combinations in an unsigned integer (`uint32_t`) rather than the enum type. The combined value is not a valid enum constant; signed bit ops can also surprise you on `~` and shifts.
:::

### Tagged unions (sum types)

The single most useful pattern enums and unions enable. Pair a discriminator (`tag`) with a union of payloads. Read the tag first, then read the matching union arm.

```c
typedef enum {
    EVENT_KEY,
    EVENT_MOUSE,
    EVENT_RESIZE,
    EVENT_QUIT,
} EventKind;

typedef struct {
    EventKind kind;
    union {
        struct { int32_t code; bool down; }       key;
        struct { int32_t x, y; uint8_t button; } mouse;
        struct { int32_t w, h; }                  resize;
        // EVENT_QUIT carries no payload - no arm needed
    };
} Event;

void handle(const Event *e) {
    switch (e->kind) {
    case EVENT_KEY:
        printf("key %d %s\n", e->key.code, e->key.down ? "down" : "up");
        break;
    case EVENT_MOUSE:
        printf("mouse %d,%d btn=%u\n", e->mouse.x, e->mouse.y, e->mouse.button);
        break;
    case EVENT_RESIZE:
        printf("resize %dx%d\n", e->resize.w, e->resize.h);
        break;
    case EVENT_QUIT:
        return;
    }
}
```

Building one:

```c
Event e = {
    .kind  = EVENT_KEY,
    .key   = { .code = 27, .down = true },   // designated init for the active arm
};
```

::: rule
Read only the union arm that matches the current tag. Reading any other arm is undefined behaviour (it crosses C's "type-punning through union" line in older standards). Always go: read tag, switch, then access the corresponding member.
:::

### Memory size

```c
// A union is as large as its biggest arm
union Big {
    uint8_t  small[4];     // 4 bytes
    double   d;            // 8 bytes
    char     buf[32];      // 32 bytes
};
sizeof(union Big);            // 32 (rounded up for alignment)

// Tagged union pays one tag plus the biggest arm plus padding
sizeof(Event);                  // ~24 on 64-bit, mostly the mouse arm
```

::: warn
Tagged unions trade memory for clarity. If your variants differ wildly in size and the small variants dominate, consider *type-erased pointers* instead: store a tag plus a `void*` to a heap-allocated payload. The downside is one indirection per access.
:::

### Anonymous unions and structs (C11)

```c
// C11+: skip the .as / .key prefix entirely
typedef struct {
    EventKind kind;
    union {                  // no name -> members are reachable on the parent
        struct { int32_t code; bool down; };  // also anonymous
        struct { int32_t x, y; uint8_t button; };
    };
} Ev2;

Ev2 e;
e.code = 27;   // no e.key.code
```

::: tip
Anonymous unions are clean but every member name lives in the same namespace - `code`, `down`, `x`, `y` all have to be unique across all arms. Switch to named arms (`e->key.code`) when collisions appear.
:::

### Type punning - do this with `memcpy`

```c
// You have float bits, you want to inspect them as a uint32_t
float    f = 3.14f;
uint32_t u;
memcpy(&u, &f, sizeof(u));   // well-defined, optimizes to a register move

// DO NOT do this - violates strict aliasing, may be miscompiled at -O2:
// uint32_t bad = *(uint32_t*)&f;
```

::: warn
`memcpy` between same-sized objects is the portable, defined way to reinterpret bytes. Casting through a different pointer type is undefined behaviour under the strict-aliasing rules - see [Undefined Behavior](#ub).
:::

### Practice

Build a tagged-union `Event` with `KEY`, `MOUSE`, `QUIT` arms (key has `code, down`; mouse has `x, y`). Construct one of each in an array, write `void handle(const Event *e)` that switches on the tag and prints a one-line summary per event.

---

## 12 Memory Management {#memory data-toc="Memory Management"}

::: tldr
malloc takes memory, free returns it. Lose the pointer and you've leaked. Free twice and you've corrupted the heap. Use arenas to make ownership obvious.
:::

### The four allocators

```c
#include <stdlib.h>

void *malloc(size_t n);                  // n bytes, uninitialised
void *calloc(size_t count, size_t size); // count*size bytes, zeroed
void *realloc(void *p, size_t n);        // grow/shrink an existing block
void  free(void *p);                     // release back to the heap
```

```c
// malloc - fastest, contents are garbage
char *buf = malloc(1024);
if (!buf) abort();         // ALWAYS check
memset(buf, 0, 1024);      // zero it yourself if needed

// calloc - zero-initialised, slightly slower
int32_t *counts = calloc(256, sizeof *counts);

// realloc done WRONG - leaks original block on failure
buf = realloc(buf, 4096);

// realloc done right
char *tmp = realloc(buf, 4096);
if (!tmp) { free(buf); abort(); }
buf = tmp;
```

::: warn
`realloc(NULL, n)` behaves like `malloc(n)`, and `realloc(p, 0)` is implementation-defined. Don't rely on either; spell out the intent explicitly.
:::

### Coming from Python/JS

In Python/JS, the runtime tracks every reference and frees memory when the last one goes out of scope. C has no runtime. **You** decide when memory is freed. If you don't, it lives until the process exits (a "leak"). If you free too early, every remaining pointer to it is a bomb.

| Concept | Python / JS | C |
|---------|-------------|---|
| Allocate | `[]`, `{}`, `new Foo()` | `malloc(sizeof(Foo))` |
| Free | implicit (GC) | explicit (`free`) |
| Variable holds | reference | value or pointer |
| Out of scope | maybe collected later | freed (stack) or leaked (heap) |

### Ownership

Every heap allocation has exactly one owner. The owner is responsible for freeing it. Document this in the API.

```c
// pattern 1: caller owns - function returns, caller frees
char *read_file(const char *path);          // caller MUST free()

// pattern 2: callee owns - caller hands off
void log_take_ownership(char *msg);         // log frees msg eventually

// pattern 3: borrowed - lifetime tied to something else
const char *get_name(const Person *p);      // valid while p is valid
```

::: rule
If a function name contains `make`, `new`, `clone`, `dup`, or `read_*`, the caller almost always owns the result. State it in the header comment.
:::

### Arenas (the lifetime trick)

Per-allocation `free` is bug-prone. An arena groups allocations that all die together; you free the whole arena in one shot.

```c
typedef struct {
    uint8_t *base;
    size_t   cap;
    size_t   used;
} Arena;

void *arena_alloc(Arena *a, size_t n) {
    if (a->used + n > a->cap) return NULL;
    void *p = a->base + a->used;
    a->used += n;
    return p;
}

void arena_reset(Arena *a) { a->used = 0; }   // reuse - O(1)
```

Use one arena per request, per frame, per parse. Free is just `arena_reset` or `free(arena.base)`. No leaks, no double-frees, no shared ownership.

### Detecting leaks

Don't audit by hand. Run the binary under AddressSanitizer:

```bash
clang -g -O0 -fsanitize=address,undefined main.c -o main
ASAN_OPTIONS=detect_leaks=1 ./main
```

ASan prints every leaked block with a stack trace at exit. Treat any leak found this way as a bug.

::: warn
On Linux, `malloc` can succeed even when the system is out of memory and only fail later when you touch the page (overcommit). Always check the return, but don't rely on it as your OOM strategy.
:::

::: tip
`free(NULL)` is a defined no-op. You don't need to null-check before freeing. Only file/socket cleanup needs the guard.
:::

### Practice

Write a program that does `char *p = malloc(100);` and exits without `free`. Compile with `clang -fsanitize=address`. Run with `ASAN_OPTIONS=detect_leaks=1 ./prog` - confirm a 100-byte leak is reported. Add the `free`, re-run, confirm clean exit.

---

## 13 Error Handling Idioms {#errors data-toc="Error Handling"}

::: tldr
C has no exceptions. Pick one error convention per project and hold the line. Cleanup goes through `goto`.
:::

### The three conventions

```c
// 1. Return an int: 0 = ok, non-zero = error code
int parse(const char *s, int32_t *out);
if (parse(s, &x) != 0) { /* handle */ }

// 2. Return a pointer: NULL = error, errno set by libc
FILE *f = fopen(path, "r");
if (!f) { perror("fopen"); }

// 3. Result struct: explicit ok flag, no out-parameter
typedef struct { int32_t value; bool ok; } ParseInt;
ParseInt parse_int(const char *s);
ParseInt r = parse_int(s);
if (!r.ok) { /* handle */ }
```

::: rule
Pick one and use it everywhere. Mixing conventions inside one codebase is the leading cause of "we forgot to check this".
:::

### errno

`errno` is the global C error variable, set by libc on failure.

```c
#include <errno.h>
#include <string.h>

FILE *f = fopen(path, "r");
if (!f) {
    fprintf(stderr, "fopen %s: %s\n", path, strerror(errno));
    return -1;
}
```

::: warn
`errno` is only valid right after a libc call that documents setting it. Anything else (even a `printf`) can clobber it. Save it immediately if you're going to log later: `int e = errno;`.
:::

### Cleanup with goto

C has no destructors. `goto` to a single cleanup label is the canonical pattern. The Linux kernel and every serious C codebase use it. Don't fight it.

```c
int run(void) {
    void *a = NULL, *b = NULL, *c = NULL;
    int rc = -1;

    if (!(a = step1())) goto fail;
    if (!(b = step2())) goto fail;
    if (!(c = step3())) goto fail;

    do_work(a, b, c);
    rc = 0;
fail:
    free(c); free(b); free(a);
    return rc;
}
```

::: tip
Forward `goto` only. Never goto backwards (that's a loop). Never jump into the middle of a block. Keep cleanup labels at function scope, never inside an `if`.
:::

### Asserts vs returns

```c
#include <assert.h>

int process(Buf *b, size_t i) {
    assert(b != NULL);          // INVARIANT: a bug if false. Crashes in debug.
    if (i >= b->len) return -1; // RUNTIME: legitimate error path.
    return 0;
}
```

`assert` is for things that should never happen. Errors that *can* happen at runtime (bad user input, network failures, missing files) need a real return path.

::: warn
`assert` is compiled out under `-DNDEBUG` (release builds). Don't put side effects inside it: `assert(do_thing() == 0)` becomes nothing in release.
:::

### Practice

Write `int copy_transform(const char *src_path, const char *dst_path)` that opens both files, reads `src` line-by-line, writes upper-cased lines to `dst`, and returns 0/non-zero. Use the `goto cleanup` pattern so both `FILE*` close on every path (early failure included).

---

## 14 Functions & Headers {#functions}

::: tldr
Headers declare; `.c` files define. `#pragma once` at the top. Only declarations, typedefs, and `static inline` helpers belong in headers.
:::

```c
// mylib.h - declarations only
#pragma once           // include guard (supported everywhere)
#include <stdint.h>

typedef struct MyLib MyLib;  // forward declare

MyLib  *mylib_create(size_t capacity);
void    mylib_destroy(MyLib *lib);
int32_t mylib_process(MyLib *lib, const uint8_t *data, size_t n);
```

```c
// mylib.c - definitions
#include "mylib.h"
#include <stdlib.h>

struct MyLib {
    uint8_t *buf;
    size_t   cap;
    size_t   len;
};

MyLib *mylib_create(size_t capacity) {
    MyLib *lib = calloc(1, sizeof(*lib));  // calloc = malloc + zero
    if (!lib) return NULL;
    lib->buf = malloc(capacity);
    if (!lib->buf) { free(lib); return NULL; }
    lib->cap = capacity;
    return lib;
}

void mylib_destroy(MyLib *lib) {
    if (!lib) return;
    free(lib->buf);
    free(lib);
}
```

::: rule
Put only *declarations* in headers. Definitions (function bodies, global variable storage) go in .c files. `#pragma once` prevents double-inclusion.
:::

### Practice

Split a 1-file program into `mylib.h` (declarations), `mylib.c` (definitions, plus a `static` helper), and `main.c`. Try calling the static helper from `main.c` and observe the linker error. Then call the public function and confirm it links.

---

## 15 Function Pointers {#funcptr}

::: tldr
A function pointer holds the address of code, letting you pick which function to call at runtime. `typedef` non-trivial signatures. Always pass a trailing `void *user` for state.
:::

A function pointer holds the address of executable code. It lets you choose at runtime which function to call. That's the entire mechanism behind callbacks, plugin tables, dispatch in interpreters, and C's stand-in for virtual methods.

### The syntax

```c
// A function
int32_t add(int32_t a, int32_t b) { return a + b; }

// A pointer that can hold its address
int32_t (*op)(int32_t, int32_t);

op = add;          // no & needed, function names decay like arrays
op = &add;         // also legal, identical effect

int32_t r = op(2, 3);    // 5 - call through the pointer
int32_t q = (*op)(2, 3);  // also 5 - the deref is implicit
```

::: rule
Always `typedef` non-trivial function-pointer types. The bare syntax stacks parens and asterisks until it is unreadable. A typedef hides the noise and the call site reads like a normal function call.
:::

```c
// Typedef the type itself, not a pointer to it - keeps the * at use sites visible
typedef int32_t BinaryOp(int32_t, int32_t);

BinaryOp *op = add;
op(2, 3);
```

### Callbacks: `qsort`

```c
#include <stdlib.h>

static int cmp_int32(const void *a, const void *b) {
    int32_t x = *(const int32_t*)a;
    int32_t y = *(const int32_t*)b;
    return (x > y) - (x < y);   // safe: no overflow on subtraction
}

int32_t nums[] = { 5, 2, 8, 1, 9 };
qsort(nums, 5, sizeof(nums[0]), cmp_int32);
```

::: warn
A comparator that returns `x - y` is a classic bug: it overflows for distant values. Always return `(x > y) - (x < y)` or compare with explicit `if`s.
:::

### The "context pointer" idiom

Pure function pointers cannot capture state. C's universal fix is a `void *user` trailing argument that the caller hands back to you on every callback.

```c
typedef void EachFn(const char *line, void *user);

void file_each_line(FILE *f, EachFn *fn, void *user) {
    char buf[512];
    while (fgets(buf, sizeof(buf), f)) fn(buf, user);
}

static void count_cb(const char *line, void *user) {
    (*(int32_t*)user)++;     // user points to the counter
    (void)line;
}

int32_t count = 0;
file_each_line(f, count_cb, &count);
```

::: rule
Every callback API in any well-designed C library takes a `void *user`. If a library forces you to use globals to share state with the callback, that API is broken.
:::

### Dispatch table (poor man's vtable)

```c
typedef struct {
    void (*draw)  (void *self);
    void (*update)(void *self, float dt);
    void (*destroy)(void *self);
} EntityVTable;

typedef struct {
    const EntityVTable *vt;
    // per-instance fields follow
} Entity;

// Concrete type embeds an Entity at the front (composition)
typedef struct {
    Entity base;
    float  hp;
} Player;

static void player_draw(void *self) {
    Player *p = self;          // safe: layout-compatible cast from base
    // ... draw using p->hp etc
    (void)p;
}

static const EntityVTable kPlayerVT = {
    .draw    = player_draw,
    .update  = NULL,
    .destroy = NULL,
};

Player p = { .base = { .vt = &kPlayerVT } };
p.base.vt->draw(&p);
```

::: tip
Keep the vtable pointer at offset 0 so a generic `Entity*` can call `e->vt->draw(e)` regardless of the concrete subtype. This is exactly how C++ implements virtual calls under the hood.
:::

### NULL function pointers

```c
// Calling NULL crashes. Default to a no-op stub instead of NULL-checking everywhere.
static void noop_update(void *self, float dt) { (void)self; (void)dt; }

static const EntityVTable kDefaultVT = {
    .draw    = noop_update_void,   // fill every slot
    .update  = noop_update,
    .destroy = noop_update_void,
};
```

::: warn
A function pointer with the wrong signature is undefined behaviour to call, even if the cast compiled. Match prototypes exactly. Use the typedef and let the compiler check the assignment.
:::

### Practice

Write `bool foreach_int(const int32_t *xs, size_t n, bool (*fn)(int32_t v, void *user), void *user)` that calls `fn` for each element and stops early if `fn` returns true. Use it with a callback that finds the first negative number, returning the index via `user`.

---

## 16 Linkage & Storage {#linkage}

::: tldr
`static` at file scope = private to this TU. `static` inside a function = lifetime of the program but local name. `extern` = declare without defining. Mark every file-local helper `static`.
:::

"Linkage" is C's word for "who can see this name". "Storage" is "where does this object live and how long". Get these two right and most "weird header bug" disappears.

### Translation units

A translation unit (TU) is one `.c` file plus everything its preprocessor pulls in. Each TU is compiled to an object file independently. The *linker* stitches object files together by matching names. `#pragma once` stops a header pasting twice into the same TU; it does nothing across TUs.

```c
// foo.c    -+
//           +- foo.o  <- compile
// foo.h     |
// bar.c    -+- bar.o  <- compile
//           +
//           +- app    <- link foo.o + bar.o
```

### The four scopes

| Where declared | Lifetime | Visible to |
|---|---|---|
| Inside a function (no qualifier) | Block (auto) | Just that block |
| Inside a function, `static` | Whole program | Just that block |
| File scope, no `static` | Whole program | All TUs (external linkage) |
| File scope, `static` | Whole program | This TU only (internal linkage) |

```c
// foo.c
int32_t        public_count;        // EXTERNAL: visible everywhere
static int32_t private_count;       // INTERNAL: this file only

void tick(void) {
    static int32_t calls = 0;        // LIFETIME=program, SCOPE=function
    calls++;
}
```

::: rule
Default file-scope visibility is *external*. That means a missing `static` on a helper leaks the symbol to every other TU, risks name collisions at link time, and bloats public surface. Mark every file-local helper `static`.
:::

### `extern`: declaring something defined elsewhere

```c
// app.h
extern int32_t g_frame_count;   // declaration, no storage

// app.c
int32_t g_frame_count = 0;       // definition, allocates storage
```

::: warn
A header that *defines* a global (no `extern`, with an initializer) and is included by two TUs is a multiple-definition link error. Headers declare with `extern`; exactly one `.c` file defines.
:::

### `static` has three meanings

- At **file scope**: internal linkage. The name is private to this TU.
- Inside a **function**: storage lives for the whole program; the name is still local.
- Inside **array parameter brackets** (C99): "at least N elements" hint - see Arrays section.

### `inline`: hint, not contract

```c
// header.h - safe pattern: static inline
static inline int32_t sq(int32_t x) { return x * x; }
```

`static inline` in a header is the modern, no-surprises way to put short helpers in headers. Each TU gets its own private copy that the optimizer can inline freely. Plain `inline` without `static` has subtle one-definition-rule semantics that almost nobody gets right.

::: rule
Trust the optimizer. `inline` is a hint that compilers may ignore. Use `static inline` for tiny helpers in headers; otherwise just write a normal function in a `.c` file.
:::

### Storage durations

| Class | Lifetime | Example |
|---|---|---|
| Automatic | Block (created on entry, freed on exit) | Local var without `static` |
| Static | Entire program | Globals, function-level `static` |
| Allocated | From `malloc` until `free` | Heap data |
| Thread (C11) | Per-thread | `thread_local` / `_Thread_local` |

### The header rules in one box

::: rule
Headers contain: declarations, `typedef`s, `struct`/`enum` definitions, `#define`s, `static inline` helpers.  
Headers do *not* contain: function bodies (except `static inline`), variable definitions, anything else that produces storage.  
Use `#pragma once` at the top.  
Mark every file-local symbol in a `.c` file `static`.
:::

### Practice

Write `int32_t next_id(void)` using a function-local `static int32_t counter = 0;` that returns `++counter`. Call it from two different `.c` files (compile both, link). Confirm calls from either file share the same counter (1, 2, 3, ...).

---

## 17 The Preprocessor & `#define` {#preprocessor data-toc="Preprocessor & #define"}

::: tldr
Textual phase before compilation. `#include` pastes, `#define` substitutes, `#ifdef` gates. No types, no scope, no surprises once you remember it's just text.
:::

The preprocessor is a textual phase that runs before the compiler. It does three things: pastes files (`#include`), substitutes text (`#define`), and conditionally keeps or drops code (`#ifdef`). That's it.

```bash
// See exactly what the preprocessor produced:
clang -E main.c              # prints expanded source to stdout
clang --save-temps main.c    # also keeps main.i (preprocessed .c)
```

### `#include`

Literally pastes the file's contents at the line of the include. `<name>` searches system paths, `"name"` searches the project. You could include a `.json` file - it would not compile, but the paste would happen.

### `#define` constants

```c
#define MAX_ENTITIES 1024
#define PI           3.14159f
#define APP_NAME     "c-2080"
```

Untyped, no scope, replaced as raw text. Convention: `SCREAMING_SNAKE_CASE` so a reader knows it's a macro.

::: rule
Prefer `static const` and `enum` for typed constants. Use `#define` only when you need text substitution: macros, conditional compile, header guards.
:::

### Function-like macros

```c
// BUG: SQUARE(1+2) becomes 1+2*1+2 = 5, not 9
#define SQUARE(x) x*x

// Fix: parens around args AND around the whole expression
#define SQUARE(x) ((x)*(x))

// Multi-statement: wrap in do-while(0) so it works in any context
#define LOG(msg) do { \
    fprintf(stderr, "[%s:%d] %s\n", __FILE__, __LINE__, msg); \
} while (0)

LOG("started");  // safe inside if/while/for without braces
```

### Conditional compilation

```c
#ifdef _WIN32
    // Windows-only code
#elif defined(__linux__)
    // Linux-only code
#endif

#ifndef NDEBUG
    printf("debug build\n");
#endif

// Single-header library trick (see Barker's Way pattern)
#ifdef LIB_IMPLEMENTATION
/* function bodies go here */
#endif
```

### Built-in macros

```c
printf("at %s:%d in %s\n", __FILE__, __LINE__, __func__);
// at main.c:42 in process_input
```

### Stringify `#` and token paste `##`

```c
#define STR(x)   #x            // turn arg into string literal
#define CAT(a,b) a##b          // glue two tokens

printf("%s\n", STR(hello));   // prints: hello
int32_t CAT(my_, var) = 7;       // declares my_var
```

::: warn
Macros do text substitution, not function calls. They have no type checking and side effects in arguments are evaluated more than once: `SQUARE(i++)` increments `i` twice. Prefer `static inline` functions when you need behaviour, not text.
:::

### Practice

Write a `LOG_INFO(fmt, ...)` macro that prefixes `__FILE__:__LINE__` and a `SQUARE(x)` that does NOT double-evaluate its arg (use a `static inline` function). Run `clang -E your.c | tail -20` and confirm `LOG_INFO` expanded with the file:line prefix you expected.

---

## 18 Variadic Functions {#variadic}

::: tldr
`...` takes a variable arg list, read with `va_list`. The function cannot tell how many were passed. Wrap `vprintf`/`vsnprintf`; pass a count or sentinel.
:::

A variadic function takes a variable number of arguments. `printf` is the famous one. You almost never write new variadic functions in modern C; what you do write are *wrappers* around `printf`/`vprintf` for logging, formatting, error reporting.

### Calling variadic functions

```c
#include <stdio.h>

printf("%s is %d\n", name, age);  // the format string is the discriminator

// Format spec mismatches are silent UB. Enable -Wformat=2 -Werror.
```

::: warn
Mismatched format specifiers (`%d` vs `%lld` vs `%zu`) are undefined behaviour. They will silently print garbage on platforms where the argument width does not match the spec. `-Wformat=2` in your build catches almost all of these at compile time.
:::

### Writing a wrapper

```c
#include <stdarg.h>
#include <stdio.h>

// Take a format string + ... and forward to vfprintf
void log_info(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);              // last named arg goes here
    fprintf(stderr, "[info] ");
    vfprintf(stderr, fmt, ap);     // the v-version takes a va_list
    fprintf(stderr, "\n");
    va_end(ap);                     // always end - paired with va_start
}

log_info("player %s scored %d", name, score);
```

::: rule
Always wrap `vprintf`/`vsnprintf`, not `printf` directly. The `v`-versions accept the `va_list` you have already started; the non-`v` versions cannot. Forgetting `va_end` is technically UB; on most ABIs it is a no-op, but write it anyway.
:::

### Format-string attribute (gcc / clang)

```c
// Tell the compiler the 1st arg is a printf format and args start at 2
void log_info(const char *fmt, ...)
    __attribute__((format(printf, 1, 2)));
```

With this attribute, your wrapper gets the same `-Wformat=2` checking that `printf` itself gets. Free bug prevention.

### Reading a `va_list` directly

```c
// Sum a variable number of int32_t. Caller passes a -1 sentinel.
int32_t sum_until_neg1(int32_t first, ...) {
    int32_t total = first;
    va_list ap;
    va_start(ap, first);
    for (;;) {
        int32_t n = va_arg(ap, int32_t);   // promotion rules apply
        if (n == -1) break;
        total += n;
    }
    va_end(ap);
    return total;
}
```

::: warn
There is no way to know how many arguments were passed - the function only sees the format string or a sentinel value. Reading past the actual arguments is undefined behaviour. Pass a count or a terminator and trust nothing else.
:::

### Promotion rules (the gotcha)

- `float` arguments are promoted to `double`
- `char`, `short`, `bool` are promoted to `int`
- Pass them, but `va_arg(ap, double)` and `va_arg(ap, int)` respectively

::: tip
Modern alternative: pass an array. `void emit(size_t n, const Event *evs)` beats `void emit(int dummy, ...)` on every metric - type checking, no promotion mess, no sentinel, easy to grow.
:::

### Practice

Write `int32_t sum_n(int n, ...)` that sums `n` `int32_t` args using `va_list`. Then write `int32_t sum_until(int32_t first, ...)` that stops at a `-1` sentinel. Print both totals and confirm they match for the same numbers.

---

## 19 File I/O {#fileio}

::: tldr
`fopen`/`fread`/`fwrite`/`fclose` is 80% of C file I/O. Use `"rb"`/`"wb"` for binary, especially on Windows. `mmap` only when you need zero-copy on big files.
:::

The `<stdio.h>` stream API is the 80% of file I/O. `fopen`, read or write, `fclose`. For very large files or zero-copy workflows, drop down to `mmap`.

### Open, read, close

```c
#include <stdio.h>

FILE *f = fopen("data.bin", "rb");   // "rb" = read binary
if (!f) {
    perror("data.bin");              // prints reason via errno
    return -1;
}

uint8_t buf[4096];
size_t  n = fread(buf, 1, sizeof(buf), f);
// fread returns elements read; with size=1 you get bytes

fclose(f);                          // must close on success AND failure paths
```

::: rule
`fopen` mode strings: `"r"` read, `"w"` create/truncate, `"a"` append, `"r+"` read+write existing, `"w+"` create+read+write, suffix `"b"` for binary on Windows. Always pass `"b"` in cross-platform code if you are not parsing text - on Windows the non-binary mode rewrites `\r\n` to `\n` on read.
:::

### Slurp a whole file (the helper everyone re-writes)

```c
// Reads file into a malloc'd buffer. Returns NULL on error.
// Caller frees with free().
uint8_t *slurp(const char *path, size_t *out_len) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;

    fseek(f, 0, SEEK_END);
    long sz = ftell(f);              // long, not size_t - C legacy
    fseek(f, 0, SEEK_SET);
    if (sz < 0) { fclose(f); return NULL; }

    uint8_t *buf = malloc((size_t)sz + 1);   // +1 for optional NUL
    if (!buf) { fclose(f); return NULL; }

    size_t got = fread(buf, 1, (size_t)sz, f);
    fclose(f);
    if (got != (size_t)sz) { free(buf); return NULL; }

    buf[got] = '\0';                 // makes text usable as a C string
    *out_len = got;
    return buf;
}
```

::: warn
`fseek`/`ftell` can fail or report garbage on pipes, sockets, character devices, and very large files (>2 GB on 32-bit `long`). For real production code, prefer `stat()` for size or read in chunks until `fread` returns 0.
:::

### Writing

```c
FILE *f = fopen("out.bin", "wb");
if (!f) return -1;

const uint8_t data[] = { 0xDE, 0xAD, 0xBE, 0xEF };
size_t w = fwrite(data, 1, sizeof(data), f);
if (w != sizeof(data)) { /* short write - disk full? */ }

fflush(f);                          // flush user-space buffer to OS
// fsync(fileno(f));                  // POSIX: flush OS buffer to disk
fclose(f);
```

### Line-oriented text

```c
FILE *f = fopen("log.txt", "r");
char  line[512];
while (fgets(line, sizeof(line), f)) {
    // fgets keeps the trailing \n if one fit; strip it if needed
    size_t len = strlen(line);
    if (len && line[len-1] == '\n') line[len-1] = '\0';
    // process line
}
fclose(f);
```

::: warn
Never use `gets()`. It cannot bound its read and was removed from the language. `fgets(buf, sizeof(buf), f)` is the safe replacement.
:::

### Memory-mapped files (POSIX)

```c
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

int   fd = open("big.bin", O_RDONLY);
struct stat st;
fstat(fd, &st);

const uint8_t *data = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
close(fd);                          // mmap keeps its own reference

// access data[0..st.st_size-1] like a normal byte array
// no read syscalls - the OS pages in on demand

munmap((void*)data, st.st_size);
```

::: tip
For read-mostly large files (assets, datasets, tokenizers), `mmap` is faster and uses less RAM than reading: pages load on access and the OS reuses them across processes. For small files or sequential streaming, `fread` is simpler with no measurable cost.
:::

### Errors and `errno`

```c
#include <errno.h>
#include <string.h>

FILE *f = fopen(path, "r");
if (!f) {
    fprintf(stderr, "open %s: %s\n", path, strerror(errno));
    return -1;
}
```

::: rule
`errno` is only meaningful immediately after a libc call has failed. Reading it later (after a `printf`, even) gives stale data. Capture into a local variable on the failure path.
:::

### Practice

Write `uint8_t *slurp(const char *path, size_t *out_len)` that reads a whole file into a malloc'd buffer (caller frees). Use it to count lines in a 10 MB log file. Verify against `wc -l`.

---

## 20 Bit Manipulation {#bits}

::: tldr
Five idioms cover the 80%: SET (`|=`), CLEAR (`&= ~`), TOGGLE (`^=`), TEST (`&`), ASSIGN. Always use unsigned types - signed shifts and overflow are UB.
:::

Bits are how computers really store everything. C exposes them directly. Bit manipulation is unavoidable for flag sets, packed formats, hardware registers, fast lookup tables, hash mixers, and protocol headers.

### The operators

| Op | Meaning | Example (8-bit) |
|---|---|---|
| `&` | AND | `0b1100 & 0b1010 = 0b1000` |
| `\|` | OR | `0b1100 \| 0b1010 = 0b1110` |
| `^` | XOR | `0b1100 ^ 0b1010 = 0b0110` |
| `~` | NOT | `~0b1100 = 0b...0011` |
| `<<` | shift left (zero-fill) | `1 << 3 = 0b1000` |
| `>>` | shift right (signed: arithmetic; unsigned: logical) | `0b1000 >> 2 = 0b0010` |

### The five idioms you actually use

```c
uint32_t x = 0;
uint32_t bit = 1u << 5;        // pick which bit (5 = position)

x |=  bit;                       // SET
x &= ~bit;                       // CLEAR
x ^=  bit;                       // TOGGLE
if (x & bit) { /* set */ }       // TEST

x = (x & ~bit) | (val ? bit : 0);  // ASSIGN to value of `val`
```

::: rule
Always use **unsigned** for bit work. Signed shifts of negative values are implementation-defined; signed overflow is UB. `uint32_t`, `uint64_t`, `uintptr_t` are your friends here.
:::

### Masks and packing

```c
// Pack r,g,b,a into a single 32-bit word
uint32_t rgba = ((uint32_t)r << 24)
              | ((uint32_t)g << 16)
              | ((uint32_t)b <<  8)
              | ((uint32_t)a);

// Unpack
uint8_t rr = (rgba >> 24) & 0xFF;
uint8_t gg = (rgba >> 16) & 0xFF;
uint8_t bb = (rgba >>  8) & 0xFF;
uint8_t aa =  rgba        & 0xFF;
```

::: tip
Cast to the wide type *before* shifting. `r << 24` shifts a `uint8_t`, which has been promoted to `int`; on a 32-bit `int` platform with `r >= 0x80` this becomes signed-overflow UB. `(uint32_t)r << 24` is always safe.
:::

### Power-of-two tricks

```c
// Is x a power of two? (also true for 0 - usually want to exclude)
int is_pow2(uint64_t x) { return x && !(x & (x - 1)); }

// Round up to next power of two (x must be > 0 and fit)
uint64_t next_pow2(uint64_t x) {
    x--;
    x |= x >>  1; x |= x >>  2; x |= x >>  4;
    x |= x >>  8; x |= x >> 16; x |= x >> 32;
    return x + 1;
}

// Modulo by a power-of-two: cheap mask, no division
uint64_t idx = hash & (cap - 1);    // only correct when cap is a power of 2

// Align UP to power-of-two boundary
uintptr_t aligned = (addr + (align - 1)) & ~(align - 1);
```

### Builtins (gcc / clang)

```c
__builtin_popcountll(x);   // number of 1 bits
__builtin_clzll(x);         // count leading zeros (UB for x==0!)
__builtin_ctzll(x);         // count trailing zeros (UB for x==0!)
__builtin_bswap64(x);       // byte-reverse (endian flip)
```

C23 standardizes these as `stdc_popcount`, `stdc_leading_zeros`, etc., in `<stdbit.h>`. Until C23 lands everywhere, the `__builtin_` versions are the portable-enough form for gcc and clang.

### Endianness

```c
// Read a big-endian (network order) 32-bit value safely - no aliasing tricks
uint32_t read_be32(const uint8_t *p) {
    return ((uint32_t)p[0] << 24)
         | ((uint32_t)p[1] << 16)
         | ((uint32_t)p[2] <<  8)
         | ((uint32_t)p[3]);
}
```

::: warn
Do not `memcpy` a `uint32_t` from a buffer and assume host order matches file/network order. Always parse byte-by-byte (above) or use explicit byte-swap. Both x86 and ARM default to little-endian today, but disk formats and protocols are often big-endian.
:::

::: rule
Bit fields (`uint32_t flags : 4;` inside structs) are tempting for protocol headers but their layout is implementation-defined - bit order, padding, signedness all vary. Do the masking by hand for portability.
:::

### Practice

Write `set_bit`, `clear_bit`, `toggle_bit`, `test_bit` for `uint32_t`. Then write `pack_rgba(r,g,b,a) -> uint32_t` and `unpack_rgba(u, *r,*g,*b,*a)`. Round-trip 5 random pixels and assert equality.

---

## 21 Standard Library Survival Kit {#stdlib data-toc="Standard Library Kit"}

::: tldr
Small but uneven. Five headers cover 90%: `stdint`, `stddef`, `stdbool`, `string`, `stdio`. Use `snprintf`/`fgets`/`strtol`; avoid `sprintf`/`gets`/`atoi`.
:::

The C standard library is small but uneven. Some functions are essential, some are obsolete, a few are actively dangerous. This is a per-header guide to what's worth using.

### `<stdio.h>` - I/O

| Use | Avoid | Why |
|---|---|---|
| `printf` / `fprintf` | - | Always with `-Wformat=2`. |
| `snprintf` | `sprintf` | `sprintf` cannot bound its output - classic buffer overflow. |
| `fgets` | `gets` | `gets` was removed from C11 - it cannot be made safe. |
| `fopen` / `fread` / `fwrite` / `fclose` | - | The 80% file API. |
| `perror` / `strerror(errno)` | - | Human-readable error from libc. |

### `<stdlib.h>` - allocation, conversion, exit

| Use | Avoid | Why |
|---|---|---|
| `malloc` / `calloc` / `realloc` / `free` | - | Always check the return. |
| `strtol` / `strtoll` / `strtod` | `atoi` / `atof` | `atoi` has no error reporting and silently treats junk as `0`. |
| `qsort` / `bsearch` | - | Slow but portable; for hot loops, write your own. |
| `exit` / `EXIT_SUCCESS` / `EXIT_FAILURE` | `abort` in production | `abort` skips destructors / atexit handlers. |
| `getenv` | - | Read-only env access; do not modify. |

### `<string.h>` - bytes and C strings

| Use | Avoid | Why |
|---|---|---|
| `memcpy` / `memmove` / `memset` / `memcmp` | - | Foundational. `memmove` for overlapping regions. |
| `strlen` / `strcmp` / `strchr` / `strstr` | - | Read-only string ops, well behaved. |
| `snprintf` | `strcpy` / `strcat` / `strncpy` | `strncpy` does NOT NUL-terminate on truncation. |
| `strerror` | `strerror_r` portably | `strerror_r` has two incompatible signatures across platforms. |

::: warn
`strncpy` looks safe but is not a string function: it is a fixed-width field copier. If `src` is longer than `n` there is no NUL terminator; if `src` is shorter, the entire remaining buffer is filled with NULs. Use `snprintf(dst, n, "%s", src)` instead.
:::

### `<math.h>`

`sqrt`, `sin`, `cos`, `fabs`, `floor`, `ceil`, `pow`, `fmod`. Plus `INFINITY`, `NAN`, `M_PI` (POSIX). Add `-lm` to the link line on Linux.

```c
double r = sqrt(x);
if (isnan(r) || isinf(r)) { /* handle bad input */ }
```

### `<time.h>`

| Use | Why |
|---|---|
| `clock_gettime(CLOCK_MONOTONIC, &ts)` | Wall-clock-immune timing for benchmarks. |
| `time(NULL)` | Seconds since epoch. Cheap timestamps. |
| `strftime` | Format a struct tm into a string. |

```c
struct timespec a, b;
clock_gettime(CLOCK_MONOTONIC, &a);
work();
clock_gettime(CLOCK_MONOTONIC, &b);
double ms = (b.tv_sec - a.tv_sec) * 1e3
          + (b.tv_nsec - a.tv_nsec) / 1e6;
```

::: warn
`clock()` measures CPU time, not wall time. It is rarely what you want for benchmarks. `time()` has 1-second resolution. `clock_gettime(CLOCK_MONOTONIC, ...)` is the right answer 95% of the time.
:::

### `<ctype.h>` - single-byte character predicates

`isspace`, `isdigit`, `isalpha`, `isalnum`, `tolower`, `toupper`. All take an `int`; pass `(unsigned char)c`, never a raw `char`:

```c
if (isspace((unsigned char)c)) { /* ... */ }   // avoid sign-extension UB
```

### `<errno.h>`

Just `errno` + the `E*` error codes. Use `strerror(errno)` for messages. See File I/O for usage rules.

### What to skip

- `setjmp` / `longjmp` - non-local goto, bypasses cleanup, almost never the right answer
- `signal()` - older, less reliable than POSIX `sigaction`
- `rand` / `srand` - low quality; use a real PRNG (xoshiro, PCG, etc.)
- `tmpnam` / `mktemp` - race conditions; use `mkstemp` instead
- Wide-char functions (`wcsxxx`, `mbstowcs`) unless you know you need them

::: rule
Five headers cover 90% of real C code: `stdint.h`, `stddef.h`, `stdbool.h`, `string.h`, `stdio.h`. Pull in `stdlib.h` when you allocate, `math.h` when you compute, `time.h` when you measure.
:::

### Practice

Take a string `"  -42abc"`. Parse it with `strtol`, check `endptr` and `errno` to detect partial-parse and overflow. Print the parsed number, the remaining string, and an OK/error verdict.

---

## 22 main / argv / signals {#mainargv}

::: tldr
Two valid `main` signatures. `argv[argc]` is `NULL` (you can iterate without `argc`). Exit code 0 = success, 1-255 = failure. Signal handlers only set `volatile sig_atomic_t` flags.
:::

Every C program starts at `main`. The OS hands you arguments, an environment, and a way to send the program signals. This section is the survival kit for entry points.

### The two valid signatures

```c
int main(void);                              // no args needed
int main(int argc, char **argv);             // or argv[]

// Some platforms also accept env as a third arg, but it is non-standard:
// int main(int argc, char **argv, char **envp);
```

`argv[0]` is the program name (often the path used to invoke). `argv[argc]` is guaranteed to be `NULL` - you can iterate without a counter.

```c
int main(int argc, char **argv) {
    for (int i = 1; i < argc; i++) {
        printf("arg %d: %s\n", i, argv[i]);
    }
    return EXIT_SUCCESS;   // 0 = ok, non-zero = failure
}
```

### Exit codes

- `0` / `EXIT_SUCCESS` - success
- `1` / `EXIT_FAILURE` - generic failure
- `2` - usage error (convention used by many CLI tools)
- `64-78` - `sysexits.h` conventions on BSD/macOS
- Shells truncate to 8 bits - exit codes 0-255 are portable; outside is platform-defined

### Argument parsing - hand rolled

```c
typedef struct {
    const char *input;
    int32_t     workers;
    bool        verbose;
} Args;

bool parse_args(int argc, char **argv, Args *out) {
    *out = (Args){ .workers = 1 };
    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        if      (strcmp(a, "-v") == 0) out->verbose = true;
        else if (strcmp(a, "-w") == 0 && i + 1 < argc)
            out->workers = atoi(argv[++i]);     // strtol in real code
        else if (a[0] != '-') out->input = a;
        else    return false;
    }
    return out->input != NULL;
}
```

::: tip
For anything more complex than a flag and a path, use `getopt` (POSIX) or vendor a small parser. Hand-rolled is fine until you need `--long` options or argument bundling like `-vvv`.
:::

### `getopt` - the POSIX standard

```c
#include <unistd.h>

int opt;
while ((opt = getopt(argc, argv, "vw:o:")) != -1) {
    switch (opt) {
    case 'v': verbose = true;             break;
    case 'w': workers = atoi(optarg);     break;     // "w:" means takes arg
    case 'o': output  = optarg;            break;
    default: return 2;                    // usage error
    }
}
// argv[optind .. argc-1] are the positional args
```

### Environment variables

```c
const char *home = getenv("HOME");   // NULL if unset
if (!home) home = "/tmp";
```

::: warn
`getenv` returns a pointer into a process-wide buffer. Do not free it. Do not assume it survives a `setenv` call. If you need it long-term, copy the string.
:::

### Signals (the 80%)

```c
#include <signal.h>

static volatile sig_atomic_t g_stop = 0;

static void on_sigint(int sig) {
    (void)sig;
    g_stop = 1;        // only async-signal-safe ops allowed here
}

int main(void) {
    signal(SIGINT,  on_sigint);
    signal(SIGTERM, on_sigint);

    while (!g_stop) {
        // main loop - polls flag
    }
    return EXIT_SUCCESS;
}
```

::: rule
Inside a signal handler you may only set `volatile sig_atomic_t` flags and call a tiny set of "async-signal-safe" functions. `printf`, `malloc`, `fprintf` are not safe. The portable design is "set a flag, return; the main loop checks it".
:::

### The signals you'll meet

| Signal | When | Default |
|---|---|---|
| `SIGINT` | Ctrl-C | Terminate |
| `SIGTERM` | `kill pid` from a script | Terminate |
| `SIGSEGV` | Bad memory access | Core dump |
| `SIGABRT` | From `abort()` / failed assert | Core dump |
| `SIGPIPE` | Write to a closed pipe / socket | Terminate |
| `SIGKILL` | `kill -9` | Terminate (uncatchable) |

::: tip
Long-running daemons usually catch `SIGINT`+`SIGTERM` for clean shutdown and ignore `SIGPIPE` (set the disposition to `SIG_IGN`) so a closed connection returns `EPIPE` from `write()` instead of killing the process.
:::

### Practice

Write a tiny `cat` that takes filenames in argv and prints each file's contents. Install a `SIGINT` handler that sets a `volatile sig_atomic_t stop = 1` flag; check it between files and break out cleanly with `"got SIGINT, exiting\n"`.

---

## 23 Concurrency Primer {#concurrency}

::: tldr
Spawn threads with `pthread_create`, join with `pthread_join`. Protect shared state with a mutex, use atomics for flags and counters. Build with `-fsanitize=thread`.
:::

Threads let independent work run on independent cores. The C11 standard provides `<threads.h>`; in practice most code targets POSIX `pthread.h` on Linux/macOS and Win32 threads on Windows. The 80% you need is: spawn a thread, join it, protect shared state with a mutex, communicate small flags with atomics.

### POSIX threads (the de-facto standard)

```c
#include <pthread.h>

static void *worker(void *arg) {
    int32_t id = *(int32_t*)arg;
    printf("hello from %d\n", id);
    return NULL;       // or any void* you want join() to receive
}

int main(void) {
    enum { N = 4 };
    pthread_t th[N];
    int32_t   ids[N];

    for (int32_t i = 0; i < N; i++) {
        ids[i] = i;
        pthread_create(&th[i], NULL, worker, &ids[i]);
    }
    for (int32_t i = 0; i < N; i++) {
        pthread_join(th[i], NULL);
    }
}
// link with -lpthread (Linux); built-in on macOS
```

::: warn
Each thread argument must be valid for the lifetime of the thread. Passing `&i` from a loop counter to multiple threads is a classic bug - by the time the thread reads `i`, it has been incremented. Pass distinct addresses (`&ids[i]`) or copy by value into a small struct per thread.
:::

### Mutex - protect shared state

```c
static pthread_mutex_t g_mu = PTHREAD_MUTEX_INITIALIZER;
static int64_t          g_total = 0;

static void *add_some(void *arg) {
    for (int i = 0; i < 10000; i++) {
        pthread_mutex_lock(&g_mu);
        g_total += 1;
        pthread_mutex_unlock(&g_mu);
    }
    (void)arg; return NULL;
}
```

::: rule
Lock the smallest possible region. Hold a mutex while computing a slow result and you have serialized your program. Compute first, lock just to publish the result.
:::

### Atomics (C11) - lock-free flags and counters

```c
#include <stdatomic.h>

static atomic_int g_running = 1;

while (atomic_load(&g_running)) {
    // hot loop reads the flag
}

// Another thread:
atomic_store(&g_running, 0);

// Atomic counters
static atomic_uint64 g_count = 0;
atomic_fetch_add(&g_count, 1);   // returns previous value
```

Atomics give you small thread-safe values without the overhead of a mutex. They are the right tool for "running" flags, reference counts, ID generators, and similar shared scalars.

::: warn
Atomic does *not* mean "thread-safe by magic". Atomics protect a single load/store; correctness still depends on getting the algorithm right. `v++` on a non-atomic shared int is a data race even if you "expect it to be fast enough" - data races are undefined behaviour.
:::

### Memory order, briefly

`atomic_load(p)` defaults to `memory_order_seq_cst` - the strongest, most expensive ordering. It is also the only ordering you should use until you have benchmarked, profiled, and decided the lock-free pattern is worth the complexity.

::: rule
Default to mutexes for shared state, `memory_order_seq_cst` atomics for shared flags and counters, and message passing (one writer per queue) for everything else. Lock-free queues, RCU, hazard pointers, weakly ordered atomics - all real, all out of scope for the 80%.
:::

### Thread-local storage

```c
// C11 keyword - per-thread copy of the variable
static _Thread_local char g_buf[256];   // or `thread_local` from <threads.h>
```

Useful for per-thread scratch buffers, RNG state, profiling counters - anything you want zero-contention access to.

### Common bugs

- **Data race**: two threads access the same memory, one writes, no synchronization. UB. Use a mutex or atomic.
- **Deadlock**: A locks `x`, B locks `y`, A waits on `y`, B waits on `x`. Always lock multiple mutexes in a fixed global order.
- **Forgot to join**: returning from `main` with non-detached threads still running is UB. `pthread_join` all of them or call `pthread_detach` if you don't care about the result.
- **Stack-passed pointers**: passing `&local` to a thread that outlives the function is a use-after-return.

::: tip
Build threaded code with `-fsanitize=thread` (ThreadSanitizer). It instruments every load and store and reports data races at runtime with both stacks. Like ASan for memory bugs, but for races - completely worth the slowdown during development.
:::

### Practice

Spawn 4 threads each incrementing a shared `int64_t total` 250,000 times (target: 1,000,000). Run once unprotected under `-fsanitize=thread` (TSan reports a data race), then with a `pthread_mutex_t` (clean run, total == 1,000,000).

---

## 24 Testing {#testing}

::: tldr
A C test binary returns 0 on pass, non-zero on fail. `assert.h` plus sanitizers covers 80%. Add a 40-line test helper (`EXPECT_EQ`/`RUN`/`REPORT`) before reaching for any framework.
:::

C has no built-in test framework. The good news is you don't need one for the 80%: a single `tests.c` file plus `assert.h` plus the sanitizers from §02 covers most of what you actually want. Frameworks like CMocka, Unity, and Criterion exist for the remaining 20%.

### The minimum viable test

```c
// tests.c
#include <assert.h>
#include <stdio.h>
#include "mylib.h"

static void test_add(void) {
    assert(add(2, 3) == 5);
    assert(add(-1, 1) == 0);
    assert(add(0, 0) == 0);
}

static void test_strings(void) {
    assert(strcmp("hi", "hi") == 0);
    assert(strcmp("a",  "b")  < 0);
}

int main(void) {
    test_add();
    test_strings();
    printf("all tests passed\n");
    return 0;
}
```

Build it with the same flags as production plus the sanitizers:

```bash
clang -std=c99 -g -O0 -Wall -Wextra -Werror \
      -fsanitize=address,undefined \
      tests.c mylib.c -o tests
./tests   # exits 0 on success, non-zero on failure
```

::: rule
A C test binary is just a program that returns `0` on success and non-zero on failure. There is nothing to install. `make test` is "build it and run it" - any CI knows how to handle that.
:::

### A small in-house test runner

```c
// test_helper.h - drop in any project
#pragma once
#include <stdio.h>
#include <stdlib.h>

static int32_t g_pass = 0, g_fail = 0;

#define EXPECT(cond) do {                                       \
    if (cond) g_pass++;                                         \
    else { g_fail++; fprintf(stderr,                            \
        "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); }       \
} while (0)

#define EXPECT_EQ(a, b) EXPECT((a) == (b))
#define EXPECT_NE(a, b) EXPECT((a) != (b))
#define EXPECT_STR_EQ(a, b) EXPECT(strcmp((a), (b)) == 0)

#define RUN(name) do { fprintf(stderr, "running %s\n", #name); name(); } while (0)

#define REPORT() do {                                           \
    fprintf(stderr, "%d passed, %d failed\n", g_pass, g_fail);  \
    return g_fail ? 1 : 0;                                      \
} while (0)
```

```c
// tests.c
#include "test_helper.h"
#include "mylib.h"

static void test_add(void) {
    EXPECT_EQ(add(2, 3), 5);
    EXPECT_EQ(add(-1, 1), 0);
}

int main(void) {
    RUN(test_add);
    REPORT();
}
```

Forty lines of header gives you per-line failure reporting, a pass/fail summary, and a sensible exit code. No dependency, no install, no framework lock-in.

### Sanitizers ARE the test suite

For pure-C code, the most valuable test is "did anything trip ASan or UBSan?" A test that exercises a code path under sanitizers catches:

- Heap and stack out-of-bounds reads/writes
- Use-after-free, double-free, leaks (ASan)
- Signed overflow, shift overflow, alignment violations (UBSan)
- NULL pointer dereferences in instrumented code

::: rule
Run your test binary under `ASAN_OPTIONS=detect_leaks=1 UBSAN_OPTIONS=halt_on_error=1 ./tests`. A passing test under sanitizers is dramatically stronger than the same test run on a plain release build.
:::

### `assert` in production code

```c
#include <assert.h>

void draw_pixel(Image *img, int32_t x, int32_t y) {
    assert(img != NULL);
    assert(x >= 0 && x < img->w);
    assert(y >= 0 && y < img->h);
    // ... safe to access
}
```

`assert` aborts the program on failure with a useful message and stack. In release builds (`-DNDEBUG`) it disappears entirely - zero cost. Sprinkle it through any function that has invariants. Tests are how you make sure asserts don't fire on real input.

::: warn
An `assert` with a side effect disappears in release: `assert(do_thing() == 0)` stops calling `do_thing`. Always put pure expressions inside `assert`.
:::

### Property-based / fuzz testing

Property tests assert relationships rather than exact outputs ("for any input, parsing then serializing returns the original"). Fuzzers automate finding inputs that violate those properties.

```c
// fuzz_target.c - libFuzzer entry point (clang -fsanitize=fuzzer,address)
#include <stdint.h>
#include <stddef.h>

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    // Feed `data` into the parser. Return 0 if the input was processed
    // (whether successfully or with a graceful error). Crashes / sanitizer
    // trips are reported by the harness.
    parse_protocol(data, size);
    return 0;
}
```

Build and run:

```bash
clang -g -fsanitize=fuzzer,address,undefined fuzz_target.c parser.c -o fuzz
./fuzz -max_total_time=60     # run for 60 seconds
```

The fuzzer generates random inputs, observes coverage, and minimizes any crashing input it finds into a single byte file you can replay deterministically. For network parsers, file format readers, anything that ingests untrusted input - this is the highest-leverage testing you can write. See [Pattern: Fuzz Harness](#fuzz).

### Snapshot / golden tests

For functions whose output is awkward to spell out (formatted strings, generated tables, layout coordinates), write a "golden" file with the expected output and have the test diff against it.

```c
char *render(const Doc *d);                // returns malloc'd string
static void test_render_golden(void) {
    Doc d  = make_doc();
    char *got = render(&d);
    char *want;
    size_t n;
    want = (char*)slurp("testdata/render.golden", &n);
    EXPECT_STR_EQ(got, want);
    free(got); free(want);
}
```

::: tip
Run the test once with `UPDATE=1` to write the file, then commit it. Subsequent runs diff against the committed version. Cheap and surprisingly effective for parsers and formatters.
:::

### What about test frameworks?

| Framework | Headline |
|---|---|
| None (asserts + a runner) | What this section showed. Zero deps. Best for < 10k LOC. |
| Unity | Header + one .c file. Embedded-friendly. Discovers tests from naming. |
| CMocka | Mocking, setup/teardown, stack-trace on fail. Heavier dep. |
| Criterion | Auto test discovery, parallel execution, isolated processes. Linux/macOS. |
| greatest / utest.h | Single-header, drop in. Tiny. |

::: rule
Start with hand-rolled tests. Add a framework only when you outgrow them. The first thing you outgrow is "I want test isolation so a crashing test doesn't kill the rest" - at that point Criterion or running each test as its own binary is the answer.
:::

### Hooking into `make` / CMake

```makefile
# Makefile
test: tests
	./tests

tests: tests.c mylib.c
	$(CC) -std=c99 -g -O0 -Wall -Wextra -Werror \
	    -fsanitize=address,undefined \
	    $^ -o $@
```

```cmake
# CMakeLists.txt
add_executable(tests tests.c mylib.c)
target_compile_options(tests PRIVATE -fsanitize=address,undefined)
target_link_options(tests PRIVATE -fsanitize=address,undefined)
add_test(NAME unit COMMAND tests)
```

CTest then runs the binary as part of `ctest` and surfaces non-zero exit codes as failures. That is enough to plug into any CI.

### Practice

Add `tests.c` to your project asserting 5 invariants of one existing function. Build under `-fsanitize=address,undefined -Wall -Werror`. Run, see all-pass. Then break one assertion on purpose, confirm the binary exits non-zero and the failing line is printed.

---

## 25 Common Rookie Traps {#traps data-toc="Rookie Traps"}

::: tldr
90% of "weird C bugs" are on this list. If your code misbehaves, scan here first.
:::

### sizeof on a decayed array

```c
void bad(int arr[]) {
    size_t n = sizeof(arr) / sizeof(arr[0]);  // WRONG: sizeof(int*)/sizeof(int)
}
void good(int *arr, size_t n) { /* take length */ }
```

### String literals are read-only

```c
char *s = "hello";
s[0] = 'H';            // SEGFAULT: writes to .rodata

char a[] = "hello";    // OK: a is a char[6] on the stack, mutable
a[0] = 'H';
```

### Comparing strings with ==

```c
if (s == "hello")              // compares pointers, NOT contents
if (strcmp(s, "hello") == 0)   // correct
```

### gets and scanf("%s", ...)

```c
char buf[16];
gets(buf);                      // GONE FROM C11. Don't even mention it.
scanf("%s", buf);               // unbounded - same problem
fgets(buf, sizeof buf, stdin);  // bounded - correct
```

### Off-by-one on the null terminator

```c
char buf[5];
strcpy(buf, "hello");   // 6 bytes (5 + '\0') into 5 - corrupts the stack
```

### Integer overflow in size math

```c
size_t n = user_input;
char *p = malloc(n * 32);   // wraps to small if n is huge - tiny alloc, huge memcpy
```

### Signed/unsigned compare

```c
size_t len = ...;
for (int i = 0; i < len; i++) { ... }       // i signed, len unsigned - warning
for (size_t i = 0; i < len; i++) { ... }    // correct
```

### Returning a pointer to a local

```c
char *make_msg(int x) {
    char buf[64];
    snprintf(buf, sizeof buf, "%d", x);
    return buf;        // UB: buf dies when function returns
}
```

### Using == with floats

```c
if (a == b) { ... }                    // brittle
if (fabs(a - b) < 1e-9) { ... }        // tolerance-based
```

### Forgetting `void` in zero-arg declarations

```c
int f();         // historic: "any args, unchecked"
int f(void);     // explicit: "no args" - prefer this
```

### Macro arg evaluated twice

```c
#define MAX(a, b) ((a) > (b) ? (a) : (b))
int x = MAX(i++, j);    // i++ evaluated twice when i > j - bug
```

Use a `static inline` function instead.

### Free + reuse

```c
free(p);
p->next = NULL;        // use after free - UB
free(p);               // double free - UB
```

Always: `free(p); p = NULL;`.

### Unchecked malloc

```c
char *buf = malloc(n);
buf[0] = 'x';      // segfault if n was huge or system was OOM
```

### printf format mismatch

```c
size_t n = 5;
printf("%d\n", n);     // %d expects int; size_t is usually larger - UB
printf("%zu\n", n);    // correct
```

### Returning -1 from an unsigned

```c
size_t find(const char *s, char c) {
    for (size_t i = 0; s[i]; i++) if (s[i] == c) return i;
    return -1;     // becomes SIZE_MAX - caller's `< n` check accidentally passes
}
```

Use a sentinel (`SIZE_MAX`) explicitly, or return `(bool found, size_t out)` as a struct.

### Practice

Open any 1000+ line C file from an open-source project (e.g., SQLite `shell.c`, Redis `networking.c`). Scan for at least 3 of the 15 patterns above (sizeof on a parameter, signed/unsigned compare, unchecked malloc, format mismatch, returning -1 from unsigned). Note file:line for each find.

---

## 26 Undefined Behavior Catalog {#ub data-toc="Undefined Behavior"}

::: tldr
UB = the standard imposes no requirement; the compiler may delete your code. Sanitizers catch most runtime UB; warnings catch most compile-time UB. Use unsigned for wrap, `memcpy` for type pun, initialize all variables.
:::

Undefined behaviour (UB) is the C standard's term for "anything can happen, including looking like it works". The compiler is allowed to assume your code never triggers UB and optimize on that basis. This is the source of the "but it worked on my machine" class of bugs. Knowing the common UB shapes lets you spot them before the optimizer punishes you.

### Signed integer overflow

```c
int32_t a = INT32_MAX;
int32_t b = a + 1;          // UB: signed overflow

// Compiler may assume a + 1 > a always - which deletes overflow checks like:
if (a + 1 < a) { /* overflowed */ }    // dead code at -O2
```

::: rule
Use **unsigned** integer types when you want defined wrap-around. Unsigned overflow is fully defined: it wraps modulo 2^N. Signed overflow is UB. The compiler exploits this difference for optimizations.
:::

### Strict aliasing

```c
float     f = 3.14f;
uint32_t *p = (uint32_t*)&f;     // UB: pointer to one type, accessed as another
uint32_t  bits = *p;             // undefined

// Defined alternative:
uint32_t bits;
memcpy(&bits, &f, sizeof(bits));    // optimizes to a register move
```

Two pointers of unrelated types may not legally read or write the same object. The compiler relies on this to keep things in registers across function calls. `memcpy` is the escape hatch and it generates the same machine code at any optimization level.

::: warn
The exception: `char*`, `signed char*`, `unsigned char*` may alias anything. That is why `memcpy` is implemented in terms of `unsigned char*` and is safe.
:::

### NULL dereference

```c
int32_t *p = NULL;
int32_t  v = *p;                // UB - usually segfault on modern OSes

// More subtle: dereference happens BEFORE the if-check
int32_t v2 = p->x;
if (p) { /* useless check - the deref already happened */ }
// At -O2, gcc may delete the if-check entirely. Yes really.
```

::: rule
Once the compiler proves a pointer is dereferenced, it assumes the pointer is non-NULL afterwards and may eliminate later NULL checks as dead code. Always check *before* the deref.
:::

### Out-of-bounds access

```c
int32_t arr[4];
arr[4] = 99;          // UB: one past the end
arr[-1] = 99;         // UB: before the start

// Even taking the address is UB beyond one past the end:
int32_t *p = &arr[5];   // UB: arr+4 is OK, arr+5 is not
```

### Use after free / use after scope

```c
int32_t *leak(void) {
    int32_t local = 42;
    return &local;            // UB: returning address of automatic var
}

void *p = malloc(100);
free(p);
memcpy(p, src, 10);          // UB: p is no longer a valid pointer
```

::: tip
Set freed pointers to `NULL` as a habit. The next use becomes a clean NULL deref (segfault) instead of silent reuse of recycled memory.
:::

### Shifting too far / by negative

```c
uint32_t x = 1;
uint32_t y = x << 32;       // UB: shift by >= width of type
uint32_t z = x << -1;       // UB: negative shift
```

Shifting a 32-bit value by 32 or more bits is UB even though the obvious answer "0" feels right. ARM hardware actually does that; x86 silently masks the shift count. The C standard says: undefined.

### Reading uninitialized memory

```c
int32_t x;            // indeterminate value
if (x) { /* UB: reading x before any write */ }

// Designated init or memset to zero:
int32_t y = 0;
struct Big b = {0};   // zeroes everything, including padding
```

### Sequencing and side effects

```c
int32_t i = 0;
int32_t arr[] = { i++, i++, i++ };   // UB: order between i++s undefined

int32_t j = 0;
printf("%d %d\n", j++, j);          // UB: j read and j++ unsequenced

int32_t k = 0;
k = k++ + 1;                          // UB: two writes, no sequencing
```

::: rule
If the same scalar is read and written, or written twice, in the same expression with no sequence point between them, it is UB. Split into separate statements.
:::

### Misaligned access

```c
uint8_t buf[16] = {0};
uint32_t *p = (uint32_t*)(buf + 1);   // likely misaligned
uint32_t v = *p;                       // UB on architectures requiring alignment

// Use memcpy from any byte offset
uint32_t v2;
memcpy(&v2, buf + 1, sizeof(v2));      // always defined
```

x86 tolerates misaligned scalar loads (with a slight perf hit). ARM, MIPS, RISC-V and others may trap. Even on x86, vector instructions require alignment. `memcpy` handles arbitrary alignment portably.

### Undefined and implementation-defined are different

- **Implementation-defined**: behaviour is consistent on a platform but varies across platforms (e.g., right-shift of negative integers). Document and isolate it.
- **Unspecified**: behaviour comes from a fixed set, but the spec doesn't pick (e.g., evaluation order of function arguments). Don't depend on it.
- **Undefined**: anything is allowed, including time travel. Avoid at all costs.

### Defenses, in order

1. **Run with sanitizers in dev.** `-fsanitize=address,undefined` catches the bulk: OOB, UAF, alignment, signed overflow, shifts, NULL deref.
2. **Enable warnings.** `-Wall -Wextra -Wpedantic -Werror`, plus `-Wstrict-aliasing`, `-Wnull-dereference`, `-Wshift-overflow`.
3. **Prefer unsigned for arithmetic that may wrap.** Use `memcpy` for type punning. Initialize all variables. Always check pointers before deref.
4. **Build production with `-D_FORTIFY_SOURCE=2`** for runtime libc bounds checks on the most common functions.
{.steps}

::: warn
Cross-link: most testing frameworks run their suites under sanitizers - see the [Testing](#testing) section. Sanitizers turn UB from "silently miscompiled" into "crashes at the bad line", which is exactly what tests want.
:::

### Practice

Write a program with three deliberate UBs: signed overflow (`INT32_MAX + 1`), shift overflow (`1u << 32`), and reading uninitialized memory. Compile with `-fsanitize=undefined`. Confirm UBSan reports each one with the exact line. Then fix all three.

---

## 27 CPU Performance Foundations {#cpuperf data-toc="CPU Performance"}

::: tldr
Cache line is 64 B. L1 ~3 cy, L2 ~20, L3 ~100, DRAM ~200-300. Pack data tight, do work in bulk, pre-compute, use multiple cores. The cache, not big-O, is your real bottleneck.
:::

A game frame, an HTTP request, an animation tick - these are real-time systems. Input plus state in, output out, within a deadline (16 ms for 60 fps). The CPU is the bottleneck more often than the GPU these days. Single-threaded performance has plateaued; slow CPU code stays slow on next year's hardware. The good news: 80% of CPU performance comes from a small set of mechanical habits.

### The kitchen analogy

Borrowed from Nic Barker's CPU performance talk. The mental model holds remarkably well.

| Kitchen | Computer |
|---|---|
| Chef | CPU core |
| Knives, pans, boards | Instructions |
| Ingredients | Data |
| Chopping board (only place work happens) | Registers |
| Box on the bench | L1 cache |
| Shelves | L2 cache |
| Storage room | L3 cache |
| Supermarket run | Main memory (DRAM) |
| Farm delivery | Disk / SSD |

### Cache hierarchy: the headline numbers

| Storage | Size | Latency (cycles) |
|---|---|---|
| Register | 8 B | 0 |
| L1 | ~64 KB | ~3 |
| L2 | ~2 MB | ~20 |
| L3 | ~32 MB | ~100 |
| DRAM | GB | 200-300 |
| SSD (random read) | TB | ~300,000 |

::: rule
Cache line = **64 bytes**. Every memory fetch brings 64 bytes whether you wanted them or not. Carmack's Quake-3 fast inverse square root saved 30 cycles per call. A single cache miss costs 200-300. One miss is 7-10x more expensive than the most famous optimization in game-dev history.
:::

Each core has its own L1 and L2. Single-core code throws away the rest. With 8 cores you have 8x the L1 you'd think.

### The four rules of thumb

1. **Pack data tight.** Smallest types that fit. Group fields by locality of use. Don't waste the cache line.
2. **Do work in bulk.** Functions take *arrays* of things, not one thing at a time. Amortize setup cost.
3. **Pre-compute at startup, not at runtime.** Why do you think it's called *baking*? Lighting, lookup tables, parsed configs, sorted indices. Anything stable before the frame loop should be ready at frame zero.
4. **Use multiple cores.** Independent streams of work, cheap join at the end. Avoid synchronization in the inner loops.
{.steps}

### The silent killer

When you access `enemy.hp`, the cache line you paid 200+ cycles for also contains the *next 60 bytes after `hp`*. Was that next 60 bytes useful? If yes, the next access is free. If no, you wasted the trip. This is invisible in source. Big-O notation does not capture it.

::: tip
When in doubt, lay out struct fields from largest to smallest. Compilers pack in declaration order; mis-ordering wastes bytes via alignment padding. Order matters.
:::

::: warn
An O(n) walk over a packed array beats an O(log n) traversal of a pointer-chained tree at most realistic sizes. The tree's pointers each cost a cache miss; the array streams in 64-byte gulps.
:::

### Practice

Build two versions of "sum field `x` from N=1,000,000 entities". Version A: array of structs (`{float x, y, z; int32_t id;}`, 16 B each). Version B: struct of arrays (separate `float xs[N]`). Time each with `clock_gettime(CLOCK_MONOTONIC, ...)`. Note the ratio - SoA should win by 2-4x.

---

## ★ Patterns {#patterns data-toc="Patterns (reference cards)"}

Reference cards, not lessons. Each pattern is a self-contained recipe for a recurring situation. Skim once for vocabulary; come back when you hit the situation.

:::: pattern Pattern | Unity Build (single translation unit) {#unity data-toc="Pattern: Unity Build"}
Classic C splits .h and .c, links objects, and people end up in "include hell". It's mostly convention, not language requirement. The single-translation-unit (or "unity") build sidesteps the whole mess.

Trick: `#include` every `.c` from `main.c`. One compilation unit. One `clang main.c -o app`. No build system needed for projects up to thousands of lines.

```c
// main.c
#include "math_utils.c"
#include "render.c"
#include "audio.c"

int main(void) {
    // ... use functions from any of the above ...
    return 0;
}
```

```bash
# Build the whole project
clang -std=c99 -Wall -Wextra -fsanitize=address main.c -o app
```

### Wins

- Compiler sees everything at once - whole-program optimization is automatic.
- No symbol-leak surprises across translation units.
- No need for separate header guards on every .c (each is included once).
- Build = one command. No Makefile, no CMake, no meson.

::: rule
Don't fight C's build model. Embrace one TU until it actually hurts (rare under ~50k lines). When you outgrow it, shard into a few TUs and a tiny script - by then you'll know exactly where the boundaries should fall.
:::
::::

:::: pattern Pattern | Arena Allocator {#arena data-toc="Pattern: Arena Allocator"}
The single most useful pattern in systems C. An arena (also called a bump allocator or linear allocator) is a block of memory you carve forward-only. **Free everything at once** by resetting the offset to 0. No fragmentation, no double-frees, no tracking individual lifetimes.

Use it for: per-frame data in games, per-request in servers, scratch memory for parsers, temp strings.

```c
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

typedef struct {
    uint8_t *data;
    size_t   pos;   // next free byte
    size_t   cap;   // total size
} Arena;

// Create an arena backed by a heap allocation
Arena arena_make(size_t cap) {
    return (Arena){ .data = malloc(cap), .cap = cap };
}

// Allocate n bytes, aligned to 'align' bytes (usually 8 or 16)
void *arena_alloc(Arena *a, size_t n, size_t align) {
    size_t pos  = (a->pos + align - 1) & ~(align - 1); // align up
    size_t next = pos + n;
    if (next > a->cap) return NULL;  // out of space
    a->pos = next;
    return a->data + pos;
}

// Convenience macro: alloc + zero + type-safe
#define ARENA_ALLOC(a, T)    ((T*)arena_alloc(a, sizeof(T),    _Alignof(T)))
#define ARENA_ALLOC_N(a,T,n) ((T*)arena_alloc(a, sizeof(T)*n,  _Alignof(T)))

// Free ALL at once - O(1), trivial
void arena_reset(Arena *a)   { a->pos = 0; }
void arena_destroy(Arena *a) { free(a->data); *a = (Arena){0}; }

// ── Usage ──────────────────────────────────────────────────────

typedef struct { float x, y; int32_t id; } Entity;

void game_frame(void) {
    Arena frame = arena_make(4 * 1024 * 1024);  // 4 MB scratch

    // Allocate as much as you want - no individual frees needed
    Entity  *player  = ARENA_ALLOC(&frame, Entity);
    Entity  *enemies = ARENA_ALLOC_N(&frame, Entity, 128);
    char    *buf     = ARENA_ALLOC_N(&frame, char, 4096);

    player->x = 100.0f;
    // ... do game work ...

    arena_destroy(&frame);  // one free, everything gone
}

// Or for permanent + per-frame arenas:
static Arena g_perm;    // program lifetime, never reset
static Arena g_frame;   // reset every frame
```

::: tip
Use two arenas: a **permanent** arena for the game's lifetime and a **scratch** arena you reset each frame. This eliminates almost all malloc/free bookkeeping.
:::
::::

:::: pattern Pattern | Stretchy Buffer / Dynamic Array {#dynarray data-toc="Pattern: Stretchy Buffer"}
The `std::vector` of C: an owned array that grows on demand. The trick: a small *header* with `len` and `cap` sits just before the data. The user holds a normal `T*`, indexes it like a regular array, and metadata is reachable via `(header*)ptr - 1`. Sean Barrett's `stb_ds.h` popularized this style.

```c
#include <stdlib.h>
#include <string.h>

typedef struct {
    size_t len;
    size_t cap;
    // data follows in memory
} DAHeader;

#define da_header(a)  ((DAHeader*)((char*)(a) - sizeof(DAHeader)))
#define da_len(a)     ((a) ? da_header(a)->len : (size_t)0)
#define da_cap(a)     ((a) ? da_header(a)->cap : (size_t)0)
#define da_free(a)    ((a) ? (free(da_header(a)), (a) = NULL) : 0)

#define da_push(a, v)                                                \
    ((a) = da__maybe_grow((a), sizeof(*(a))),                        \
     (a)[da_header(a)->len++] = (v))

static void *da__maybe_grow(void *a, size_t elem_size) {
    DAHeader *h = a ? da_header(a) : NULL;
    size_t    cap = h ? h->cap : 0;
    size_t    len = h ? h->len : 0;
    if (len + 1 <= cap) return a;

    size_t new_cap = cap ? cap * 2 : 8;
    h = realloc(h, sizeof(DAHeader) + new_cap * elem_size);
    h->cap = new_cap;
    h->len = len;
    return (char*)h + sizeof(DAHeader);
}
```

Usage feels like a real array:

```c
int32_t *nums = NULL;          // no malloc yet - NULL is the empty array

da_push(nums, 10);
da_push(nums, 20);
da_push(nums, 30);

for (size_t i = 0; i < da_len(nums); i++) {
    printf("%d\n", nums[i]);   // straight indexing
}

da_free(nums);                  // frees both header and data
```

### Wins

- User code reads like a normal C array - `nums[i]`, no wrapper struct
- Zero-cost when empty: a `NULL` pointer represents the empty buffer
- Geometric growth (cap *= 2) gives amortized O(1) push
- Single contiguous allocation for header + data: cache friendly, one `free`
- Type generic without templates: macros use `sizeof(*(a))`

::: warn
Macros evaluate `a` multiple times. `da_push(arr_for(idx++), val)` increments `idx` twice. Stick to side-effect-free pointer expressions inside the macros.
:::

### vs Slice

A [Slice](#slices) is a non-owning view (`{ptr, len}` by value, no growth). A stretchy buffer owns its memory and resizes. Pass slices around to functions that just *read*; pass the stretchy buffer pointer to functions that *append*.

::: tip
If you don't want the macro hygiene risk, write a per-type explicit struct: `struct U32Vec { uint32_t *data; size_t len, cap; }`. The header trick is clever; the explicit struct is boring and correct. For 80% of code, both are fine - pick the one that matches your team's taste.
:::
::::

:::: pattern Pattern | Typed Slices (Fat Pointers) {#slices data-toc="Pattern: Slices"}
A raw pointer tells you nothing about how many items it holds. Bundle the pointer with its length into a **slice**. Functions pass these by value - cheap, safe, self-describing.

```c
// Generic macro to define slice types
#define SLICE(T) struct { T *data; size_t len; }

typedef SLICE(int32_t) I32Slice;
typedef SLICE(float)   F32Slice;

typedef struct { float x, y; } Vec2;
typedef SLICE(Vec2) Vec2Slice;

// Allocate a slice from an arena
Vec2Slice make_positions(Arena *a, size_t count) {
    return (Vec2Slice){
        .data = ARENA_ALLOC_N(a, Vec2, count),
        .len  = count,
    };
}

// Iterate safely - no out-of-bounds by accident
void print_positions(Vec2Slice s) {
    for (size_t i = 0; i < s.len; i++) {
        printf("(%.2f, %.2f)\n", s.data[i].x, s.data[i].y);
    }
}

// Get a sub-slice - no copy, no alloc
Vec2Slice slice_range(Vec2Slice s, size_t start, size_t end) {
    return (Vec2Slice){ s.data + start, end - start };
}
```
::::

:::: pattern Pattern | Handle Arrays (Pool) {#handles data-toc="Pattern: Handle Arrays"}
Instead of pointers to heap-allocated objects (bad for cache, fragmentation, dangling pointers), store all objects in a flat array and hand out **integer handles**. Handles can be validated, versioned, and never dangle.

```c
#define MAX_ENTITIES 1024

typedef struct {
    float   x, y;
    float   speed;
    bool    active;
    uint32_t generation;  // version counter
} Entity;

typedef struct {
    uint32_t index;
    uint32_t generation;  // must match slot's generation
} EntityHandle;

static Entity   g_entities[MAX_ENTITIES];
static uint32_t g_count = 0;

EntityHandle entity_create(void) {
    for (uint32_t i = 0; i < MAX_ENTITIES; i++) {
        if (!g_entities[i].active) {
            g_entities[i].active = true;
            g_entities[i].generation++;
            return (EntityHandle){ i, g_entities[i].generation };
        }
    }
    return (EntityHandle){ 0, 0 }; // null handle
}

// Returns NULL if handle is stale or invalid
Entity *entity_get(EntityHandle h) {
    if (h.index >= MAX_ENTITIES) return NULL;
    Entity *e = &g_entities[h.index];
    if (!e->active || e->generation != h.generation) return NULL;
    return e;
}

void entity_destroy(EntityHandle h) {
    Entity *e = entity_get(h);
    if (e) { *e = (Entity){0}; }  // zero = inactive
}

// Update all - tight loop, cache-friendly
void entities_update(float dt) {
    for (int i = 0; i < MAX_ENTITIES; i++) {
        if (!g_entities[i].active) continue;
        g_entities[i].x += g_entities[i].speed * dt;
    }
}
```

::: tip
Iterating a flat array of structs is dramatically faster than following pointers to scattered heap objects. This is the core of data-oriented design.
:::
::::

:::: pattern Pattern | Hash Map (open addressing) {#hashmap data-toc="Pattern: Hash Map"}
The second-most-used data structure after the dynamic array. Open addressing with linear probing on a power-of-two capacity is what most production C code uses: cache-friendly, branchless lookup in the hot path, no per-entry allocation.

```c
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    uint64_t key;       // 0 = empty, anything else = present
    uint64_t val;
} MapEntry;

typedef struct {
    MapEntry *entries;
    size_t    cap;       // always a power of two
    size_t    len;
} Map;

// Mix bits so adjacent keys don't all land in the same bucket
static inline uint64_t mix(uint64_t x) {
    x ^= x >> 33;
    x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33;
    x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33;
    return x;
}

void map_init(Map *m, size_t cap_pow2) {
    m->entries = calloc(cap_pow2, sizeof(MapEntry));
    m->cap     = cap_pow2;
    m->len     = 0;
}

static size_t map_probe(const Map *m, uint64_t key) {
    size_t mask = m->cap - 1;     // pow2 capacity -> mask is cheap modulo
    size_t i = mix(key) & mask;
    while (m->entries[i].key != 0 && m->entries[i].key != key) {
        i = (i + 1) & mask;       // linear probe
    }
    return i;
}

void map_put(Map *m, uint64_t key, uint64_t val) {
    // 0 is the sentinel "empty" value - real users wrap or remap key==0
    if ((m->len + 1) * 2 > m->cap) map_grow(m);
    size_t i = map_probe(m, key);
    if (m->entries[i].key == 0) m->len++;
    m->entries[i] = (MapEntry){ key, val };
}

int map_get(const Map *m, uint64_t key, uint64_t *out) {
    size_t i = map_probe(m, key);
    if (m->entries[i].key != key) return 0;
    *out = m->entries[i].val;
    return 1;
}

void map_grow(Map *m) {
    Map bigger = {0};
    map_init(&bigger, m->cap * 2);
    for (size_t i = 0; i < m->cap; i++) {
        if (m->entries[i].key) map_put(&bigger, m->entries[i].key, m->entries[i].val);
    }
    free(m->entries);
    *m = bigger;
}
```

Usage:

```c
Map m;
map_init(&m, 16);          // must be power of 2
map_put(&m, 42, 100);
map_put(&m, 99, 200);

uint64_t v;
if (map_get(&m, 42, &v)) printf("%llu\n", v);

free(m.entries);
```

### Wins

- One contiguous allocation - no per-entry malloc, no pointer chasing
- Linear probing keeps cache misses to a minimum on lookup
- Power-of-two capacity gives `x & (cap-1)` instead of `x % cap`
- Load factor 50% chosen for stability; 75% trades memory for speed
- No iterator invalidation surprises - the table either fits or grows once

### Caveats

- Sentinel `key == 0` means real-world users either remap zero (e.g., XOR with a salt) or store an explicit "occupied" tag byte
- Deletion needs *tombstones* (a third state) or full rehash on remove - skipped here for brevity
- String keys: hash to a `uint64_t` first (FNV-1a, xxhash, SipHash). Store the original string in a side table or heap.
- For untrusted input, use a keyed hash (SipHash) - linear probing is vulnerable to hash-flooding DoS otherwise

::: tip
When entries are larger than ~32 bytes, switch to "Robin Hood" probing or split keys and values into two parallel arrays. The naive linear-probe map shown here is the right starting point; profile before chasing the next variant.
:::
::::

:::: pattern Pattern | Indexes Over Pointers {#indexes data-toc="Pattern: Indexes Over Pointers"}
When one object references another that lives in an array, store the **index**, not a pointer. Resolve through a getter that bounds-checks. This is the same idea as Handle Arrays but for plain references.

### Why a raw pointer is worse

- If the target's array resizes, every pointer into it dangles.
- Pointers bypass any bounds-checking machinery you wrote.
- Pointers are 8 bytes on 64-bit. `uint32_t` indexes are 4. Half the memory, twice the density in cache lines.
- Pointers can't be serialized. ASLR randomizes addresses on every run; indexes are stable across processes.

```c
typedef struct { float x, y; } Vec2;
typedef struct { Vec2 *data; size_t len, cap; } Vec2Arr;

static Vec2 g_zero = {0};

Vec2 *vec2arr_get(Vec2Arr *a, size_t i) {
    if (i >= a->len) {
        // breakpoint here in dev; logs/crashes catch the bug
        return &g_zero;
    }
    return &a->data[i];
}

// Reference by index instead of pointer
typedef struct {
    uint32_t owner_idx;       // index into player array
    uint32_t target_idx;      // index into enemy array
} Bullet;
```

### Generational indexes

For safe deletion, pair the index with a generation counter (see the *Handle Arrays* pattern). Stale handles return `NULL` instead of dangling.

### The bounds check is free in release

In a tight `for (i = 0; i < a->len; i++)` loop, modern compilers prove the check always passes and elide it. The branch predictor handles any leftover. Stop worrying.

### Serialization for free

Dump `Vec2Arr.data[]` plus the indexes straight to disk. Restore: indexes still valid. With pointers: every reference broken, every pointer needs fix-up.

::: tip
Use `uint32_t` indexes by default. 4 billion is more than your program will ever address in one array, and you save 4 bytes per reference vs a pointer.
:::
::::

:::: pattern Pattern | Error Handling Without Exceptions {#errhandle data-toc="Pattern: Error Handling"}
C has no exceptions. The modern pattern is to return a **result type** - a struct containing either a value or an error.

```c
typedef enum {
    ERR_OK       = 0,
    ERR_OOM,      // out of memory
    ERR_NOT_FOUND,
    ERR_INVALID,
} Error;

typedef struct {
    int32_t value;
    Error   err;
} I32Result;

// Constructor helpers
static inline I32Result i32_ok(int32_t v) { return (I32Result){v, ERR_OK}; }
static inline I32Result i32_err(Error e) { return (I32Result){0, e}; }

I32Result parse_int(const char *s) {
    if (!s || !*s) return i32_err(ERR_INVALID);
    char *end;
    long v = strtol(s, &end, 10);
    if (*end != '\0') return i32_err(ERR_INVALID);
    return i32_ok((int32_t)v);
}

// Usage - you MUST check before using the value
I32Result r = parse_int("123");
if (r.err) {
    fprintf(stderr, "parse failed: %d\n", r.err);
} else {
    printf("got: %d\n", r.value);
}
```

::: tip
For simple functions, returning `NULL` on failure is fine. Reserve result types for places where you need to distinguish *why* something failed.
:::
::::

:::: pattern Pattern | Cleanup / Defer with goto {#defer data-toc="Pattern: Defer / Cleanup"}
When a function acquires multiple resources, the `goto cleanup` pattern gives you structured cleanup without nesting hell. It's the idiomatic C way to get Go/Zig-style `defer`.

```c
int32_t load_and_process(const char *path) {
    int32_t  result = -1;
    FILE    *f      = NULL;
    uint8_t *buf    = NULL;

    f = fopen(path, "rb");
    if (!f) goto cleanup;

    buf = malloc(4096);
    if (!buf) goto cleanup;

    size_t n = fread(buf, 1, 4096, f);
    if (n == 0) goto cleanup;

    // ... process buf ...
    result = (int32_t)n;  // success

cleanup:
    free(buf);    // free(NULL) is safe in C
    if (f) fclose(f);
    return result;
}
// No matter how we exit, cleanup always runs.
// No nested ifs. No leaked resources.
```

::: rule
Always initialize resources to `NULL` at the top. `free(NULL)` is a no-op in C, so your cleanup block is always safe to call unconditionally.
:::
::::

:::: pattern Pattern | Logging {#logging data-toc="Pattern: Logging"}
Production code needs leveled logging that compiles out below a chosen threshold. The whole pattern fits in one short header. Anything bigger and you're paying for a feature you almost certainly don't need.

```c
// log.h
#pragma once
#include <stdio.h>
#include <time.h>

enum { LOG_TRACE, LOG_DEBUG, LOG_INFO, LOG_WARN, LOG_ERROR, LOG_OFF };

// Compile-time threshold - everything below disappears in release.
#ifndef LOG_LEVEL
#  ifdef NDEBUG
#    define LOG_LEVEL LOG_INFO
#  else
#    define LOG_LEVEL LOG_DEBUG
#  endif
#endif

static inline void log_emit(int level, const char *file, int line,
                            const char *fmt, ...) {
    static const char *labels[] = {"TRC","DBG","INF","WRN","ERR"};
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    fprintf(stderr, "%lld.%03ld %s %s:%d ",
        (long long)ts.tv_sec, ts.tv_nsec / 1000000,
        labels[level], file, line);

    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);

    fputc('\n', stderr);
}

#define LOG_AT(lv, ...) \
    do { if ((lv) >= LOG_LEVEL) log_emit((lv), __FILE__, __LINE__, __VA_ARGS__); } while (0)

#define LOG_TRACE(...) LOG_AT(LOG_TRACE, __VA_ARGS__)
#define LOG_DEBUG(...) LOG_AT(LOG_DEBUG, __VA_ARGS__)
#define LOG_INFO(...)  LOG_AT(LOG_INFO,  __VA_ARGS__)
#define LOG_WARN(...)  LOG_AT(LOG_WARN,  __VA_ARGS__)
#define LOG_ERROR(...) LOG_AT(LOG_ERROR, __VA_ARGS__)
```

Usage:

```c
LOG_INFO("server listening on port %d", port);
LOG_WARN("slow request %.2f ms from %s", ms, addr);
LOG_ERROR("open %s: %s", path, strerror(errno));

// Build with -DLOG_LEVEL=LOG_WARN to silence INFO and below.
```

### Wins

- **Compiles out:** the `if ((lv) >= LOG_LEVEL)` is a constant, so the optimizer deletes the entire call
- **File and line:** automatic via `__FILE__` / `__LINE__` - no per-call boilerplate
- **printf semantics:** existing format-string knowledge transfers; `-Wformat=2` still works if you add `__attribute__((format(printf, 4, 5)))` to `log_emit`
- **One sink:** `stderr`. Your terminal handles colors; `systemd` / Docker capture it; redirect to a file when you need to. No layered "appender" abstraction.

### Multi-threaded

```c
// Add a single mutex around the whole emit. stderr is line-buffered by
// default, so individual lines stay intact, but interleaving across
// fields is possible without the lock.
static pthread_mutex_t g_log_mu = PTHREAD_MUTEX_INITIALIZER;

static inline void log_emit(...) {
    pthread_mutex_lock(&g_log_mu);
    // ... existing body ...
    pthread_mutex_unlock(&g_log_mu);
}
```

::: warn
Do not call `LOG_*` from a signal handler. `vfprintf`, `fprintf`, `clock_gettime` are not async-signal-safe. Set a flag in the handler and let the main loop log.
:::

::: tip
For structured logging (JSON, key-value), keep the same threshold trick but write a `LOG_KV(level, "msg", "key", val, ...)` macro that emits a JSON line. Don't pull in a 50k-line "logging framework" just for that.
:::
::::

:::: pattern Pattern | Fuzz Harness {#fuzz data-toc="Pattern: Fuzz Harness"}
A fuzzer feeds random byte sequences to a function in a tight loop, watching for sanitizer trips and crashes. Five extra lines around an existing parser turns it into a fuzz target. This is the highest-leverage testing you can write for any code that ingests untrusted input.

```c
// fuzz_target.c
#include <stdint.h>
#include <stddef.h>
#include "parser.h"

// libFuzzer entry point. Returning 0 means "input was processed";
// crashes / sanitizer trips are surfaced by the harness.
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    Parsed p;
    if (parse(data, size, &p) == PARSE_OK) {
        parsed_free(&p);
    }
    return 0;
}
```

### Build and run

```bash
clang -g -O1 -fsanitize=fuzzer,address,undefined \
      fuzz_target.c parser.c -o fuzz

mkdir -p corpus crashes
./fuzz corpus/ -max_total_time=60            # 60 s campaign
./fuzz corpus/ -max_total_time=3600 -jobs=4   # overnight + 4 cores

# Reproduce a saved crash deterministically:
./fuzz crashes/crash-abc123
```

The fuzzer instruments coverage at compile time, generates random inputs, and minimizes any crashing input down to the smallest reproducer it can find. Drop the corpus into your CI as a regression suite.

### Wins

- **Finds bugs you never thought of:** coverage-guided generation explores edge cases hand-written tests miss
- **Reproducible:** every crash is saved as a single-byte file you can replay with `./fuzz path`
- **Composable with sanitizers:** ASan + UBSan + MSan all stack inside the fuzzer; a "harmless" overflow surfaces immediately
- **CI-friendly:** a 60-second smoke test in CI plus longer overnight runs catches almost everything

### Writing a good harness

1. **Be deterministic.** No globals, no time-based logic. Two runs with the same input must do the same thing.
2. **Free everything.** The harness reruns millions of times. A leak in the parser becomes an OOM in 10 seconds. ASan with `detect_leaks=1` reports it.
3. **Bound work.** If the parser can be told to allocate gigabytes from a 1-byte input, your fuzzer will find that path immediately. Cap allocations.
4. **Seed the corpus.** Drop a few real, valid inputs into `corpus/` before starting. The fuzzer mutates from those - blank corpus means slow start.
{.steps}

### Properties beyond "doesn't crash"

```c
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    Parsed p;
    if (parse(data, size, &p) != PARSE_OK) return 0;

    // Round-trip property: parse -> serialize -> parse must give same result
    uint8_t *re;
    size_t  re_len;
    serialize(&p, &re, &re_len);

    Parsed q;
    int ok = parse(re, re_len, &q) == PARSE_OK && parsed_eq(&p, &q);
    assert(ok);   // fuzzer treats assert failures as crashes

    free(re); parsed_free(&p); parsed_free(&q);
    return 0;
}
```

::: tip
If clang's libFuzzer isn't an option, AFL++ takes the same harness with a tiny shim - the function name changes but the body is identical. Both fuzzers feed bytes to a function and expect a non-crashing return; everything else is plumbing.
:::

::: warn
Do not commit a 100 MB fuzzing corpus to your main repo. Use `git lfs`, store it in a sibling repo, or download it on demand in CI. Tests that take 10 minutes to clone are tests that nobody runs.
:::
::::

:::: pattern Pattern | Optimization Journey {#optjourney data-toc="Pattern: Optimization Journey"}
A worked example from Nic Barker's CPU performance talk. Start with a typical OO enemy update loop. Apply twelve mechanical changes. End up ~40x faster. Each step is small. The cumulative effect is large because cache pressure makes the gains *multiplicative*, not additive.

### Baseline (slow)

```c
// What you'd write in your first year of programming
class Enemy {
    bool           dead;
    string         id;
    bool           frenzy;
    function       onDeath;     // callback / delegate

    void Update(float dt) {
        if (dead) { onDeath(id); return; }
        if (frenzy || config.global_frenzy) { /* fast path */ }
        else { /* normal path */ }
    }
}
// foreach (e in enemies) e.Update(dt);    // ~309 ms baseline
```

### Twelve mechanical optimizations

| # | Change | Effect |
|---|---|---|
| 1 | Bulk processing: `process_enemies(EnemyArray *)` instead of per-object `Update()` | ~285 ms |
| 2 | Inline the callback (kill `onDeath` indirection - it can do anything, breaks cache) | stable |
| 3 | Hoist invariants: `bool g_frenzy = config.global_frenzy` outside the loop | ~284 ms |
| 4 | `class` -> `struct`: pack contiguously, not array-of-pointers | ~190 ms (~30% faster) |
| 5 | Reorder fields, largest first: 24 B -> 16 B struct | ~170 ms |
| 6 | Two booleans -> single enum: kills impossible "dead and frenzy" state | same size, fewer bugs |
| 7 | `enum : uint8_t`: 4 B -> 1 B (no win standalone, 4x density in arrays) | same |
| 8 | Drop string ID for `uint32_t`: 8 B -> 4 B, struct shrinks 16 B -> 8 B | ~153 ms (~50% baseline) |
| 9 | Bulk delete instead of `RemoveAt` per item (list shuffle is O(n) per delete) | ~3x on heavy-delete variant |
| 10 | Swap-back array: `arr[i] = arr[--len]` - no order preservation needed | ~4x again |
| 11 | Avoid last-minute decisions: split into `normals`, `frenzies`, `deads` arrays | ~2x again |
| 12 | Information out of band: enum disappears - array membership encodes state | same speed, simpler code |

### Final code

```c
typedef struct { float x, y; uint32_t id; } Enemy;

typedef struct {
    Enemy *data;
    size_t len, cap;
} EnemyArray;

void update_normals(EnemyArray *e, float dt) {
    for (size_t i = 0; i < e->len; i++) {
        e->data[i].x += 1.0f * dt;   // no branch, no callback, no alloc
    }
}

void update_frenzies(EnemyArray *e, float dt) {
    for (size_t i = 0; i < e->len; i++) {
        e->data[i].x += 3.0f * dt;
    }
}

// Swap-back deletion - O(1), order not preserved
void enemy_remove(EnemyArray *e, size_t i) {
    e->data[i] = e->data[--e->len];
}
```

::: tip
Each individual change looks like a "pointless micro-opt" in isolation. They compound because they all reduce pressure on the same contested resource (the cache). Same way road traffic gridlocks non-linearly: once you're past the throughput cliff, every car you remove helps disproportionately.
:::

::: warn
"Information out of band" (Andrew Kelley): if a function only takes *frenzy* enemies, you don't need a frenzy flag on the struct. Array membership encodes the state. This deletes whole categories of bugs ("forgot to clear the flag on death") and shrinks the struct.
:::
::::

:::: pattern Pattern | Barker's Way (Clay-style C) {#barker data-toc="Pattern: Barker's Way"}
Lessons from Nic Barker's Clay - a ~6 KB layout library written in pure C99. Distillation of the rules he applies in the Clay source and his "How to write better C" talk.

### The rules

1. **Single-header distribution.** One `.h`. `#ifdef LIB_IMPLEMENTATION` reveals function bodies once; user includes elsewhere for declarations only.
2. **No malloc inside the library.** Caller hands you a buffer; you arena-allocate inside it. Deterministic memory.
3. **Custom string type.** `{ const char *chars; int32_t len; }`. Drop null-termination - it's a footgun.
4. **Compile-time IDs.** Hash literal IDs at compile time via macros (`LIB_ID("foo")`). No runtime string construction in hot loops.
5. **Declarative macro DSL.** `LIB_BLOCK(config) { children }` reads tree-shaped, compiles imperative.
6. **Prefix everything.** `Lib_*` public types, `LIB_*` public macros, `Lib__*` private (double underscore = "do not touch").
7. **Renderer-agnostic output.** Emit sorted command structs; let the caller draw.
8. **No hidden state.** All context passed by pointer. No globals.
9. **C99 + `-Wall -Werror -fsanitize=address`**. Non-negotiable build flags.
10. **Unity-build friendly.** Library is one file; user's program is one file.
{.steps}

### Single-header library skeleton

```c
// tinylib.h
#ifndef TINYLIB_H
#define TINYLIB_H
#include <stdint.h>
#include <stddef.h>

typedef struct { uint8_t *data; size_t pos, cap; } Tiny_Arena;
typedef struct { const char *chars; int32_t len; } Tiny_String;

void  Tiny_Init(Tiny_Arena *a, void *mem, size_t cap);
void *Tiny__Alloc(Tiny_Arena *a, size_t n, size_t align);

#define TINY_PUSH(a, T) ((T*)Tiny__Alloc((a), sizeof(T), _Alignof(T)))

#ifdef TINYLIB_IMPLEMENTATION
void Tiny_Init(Tiny_Arena *a, void *mem, size_t cap) {
    a->data = mem; a->pos = 0; a->cap = cap;
}
void *Tiny__Alloc(Tiny_Arena *a, size_t n, size_t align) {
    size_t p = (a->pos + align - 1) & ~(align - 1);
    if (p + n > a->cap) return 0;
    a->pos = p + n;
    return a->data + p;
}
#endif
#endif
```

### Usage

```c
#define TINYLIB_IMPLEMENTATION
#include "tinylib.h"

int main(void) {
    static uint8_t mem[1 << 20];   // 1 MB static buffer, no malloc
    Tiny_Arena a;
    Tiny_Init(&a, mem, sizeof mem);
    int32_t *x = TINY_PUSH(&a, int32_t);
    *x = 42;
}
```

::: tip
Read `clay.h` itself - it's a single file, ~3000 lines, and the best living example of every rule above. [github.com/nicbarker/clay](https://github.com/nicbarker/clay)
:::
::::

### Practice

Open this repo in Helix. Run `hx --health c` and confirm clangd is found. In any `.c` file: hover with `K` (hover info), `gd` on a function name (jump to definition), `gr` (find references). Set a breakpoint and start a debug session with `:debug-start binary ./your-binary`.

---

## 28 Drills {#drills data-toc="Drills"}

::: tldr
reading alone gets you nowhere. Each drill has a hidden answer; try first, then expand.
:::

### Pointers

**D-1.** What does this print? Why?

```c
int x = 5;
int *p = &x;
int **pp = &p;
**pp = 10;
printf("%d\n", x);
```

<details><summary>answer</summary>

`10`. `pp` points to `p`; `*pp` is `p`; `**pp` reads/writes through `p`, which targets `x`.

</details>

**D-2.** Spot the bug:

```c
char *make(void) {
    char s[] = "hello";
    return s;
}
```

<details><summary>answer</summary>

`s` is on the stack; the pointer dangles after return. Fix: `return strdup("hello");` (caller must free) or use a static buffer.

</details>

**D-3.** Why is `int *a, b;` rarely what you want?

<details><summary>answer</summary>

`a` is `int*`, but `b` is just `int`. `*` binds to the variable, not the type. Always declare on separate lines, or write `int *a, *b;`.

</details>

### Arrays & decay

**D-4.** Inside `void f(int a[100])`, what is `sizeof(a)`?

<details><summary>answer</summary>

`sizeof(int*)` (8 on 64-bit). `[100]` is a hint for humans; the compiler ignores it on parameters. `a` is just a pointer.

</details>

**D-5.** Here's a wrong read; what's the smallest fix?

```c
char buf[8];
fread(buf, 1, 10, f);   // wrong: writes 10 bytes into 8-byte buffer
```

<details><summary>answer</summary>

Make the buffer big enough (`char buf[10];`) or read at most `sizeof buf`: `fread(buf, 1, sizeof buf, f);`. Both, ideally.

</details>

### Structs & memory

**D-6.** What does `sizeof(S)` give you?

```c
struct S { char a; int32_t b; char c; };
```

<details><summary>answer</summary>

12 on most platforms. Padding: `a` (1) + 3 pad + `b` (4) + `c` (1) + 3 trailing pad = 12. Reorder largest-first to shrink: `{ int32_t b; char a; char c; }` -> 8 bytes.

</details>

**D-7.** Allocate a struct and an array of doubles in one shot:

<details><summary>answer</summary>

```c
typedef struct { size_t n; double data[]; } Vec;
Vec *v = malloc(sizeof(Vec) + n * sizeof(double));
v->n = n;
// v->data[i] is contiguous with the struct - one alloc, one free
```

This is the "flexible array member" trick.

</details>

### Strings

**D-8.** Why is `strncpy` *not* a safe `strcpy`?

<details><summary>answer</summary>

`strncpy` does not null-terminate if the source is at least `n` bytes. The result might not be a C string. Use `snprintf(dst, sizeof dst, "%s", src)` for safe bounded copy.

</details>

### Memory management

**D-9.** Spot the leak:

```c
char *buf = malloc(1024);
buf = realloc(buf, 4096);
if (!buf) return -1;
```

<details><summary>answer</summary>

If `realloc` returns NULL, the original `buf` still points to a live block but you've overwritten the variable -> leak. Always: `tmp = realloc(buf, n); if (!tmp) { free(buf); return -1; } buf = tmp;`.

</details>

**D-10.** Which of these is/are UB?

```c
char *p = malloc(8);
free(p);
free(p);             // (a)
p[0] = 'x';          // (b)
free(NULL);          // (c)
char *q = NULL;
*q = 'x';            // (d)
```

<details><summary>answer</summary>

`(a)`, `(b)`, `(d)` are UB. `(c)` is defined as a no-op.

</details>

### Bit twiddling

**D-11.** Set bit 3 of `x`. Clear bit 5. Toggle bit 7. Test bit 0.

<details><summary>answer</summary>

```c
x |=  (1u << 3);          // set
x &= ~(1u << 5);          // clear
x ^=  (1u << 7);          // toggle
bool b = x & (1u << 0);   // test
```

</details>

### Build & safety

**D-12.** What flags would catch the most C bugs at zero cost?

<details><summary>answer</summary>

`-Wall -Wextra -Werror` for warnings-as-errors, plus `-fsanitize=address,undefined` for runtime. Optional: `-Wpedantic`, `-Wconversion`.

</details>

---

## 29 Glossary {#glossary data-toc="Glossary"}

::: tldr
shorthand C developers throw around. Skim once.
:::

| Term | Meaning |
|------|---------|
| **UB** | Undefined Behavior. The standard imposes no requirement; the compiler may do anything. |
| **IB** | Implementation-defined Behavior. The standard lets each compiler choose, but it must document the choice (e.g. `int` width). |
| **TU** | Translation Unit. One `.c` file plus all its `#include`d content, after the preprocessor runs. The unit the compiler sees. |
| **ODR** | One Definition Rule. Each non-`static` function or global must have exactly one definition across all TUs of a program. |
| **lvalue** | Expression with an address you can take. `x`, `*p`, `arr[i]`. Can appear on the left of `=`. |
| **rvalue** | Expression without an address. `42`, `a + b`, function return. Right side of `=` only. |
| **Linkage** | Visibility across TUs. `static` = internal (this TU only). Default = external (visible to linker). |
| **Storage duration** | How long an object lives. Automatic (stack), Static (process lifetime), Allocated (heap, until `free`), Thread (C11 `_Thread_local`). |
| **Sequence point** | Boundary in evaluation order. Between full expressions, after `&&`/`||`, after function args. UB if you read AND write the same value without one. |
| **Strict aliasing** | The rule that says you can't read a `T*` through a `U*` (with exceptions: `char*`, `unsigned char*`). Violations are UB. |
| **VLA** | Variable Length Array. `int a[n]` where `n` isn't a constant. Stack-allocated; can blow the stack. C99 mandatory, C11 optional. |
| **POD** | Plain Old Data. A struct with no constructors/destructors (a C-only concept by definition; comes up at C++/ABI boundaries). |
| **ABI** | Application Binary Interface. The contract between compiled binaries: calling convention, struct layout, name mangling. |
| **TLS** | Thread-Local Storage. Per-thread copies of a variable. C11: `_Thread_local`. |
| **MMU** | Memory Management Unit. CPU hardware that translates virtual addresses to physical. Why each process sees its own address space. |
| **Cache line** | Unit of memory the CPU loads from RAM. 64 bytes on x86/ARM. Writes invalidate sibling cores' copies. |

---

## ∑ Quick Reference

:::: grid
::: item Always do
- Use `stdint.h` fixed-width types
- Check every malloc/fopen for NULL
- Use `snprintf` not `sprintf`
- Use `strcmp` not `==` for strings
- NULL pointers after free
- Use arenas for short-lived data
- `#pragma once` in every header
- Mark file-local helpers `static`
- `assert()` invariants in code
- Run tests under sanitizers
- Use `memcpy` for type punning
- Build dev with `-std=c99 -Wall -Wextra -Werror -fsanitize=address,undefined`
- Use a debugger from day one
- Read `clang -E` when a macro misbehaves
:::
::: item Never do
- Large arrays on the stack (or VLAs)
- Ignore malloc return value
- Use `gets()` - it's deleted
- Use `strncpy` as a string copy
- Cast malloc in C (it's unnecessary)
- Write to string literals
- Compare strings with `==`
- Cast between pointer types (alias UB)
- Read uninitialized memory
- Signed overflow on purpose
- Forget to free heap memory
- Debug an optimized binary first
- Hide allocations inside library APIs
- `printf` from a signal handler
:::
::: item Core patterns
- Arena allocator for lifetimes
- Stretchy buffer for growing arrays
- Slice structs (ptr + len)
- Handle arrays for objects
- Hash map (open addressing)
- Tagged unions for sum types
- Indexes, not pointers, between objects
- Unity build until it hurts
- Result structs for errors
- goto cleanup for resources
- Leveled logger that compiles out
:::
::: item Key headers
- `stdint.h` - fixed types
- `stddef.h` - size_t, NULL
- `stdbool.h` - bool
- `string.h` - mem/str ops
- `stdlib.h` - malloc/free
- `stdio.h` - printf/fopen
- `assert.h` - assert()
:::
::: item Build flags
- `-std=c99` always
- `-Wall -Wextra -Wpedantic -Werror`
- `-fsanitize=address,undefined` (dev)
- `-g -O0` debug, `-O2 -DNDEBUG` release
- `-fstack-protector-strong` release
- `-D_FORTIFY_SOURCE=2` release
:::
::: item Cache & perf
- 64 B cache line - pack tight
- L1 ~3 cy, L2 ~20, L3 ~100, DRAM 200-300
- Bulk processing > per-object
- Pre-compute > runtime
- Order struct fields largest -> smallest
- Each core has its own L1/L2
:::
::: item Debug & tools
- gdb: `b main; r; bt; p var`
- lldb: same commands, mostly
- `ulimit -c unlimited` for cores
- valgrind / rr fallbacks
- Helix: `hx --health c`
- RemedyBG / RAD Debugger for GUI
:::
::: item Barker rules
- Single-header + `#ifdef IMPL`
- Caller-owned arenas
- String = ptr + len
- Indexes, not pointers
- Unity build first
- No globals, no hidden malloc
- C99 + ASan, non-negotiable
:::
::: item Testing
- `tests.c` + `assert.h` + sanitizers = 80%
- Exit 0 = pass, non-zero = fail
- Run under `-fsanitize=address,undefined`
- One test binary per module is fine
- `EXPECT_EQ` macros, not a framework
- Fuzz any parser of untrusted input
- Snapshot/golden for formatters
:::
::: item UB to avoid
- Signed integer overflow
- NULL or wild pointer deref
- Out-of-bounds (even by 1)
- Strict aliasing violations
- Misaligned scalar access
- Shift >= type width
- Reading uninitialized memory
- Use after free / scope
- Unsequenced reads/writes (`i = i++`)
:::
::: item Concurrency
- Default to mutexes, not lock-free
- C11 atomics for flags / counters
- `memory_order_seq_cst` until profiled
- Lock multiple mutexes in fixed order
- Build with `-fsanitize=thread`
- Pass distinct addrs to each thread
- Always join (or detach)
:::
::::
