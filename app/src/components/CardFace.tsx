import { memo, useEffect, useRef } from "react";
import { drawCard, contentFor } from "../../../shared/render";
import { cardImage } from "../lib/deckCache";
import type { Deck } from "../lib/decks";

/** Draws a card from the device cache, with the deck's action text in the chosen language. */
export const CardFace = memo(function CardFace({ deck, card, lang, text = true, className }: {
  deck: Deck; card: string; lang: string; text?: boolean; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { content, box } = contentFor(deck, card, lang);
  // Redraw when the text, its position or the style changes (e.g. action text edited on the dashboard).
  const look = JSON.stringify([text ? content : null, box, deck.textStyle]);
  useEffect(() => {
    let alive = true;
    cardImage(deck.id, deck.artVersion ?? 0, card).then((img) => {
      if (!alive || !ref.current) return;
      drawCard(ref.current, img, deck.textStyle, text ? content : null, box);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [deck.id, deck.artVersion, card, look]);
  return <canvas ref={ref} className={`cardface ${className ?? ""}`} aria-label={card === "BACK" ? "Card back" : `Card ${card}`} role="img" />;
});
