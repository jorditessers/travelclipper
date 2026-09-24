import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NICHES } from "@/lib/constants";
import { Badge, Card, ChipMultiSelect, Field, NativeSelect, TextInput } from "./ui-kit";

/** Visual preview of form components — nothing is saved yet. */
export function SettingsPreview() {
  const [niches, setNiches] = useState<string[]>(["boutique"]);
  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Profile</h2>
        <Badge tone="clay">Preview — not saved</Badge>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Display name">
          <TextInput placeholder="Your name" />
        </Field>
        <Field label="Primary market">
          <NativeSelect
            options={[
              { value: "NL", label: "Netherlands" },
              { value: "BE", label: "Belgium" },
              { value: "DE", label: "Germany" },
            ]}
          />
        </Field>
      </div>
      <Field label="Niches">
        <ChipMultiSelect
          options={NICHES}
          value={niches}
          onChange={setNiches}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button variant="moss" onClick={() => toast.success("Looks good — saving comes in a later step")}>
          Save
        </Button>
      </div>
    </Card>
  );
}
