/**
 * Inline <script> that runs while the HTML is parsed (before paint). The type
 * switch avoids React's dev warning about rendering scripts on the client.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
