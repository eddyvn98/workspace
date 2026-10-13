// @vitest-environment jsdom
import React, { act, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),save:vi.fn()}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
vi.mock('@/stores/useMessageStore',()=>({useMessageStore:{getState:()=>({selectedModel:{id:'model'}})}}));
vi.mock('@/lib/selected-ai-model',()=>({getSelectedAIModelName:()=> 'model'}));
vi.mock('@/app/workspace/utils/workspaceChatActions',()=>({inspectWorkspaceChatActionAnswer:()=>({actions:[]})}));
vi.mock('@/app/workspace/utils/workspaceKnowledgeContext',()=>({shouldFetchKnowledgeContext:()=>false}));
vi.mock('@/app/workspace/utils/workspacePersistenceFlush',()=>({flushWorkspacePendingSave:async()=>true}));
vi.mock('@/app/workspace/hooks/workspaceBoardApi',()=>({fetchRemoteBoard:async()=>null}));
vi.mock('@/app/workspace/hooks/workspaceChatSendHelpers',()=>({fetchBoardAfterAgent:async()=>null,adoptBoardSnapshot:vi.fn()}));
vi.mock('@/app/workspace/utils/workspaceCommentCount',()=>({fetchBoardCommentSnapshot:async()=>null,countCommentChanges:()=>0}));
vi.mock('@/app/workspace/hooks/workspaceChatDifySend',()=>({buildWorkspaceSendPrompt:()=> 'request',sendToDifyWithRepair:mocks.send}));
vi.mock('@/app/workspace/hooks/workspaceChatTurnResult',()=>({computeAssistantTurnResult:()=>({content:'Done',suggestions:{grounded:[],expand:[]},focusBlockIds:[],appliedSummaries:[]})}));
import { useWorkspaceChatSend } from '@/app/workspace/hooks/useWorkspaceChatSend';
import { useWorkspaceStore } from '@/app/workspace/store/useWorkspaceStore';
import type { WorkspaceChatMessage } from '@/app/workspace/types/chat';
beforeEach(()=>{vi.clearAllMocks();useWorkspaceStore.setState({boardId:'board',blocks:{},connectors:{}});mocks.save.mockResolvedValue(undefined);});
function mount(){
 let send!:ReturnType<typeof useWorkspaceChatSend>;
 function Host(){const [messages,setMessages]=useState<WorkspaceChatMessage[]>([]);const messagesRef=useRef(messages);useEffect(()=>{messagesRef.current=messages},[messages]);send=useWorkspaceChatSend({setMessages,setIsSending:vi.fn(),setActiveRequest:vi.fn(),setQueue:vi.fn(),messagesRef,conversationIdRef:useRef(null),upsertSession:mocks.save});return null;}
 const element=document.createElement('div'),root=createRoot(element);act(()=>root.render(<Host/>));return {send:(text:string)=>send(text),close:()=>act(()=>root.unmount())};
}
it('saves one user and one completed assistant per turn after optimistic messages rendered',async()=>{
 const host=mount();
 try{
  for(const query of ['First request','Second request']){
   let resolve!:(v:any)=>void;mocks.send.mockImplementation(()=>new Promise(done=>{resolve=done}));
   let pending!:Promise<void>;await act(async()=>{pending=host.send(query);await Promise.resolve();});
   await act(async()=>{resolve({fullText:'Done',conversationId:'conversation',invalidActionResponse:false});await pending;});
  }
  const saved=mocks.save.mock.calls.filter(call=>call[2]).at(-1)![2] as WorkspaceChatMessage[];
  expect(saved.map(m=>[m.role,m.content])).toEqual([['user','First request'],['assistant','Done'],['user','Second request'],['assistant','Done']]);
  expect(saved.some(m=>m.isLoading)).toBe(false);
 }finally{host.close();}
});
it('aborts the pending request when its board panel is unmounted',async()=>{
 let signal!:AbortSignal;mocks.send.mockImplementation((args:any)=>{signal=args.signal;return new Promise((_done,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));});
 const host=mount();let pending!:Promise<void>;await act(async()=>{pending=host.send('Pending');await Promise.resolve();});host.close();await pending;expect(signal.aborted).toBe(true);
});
