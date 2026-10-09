// Questions and answers for the How it works page (and the short FAQ on the homepage).
export type Faq = { q: string; a: string[] };
export type FaqGroup = { id: string; title: string; items: Faq[] };

export const FAQ: FaqGroup[] = [
  {
    id: "general",
    title: "General",
    items: [
      {
        q: "What is Holiday Clippers?",
        a: [
          "Holiday Clippers connects independent stays (villas, boutique hotels, B&Bs) with the people travellers already trust: creators, travel advisors, curators and niche communities.",
          "Accommodations list their stay and set a commission. Partners share it with their audience through a personal tracking link and earn on every booking that comes through it.",
        ],
      },
      {
        q: "Who is it for?",
        a: [
          "Holiday Clippers is for business users only: accommodation owners and managers, and professional distribution partners such as creators, travel advisors, agencies and publishers.",
          "Travellers don't use Holiday Clippers directly. They book with the accommodation itself.",
        ],
      },
      {
        q: "What does it cost to join?",
        a: [
          "Joining is free for everyone. Accommodations only pay commission on confirmed bookings that came through a partner. No bookings, no costs.",
        ],
      },
    ],
  },
  {
    id: "accommodations",
    title: "For accommodations",
    items: [
      {
        q: "How much commission do I pay?",
        a: [
          "You choose the commission pool per stay yourself. Most stays offer 8–12%, which is less than the roughly 15% you pay on Airbnb or Booking.com.",
          "Example: a €2,000 booking with a 10% pool means €200 commission. €140 goes to the partner who sent the guest and €60 to Holiday Clippers.",
        ],
      },
      {
        q: "Do guests book through Holiday Clippers?",
        a: [
          "No. Guests book directly with you, through your own booking page, website, email or phone. You keep the guest relationship and the payment.",
          "The partner's tracking link sends travellers straight to your booking page, with the partner's code attached.",
        ],
      },
      {
        q: "How do I know a booking came from a partner?",
        a: [
          "Every partner gets a unique tracking link and code. Clicks are recorded, and travellers who book by phone or email can mention the code.",
          "When a partner reports a booking, you check it against your reservations and confirm or reject it. Commission is only due on bookings you confirm.",
        ],
      },
      {
        q: "How long does the review of my stay take?",
        a: [
          "We check every stay personally before it goes live, usually within 1–3 working days. You'll get an email as soon as it's approved, or if we need anything else from you.",
        ],
      },
      {
        q: "Can I pause my stay or change my commission?",
        a: [
          "Yes. You can pause your stay at any time, change the commission, or run a temporary higher commission, for example in low season. Bookings that are already confirmed keep the commission they were made with.",
        ],
      },
      {
        q: "How do I pay the commission?",
        a: [
          "After the guests have checked out, we send you one invoice for the commission on your confirmed bookings. We then pay the partner their share, so you only deal with us.",
        ],
      },
    ],
  },
  {
    id: "partners",
    title: "For creators and travel advisors",
    items: [
      {
        q: "How do I earn?",
        a: [
          "Pick stays that suit your audience, get your tracking link and share it on Instagram, in your newsletter, on your blog or with your clients. Every confirmed booking through your link earns you commission.",
        ],
      },
      {
        q: "How much do I earn?",
        a: [
          "You get 70% of the commission pool the accommodation sets. Each stay shows exactly what you earn.",
          "Example: a €2,000 booking with a 10% pool means €200 commission, of which €140 is yours.",
        ],
      },
      {
        q: "When do I get paid?",
        a: [
          "We pay out once a month, in one payment, to the bank account in your settings. Each payout covers your confirmed bookings whose guests checked out in the previous month.",
          "Cancelled or refunded bookings don't earn commission.",
        ],
      },
      {
        q: "What if a guest books by phone or email?",
        a: [
          "Your tracking link also comes with a short code. Travellers can mention it when they book by phone or email, and the accommodation registers the booking with your code so it's credited to you.",
          "You can also report a booking yourself. The accommodation then confirms it.",
        ],
      },
      {
        q: "Do I need a lot of followers?",
        a: [
          "No. A small audience that trusts you often books more than a large one. Holiday Clippers works for every niche, from family travel and wellness to food, design or adventure.",
        ],
      },
    ],
  },
];

/** The questions shown on the homepage. */
export const HOME_FAQ: Faq[] = [FAQ[0]!.items[0]!, FAQ[0]!.items[2]!, FAQ[1]!.items[1]!, FAQ[2]!.items[2]!];
