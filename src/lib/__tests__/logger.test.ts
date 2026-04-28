/**
 * @jest-environment node
 */

import { logger } from '../logger';

describe('logger', () => {
  let logSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('development 環境 (NODE_ENV = "test" → isDev() === true)', () => {
    // Jest のデフォルト NODE_ENV は 'test' であり、
    // isDev() は process.env.NODE_ENV !== 'production' で判定するため true になる

    it('logger.log で console.log が呼ばれる', () => {
      logger.log('msg');
      expect(logSpy).toHaveBeenCalledWith('msg');
    });

    it('logger.info で console.info が呼ばれる', () => {
      logger.info('msg');
      expect(infoSpy).toHaveBeenCalledWith('msg');
    });

    it('logger.debug で console.debug が呼ばれる', () => {
      logger.debug('msg');
      expect(debugSpy).toHaveBeenCalledWith('msg');
    });

    it('logger.warn で console.warn が呼ばれる', () => {
      logger.warn('msg');
      expect(warnSpy).toHaveBeenCalledWith('msg');
    });

    it('logger.error で console.error が呼ばれる', () => {
      logger.error('msg');
      expect(errorSpy).toHaveBeenCalledWith('msg');
    });

    it('引数が複数の場合に正しく渡される (logger.log)', () => {
      logger.log('a', 'b', 1);
      expect(logSpy).toHaveBeenCalledWith('a', 'b', 1);
    });
  });

  describe('production 環境 (NODE_ENV = "production" → isDev() === false)', () => {
    beforeEach(() => {
      jest.replaceProperty(process.env, 'NODE_ENV', 'production');
    });

    it('logger.log で console.log が呼ばれない', () => {
      logger.log('msg');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('logger.info で console.info が呼ばれない', () => {
      logger.info('msg');
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('logger.debug で console.debug が呼ばれない', () => {
      logger.debug('msg');
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('logger.warn で console.warn が呼ばれる (常時出力)', () => {
      logger.warn('msg');
      expect(warnSpy).toHaveBeenCalledWith('msg');
    });

    it('logger.error で console.error が呼ばれる (常時出力)', () => {
      logger.error('msg');
      expect(errorSpy).toHaveBeenCalledWith('msg');
    });
  });
});
