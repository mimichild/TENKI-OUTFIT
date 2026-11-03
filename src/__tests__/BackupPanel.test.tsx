import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackupPanel, type BackupOps } from '@/components/BackupPanel';
import type { BackupManifest } from '@/lib/backupFormat';
import { BackupBusyError, type PreparedImport } from '@/lib/backupService';
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
    saveToFolder: jest.fn().mockResolvedValue('tenki-outfit-backup-20261103-1530.zip'),
    pick: jest.fn().mockResolvedValue('file:///cache/picked.zip'),
    prepare: jest.fn().mockResolvedValue(prepared),
    apply: jest.fn().mockResolvedValue({ items: 12, trash: 2, outfits: 5 }),
    discard: jest.fn(),
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
    render(<BackupPanel ops={ops({ saveToFolder: jest.fn().mockResolvedValue(null) })} />);
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
    expect(screen.getByText('匯入完成：單品 12 件、暫存區 2 件、穿搭 5 套')).toBeTruthy();
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

  it('取消：丟掉選好的備份並刪掉暫存檔', async () => {
    const o = ops();
    render(<BackupPanel ops={o} />);
    await press('選擇備份檔');
    await press('取消');
    expect(screen.queryByText(/的備份：/)).toBeNull();
    expect(o.discard).toHaveBeenCalledWith(prepared);
  });

  it('存到資料夾時系統改了檔名，顯示實際檔名', async () => {
    render(<BackupPanel ops={ops({ saveToFolder: jest.fn().mockResolvedValue('tenki-outfit-backup-20261103-1530 (1).zip') })} />);
    await press('存到資料夾');
    expect(screen.getByText('已存成 tenki-outfit-backup-20261103-1530 (1).zip')).toBeTruthy();
  });

  it('空間不足顯示需要的大小', async () => {
    render(<BackupPanel ops={ops({ prepare: jest.fn().mockResolvedValue({ ok: false, reason: 'noSpace', neededMb: 320 }) })} />);
    await press('選擇備份檔');
    expect(screen.getByText('手機空間不足，匯入需要約 320 MB')).toBeTruthy();
  });

  it('讀取丟例外顯示「無法讀取」；另一個作業進行中顯示請稍候', async () => {
    render(<BackupPanel ops={ops({ prepare: jest.fn().mockRejectedValue(new Error('x')) })} />);
    await press('選擇備份檔');
    expect(screen.getByText('無法讀取這個檔案')).toBeTruthy();
    screen.unmount();
    render(<BackupPanel ops={ops({ prepare: jest.fn().mockRejectedValue(new BackupBusyError()) })} />);
    await press('選擇備份檔');
    expect(screen.getByText('另一個備份作業還在進行，請稍候再試')).toBeTruthy();
  });

  it('取消選檔時保留原本選好的備份與匯入方式', async () => {
    const pick = jest.fn().mockResolvedValueOnce('file:///cache/picked.zip').mockResolvedValueOnce(null);
    render(<BackupPanel ops={ops({ pick })} />);
    await press('選擇備份檔');
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: /覆蓋/ })));
    await press('選擇備份檔');
    expect(screen.getByRole('radio', { name: /覆蓋/ }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText(/的備份：/)).toBeTruthy();
  });

  it('重新選另一個備份時刪掉上一個的暫存檔', async () => {
    const o = ops();
    render(<BackupPanel ops={o} />);
    await press('選擇備份檔');
    await press('選擇備份檔');
    expect(o.discard).toHaveBeenCalledTimes(1);
  });

  it('匯出進行中：匯入方式、匯入、取消都停用，並通知頁面擋住返回', async () => {
    let finish: (v: { uri: string; fileName: string }) => void = () => {};
    const createExport = jest.fn(() => new Promise<{ uri: string; fileName: string }>(r => { finish = r; }));
    const onBusyChange = jest.fn();
    render(<BackupPanel ops={ops({ createExport })} onBusyChange={onBusyChange} />);
    await press('選擇備份檔');
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: /覆蓋/ })));
    await press('分享備份檔');
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: '匯入' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '取消' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('radio', { name: /保留原本資料/ }).props.accessibilityState.disabled).toBe(true);
    await act(async () => finish({ uri: 'u', fileName: 'f' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('備份時間無法辨識時摘要不顯示日期', async () => {
    const bad = { ...prepared, manifest: { exportedAt: '' } as BackupManifest };
    render(<BackupPanel ops={ops({ prepare: jest.fn().mockResolvedValue(bad) })} />);
    await press('選擇備份檔');
    expect(screen.getByText('備份內容：單品 12 件、暫存區 2 件、穿搭 5 套')).toBeTruthy();
  });
});
