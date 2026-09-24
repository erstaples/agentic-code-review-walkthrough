# kanko — One in context

The selected identity combines a left guide rail and pointer, three code lines with the middle line emphasized, and open framing corners on the right.

## Assets

- `kanko-icon.svg`: primary rounded-square color master, with transparent outer corners.
- `kanko-icon-{size}.png`: renders at 16, 24, 32, 48, 128, 256, 512, and 1024 pixels.
- `kanko-mark-on-light.svg` and `kanko-mark-on-dark.svg`: transparent standalone marks with colors appropriate to the background.
- `kanko-sidebar.svg`: simplified single-color 24px outline master in neutral gray. Explicit white and dark variants are also supplied.
- `kanko-lockup-on-light.svg` and `kanko-lockup-on-dark.svg`: horizontal icon-and-wordmark masters, with transparent backgrounds and corresponding PNG renders.
- `kanko-wordmark-on-light.svg` and `kanko-wordmark-on-dark.svg`: standalone lowercase wordmark.
- `kanko-masters.png` / `.svg`: presentation sheet with light and dark applications and actual-size samples.

## Palette

Indigo `#2E2873`; violet `#A99BF5`; contextual lines `#776CB3`; active line and pointer `#F4F0FF`.

## Construction and verification

These are clean vector constructions of the selected concept. Every wordmark spells `kanko` in lowercase and uses outlined Ubuntu Medium letterforms, so the masters do not require an installed font. The source font is not bundled. The sidebar uses simplified strokes and line lengths to retain hierarchy in one color.

SVG parsing, PNG dimensions and transparency, and the package contents were checked. The presentation was visually checked on light and dark backgrounds. The icons have not been tested within a running VS Code extension.
