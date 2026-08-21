import { MailRulesStore } from 'mailspring-exports';
import { z } from 'zod';

import { accountChoices, resolveAccount, serializeFilter } from '../filterHelpers';
import { json, text } from '../helpers';
import { ListFiltersParams, ToolServer } from '../types';

const listFiltersDescription = 'List the mail filters (Mailspring calls them mail rules) configured on this machine. Each filter belongs to exactly one account. Filters run top to bottom per account and a later filter can undo an earlier one, so the reported position matters. A filter Mailspring disabled after a failure is reported with enabled: false and the reason. Filters are stored locally, never on the mail server, so they only run while Mailspring is open and they apply to mail arriving from now on.';

const listFiltersInputSchema = {
	account: z.string().optional().describe('Limit to one account, by email address or account id. Omit for every account.'),
};

async function handleListFilters({ account }: ListFiltersParams)
{
	if (account)
	{
		const resolved = resolveAccount(account);
		if (!resolved)
		{
			return text(`No account matches '${account}'. Configured accounts: ${accountChoices().join(', ')}`);
		}
		const rules = MailRulesStore.rulesForAccountId(resolved.id);
		if (!rules.length)
		{
			return text(`No filters on ${resolved.emailAddress}.`);
		}
		return json(rules.map(serializeFilter));
	}

	const rules = MailRulesStore.rules();
	if (!rules.length)
	{
		return text('No filters are configured on any account.');
	}
	return json(rules.map(serializeFilter));
}

export function registerListFiltersTool(server: ToolServer): void
{
	server.registerTool('list_filters', { description: listFiltersDescription, inputSchema: listFiltersInputSchema }, handleListFilters);
}
