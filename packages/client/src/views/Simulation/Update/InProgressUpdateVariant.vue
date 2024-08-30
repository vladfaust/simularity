<template lang="pug">
//- Top row.
.flex.items-center.justify-between.gap-2
  div

  //- Buttons.
  .flex.items-center.gap-2
    slot(name="extra")
    slot(name="variant-navigation")

//- Text.
p.leading-snug
  span.-my-1.inline-block.h-5.w-2.animate-pulse.bg-black(
    style="animation-duration: 500ms"
  )
</template>
