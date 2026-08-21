import { Contact, DatabaseStore, DraftStore, MailspringContact, Message, QuotedHTMLTransformer } from 'mailspring-exports';
import { z } from 'zod';

import { formatMessage, json, text } from '../helpers';
import { DraftRecipientInput, ToolServer, UpdateDraftParams } from '../types';

const updateDraftDescription = 'Update an existing draft in place — subject, body, or recipients. The draft keeps its ID, its attachments and its position in the thread, so use this to revise a reply rather than creating a second draft. Edits are applied through Mailspring\'s own draft session, so a composer window that has the draft open updates live. This tool never sends anything.';

const recipientSchema = z.object({
	name: z.string().optional(),
	email: z.string(),
});

const updateDraftInputSchema = {
	id: z.string().describe('The draft message ID (as returned by list_drafts)'),
	subject: z.string().optional().describe('Replacement subject line'),
	body: z.string().optional().describe('Replacement body as raw HTML — pass <p>text</p>, never escaped entities like &lt;p&gt;'),
	bodyMode: z.enum(['replace', 'replaceAboveQuote', 'prepend', 'append']).default('replace')
		.describe("How `body` is applied. 'replace' overwrites the entire body. 'replaceAboveQuote' rewrites your own text but keeps the quoted reply beneath it — use this when revising a reply. 'prepend' and 'append' add to the existing body without removing anything."),
	to: z.array(recipientSchema).optional().describe('Replacement To recipients (replaces the existing list)'),
	cc: z.array(recipientSchema).optional().describe('Replacement CC recipients; pass [] to clear'),
	bcc: z.array(recipientSchema).optional().describe('Replacement BCC recipients; pass [] to clear'),
};

// `Contact` is a real model constructor at runtime, but mailspring-exports.d.ts
// types it as ModelClass<T> so that DatabaseStore.findAll(Contact) infers its
// row type. Widening that declaration to add a construct signature breaks the
// inference for every other caller, so the cast stays local to this file.
type ContactCtor = new (data: { name?: string; email: string }) => MailspringContact;

function toContact(recipient: DraftRecipientInput): MailspringContact
{
	return new (Contact as unknown as ContactCtor)({ name: recipient.name || '', email: recipient.email });
}

function countInlineImages(html: string): number
{
	const matches = html.match(/cid:/gi);
	return matches ? matches.length : 0;
}

function buildBody(existing: string, incoming: string, mode: UpdateDraftParams['bodyMode']): string
{
	if (mode === 'prepend')
	{
		return `${incoming}${existing}`;
	}
	if (mode === 'append')
	{
		return `${existing}${incoming}`;
	}
	if (mode === 'replaceAboveQuote')
	{
		return QuotedHTMLTransformer.appendQuotedHTML(incoming, existing);
	}
	return incoming;
}

// The caller asked for a body change and got one, but a blind replace silently
// drops the quoted reply and any inline (cid:) images the draft was carrying.
// Those are easy to lose and hard to notice, so report them rather than
// refusing the edit.
function bodyWarnings(existing: string, next: string): string[]
{
	const warnings: string[] = [];

	if (QuotedHTMLTransformer.hasQuotedHTML(existing) && !QuotedHTMLTransformer.hasQuotedHTML(next))
	{
		warnings.push("The quoted reply was removed. Use bodyMode 'replaceAboveQuote' to keep it.");
	}

	const lost = countInlineImages(existing) - countInlineImages(next);
	if (lost > 0)
	{
		warnings.push(`${lost} inline image reference(s) were removed. Inline images are referenced by cid: in the body — include those tags in the new body, or use bodyMode 'prepend'/'append' to keep them.`);
	}

	return warnings;
}

async function handleUpdateDraft(params: UpdateDraftParams)
{
	const { id, subject, body, bodyMode, to, cc, bcc } = params;

	const message = await DatabaseStore.find(Message, id).include(Message.attributes.body);
	if (!message)
	{
		return text(`Draft ${id} not found.`);
	}
	if (!message.draft)
	{
		return text(`Message ${id} is not a draft. update_draft only edits drafts, never sent or received mail.`);
	}
	if (DraftStore.isSendingDraft(message.headerMessageId))
	{
		return text(`Draft ${id} is currently being sent and cannot be edited.`);
	}

	const changes: Record<string, unknown> = {};
	let warnings: string[] = [];

	if (subject !== undefined)
	{
		changes.subject = subject;
	}
	if (to)
	{
		changes.to = to.map(toContact);
	}
	if (cc)
	{
		changes.cc = cc.map(toContact);
	}
	if (bcc)
	{
		changes.bcc = bcc.map(toContact);
	}
	if (body !== undefined)
	{
		const existing = message.body || '';
		const next = buildBody(existing, body, bodyMode);
		warnings = bodyWarnings(existing, next);
		changes.body = next;
	}

	if (!Object.keys(changes).length)
	{
		return text('Nothing to update. Provide at least one of: subject, body, to, cc, bcc.');
	}

	// Go through the draft session rather than writing the model directly, so
	// that an open composer picks the change up instead of overwriting it with
	// its own in-memory copy on the next keystroke.
	const session = await DraftStore.sessionForClientId(message.headerMessageId);
	if (!session.draft())
	{
		return text(`Draft ${id} could not be opened for editing.`);
	}

	session.changes.add(changes);
	await session.changes.commit();

	const updated = await DatabaseStore.find(Message, id);
	return json({
		updated: true,
		fields: Object.keys(changes),
		warnings,
		draft: formatMessage(updated || message),
	});
}

export function registerUpdateDraftTool(server: ToolServer): void
{
	server.registerTool('update_draft', { description: updateDraftDescription, inputSchema: updateDraftInputSchema }, handleUpdateDraft);
}
