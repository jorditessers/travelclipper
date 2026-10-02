import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { TERMS_BLOCKS, TERMS_BLOCKS_NL } from "@/lib/legal-content";
import { LEGAL_ENTITY, TERMS_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms and Conditions — ${LEGAL_ENTITY.platformName}` },
      { name: "description", content: `Terms and Conditions for business users of ${LEGAL_ENTITY.platformName}.` },
      { property: "og:title", content: `Terms and Conditions — ${LEGAL_ENTITY.platformName}` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => (
    <LegalPage subtitle="B2B Travel Distribution Platform" version={TERMS_VERSION}
      en={{ title: "Terms and Conditions", blocks: TERMS_BLOCKS }} nl={{ title: "Algemene Voorwaarden", blocks: TERMS_BLOCKS_NL }}
      companyFields={["platformName", "legalName", "coc", "vat", "address", "email"]} />
  ),
});
