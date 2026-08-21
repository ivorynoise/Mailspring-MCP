import { AccountStore, CategoryStore, MailRuleRecord, MailRulesStore, MailRulesTemplates, MailspringAccount } from 'mailspring-exports';

import { MailFilterActionInput, MailFilterConditionInput } from './types';

// What Mailspring calls a "mail rule" is what the user calls a filter. The
// tools speak "filter"; everything below the API boundary keeps Mailspring's
// own vocabulary so the shapes stay recognisable against mail-rules-store.ts.

type ActionValueKind = 'none' | 'email' | 'category';

interface ActionSpec
{
	valueKind: ActionValueKind;
	// Label-style accounts (Gmail) and folder-style accounts (plain IMAP) get
	// different action sets, mirroring ActionTemplatesForAccount in
	// app/src/mail-rules-templates.ts. Applying a label action to a folder
	// account creates a rule that disables itself the first time it fires.
	accountKind: 'labels' | 'folders' | 'any';
	description: string;
}

export const ACTION_SPECS: Record<string, ActionSpec> = {
	markAsRead: { valueKind: 'none', accountKind: 'any', description: 'Mark the thread as read' },
	moveToTrash: { valueKind: 'none', accountKind: 'any', description: 'Move the thread to Trash' },
	star: { valueKind: 'none', accountKind: 'any', description: 'Star the thread' },
	forward: { valueKind: 'email', accountKind: 'any', description: 'Forward the message to an address. Sends immediately, with no draft and no confirmation' },
	markAsImportant: { valueKind: 'none', accountKind: 'labels', description: 'Apply the Important label' },
	archive: { valueKind: 'none', accountKind: 'labels', description: 'Remove the Inbox label' },
	applyLabel: { valueKind: 'category', accountKind: 'labels', description: 'Add a label, keeping existing ones' },
	moveToLabel: { valueKind: 'category', accountKind: 'labels', description: 'Add a label and strip every other unlocked label' },
	changeFolder: { valueKind: 'category', accountKind: 'folders', description: 'Move the thread to a folder' },
};

export function resolveAccount(input: string): MailspringAccount | null
{
	const trimmed = (input || '').trim();
	if (!trimmed)
	{
		return null;
	}
	return AccountStore.accountForId(trimmed) || AccountStore.accountForEmail(trimmed) || null;
}

export function accountChoices(): string[]
{
	return AccountStore.accounts().map(account => `${account.emailAddress} (${account.id})`);
}

export function conditionFieldChoices(): string[]
{
	return MailRulesTemplates.ConditionTemplates.map(template =>
	{
		const ops = Object.keys(template.comparators);
		if (ops.length)
		{
			return `${template.key} — ${ops.join(', ')}`;
		}
		const values = (template.values || []).map(v => v.value).join(' | ');
		return `${template.key} — no op, value must be ${values}`;
	});
}

export function actionTypeChoices(account: MailspringAccount): string[]
{
	const kind = account.usesLabels() ? 'labels' : 'folders';
	return Object.keys(ACTION_SPECS)
		.filter(key => ACTION_SPECS[key].accountKind === 'any' || ACTION_SPECS[key].accountKind === kind)
		.map(key => `${key} — ${ACTION_SPECS[key].description}`);
}

// Returns a validated condition in Mailspring's on-disk shape, or an error
// string. Validation happens here rather than at write time because the store
// does no checking of its own: a bad templateKey silently never matches, and a
// bad action value throws when the rule first fires, which makes Mailspring
// disable the rule and cancel any running backfill.
export function buildCondition(input: MailFilterConditionInput): { condition: { templateKey: string; comparatorKey?: string; value: string } } | { error: string }
{
	const template = MailRulesTemplates.ConditionTemplates.find(t => t.key === input.field);
	if (!template)
	{
		return { error: `Unknown condition field '${input.field}'. Valid fields: ${conditionFieldChoices().join('; ')}` };
	}

	const value = input.value;
	if (typeof value !== 'string' || value === '')
	{
		return { error: `Condition on '${input.field}' needs a non-empty value. An empty value never matches anything.` };
	}

	const ops = Object.keys(template.comparators);

	// Enum fields (hasAttachment, starred) carry no comparators at all, so
	// Mailspring falls back to a strict equality check against the raw string.
	if (!ops.length)
	{
		const allowed = (template.values || []).map(v => v.value);
		if (!allowed.includes(value))
		{
			return { error: `Condition on '${input.field}' must have a value of ${allowed.join(' or ')}, not '${value}'.` };
		}
		if (input.op)
		{
			return { error: `Condition on '${input.field}' does not take an op — it is an exact match on ${allowed.join(' or ')}.` };
		}
		return { condition: { templateKey: template.key, comparatorKey: undefined, value } };
	}

	if (!input.op)
	{
		return { error: `Condition on '${input.field}' needs an op. Valid ops: ${ops.join(', ')}` };
	}
	if (!ops.includes(input.op))
	{
		return { error: `Unknown op '${input.op}' for field '${input.field}'. Valid ops: ${ops.join(', ')}` };
	}

	// Compile the pattern now. Left to run time, a bad pattern throws inside
	// the processor and takes the whole rule down with it.
	if (input.op === 'matchesExpression')
	{
		try
		{
			new RegExp(value, 'gi');
		}
		catch (err)
		{
			return { error: `Invalid regular expression '${value}': ${err instanceof Error ? err.message : String(err)}` };
		}
	}

	return { condition: { templateKey: template.key, comparatorKey: input.op, value } };
}

