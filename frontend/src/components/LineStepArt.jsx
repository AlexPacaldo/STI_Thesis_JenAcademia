/**
 * Little pictures of what the child will see in LINE.
 *
 * !! Drawn as inline SVG on purpose: an image file is one more request that can
 * !! fail on a school connection, and these screens are the instruction. The
 * !! text beside them says the same thing, so they are marked decorative.
 */

const PHONE = {
  fill: "#ffffff",
  stroke: "#cfe3c6",
  strokeWidth: 3,
};

const SCREEN = {
  fill: "#f4faf1",
};

const BUBBLE_IN = {
  fill: "#ffffff",
  stroke: "#d6e2d4",
  strokeWidth: 1.5,
};

export function OpenLineArt() {
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true" focusable="false">
      <rect x="64" y="6" width="92" height="108" rx="16" {...PHONE} />
      <rect x="73" y="18" width="74" height="84" rx="10" {...SCREEN} />

      {/* The friend list heading. */}
      <rect x="82" y="25" width="34" height="6" rx="3" fill="#cfe3c6" />

      {/* The school's card, with the add-friend plus. */}
      <rect x="80" y="39" width="60" height="31" rx="9" fill="#eaf7e4" stroke="#2f7a3d" strokeWidth="1.5" />
      <circle cx="93" cy="54" r="8" fill="#2f7a3d" />
      <path d="M93 50v8M89 54h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="106" y="48" width="27" height="5" rx="2.5" fill="#8fb894" />
      <rect x="106" y="57" width="18" height="4" rx="2" fill="#cfe3c6" />

      {/* A second row, so it reads as a list. */}
      <rect x="80" y="76" width="60" height="18" rx="8" fill="#fff" stroke="#e2ede0" />
      <circle cx="91" cy="85" r="5" fill="#dbe8d7" />
      <rect x="100" y="83" width="28" height="4" rx="2" fill="#dbe8d7" />

      {/* The big plus floating beside the phone. */}
      <circle cx="166" cy="38" r="17" fill="#2f7a3d" />
      <path d="M166 31v14M159 38h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M146 53c7 4 12 5 15 5"
        stroke="#9dbfa2"
        strokeWidth="2"
        strokeDasharray="3 4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Sparkles. */}
      <path d="M49 33l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#79a847" opacity="0.7" />
      <circle cx="45" cy="76" r="3" fill="#cfe3c6" />
    </svg>
  );
}

export function SendCodeArt({ code = "" }) {
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true" focusable="false">
      <rect x="58" y="6" width="104" height="108" rx="16" {...PHONE} />
      <rect x="67" y="18" width="86" height="84" rx="10" {...SCREEN} />

      {/* What the school says first. */}
      <rect x="74" y="24" width="54" height="22" rx="11" {...BUBBLE_IN} />
      <rect x="81" y="30" width="34" height="4" rx="2" fill="#cfe3c6" />
      <rect x="81" y="37" width="22" height="4" rx="2" fill="#dbe8d7" />

      {/* The child sends the six digits back. Until a code exists the bubble
          shows dots, so the picture never claims a number that is not real. */}
      <rect x="88" y="52" width="58" height="24" rx="12" fill="#2f7a3d" />
      <text
        x="117"
        y="68"
        textAnchor="middle"
        fontFamily="Segoe UI, sans-serif"
        fontSize="11"
        fontWeight="800"
        letterSpacing="2"
        fill="#ffffff"
      >
        {code || "••••••"}
      </text>

      {/* The chat box under it. */}
      <rect x="74" y="84" width="72" height="12" rx="6" fill="#fff" stroke="#d6e2d4" />
      <circle cx="138" cy="90" r="5" fill="#79a847" />
      <path d="M136 90h4M138 88v4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />

      {/* Sparkles around the sent code. */}
      <path d="M45 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#79a847" opacity="0.7" />
      <circle cx="173" cy="88" r="3" fill="#cfe3c6" />
    </svg>
  );
}

export function WaitingArt() {
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true" focusable="false">
      <rect x="64" y="6" width="92" height="108" rx="16" {...PHONE} />
      <rect x="73" y="18" width="74" height="84" rx="10" {...SCREEN} />

      {/* The last bubble the child sent. */}
      <rect x="92" y="28" width="48" height="18" rx="9" fill="#2f7a3d" opacity="0.9" />
      <rect x="100" y="34" width="32" height="5" rx="2.5" fill="#b7d8b0" />

      {/* The school is thinking. */}
      <rect x="78" y="54" width="40" height="18" rx="9" {...BUBBLE_IN} />
      <circle cx="88" cy="63" r="2.2" fill="#9dbfa2" />
      <circle cx="95" cy="63" r="2.2" fill="#9dbfa2" />
      <circle cx="102" cy="63" r="2.2" fill="#9dbfa2" />

      {/* A small clock above the phone. */}
      <circle cx="166" cy="34" r="15" fill="#fff" stroke="#2f7a3d" strokeWidth="3" />
      <path d="M166 26v8l5 3" stroke="#2f7a3d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M144 47c6 2 10 4 12 6" stroke="#9dbfa2" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" fill="none" />

      {/* Waiting dots beside the phone. */}
      <circle cx="48" cy="62" r="3" fill="#cfe3c6" />
      <circle cx="36" cy="62" r="3" fill="#dbe8d7" />
    </svg>
  );
}

export function TickArt() {
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true" focusable="false">
      <rect x="64" y="6" width="92" height="108" rx="16" {...PHONE} />
      <rect x="73" y="18" width="74" height="84" rx="10" {...SCREEN} />

      <rect x="80" y="26" width="52" height="18" rx="9" {...BUBBLE_IN} />
      <rect x="88" y="32" width="30" height="5" rx="2.5" fill="#cfe3c6" />

      {/* The tick, big enough to read from across a room. */}
      <circle cx="128" cy="76" r="25" fill="#2f7a3d" />
      <path
        d="M117 76l7 8 14-15"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Confetti. */}
      <path d="M168 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#79a847" />
      <circle cx="44" cy="40" r="3.5" fill="#f0b429" />
      <circle cx="178" cy="72" r="3" fill="#cfe3c6" />
      <path d="M48 84l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#9dbfa2" />
    </svg>
  );
}
