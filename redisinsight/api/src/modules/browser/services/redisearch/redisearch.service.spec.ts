import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { when } from 'jest-when';
import {
  mockDatabase,
  mockRedisConsumer,
  mockRedisNoPermError,
  mockRedisUnknownIndexName,
} from 'src/__mocks__';
import { IFindRedisClientInstanceByOptions } from 'src/modules/redis/redis.service';
import { BrowserToolService } from 'src/modules/browser/services/browser-tool/browser-tool.service';
import { RedisearchService } from 'src/modules/browser/services/redisearch/redisearch.service';
import IORedis from 'ioredis';
import {
  RedisearchIndexDataType,
  RedisearchIndexKeyType,
} from 'src/modules/browser/dto/redisearch';

const nodeClient = Object.create(IORedis.prototype);
nodeClient.sendCommand = jest.fn();

const clusterClient = Object.create(IORedis.Cluster.prototype);
clusterClient.sendCommand = jest.fn();
clusterClient.nodes = jest.fn();

const keyName1 = Buffer.from('keyName1');
const keyName2 = Buffer.from('keyName2');

const mockClientOptions: IFindRedisClientInstanceByOptions = {
  instanceId: mockDatabase.id,
};

const mockCreateRedisearchIndexDto = {
  index: 'indexName',
  type: RedisearchIndexKeyType.HASH,
  prefixes: ['device:', 'user:'],
  fields: [
    {
      name: 'text:field',
      type: RedisearchIndexDataType.TEXT,
    },
    {
      name: 'coordinates:field',
      type: RedisearchIndexDataType.GEO,
    },
  ],
};
const mockSearchRedisearchDto = {
  index: 'indexName',
  query: 'somequery:',
  limit: 10,
  offset: 0,
};

