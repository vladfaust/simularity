<!--
  Renders rich text.

  Supported tags:

  *asterisks*: italic, gray
  "quotes": bold
  [system commands]: italic, secondary

-->

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text: string;
  as: string;
}>();

enum Tag {
  Asterisks,
  Quotes,
  SystemCommand,
}

class TextPiece {
  constructor(
    public tag: Tag | null,
    public text: string,
  ) {}
}

const processedText = computed<TextPiece[]>(() => {
  const text = props.text;
  const pieces: TextPiece[] = [];

  let currentTag: Tag | null = null;
  let currentText = "";

  const flush = () => {
    if (currentText) {
      pieces.push(new TextPiece(currentTag, currentText));
      currentText = "";
    }
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === "*") {
      flush();
      currentTag = currentTag === Tag.Asterisks ? null : Tag.Asterisks;
    } else if (char === '"') {
      flush();
      currentTag = currentTag === Tag.Quotes ? null : Tag.Quotes;
    } else if (char === "[") {
      flush();
      currentTag = currentTag === Tag.SystemCommand ? null : Tag.SystemCommand;
    } else if (char === "]") {
      flush();
      currentTag = null;
    } else {
      currentText += char;
    }
  }

  flush();

  return pieces;
});
</script>

<template lang="pug">
component(:is="as")
  template(v-for="piece in processedText")
    span(v-if="piece.tag === null") {{ piece.text }}
    span.italic.text-gray-500(v-else-if="piece.tag === Tag.Asterisks") *{{ piece.text }}*
    span.font-medium(v-else-if="piece.tag === Tag.Quotes") "{{ piece.text }}"
    span.italic.text-secondary-200(v-else-if="piece.tag === Tag.SystemCommand") [{{ piece.text }}]
</template>
