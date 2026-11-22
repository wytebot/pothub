import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { allChats, createProject, getChat, getProject, listLibrary, putChat, putMedia, uid } from './db';
import { createBackup, restoreBackup } from './backup';

describe('full backup merge restore', () => {
  it('restores history, projects and media without deleting unrelated local data', async () => {
    const p = await createProject('From backup');
    const mediaId = uid();
    await putMedia({ id: mediaId, projectId: null, kind: 'image', name: 'generated.png', mime: 'image/png', size: 3, createdAt: 100, blob: new Blob([new Uint8Array([1, 2, 3])]) });
    await putChat({ id: 'chat-backup', title: 'Saved conversation', createdAt: 100, updatedAt: 100, messages: [] });
    const backup = await createBackup();
    await putChat({ id: 'local-only', title: 'Keep me', createdAt: 200, updatedAt: 200, messages: [] });
    const result = await restoreBackup(backup.blob);
    expect(result.chatsAdded).toBe(1);
    expect(await getChat('chat-backup')).toBeTruthy();
    expect(await getChat('local-only')).toBeTruthy();
    expect(await getProject(p.id)).toBeTruthy();
    expect((await listLibrary()).some((m) => m.id === mediaId)).toBe(true);
    expect((await allChats()).length).toBe(2);
  });
  it('updates a matching chat only when the backup timestamp is newer', async () => {
    await putChat({ id: 'same', title: 'Old local', createdAt: 1, updatedAt: 1, messages: [] });
    const b = await createBackup();
    await putChat({ id: 'same', title: 'Newer local', createdAt: 1, updatedAt: Date.now() + 60_000, messages: [] });
    await restoreBackup(b.blob);
    expect((await getChat('same'))?.title).toBe('Newer local');
  });
});
