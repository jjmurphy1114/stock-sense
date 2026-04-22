import { useState } from "react";

const characterIconSlugByName: Record<string, string> = {
  BOWSER: "bowser",
  CAPTAIN_FALCON: "captain-falcon",
  DONKEY_KONG: "donkey-kong",
  DR_MARIO: "dr-mario",
  FALCO: "falco",
  FOX: "fox",
  GAME_AND_WATCH: "mr-game-and-watch",
  GANONDORF: "ganondorf",
  ICE_CLIMBERS: "ice-climbers",
  JIGGLYPUFF: "jigglypuff",
  KIRBY: "kirby",
  LINK: "link",
  LUIGI: "luigi",
  MARIO: "mario",
  MARTH: "marth",
  MEWTWO: "mewtwo",
  NANA: "ice-climbers",
  NESS: "ness",
  PEACH: "peach",
  PICHU: "pichu",
  PIKACHU: "pikachu",
  POPO: "ice-climbers",
  ROY: "roy",
  SAMUS: "samus",
  SHEIK: "sheik",
  YLINK: "young-link",
  YOSHI: "yoshi",
  YOUNG_LINK: "young-link",
  ZELDA: "zelda",
};

function getCharacterIconSrc(character: string): string | null {
  const slug = characterIconSlugByName[character];
  return slug ? `/stock-icons/${slug}.png` : null;
}

export default function CharacterIcon({
  character,
  className = "h-8 w-8",
}: {
  character: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const iconSrc = getCharacterIconSrc(character);

  if (!iconSrc || hasError) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/70 text-[10px] font-semibold uppercase tracking-wide text-slate-300 ${className}`}
        aria-hidden="true"
      >
        {character.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={iconSrc}
      alt={`${character} stock icon`}
      className={`rounded-full border border-slate-600/80 bg-slate-900/70 object-contain p-1 ${className}`}
      onError={() => setHasError(true)}
    />
  );
}
