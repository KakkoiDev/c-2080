// Build script: src/index.md + src/template.html -> index.html
// markdown-it + custom containers (rule, warn, tip, pattern, grid, item)
// Auto-generates TOC from h2 headings.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import mdAttrs from "markdown-it-attrs";
import mdContainer from "markdown-it-container";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC_MD = path.join(ROOT, "src", "index.md");
const TEMPLATE = path.join(ROOT, "src", "template.html");
const OUT = path.join(ROOT, "index.html");
const OUT_TXT = path.join(ROOT, "terminal.txt");
const OUT_TXT_TLDR = path.join(ROOT, "terminal-tldr.txt");

const md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
  breaks: false,
});

md.use(mdAttrs);

// Simple containers: rule, warn, tip, tldr, diagram
for (const name of ["rule", "warn", "tip", "tldr", "diagram"]) {
  md.use(mdContainer, name, {
    render(tokens, idx) {
      return tokens[idx].nesting === 1
        ? `<div class="${name}">\n`
        : `</div>\n`;
    },
  });
}

// Pattern card: ::: pattern P-01 | The Slice Pattern {#unity data-toc="..."}
function parsePatternInfo(info) {
  // info: "pattern P-01 | Title {#id key=val key2="val with space"}"
  const trimmed = info.trim().replace(/^pattern\s+/, "");
  let body = trimmed;
  let attrBlock = "";
  const m = trimmed.match(/^(.*?)\s*\{([^}]*)\}\s*$/);
  if (m) {
    body = m[1];
    attrBlock = m[2];
  }
  const [rawTag, ...titleParts] = body.split("|");
  const tag = (rawTag || "").trim();
  const title = titleParts.join("|").trim();
  const attrs = parseAttrBlock(attrBlock);
  return { tag, title, attrs };
}

function parseAttrBlock(s) {
  const out = {};
  if (!s) return out;
  // Tokens: #id, .class, key=value, key="quoted value"
  const re = /(?:#([^\s]+))|(?:\.([^\s]+))|(?:([\w-]+)\s*=\s*"([^"]*)")|(?:([\w-]+)\s*=\s*(\S+))/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) out.id = m[1];
    else if (m[2]) out.class = (out.class ? out.class + " " : "") + m[2];
    else if (m[3]) out[m[3]] = m[4];
    else if (m[5]) out[m[5]] = m[6];
  }
  return out;
}

md.use(mdContainer, "pattern", {
  validate(params) {
    return /^pattern\s+(.+)$/.test(params.trim());
  },
  render(tokens, idx) {
    const t = tokens[idx];
    if (t.nesting !== 1) {
      return `</div></div>\n`;
    }
    // Parse "pattern TAG | TITLE" from info; markdown-it-attrs has already
    // consumed any trailing {#id ...} into t.attrs.
    const { tag, title } = parsePatternInfo(t.info);
    const id = t.attrGet("id") || "";
    const klass = t.attrGet("class") || "";
    const cardAttrs = [];
    if (id) cardAttrs.push(`id="${escapeHtml(id)}"`);
    cardAttrs.push(`class="pattern-card${klass ? " " + klass : ""}"`);
    return (
      `<div ${cardAttrs.join(" ")}>\n` +
      `<div class="pattern-card-header"><span class="tag">${escapeHtml(tag)}</span><h3>${escapeHtml(title)}</h3></div>\n` +
      `<div class="pattern-card-body">\n`
    );
  },
});

// Summary grid: ::: grid
md.use(mdContainer, "grid", {
  render(tokens, idx) {
    return tokens[idx].nesting === 1
      ? `<div class="summary-grid">\n`
      : `</div>\n`;
  },
});

// Summary item: ::: item Best Defaults
md.use(mdContainer, "item", {
  validate(params) {
    return /^item\s+(.+)$/.test(params.trim());
  },
  render(tokens, idx) {
    if (tokens[idx].nesting !== 1) return `</div>\n`;
    const m = tokens[idx].info.trim().match(/^item\s+(.+)$/);
    const label = m ? m[1].trim() : "";
    return `<div class="summary-item"><div class="label">${escapeHtml(label)}</div>\n`;
  },
});

