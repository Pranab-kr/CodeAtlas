# Phase 14 — UI pass

**Goal.** Sharpen the interface that phase 13 introduced without giving the
landing page a design system of its own. Same warm-paper tokens, same Inter and
mono pairing, same hairline rules. The change is in proportion, hierarchy and
one deliberate motion cue.

## Landing

- A sticky header carries the same mark the app uses, three section links and
  the theme control. The links underline on hover and focus, and the header's
  bottom rule only appears once the page has moved.
- The hero headline is larger, tighter and set on two clear thoughts. The last
  phrase sits under a text-selection wash, in the same blue the map uses for a
  selected file. It is a reference to selecting text in an editor, not a new
  accent colour.
- Behind the hero, a faint graph-paper grid fades out at the edges. It is drawn
  from the border token at low opacity and drifts almost imperceptibly. It is
  decoration, so it is `aria-hidden` and stops under reduced motion.
- The hero keeps the repository field as the first thing you can touch. The
  field gains a leading repository icon and reads as one command bar rather
  than an input next to a button. It still submits straight into the flow.
- The two illustrations are framed as plates, with corner ticks and a mono
  caption that names the figure. The drawings themselves stay unlabelled and
  static; only the plate rises into view once on load.
- Sections keep the existing copy and order. "How it works" keeps its numbers
  because it is a sequence. The other sections lose nothing and gain only
  spacing and hover states.
- The limits section gets the page's second typographic moment: **Absent beats
  approximate.** set large in the margin, with each limit marked by a quiet
  cross. The cross is muted, never destructive red.
- A closing band repeats the repository field so the page ends with the
  product, then a quiet footer with the mark and the section links.

## Sign in and sign up

- Split shell: the form on one side, the product's mark, one sentence and a
  drawn figure on the other. On phone width the aside drops away and the form
  is the whole page.
- Both pages use the same shell; only the sentence changes.

## App

- The app header carries the mark, and the landing page is reachable from it.
- The dashboard submit field matches the hero command bar at tool density.
- The empty analyses state points at the field above it instead of sitting as a
  bare sentence.
- A running analysis has a live dot. A queued or finished one does not.
- The progress page shows a hairline bar for how far the run has got, and the
  current stage mark breathes. Failed and stale runs keep their current
  treatment.
- The analysis bar shows the detected framework and the commit as quiet chips.
- The workspace keeps its density. Selected nodes, panel headers, rail rows and
  type chips gain colour transitions; nothing changes size or position.

## Motion rules

- One orchestrated load on the landing page: headline words rise, the
  highlight sweeps, the plate and form follow. Nothing else on the page enters
  on scroll.
- Motion in the app only answers state: hover, selection, a run advancing.
- Everything stops under `prefers-reduced-motion: reduce`, and the headline and
  highlight are fully visible in that mode.
- No new npm dependency. The two 21st.dev pieces are the CSS-only animated
  grid and the text-reveal pattern, adapted to the project's tokens and CSS.

## Constraints

- No new colour token. The highlight uses selection; the grid uses border.
- No invented claim, logo wall, testimonial or pricing.
- The illustrations stay unlabelled. A caption names the plate, not its nodes.
- The landing page and the app still share one type scale, one radius and one
  set of tokens.

## Acceptance check

1. Open the landing page signed out. The hero reads as one composition: headline,
   selected phrase, sentence, command bar, plate.
2. Reload. The page settles once, quickly, and then holds still. Nothing
   re-enters when you scroll.
3. Turn on reduced motion at the OS level and reload. Everything is visible
   immediately; the grid does not drift.
4. Toggle the theme. Grid, highlight, plates and captions are correct in both.
5. Paste a repository URL into either field. It still goes into sign-in and
   then the analysis.
6. Shrink to phone width. The header links drop, the hero stacks, the plate
   scales, the closing form stacks, nothing overflows sideways.
7. Open sign-in and sign-up. The aside is present on desktop and gone on phone.
8. Open the dashboard. The field, empty state and table read as one page.
9. Start an analysis. The running dot moves; the progress bar advances; the
   current stage mark breathes.
10. Open a finished analysis. The framework and commit chips read correctly,
    and selecting a node or row changes colour without moving the layout.
