import { ToolServer } from '../types';

import { registerAddFiltersTool } from './registerAddFiltersTool';
import { registerBatchReadEmailsTool } from './registerBatchReadEmailsTool';
import { registerDeleteDraftTool } from './registerDeleteDraftTool';
import { registerDeleteFilterTool } from './registerDeleteFilterTool';
import { registerEmailStatsTool } from './registerEmailStatsTool';
import { registerGetRecentEmailsTool } from './registerGetRecentEmailsTool';
import { registerListContactsTool } from './registerListContactsTool';
import { registerListDraftsTool } from './registerListDraftsTool';
import { registerListFiltersTool } from './registerListFiltersTool';
import { registerListFoldersTool } from './registerListFoldersTool';
import { registerListLabelsTool } from './registerListLabelsTool';
import { registerListThreadsTool } from './registerListThreadsTool';
import { registerReadEmailTool } from './registerReadEmailTool';
import { registerReadThreadTool } from './registerReadThreadTool';
import { registerSearchEmailsTool } from './registerSearchEmailsTool';
import { registerUpdateDraftTool } from './registerUpdateDraftTool';

export function registerTools(server: ToolServer): void
{
	registerSearchEmailsTool(server);
	registerReadEmailTool(server);
	registerListThreadsTool(server);
	registerReadThreadTool(server);
	registerListContactsTool(server);
	registerListFoldersTool(server);
	registerListLabelsTool(server);
	registerGetRecentEmailsTool(server);
	registerListDraftsTool(server);
	registerEmailStatsTool(server);
	registerBatchReadEmailsTool(server);
	registerUpdateDraftTool(server);
	registerDeleteDraftTool(server);
	registerListFiltersTool(server);
	registerAddFiltersTool(server);
	registerDeleteFilterTool(server);
}