// Custom h2 renderer: wrap leading "<digits> " or "<symbol> " in <span class="num">
const defaultH2 = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
  const t = tokens[idx];
  if (t.tag === "h2") {
    const inline = tokens[idx + 1];
    if (inline && inline.type === "inline" && inline.children) {
      const first = inline.children[0];
      if (first && first.type === "text") {
        const m = first.content.match(/^(\d+|[^\s\w]+)\s+(.*)$/u);
        if (m) {
          first.content = m[2];
          inline.children.unshift({
            type: "html_inline",
            content: `<span class="num">${m[1]}</span>`,
            level: first.level,
          });
        }
      }
    }
  }
  return defaultH2 ? defaultH2(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

// Tight ULs: <ul class="tight"> when paragraph contains only `· ` style items.
// Simpler: any UL not inside a .summary-item gets `class="tight"`.
// We'll mark them at render time, then post-process via a sentinel.
// Implementation: scan tokens for bullet_list_open and add class via attrs.
md.core.ruler.push("tight_ul", (state) => {
  const tokens = state.tokens;
  // Compute parent stacks. A ul is "inside summary-item" if a containing
  // container_item_open precedes it and isn't yet closed.
  let depthSummary = 0;
  for (const t of tokens) {
    if (t.type === "container_item_open") depthSummary++;
    else if (t.type === "container_item_close") depthSummary--;
    else if (t.type === "bullet_list_open" && depthSummary === 0) {
      // Add class="tight"
      const existing = t.attrGet("class");
      if (!existing) t.attrSet("class", "tight");
      else if (!existing.split(/\s+/).includes("tight")) t.attrSet("class", existing + " tight");
    }
  }
});

// Build TOC from h2 tokens AND pattern containers.
function buildToc(tokens) {
  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && t.tag === "h2") {
      const inline = tokens[i + 1];
      let text = inline.children
        .filter((c) => c.type === "text")
        .map((c) => c.content)
        .join("")
        .trim();
      // Strip leading badge ("01 ", "∑ ", etc.) - same regex as h2 renderer.
      text = text.replace(/^(\d+|[^\s\w]+)\s+/u, "");
      const id = t.attrGet("id") || "";
      const tocOverride = t.attrGet("data-toc") || "";
      if (id) items.push({ id, text: tocOverride || text });
    } else if (t.type === "container_pattern_open") {
      const id = t.attrGet("id");
      const tocOverride = t.attrGet("data-toc");
      const { title } = parsePatternInfo(t.info);
      if (id) {
        const text = tocOverride || `Pattern: ${title.replace(/^The\s+/, "")}`;
        items.push({ id, text });
      }
    }
  }
  return items
    .map(({ id, text }) => `  <a href="#${id}">${escapeHtml(text)}</a>`)
    .join("\n");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============ ANSI rendering for terminal.txt ============

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  noBold: "\x1b[22m",
  noItalic: "\x1b[23m",
  noUnderline: "\x1b[24m",
  // 256-color foregrounds (mapped from site palette: bg #0d0e0f, accent #e8a020)
  orange: "\x1b[38;5;215m",
  cyan: "\x1b[38;5;110m",
  red: "\x1b[38;5;203m",
  yellow: "\x1b[38;5;221m",
  magenta: "\x1b[38;5;176m",
  green: "\x1b[38;5;108m",
  gray: "\x1b[38;5;245m",
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visibleWidth = (s) => s.replace(ANSI_RE, "").length;

function wrap(text, width, indent) {
  const paragraphs = text.split("\n");
  const out = [];
  for (const para of paragraphs) {
    if (para === "") { out.push(""); continue; }
    const words = para.split(/(\s+)/);
    let line = indent;
    for (const w of words) {
      if (!w) continue;
      const candLen = visibleWidth(line) + visibleWidth(w);
      if (candLen > width && visibleWidth(line) > visibleWidth(indent)) {
        out.push(line.replace(/\s+$/, ""));
        line = indent + w.replace(/^\s+/, "");
      } else {
        line += w;
      }
    }
    if (line.length > 0) out.push(line.replace(/\s+$/, ""));
  }
  return out.join("\n");
}

