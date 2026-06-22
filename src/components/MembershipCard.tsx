import { formatDate } from '@/lib/utils';

// ===========================================================================
// Overlay positions as PERCENT of the 1672 x 941 card image.
// Tune these 4 lines so the values sit on the blank lines next to the labels
// (REG. No: / NAME: / PACKAGE: / D.O.J:) on your card design.
// ===========================================================================
const POS = {
  reg: { top: 33, left: 60 },
  name: { top: 46, left: 60 },
  pkg: { top: 59, left: 60 },
  doj: { top: 72, left: 60 },
};
const VALUE_FONT = '2.5cqw'; // scales with card width
const VALUE_MAX_WIDTH = '36%'; // keeps long names contained

export default function MembershipCard({
  regNo,
  name,
  packageName,
  doj,
}: {
  regNo?: string | null;
  name?: string | null;
  packageName?: string | null;
  doj?: string | null;
}) {
  return (
    <div className="membership-card-print mx-auto w-full max-w-[1100px]">
      <div
        className="relative w-full overflow-hidden rounded-lg"
        style={{ aspectRatio: '1672 / 941', containerType: 'inline-size' } as React.CSSProperties}
      >
        <img
          src="/membership-card.png"
          alt="GainShred Membership Card"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <Value pos={POS.reg} text={regNo ?? ''} />
        <Value pos={POS.name} text={name ?? ''} />
        <Value pos={POS.pkg} text={packageName ?? ''} />
        <Value pos={POS.doj} text={doj ? formatDate(doj) : ''} />
      </div>
    </div>
  );
}

function Value({ pos, text }: { pos: { top: number; left: number }; text: string }) {
  return (
    <div
      className="absolute font-bold leading-none text-white"
      style={{
        top: `${pos.top}%`,
        left: `${pos.left}%`,
        fontSize: VALUE_FONT,
        maxWidth: VALUE_MAX_WIDTH,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textShadow: '0 1px 3px rgba(0,0,0,0.45)',
      }}
    >
      {text}
    </div>
  );
}
