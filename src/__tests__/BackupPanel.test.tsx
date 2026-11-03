import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackupPanel, type BackupOps } from '@/components/BackupPanel';
import type { BackupManifest } from '@/lib/backupFormat';
import type { PreparedImport } from '@/lib/backupService';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';

const manifest = { exportedAt: '2026-11-03T07:30:00.000Z' } as BackupManifest;
const prepared: PreparedImport = {
  ok: true, zipUri: 'file:///cache/picked.zip', manifest,
  summary: { items: 12, trash: 2, outfits: 5 }, entries: new Set(),
};

function ops(overrides: Partial<BackupOps> = {}): BackupOps {
  return {
    supported: true,
    canSaveToFolder: true,
    createExport: jest.fn().mockResolvedValue({ uri: 'file:///cache/b.zip', fileName: 'tenki-outfit-backup-20261103-1530.zip' }),
    share: jest.fn().mockResolvedValue(undefined),
    saveToFolder: jest.fn().mockResolvedValue(true),
    pick: jest.fn().mockResolvedValue('file:///cache/picked.zip'),
    prepare: jest.fn().mockResolvedValue(prepared),
    apply: jest.fn().mockResolvedValue({ items: 12, outfits: 5 }),
    ...overrides,
  };
}

beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

const press = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: label }));
  });
};

describe('BackupPanel', () => {
  it('Web 預覽：只顯示不支援', () => {
    render(<BackupPanel ops={ops({ supported: false })} />);
    expect(screen.getByText('備份與還原只支援手機版 App')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '分享備份檔' })).toBeNull();
  });

  it('分享：打包後打開分享選單', async () => {
    const o = ops();
    render(<BackupPanel ops={o} />);
    await press('分享備份檔');
    expect(o.createExport).toHaveBeenCalled();
    expect(o.share).toHaveBeenCalledWith('file:///cache/b.zip');
  });

  it('存到資料夾：打包後選資料夾，成功顯示檔名', async () => {
    const o = ops();
    render(<BackupPanel ops={o} />);
    await press('存到資料夾');
    expect(o.saveToFolder).toHaveBeenCalledWith('file:///cache/b.zip', 'tenki-outfit-backup-20261103-1530.zip');
    expect(screen.getByText('已存成 tenki-outfit-backup-20261103-1530.zip')).toBeTruthy();
  });

  it('不能存到資料夾的平台不顯示該按鈕', () => {
    render(<BackupPanel ops={ops({ canSaveToFolder: false })} />);
    expect(screen.queryByRole('button', { name: '存到資料夾' })).toBeNull();
  });

  it('取消選資料夾時不顯示訊息；匯出失敗顯示錯誤', async () => {
    render(<BackupPanel ops={ops({ saveToFolder: jest.fn().mockResolvedValue(false) })} />);
    await press('存到資料夾');
    expect(screen.queryByText(/已存成/)).toBeNull();
    screen.unmount();
    render(<BackupPanel ops={ops({ createExport: jest.fn().mockRejectedValue(new Error('x')) })} />);
    await press('分享備份檔');
    expect(screen.getByText('匯出失敗，請再試一次')).toBeTruthy();
  });

  it('選檔後顯示摘要與兩種匯入方式，沒選方式時不能匯入', async () => {
    render(<BackupPanel ops={ops()} />);
    await press('選擇備份檔');
    expect(screen.getByText('2026/11/03 15:30 的備份：單品 12 件、暫存區 2 件、穿搭 5 套')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /覆蓋/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /保留原本資料/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '匯入' }).props.accessibilityState.disabled).toBe(true);
  });

  it('覆蓋：點兩次才匯入，完成顯示結果', async () => {
    const o = ops();
    render(<BackupPanel ops={o} />);
    await press('選擇備份檔');
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: /覆蓋/ })));
    await press('匯入');
    expect(o.apply).not.toHaveBeenCalled();
    await press('再按一次確認覆蓋');
    expect(o.apply).toHaveBeenCalledWith(prepared, 'replace');
    expect(screen.getByText('匯入完成：單品 12 件、穿搭 5 套')).toBeTruthy();
  });

  it('換匯入方式時要重新確認', async () => {
    const o = ops();
    render(<BackupPanel ops={o} />);
    await press('選擇備份檔');
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: /覆蓋/ })));
    await press('匯入');
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: /保留原本資料/ })));
    await press('匯入');
    expect(o.apply).not.toHaveBeenCalled();
    await press('再按一次確認匯入');
    expect(o.apply).toHaveBeenCalledWith(prepared, 'merge');
  });

  it.each([
    ['notBackup', '這不是 TENKI OUTFIT 的備份檔'],
    ['newerVersion', '這個備份來自比較新版的 App，請先更新 App 再匯入'],
    ['corrupt', '備份檔內容損壞，無法匯入'],
  ] as const)('選到的檔案 %s → 顯示原因', async (reason, text) => {
    render(<BackupPanel ops={ops({ prepare: jest.fn().mockResolvedValue({ ok: false, reason }) })} />);
    await press('選擇備份檔');
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '匯入' })).toBeNull();
  });

  it('取消選檔時不做事', async () => {
    const o = ops({ pick: jest.fn().mockResolvedValue(null) });
    render(<BackupPanel ops={o} />);
    await press('選擇備份檔');
    expect(o.prepare).not.toHaveBeenCalled();
  });

  it('匯入失敗顯示「手機上的資料沒有變動」', async () => {
    render(<BackupPanel ops={ops({ apply: jest.fn().mockRejectedValue(new Error('db')) })} />);
    await press('選擇備份檔');
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: /保留原本資料/ })));
    await press('匯入');
    await press('再按一次確認匯入');
    expect(screen.getByText('匯入失敗，手機上的資料沒有變動')).toBeTruthy();
  });

  it('取消：丟掉選好的備份', async () => {
    render(<BackupPanel ops={ops()} />);
    await press('選擇備份檔');
    await press('取消');
    expect(screen.queryByText(/的備份：/)).toBeNull();
  });
});
