GainShred — static assets

Save your membership card design image in THIS folder as exactly:

    membership-card.png

(Recommended size ~1672 x 941 px, matching the card design.)

The membership card page (/members/[id]/card) uses /membership-card.png as the
background and overlays the member's REG No, NAME, PACKAGE, and D.O.J on top.

To fine-tune where the text sits on the blank lines, edit the POS percentages
near the top of:  src/components/MembershipCard.tsx