export function buildAction(input: MailFilterActionInput, account: MailspringAccount): { action: { templateKey: string; value?: string } } | { error: string }
{
	const spec = ACTION_SPECS[input.type];
	if (!spec)
	{
		return { error: `Unknown action type '${input.type}'. Valid actions for this account: ${actionTypeChoices(account).join('; ')}` };
	}

	const kind = account.usesLabels() ? 'labels' : 'folders';
	if (spec.accountKind !== 'any' && spec.accountKind !== kind)
	{
		const noun = kind === 'labels' ? 'uses labels (Gmail-style)' : 'uses folders (IMAP-style)';
		return { error: `Action '${input.type}' is not available on ${account.emailAddress}, which ${noun}. Valid actions: ${actionTypeChoices(account).join('; ')}` };
	}

	if (spec.valueKind === 'none')
	{
		return { action: { templateKey: input.type } };
	}

	if (!input.value)
	{
		const need = spec.valueKind === 'email' ? 'an email address' : 'a label or folder id from list_labels / list_folders for this account';
		return { error: `Action '${input.type}' needs a value: ${need}.` };
	}

	if (spec.valueKind === 'email')
	{
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value))
		{
			return { error: `Action '${input.type}' needs a valid email address, got '${input.value}'.` };
		}
		return { action: { templateKey: input.type, value: input.value } };
	}

	const category = CategoryStore.byId(account.id, input.value);
	if (!category)
	{
		return { error: `No label or folder with id '${input.value}' on ${account.emailAddress}. Ids are per-account — call list_labels or list_folders and use the one whose accountId is '${account.id}'.` };
	}

	return { action: { templateKey: input.type, value: input.value } };
}

function describeCondition(condition: { templateKey: string; comparatorKey?: string; value?: string })
{
	const template = MailRulesTemplates.ConditionTemplates.find(t => t.key === condition.templateKey);
	const comparator = template && condition.comparatorKey ? template.comparators[condition.comparatorKey] : undefined;
	return {
		field: condition.templateKey,
		fieldName: template ? template.name : `unknown (${condition.templateKey})`,
		op: condition.comparatorKey,
		opName: comparator ? comparator.name : 'is exactly',
		value: condition.value,
	};
}

function describeAction(action: { templateKey: string; value?: string }, accountId: string)
{
	const spec = ACTION_SPECS[action.templateKey];
	const category = spec && spec.valueKind === 'category' && action.value ? CategoryStore.byId(accountId, action.value) : null;
	return {
		type: action.templateKey,
		description: spec ? spec.description : `unknown action (${action.templateKey})`,
		value: action.value,
		target: category ? category.path : undefined,
	};
}

export function serializeFilter(rule: MailRuleRecord)
{
	const account = AccountStore.accountForId(rule.accountId);
	const siblings = MailRulesStore.rulesForAccountId(rule.accountId);
	return {
		id: rule.id,
		name: rule.name,
		account: account ? account.emailAddress : rule.accountId,
		accountId: rule.accountId,
		// Rules run top to bottom for an account, and a later rule can undo an
		// earlier one, so position is part of the meaning.
		position: siblings.findIndex(r => r.id === rule.id) + 1,
		of: siblings.length,
		enabled: !rule.disabled,
		disabledReason: rule.disabledReason,
		match: rule.conditionMode,
		conditions: (rule.conditions || []).map(describeCondition),
		actions: (rule.actions || []).map(action => describeAction(action, rule.accountId)),
	};
}
