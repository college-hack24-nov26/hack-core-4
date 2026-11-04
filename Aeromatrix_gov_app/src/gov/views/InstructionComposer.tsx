import { useState } from 'react';
import { Copy, Mail, MessageCircle, Check, Share2 } from 'lucide-react';
import { Btn, Field, inputCls } from '../ui';
import { mailtoLink, whatsappLink, type Department } from '../lib/routing';
import { NOT_SENT_NOTE, copyText } from '../lib/instructions';
import { canShareText, shareText } from '../lib/share';
import { Select } from '../../components/Select';

const OTHER = '__other__';

export interface ComposerResult {
  to: string;
  deadline: string;
  message: string;
}

/**
 * Prepares an instruction. The Commissioner edits the text, then copies it or opens a draft; "Approve" records the
 * instruction in this browser. Nothing is ever sent by the app.
 */
export function InstructionComposer({
  departments,
  deadline: initialDeadline,
  message: initialMessage,
  subject,
  approveLabel,
  onApprove,
}: {
  departments: Department[];
  deadline: string;
  message: string;
  subject: string;
  approveLabel?: string;
  onApprove?: (r: ComposerResult) => void;
}) {
  const [choice, setChoice] = useState<string>(departments[0]?.name ?? OTHER);
  const [typed, setTyped] = useState('');
  const [deadline, setDeadline] = useState(initialDeadline);
  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);
  const to = choice === OTHER ? typed.trim() : choice;
  const fullText = `${message}\n\nDeadline: ${deadline}`;
  const validDeadline = /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const canApprove = to.length > 0 && message.trim().length > 0 && validDeadline;

  const doCopy = async () => {
    const ok = await copyText(fullText);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Field label="Send to">
        <Select value={choice} onChange={(e) => setChoice(e.target.value)} className={inputCls} aria-label="Recipient">
          {departments.map((d) => (
            <option key={d.key} value={d.name}>
              {d.name}
            </option>
          ))}
          <option value={OTHER}>Someone else</option>
        </Select>
      </Field>
      {choice === OTHER && (
        <Field label="Name, office or email">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} />
        </Field>
      )}
      <Field label="Deadline">
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Message">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} className={`${inputCls} py-3 leading-relaxed`} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => void doCopy()} icon={copied ? Check : Copy}>
          {copied ? 'Copied' : 'Copy'}
        </Btn>
        <Btn href={mailtoLink(to, subject, fullText)} icon={Mail} title="Opens a draft in your email app">
          Email
        </Btn>
        <Btn href={whatsappLink(fullText)} icon={MessageCircle} title="Opens a WhatsApp draft; you pick the contact">
          WhatsApp
        </Btn>
        {canShareText() && (
          <Btn icon={Share2} onClick={() => void shareText(subject, fullText)} title="Opens the share sheet; you pick the app and the person">
            Share
          </Btn>
        )}
      </div>
      <p className="text-xs text-sand-400">{NOT_SENT_NOTE}</p>
      {onApprove && (
        <Btn variant="primary" disabled={!canApprove} className="w-full" onClick={() => onApprove({ to, deadline, message })}>
          {approveLabel ?? 'Approve instruction'}
        </Btn>
      )}
    </div>
  );
}
