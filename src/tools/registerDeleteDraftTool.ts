import { Actions, DatabaseStore, DraftStore, Message } from 'mailspring-exports';
import { z } from 'zod';

import { json, text } from '../helpers';
import { DeleteDraftParams, ToolServer } from '../types';

const deleteDraftDescription = 'Permanently delete a draft. This cannot be undone: the draft is removed locally and, if it had been synced, from the server too. Only drafts can be deleted — sent and received mail is never touched. Deleting a reply draft leaves the thread it belonged to intact. Takes a single draft ID; there is deliberately no way to delete in bulk or by filter.';

const deleteDraftInputSchema = {
	id: z.string().describe('The draft message ID (as returned by list_drafts)'),
};

async function handleDeleteDraft({ id }: DeleteDraftParams)
{
	const message = await DatabaseStore.find(Message, id);
	if (!message)
	{
		return text(`Draft ${id} not found.`);
	}
	if (!message.draft)
	{
		return text(`Message ${id} is not a draft. delete_draft only removes drafts, never sent or received mail.`);
	}
	if (DraftStore.isSendingDraft(message.headerMessageId))
	{
		return text(`Draft ${id} is currently being sent and cannot be deleted.`);
	}

	// Capture what we are about to destroy, so the caller gets a receipt for
	// an operation that cannot be undone.
	const receipt = {
		deleted: true,
		id: message.id,
		headerMessageId: message.headerMessageId,
		subject: message.subject,
		to: (message.to || []).map(contact => contact.email),
		accountId: message.accountId,
	};

	// Go through the action rather than queueing DestroyDraftTask directly.
	// DraftStore's handler also tears down any open editing session and
	// cancels in-flight syncback/send tasks for this draft; a bare task would
	// leave those running and racing the delete, which can resurrect the very
	// draft it just removed.
	Actions.destroyDraft({
		accountId: message.accountId,
		headerMessageId: message.headerMessageId,
		id: message.id,
	});

	return json(receipt);
}

export function registerDeleteDraftTool(server: ToolServer): void
{
	server.registerTool('delete_draft', { description: deleteDraftDescription, inputSchema: deleteDraftInputSchema }, handleDeleteDraft);
}
