"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model answers as markdown (GFM: tables, task lists, etc.).
 * Links open in a new tab. Uses React elements only — no dangerouslySetInnerHTML.
 */
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props: any) => {
            const { node, children, ...rest } = props;
            return (
              <a {...rest} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
