import { describe, it, expect } from "vitest";
import { createGame, draw, finishTurn, undo, skip, cardsLeft, summarize, upNext, playableCards, shuffle, replay } from "./game";

const seq = () => { let i = 0; return (n: number) => (i++ * 7) % n; };
const base = { deckId: "d", artVersion: 1, lang: "en", names: ["Hana", "", "Kevin"], jokers: true, endMode: "last" as const };

function playToEnd(g: ReturnType<typeof createGame>) {
  let n = 0;
  while (g.status === "playing") { g = finishTurn(draw(g).game); n++; }
  return { g, n };
}

describe("setup", () => {
  it("builds 54 or 52 cards and names blank players", () => {
    const g = createGame(base, seq());
    expect(g.order).toHaveLength(54);
    expect(createGame({ ...base, jokers: false }).order).toHaveLength(52);
    expect(g.players.map((p) => p.name)).toEqual(["Hana", "Player 2", "Kevin"]);
    expect(new Set(g.order).size).toBe(54);
  });
  it("clamps player count to 2–12", () => {
    expect(createGame({ ...base, names: ["a"] }).players).toHaveLength(2);
    expect(createGame({ ...base, names: Array(20).fill("x") }).players).toHaveLength(12);
  });
  it("shuffle keeps every card", () => {
    const cards = playableCards(true);
    expect(shuffle(cards).sort()).toEqual([...cards].sort());
  });
});

describe("turns", () => {
  it("passes the turn in order and wraps around", () => {
    let g = createGame(base, seq());
    const r1 = draw(g); expect(r1.player).toBe(0); g = finishTurn(r1.game);
    const r2 = draw(g); expect(r2.player).toBe(1); g = finishTurn(r2.game);
    const r3 = draw(g); expect(r3.player).toBe(2); g = finishTurn(r3.game);
    expect(g.turn).toBe(0);
    expect(cardsLeft(g)).toBe(51);
    expect(upNext(g).map((p) => p.name)).toEqual(["Player 2", "Kevin"]);
  });
  it("skip moves to the next player without drawing", () => {
    const g = skip(createGame(base, seq()));
    expect(g.turn).toBe(1); expect(g.idx).toBe(0);
  });
  it("undo puts the card back and restores whose turn it was", () => {
    let g = createGame(base, seq());
    g = finishTurn(draw(g).game, { rule: "No pointing" });
    expect(g.rules).toHaveLength(1);
    g = undo(g);
    expect(g.idx).toBe(0); expect(g.turn).toBe(0); expect(g.drawn).toHaveLength(0); expect(g.rules).toHaveLength(0);
  });
});

describe("effects", () => {
  it("records rules, mates and masters", () => {
    let g = createGame(base, seq());
    g = { ...g, order: ["JS", "8H", "QD", ...g.order.filter((c) => !["JS", "8H", "QD"].includes(c))], effects: { J: "rule", 8: "mate", Q: "master", K: "cup" } };
    let r = draw(g); expect(r.effect).toBe("rule"); g = finishTurn(r.game, { rule: "  Drink with your left hand " });
    r = draw(g); expect(r.effect).toBe("mate"); g = finishTurn(r.game, { mate: 0 });
    r = draw(g); expect(r.effect).toBe("master"); g = finishTurn(r.game);
    expect(g.rules[0]).toEqual({ text: "Drink with your left hand", by: "Hana" });
    expect(g.mates).toEqual([[1, 0]]);
    expect(g.masters.Q).toBe(2);
  });
  it("ignores a mate pick of yourself", () => {
    let g = createGame(base, seq());
    g = { ...g, order: ["8H", ...g.order.filter((c) => c !== "8H")] };
    g = finishTurn(draw(g).game, { mate: 0 });
    expect(g.mates).toEqual([]);
  });
});

describe("ending", () => {
  it("'last card' mode plays all 54 cards, overflowing the cup on the 4th King", () => {
    let overflowAt = -1, i = 0;
    let g = createGame(base, seq());
    while (g.status === "playing") { const r = draw(g); if (r.cupOverflow) overflowAt = i; g = finishTurn(r.game); i++; }
    expect(i).toBe(54); expect(g.endedBy).toBe("last"); expect(overflowAt).toBeGreaterThanOrEqual(3); expect(g.kings).toBe(4);
  });
  it("'4th King' mode ends on the 4th King", () => {
    const { g, n } = playToEnd(createGame({ ...base, endMode: "king4" }, seq()));
    expect(g.endedBy).toBe("king4");
    expect(g.drawn[n - 1].card.startsWith("K")).toBe(true);
    expect(g.kings).toBe(4);
    const s = summarize(g);
    expect(s.cupDrinker).toBe(g.players[g.drawn[n - 1].player].name);
    expect(s.perPlayer.reduce((a, p) => a + p.cards, 0)).toBe(n);
  });
  it("draw() refuses once the deck is empty, and replay reshuffles with the same players", () => {
    const { g } = playToEnd(createGame(base, seq()));
    expect(() => draw(g)).toThrow();
    const again = replay(g);
    expect(again.players).toEqual(g.players); expect(again.status).toBe("playing"); expect(again.idx).toBe(0);
  });
});
