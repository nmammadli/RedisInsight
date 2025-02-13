import { Test, TestingModule } from '@nestjs/testing';
import { when } from 'jest-when';
import {
  mockRedisConsumer,
  mockRedisNoPermError,
  mockDatabase,
} from 'src/__mocks__';
import {
  BrowserToolHashCommands,
  BrowserToolKeysCommands,
} from 'src/modules/browser/constants/browser-tool-commands';
import { ReplyError } from 'src/models';
import { GetKeyInfoResponse, RedisDataType } from 'src/modules/browser/dto';
import { BrowserToolService } from 'src/modules/browser/services/browser-tool/browser-tool.service';
import { IFindRedisClientInstanceByOptions } from 'src/modules/redis/redis.service';
import { HashTypeInfoStrategy } from './hash-type-info.strategy';

const mockClientOptions: IFindRedisClientInstanceByOptions = {
  instanceId: mockDatabase.id,
};

const getKeyInfoResponse: GetKeyInfoResponse = {
  name: 'testHash',
  type: 'hash',
  ttl: -1,
  size: 50,
  length: 10,
};

describe('HashTypeInfoStrategy', () => {
  let strategy: HashTypeInfoStrategy;
  let browserTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: BrowserToolService,
          useFactory: mockRedisConsumer,
        },
      ],
    }).compile();

    browserTool = module.get<BrowserToolService>(BrowserToolService);
    strategy = new HashTypeInfoStrategy(browserTool);
  });

  describe('getInfo', () => {
    const key = getKeyInfoResponse.name;
    it('should return appropriate value', async () => {
      when(browserTool.execPipeline)
        .calledWith(mockClientOptions, [
          [BrowserToolKeysCommands.Ttl, key],
          [BrowserToolKeysCommands.MemoryUsage, key, 'samples', '0'],
          [BrowserToolHashCommands.HLen, key],
        ])
        .mockResolvedValue([
          null,
          [
            [null, -1],
            [null, 50],
            [null, 10],
          ],
        ]);

      const result = await strategy.getInfo(
        mockClientOptions,
        key,
        RedisDataType.Hash,
      );

      expect(result).toEqual(getKeyInfoResponse);
    });
    it('should throw error', async () => {
      const replyError: ReplyError = {
        ...mockRedisNoPermError,
        command: BrowserToolKeysCommands.Ttl,
      };
      when(browserTool.execPipeline)
        .calledWith(mockClientOptions, [
          [BrowserToolKeysCommands.Ttl, key],
          [BrowserToolKeysCommands.MemoryUsage, key, 'samples', '0'],
          [BrowserToolHashCommands.HLen, key],
        ])
        .mockResolvedValue([replyError, []]);

      try {
        await strategy.getInfo(mockClientOptions, key, RedisDataType.Hash);
        fail('Should throw an error');
      } catch (err) {
        expect(err.message).toEqual(replyError.message);
      }
    });
    it('should return size with null value', async () => {
      const replyError: ReplyError = {
        name: 'ReplyError',
        command: BrowserToolKeysCommands.MemoryUsage,
        message: "ERR unknown command 'memory'",
      };
      when(browserTool.execPipeline)
        .calledWith(mockClientOptions, [
          [BrowserToolKeysCommands.Ttl, key],
          [BrowserToolKeysCommands.MemoryUsage, key, 'samples', '0'],
          [BrowserToolHashCommands.HLen, key],
        ])
        .mockResolvedValue([
          null,
          [
            [null, -1],
            [replyError, null],
            [null, 10],
          ],
        ]);

      const result = await strategy.getInfo(
        mockClientOptions,
        key,
        RedisDataType.Hash,
      );

      expect(result).toEqual({ ...getKeyInfoResponse, size: null });
    });
  });
});
