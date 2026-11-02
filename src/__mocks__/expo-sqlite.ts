const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  closeAsync: jest.fn().mockResolvedValue(undefined),
};

export const SQLiteProvider = ({ children }: { children: React.ReactNode }) => children;
export const useSQLiteContext = () => mockDb;
export const openDatabaseAsync = jest.fn().mockResolvedValue(mockDb);

export { mockDb as __mockDb };
