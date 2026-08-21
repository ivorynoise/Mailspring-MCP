import { Actions, MailRulesStore } from 'mailspring-exports';
import { z } from 'zod';

import { serializeFilter } from '../filterHelpers';
import { json, text } from '../helpers';
import { DeleteFilterParams, ToolServer } from '../types';

const deleteFilterDescription = 'Permanently delete one mail filter by id, as returned by list_filters. This cannot be undone — Mailspring keeps no history of removed rules. Mail the filter already acted on stays as it is: deleting a filter that archived a sender does not bring those threads back to the inbox. Takes a single id; there is deliberately no way to delete in bulk or by pattern.';

const deleteFilterInputSchema = {
	id: z.string().describe('The filter id (as returned by list_filters)'),
};

async function handleDeleteFilter({ id }: DeleteFilterParams)
{
	const rule = MailRulesStore.rules().find(candidate => candidate.id === id);
	if (!rule)
	{
		return text(`No filter with id '${id}'. Call list_filters to see what exists.`);
	}

	// Capture the rule before it goes, so the caller gets a receipt for an
	// operation with no undo.
	const receipt = serializeFilter(rule);

	Actions.deleteMailRule(id);

	const stillThere = MailRulesStore.rules().some(candidate => candidate.id === id);
	if (stillThere)
	{
		return text(`Mailspring did not remove filter '${id}'. Check Preferences → Mail Rules.`);
	}

	return json({
		deleted: true,
		filter: receipt,
		note: 'Mail this filter already moved, labelled or marked is unchanged.',
	});
}

export function registerDeleteFilterTool(server: ToolServer): void
{
	server.registerTool('delete_filter', { description: deleteFilterDescription, inputSchema: deleteFilterInputSchema }, handleDeleteFilter);
}
