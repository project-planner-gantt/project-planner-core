<script lang="ts">
  // Markdown source with its styles applied: `**bold**` is bold but keeps its
  // asterisks, `# Heading` is large but keeps its `#`. Markers are only dimmed.
  import { onMount } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, placeholder } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { tags as t } from "@lezer/highlight";

  let { value = $bindable(""), hint = "" }: { value?: string; hint?: string } = $props();

  const style = HighlightStyle.define([
    { tag: t.heading1, fontSize: "1.4em", fontWeight: "700" },
    { tag: t.heading2, fontSize: "1.25em", fontWeight: "700" },
    { tag: t.heading3, fontSize: "1.1em", fontWeight: "700" },
    { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "700" },
    { tag: t.strong, fontWeight: "700" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.monospace, fontFamily: "Consolas, monospace", background: "#f3f4f6" },
    { tag: [t.link, t.url], color: "#2563eb" },
    { tag: t.quote, color: "#4b5563", fontStyle: "italic" },
    // `#`, `**`, `-`, `>`, backticks: visible, but out of the way
    { tag: [t.processingInstruction, t.meta], color: "#9ca3af" },
    { tag: t.atom, color: "#7c3aed" }, // [ ] / [x]
  ]);

  let host: HTMLDivElement;

  onMount(() => {
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          indentUnit.of("\t"),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(style),
          placeholder(hint),
          EditorView.updateListener.of(u => { if (u.docChanged) value = u.state.doc.toString(); }),
        ],
      }),
    });
    return () => view.destroy();
  });
</script>

<div class="pp-md" bind:this={host}></div>
