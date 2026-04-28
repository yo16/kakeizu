/**
 * @jest-environment node
 */

import { createClient } from '@supabase/supabase-js';
import { runKeepalive } from '../keepalive';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('runKeepalive()', () => {
  const VALID_URL = 'https://example.supabase.co';
  const VALID_KEY = 'service-role-key-secret';

  let mockInsert: jest.Mock;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });

    mockCreateClient.mockReturnValue({
      from: mockFrom,
    } as unknown as ReturnType<typeof createClient>);
  });

  describe('正常系', () => {
    it('INSERT 成功時に何も throw しないこと', async () => {
      await expect(
        runKeepalive({ SUPABASE_URL: VALID_URL, SUPABASE_SERVICE_ROLE_KEY: VALID_KEY }),
      ).resolves.toBeUndefined();
    });

    it('createClient が url と key と auth オプションで呼ばれること', async () => {
      await runKeepalive({ SUPABASE_URL: VALID_URL, SUPABASE_SERVICE_ROLE_KEY: VALID_KEY });

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockCreateClient).toHaveBeenCalledWith(VALID_URL, VALID_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    });

    it('supabase.from("keepalive_ping").insert({ source: "github-actions" }) が呼ばれること', async () => {
      await runKeepalive({ SUPABASE_URL: VALID_URL, SUPABASE_SERVICE_ROLE_KEY: VALID_KEY });

      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith('keepalive_ping');
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledWith({ source: 'github-actions' });
    });
  });

  describe('異常系: INSERT エラー', () => {
    it('INSERT でエラーが返った場合に Error を throw すること', async () => {
      mockInsert.mockResolvedValue({ error: { message: 'connection refused' } });

      await expect(
        runKeepalive({ SUPABASE_URL: VALID_URL, SUPABASE_SERVICE_ROLE_KEY: VALID_KEY }),
      ).rejects.toThrow('INSERT エラー: connection refused');
    });
  });

  describe('異常系: 環境変数不足', () => {
    it('SUPABASE_URL が空の場合に Error を throw すること', async () => {
      await expect(
        runKeepalive({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: VALID_KEY }),
      ).rejects.toThrow('SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です');
    });

    it('SUPABASE_SERVICE_ROLE_KEY が空の場合に Error を throw すること', async () => {
      await expect(
        runKeepalive({ SUPABASE_URL: VALID_URL, SUPABASE_SERVICE_ROLE_KEY: '' }),
      ).rejects.toThrow('SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です');
    });

    it('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が両方未設定の場合に Error を throw すること', async () => {
      await expect(
        runKeepalive({}),
      ).rejects.toThrow('SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です');
    });

    it('環境変数不足の場合は createClient が呼ばれないこと', async () => {
      await expect(runKeepalive({})).rejects.toThrow();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });
});
