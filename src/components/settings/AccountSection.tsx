import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field, TextInput } from "@/components/app/ui-kit";
import { friendlyError } from "@/lib/errors";
import { SettingsSection } from "./shared";

const MIN_PASSWORD = 8;

export function AccountSection({ email, readOnly }: { email: string | null; readOnly: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: async () => {
      if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters`);
      if (password !== confirm) throw new Error("The passwords don't match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (/different from the old/i.test(error.message)) throw new Error("Choose a password you haven't used before");
        if (/weak|pwned|leaked/i.test(error.message)) throw new Error("This password is too easy to guess. Choose a stronger one.");
        throw error;
      }
    },
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      toast.success("Password changed");
    },
    onError: (e) => toast.error(friendlyError(e, "Could not change your password. Please try again.")),
  });

  return (
    <div className="space-y-6">
      <SettingsSection id="account" title="Sign-in" description="The email address you sign in with."
        onSave={readOnly ? undefined : () => change.mutate()} saving={change.isPending} saveLabel="Change password" disabled={readOnly}>
        <Field label="Email" hint="To change the email address on your account, contact support.">
          <TextInput value={email ?? ""} readOnly disabled className="bg-mist/50" />
        </Field>
        {readOnly ? (
          <p className="text-sm text-muted-foreground">The password of a demo account can't be changed.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
              <TextInput type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <TextInput type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Close your account">
        <p className="text-sm text-muted-foreground">
          Want to stop using the platform? Contact support and we'll close your account. Confirmed bookings and commission
          records are kept for as long as the law requires for accounting.
        </p>
      </SettingsSection>
    </div>
  );
}
