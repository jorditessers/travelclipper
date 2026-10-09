import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Faq } from "@/lib/faq";

export function FaqList({ items, idPrefix }: { items: Faq[]; idPrefix: string }) {
  return (
    <Accordion type="multiple" className="divide-y divide-ink/10 border-y border-ink/10">
      {items.map((f, i) => (
        <AccordionItem key={f.q} value={`${idPrefix}-${i}`} className="border-0">
          <AccordionTrigger className="py-5 text-left font-display text-lg font-normal text-ink hover:no-underline">{f.q}</AccordionTrigger>
          <AccordionContent className="space-y-3 pb-5 text-[15px] leading-relaxed text-ink/70">
            {f.a.map((p) => <p key={p}>{p}</p>)}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
