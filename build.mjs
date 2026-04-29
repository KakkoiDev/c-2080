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

function build() {
  const mdSrc = fs.readFileSync(SRC_MD, "utf8");
  const template = fs.readFileSync(TEMPLATE, "utf8");

  const env = {};
  const tokens = md.parse(mdSrc, env);
  const toc = buildToc(tokens);
  const body = md.renderer.render(tokens, md.options, env);

  const out = template
    .replace("{{TOC}}", toc)
    .replace("{{CONTENT}}", body);

  fs.writeFileSync(OUT, out);
  console.log(`built ${OUT} (${out.length} bytes, ${tokens.length} tokens)`);
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
