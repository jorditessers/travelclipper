import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { PRIVACY_BLOCKS, PRIVACY_BLOCKS_NL } from "@/lib/legal-content";
import { LEGAL_ENTITY, PRIVACY_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Statement — ${LEGAL_ENTITY.platformName}` },
      { name: "description", content: `How ${LEGAL_ENTITY.platformName} processes personal data.` },
      { property: "og:title", content: `Privacy Statement — ${LEGAL_ENTITY.platformName}` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => (
    <LegalPage subtitle="B2B Travel Distribution Platform" version={PRIVACY_VERSION}
      en={{ title: "Privacy Statement", blocks: PRIVACY_BLOCKS }} nl={{ title: "Privacyverklaring", blocks: PRIVACY_BLOCKS_NL }} />
  ),
});