function wrapWithFirstIndent(text, width, firstIndent, restIndent) {
  const paragraphs = text.split("\n");
  const out = [];
  let isFirstLine = true;
  for (const para of paragraphs) {
    if (para === "") { out.push(""); isFirstLine = false; continue; }
    const words = para.split(/(\s+)/);
    let indent = isFirstLine ? firstIndent : restIndent;
    let line = indent;
    for (const w of words) {
      if (!w) continue;
      const candLen = visibleWidth(line) + visibleWidth(w);
      if (candLen > width && visibleWidth(line) > visibleWidth(indent)) {
        out.push(line.replace(/\s+$/, ""));
        indent = restIndent;
        line = indent + w.replace(/^\s+/, "");
      } else {
        line += w;
      }
    }
    if (line.length > 0) out.push(line.replace(/\s+$/, ""));
    isFirstLine = false;
  }
  return out.join("\n");
}

function renderInline(token) {
  if (!token || !token.children) return "";
  let out = "";
  const linkStack = [];
  for (const c of token.children) {
    switch (c.type) {
      case "text": out += c.content; break;
      case "softbreak": out += " "; break;
      case "hardbreak": out += "\n"; break;
      case "code_inline":
        out += ANSI.orange + "`" + c.content + "`" + ANSI.reset;
        break;
      case "em_open": out += ANSI.italic; break;
      case "em_close": out += ANSI.noItalic; break;
      case "strong_open": out += ANSI.bold; break;
      case "strong_close": out += ANSI.noBold; break;
      case "link_open": {
        const href = c.attrGet("href") || "";
        linkStack.push(href);
        out += ANSI.underline;
        break;
      }
      case "link_close": {
        const href = linkStack.pop();
        out += ANSI.noUnderline;
        if (href) out += ANSI.dim + " (" + href + ")" + ANSI.reset;
        break;
      }
      case "html_inline":
        out += c.content.replace(/<[^>]+>/g, "");
        break;
      default: break;
    }
  }
  return out;
}

function renderInlineText(token) {
  if (!token || !token.children) return "";
  let out = "";
  for (const c of token.children) {
    if (c.type === "text" || c.type === "code_inline") out += c.content;
    else if (c.type === "softbreak") out += " ";
    else if (c.type === "hardbreak") out += "\n";
  }
  return out;
}

function renderTable(tokens, startIdx, indent, width) {
  // Walk table tokens, collect rows of cell strings, then format with column widths.
  const rows = [];
  let header = null;
  let i = startIdx;
  let inTr = false;
  let currentRow = null;
  let inHead = false;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "table_close") { i++; break; }
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open") { inTr = true; currentRow = []; }
    else if (t.type === "tr_close") {
      inTr = false;
      if (inHead && header === null) header = currentRow;
      else rows.push(currentRow);
      currentRow = null;
    } else if ((t.type === "th_open" || t.type === "td_open") && inTr) {
      // Next token should be inline
      const inline = tokens[i + 1];
      const cellText = inline && inline.type === "inline" ? renderInline(inline) : "";
      currentRow.push(cellText);
    }
    i++;
  }
  // Compute column widths from visible width
  const allRows = header ? [header, ...rows] : rows;
  if (allRows.length === 0) return { lines: [], next: i };
  const colCount = Math.max(...allRows.map((r) => r.length));
  const colW = new Array(colCount).fill(0);
  for (const r of allRows) {
    for (let c = 0; c < r.length; c++) {
      colW[c] = Math.max(colW[c], visibleWidth(r[c]));
    }
  }
  // Cap total width to fit terminal
  const totalW = colW.reduce((a, b) => a + b, 0) + (colCount - 1) * 3 + 4;
  let scale = 1;
  if (totalW > width - visibleWidth(indent)) {
    scale = (width - visibleWidth(indent) - (colCount - 1) * 3 - 4) / colW.reduce((a, b) => a + b, 0);
  }
  const finalW = colW.map((w) => Math.max(4, Math.floor(w * scale)));

  function padCell(s, w) {
    const visW = visibleWidth(s);
    if (visW > w) {
      // Truncate plain content; ANSI codes preserved at most simply by stripping
      const stripped = s.replace(ANSI_RE, "");
      return stripped.slice(0, w - 1) + "…";
    }
    return s + " ".repeat(w - visW);
  }
  const lines = [];
  function fmtRow(r) {
    const cells = r.map((c, idx) => padCell(c || "", finalW[idx] || 4));
    return indent + cells.join("  " + ANSI.dim + "|" + ANSI.reset + " ");
  }
  if (header) {
    lines.push(fmtRow(header));
    const sep = finalW.map((w) => "-".repeat(w)).join("  " + ANSI.dim + "+" + ANSI.reset + " ");
    lines.push(indent + ANSI.dim + sep + ANSI.reset);
  }
  for (const r of rows) lines.push(fmtRow(r));
  return { lines, next: i };
}

