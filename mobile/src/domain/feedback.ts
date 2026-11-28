/** What a feedback email says about the phone, so a report can be reproduced. No baby data. */
export type FeedbackContext = {
  version: string | null;
  platform: string;
  osVersion: string | null;
  model: string | null;
};

/** A `mailto:` link with the subject and the phone details filled in (#105). */
export function feedbackMailto(to: string, ctx: FeedbackContext): string {
  const app = ['Napchime', ctx.version].filter(Boolean).join(' ');
  const phone = [ctx.model, [ctx.platform, ctx.osVersion].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const body = `\n\n\n---\n${app}\n${phone}`;
  const subject = encodeURIComponent(`Feedback on ${app}`);
  return `mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`;
}
