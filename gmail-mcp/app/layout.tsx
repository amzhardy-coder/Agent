import type { ReactNode } from "react";

export const metadata = { title: "Gmail Multi-Account Connector" };

const css = `
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, sans-serif; }
  body { margin: 0; padding: 24px; }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  .list { list-style: none; padding: 0; }
  .list li { display: flex; justify-content: space-between; align-items: center; gap: 12px;
             padding: 12px 0; border-bottom: 1px solid #8884; }
  .list li div { display: flex; flex-direction: column; }
  .muted { opacity: .65; } .small { font-size: .85rem; }
  .msg { padding: 10px 12px; border-radius: 8px; background: #8882; }
  .connect { display: flex; gap: 8px; flex-wrap: wrap; }
  input { flex: 1; min-width: 200px; padding: 10px; border-radius: 8px; border: 1px solid #8886; font: inherit; }
  button { padding: 10px 14px; border-radius: 8px; border: 0; background: #2563eb; color: white; font: inherit; cursor: pointer; }
  button.danger { background: transparent; color: #dc2626; border: 1px solid #dc262666; }
  code { background: #8882; padding: 2px 6px; border-radius: 4px; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
