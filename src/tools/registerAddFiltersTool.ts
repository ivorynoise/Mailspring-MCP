import { Actions, MailRulesStore } from 'mailspring-exports';
import { z } from 'zod';

import { accountChoices, actionTypeChoices, buildAction, buildCondition, resolveAccount, serializeFilter } from '../filterHelpers';
import { json, text } from '../helpers';
import { AddFiltersParams, ToolServer } from '../types';

const addFiltersDescription = [
	'Create one mail filter (a Mailspring mail rule) on one account. A filter cannot span accounts: to filter the same sender everywhere, call this once per account.',
	'Fields: from, to, cc, bcc, anyRecipient, replyTo, subject, body, anyAttachmentName take an op of contains, doesNotContain, beginsWith, endsWith, equals or matchesExpression (a regex, case-insensitive). hasAttachment and starred take no op and a value of "true" or "false". Contact fields match against both the address and the display name. Every comparison ignores case.',
	'Actions: markAsRead, star, moveToTrash and forward work on any account. applyLabel, moveToLabel, archive and markAsImportant need a label-style (Gmail) account; changeFolder needs a folder-style (IMAP) account. Label and folder values are ids from list_labels or list_folders, and ids differ per account, so pass one belonging to this account.',
	'forward sends the message immediately, with no draft and no confirmation.',
	'The new filter is appended last, so it runs after the existing ones and can undo what they did. It applies to mail arriving from now on, never to mail already in the mailbox, and only while Mailspring is running. Nothing here is undoable.',
].join(' ');

const addFiltersInputSchema = {
	account: z.string().describe('The account this filter belongs to, by email address or account id. One filter, one account.'),
	name: z.string().optional().describe('A label for the filter, shown in Preferences. Defaults to "Untitled Rule".'),
	match: z.enum(['all', 'any']).optional().describe('Whether all conditions must match, or any one of them. Defaults to all.'),
	conditions: z.array(z.object({
		field: z.string().describe('from, to, cc, bcc, anyRecipient, replyTo, subject, body, anyAttachmentName, hasAttachment or starred'),
		op: z.string().optional().describe('contains, doesNotContain, beginsWith, endsWith, equals or matchesExpression. Omit for hasAttachment and starred.'),
		value: z.string().describe('The text to compare against, or "true"/"false" for hasAttachment and starred.'),
	})).min(1).describe('At least one condition. An empty value never matches.'),
	actions: z.array(z.object({
		type: z.string().describe('markAsRead, star, moveToTrash, forward, applyLabel, moveToLabel, archive, markAsImportant or changeFolder'),
		value: z.string().optional().describe('A label or folder id for applyLabel, moveToLabel and changeFolder; an email address for forward; omitted otherwise.'),
	})).min(1).describe('At least one action. Actions apply to the whole thread, not just the matched message.'),
};

async function handleAddFilters({ account, name, match, conditions, actions }: AddFiltersParams)
{
	const resolved = resolveAccount(account);
	if (!resolved)
	{
		return text(`No account matches '${account}'. Configured accounts: ${accountChoices().join(', ')}`);
	}

	const builtConditions = [];
	for (const input of conditions)
	{
		const result = buildCondition(input);
		if ('error' in result)
		{
			return text(result.error);
		}
		builtConditions.push(result.condition);
	}

	const builtActions = [];
	for (const input of actions)
	{
		const result = buildAction(input, resolved);
		if ('error' in result)
		{
			return text(result.error);
		}
		builtActions.push(result.action);
	}

	if (!builtActions.length)
	{
		return text(`A filter needs at least one action. Valid actions for ${resolved.emailAddress}: ${actionTypeChoices(resolved).join('; ')}`);
	}

	const before = new Set(MailRulesStore.rules().map(rule => rule.id));

	// Actions are synchronous in Mailspring (flux/actions.ts sets sync = true),
	// so the store has already appended the rule by the time this returns. The
	// action does not hand back the generated id, hence the diff.
	Actions.addMailRule({
		accountId: resolved.id,
		name: name || 'Untitled Rule',
		conditionMode: match === 'any' ? 'any' : 'all',
		conditions: builtConditions as any,
		actions: builtActions as any,
		disabled: false,
	});

	const created = MailRulesStore.rules().find(rule => !before.has(rule.id));
	if (!created)
	{
		return text('Mailspring accepted the filter but did not report it back. Open Preferences → Mail Rules to check before trying again — this usually means the rule was created and only the read-back failed.');
	}

	return json({
		created: true,
		filter: serializeFilter(created),
		appliesTo: 'mail arriving from now on, while Mailspring is running',
	});
}

export function registerAddFiltersTool(server: ToolServer): void
{
	server.registerTool('add_filters', { description: addFiltersDescription, inputSchema: addFiltersInputSchema }, handleAddFilters);
}