describe('RedisearchService', () => {
  let service: RedisearchService;
  let browserTool;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisearchService,
        {
          provide: BrowserToolService,
          useFactory: mockRedisConsumer,
        },
      ],
    }).compile();

    service = module.get<RedisearchService>(RedisearchService);
    browserTool = module.get<BrowserToolService>(BrowserToolService);
    browserTool.getRedisClient.mockResolvedValue(nodeClient);
    clusterClient.nodes.mockReturnValue([nodeClient, nodeClient]);
  });

  describe('list', () => {
    it('should get list of indexes for standalone', async () => {
      nodeClient.sendCommand.mockResolvedValue([
        keyName1.toString('hex'),
        keyName2.toString('hex'),
      ]);

      const list = await service.list(mockClientOptions);

      expect(list).toEqual({
        indexes: [
          keyName1,
          keyName2,
        ],
      });
    });
    it('should get list of indexes for cluster (handle unique index name)', async () => {
      browserTool.getRedisClient.mockResolvedValue(clusterClient);
      nodeClient.sendCommand.mockResolvedValue([
        keyName1.toString('hex'),
        keyName2.toString('hex'),
      ]);

      const list = await service.list(mockClientOptions);

      expect(list).toEqual({
        indexes: [
          keyName1,
          keyName2,
        ],
      });
    });
    it('should handle ACL error', async () => {
      nodeClient.sendCommand.mockRejectedValueOnce(mockRedisNoPermError);

      try {
        await service.list(mockClientOptions);
        fail();
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
      }
    });
  });

  describe('createIndex', () => {
    it('should create index for standalone', async () => {
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.INFO' }))
        .mockRejectedValue(mockRedisUnknownIndexName);
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.CREATE' }))
        .mockResolvedValue('OK');

      await service.createIndex(mockClientOptions, mockCreateRedisearchIndexDto);

      expect(nodeClient.sendCommand).toHaveBeenCalledTimes(2);
      expect(nodeClient.sendCommand).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'FT.CREATE',
        args: [
          mockCreateRedisearchIndexDto.index,
          'ON', mockCreateRedisearchIndexDto.type,
          'PREFIX', '2', ...mockCreateRedisearchIndexDto.prefixes,
          'SCHEMA', mockCreateRedisearchIndexDto.fields[0].name, mockCreateRedisearchIndexDto.fields[0].type,
          mockCreateRedisearchIndexDto.fields[1].name, mockCreateRedisearchIndexDto.fields[1].type,
        ],
      }));
    });
    it('should create index for cluster', async () => {
      browserTool.getRedisClient.mockResolvedValue(clusterClient);
      when(clusterClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.INFO' }))
        .mockRejectedValue(mockRedisUnknownIndexName);
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.CREATE' }))
        .mockResolvedValueOnce('OK').mockRejectedValue(new Error('ReplyError: MOVED to somenode'));

      await service.createIndex(mockClientOptions, mockCreateRedisearchIndexDto);

      expect(clusterClient.sendCommand).toHaveBeenCalledTimes(1);
      expect(nodeClient.sendCommand).toHaveBeenCalledTimes(2);
      expect(nodeClient.sendCommand).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'FT.CREATE',
        args: [
          mockCreateRedisearchIndexDto.index,
          'ON', mockCreateRedisearchIndexDto.type,
          'PREFIX', '2', ...mockCreateRedisearchIndexDto.prefixes,
          'SCHEMA', mockCreateRedisearchIndexDto.fields[0].name, mockCreateRedisearchIndexDto.fields[0].type,
          mockCreateRedisearchIndexDto.fields[1].name, mockCreateRedisearchIndexDto.fields[1].type,
        ],
      }));
    });
    it('should handle already existing index error', async () => {
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.INFO' }))
        .mockReturnValue({ any: 'data' });

      try {
        await service.createIndex(mockClientOptions, mockCreateRedisearchIndexDto);
        fail();
      } catch (e) {
        expect(e).toBeInstanceOf(ConflictException);
      }
    });
    it('should handle ACL error (ft.info command)', async () => {
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.INFO' }))
        .mockRejectedValue(mockRedisNoPermError);

      try {
        await service.createIndex(mockClientOptions, mockCreateRedisearchIndexDto);
        fail();
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
      }
    });
    it('should handle ACL error (ft.create command)', async () => {
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.INFO' }))
        .mockRejectedValue(mockRedisUnknownIndexName);
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.CREATE' }))
        .mockRejectedValue(mockRedisNoPermError);

      try {
        await service.createIndex(mockClientOptions, mockCreateRedisearchIndexDto);
        fail();
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
      }
    });
  });

  describe('search', () => {
    it('should search in standalone', async () => {
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.SEARCH' }))
        .mockResolvedValue([100, keyName1, keyName2]);

      const res = await service.search(mockClientOptions, mockSearchRedisearchDto);

      expect(res).toEqual({
        cursor: mockSearchRedisearchDto.limit + mockSearchRedisearchDto.offset,
        scanned: 2,
        total: 100,
        maxResults: null,
        keys: [{
          name: keyName1,
        }, {
          name: keyName2,
        }],
      });

      expect(nodeClient.sendCommand).toHaveBeenCalledTimes(2);
      expect(nodeClient.sendCommand).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'FT.SEARCH',
        args: [
          mockSearchRedisearchDto.index,
          mockSearchRedisearchDto.query,
          'NOCONTENT',
          'LIMIT', `${mockSearchRedisearchDto.offset}`, `${mockSearchRedisearchDto.limit}`,
        ],
      }));
      expect(nodeClient.sendCommand).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'FT.CONFIG',
        args: [
          'GET',
          'MAXSEARCHRESULTS',
        ],
      }));
    });
    it('should search in cluster', async () => {
      browserTool.getRedisClient.mockResolvedValue(clusterClient);
      when(clusterClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.SEARCH' }))
        .mockResolvedValue([100, keyName1, keyName2]);

      const res = await service.search(mockClientOptions, mockSearchRedisearchDto);

      expect(res).toEqual({
        cursor: mockSearchRedisearchDto.limit + mockSearchRedisearchDto.offset,
        scanned: 2,
        total: 100,
        maxResults: null,
        keys: [
          { name: keyName1 },
          { name: keyName2 },
        ],
      });

      expect(clusterClient.sendCommand).toHaveBeenCalledTimes(2);
      expect(clusterClient.sendCommand).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'FT.SEARCH',
        args: [
          mockSearchRedisearchDto.index,
          mockSearchRedisearchDto.query,
          'NOCONTENT',
          'LIMIT', `${mockSearchRedisearchDto.offset}`, `${mockSearchRedisearchDto.limit}`,
        ],
      }));
      expect(clusterClient.sendCommand).toHaveBeenCalledWith(jasmine.objectContaining({
        name: 'FT.CONFIG',
        args: [
          'GET',
          'MAXSEARCHRESULTS',
        ],
      }));
    });
    it('should handle ACL error (ft.info command)', async () => {
      when(nodeClient.sendCommand)
        .calledWith(jasmine.objectContaining({ name: 'FT.SEARCH' }))
        .mockRejectedValue(mockRedisNoPermError);

      try {
        await service.search(mockClientOptions, mockSearchRedisearchDto);
        fail();
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
      }
    });
  });
});