function renderAnsi(tokens) {
  const W = 80;
  const lines = [];
  let indent = "";
  const indentStack = [];

  function pushIndent(extra) {
    indentStack.push(indent);
    indent += extra;
  }
  function popIndent() {
    indent = indentStack.pop() || "";
  }
  function pushLine(s) { lines.push(s); }
  function pushBlank() {
    if (lines.length === 0) return;
    if (lines[lines.length - 1] === "") return;
    lines.push("");
  }
  function pushWrapped(text) {
    const wrapped = wrap(text, W, indent);
    for (const line of wrapped.split("\n")) lines.push(line);
  }

  // Sentinel header
  pushLine(ANSI.bold + ANSI.orange + "c-2080" + ANSI.reset + ANSI.dim + "  -  20% of C for 80% of results" + ANSI.reset);
  pushLine(ANSI.dim + "https://kakkoidev.github.io/c-2080/" + ANSI.reset);
  pushLine(ANSI.dim + "best read at 100+ cols, in a 256-color terminal" + ANSI.reset);
  pushLine("");
  pushLine(ANSI.dim + "skim variant: curl -L https://kakkoidev.github.io/c-2080/terminal-tldr.txt" + ANSI.reset);
  pushBlank();

  let pendingMarker = null;
  const listStack = [];

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    switch (t.type) {
      case "heading_open": {
        const inline = tokens[i + 1];
        const text = renderInline(inline);
        const plain = renderInlineText(inline);
        pushBlank();
        if (t.tag === "h1") {
          pushLine(ANSI.bold + ANSI.orange + text + ANSI.reset);
          pushLine(ANSI.orange + "=".repeat(Math.min(visibleWidth(text), W)) + ANSI.reset);
        } else if (t.tag === "h2") {
          pushLine(ANSI.bold + ANSI.orange + text + ANSI.reset);
          pushLine(ANSI.orange + "-".repeat(Math.min(plain.length, W)) + ANSI.reset);
        } else if (t.tag === "h3") {
          pushLine(indent + ANSI.bold + text + ANSI.reset);
        } else if (t.tag === "h4") {
          pushLine(indent + ANSI.bold + ANSI.dim + text + ANSI.reset);
        } else {
          pushLine(indent + ANSI.bold + text + ANSI.reset);
        }
        pushBlank();
        i += 3; // heading_open, inline, heading_close
        continue;
      }
      case "heading_close":
        i++; continue;

      case "paragraph_open": i++; continue;
      case "paragraph_close":
        if (!t.hidden) pushBlank();
        i++; continue;

      case "inline": {
        const text = renderInline(t);
        if (pendingMarker) {
          const marker = pendingMarker;
          pendingMarker = null;
          const firstIndent = indent + marker;
          const restIndent = indent + " ".repeat(visibleWidth(marker));
          const wrapped = wrapWithFirstIndent(text, W, firstIndent, restIndent);
          for (const line of wrapped.split("\n")) lines.push(line);
        } else {
          pushWrapped(text);
        }
        i++; continue;
      }

      case "bullet_list_open":
        listStack.push({ type: "ul", counter: 0 });
        i++; continue;
      case "bullet_list_close":
        listStack.pop();
        pushBlank();
        i++; continue;
      case "ordered_list_open":
        listStack.push({ type: "ol", counter: parseInt(t.attrGet("start") || "1", 10) });
        i++; continue;
      case "ordered_list_close":
        listStack.pop();
        pushBlank();
        i++; continue;
      case "list_item_open": {
        const top = listStack[listStack.length - 1];
        const marker = top.type === "ol" ? `${top.counter}. ` : "- ";
        if (top.type === "ol") top.counter++;
        pendingMarker = marker;
        pushIndent(" ".repeat(marker.length));
        i++; continue;
      }
      case "list_item_close":
        popIndent();
        i++; continue;

      case "fence":
      case "code_block": {
        const codeLines = (t.content || "").replace(/\n$/, "").split("\n");
        pushBlank();
        for (const ln of codeLines) {
          pushLine(indent + ANSI.gray + "  " + ln + ANSI.reset);
        }
        pushBlank();
        i++; continue;
      }

      case "hr":
        pushBlank();
        pushLine(indent + ANSI.dim + "-".repeat(Math.max(10, W - visibleWidth(indent))) + ANSI.reset);
        pushBlank();
        i++; continue;

      case "table_open": {
        pushBlank();
        const result = renderTable(tokens, i + 1, indent, W);
        for (const ln of result.lines) lines.push(ln);
        pushBlank();
        i = result.next;
        continue;
      }

      case "container_tldr_open":
        pushBlank();
        pushLine(indent + ANSI.bold + ANSI.orange + "TL;DR" + ANSI.reset);
        pushIndent("  ");
        i++; continue;
      case "container_tldr_close":
        popIndent();
        pushBlank();
        i++; continue;

      case "container_rule_open":
        pushBlank();
        pushLine(indent + ANSI.bold + ANSI.magenta + "RULE" + ANSI.reset);
        pushIndent("  ");
        i++; continue;
      case "container_rule_close":
        popIndent();
        pushBlank();
        i++; continue;

      case "container_warn_open":
        pushBlank();
        pushLine(indent + ANSI.bold + ANSI.red + "WARN" + ANSI.reset);
        pushIndent("  ");
        i++; continue;
      case "container_warn_close":
        popIndent();
        pushBlank();
        i++; continue;

      case "container_tip_open":
        pushBlank();
        pushLine(indent + ANSI.bold + ANSI.cyan + "TIP" + ANSI.reset);
        pushIndent("  ");
        i++; continue;
      case "container_tip_close":
        popIndent();
        pushBlank();
        i++; continue;

      case "container_diagram_open":
        pushBlank();
        i++; continue;
      case "container_diagram_close":
        pushBlank();
        i++; continue;

      case "container_pattern_open": {
        const { tag, title } = parsePatternInfo(t.info);
        pushBlank();
        const headerText = `${tag}  -  ${title}`;
        const bar = "=".repeat(Math.min(headerText.length, W - visibleWidth(indent)));
        pushLine(indent + ANSI.bold + ANSI.orange + headerText + ANSI.reset);
        pushLine(indent + ANSI.orange + bar + ANSI.reset);
        pushBlank();
        pushIndent("  ");
        i++; continue;
      }
      case "container_pattern_close":
        popIndent();
        pushBlank();
        i++; continue;

      case "container_grid_open":
        pushBlank();
        i++; continue;
      case "container_grid_close":
        pushBlank();
        i++; continue;

      case "container_item_open": {
        const m = (t.info || "").trim().match(/^item\s+(.+)$/);
        const label = m ? m[1].trim() : "";
        pushBlank();
        pushLine(indent + ANSI.bold + ANSI.cyan + label + ANSI.reset);
        pushIndent("  ");
        i++; continue;
      }
      case "container_item_close":
        popIndent();
        i++; continue;

      case "blockquote_open":
        pushBlank();
        pushIndent("  " + ANSI.dim + "> " + ANSI.reset);
        i++; continue;
      case "blockquote_close":
        popIndent();
        pushBlank();
        i++; continue;

      default:
        // Unknown token - skip
        i++; continue;
    }
  }

  return lines.join("\n") + "\n";
}

