export interface ThreadFilterParams
{
	folder?: string;
	label?: string;
	unread?: boolean;
	starred?: boolean;
	hasAttachment?: boolean;
	dateFrom?: string;
	dateTo?: string;
}

export interface SearchEmailsParams extends ThreadFilterParams
{
	query?: string;
	from?: string;
	to?: string;
	subject?: string;
	limit: number;
	offset: number;
}

export interface ReadByIdParams
{
	id: string;
}

export interface ListThreadsParams extends ThreadFilterParams
{
	limit: number;
	offset: number;
}

export interface ListContactsParams
{
	search?: string;
	limit: number;
	offset: number;
}

export interface GetRecentEmailsParams
{
	limit: number;
	offset: number;
	dateFrom?: string;
	dateTo?: string;
}

export interface ListDraftsParams
{
	limit: number;
	offset: number;
}

export interface BatchReadEmailsParams
{
	ids: string[];
}

export type ToolServer = any;

export interface DraftRecipientInput
{
	name?: string;
	email: string;
}

export type UpdateDraftBodyMode = 'replace' | 'replaceAboveQuote' | 'prepend' | 'append';

export interface UpdateDraftParams
{
	id: string;
	subject?: string;
	body?: string;
	bodyMode: UpdateDraftBodyMode;
	to?: DraftRecipientInput[];
	cc?: DraftRecipientInput[];
	bcc?: DraftRecipientInput[];
}

export interface DeleteDraftParams
{
	id: string;
}

export interface MailFilterConditionInput
{
	field: string;
	op?: string;
	value: string;
}

export interface MailFilterActionInput
{
	type: string;
	value?: string;
}

export interface ListFiltersParams
{
	account?: string;
}

export interface AddFiltersParams
{
	account: string;
	name?: string;
	match?: 'all' | 'any';
	conditions: MailFilterConditionInput[];
	actions: MailFilterActionInput[];
}

export interface DeleteFilterParams
{
	id: string;
}
