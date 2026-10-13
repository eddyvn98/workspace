// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('@/app/workspace/hooks/useWorkspaceChat', () => ({ useWorkspaceChat: () => ({ messages:[{role:'assistant',content:'Verified download'}], queue:[], sessions:[], sendMessage:vi.fn() }) }));
vi.mock('@/app/workspace/hooks/useWorkspaceChatFileUpload', () => ({ useWorkspaceChatFileUpload: () => ({ attachedFiles:[], clearFiles:vi.fn() }) }));
vi.mock('@/app/workspace/hooks/useWorkspaceAgentDriver', () => ({ useWorkspaceAgentDriver:vi.fn() }));
vi.mock('@/app/workspace/hooks/useWorkspaceManualSave', () => ({ useWorkspaceManualSave: () => vi.fn() }));
vi.mock('@/app/workspace/components/WorkspaceVersionHistoryPanel', () => ({ WorkspaceVersionHistoryPanel: () => null }));
vi.mock('@/app/workspace/components/WorkspaceChatInput', () => ({ WorkspaceChatInput: ({draft,setDraft,inputRef}:any) => <textarea aria-label="Request" ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)}/> }));
vi.mock('@/app/workspace/components/WorkspaceChatMessageList', () => ({ WorkspaceChatMessageList: ({messages}:any) => <p>{messages[0]?.content}</p> }));
vi.mock('@/app/workspace/components/WorkspaceChatQueueTray', () => ({ WorkspaceChatQueueTray: () => null }));
vi.mock('@/app/workspace/components/WorkspaceChatHistoryDrawer', () => ({ WorkspaceChatHistoryDrawer: () => null }));
vi.mock('@/app/workspace/components/WorkspaceChatPanelHeader', () => ({ WorkspaceChatPanelHeader: () => null }));
vi.mock('@/app/workspace/components/WorkspaceTopBarActions', () => ({ WorkspaceTopBarActions: ({onToggleChat}:any) => <button onClick={onToggleChat}>Toggle chat</button> }));
import { WorkspaceTopBar } from '@/app/workspace/components/WorkspaceTopBar';
import { useWorkspaceStore } from '@/app/workspace/store/useWorkspaceStore';
import { extractBlockLabel } from '@/app/workspace/utils/workspaceChatContext';
const noop=()=>{};
const element=document.createElement('div'); element.dataset.workspaceRoot='true'; document.body.append(element);
let root:ReturnType<typeof createRoot>;
afterEach(()=>{act(()=>root?.unmount());element.replaceChildren();});
function render(boardId='board') { act(()=>root.render(<WorkspaceTopBar boardId={boardId} onHelpClick={noop} onUndo={noop} onRedo={noop} canUndo={false} canRedo={false} isSearchOpen={false} onToggleSearch={noop} isSavePending={false} saveError={null}/>)); }
function toggle(){const button=Array.from(element.querySelectorAll('button')).find(b=>b.textContent==='Toggle chat')!;act(()=>button.click());}
it('closing and reopening chat preserves its draft and messages while releasing canvas space',()=>{
 useWorkspaceStore.setState({boardId:'board',blocks:{},blockOrder:[],selectedBlockIds:[]});root=createRoot(element);render();toggle();
 const input=element.querySelector('textarea')!;
 act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Continue my report');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(input.value).toBe('Continue my report');expect(useWorkspaceStore.getState().chatPanelWidth).toBe(320);
 toggle();expect(input.closest('[hidden]')).not.toBeNull();expect(useWorkspaceStore.getState().chatPanelWidth).toBe(0);
 toggle();expect(element.querySelector('textarea')).toBe(input);expect(input.value).toBe('Continue my report');expect(element.textContent).toContain('Verified download');
 render('another-board');expect(element.querySelector('textarea')!.value).toBe('');
});
it('reference chips show readable shape labels rather than HTML',()=>{
 expect(extractBlockLabel({type:'shape',data:{label:'<p>Người <strong>phụ trách</strong> &amp; nhóm</p>'}} as never)).toBe('Người phụ trách & nhóm');
 root=createRoot(element);
});
