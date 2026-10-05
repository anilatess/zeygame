type MascotMood = 'hello' | 'idle' | 'winner' | 'sad';

export function ZeyLogo() {
  return (
    <span className="zg-logo" aria-label="ZeyGame">
      <Mascot mood="idle" compact />
      <strong>
        <span>Z</span>e<span>y</span>G<span>a</span>m<span>e</span>
      </strong>
    </span>
  );
}

export function Mascot({
  mood = 'idle',
  compact = false,
}: {
  mood?: MascotMood;
  compact?: boolean;
}) {
  return (
    <svg
      className={`zg-mascot ${compact ? 'compact' : ''} ${mood}`}
      viewBox="0 0 180 180"
      role={compact ? undefined : 'img'}
      aria-label={compact ? undefined : 'ZeyGame maskotu'}
      aria-hidden={compact || undefined}
    >
      {mood === 'winner' && <path className="crown" d="m62 40 11-22 17 18 18-18 11 24" />}
      <path
        className="limb"
        d="M45 91Q23 91 18 116M133 91q23-4 28-26M67 143q-4 18-18 24M111 143q5 18 20 23"
      />
      <path
        className="body"
        d="M48 39Q85 20 124 42q18 18 11 48 9 42-25 55-37 13-67-5-19-16-8-44-8-36 13-57Z"
      />
      <ellipse className="eye" cx="72" cy="82" rx="6" ry="9" />
      <ellipse className="eye" cx="108" cy="82" rx="6" ry="9" />
      <circle className="cheek" cx="57" cy="99" r="7" />
      <circle className="cheek" cx="123" cy="99" r="7" />
      {mood === 'sad' ? (
        <path className="face" d="M76 116q14-15 28 0" />
      ) : (
        <path className="face" d="M73 104q17 22 35 0" />
      )}
      {mood === 'winner' && (
        <path
          className="trophy"
          d="M138 112h23v25h-23Zm5 25v10m-7 0h22M138 117h-8q0 15 11 15m20-15h8q0 15-11 15"
        />
      )}
    </svg>
  );
}

const drawings: Record<string, React.ReactNode> = {
  'Buz Kırma': (
    <>
      <circle cx="30" cy="49" r="17" />
      <path d="M18 68v34m0-18h25l18-39 34 14-10 52H44V81m18-35 14 24 15-10M72 73l-14 20 17 18" />
    </>
  ),
  'Çömelme Yarışı': (
    <>
      <circle cx="64" cy="35" r="15" />
      <path d="M63 51v30M63 58 38 76m25-18 24 18M63 81 33 101h61L63 81m-31-2-10-7m74 7 10-7" />
    </>
  ),
  'Ağız Açma Yarışı': (
    <>
      <circle cx="64" cy="70" r="43" />
      <circle cx="49" cy="57" r="7" />
      <circle cx="79" cy="57" r="7" />
      <ellipse cx="64" cy="83" rx="23" ry="27" />
      <path d="M24 24 12 12m92 12 12-12M64 18V5" />
    </>
  ),
  'Meyve Kesme': (
    <>
      <path d="M26 48q11-18 29 0-6 30-29 22-20 7-24-18 10-18 24-4Zm0-5q5-16 18-18" />
      <path d="m51 95 45-52 15 15-51 45Zm-5 8 14-5m38-54 8-8" />
      <circle cx="93" cy="91" r="15" />
      <path d="m86 91 5 5 9-12" />
    </>
  ),
  'Zıplama Yarışı': (
    <>
      <circle cx="64" cy="32" r="14" />
      <path d="M64 47v35M64 58 34 43m30 15 29-17M64 82l-28 30m28-30 28 30M16 91q10-17 20 0M99 81h21" />
    </>
  ),
  'Dans Taklidi': (
    <>
      <circle cx="60" cy="32" r="14" />
      <path d="M60 47v38M60 56 32 41m28 15 29-17M60 85l-25 27m25-27 29 25M96 30v18m0-18 12-4" />
      <path d="m46 21 7-13 9 10 10-10 7 14" />
    </>
  ),
  'Surat Taklidi': (
    <>
      <circle cx="42" cy="70" r="28" />
      <circle cx="89" cy="70" r="32" />
      <path d="M30 62h7m58 0h7M31 82q11-12 22 0M76 77q13 20 26 0M78 37l-4-17m19 16 9-16" />
    </>
  ),
  'Ağızla Yakala': (
    <>
      <circle cx="64" cy="70" r="40" />
      <circle cx="49" cy="57" r="7" />
      <circle cx="79" cy="57" r="7" />
      <ellipse cx="64" cy="83" rx="22" ry="25" />
      <circle cx="64" cy="13" r="8" />
      <path d="M64 21v12M24 27 12 15m92 12 12-15" />
    </>
  ),
  'Balon Patlatma': (
    <>
      <ellipse cx="43" cy="48" rx="22" ry="29" />
      <ellipse cx="88" cy="60" rx="20" ry="27" />
      <path d="m43 77-5 8h10l-5-8m45 10-5 8h10l-5-8M43 85q12 18 20 34M88 95q-11 13-20 24M18 37l-9-8m99 4 10-9" />
    </>
  ),
  'Don–Hareket Et': (
    <>
      <circle cx="38" cy="36" r="13" />
      <path d="M38 49v35M38 57 15 76m23-19 22 18M38 84l-20 28m20-28 22 28" />
      <rect x="72" y="24" width="38" height="76" rx="18" />
      <circle cx="91" cy="45" r="9" />
      <circle cx="91" cy="76" r="9" />
    </>
  ),
  'Sanal Kaleci': (
    <>
      <path d="M14 109V38h100v71M14 58h100M34 38v71m20-71v71m20-71v71m20-71v71" />
      <circle cx="64" cy="76" r="17" />
      <path d="m56 63 8-6 8 6-3 10H59l-3-10m-8 21 16 9 16-9" />
    </>
  ),
};

export function GameIllustration({ name }: { name: string }) {
  return (
    <div className="zg-game-art" aria-hidden="true">
      <svg viewBox="0 0 128 128">{drawings[name]}</svg>
    </div>
  );
}
