import React from 'react';

interface MarkdownMessageProps {
  text: string;
  userMessage?: boolean;
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function inlineNodes(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\`[^\`]+\`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|~~[^~]+~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = keyPrefix + '_' + match.index;

    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={key} className="font-black">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key} dir="ltr" className="mx-0.5 rounded-md bg-black/8 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[0.92em] break-all">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('~~')) {
      out.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const href = link ? safeHref(link[2]) : null;
      out.push(href ? (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold underline underline-offset-2 decoration-current/40 break-words"
        >
          {link![1]}
        </a>
      ) : token);
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ text, userMessage = false }) => {
  if (userMessage) {
    return <div dir="auto" className="whitespace-pre-wrap break-words">{text}</div>;
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <div key={'code_' + i} className="my-2 overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-[#17151D] text-[#F4F1F8]">
          {language && <div className="px-3 py-1.5 text-[9px] font-bold text-white/55 border-b border-white/10" dir="ltr">{language}</div>}
          <pre dir="ltr" className="overflow-x-auto p-3 text-[10px] leading-5 whitespace-pre font-mono"><code>{code.join('\n')}</code></pre>
        </div>
      );
      continue;
    }

    if (!line.trim()) {
      blocks.push(<div key={'gap_' + i} className="h-2" />);
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div key={'h_' + i} dir="auto" className={level === 1 ? 'text-base font-black mt-2 mb-1' : level === 2 ? 'text-sm font-black mt-2 mb-1' : 'text-xs font-black mt-1.5 mb-1'}>
          {inlineNodes(heading[2], 'h' + i)}
        </div>
      );
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      blocks.push(<hr key={'hr_' + i} className="my-2 border-current/10" />);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={'q_' + i} dir="auto" className="my-2 border-r-3 border-[#7B5BE7]/50 bg-[#7B5BE7]/8 rounded-l-lg px-3 py-2 text-[0.96em]">
          {quote.map((q, index) => <div key={index}>{inlineNodes(q, 'q' + i + '_' + index)}</div>)}
        </blockquote>
      );
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const m = orderedList
          ? lines[i].match(/^\s*\d+\.\s+(.+)$/)
          : lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      const ListTag = orderedList ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={'list_' + i}
          dir="auto"
          className={orderedList ? 'my-1.5 pr-5 list-decimal space-y-1' : 'my-1.5 pr-5 list-disc space-y-1'}
        >
          {items.map((item, index) => <li key={index}>{inlineNodes(item, 'li' + i + '_' + index)}</li>)}
        </ListTag>
      );
      continue;
    }

    blocks.push(
      <p key={'p_' + i} dir="auto" className="whitespace-pre-wrap break-words my-0.5">
        {inlineNodes(line, 'p' + i)}
      </p>
    );
    i += 1;
  }

  return <div className="markdown-message">{blocks}</div>;
};