function renderAnsiTldr(tokens) {
  const W = 80;
  const lines = [];

  lines.push(ANSI.bold + ANSI.orange + "c-2080  -  TL;DR variant" + ANSI.reset);
  lines.push(ANSI.dim + "full doc: curl -L https://kakkoidev.github.io/c-2080/terminal.txt" + ANSI.reset);
  lines.push("");

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === "heading_open") {
      const inline = tokens[i + 1];
      const text = renderInlineText(inline);
      if (lines.length > 3) lines.push("");
      if (t.tag === "h2") {
        lines.push(ANSI.bold + ANSI.orange + text + ANSI.reset);
        lines.push(ANSI.orange + "-".repeat(Math.min(text.length, W)) + ANSI.reset);
      } else if (t.tag === "h3") {
        lines.push(ANSI.bold + text + ANSI.reset);
      } else if (t.tag === "h1") {
        lines.push(ANSI.bold + ANSI.orange + text + ANSI.reset);
        lines.push(ANSI.orange + "=".repeat(Math.min(text.length, W)) + ANSI.reset);
      }
      i += 3;
      continue;
    }

    if (t.type === "container_tldr_open") {
      // Capture the inline content of the tldr block
      let j = i + 1;
      let depth = 1;
      const buf = [];
      while (j < tokens.length && depth > 0) {
        const tt = tokens[j];
        if (tt.type === "container_tldr_open") depth++;
        else if (tt.type === "container_tldr_close") {
          depth--;
          if (depth === 0) break;
        } else if (tt.type === "inline") {
          buf.push(renderInline(tt));
        }
        j++;
      }
      lines.push(ANSI.bold + ANSI.orange + "TL;DR" + ANSI.reset);
      const text = buf.join(" ");
      const wrapped = wrap(text, W, "  ");
      for (const ln of wrapped.split("\n")) lines.push(ln);
      lines.push("");
      i = j + 1;
      continue;
    }

    if (t.type === "container_pattern_open") {
      const { tag, title } = parsePatternInfo(t.info);
      lines.push("");
      lines.push(ANSI.bold + ANSI.orange + `${tag}  -  ${title}` + ANSI.reset);
      i++;
      continue;
    }

    i++;
  }

  return lines.join("\n") + "\n";
}

