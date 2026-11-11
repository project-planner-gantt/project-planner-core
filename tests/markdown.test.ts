import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/ui/markdown";

describe("tooltip markdown", () => {
  it("renders inline marks", () => {
    expect(renderMarkdown("a **b** *c* ~~d~~ `e*f*` ==g=="))
      .toBe('<div class="pp-mdr-p">a <b>b</b> <i>c</i> <s>d</s> <code>e*f*</code> <mark>g</mark></div>');
  });

  it("escapes HTML from the file", () => {
    expect(renderMarkdown('<img src=x onerror="alert(1)"> **<b>**'))
      .toBe('<div class="pp-mdr-p">&lt;img src=x onerror=&quot;alert(1)&quot;&gt; <b>&lt;b&gt;</b></div>');
  });

  it("renders headings, nested tasks and lists, hides ^ids", () => {
    expect(renderMarkdown("## Plan\n- [ ] open ^a\n\t- [x] done 📅 2026-01-01 ^b\n1. first")).toBe(
      '<div class="pp-mdr-h pp-mdr-h2">Plan</div>' +
      '<div class="pp-mdr-li" style="--lvl:0"><span class="pp-mdr-mark">☐</span>open</div>' +
      '<div class="pp-mdr-li pp-mdr-done" style="--lvl:1"><span class="pp-mdr-mark">☑</span>done 📅 2026-01-01</div>' +
      '<div class="pp-mdr-li" style="--lvl:0"><span class="pp-mdr-mark">1.</span>first</div>'
    );
  });

  it("marks a gap after blank lines, keeps snake_case, renders links and fenced code", () => {
    expect(renderMarkdown("one\n\nsnake_case_name [site](https://x.y) [[Note|alias]]\n```\n<x>\n```")).toBe(
      '<div class="pp-mdr-p">one</div>' +
      '<div class="pp-mdr-p pp-mdr-gap">snake_case_name <span class="pp-mdr-link">site</span> <span class="pp-mdr-link">alias</span></div>' +
      "<pre>&lt;x&gt;</pre>"
    );
  });
});
