import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { PRIVACY_BLOCKS } from "@/lib/legal-content";
import { LEGAL_ENTITY, PRIVACY_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacyverklaring — ${LEGAL_ENTITY.platformName}` },
      { name: "description", content: `Hoe ${LEGAL_ENTITY.platformName} persoonsgegevens verwerkt.` },
      { property: "og:title", content: `Privacyverklaring — ${LEGAL_ENTITY.platformName}` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => <LegalPage title="Privacyverklaring" subtitle="B2B Travel Distribution Platform" version={PRIVACY_VERSION} blocks={PRIVACY_BLOCKS} />,
});
