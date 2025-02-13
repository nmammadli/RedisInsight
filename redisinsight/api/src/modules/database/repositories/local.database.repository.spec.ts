import { when } from 'jest-when';
import { pick, omit } from 'lodash';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  mockCaCertificateRepository,
  mockClientCertificateRepository, mockClusterDatabaseWithTlsAuth, mockClusterDatabaseWithTlsAuthEntity,
  mockDatabase,
  mockDatabaseEntity,
  mockDatabaseId,
  mockDatabasePasswordEncrypted,
  mockDatabasePasswordPlain,
  mockDatabaseSentinelMasterPasswordEncrypted,
  mockDatabaseSentinelMasterPasswordPlain,
  mockDatabaseWithTls, mockDatabaseWithTlsAuth,
  mockDatabaseWithTlsAuthEntity,
  mockDatabaseWithTlsEntity,
  mockEncryptionService,
  mockRepository, mockSentinelDatabaseWithTlsAuth, mockSentinelDatabaseWithTlsAuthEntity,
  MockType,
} from 'src/__mocks__';
import { EncryptionService } from 'src/modules/encryption/encryption.service';
import { LocalDatabaseRepository } from 'src/modules/database/repositories/local.database.repository';
import { DatabaseEntity } from 'src/modules/database/entities/database.entity';
import { CaCertificateRepository } from 'src/modules/certificate/repositories/ca-certificate.repository';
import { ClientCertificateRepository } from 'src/modules/certificate/repositories/client-certificate.repository';
import { cloneClassInstance } from 'src/utils';

const listFields = [
  'id', 'name', 'host', 'port', 'db',
  'connectionType', 'modules', 'lastConnection',
];

