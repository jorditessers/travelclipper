import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetails, LegalPage } from "@/components/site/LegalPage";
import { TERMS_BLOCKS } from "@/lib/legal-content";
import { LEGAL_ENTITY, TERMS_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Algemene Voorwaarden — ${LEGAL_ENTITY.platformName}` },
      { name: "description", content: `Algemene Voorwaarden voor zakelijke gebruikers van ${LEGAL_ENTITY.platformName}.` },
      { property: "og:title", content: `Algemene Voorwaarden — ${LEGAL_ENTITY.platformName}` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => (
    <LegalPage title="Algemene Voorwaarden" subtitle="B2B Travel Distribution Platform" version={TERMS_VERSION} blocks={TERMS_BLOCKS}
      intro={<CompanyDetails fields={["platformName", "legalName", "coc", "vat", "address", "email"]} />} />
  ),
});
