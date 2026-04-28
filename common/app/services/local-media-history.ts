import Dexie, { liveQuery } from 'dexie';

export interface LocalFileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
}

export type LocalFileSystemPermissionState = 'granted' | 'denied' | 'prompt';

export interface LocalFileSystemFileHandle {
    kind: 'file';
    name: string;
    getFile: () => Promise<File>;
    queryPermission?: (
        descriptor?: LocalFileSystemHandlePermissionDescriptor
    ) => Promise<LocalFileSystemPermissionState>;
    requestPermission?: (
        descriptor?: LocalFileSystemHandlePermissionDescriptor
    ) => Promise<LocalFileSystemPermissionState>;
}

export interface LocalFilePickerOptions {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: {
        description?: string;
        accept: Record<string, string[]>;
    }[];
}

export interface WindowWithLocalFilePicker extends Window {
    showOpenFilePicker?: (options?: LocalFilePickerOptions) => Promise<LocalFileSystemFileHandle[]>;
}

export interface LocalMediaFile {
    name: string;
    size: number;
    lastModified: number;
    type: string;
    handle?: LocalFileSystemFileHandle;
}

export interface LocalMediaHistoryItem {
    id: string;
    video: LocalMediaFile;
    subtitles: LocalMediaFile[];
    currentTime: number;
    duration: number;
    createdAt: number;
    updatedAt: number;
}

export interface LocalMediaSourceHandles {
    videoFile?: LocalFileSystemFileHandle;
    subtitleFiles?: (LocalFileSystemFileHandle | undefined)[];
}

export interface LocalMediaProgressUpdate {
    currentTime: number;
    duration: number;
}

export interface RestoredLocalMediaFiles {
    files: File[];
    fileHandles: LocalMediaSourceHandles;
}

interface LocalMediaHistoryRecord extends LocalMediaHistoryItem {}

class LocalMediaHistoryDatabase extends Dexie {
    items!: Dexie.Table<LocalMediaHistoryRecord, string>;

    constructor() {
        super('LocalMediaHistoryDatabase');
        this.version(1).stores({
            items: '&id,updatedAt,createdAt',
        });
    }
}

const defaultLimit = 50;

export const localMediaIdFromFile = (file: File) => `${file.name}\n${file.size}\n${file.lastModified}`;

export const localMediaFileFromFile = (file: File, handle?: LocalFileSystemFileHandle): LocalMediaFile => ({
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    type: file.type,
    handle,
});

const sameFile = (a: LocalMediaFile, b: File) =>
    a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

const validTime = (time: number | undefined) => (Number.isFinite(time) && time !== undefined ? Math.max(0, time) : 0);

async function requestReadPermission(handle: LocalFileSystemFileHandle) {
    const descriptor: LocalFileSystemHandlePermissionDescriptor = { mode: 'read' };

    if (!handle.queryPermission || !handle.requestPermission) {
        return true;
    }

    if ((await handle.queryPermission(descriptor)) === 'granted') {
        return true;
    }

    return (await handle.requestPermission(descriptor)) === 'granted';
}

export class LocalMediaHistoryRepository {
    private readonly _db = new LocalMediaHistoryDatabase();
    private readonly _limit: number;

    constructor(limit: number = defaultLimit) {
        this._limit = limit;
    }

    async fetch(count: number): Promise<LocalMediaHistoryItem[]> {
        if (count <= 0) {
            return [];
        }

        return await this._db.items.orderBy('updatedAt').reverse().limit(count).toArray();
    }

    liveFetch(count: number, callback: (items: LocalMediaHistoryItem[]) => void): () => void {
        const subscription = liveQuery(() => this.fetch(count)).subscribe(callback);
        return () => subscription.unsubscribe();
    }

    async recordOpenedMedia({
        videoFile,
        videoHandle,
        subtitleFiles,
        subtitleHandles,
    }: {
        videoFile: File;
        videoHandle?: LocalFileSystemFileHandle;
        subtitleFiles: File[];
        subtitleHandles?: (LocalFileSystemFileHandle | undefined)[];
    }): Promise<LocalMediaHistoryItem> {
        const id = localMediaIdFromFile(videoFile);
        const existing = await this._db.items.get(id);
        const now = Date.now();
        const record: LocalMediaHistoryItem = {
            id,
            video: localMediaFileFromFile(videoFile, videoHandle ?? existing?.video.handle),
            subtitles: subtitleFiles.map((file, index) =>
                localMediaFileFromFile(
                    file,
                    subtitleHandles?.[index] ?? existing?.subtitles.find((subtitle) => sameFile(subtitle, file))?.handle
                )
            ),
            currentTime: existing?.currentTime ?? 0,
            duration: existing?.duration ?? 0,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };

        await this._db.items.put(record);
        await this._prune();
        return record;
    }

    async savePlaybackState({
        videoFile,
        videoHandle,
        subtitleFiles,
        subtitleHandles,
        currentTime,
        duration,
    }: {
        videoFile: File;
        videoHandle?: LocalFileSystemFileHandle;
        subtitleFiles: File[];
        subtitleHandles?: (LocalFileSystemFileHandle | undefined)[];
        currentTime: number;
        duration: number;
    }): Promise<void> {
        const id = localMediaIdFromFile(videoFile);
        const existing = await this._db.items.get(id);
        const now = Date.now();
        const safeDuration = validTime(duration);
        const safeCurrentTime =
            safeDuration > 0 ? Math.min(validTime(currentTime), safeDuration) : validTime(currentTime);

        await this._db.items.put({
            id,
            video: localMediaFileFromFile(videoFile, videoHandle ?? existing?.video.handle),
            subtitles: subtitleFiles.map((file, index) =>
                localMediaFileFromFile(
                    file,
                    subtitleHandles?.[index] ?? existing?.subtitles.find((subtitle) => sameFile(subtitle, file))?.handle
                )
            ),
            currentTime: safeCurrentTime,
            duration: safeDuration,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
        await this._prune();
    }

    async restoreFiles(item: LocalMediaHistoryItem): Promise<RestoredLocalMediaFiles | undefined> {
        if (!item.video.handle || !(await requestReadPermission(item.video.handle))) {
            return undefined;
        }

        const videoFile = await item.video.handle.getFile();
        const files = [videoFile];
        const subtitleHandles: LocalFileSystemFileHandle[] = [];

        for (const subtitle of item.subtitles) {
            if (!subtitle.handle || !(await requestReadPermission(subtitle.handle))) {
                return undefined;
            }

            files.push(await subtitle.handle.getFile());
            subtitleHandles.push(subtitle.handle);
        }

        return {
            files,
            fileHandles: {
                videoFile: item.video.handle,
                subtitleFiles: subtitleHandles,
            },
        };
    }

    async delete(id: string): Promise<void> {
        await this._db.items.delete(id);
    }

    private async _prune() {
        const count = await this._db.items.count();

        if (count <= this._limit) {
            return;
        }

        const keys = await this._db.items
            .orderBy('updatedAt')
            .limit(count - this._limit)
            .primaryKeys();

        await this._db.items.bulkDelete(keys);
    }
}