function build() {
  const mdSrc = fs.readFileSync(SRC_MD, "utf8");
  const template = fs.readFileSync(TEMPLATE, "utf8");

  const env = {};
  const tokens = md.parse(mdSrc, env);
  const toc = buildToc(tokens);

  // Render ANSI variants BEFORE HTML render (HTML render mutates h2 inline tokens)
  const ansiFull = renderAnsi(tokens);
  const ansiTldr = renderAnsiTldr(tokens);

  const body = md.renderer.render(tokens, md.options, env);

  const out = template
    .replace("{{TOC}}", toc)
    .replace("{{CONTENT}}", body);

  fs.writeFileSync(OUT, out);
  fs.writeFileSync(OUT_TXT, ansiFull);
  fs.writeFileSync(OUT_TXT_TLDR, ansiTldr);
  console.log(
    `built ${OUT} (${out.length} bytes, ${tokens.length} tokens)\n` +
    `      ${OUT_TXT} (${ansiFull.length} bytes)\n` +
    `      ${OUT_TXT_TLDR} (${ansiTldr.length} bytes)`
  );
}

build();

if (process.argv.includes("--watch")) {
  const watched = [SRC_MD, TEMPLATE];
  for (const file of watched) {
    fs.watchFile(file, { interval: 200 }, () => {
      try {
        build();
      } catch (e) {
        console.error("build failed:", e.message);
      }
    });
  }
  console.log("watching for changes... (ctrl-c to quit)");
}