describe('LocalDatabaseRepository', () => {
  let service: LocalDatabaseRepository;
  let encryptionService: MockType<EncryptionService>;
  let repository: MockType<Repository<DatabaseEntity>>;
  let caCertRepository: MockType<CaCertificateRepository>;
  let clientCertRepository: MockType<ClientCertificateRepository>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalDatabaseRepository,
        {
          provide: getRepositoryToken(DatabaseEntity),
          useFactory: mockRepository,
        },
        {
          provide: EncryptionService,
          useFactory: mockEncryptionService,
        },
        {
          provide: CaCertificateRepository,
          useFactory: mockCaCertificateRepository,
        },
        {
          provide: ClientCertificateRepository,
          useFactory: mockClientCertificateRepository,
        },
      ],
    }).compile();

    repository = await module.get(getRepositoryToken(DatabaseEntity));
    caCertRepository = await module.get(CaCertificateRepository);
    clientCertRepository = await module.get(ClientCertificateRepository);
    encryptionService = await module.get(EncryptionService);
    service = await module.get(LocalDatabaseRepository);

    repository.findOneBy.mockResolvedValue(mockDatabaseEntity);
    repository.createQueryBuilder().getOne.mockResolvedValue(mockDatabaseEntity);
    repository.createQueryBuilder().getMany.mockResolvedValue([
      pick(mockDatabaseWithTlsAuthEntity, ...listFields),
      pick(mockDatabaseWithTlsAuthEntity, ...listFields),
    ]);
    repository.save.mockResolvedValue(mockDatabaseEntity);
    repository.update.mockResolvedValue(mockDatabaseEntity);

    when(encryptionService.decrypt)
      .calledWith(mockDatabasePasswordEncrypted, jasmine.anything())
      .mockResolvedValue(mockDatabasePasswordPlain)
      .calledWith(mockDatabaseSentinelMasterPasswordEncrypted, jasmine.anything())
      .mockResolvedValue(mockDatabaseSentinelMasterPasswordPlain);
    when(encryptionService.encrypt)
      .calledWith(mockDatabasePasswordPlain)
      .mockResolvedValue({
        data: mockDatabasePasswordEncrypted,
        encryption: mockDatabaseWithTlsAuthEntity.encryption,
      })
      .calledWith(mockDatabaseSentinelMasterPasswordPlain)
      .mockResolvedValue({
        data: mockDatabaseSentinelMasterPasswordEncrypted,
        encryption: mockDatabaseWithTlsAuthEntity.encryption,
      });
  });

  describe('exists', () => {
    it('should return true when receive database entity', async () => {
      expect(await service.exists(mockDatabaseId)).toEqual(true);
    });

    it('should return false when no database received', async () => {
      repository.createQueryBuilder().getOne.mockResolvedValue(null);
      expect(await service.exists(mockDatabaseId)).toEqual(false);
    });
  });

  describe('get', () => {
    it('should return standalone database model', async () => {
      const result = await service.get(mockDatabaseId);

      expect(result).toEqual(mockDatabase);
      expect(caCertRepository.get).not.toHaveBeenCalled();
      expect(clientCertRepository.get).not.toHaveBeenCalled();
    });

    it('should return standalone model with ca tls', async () => {
      repository.findOneBy.mockResolvedValue(mockDatabaseWithTlsEntity);

      const result = await service.get(mockDatabaseId);

      expect(result).toEqual(mockDatabaseWithTls);
      expect(caCertRepository.get).toHaveBeenCalled();
      expect(clientCertRepository.get).not.toHaveBeenCalled();
    });

    it('should return sentinel tls database model (with fields decryption)', async () => {
      repository.findOneBy.mockResolvedValue(mockSentinelDatabaseWithTlsAuthEntity);

      const result = await service.get(mockDatabaseId);

      expect(result).toEqual(mockSentinelDatabaseWithTlsAuth);
      expect(caCertRepository.get).toHaveBeenCalled();
      expect(clientCertRepository.get).toHaveBeenCalled();
    });

    it('should return cluster database model (with fields decryption)', async () => {
      repository.findOneBy.mockResolvedValue(mockClusterDatabaseWithTlsAuthEntity);

      const result = await service.get(mockDatabaseId);

      expect(result).toEqual(mockClusterDatabaseWithTlsAuth);
      expect(caCertRepository.get).toHaveBeenCalled();
      expect(clientCertRepository.get).toHaveBeenCalled();
    });

    it('should return null when database was not found', async () => {
      repository.findOneBy.mockResolvedValue(undefined);

      const result = await service.get(mockDatabaseId);

      expect(result).toEqual(null);
      expect(caCertRepository.get).not.toHaveBeenCalled();
      expect(clientCertRepository.get).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should return list of databases with specific fields only', async () => {
      expect(await service.list()).toEqual([
        pick(mockDatabaseWithTlsAuth, ...listFields),
        pick(mockDatabaseWithTlsAuth, ...listFields),
      ]);
    });
  });

  describe('create', () => {
    it('should create standalone database', async () => {
      const result = await service.create(mockDatabase);

      expect(result).toEqual(mockDatabase);
      expect(caCertRepository.create).not.toHaveBeenCalled();
      expect(clientCertRepository.create).not.toHaveBeenCalled();
    });

    it('should create standalone database (with existing certificates)', async () => {
      repository.save.mockResolvedValueOnce(mockDatabaseWithTlsAuthEntity);

      const result = await service.create(mockDatabaseWithTlsAuth);

      expect(result).toEqual(mockDatabaseWithTlsAuth);
      expect(caCertRepository.create).not.toHaveBeenCalled();
      expect(clientCertRepository.create).not.toHaveBeenCalled();
    });

    it('should create standalone database (and certificates)', async () => {
      repository.save.mockResolvedValueOnce(mockDatabaseWithTlsAuthEntity);

      const result = await service.create(
        omit(cloneClassInstance(mockDatabaseWithTlsAuth), 'caCert.id', 'clientCert.id'),
      );

      expect(result).toEqual(mockDatabaseWithTlsAuth);
      expect(caCertRepository.create).toHaveBeenCalled();
      expect(clientCertRepository.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update standalone database', async () => {
      const result = await service.update(mockDatabaseId, mockDatabase);

      expect(result).toEqual(mockDatabase);
      expect(caCertRepository.create).not.toHaveBeenCalled();
      expect(clientCertRepository.create).not.toHaveBeenCalled();
    });

    it('should update standalone database (with existing certificates)', async () => {
      repository.findOneBy.mockResolvedValueOnce(mockDatabaseWithTlsAuthEntity);

      const result = await service.update(mockDatabaseId, mockDatabaseWithTlsAuth);

      expect(result).toEqual(mockDatabaseWithTlsAuth);
      expect(caCertRepository.create).not.toHaveBeenCalled();
      expect(clientCertRepository.create).not.toHaveBeenCalled();
    });

    it('should update standalone database (and certificates)', async () => {
      repository.findOneBy.mockResolvedValueOnce(mockDatabaseWithTlsAuthEntity);

      const result = await service.update(
        mockDatabaseId,
        omit(mockDatabaseWithTlsAuth, 'caCert.id', 'clientCert.id'),
      );

      expect(result).toEqual(mockDatabaseWithTlsAuth);
      expect(caCertRepository.create).toHaveBeenCalled();
      expect(clientCertRepository.create).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete database by id', async () => {
      expect(await service.delete(mockDatabaseId)).toEqual(undefined);
    });
  });
});
