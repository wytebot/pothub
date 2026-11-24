import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createProject, deleteProject, listMedia, putMedia, uid } from './db';
import { exportProject, importProject } from './zip';

describe('project ZIP round trip', () => {
  it('exports and re-imports a project with its media under new ids', async () => {
    const p = await createProject('Trip');
    await putMedia({ id: uid(), projectId: p.id, kind: 'image', name: 'a.png', mime: 'image/png', size: 3, createdAt: 1, blob: new Blob([new Uint8Array([1, 2, 3])]) });
    const { blob } = await exportProject(p.id);
    const { project, warnings } = await importProject(blob);
    expect(warnings).toEqual([]);
    expect(project.id).not.toBe(p.id);
    const media = await listMedia(project.id);
    expect(media).toHaveLength(1);
    expect(media[0].size).toBe(3);
    await deleteProject(p.id);
    expect(await listMedia(p.id)).toHaveLength(0);
  });
  it('rejects a ZIP that is not a project export', async () => {
    await expect(importProject(new Blob(['nope']))).rejects.toThrow(/valid project ZIP/);
  });
});
