const HEADLINE = "The shape of a codebase, drawn from the source.";
const WORDS = HEADLINE.split(" ");

/**
 * The headline lifts in word by word, then the last phrase takes a selection
 * wash. It is the page's one orchestrated entrance; everything after it is
 * static. The text is still one h1, so it reads in order before the animation
 * runs.
 */
export function HeroHeadline() {
  return (
    <h1 className="max-w-[17ch] text-[clamp(2.8rem,5.8vw,5.15rem)] leading-[0.98] font-medium tracking-[-0.055em] text-balance">
      {WORDS.map((word, index) => {
        const last = index === WORDS.length - 1;
        return (
          <span key={`${word}-${index}`}>
            <span
              className="atlas-word"
              style={{ animationDelay: `${70 + index * 38}ms` }}
            >
              {last ? <span className="atlas-highlight">{word}</span> : word}
            </span>
            {last ? null : " "}
          </span>
        );
      })}
    </h1>
  );
}
